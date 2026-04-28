// Background service worker for managing patterns
const PROFILES_URL =
  'https://raw.githubusercontent.com/boardgamematcher/site-profiles/main/profiles.json';
const PROFILES_CACHE_KEY = 'cachedProfiles';
const PROFILES_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const BGM_BASE_URL = 'https://boardgamematcher.com';

// Verbose service-worker logs are off in shipped builds. Flip to `true`
// locally when debugging pattern loading or cache behaviour. Errors and
// warnings are always emitted regardless of this flag.
const DEBUG = false;
const debug = DEBUG ? console.log.bind(console) : () => {};

let cachedPatterns = [];
let reloadingPromise = null;
let patternsReady = false;

// Load patterns eagerly on service worker start
reloadPatterns();

// Clear profile cache on install/update so new profiles take effect
chrome.runtime.onInstalled.addListener(async () => {
  debug('BGM Toolbox installed/updated — clearing profile cache');
  await chrome.storage.local.remove(PROFILES_CACHE_KEY);
  await reloadPatterns();

  // Create context menus
  chrome.contextMenus.create({
    id: 'bgm-extract-page',
    title: 'Extract Board Games from this page',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'bgm-extract-selection',
    title: 'Extract Board Games from "%s"',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'bgm-extract-link',
    title: 'Extract Board Games from this link',
    contexts: ['link'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  let extractUrl;

  if (info.menuItemId === 'bgm-extract-selection' && info.selectionText) {
    extractUrl = BGM_BASE_URL + '/extract?url=' + encodeURIComponent(info.selectionText.trim());
  } else if (info.menuItemId === 'bgm-extract-link' && info.linkUrl) {
    extractUrl = BGM_BASE_URL + '/extract?url=' + encodeURIComponent(info.linkUrl);
  } else if (info.menuItemId === 'bgm-extract-page') {
    const pageUrl = info.pageUrl || tab?.url;
    if (pageUrl) {
      extractUrl = BGM_BASE_URL + '/extract?url=' + encodeURIComponent(pageUrl);
    }
  }

  if (extractUrl) {
    chrome.tabs.create({ url: extractUrl });
  }
});

// Fetch shared profiles from GitHub, with local cache and bundled fallback
async function fetchSharedProfiles() {
  // Check local cache first
  try {
    const cached = await chrome.storage.local.get(PROFILES_CACHE_KEY);
    const entry = cached[PROFILES_CACHE_KEY];
    if (entry && Date.now() - entry.timestamp < PROFILES_CACHE_TTL) {
      debug('Using cached profiles (%d profiles)', entry.profiles.length);
      return entry.profiles;
    }
  } catch (_e) {
    // Cache read failed, continue to fetch
  }

  // Fetch from GitHub
  try {
    const response = await fetch(PROFILES_URL);
    if (response.ok) {
      const data = await response.json();
      const profiles = data.profiles || [];
      await chrome.storage.local.set({
        [PROFILES_CACHE_KEY]: { profiles, timestamp: Date.now() },
      });
      debug('Fetched %d profiles from GitHub', profiles.length);
      return profiles;
    }
  } catch (_e) {
    console.warn('Failed to fetch profiles from GitHub, using fallback');
  }

  // Fall back to bundled file
  try {
    const response = await fetch(chrome.runtime.getURL('patterns/built-in.json'));
    const data = await response.json();
    return data.profiles || [];
  } catch (_e) {
    return [];
  }
}

// Load patterns from shared profiles + custom patterns
function reloadPatterns() {
  if (reloadingPromise) return reloadingPromise;
  reloadingPromise = (async () => {
    try {
      const sharedProfiles = await fetchSharedProfiles();

      const result = await chrome.storage.local.get('customPatterns');
      const custom = result.customPatterns || [];

      // Merge: shared profiles first, custom overrides by domain+name
      const patternMap = new Map();
      sharedProfiles.forEach((p) => patternMap.set(p.domain + ':' + p.name, p));
      custom.forEach((p) => patternMap.set(p.domain + ':' + (p.name || 'custom'), p));

      cachedPatterns = Array.from(patternMap.values());
      patternsReady = true;
      debug('Loaded patterns:', cachedPatterns.length);
    } catch (error) {
      console.error('Error loading patterns:', error);
      cachedPatterns = [];
      patternsReady = false;
    } finally {
      reloadingPromise = null;
    }
  })();
  return reloadingPromise;
}

// Find pattern for domain (simple) or full URL (precise via url_pattern)
function findPatternForDomain(domain, url) {
  // Try URL pattern match first (more specific, first match wins)
  if (url) {
    for (const p of cachedPatterns) {
      if (p.url_pattern) {
        try {
          if (new RegExp(p.url_pattern).test(url)) {
            return p;
          }
        } catch (_e) {
          // Invalid regex, skip
        }
      }
    }
  }
  // Fall back to domain match
  return cachedPatterns.find((p) => domain === p.domain || domain.endsWith('.' + p.domain)) || null;
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkSiteSupport') {
    const respond = () => {
      const pattern = findPatternForDomain(message.domain, message.url);
      sendResponse({ supported: pattern !== null, pattern });
    };
    if (!patternsReady) {
      reloadPatterns().then(respond);
      return true;
    }
    respond();
    return false;
  }

  if (message.action === 'updateStats') {
    updateStats(message.stats);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'reloadPatterns') {
    reloadPatterns().then(() => {
      sendResponse({ success: true, count: cachedPatterns.length });
    });
    return true;
  }

  if (message.action === 'postPlays') {
    postPlays(message.plays, { platformSlug: message.platformSlug })
      .then((results) => sendResponse({ success: true, results }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'getStats') {
    getStats().then((stats) => {
      sendResponse({ success: true, stats });
    });
    return true;
  }

  if (message.action === 'syncBggCollection') {
    syncBggCollection(message.bggUsername)
      .then((results) => sendResponse({ success: true, results }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Update extraction stats
async function updateStats(stats) {
  try {
    await chrome.storage.local.set({ stats });
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

// POST plays to BGM API in chunks to avoid server timeouts.
// platformSlug tags the batch with its source (e.g. "yucata", "board-game-arena").
async function postPlays(plays, { platformSlug } = {}) {
  const storage = await chrome.storage.local.get('apiUrl');
  const apiUrl = storage.apiUrl || BGM_BASE_URL;
  const CHUNK_SIZE = 200;

  // Build the per-play payload. The game identifier coming from the mapping
  // files is either a BGG integer id (most games) or a BGM-native boardgame
  // UUID string (for BGA/Yucata-exclusive games that have no BGG entry — see
  // BGM-812). The batch endpoint accepts either `bgg_id` or `boardgame_id`.
  //
  // Omit outcome when the scraper couldn't determine it — the server records
  // NULL rather than a bogus 'loss'. See BGM-812 / BGM-810.
  const allPlays = plays.map((play) => {
    const payload = {
      gameName: play.gameName,
      played_at: play.played_at,
      player_count: play.player_count,
    };
    if (typeof play.boardgame_id === 'number') {
      payload.bgg_id = play.boardgame_id;
    } else {
      payload.boardgame_id = play.boardgame_id;
    }
    if (play.outcome === 'win' || play.outcome === 'loss' || play.outcome === 'draw') {
      payload.outcome = play.outcome;
    }
    return payload;
  });

  const allPosted = [];
  const allSkipped = [];

  for (let i = 0; i < allPlays.length; i += CHUNK_SIZE) {
    const chunk = allPlays.slice(i, i + CHUNK_SIZE);

    // Broadcast progress
    chrome.runtime
      .sendMessage({
        action: 'playsImportProgress',
        current: Math.min(i + CHUNK_SIZE, allPlays.length),
        total: allPlays.length,
      })
      .catch(() => {});

    const body = { plays: chunk };
    if (platformSlug) body.digital_platform_slug = platformSlug;

    const response = await fetch(`${apiUrl}/api/plays/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-BGM-Source': 'toolbox' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API error ${response.status}: ${body}`);
    }

    const result = await response.json();
    allPosted.push(...(result.play_sessions || []));
    allSkipped.push(...(result.skipped_games || []));
  }

  if (allSkipped.length > 0) {
    console.warn('Yucata import: games not found on BGM:', allSkipped.join(', '));
  }

  return {
    posted: allPosted,
    skipped: allSkipped,
    duplicates: allSkipped.length,
  };
}

// Get extraction stats
async function getStats() {
  try {
    const result = await chrome.storage.local.get('stats');
    return result.stats || { lastExtraction: null };
  } catch (error) {
    console.error('Error getting stats:', error);
    return { lastExtraction: null };
  }
}

// Import a BGG collection into BGM
async function syncBggCollection(bggUsername) {
  const response = await fetch(`${BGM_BASE_URL}/api/bgg/import-collection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ bgg_username: bggUsername }),
  });

  if (!response.ok) {
    let errMsg = `API error ${response.status}`;
    try {
      const data = await response.json();
      if (data && data.error) errMsg = data.error;
    } catch (_e) {
      // ignore parse error
    }
    throw new Error(errMsg);
  }

  return response.json();
}
