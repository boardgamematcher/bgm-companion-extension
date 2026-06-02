/**
 * bga-tournament-scraper.js
 *
 * Runs on BGA group pages (/group?id=*). Collects the tournament IDs linked on
 * the page, skips the ones already synced (tracked in chrome.storage), fetches
 * each remaining tournament's detail from BGA's own JSON API, resolves the game
 * name + BGG id from a cached game-list lookup, and POSTs to the BGM API. The
 * BGM endpoint is idempotent on bga_tournament_id, so concurrent visitors only
 * fire the Discord webhook once.
 *
 * Why the API and not the DOM: the /group page only carries bare tournament
 * links (no game/seats/dates), and /tournament?id=X is a client-rendered SPA
 * shell whose HTML has none of the data. The data comes from BGA's own calls:
 *   GET /tournament/view/getTournament.html?id=<id>  → name, gameId, status,
 *       baseDate, maxPlayers, registeredPlayers (but NOT the game name)
 *   GET /gamelist?section=all                         → page embedding a JSON
 *       array of every game: { id, display_name_en, bgg_id }. We map the
 *       numeric gameId → name + BGG id from it (gameDetails.html only accepts
 *       the game *tag*, not the numeric id). Cached weekly — it's ~2 MB.
 * Both are public GETs (no auth/token) returning {status:1, data} / HTML.
 */

'use strict';

// Use the current page's origin so cross-subdomain CORS never kicks in:
// BGA redirects users between boardgamearena.com and en.boardgamearena.com
// based on account locale, and the en. host doesn't send CORS headers.
const BGA_ORIGIN = window.location.origin;
const STORAGE_KEY = 'bga_known_tournaments';
const GAME_MAP_KEY = 'bga_game_map';
const GAME_MAP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // refresh the game list weekly

// ── Page detection ────────────────────────────────────────────────────────

function getGroupId() {
  return new URLSearchParams(window.location.search).get('id');
}

function isGroupPage() {
  return (
    (window.location.hostname === 'boardgamearena.com' ||
      window.location.hostname === 'en.boardgamearena.com') &&
    window.location.pathname === '/group' &&
    getGroupId() !== null
  );
}

/**
 * Collect the distinct tournament IDs linked anywhere on the group page.
 * BGA renders these as `<a href="/tournament?id=12345&token=...">`.
 */
function scrapeTournamentIds() {
  const links = document.querySelectorAll('a[href*="/tournament?id="]');
  const ids = new Set();
  for (const link of links) {
    const m = (link.getAttribute('href') || '').match(/[?&]id=(\d+)/);
    if (m) ids.add(m[1]);
  }
  return Array.from(ids);
}

// ── BGA game-id → { name, bggId } map (cached) ──────────────────────────────

/**
 * Parse BGA's game-list page into a { [gameId]: { name, bggId } } map. The page
 * embeds each game as a JSON object carrying `id`, `display_name_en`, and
 * `bgg_id`; we pull those out with a tolerant regex rather than trying to
 * recover the whole array.
 */
function parseGameList(html) {
  const map = {};
  const re =
    /"id":(\d+),"name":"[^"]*","display_name_en":"([^"]*)"([\s\S]{0,1500}?)(?="id":\d+,"name"|$)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    const name = m[2];
    const bggMatch = m[3].match(/"bgg_id":(\d+)/);
    map[id] = { name, bggId: bggMatch ? Number(bggMatch[1]) : null };
  }
  return map;
}

/**
 * Return the cached game map, refreshing from /gamelist at most weekly. Falls
 * back to any stale cache (or {}) if the fetch fails.
 */
async function getGameMap() {
  const cached = (await chrome.storage.local.get(GAME_MAP_KEY))[GAME_MAP_KEY];
  if (cached && cached.map && Date.now() - cached.fetchedAt < GAME_MAP_TTL_MS) {
    return cached.map;
  }

  try {
    const res = await fetch(`${BGA_ORIGIN}/gamelist?section=all`, { credentials: 'include' });
    if (!res.ok) throw new Error(`gamelist → ${res.status}`);
    const map = parseGameList(await res.text());
    if (Object.keys(map).length > 0) {
      await chrome.storage.local.set({ [GAME_MAP_KEY]: { map, fetchedAt: Date.now() } });
      return map;
    }
  } catch (err) {
    console.warn('[BGM] could not load BGA game list', err);
  }
  return cached?.map || {};
}

// ── BGA tournament API ──────────────────────────────────────────────────────

// BGA's ajaxcall endpoints (anything served from /tournament/view/*.html and
// friends) reject requests with code 806 unless the caller echoes the value
// of the HttpOnly TournoiEnLigneidt cookie as an X-Request-Token header
// (double-submit-cookie CSRF). document.cookie can't see HttpOnly cookies,
// so the service worker reads it via chrome.cookies and sends it back.
async function getBgaRequestToken() {
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'getCookie',
      url: BGA_ORIGIN,
      name: 'TournoiEnLigneidt',
    });
    return res?.value || null;
  } catch (_) {
    return null;
  }
}

