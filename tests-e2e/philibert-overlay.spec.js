import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson } from './helpers/routes.js';

test('Philibert product page renders the BGM overlay (BGM-976)', async ({ context }) => {
  await serveFixture(
    context,
    'https://www.philibertnet.com/fr/asmodee/12345-catan.html',
    'shops/philibert-product.html'
  );

  await mockJson(context, 'https://boardgamematcher.com/api/games/search**', {
    games: [{ id: 13, name: 'Catan', slug: 'catan', bayes_average: 7.2 }],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/13', {
    collection_types: ['own', 'played'],
  });

  const page = await context.newPage();
  await page.goto('https://www.philibertnet.com/fr/asmodee/12345-catan.html');

  const overlay = page.locator('#bgm-overlay');
  await expect(overlay).toBeVisible({ timeout: 8000 });
  await expect(overlay.locator('.bgm-overlay-game-name')).toHaveText('Catan');
  await expect(overlay.locator('.bgm-overlay-rating')).toBeVisible();
  await expect(overlay.locator('.bgm-collection-pill[data-type="own"].bgm-active')).toHaveCount(1);
  await expect(overlay.locator('.bgm-collection-pill[data-type="played"].bgm-active')).toHaveCount(
    1
  );
  await expect(
    overlay.locator('.bgm-collection-pill[data-type="wishlist"].bgm-active')
  ).toHaveCount(0);
});

test('Philibert non-product page does not render the overlay', async ({ context }) => {
  await serveFixture(
    context,
    'https://www.philibertnet.com/fr/jeux-de-societe',
    'shops/philibert-search.html'
  );
  const page = await context.newPage();
  await page.goto('https://www.philibertnet.com/fr/jeux-de-societe');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
  await expect(page.locator('#bgm-overlay')).toHaveCount(0);
});
