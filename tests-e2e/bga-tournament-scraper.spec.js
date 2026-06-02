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
// same-origin. The BGM POST is sent from the extension service worker (BGM-1233),
// which holds host_permissions for BGM — first-party, no CORS preflight.
const BASE = 'https://en.boardgamearena.com';

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

/**
 * Route /api/tournaments, pushing each POST body into `sink`. The POST is sent
 * by the extension service worker (BGM-1233), not the content script; Playwright
 * still intercepts it through the persistent context's route.
 */
async function captureTournamentPosts(context, sink) {
  await context.route('**/api/tournaments', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      try {
        sink.push(req.postDataJSON());
      } catch {
        sink.push(null);
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ inserted: true }),
    });
  });
}

/**
 * Mock BGA's getTournament + gamelist endpoints.
 * Pass { gamelistStatus } to simulate a failed game-list fetch.
 */
async function mockBgaApi(context, { gamelistStatus = 200 } = {}) {
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
      status: gamelistStatus,
      contentType: 'text/html; charset=utf-8',
      body: gamelistStatus === 200 ? GAMELIST_HTML : '',
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

test('skips tournaments whose game name cannot be resolved', async ({ context }) => {
  // game_name is NOT NULL on the BGM side, so a tournament we cannot map to a
  // game must not be POSTed (and must stay unknown so a later visit retries).
  const posted = [];
  await captureTournamentPosts(context, posted);
  await mockBgaApi(context, { gamelistStatus: 500 });
  await serveFixture(context, `${BASE}/group**`, 'shops/bga-group.html');

  const page = await context.newPage();
  await page.goto(`${BASE}/group?id=99999`);

  await page.waitForTimeout(2000); // give the scraper time to fetch + (not) POST
  expect(posted.length).toBe(0);
});

test('skips tournaments the BGA API cannot load', async ({ context }) => {
  // getTournament returns {status:0} for unknown ids → buildPayload returns
  // null → the tournament is skipped, not POSTed.
  const posted = [];
  await captureTournamentPosts(context, posted);
  await mockBgaApi(context);
  await serveFixture(context, `${BASE}/group**`, 'shops/bga-group-unknown.html');

  const page = await context.newPage();
  await page.goto(`${BASE}/group?id=99999`);

  await page.waitForTimeout(2000);
  expect(posted.length).toBe(0);
});

test('does not re-POST tournaments already known', async ({ context }) => {
  const posted = [];
  await captureTournamentPosts(context, posted);
  await mockBgaApi(context);
  await serveFixture(context, `${BASE}/group**`, 'shops/bga-group.html');

  // First visit syncs both tournaments.
  const page = await context.newPage();
  await page.goto(`${BASE}/group?id=99999`);
  await expect.poll(() => posted.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);

  // Second visit: both ids are now known → no further POSTs.
  posted.length = 0;
  await page.reload();
  await page.waitForTimeout(2000);
  expect(posted.length).toBe(0);
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

test('echoes the TournoiEnLigneidt cookie as X-Request-Token on BGA fetches', async ({
  context,
}) => {
  // BGA's ajaxcall endpoints reject requests (code 806) unless the caller
  // mirrors the HttpOnly TournoiEnLigneidt cookie as X-Request-Token. Since
  // the cookie is HttpOnly, the content script asks the service worker for it
  // via chrome.cookies (action: 'getCookie'). This test asserts the header is
  // attached to every getTournament.html call when the cookie is set.
  const tokenValue = 'oL1oNPFUUYvkwgg';
  await context.addCookies([
    {
      name: 'TournoiEnLigneidt',
      value: tokenValue,
      domain: 'en.boardgamearena.com',
      path: '/',
      httpOnly: true,
      secure: true,
    },
  ]);

  const receivedTokens = [];
  await context.route('**/tournament/view/getTournament.html**', async (route) => {
    receivedTokens.push(route.request().headers()['x-request-token'] || null);
    const id = new URL(route.request().url()).searchParams.get('id');
    const tournament = TOURNAMENTS[id];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tournament ? { status: 1, data: { tournament } } : { status: 0 }),
    });
  });
  await context.route(/\/gamelist\?section=all/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: GAMELIST_HTML }),
  );
  const posted = [];
  await captureTournamentPosts(context, posted);
  await serveFixture(context, `${BASE}/group**`, 'shops/bga-group.html');

  const page = await context.newPage();
  await page.goto(`${BASE}/group?id=99999`);
  await expect.poll(() => posted.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);

  expect(receivedTokens.length).toBeGreaterThanOrEqual(2);
  for (const t of receivedTokens) expect(t).toBe(tokenValue);
});

test('still fetches BGA when the TournoiEnLigneidt cookie is missing', async ({ context }) => {
  // No cookie set: the SW returns null, getBgaRequestToken yields null, and
  // the scraper omits the X-Request-Token header. In production BGA would 806
  // back, but our mock answers — the goal here is that the cookie absence
  // never throws and the scrape pipeline still runs.
  const receivedTokens = [];
  await context.route('**/tournament/view/getTournament.html**', async (route) => {
    receivedTokens.push(route.request().headers()['x-request-token'] || null);
    const id = new URL(route.request().url()).searchParams.get('id');
    const tournament = TOURNAMENTS[id];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tournament ? { status: 1, data: { tournament } } : { status: 0 }),
    });
  });
  await context.route(/\/gamelist\?section=all/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: GAMELIST_HTML }),
  );
  const posted = [];
  await captureTournamentPosts(context, posted);
  await serveFixture(context, `${BASE}/group**`, 'shops/bga-group.html');

  const page = await context.newPage();
  await page.goto(`${BASE}/group?id=99999`);
  await expect.poll(() => posted.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);

  for (const t of receivedTokens) expect(t).toBeNull();
});
