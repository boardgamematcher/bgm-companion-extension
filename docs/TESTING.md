# Testing Guide

The bulk of release QA is automated. Run it locally with:

```bash
npm test          # jest unit tests (scrapers, normalisers, pattern matcher)
npm run test:e2e  # Playwright E2E (extension + popup + content scripts)
```

CI runs both on every PR. See `.github/workflows/test.yml`.

## Manual-only checklist

A small set of things that genuinely need a human. **Run these before tagging a release.**

- [ ] **Firefox smoke load** — `about:debugging` → load the unpacked extension; popup opens, no console errors. Playwright's Firefox + extension story is brittle, so this stays manual.
- [ ] **Real-account BGA import** — sign in to BoardGameArena, click _Import BGA Plays_, eyeball that recent plays appear on `boardgamematcher.com`. Mocked plays in CI; real auth is human-only.
- [ ] **Real-account Yucata import** — same as above on yucata.de.
- [ ] **Real-account BGG collection sync** — _Sync BGG Collection_ pulls owned/wishlist/ratings from a live BGG account.
- [ ] **Visual polish on a real Amazon / Philibert page** — the wishlist badge and Philibert overlay sit on top of third-party CSS. Confirm no z-index regressions, no layout shift, dismiss button works.
- [ ] **Chrome Web Store / Firefox Add-ons listing** — icons render correctly, screenshots match the new version.

## Automated coverage

| Manual checklist item | Replaced by |
|---|---|
| Extension loads, MV3 SW registers, no console errors | `tests-e2e/extension-load.spec.js` |
| Supported shop detected on every domain in `patterns/built-in.json` | `tests-e2e/popup-supported-sites.spec.js` |
| Unsupported page disables the extract button | `tests-e2e/popup-supported-sites.spec.js` |
| Knapix end-to-end: extract → review → confirm → success | `tests-e2e/popup-knapix-happy-path.spec.js` |
| Custom patterns: create / edit / delete (with confirm) / export → import roundtrip | `tests-e2e/options-custom-patterns.spec.js` |
| Wishlist badge renders next to matching products on Amazon and Philibert | `tests-e2e/wishlist-badge.spec.js` |
| Right-click context menus registered and routed to the right BGM URLs | `tests-e2e/context-menus.spec.js` |
| Play-history popup wiring (BGA, Yucata, BGG, Tabletopia, Ludopedia, SpielByWeb) | `tests-e2e/popup-play-history.spec.js` |
| Philibert product overlay (BGM-976) | `tests-e2e/philibert-overlay.spec.js` |

Scraper logic for individual sites lives in `tests/` (jest):

- `tests/bga-scraper.test.js`, `tests/plays-api.test.js` — BGA + plays API
- `tests/yucata-scraper.test.js`, `tests/yucata-mapper.test.js`, `tests/yucata-integration.test.js` — Yucata
- `tests/pattern-matcher.test.js` — built-in pattern matching
- `tests/next-data-extraction.test.js` — Veepee/Next.js scraping
- `tests/normalize.test.js` — name normalisation

## Running individual specs

```bash
npm run test:e2e -- tests-e2e/popup-knapix-happy-path.spec.js   # one spec
npm run test:e2e:ui                                              # Playwright UI mode
PWDEBUG=1 npm run test:e2e -- tests-e2e/wishlist-badge.spec.js  # step through
```

Failed runs upload a `playwright-report/` artifact in CI; locally, traces and videos land in `test-results/` (gitignored).

## How the harness works

The Playwright harness loads the unpacked extension into a fresh Chromium persistent context per test (`tests-e2e/fixtures/extension.js`). For shop-page tests, real third-party domains are intercepted via `context.route()` and served from local fixtures under `tests-e2e/fixtures/shops/` — the URL bar still shows the real domain so manifest content-script matchers and pattern detection behave identically to production.

The popup runs in its own `chrome-extension://` context, so tests open it as a tab and use `addInitScript` to override `chrome.tabs.query` / `chrome.tabs.sendMessage` where needed (`tests-e2e/helpers/routes.js`). Real `chrome.contextMenus.onClicked.dispatch()` lets us simulate context-menu clicks from the service worker without driving the OS menu.

## Debugging tips

**Background SW logs:** `chrome://extensions/` → Inspect views: service worker.

**Content-script logs:** open DevTools on the page itself.

**Popup logs:** right-click the extension icon → Inspect popup. (Note that the popup closes when DevTools steals focus; pop it out first.)

**Storage state:** DevTools → Application → Storage → Extension storage.
