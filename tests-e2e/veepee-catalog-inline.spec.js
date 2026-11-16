import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson } from './helpers/routes.js';

const CATALOG_URL = 'https://www.veepee.fr/gr/catalog/908040/25760636';

test('Veepee catalog, inline mode: the rating strip sits under the picture box, not in its carousel', async ({
  context,
}) => {
  await serveFixture(context, CATALOG_URL, 'shops/veepee-catalog.html');
  await mockJson(context, 'https://boardgamematcher.com/api/games/search**', {
    games: [{ id: 9, name: 'Line-it', slug: 'line-it', display_rating: 3.0, users_rated: 800 }],
  });

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  await worker.evaluate(() => chrome.storage.local.set({ catalogDisplayMode: 'inline' }));

  const page = await context.newPage();
  await page.goto(CATALOG_URL);

  const strip = page.locator('.bgm-cat-inline');
  await expect(strip).toHaveCount(1, { timeout: 8000 });
  await expect(strip).toContainText('3.0');

  // Not a slide of the carousel track, and not squashed to its border
  await expect(page.locator('.Medias .bgm-cat-inline')).toHaveCount(0);
  const stripBox = await strip.boundingBox();
  const picturesBox = await page.locator('.PicturesContainer').boundingBox();
  expect(stripBox.height).toBeGreaterThan(15);
  expect(stripBox.y).toBeGreaterThanOrEqual(picturesBox.y + picturesBox.height - 1);
  expect(stripBox.width).toBeGreaterThan(300);
  await expect(strip.locator('.bgm-cat-inline-link')).toBeVisible();
});
