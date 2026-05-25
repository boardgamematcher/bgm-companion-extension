import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson, pinActiveTab } from './helpers/routes.js';

const LUDIPRIX_URL = 'https://ludiprix.fr/item/show/55129/hamlet';
const HAMLET_SLUG = 'hamlet-the-village-building-game';

// Intercept chrome.tabs.update and window.close in an extension page so we
// can assert the navigation target without the popup actually closing.
async function captureTabsUpdate(page) {
  await page.addInitScript(() => {
    window.__tabsUpdateCalls = [];
    chrome.tabs.update = (...args) => {
      window.__tabsUpdateCalls.push(args);
    };
    // Prevent window.close() from closing the page so assertions can run after.
    window.close = () => {};
  });
  return {
    async getUrl() {
      const raw = await page.evaluate(() => window.__tabsUpdateCalls);
      for (const call of raw) {
        for (const arg of call) {
          if (arg && typeof arg === 'object' && arg.url) return arg.url;
        }
      }
      return null;
    },
  };
}

test('ludiprix product page: extracts bgg_id from ul.actions link outside #main', async ({
  context,
  extensionId,
}) => {
  await serveFixture(context, `${LUDIPRIX_URL}**`, 'shops/ludiprix-product.html');
  await mockJson(context, 'https://boardgamematcher.com/api/me', {}, 401);
  await mockJson(context, 'https://boardgamematcher.com/api/extract/preview', (req) => {
    const body = JSON.parse(req.postData() || '{}');
    const game = body.games?.[0];
    // Assert bgg_id was extracted correctly inside the mock so a wrong value
    // causes an obvious failure in the response rather than a silent mismatch.
    if (game?.bgg_id !== 276086) {
      return { games: [{ name: game?.name, status: 'unrecognised', bgm_name: null, slug: null }] };
    }
    return {
      games: [
        {
          name: 'Hamlet',
          status: 'new',
          bgm_name: 'Hamlet: The Village Building Game',
          slug: HAMLET_SLUG,
        },
      ],
    };
  });

  const shopPage = await context.newPage();
  await shopPage.goto(LUDIPRIX_URL);

  const popup = await context.newPage();
  await pinActiveTab(popup, LUDIPRIX_URL);
  const nav = await captureTabsUpdate(popup);
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await expect(popup.locator('#ctx-shop-name')).toHaveText(/Ludiprix/, { timeout: 5000 });
  await expect(popup.locator('#extract-btn')).toBeEnabled();

  await popup.click('#extract-btn');

  // With bgg_id=276086 extracted and slug resolved, the review panel should
  // be skipped entirely — popup closes and navigates directly to BGM.
  await expect(popup.locator('#card-review')).not.toBeVisible({ timeout: 5000 });

  const url = await nav.getUrl();
  expect(url).not.toBeNull();
  expect(url).toContain(HAMLET_SLUG);
});

test('ludiprix product page: falls back to review panel when bgg_id is missing', async ({
  context,
  extensionId,
}) => {
  // Serve a page WITHOUT the BGG link — simulates sites that have no BGG link.
  await context.route(`${LUDIPRIX_URL}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><body>
        <div id="main">
          <div class="productname sidebarinfo"><h1>Hamlet</h1></div>
          <div class="total grand-total">&euro;7,94</div>
        </div>
      </body></html>`,
    });
  });
  await mockJson(context, 'https://boardgamematcher.com/api/me', {}, 401);
  await mockJson(context, 'https://boardgamematcher.com/api/extract/preview', {
    games: [
      {
        name: 'Hamlet',
        status: 'new',
        bgm_name: 'Hamlet: The Village Building Game',
        slug: HAMLET_SLUG,
      },
    ],
  });

  const shopPage = await context.newPage();
  await shopPage.goto(LUDIPRIX_URL);

  const popup = await context.newPage();
  await pinActiveTab(popup, LUDIPRIX_URL);
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await expect(popup.locator('#ctx-shop-name')).toHaveText(/Ludiprix/, { timeout: 5000 });
  await popup.click('#extract-btn');

  // No bgg_id → review panel must appear so the user can verify the match.
  await expect(popup.locator('#card-review')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('.review-game-row')).toHaveCount(1);
});
