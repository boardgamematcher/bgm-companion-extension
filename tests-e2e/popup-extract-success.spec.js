import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson, pinActiveTab } from './helpers/routes.js';

// Tests for the confirm path reached via the review panel.
// Strategy: first call to /api/extract/extension returns 500 (forces review
// panel), second call (from confirmExtract) returns a valid job_id.
// After the PR "navigate directly to BGM on extract", confirmExtract opens a
// new tab with the results URL and calls window.close() — no success card.

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

// Intercept chrome.tabs.create and window.close so assertions can run
// without the popup actually closing or failing on missing message handlers.
async function captureTabsCreate(page) {
  await page.addInitScript(() => {
    window.__tabsCreateCalls = [];
    chrome.tabs.create = (opts) => {
      window.__tabsCreateCalls.push(opts);
    };
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

async function openReviewPanelWithSucceedingConfirm(context, extensionId) {
  await serveFixture(context, 'https://www.knapix.com/**', 'shops/knapix.html');
  await mockJson(context, 'https://boardgamematcher.com/api/me', {}, 401);
  await mockJson(context, 'https://boardgamematcher.com/api/extract/preview', PREVIEW_WITH_NEW);

  // First call (auto-extract): 500 → falls back to review panel.
  // Second call (confirmExtract): 200 with job_id → opens BGM tab.
  let callCount = 0;
  await context.route('https://boardgamematcher.com/api/extract/extension', async (route) => {
    callCount += 1;
    if (callCount === 1) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job_id: 'job_success_456' }),
      });
    }
  });

  const knapix = await context.newPage();
  await knapix.goto(KNAPIX_URL);

  const popup = await context.newPage();
  await pinActiveTab(popup, KNAPIX_URL);
  const nav = await captureTabsCreate(popup);
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await expect(popup.locator('#ctx-shop-name')).toHaveText(/Knapix/, { timeout: 5000 });
  await popup.click('#extract-btn');
  await expect(popup.locator('#card-review')).toBeVisible({ timeout: 5000 });

  await expect(popup.locator('#review-confirm')).toBeEnabled();
  await popup.click('#review-confirm');

  return { popup, nav };
}

test('confirm extract opens BGM results page', async ({ context, extensionId }) => {
  const { nav } = await openReviewPanelWithSucceedingConfirm(context, extensionId);

  await expect
    .poll(() => nav.getUrl(), { timeout: 5000 })
    .toMatch(/\/extract\?job=job_success_456/);
});
