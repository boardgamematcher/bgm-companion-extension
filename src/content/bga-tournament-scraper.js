/**
 * bga-tournament-scraper.js
 *
 * Runs on BGA group pages (/group?id=*). Detects new tournaments,
 * diffs against locally-stored known IDs, and POSTs new ones to
 * the BGM API. The API endpoint is idempotent, so concurrent visitors
 * triggering the scraper only fire the Discord webhook once.
 *
 * ⚠️  DOM SELECTORS NOTE
 * BGA's group tournament list is rendered by their frontend framework.
 * The selectors below are best-effort based on BGA's known HTML patterns
 * as of mid-2025. If nothing is detected, open DevTools on the group page
 * and look for the container holding the tournament rows, then update
 * TOURNAMENT_ROW_SELECTOR and the helper functions below.
 */

'use strict';

const BGM_BASE_URL = 'https://boardgamematcher.com';
const STORAGE_KEY = 'bga_known_tournaments';

// ── DOM selectors — adjust here if BGA changes its markup ───────────────────
//
// Priority: try each in order until one returns results.
const TOURNAMENT_ROW_SELECTORS = [
  // BGA group page tournament table rows (observed pattern)
  'table.tournament_list tr[id^="tournament_"]',
  // Alternate list-item pattern
  '.tournament_item',
  // Generic fallback: any link pointing to /tournament?id=
  'a[href*="/tournament?id="]',
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getGroupId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
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
 * Extract tournament ID from a BGA tournament URL or element ID.
 * Handles:
 *   /tournament?id=12345  →  "12345"
 *   id="tournament_12345" →  "12345"
 */
function extractTournamentId(el) {
  // From element id="tournament_12345"
  const idAttr = el.id || '';
  const idMatch = idAttr.match(/tournament_(\d+)/);
  if (idMatch) return idMatch[1];

  // From a link href="/tournament?id=12345"
  const link = el.tagName === 'A' ? el : el.querySelector('a[href*="/tournament?id="]');
  if (link) {
    const href = link.getAttribute('href') || '';
    const hrefMatch = href.match(/[?&]id=(\d+)/);
    if (hrefMatch) return hrefMatch[1];
  }
  return null;
}

/**
 * Extract game name from a tournament row element.
 *
 * BGA typically shows the game name in a link or span inside the row.
 * Adjust the selector list if the game name isn't being picked up.
 */
function extractGameName(el) {
  // Try common BGA patterns for game name
  const candidates = [
    el.querySelector('.gamename'),
    el.querySelector('[class*="game_name"]'),
    el.querySelector('[class*="game-name"]'),
    el.querySelector('a[href*="/gamepanel"]'),
    el.querySelector('a[href*="/game/"]'),
  ];
  for (const c of candidates) {
    if (c && c.textContent.trim()) return c.textContent.trim();
  }
  // Last resort: look for any text that doesn't look like a date or count
  return '';
}

/**
 * Extract spots filled/total from text like "12/24" or "12 / 24".
 */
function extractSpots(el) {
  const text = el.textContent || '';
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (match) return { filled: parseInt(match[1], 10), total: parseInt(match[2], 10) };
  return { filled: 0, total: 24 };
}

/**
 * Parse the tournament status from class names or text.
 * Returns 'open' | 'full' | 'ongoing' | 'finished'.
 */
function extractStatus(el) {
  const cls = (el.className || '') + ' ' + (el.querySelector('[class]')?.className || '');
  if (/finish|terminé|ended|completed/i.test(cls)) return 'finished';
  if (/ongoing|en cours|started/i.test(cls)) return 'ongoing';
  const { filled, total } = extractSpots(el);
  if (filled >= total && total > 0) return 'full';
  return 'open';
}

/**
 * Scrape the tournament list from the current group page DOM.
 * Returns an array of tournament objects (partial — no bgg_id/start_date).
 */
function scrapeTournaments(groupId) {
  let rows = [];

  for (const selector of TOURNAMENT_ROW_SELECTORS) {
    const found = Array.from(document.querySelectorAll(selector));
    if (found.length > 0) {
      rows = found;
      break;
    }
  }

  if (rows.length === 0) return [];

  const tournaments = [];
  for (const row of rows) {
    const tournamentId = extractTournamentId(row);
    if (!tournamentId) continue;

    const gameName = extractGameName(row);
    const { filled, total } = extractSpots(row);
    const status = extractStatus(row);

    // Tournament title: prefer an explicit title element, fall back to game name
    const titleEl =
      row.querySelector('[class*="tournament_name"]') ||
      row.querySelector('[class*="tournamentname"]') ||
      row.querySelector('a[href*="/tournament?id="]');
    const title = titleEl ? titleEl.textContent.trim() : gameName;

    tournaments.push({
      bga_tournament_id: tournamentId,
      bga_group_id: groupId,
      title: title || `Tournoi ${gameName || tournamentId}`,
      game_name: gameName,
      bga_url: `https://en.boardgamearena.com/tournament?id=${tournamentId}`,
      spots_total: total,
      spots_filled: filled,
      status,
    });
  }

  return tournaments;
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
  const tournaments = scrapeTournaments(groupId);

  if (tournaments.length === 0) return;

  const knownIds = await getKnownIds();
  const newTournaments = tournaments.filter((t) => !knownIds.has(t.bga_tournament_id));

  if (newTournaments.length === 0) {
    // Still update spots/status for all tournaments (idempotent upsert)
    const baseUrl = await getBgmBaseUrl();
    for (const t of tournaments) {
      await postTournament(baseUrl, t);
    }
    return;
  }

  const baseUrl = await getBgmBaseUrl();
  const updatedIds = new Set(knownIds);

  for (const t of tournaments) {
    const inserted = await postTournament(baseUrl, t);
    if (inserted) {
      console.info(`[BGM] new tournament synced: ${t.title}`);
    }
    updatedIds.add(t.bga_tournament_id);
  }

  await saveKnownIds(updatedIds);
}

// Run after DOM is ready. BGA is an SPA, so also observe DOM mutations
// in case the tournament list is injected after initial load.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runTournamentScraper);
} else {
  runTournamentScraper();
}

// MutationObserver fallback: re-run once when the main content area changes,
// capped to a single additional pass to avoid infinite loops.
let observerFired = false;
const observer = new MutationObserver(() => {
  if (observerFired) return;
  if (document.querySelectorAll(TOURNAMENT_ROW_SELECTORS[0]).length > 0) {
    observerFired = true;
    observer.disconnect();
    runTournamentScraper();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
