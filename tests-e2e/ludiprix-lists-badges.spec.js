import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson } from './helpers/routes.js';

// Both lists share the same markup: cover in the cell before the card
const PAGES = [
  { name: 'Price Drops', path: 'pricedrops', url: 'https://ludiprix.fr/item/pricedrops?best=1' },
  { name: 'Search', path: 'search', url: 'https://ludiprix.fr/item/search?search=stress' },
];
const PROFILES_URL =
  /raw\.githubusercontent\.com\/boardgamematcher\/site-profiles\/main\/profiles\.json/;

for (const shopPage of PAGES) {
  test(`Ludiprix ${shopPage.name}: badge on the cover, which sits in the cell before the card`, async ({
    context,
  }) => {
    await mockJson(context, PROFILES_URL, {
      version: 1,
      profiles: [
        {
          name: `Ludiprix ${shopPage.name}`,
          domain: 'ludiprix.fr',
          url_pattern: `ludiprix\\.fr/item/${shopPage.path}`,
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
      `https://ludiprix.fr/item/${shopPage.path}**`,
      'shops/ludiprix-pricedrops.html'
    );
    await mockJson(context, 'https://boardgamematcher.com/api/games/search**', (request) => {
      const q = new URL(request.url()).searchParams.get('q') || '';
      return /stress/i.test(q)
        ? { games: [{ id: 5, name: 'Stress Botics', slug: 'stress-botics', bayes_average: 6.1 }] }
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
    await page.goto(shopPage.url);

    // One badge, in the first row's cover cell; none for the unknown game
    const badges = page.locator('.bgm-cat-badge, .bgm-cat-inline');
    await expect(badges.first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.searchcell.itemimg').nth(0).locator('.bgm-cat-badge')).toHaveCount(
      1
    );
    await expect(page.locator('.searchcell.itemimg').nth(1).locator('.bgm-cat-badge')).toHaveCount(
      0
    );
  });
}
