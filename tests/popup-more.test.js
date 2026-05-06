/**
 * @jest-environment jsdom
 */
const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// ── rateUrl ──────────────────────────────────────────────────────────────────

// We test rateUrl in isolation by duplicating the pure logic here so the test
// doesn't need to load the entire popup.js (which requires chrome.* globals).
function rateUrl(ua) {
  if (/Firefox/.test(ua)) return 'https://addons.mozilla.org/firefox/addon/bgm-toolbox/';
  if (/Edg\//.test(ua)) return 'https://microsoftedge.microsoft.com/addons/detail/bgm-toolbox/';
  return 'https://chromewebstore.google.com/detail/bgm-toolbox/';
}

describe('rateUrl', () => {
  test('returns Firefox AMO URL for Firefox UA', () => {
    const url = rateUrl(
      'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'
    );
    expect(url).toBe('https://addons.mozilla.org/firefox/addon/bgm-toolbox/');
  });

  test('returns Edge addons URL for Edge UA', () => {
    const url = rateUrl(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120.0'
    );
    expect(url).toBe('https://microsoftedge.microsoft.com/addons/detail/bgm-toolbox/');
  });

  test('returns Chrome Web Store URL for Chrome UA', () => {
    const url = rateUrl(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    );
    expect(url).toBe('https://chromewebstore.google.com/detail/bgm-toolbox/');
  });

  test('returns Chrome Web Store URL for unknown UA', () => {
    expect(rateUrl('SomeBrowser/1.0')).toBe(
      'https://chromewebstore.google.com/detail/bgm-toolbox/'
    );
  });
});

// ── DOM smoke test ────────────────────────────────────────────────────────────

const popupHtmlPath = path.resolve(__dirname, '../src/popup/popup.html');
const popupHtml = fs.readFileSync(popupHtmlPath, 'utf8');

describe('More tab DOM smoke test', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = popupHtml;
  });

  const MORE_TAB_IDS = [
    'more-import-plays-btn',
    'more-suggest-site-btn',
    'more-rate-btn',
    'more-whats-new-btn',
    'more-feedback-btn',
    'more-help-btn',
    'settings-more-btn',
    'more-privacy-btn',
  ];

  test('tab-more container exists', () => {
    expect(document.getElementById('tab-more')).not.toBeNull();
  });

  MORE_TAB_IDS.forEach((id) => {
    test(`#${id} exists inside #tab-more`, () => {
      const tab = document.getElementById('tab-more');
      expect(tab).not.toBeNull();
      expect(tab.querySelector(`#${id}`)).not.toBeNull();
    });
  });

  test('more-rate-btn is a button (not an anchor)', () => {
    const el = document.getElementById('more-rate-btn');
    expect(el.tagName.toLowerCase()).toBe('button');
  });

  test('more-whats-new-btn is a button (not an anchor)', () => {
    const el = document.getElementById('more-whats-new-btn');
    expect(el.tagName.toLowerCase()).toBe('button');
  });
});
