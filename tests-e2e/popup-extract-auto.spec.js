import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson, pinActiveTab } from './helpers/routes.js';

const KNAPIX_URL = 'https://www.knapix.com/2025/11/top-jeux';

const PREVIEW_WITH_NEW = {
  games: [
    { name: 'Catan', status: 'new', bgm_name: 'Catan' },
    { name: 'Ticket to Ride', status: 'new', bgm_name: 'Ticket to Ride' },
    { name: 'Azul', status: 'known', bgm_name: 'Azul' },
    { name: 'Wingspan', status: 'new', bgm_name: 'Wingspan' },
    { name: 'Everdell', status: 'new', bgm_name: 'Everdell' },
  ],
};

const PREVIEW_ALL_KNOWN = {
  games: [
    { name: 'Catan', status: 'known', bgm_name: 'Catan' },
    { name: 'Ticket to Ride', status: 'known', bgm_name: 'Ticket to Ride' },
    { name: 'Azul', status: 'known', bgm_name: 'Azul' },
    { name: 'Wingspan', status: 'known', bgm_name: 'Wingspan' },
    { name: 'Everdell', status: 'known', bgm_name: 'Everdell' },
  ],
};

// Intercept chrome.tabs.create, chrome.runtime.sendMessage, and window.close
// in the extension page so we can assert the navigation target without the
// popup actually closing or failing on missing message handlers.
async function captureTabsCreate(page) {
  await page.addInitScript(() => {
    window.__tabsCreateCalls = [];
    chrome.tabs.create = (opts) => {
      window.__tabsCreateCalls.push(opts);
    };
    // Suppress "Could not establish connection" errors from sendMessage calls
    // that have no handler registered in the test environment.
    const origSend = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (...args) => {
      try {
        origSend(...args);
      } catch (_) {}
      return Promise.resolve({});
    };
    window.close = () => {};
  });
  return {
    async getUrl() {
      const calls = await page.evaluate(() => window.__tabsCreateCalls);
      return calls.length > 0 ? calls[0].url : null;
    },
  };
}

async function openKnapixPopup(context, extensionId) {
  const knapix = await context.newPage();
  await knapix.goto(KNAPIX_URL);

  const popup = await context.newPage();
  await pinActiveTab(popup, KNAPIX_URL);
  return popup;
}

test.beforeEach(async ({ context }) => {
  await serveFixture(context, 'https://www.knapix.com/**', 'shops/knapix.html');
  await mockJson(context, 'https://boardgamematcher.com/api/me', {}, 401);
});

test('auto-extract: opens BGM results page and skips review panel', async ({
  context,
  extensionId,
}) => {
  await mockJson(context, 'https://boardgamematcher.com/api/extract/preview', PREVIEW_WITH_NEW);
  await mockJson(context, 'https://boardgamematcher.com/api/extract/extension', {
    job_id: 'job_abc_123',
  });

  const popup = await openKnapixPopup(context, extensionId);
  const nav = await captureTabsCreate(popup);
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await expect(popup.locator('#ctx-shop-name')).toHaveText(/Knapix/, { timeout: 5000 });
  await popup.click('#extract-btn');

  // Auto-extract fires chrome.tabs.create with the BGM results URL and then
  // calls window.close() (no-op in tests). The review game list should be
  // empty — the early return prevented it from being populated.
  await expect.poll(() => nav.getUrl(), { timeout: 5000 }).toMatch(/\/extract\?job=/);

  await expect(popup.locator('.review-game-row')).toHaveCount(0);
});

test('auto-extract fallback: shows review panel when extract API fails', async ({
  context,
  extensionId,
}) => {
  await mockJson(context, 'https://boardgamematcher.com/api/extract/preview', PREVIEW_WITH_NEW);
  await mockJson(context, 'https://boardgamematcher.com/api/extract/extension', {}, 500);

  const popup = await openKnapixPopup(context, extensionId);
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await expect(popup.locator('#ctx-shop-name')).toHaveText(/Knapix/, { timeout: 5000 });
  await popup.click('#extract-btn');

  // Extract API failed — review panel must appear
  await expect(popup.locator('#card-review')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('.review-game-row')).toHaveCount(5);
});

test('auto-extract skipped: shows review panel when all games are known', async ({
  context,
  extensionId,
}) => {
  await mockJson(context, 'https://boardgamematcher.com/api/extract/preview', PREVIEW_ALL_KNOWN);

  const popup = await openKnapixPopup(context, extensionId);
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await expect(popup.locator('#ctx-shop-name')).toHaveText(/Knapix/, { timeout: 5000 });
  await popup.click('#extract-btn');

  // newNames.size === 0 — falls through to review panel
  await expect(popup.locator('#card-review')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('.review-game-row')).toHaveCount(5);
});
