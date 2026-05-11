import { test, expect } from './fixtures/extension.js';
import { mockJson } from './helpers/routes.js';

const FAKE_USER = {
  id: 1,
  username: 'qa_tester',
  display_name: 'QA Tester',
  preferred_language: 'en',
};

// Opens the popup with a storage overlay injected before the page scripts run.
// This avoids races with the service worker clearing/overwriting storage keys.
async function openDashboardWithStorage(context, extensionId, storageOverlay) {
  const popup = await context.newPage();
  await popup.addInitScript((overlay) => {
    const _origGet = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = (keys, cb) => {
      const p = _origGet(keys).then((real) => ({ ...real, ...overlay }));
      if (cb) {
        p.then(cb);
        return;
      }
      return p;
    };
  }, storageOverlay);
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await popup.click('#bn-dashboard');
  return popup;
}

async function openDashboard(context, extensionId) {
  return openDashboardWithStorage(context, extensionId, {});
}

test.beforeEach(async ({ context }) => {
  await mockJson(context, 'https://boardgamematcher.com/api/me', FAKE_USER);
  await mockJson(context, 'https://boardgamematcher.com/api/plays/summary', { total: 12 });
  await mockJson(context, 'https://boardgamematcher.com/api/matches/new', { count: 3 });
  await mockJson(context, 'https://boardgamematcher.com/api/notifications/count', { count: 5 });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/me', {
    collection_types: [],
  });
});

test('logged-in dashboard renders and logged-out card is hidden', async ({
  context,
  extensionId,
}) => {
  const popup = await openDashboard(context, extensionId);
  await expect(popup.locator('#dash-logged-in')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#dash-logged-out')).toHaveCSS('display', 'none');
});

test('unread messages badge visible when count > 0', async ({ context, extensionId }) => {
  const popup = await openDashboardWithStorage(context, extensionId, {
    unreadMessages: { count: 4, senders: ['Alice', 'Bob', 'Carol'] },
  });
  await expect(popup.locator('#dash-messages-badge')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#dash-messages-badge')).toHaveText('4');
});

test('zero unread messages: badge hidden, sub-text shows "none" state', async ({
  context,
  extensionId,
}) => {
  const popup = await openDashboardWithStorage(context, extensionId, {
    unreadMessages: { count: 0, senders: [] },
  });
  await expect(popup.locator('#dash-logged-in')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#dash-messages-badge')).toHaveCSS('display', 'none');
});

test('quick links (Home, Collections, Wishlist) render with hrefs', async ({
  context,
  extensionId,
}) => {
  const popup = await openDashboard(context, extensionId);
  await expect(popup.locator('#dash-logged-in')).toBeVisible({ timeout: 5000 });

  // Each quick-link element should be visible and have a boardgamematcher.com data-href
  await expect(popup.locator('#dash-link-home')).toBeVisible();
  await expect(popup.locator('#dash-link-collections')).toBeVisible();
  await expect(popup.locator('#dash-link-wishlist')).toBeVisible();
  const home = await popup.locator('#dash-link-home').getAttribute('data-href');
  expect(home).toContain('boardgamematcher.com');
});