async function getTournamentDetail(tournamentId, requestToken) {
  const headers = { 'X-Requested-With': 'XMLHttpRequest' };
  if (requestToken) headers['X-Request-Token'] = requestToken;
  const res = await fetch(`${BGA_ORIGIN}/tournament/view/getTournament.html?id=${tournamentId}`, {
    credentials: 'include',
    headers,
  });
  if (!res.ok) throw new Error(`getTournament ${tournamentId} → ${res.status}`);
  const json = await res.json();
  if (json.status !== 1 || !json.data?.tournament) {
    throw new Error(`getTournament ${tournamentId} → status ${json.status}`);
  }
  return json.data.tournament;
}

/**
 * Map BGA's tournament status to BGM's allowed set:
 * 'open' | 'full' | 'ongoing' | 'finished'.
 */
function normalizeStatus(bgaStatus, filled, total) {
  const s = (bgaStatus || '').toLowerCase();
  if (/archive|ended|finished|closed/.test(s)) return 'finished';
  if (/running|playing|launch|progress/.test(s)) return 'ongoing';
  // register / ready → open, unless every seat is taken
  if (total > 0 && filled >= total) return 'full';
  return 'open';
}

/**
 * Fetch one tournament and shape it into the BGM ingest payload. Returns null
 * if the tournament can't be loaded.
 */
async function buildPayload(tournamentId, groupId, gameMap, requestToken) {
  let t;
  try {
    t = await getTournamentDetail(tournamentId, requestToken);
  } catch (err) {
    console.warn(`[BGM] could not load tournament ${tournamentId}`, err);
    return null;
  }

  const game = gameMap[String(t.gameId)] || null;
  const spotsTotal = t.maxPlayers ?? null;
  const spotsFilled = t.registeredPlayers ?? null;

  return {
    bga_tournament_id: String(t.id),
    bga_group_id: groupId,
    title: t.name || `Tournoi ${game?.name || t.id}`,
    game_name: game?.name || null,
    bgg_id: game?.bggId ?? null,
    bga_url: `${BGA_ORIGIN}/tournament?id=${t.id}`,
    status: normalizeStatus(t.status, spotsFilled, spotsTotal),
    spots_total: spotsTotal,
    spots_filled: spotsFilled,
    start_date: t.baseDate || null,
  };
}

// ── Storage ─────────────────────────────────────────────────────────────────

async function getKnownIds() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];
  return Array.isArray(raw) ? new Set(raw) : new Set();
}

async function saveKnownIds(ids) {
  await chrome.storage.local.set({ [STORAGE_KEY]: Array.from(ids) });
}

// ── BGM API ─────────────────────────────────────────────────────────────────

// The POST runs in the service worker, not here. A POST straight from this BGA
// content script is cross-origin (BGA → BGM): the BGM session cookie is then a
// cross-site cookie the browser won't attach, so the sync arrives unauthenticated
// (401) and fails silently. The service worker holds host_permissions for BGM, so
// its fetch is first-party and carries the session cookie — the same path the
// plays import (postPlays) already uses. See BGM-1233.
async function postTournament(tournament) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'syncTournament', tournament });
    if (!res || !res.success) {
      console.warn('[BGM] tournament sync failed', res && res.error);
      return false;
    }
    return res.inserted === true;
  } catch (err) {
    console.warn('[BGM] tournament sync error', err);
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

// Guard against the initial document_idle run and the MutationObserver fallback
// overlapping — without it both could fetch + POST the same tournaments.
let running = false;

async function runTournamentScraper() {
  if (running || !isGroupPage()) return;
  running = true;
  try {
    await scrapeAndSync();
  } finally {
    running = false;
  }
}

async function scrapeAndSync() {
  const groupId = getGroupId();
  const ids = scrapeTournamentIds();
  if (ids.length === 0) return;

  const knownIds = await getKnownIds();
  // Known tournaments are skipped: their spots/status won't refresh, but we
  // avoid N getTournament fetches + N POSTs on every single group-page visit.
  const newIds = ids.filter((id) => !knownIds.has(id));
  if (newIds.length === 0) return;

  const gameMap = await getGameMap();
  const requestToken = await getBgaRequestToken();
  const updatedIds = new Set(knownIds);

  for (const id of newIds) {
    const payload = await buildPayload(id, groupId, gameMap, requestToken);
    // Skip (and don't mark known) when the tournament couldn't be loaded or its
    // game name couldn't be resolved — game_name is NOT NULL on the BGM side,
    // and the upsert never refreshes it, so a blank would be permanent. Leaving
    // the id unknown lets a later visit retry once the game map is healthy.
    if (!payload || !payload.game_name) continue;

    const inserted = await postTournament(payload);
    if (inserted) console.info(`[BGM] new tournament synced: ${payload.title}`);
    updatedIds.add(id);
  }

  await saveKnownIds(updatedIds);
}

// Run after DOM is ready. BGA is an SPA, so also observe DOM mutations in case
// the tournament links are injected after initial load.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runTournamentScraper);
} else {
  runTournamentScraper();
}

// MutationObserver fallback: re-run once when tournament links first appear,
// capped to a single additional pass to avoid infinite loops.
let observerFired = false;
const observer = new MutationObserver(() => {
  if (observerFired) return;
  if (document.querySelector('a[href*="/tournament?id="]')) {
    observerFired = true;
    observer.disconnect();
    runTournamentScraper();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
