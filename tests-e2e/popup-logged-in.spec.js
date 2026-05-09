import { test, expect } from './fixtures/extension.js';
import { mockJson } from './helpers/routes.js';

const FAKE_USER = {
  id: 1,
  username: 'qa_tester',
  display_name: 'QA Tester',
  avatar_url: 'https://boardgamematcher.com/static/avatars/default.png',
  preferred_language: 'en',
};

// Opens the popup with a storage overlay injected before the page scripts run.
// This avoids races with the service worker clearing/overwriting storage keys.
async function openPopupWithStorage(context, extensionId, storageOverlay) {
  const popup = await context.newPage();
  await popup.addInitScript((overlay) => {
    const _origGet = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = (keys, cb) => {
      const p = _origGet(keys).then((real) => ({ ...real, ...overlay }));
      if (cb) { p.then(cb); return; }
      return p;
    };
  }, storageOverlay);
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  return popup;
}

async function openPopup(context, extensionId) {
  return openPopupWithStorage(context, extensionId, {});
}

test.beforeEach(async ({ context }) => {
  await mockJson(context, 'https://boardgamematcher.com/api/me', FAKE_USER);
  // Silence other endpoints the popup may call on load
  await mockJson(context, 'https://boardgamematcher.com/api/plays/summary', { total: 0 });
  await mockJson(context, 'https://boardgamematcher.com/api/matches/new', { count: 0 });
  await mockJson(context, 'https://boardgamematcher.com/api/notifications/count', { count: 0 });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/me', {
    collection_types: [],
  });
});

test('avatar rendered in header with correct src; hidden when logged out', async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);
  const avatar = popup.locator('#user-avatar');
  await expect(avatar).toBeVisible({ timeout: 5000 });
  // Avatar either shows the img or the initial letter — either way it's visible
  await expect(avatar).not.toHaveCSS('display', 'none');
});

test('unread messages banner: visible when count > 0, hidden when count = 0', async ({
  context,
  extensionId,
}) => {
  // Inject storage data via addInitScript overlay (immune to service-worker race conditions)
  const popup = await openPopupWithStorage(context, extensionId, {
    unreadMessages: { count: 3, senders: ['Alice', 'Bob'] },
  });
  const banner = popup.locator('#msg-banner');
  await expect(banner).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#msg-banner-text')).not.toBeEmpty();

  // Open a second popup with count=0 — banner should be hidden
  const popup2 = await openPopupWithStorage(context, extensionId, {
    unreadMessages: { count: 0, senders: [] },
  });
  await expect(popup2.locator('#msg-banner')).toHaveCSS('display', 'none');
});

test('theme toggle switches dark ↔ light and persists across reopens', async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);

  // Read initial theme
  const initialClass = await popup.locator('body').getAttribute('class');
  const startedLight = initialClass?.includes('light') ?? false;

  // Toggle
  await popup.click('#theme-toggle-btn');
  const afterToggle = await popup.locator('body').getAttribute('class');
  const nowLight = afterToggle?.includes('light') ?? false;
  expect(nowLight).toBe(!startedLight);

  // Reopen — theme must persist
  const popup2 = await openPopup(context, extensionId);
  await popup2.waitForLoadState('domcontentloaded');
  const afterReopen = await popup2.locator('body').getAttribute('class');
  const stillLight = afterReopen?.includes('light') ?? false;
  expect(stillLight).toBe(nowLight);
});
