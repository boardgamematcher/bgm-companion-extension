import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson } from './helpers/routes.js';

const WISHLIST = [
  { slug: 'catan', title: 'Catan' },
  { slug: 'wingspan', title: 'Wingspan' },
];

async function seedWishlist(context, extensionId, wishlist) {
  // Set the SW's wishlist cache with a fresh timestamp so getWishlist
  // returns it without hitting BGM's real API.
  const seedPage = await context.newPage();
  await seedPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  await seedPage.evaluate(
    (wl) =>
      new Promise((r) =>
        chrome.storage.local.set(
          { cachedWishlist: { wishlist: wl, timestamp: Date.now() } },
          r
        )
      ),
    wishlist
  );
  await seedPage.close();
}

test.beforeEach(async ({ context }) => {
  // Defensively mock BGM endpoints in case the extension polls them on load.
  await mockJson(context, 'https://boardgamematcher.com/api/auth/me', { user: null }, 401);
  await mockJson(context, 'https://boardgamematcher.com/api/me/wishlist', { wishlist: WISHLIST });
});

test('renders badges next to wishlisted titles on Amazon search', async ({
  context,
  extensionId,
}) => {
  await seedWishlist(context, extensionId, WISHLIST);
  await serveFixture(context, 'https://www.amazon.com/**', 'shops/amazon-search.html');

  const page = await context.newPage();
  await page.goto('https://www.amazon.com/s?k=board+games');

  await expect(page.locator('.bgm-wishlist-badge')).toHaveCount(2);

  // Each badge sits right after a matched <span> inside an h2
  const catanBadge = page.locator(
    'div[data-asin="A1"] h2 + .bgm-wishlist-badge, div[data-asin="A1"] .bgm-wishlist-badge'
  );
  await expect(catanBadge).toBeVisible();
  await expect(catanBadge.first()).toHaveAttribute('href', /catan/);

  const wingspanBadge = page.locator('div[data-asin="A3"] .bgm-wishlist-badge');
  await expect(wingspanBadge).toBeVisible();
  await expect(wingspanBadge).toHaveAttribute('href', /wingspan/);

  // Unmatched titles get no badge
  await expect(page.locator('div[data-asin="A2"] .bgm-wishlist-badge')).toHaveCount(0);
  await expect(page.locator('div[data-asin="A4"] .bgm-wishlist-badge')).toHaveCount(0);
});

test('renders badges on Philibert category page', async ({ context, extensionId }) => {
  await seedWishlist(context, extensionId, WISHLIST);
  await serveFixture(context, 'https://www.philibertnet.com/**', 'shops/philibert-search.html');

  const page = await context.newPage();
  await page.goto('https://www.philibertnet.com/fr/jeux-de-societe');

  await expect(page.locator('.bgm-wishlist-badge')).toHaveCount(2);

  const badges = page.locator('.bgm-wishlist-badge');
  const hrefs = await badges.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs.some((h) => /catan/.test(h))).toBe(true);
  expect(hrefs.some((h) => /wingspan/.test(h))).toBe(true);
});

test('does not render badges when wishlist is empty', async ({ context, extensionId }) => {
  await seedWishlist(context, extensionId, []);
  await serveFixture(context, 'https://www.amazon.com/**', 'shops/amazon-search.html');

  const page = await context.newPage();
  await page.goto('https://www.amazon.com/s?k=board+games');
  await page.waitForLoadState('domcontentloaded');
  // Give the content script a moment to run its async chain
  await page.waitForTimeout(500);
  await expect(page.locator('.bgm-wishlist-badge')).toHaveCount(0);
});
