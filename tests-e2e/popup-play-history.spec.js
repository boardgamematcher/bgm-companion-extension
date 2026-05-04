import { test, expect } from './fixtures/extension.js';
import { mockJson } from './helpers/routes.js';

const PLATFORMS = [
  {
    name: 'BGA',
    fakeUrl: 'https://boardgamearena.com/bga/account/playerprofile?id=1',
    panelId: 'bgaPanel',
    importBtnId: 'bgaImportBtn',
    statusId: 'bgaStatus',
    messageAction: 'import_bga_plays',
  },
  {
    name: 'Yucata',
    fakeUrl: 'https://www.yucata.de/en/Account/Profile',
    panelId: 'yucataPanel',
    importBtnId: 'yucataImportBtn',
    statusId: 'yucataStatus',
    messageAction: 'import_yucata_plays',
  },
  {
    name: 'BGG',
    fakeUrl: 'https://boardgamegeek.com/user/someone',
    panelId: 'bggPanel',
    importBtnId: 'bggImportBtn',
    statusId: 'bggStatus',
    messageAction: 'import_bgg_plays',
  },
  {
    name: 'Tabletopia',
    fakeUrl: 'https://tabletopia.com/profile/someone',
    panelId: 'tabletopiaPanel',
    importBtnId: 'tabletopiaImportBtn',
    statusId: 'tabletopiaStatus',
    messageAction: 'import_tabletopia_plays',
  },
  {
    name: 'Ludopedia',
    fakeUrl: 'https://www.ludopedia.com.br/usuario/someone',
    panelId: 'ludopediaPanel',
    importBtnId: 'ludopediaImportBtn',
    statusId: 'ludopediaStatus',
    messageAction: 'import_ludopedia_plays',
  },
  {
    name: 'SpielByWeb',
    fakeUrl: 'https://www.spielbyweb.de/index.php?page=user_profile',
    panelId: 'spielbywebPanel',
    importBtnId: 'spielbywebImportBtn',
    statusId: 'spielbywebStatus',
    messageAction: 'import_spielbyweb_plays',
  },
];

// Stub chrome.tabs.query to return a fake active tab matching `fakeUrl`, and
// stub chrome.tabs.sendMessage to capture the import message and respond with
// a canned success payload. Both must be in place before popup.js runs.
async function stubTabsForPlatform(page, fakeUrl, expectedAction) {
  await page.addInitScript(
    ({ url, action }) => {
      if (typeof chrome === 'undefined' || !chrome.tabs) return;
      const fakeTab = { id: 4242, url, active: true, windowId: 1, index: 0 };
      const origQuery = chrome.tabs.query;
      chrome.tabs.query = (q, cb) => {
        if (q && q.active) {
          const fake = [fakeTab];
          if (cb) cb(fake);
          return Promise.resolve(fake);
        }
        return origQuery.call(chrome.tabs, q, cb);
      };
      window.__sentMessages = [];
      chrome.tabs.sendMessage = (tabId, msg, cb) => {
        window.__sentMessages.push({ tabId, msg });
        const response =
          msg && msg.action === action
            ? { success: true, data: { posted: 7, skipped: 1, errors: 0 } }
            : null;
        if (cb) cb(response);
        return Promise.resolve(response);
      };
    },
    { url: fakeUrl, action: expectedAction }
  );
}

test.describe('play-history platform smoke tests', () => {
  test.beforeEach(async ({ context }) => {
    await mockJson(context, 'https://boardgamematcher.com/api/auth/me', { user: null }, 401);
  });

  for (const p of PLATFORMS) {
    test(`${p.name}: panel shows, import click sends right message + reflects status`, async ({
      context,
      extensionId,
    }) => {
      const popup = await context.newPage();
      await stubTabsForPlatform(popup, p.fakeUrl, p.messageAction);
      await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

      const panel = popup.locator(`#${p.panelId}`);
      await expect(panel).toBeVisible({ timeout: 5000 });

      const importBtn = popup.locator(`#${p.importBtnId}`);
      await expect(importBtn).toBeVisible();
      await importBtn.click();

      const status = popup.locator(`#${p.statusId}`);
      await expect(status).toContainText(/7/, { timeout: 5000 });
      await expect(status).toHaveClass(/is-success/);

      const sent = await popup.evaluate(() => window.__sentMessages || []);
      expect(sent.length).toBeGreaterThanOrEqual(1);
      expect(sent.some((m) => m.msg?.action === p.messageAction)).toBe(true);
    });
  }
});
