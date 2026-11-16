import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson } from './helpers/routes.js';

const PAGE_URL = 'https://ludiprix.fr/item/pricedrops?order=absolute&best=1';
const PROFILES_URL =
  /raw\.githubusercontent\.com\/boardgamematcher\/site-profiles\/main\/profiles\.json/;

test('Ludiprix price drops: badge on the cover, which sits in the cell before the card', async ({
  context,
}) => {
  await mockJson(context, PROFILES_URL, {
    version: 1,
    profiles: [
      {
        name: 'Ludiprix Price Drops',
        domain: 'ludiprix.fr',
        url_pattern: 'ludiprix\\.fr/item/pricedrops',
        card_selector: '.searchinfocontainer',
        selector: '.name a',
        image_selector: 'img',
        image_in_previous_sibling: true,
        catalog_badges: true,
        threshold: 0.8,
      },
    ],
  });
  await serveFixture(
    context,
    'https://ludiprix.fr/item/pricedrops**',
    'shops/ludiprix-pricedrops.html'
  );
  await mockJson(context, 'https://boardgamematcher.com/api/games/search**', (request) => {
    const q = new URL(request.url()).searchParams.get('q') || '';
    return /stress/i.test(q)
      ? { games: [{ id: 5, name: 'Stress Botics', slug: 'stress-botics', display_rating: 6.1 }] }
      : { games: [] };
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/5', {
    collection_types: [],
  });

  // The service worker may have loaded the real profiles before the mock was set
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  await worker.evaluate(() => refreshProfiles());

  const page = await context.newPage();
  await page.goto(PAGE_URL);

  // One badge, in the first row's cover cell; none for the unknown game
  const badges = page.locator('.bgm-cat-badge, .bgm-cat-inline');
  await expect(badges.first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.searchcell.itemimg').nth(0).locator('.bgm-cat-badge')).toHaveCount(1);
  await expect(page.locator('.searchcell.itemimg').nth(1).locator('.bgm-cat-badge')).toHaveCount(0);
});
