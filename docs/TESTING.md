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

What's tested, by feature area. Spec column links to the Playwright file under `tests-e2e/`.

| Area | Scenario | Spec |
|---|---|---|
| Bootstrap | MV3 service worker registers, no console errors | `extension-load` |
| Site detection | All 33 built-in profiles match a representative URL | `popup-supported-sites` |
| Site detection | `example.com`, `google.com`, `wikipedia.org` correctly unsupported | `popup-supported-sites` |
| Popup UI | Supported shop enables extract button + shows shop name | `popup-supported-sites` |
| Popup UI | Unsupported page disables extract button | `popup-supported-sites` |
| Extraction | Knapix end-to-end: extract → review → confirm → success | `popup-knapix-happy-path` |
| Custom patterns | Create / edit / delete (with confirm) + export → import roundtrip | `options-custom-patterns` |
| Custom patterns | Cancelling the delete confirm keeps the pattern | `options-custom-patterns` |
| Custom patterns | Tab is hidden by default and revealed by the Developer mode toggle | `options-custom-patterns` |
| Wishlist badge | Amazon search — only matching titles get a badge | `wishlist-badge` |
| Wishlist badge | Philibert category page renders badges | `wishlist-badge` |
| Wishlist badge | Empty wishlist injects no badges | `wishlist-badge` |
| Context menus | All 5 items registered | `context-menus` |
| Context menus | "Search BGM" → `/search?q=<query>` | `context-menus` |
| Context menus | "Extract from this page" → `/extract?url=<pageUrl>` | `context-menus` |
| Context menus | "Extract from this link" → `/extract?url=<linkUrl>` | `context-menus` |
| Context menus | URL-from-selection only fires on `http(s)` text | `context-menus` |
| Context menus | "Find in BGM extension" stashes query for popup | `context-menus` |
| Play history | BGA / Yucata / BGG / Tabletopia / Ludopedia / SpielByWeb panels + import wiring | `popup-play-history` |
| Philibert overlay (BGM-976) | Product page renders overlay with rating + active collection pills | `philibert-overlay` |
| Philibert overlay | Hidden on category pages | `philibert-overlay` |

For the full literal list of every Playwright test (including each of the 33 built-in profile URLs and each play-history platform), see [`docs/TESTING-tests.md`](TESTING-tests.md). Refresh it with `npm run test:e2e -- --list`.

Scraper logic for individual sites lives in `tests/` (jest):

- `tests/bga-scraper.test.js`, `tests/plays-api.test.js`, `tests/bga-playerstat-scraper.test.js` — BGA + plays API
- `tests/yucata-scraper.test.js`, `tests/yucata-mapper.test.js`, `tests/yucata-integration.test.js` — Yucata
- `tests/pattern-matcher.test.js` — built-in pattern matching
- `tests/next-data-extraction.test.js` — Veepee / Next.js scraping
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
