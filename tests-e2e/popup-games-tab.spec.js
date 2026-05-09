import { test, expect } from './fixtures/extension.js';
import { mockJson } from './helpers/routes.js';

const FAKE_USER = {
  id: 1,
  username: 'qa_tester',
  display_name: 'QA Tester',
  preferred_language: 'en',
};

const WINGSPAN = {
  id: 42,
  name: 'Wingspan',
  slug: 'wingspan',
  year_published: 2019,
  min_players: 1,
  max_players: 5,
  playing_time: 70,
  weight_average: 2.46,
  bayes_average: 8.2, // 8.2 / 2 = 4.1 (toFixed(1)); 8.1/2 = 4.05 which rounds to "4.0" in V8
  image_url: 'https://boardgamematcher.com/static/games/wingspan.jpg',
  designers: ['Elizabeth Hargrave'],
};

test.beforeEach(async ({ context }) => {
  await mockJson(context, 'https://boardgamematcher.com/api/me', FAKE_USER);
  await mockJson(context, 'https://boardgamematcher.com/api/plays/summary', { total: 0 });
  await mockJson(context, 'https://boardgamematcher.com/api/matches/new', { count: 0 });
  await mockJson(context, 'https://boardgamematcher.com/api/notifications/count', { count: 0 });
  await mockJson(context, 'https://boardgamematcher.com/api/games/search*', {
    games: [WINGSPAN],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/42', {
    collection_types: ['wishlist'],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/me', {
    collection_types: [],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/games/wingspan/my-stats', {}, 404);
});

async function openGamesTab(context, extensionId) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await popup.click('#bn-games');
  return popup;
}

test('search input triggers API call and renders results', async ({ context, extensionId }) => {
  const popup = await openGamesTab(context, extensionId);

  const input = popup.locator('#wishlist-input');
  await expect(input).toBeVisible({ timeout: 5000 });

  await input.fill('Wingspan');
  // Wait for debounce (250ms) + network mock
  await expect(popup.locator('#wishlist-results .wl-result')).toHaveCount(1, { timeout: 3000 });
  await expect(popup.locator('#wishlist-results .wl-result').first()).toContainText('Wingspan');
});

test('clicking a result shows game detail card with specs and rating', async ({
  context,
  extensionId,
}) => {
  const popup = await openGamesTab(context, extensionId);

  await popup.locator('#wishlist-input').fill('Wingspan');
  await expect(popup.locator('#wishlist-results .wl-result')).toHaveCount(1, { timeout: 3000 });
  await popup.locator('#wishlist-results .wl-result').first().click();

  // Detail card visible
  await expect(popup.locator('#gd-card')).toBeVisible({ timeout: 3000 });

  // Name
  await expect(popup.locator('#gd-name')).toHaveText('Wingspan');

  // Specs (player count + playtime)
  await expect(popup.locator('#gd-specs')).toBeVisible();
  await expect(popup.locator('#gd-specs')).toContainText(/1.+5/); // "1–5 players"
  await expect(popup.locator('#gd-specs')).toContainText(/70/); // "70 min"

  // BGM rating (bayes_average 8.2 / 2 = 4.1 stars)
  await expect(popup.locator('#gd-rating')).toBeVisible();
  await expect(popup.locator('#gd-rating-val')).toHaveText('4.1');

  // "View on BGM" CTA
  await expect(popup.locator('#gd-cta')).toBeVisible();
  await expect(popup.locator('#gd-cta')).toContainText(/BoardGameMatcher/i);
});

test('collection chips render; already-active chip has active class', async ({
  context,
  extensionId,
}) => {
  const popup = await openGamesTab(context, extensionId);

  await popup.locator('#wishlist-input').fill('Wingspan');
  await expect(popup.locator('#wishlist-results .wl-result')).toHaveCount(1, { timeout: 3000 });
  await popup.locator('#wishlist-results .wl-result').first().click();

  await expect(popup.locator('#gd-card')).toBeVisible({ timeout: 3000 });

  // Pills container should have 6 chips
  const pills = popup.locator('#gd-pills .gd-pill');
  await expect(pills).toHaveCount(6, { timeout: 3000 });

  // "wishlist" type is pre-active from mock
  await expect(popup.locator('#gd-pills .gd-pill.active')).toHaveCount(1);
});

test('clicking an inactive chip fires POST to collections API', async ({
  context,
  extensionId,
}) => {
  // Track collection API calls
  const collectionCalls = [];
  await context.route('https://boardgamematcher.com/api/collections/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      collectionCalls.push({ method: req.method(), url: req.url() });
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  const popup = await openGamesTab(context, extensionId);

  await popup.locator('#wishlist-input').fill('Wingspan');
  await expect(popup.locator('#wishlist-results .wl-result')).toHaveCount(1, { timeout: 3000 });
  await popup.locator('#wishlist-results .wl-result').first().click();

  await expect(popup.locator('#gd-pills .gd-pill')).toHaveCount(6, { timeout: 3000 });

  // Click the first inactive chip
  const inactivePill = popup.locator('#gd-pills .gd-pill:not(.active)').first();
  await inactivePill.click();

  // A POST request should have been fired
  await expect
    .poll(() => collectionCalls.some((c) => c.method === 'POST'), { timeout: 3000 })
    .toBe(true);
});
