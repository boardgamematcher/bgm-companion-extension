import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson } from './helpers/routes.js';

const PRODUCT_URL = 'https://www.veepee.fr/gr/product/908040/103806698';

test('Veepee product page: one BGM card between price and cart, no bars on images', async ({
  context,
}) => {
  await serveFixture(context, PRODUCT_URL, 'shops/veepee-product.html');
  await mockJson(context, 'https://boardgamematcher.com/api/games/search**', {
    games: [
      {
        id: 7,
        name: 'Investigation Express',
        slug: 'investigation-express',
        display_rating: 3.3,
        users_rated: 57,
      },
      { id: 8, name: 'Enquêtes Express: Panique à Dinopark', slug: 'enquetes-express-panique' },
    ],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/7', {
    collection_types: ['wishlist'],
  });

  const page = await context.newPage();
  await page.goto(PRODUCT_URL);

  const card = page.locator('#bgm-ct-product-card');
  await expect(card.locator('.bgm-ct-name')).toHaveText('Investigation Express', {
    timeout: 8000,
  });
  await expect(card.locator('.bgm-ct-pill[data-type="wishlist"].bgm-ct-pill-on')).toHaveCount(1);

  // Sits right after the price container, before the add-to-cart block
  const order = await page.evaluate(() => {
    const price = document.querySelector('[data-facil-iti="product-sheet--price-container"]');
    return price.nextElementSibling?.id;
  });
  expect(order).toBe('bgm-ct-product-card');

  // No per-image bar or badge on the product page
  await expect(page.locator('.bgm-cat-inline, .bgm-cat-badge')).toHaveCount(0);
  await expect(page.locator('#bgm-ct-product-card')).toHaveCount(1);
});

test('Veepee product page: no card when BGM does not know the product', async ({ context }) => {
  await serveFixture(context, PRODUCT_URL, 'shops/veepee-product.html');
  await mockJson(context, 'https://boardgamematcher.com/api/games/search**', { games: [] });

  const page = await context.newPage();
  await page.goto(PRODUCT_URL);
  await page.waitForTimeout(1500);
  await expect(page.locator('#bgm-ct-product-card')).toHaveCount(0);
});
