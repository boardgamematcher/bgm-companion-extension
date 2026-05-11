import { test, expect } from './fixtures/extension.js';
import { mockJson } from './helpers/routes.js';

// Stub chrome.tabs.query so the popup thinks `fakeUrl` is the active tab.
// Must be registered via addInitScript BEFORE navigating to the popup page.
async function openPopupAt(context, extensionId, fakeUrl = 'https://example.com/') {
  const popup = await context.newPage();
  await popup.addInitScript((url) => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    const orig = chrome.tabs.query;
    chrome.tabs.query = (q, cb) => {
      if (q && q.active) {
        const fake = [{ id: 4242, url, active: true, windowId: 1, index: 0 }];
        if (cb) cb(fake);
        return Promise.resolve(fake);
      }
      return orig.call(chrome.tabs, q, cb);
    };
  }, fakeUrl);
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  return popup;
}

test.beforeEach(async ({ context }) => {
  await mockJson(context, 'https://boardgamematcher.com/api/me', {}, 401);
});

test('all 4 nav tabs render and Extract tab is active by default', async ({
  context,
  extensionId,
}) => {
  const popup = await openPopupAt(context, extensionId);
  await expect(popup.locator('#bn-extract')).toBeVisible();
  await expect(popup.locator('#bn-games')).toBeVisible();
  await expect(popup.locator('#bn-dashboard')).toBeVisible();
  await expect(popup.locator('#bn-more')).toBeVisible();
  await expect(popup.locator('#bn-extract')).toHaveClass(/active/);
});

test('Games tab: shows login strip; chips and footer hidden', async ({ context, extensionId }) => {
  const popup = await openPopupAt(context, extensionId);
  await popup.click('#bn-games');
  await expect(popup.locator('#wl-login-strip')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#wl-footer')).toHaveCSS('display', 'none');
  await expect(popup.locator('#col-chips-row')).toHaveCSS('display', 'none');
});

test('Dashboard tab: shows signed-out card; logged-in section hidden', async ({
  context,
  extensionId,
}) => {
  const popup = await openPopupAt(context, extensionId);
  await popup.click('#bn-dashboard');
  await expect(popup.locator('#dash-logged-out')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#dash-logged-in')).toHaveCSS('display', 'none');
});

test('More tab: renders without auth wall', async ({ context, extensionId }) => {
  const popup = await openPopupAt(context, extensionId);
  await popup.click('#bn-more');
  await expect(popup.locator('#tab-more')).toBeVisible({ timeout: 5000 });
});

test('BGA page: sign-in teaser row shown when logged out', async ({ context, extensionId }) => {
  const popup = await openPopupAt(
    context,
    extensionId,
    'https://boardgamearena.com/player?id=12345'
  );
  await expect(popup.locator('#bgaPanel')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#bgaTeaserRow')).toBeVisible();
});

test('BGA page: clicking import while logged out shows BGM sign-in CTA', async ({
  context,
  extensionId,
}) => {
  const popup = await openPopupAt(
    context,
    extensionId,
    'https://boardgamearena.com/player?id=12345'
  );
  await expect(popup.locator('#bgaImportBtn')).toBeVisible({ timeout: 5000 });
  await popup.click('#bgaImportBtn');
  // The import handler detects no currentUser and surfaces the sign-in CTA
  await expect(popup.locator('#bgaSigninCta')).toBeVisible({ timeout: 3000 });
  await expect(popup.locator('#bgaStatus')).toContainText(/sign in|BGM/i);
});
