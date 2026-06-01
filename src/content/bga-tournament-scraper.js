/**
 * bga-tournament-scraper.js
 *
 * Runs on BGA group pages (/group?id=*). Collects the tournament IDs linked on
 * the page, fetches each tournament's detail from BGA's own JSON API, resolves
 * the game name + BGG id from a cached game-list lookup, diffs against
 * locally-stored known IDs, and POSTs to the BGM API. The BGM endpoint is
 * idempotent on bga_tournament_id, so concurrent visitors only fire the Discord
 * webhook once.
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

const BGM_BASE_URL = 'https://boardgamematcher.com';
const BGA_ORIGIN = 'https://en.boardgamearena.com';
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

async function getTournamentDetail(tournamentId) {
  const res = await fetch(`${BGA_ORIGIN}/tournament/view/getTournament.html?id=${tournamentId}`, {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
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
async function buildPayload(tournamentId, groupId, gameMap) {
  let t;
  try {
    t = await getTournamentDetail(tournamentId);
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
    bgg_id: game?.bggId || null,
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

async function getBgmBaseUrl() {
  const result = await chrome.storage.local.get('apiUrl');
  return result.apiUrl || BGM_BASE_URL;
}

async function postTournament(baseUrl, tournament) {
  try {
    const res = await fetch(`${baseUrl}/api/tournaments`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tournament),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[BGM] tournament sync failed', res.status, text);
      return false;
    }
    const data = await res.json();
    return data.inserted === true;
  } catch (err) {
    console.warn('[BGM] tournament sync error', err);
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runTournamentScraper() {
  if (!isGroupPage()) return;

  const groupId = getGroupId();
  const ids = scrapeTournamentIds();
  if (ids.length === 0) return;

  const baseUrl = await getBgmBaseUrl();
  const gameMap = await getGameMap();
  const knownIds = await getKnownIds();
  const updatedIds = new Set(knownIds);

  for (const id of ids) {
    const payload = await buildPayload(id, groupId, gameMap);
    if (!payload) continue;

    const inserted = await postTournament(baseUrl, payload);
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
