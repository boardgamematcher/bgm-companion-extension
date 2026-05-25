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
  bayes_average: 8.2,
  image_url: 'https://boardgamematcher.com/static/games/wingspan.jpg',
  designers: ['Elizabeth Hargrave'],
};

const AZUL = {
  id: 99,
  name: 'Azul',
  slug: 'azul',
  year_published: 2017,
  min_players: 2,
  max_players: 4,
  playing_time: 45,
  weight_average: 1.76,
  bayes_average: 0,
  image_url: 'https://boardgamematcher.com/static/games/azul.jpg',
  designers: ['Michael Riesling'],
};

test.beforeEach(async ({ context }) => {
  await mockJson(context, 'https://boardgamematcher.com/api/me', FAKE_USER);
  await mockJson(context, 'https://boardgamematcher.com/api/plays/summary', { total: 0 });
  await mockJson(context, 'https://boardgamematcher.com/api/matches/new', { count: 0 });
  await mockJson(context, 'https://boardgamematcher.com/api/notifications/count', { count: 0 });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/me', {
    collection_types: [],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/games/wingspan/my-stats', {}, 404);
  await mockJson(context, 'https://boardgamematcher.com/api/games/azul/my-stats', {}, 404);
});

async function openGamesTab(context, extensionId) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await popup.click('#bn-games');
  return popup;
}

test('active chip click fires DELETE request', async ({ context, extensionId }) => {
  await mockJson(context, 'https://boardgamematcher.com/api/games/search*', {
    games: [WINGSPAN],
  });

  // Track all non-GET collection calls; fulfil GETs with proper data.
  const collectionCalls = [];
  await context.route('https://boardgamematcher.com/api/collections/**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' && req.url().includes('/collections/42')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ collection_types: ['wishlist'] }),
      });
    } else if (req.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    } else {
      collectionCalls.push({ method: req.method(), url: req.url() });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });

  const popup = await openGamesTab(context, extensionId);

  await popup.locator('#wishlist-input').fill('Wingspan');
  await expect(popup.locator('#wishlist-results .wl-result')).toHaveCount(1, { timeout: 3000 });
  await popup.locator('#wishlist-results .wl-result').first().click();

  await expect(popup.locator('#gd-pills .gd-pill.active')).toHaveCount(1, { timeout: 3000 });

  // Click the active chip to toggle it off → DELETE
  await popup.locator('#gd-pills .gd-pill.active').first().click();

  await expect
    .poll(
      () => collectionCalls.some((c) => c.method === 'DELETE' && c.url.includes('/collections/42')),
      { timeout: 3000 }
    )
    .toBe(true);
});

test("no rating shows 'Rate on BGM' link", async ({ context, extensionId }) => {
  await mockJson(context, 'https://boardgamematcher.com/api/games/search*', {
    games: [AZUL],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/99', {
    collection_types: [],
  });

  const popup = await openGamesTab(context, extensionId);

  await popup.locator('#wishlist-input').fill('Azul');
  await expect(popup.locator('#wishlist-results .wl-result')).toHaveCount(1, { timeout: 3000 });
  await popup.locator('#wishlist-results .wl-result').first().click();

  await expect(popup.locator('#gd-card')).toBeVisible({ timeout: 3000 });
  await expect(popup.locator('#gd-no-rating')).toBeVisible();
  await expect(popup.locator('#gd-rating')).toHaveCSS('display', 'none');
});

test('arrow navigation between multiple results', async ({ context, extensionId }) => {
  await mockJson(context, 'https://boardgamematcher.com/api/games/search*', {
    games: [WINGSPAN, AZUL],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/42', {
    collection_types: [],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/99', {
    collection_types: [],
  });

  const popup = await openGamesTab(context, extensionId);

  await popup.locator('#wishlist-input').fill('game');
  await expect(popup.locator('#wishlist-results .wl-result')).toHaveCount(2, { timeout: 3000 });

  // Click first result — opens detail for Wingspan
  await popup.locator('#wishlist-results .wl-result').first().click();
  await expect(popup.locator('#gd-card')).toBeVisible({ timeout: 3000 });
  await expect(popup.locator('#gd-name')).toHaveText('Wingspan');

  // Nav arrows visible when there are multiple results
  await expect(popup.locator('#gd-next')).toBeEnabled({ timeout: 3000 });

  // Clicking a result sets wishlistHighlightIndex to -1. The first #gd-next
  // click advances it to 0 (still Wingspan), the second advances it to 1 (Azul).
  await popup.click('#gd-next');
  await popup.click('#gd-next');
  await expect(popup.locator('#gd-name')).toHaveText('Azul');

  // Prev is now enabled, next is disabled (last result)
  await expect(popup.locator('#gd-prev')).toBeEnabled();
  await expect(popup.locator('#gd-next')).toBeDisabled();
});
