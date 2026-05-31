import { test, expect } from './fixtures/extension.js';
import { serveFixture } from './helpers/routes.js';

// BGA group tournament scraper E2E.
//
// bga-tournament-scraper.js runs on BGA /group?id= pages, scrapes the
// tournament list, dedupes against chrome.storage.local, and POSTs new
// tournaments to the BGM API (/api/tournaments). These tests serve a saved
// group fixture and capture the POST bodies — no real BGA / BGM needed.
const BASE = 'https://boardgamearena.com';

// The scraper fetches cross-origin (boardgamearena.com → boardgamematcher.com)
// straight from the content script, so the browser sends a CORS preflight; the
// mock must answer OPTIONS + echo CORS headers or the POST never reaches us.
const CORS = {
  'Access-Control-Allow-Origin': BASE,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** Route /api/tournaments, pushing each POST body into `sink`. */
async function captureTournamentPosts(context, sink) {
  await context.route('**/api/tournaments', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }
    if (req.method() === 'POST') {
      try {
        sink.push(req.postDataJSON());
      } catch {
        sink.push(null);
      }
    }
    await route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify({ inserted: true }),
    });
  });
}

test('scrapes the group page and POSTs each tournament', async ({ context }) => {
  const posted = [];
  await captureTournamentPosts(context, posted);
  await serveFixture(context, `${BASE}/group**`, 'shops/bga-group.html');

  const page = await context.newPage();
  await page.goto(`${BASE}/group?id=99999`);

  // Two tournament rows in the fixture → two POSTs.
  await expect.poll(() => posted.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);

  const byId = Object.fromEntries(posted.filter(Boolean).map((t) => [t.bga_tournament_id, t]));
  expect(Object.keys(byId).sort()).toEqual(['11111', '22222']);

  // Group id comes from the URL query param.
  expect(byId['11111'].bga_group_id).toBe('99999');

  // Open tournament: 12/24 → status "open".
  expect(byId['11111']).toMatchObject({
    title: 'Wingspan Weekly',
    game_name: 'Wingspan',
    spots_filled: 12,
    spots_total: 24,
    status: 'open',
    bga_url: 'https://en.boardgamearena.com/tournament?id=11111',
  });

  // Full tournament: 24/24 → status "full".
  expect(byId['22222']).toMatchObject({
    title: 'Catan Cup',
    game_name: 'Catan',
    spots_filled: 24,
    spots_total: 24,
    status: 'full',
  });
});

test('does not run on non-group BGA pages', async ({ context }) => {
  const posted = [];
  await captureTournamentPosts(context, posted);
  await serveFixture(context, `${BASE}/gamepanel**`, 'shops/bga-gamepanel.html');

  const page = await context.newPage();
  await page.goto(`${BASE}/gamepanel?game=cafe`);
  await page.waitForTimeout(1500); // give the scraper a chance to (not) fire
  expect(posted.length).toBe(0);
});
