import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');

// Serve a local HTML fixture in response to requests for a real shop URL.
// The browser's address bar still shows the real domain, which keeps
// chrome.tabs.* and content-script matchers happy.
export async function serveFixture(context, urlPattern, fixtureRelPath) {
  const filePath = path.join(FIXTURES_DIR, fixtureRelPath);
  const body = await fs.readFile(filePath, 'utf-8');
  await context.route(urlPattern, async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
}

// Mock a JSON endpoint. payload may be an object or a function (request) => object.
export async function mockJson(context, urlPattern, payload, status = 200) {
  await context.route(urlPattern, async (route, request) => {
    const body = typeof payload === 'function' ? payload(request) : payload;
    await route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(body),
    });
  });
}

// Wire chrome.tabs.query({active:true}) on an extension page (popup / options)
// to return a synthetic "active tab" pointing at `fakeUrl`. Must be called
// BEFORE navigating the page to the extension URL so the patch lands before
// popup.js's load handler runs.
//
// The synthetic tab's id is resolved lazily via chrome.tabs.getCurrent — it
// reuses the extension page's openerTabId, which Playwright sets to the
// previously opened tab. That keeps chrome.tabs.sendMessage /
// chrome.scripting.executeScript routed to a real content script tab.
//
// The extension lacks the "tabs" permission, so URL fields are otherwise
// hidden; we inject the URL here.
export async function pinActiveTab(extensionPage, fakeUrl) {
  await extensionPage.addInitScript((url) => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    const original = chrome.tabs.query;
    chrome.tabs.query = (q, cb) => {
      if (q && q.active) {
        return new Promise((resolve) => {
          chrome.tabs.getCurrent((me) => {
            const fake = [
              {
                id: me?.openerTabId ?? -1,
                url,
                active: true,
                windowId: me?.windowId,
                index: Math.max(0, (me?.index ?? 1) - 1),
              },
            ];
            if (cb) cb(fake);
            resolve(fake);
          });
        });
      }
      return original.call(chrome.tabs, q, cb);
    };
  }, fakeUrl);
}
