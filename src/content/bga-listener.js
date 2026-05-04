/* eslint-disable no-undef */
/**
 * BGA Import Listener
 * Listens for import requests from the popup and executes the pipeline:
 * 1. Scrape play history from BGA via AJAX API
 * 2. Send plays to the service worker for game name resolution and posting
 */

/**
 * Resolve the current player's BGA ID from whatever logged-in page they're
 * looking at. The import only needs the ID + auth (both available
 * everywhere on BGA), so the user never needs to be on a stats page.
 *
 * Resolution order (cheapest, most-specific first):
 *   1. `?player=` URL param — only set on /gamestats; unambiguous.
 *   2. `?id=` URL param — only set on /player profiles; unambiguous.
 *   3. `<body data-current-user-id="…">` — on every BGA page once logged in.
 *   4. Inline `bgaConfig` / `globaluserinfos` script blocks — fallback if
 *      the body attribute hasn't rendered yet (e.g. transient pages).
 *   5. `TournoiEnLigne_sso_user` cookie — works on every logged-in page.
 *   6. `<meta name="player_id">` — historical fallback.
 *
 * @returns {string|null}
 */
function extractPlayerId() {
  // 1 + 2: URL params
  const url = new URL(window.location.href);
  const playerParam = url.searchParams.get('player');
  if (playerParam) return playerParam;
  const idParam = url.searchParams.get('id');
  if (idParam) return idParam;

  // 3: body[data-current-user-id]
  if (document.body) {
    const bodyId = document.body.getAttribute('data-current-user-id');
    if (bodyId && bodyId !== '0') return bodyId;
  }

  // 4: inline scripts (bgaConfig.id / globaluserinfos.id)
  const scripts = document.querySelectorAll('script:not([src])');
  for (const script of scripts) {
    const text = script.textContent || '';
    if (!text.includes('bgaConfig') && !text.includes('globaluserinfos')) continue;
    const m = text.match(
      /(?:bgaConfig|globaluserinfos)[\s\S]{0,500}?["']?id["']?\s*:\s*["']?(\d+)/
    );
    if (m) return m[1];
  }

  // 5: cookie
  const cookieId = readPlayerIdFromCookie(document.cookie || '');
  if (cookieId) return cookieId;

  // 6: meta tag fallback
  const playerIdMeta = document.querySelector('meta[name="player_id"]');
  if (playerIdMeta) {
    const v = playerIdMeta.getAttribute('content');
    if (v) return v;
  }

  return null;
}

/**
 * Pull a numeric BGA player ID out of a cookie header string.
 * BGA's `TournoiEnLigne_sso_user` cookie value is sometimes a bare integer
 * and sometimes URL-encoded JSON like `%7B%22id%22%3A%2284147370%22%7D`;
 * be defensive about both shapes.
 * @param {string} cookieStr
 * @returns {string|null}
 */
function readPlayerIdFromCookie(cookieStr) {
  const m = cookieStr.match(/TournoiEnLigne_sso_user=([^;]+)/);
  if (!m) return null;
  const raw = m[1];
  // Bare integer?
  if (/^\d+$/.test(raw)) return raw;
  // URL-decoded JSON or query-string-ish?
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const idMatch = decoded.match(/"?id"?\s*[:=]\s*"?(\d+)/);
  return idMatch ? idMatch[1] : null;
}

/**
 * Main import pipeline
 */
async function importBGAPlays() {
  // Step 1: Get player ID
  const playerId = extractPlayerId();
  if (!playerId) {
    const err = new Error('Sign in to BoardGameArena and try again.');
    err.code = 'NOT_LOGGED_IN_BGA';
    throw err;
  }

  // Step 2: Load BGA→BGG mapping
  const mappingResponse = await fetch(chrome.runtime.getURL('patterns/bga-mapping.json'));
  const mappingData = await mappingResponse.json();
  const mappings = mappingData.mappings;

  // Step 3: Scrape plays from BGA API
  const scraper = BGAScraper();
  const plays = await scraper.extractPlays(playerId);

  if (plays.length === 0) {
    throw new Error('No plays found. Make sure you are on the correct BGA profile page.');
  }

  // Step 4: Map BGA slugs to BGG IDs, filter unmapped
  const mappedPlays = [];
  const unmappedNames = new Set();

  for (const play of plays) {
    const bggId = mappings[play.bgaSlug] || mappings[play.gameName];
    if (!bggId) {
      unmappedNames.add(`${play.gameName} (${play.bgaSlug})`);
      continue;
    }
    mappedPlays.push({
      gameName: play.gameName,
      boardgame_id: bggId,
      played_at: play.date,
      player_count: play.playerCount,
      outcome: play.outcome,
    });
  }

  if (unmappedNames.size > 0) {
    console.warn('BGA import: unmapped games:', [...unmappedNames].join(', '));
  }

  if (mappedPlays.length === 0) {
    throw new Error('No plays could be mapped. Check the mapping file.');
  }

  // Step 5: Send to service worker for batch posting (uses bgg_id like Yucata)
  const response = await chrome.runtime.sendMessage({
    action: 'postPlays',
    plays: mappedPlays,
    platformSlug: 'board-game-arena',
  });

  if (!response.success) {
    throw new Error(response.error);
  }

  const { posted, skipped } = response.results;

  return {
    scraped: plays.length,
    posted: posted.length,
    skipped: unmappedNames.size + skipped.length,
    errors: 0,
  };
}

// Listen for messages from the popup. Guarded so the module can be required
// in jest tests without triggering on a missing chrome global.
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'import_bga_plays') {
      importBGAPlays()
        .then((result) => {
          sendResponse({ success: true, data: result });
        })
        .catch((error) => {
          console.error('BGA import error:', error);
          sendResponse({
            success: false,
            error: error.message,
            code: error.code || null,
          });
        });

      // Keep the message channel open for async response
      return true;
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractPlayerId,
    readPlayerIdFromCookie,
    importBGAPlays,
  };
}
