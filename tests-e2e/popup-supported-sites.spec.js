import { test, expect } from './fixtures/extension.js';
import { SUPPORTED_URLS, UNSUPPORTED_URLS } from './fixtures/supported-sites.js';

// Drive the SW's checkSiteSupport message handler from the popup's
// extension-page context. This covers all 33 built-in profiles without
// needing 33 real page loads.
async function checkSiteSupport(page, url) {
  return page.evaluate(
    (u) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'checkSiteSupport', domain: new URL(u).hostname, url: u },
          resolve
        );
      }),
    url
  );
}

test.describe('built-in profile detection (service worker)', () => {
  for (const { url, expectedName } of SUPPORTED_URLS) {
    test(`matches profile for ${url}`, async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      const response = await checkSiteSupport(page, url);
      expect(response.supported, `${url} should be supported`).toBe(true);
      expect(response.pattern.name).toMatch(expectedName);
    });
  }

  for (const url of UNSUPPORTED_URLS) {
    test(`does not match anything for ${url}`, async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      const response = await checkSiteSupport(page, url);
      expect(response.supported, `${url} should be unsupported`).toBe(false);
      expect(response.pattern).toBeNull();
    });
  }
});

// Popup UI integration: stub chrome.tabs.query before popup.js runs so
// checkSiteSupport() picks up our fake active tab URL. Verifies the
// supported and unsupported UI states render correctly.
test.describe('popup UI states', () => {
  async function openPopupWithFakeTab(context, extensionId, fakeUrl) {
    const page = await context.newPage();
    await page.addInitScript((url) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const ready = (async () => {
        for (let i = 0; i < 50; i++) {
          if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) return;
          await wait(10);
        }
      })();
      ready.then(() => {
        const original = chrome.tabs.query;
        chrome.tabs.query = (q, cb) => {
          if (q && q.active) {
            const fake = [{ id: 9999, url, active: true }];
            if (cb) cb(fake);
            return Promise.resolve(fake);
          }
          return original.call(chrome.tabs, q, cb);
        };
      });
    }, fakeUrl);
    await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    return page;
  }

  test('supported shop page enables extract button and shows shop name', async ({
    context,
    extensionId,
  }) => {
    const page = await openPopupWithFakeTab(
      context,
      extensionId,
      'https://www.knapix.com/2025/11/top-games'
    );
    await expect(page.locator('#ctx-shop-name')).toHaveText(/Knapix/, { timeout: 5000 });
    await expect(page.locator('#extract-btn')).toBeEnabled();
  });

  test('unsupported page leaves extract button disabled', async ({ context, extensionId }) => {
    const page = await openPopupWithFakeTab(context, extensionId, 'https://example.com/');
    await page.waitForFunction(
      () => document.getElementById('extract-btn')?.disabled === true,
      null,
      { timeout: 5000 }
    );
    await expect(page.locator('#extract-btn')).toBeDisabled();
  });
});
