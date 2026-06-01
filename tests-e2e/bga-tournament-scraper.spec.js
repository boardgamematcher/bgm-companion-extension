import { test, expect } from './fixtures/extension.js';
import { serveFixture } from './helpers/routes.js';

// BGA group tournament scraper E2E.
//
// bga-tournament-scraper.js runs on BGA /group?id= pages. It reads the
// tournament IDs from the page's links, fetches each tournament's detail from
// BGA's own JSON API (/tournament/view/getTournament.html) plus a cached game
// map (/gamelist?section=all), dedupes against chrome.storage.local, and POSTs
// new tournaments to the BGM API (/api/tournaments). These tests mock all three
// endpoints — no real BGA / BGM needed.
//
// The group page is served on en.boardgamearena.com so the BGA API fetches are
// same-origin; only the BGM POST is cross-origin and needs CORS.
const BASE = 'https://en.boardgamearena.com';

// The scraper fetches cross-origin (boardgamearena.com → boardgamematcher.com)
// straight from the content script, so the browser sends a CORS preflight; the
// mock must answer OPTIONS + echo CORS headers or the POST never reaches us.
const CORS = {
  'Access-Control-Allow-Origin': BASE,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// getTournament.html?id=<id> → BGA's tournament-detail JSON, keyed by id.
const TOURNAMENTS = {
  11111: {
    id: 11111,
    gameId: 1,
    name: 'Wingspan Weekly',
    status: 'register',
    baseDate: '2026-06-07T23:00:00+02:00',
    maxPlayers: 24,
    registeredPlayers: 12,
  },
  22222: {
    id: 22222,
    gameId: 2,
    name: 'Catan Cup',
    status: 'register',
    baseDate: '2026-06-10T18:00:00+02:00',
    maxPlayers: 24,
    registeredPlayers: 24,
  },
};

// /gamelist?section=all → a page embedding BGA's game JSON. parseGameList only
// needs `"id":<n>,"name":"…","display_name_en":"…"` followed by `"bgg_id":<n>`.
const GAMELIST_HTML = `<!doctype html><html><body><script>
var completeGameList = [
  {"id":1,"name":"wingspan","display_name_en":"Wingspan","bgg_id":266192},
  {"id":2,"name":"catan","display_name_en":"Catan","bgg_id":13}
];
</script></body></html>`;

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

/** Mock BGA's getTournament + gamelist endpoints. */
async function mockBgaApi(context) {
  await context.route('**/tournament/view/getTournament.html**', async (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    const tournament = TOURNAMENTS[id];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tournament ? { status: 1, data: { tournament } } : { status: 0 }),
    });
  });
  await context.route(/\/gamelist\?section=all/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: GAMELIST_HTML,
    });
  });
}

test('reads tournament IDs and POSTs each tournament from the BGA API', async ({ context }) => {
  const posted = [];
  await captureTournamentPosts(context, posted);
  await mockBgaApi(context);
  await serveFixture(context, `${BASE}/group**`, 'shops/bga-group.html');

  const page = await context.newPage();
  await page.goto(`${BASE}/group?id=99999`);

  // Two tournament links in the fixture → two POSTs.
  await expect.poll(() => posted.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);

  const byId = Object.fromEntries(posted.filter(Boolean).map((t) => [t.bga_tournament_id, t]));
  expect(Object.keys(byId).sort()).toEqual(['11111', '22222']);

  // Group id comes from the URL query param.
  expect(byId['11111'].bga_group_id).toBe('99999');

  // Open tournament: 12/24 → status "open"; game name + BGG id resolved from
  // the game map; start_date carried from the API's baseDate.
  expect(byId['11111']).toMatchObject({
    title: 'Wingspan Weekly',
    game_name: 'Wingspan',
    bgg_id: 266192,
    spots_filled: 12,
    spots_total: 24,
    status: 'open',
    start_date: '2026-06-07T23:00:00+02:00',
    bga_url: 'https://en.boardgamearena.com/tournament?id=11111',
  });

  // Full tournament: 24/24 → status "full".
  expect(byId['22222']).toMatchObject({
    title: 'Catan Cup',
    game_name: 'Catan',
    bgg_id: 13,
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
