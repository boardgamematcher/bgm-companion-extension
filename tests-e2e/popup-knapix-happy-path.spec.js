import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson, pinActiveTab } from './helpers/routes.js';

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
      try { origSend(...args); } catch (_) {}
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

test('Knapix happy path: auto-extract opens BGM results page', async ({
  context,
  extensionId,
}) => {
  await serveFixture(context, 'https://www.knapix.com/**', 'shops/knapix.html');

  await mockJson(context, 'https://boardgamematcher.com/api/extract/preview', {
    games: [
      { name: 'Catan', status: 'new', bgm_name: 'Catan' },
      { name: 'Ticket to Ride', status: 'new', bgm_name: 'Ticket to Ride' },
      { name: 'Azul', status: 'known', bgm_name: 'Azul' },
      { name: 'Wingspan', status: 'new', bgm_name: 'Wingspan' },
      { name: 'Everdell', status: 'new', bgm_name: 'Everdell' },
    ],
  });

  await mockJson(context, 'https://boardgamematcher.com/api/extract/extension', {
    job_id: 'job_test_123',
  });

  await mockJson(context, 'https://boardgamematcher.com/api/me', {}, 401);

  const knapix = await context.newPage();
  await knapix.goto('https://www.knapix.com/2025/11/top-jeux');
  await expect(knapix.locator('h3').first()).toHaveText('Catan');

  const popup = await context.newPage();
  await pinActiveTab(popup, 'https://www.knapix.com/2025/11/top-jeux');
  const nav = await captureTabsCreate(popup);
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await expect(popup.locator('#ctx-shop-name')).toHaveText(/Knapix/, { timeout: 5000 });
  await expect(popup.locator('#extract-btn')).toBeEnabled();

  await popup.click('#extract-btn');

  // Auto-extract fires chrome.tabs.create with the BGM results URL and then
  // calls window.close() (no-op in tests). The card-review is briefly made
  // visible by showReviewPanel before the early return — assert on the
  // navigation, not the panel visibility.
  await expect
    .poll(() => nav.getUrl(), { timeout: 5000 })
    .toMatch(/\/extract\?job=/);

  // The review game list should be empty — the early return prevented it from
  // being populated with game rows.
  await expect(popup.locator('.review-game-row')).toHaveCount(0);
});
