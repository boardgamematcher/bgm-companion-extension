# BGM Companion Extension — Exhaustive QA Plan

> **Release gate for v1.0.** Every user-facing action is covered by either an automated Playwright spec or a documented manual test case. Do not ship until all rows are checked.

## Legend

| Symbol     | Meaning                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| `[AUTO]`   | Playwright E2E spec in `tests-e2e/` — must pass in CI                          |
| `[MANUAL]` | Requires a real browser/account/OS interaction — check the box below when done |
| ✅         | Done                                                                           |
| ❌         | Failed — link to bug                                                           |
| ⏭️         | Skipped with justification                                                     |

## Linear epic: [BGM-1113](https://linear.app/board-game-matcher/issue/BGM-1113/extension-v10-exhaustive-qa-plan)

---

## A · Popup — Logged Out

> Mock `GET /api/me` → 401. No real BGM session needed.

| #   | Test                                                                                 | Type     | Linear                                                           | Status | Notes                      |
| --- | ------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------- | ------ | -------------------------- |
| A1  | All 4 tabs render; Games + Dashboard show sign-in CTA; Extract + More work normally  | `[AUTO]` | [BGM-1114](https://linear.app/board-game-matcher/issue/BGM-1114) |        | `popup-logged-out.spec.js` |
| A2  | Extract tab: play-import buttons replaced by "Sign in to BGM" CTA on all 6 platforms | `[AUTO]` | [BGM-1115](https://linear.app/board-game-matcher/issue/BGM-1115) |        | `popup-logged-out.spec.js` |
| A3  | Games tab: search input hidden, sign-in card copy + link correct                     | `[AUTO]` | BGM-1114                                                         |        | same spec                  |
| A4  | Dashboard tab: sign-in card visible, quick-links section absent                      | `[AUTO]` | BGM-1114                                                         |        | same spec                  |

**Spec file:** `tests-e2e/popup-logged-out.spec.js` _(new)_

---

## B · Popup — Logged In

> Mock `GET /api/me` → `{ username, avatar_url, display_name }`. All BGM API calls mocked via Playwright `page.route()`.

| #   | Test                                                                                   | Type     | Linear                                                           | Status | Notes                     |
| --- | -------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------- | ------ | ------------------------- |
| B1  | Avatar `<img>` in header with correct `src`; clicking opens BGM profile tab            | `[AUTO]` | [BGM-1116](https://linear.app/board-game-matcher/issue/BGM-1116) |        | `popup-logged-in.spec.js` |
| B2  | Unread messages banner: count > 0 → visible; count = 0 → hidden                        | `[AUTO]` | BGM-1116                                                         |        | same spec                 |
| B3  | Theme toggle dark ↔ light persists across popup close + reopen                         | `[AUTO]` | [BGM-1117](https://linear.app/board-game-matcher/issue/BGM-1117) |        | `popup-logged-in.spec.js` |
| B4  | Games tab: typing triggers `/api/games/search` (debounced); results list renders       | `[AUTO]` | [BGM-1118](https://linear.app/board-game-matcher/issue/BGM-1118) |        | `popup-games-tab.spec.js` |
| B5  | Game detail card: cover, player count, duration, weight, BGM stars, "View on BGM" link | `[AUTO]` | BGM-1118                                                         |        | same spec                 |
| B6  | Collection chips (6 types): select + save fires `POST /api/collections/:id/:type`      | `[AUTO]` | [BGM-1119](https://linear.app/board-game-matcher/issue/BGM-1119) |        | `popup-games-tab.spec.js` |
| B7  | Dashboard: message/match/notification counts render; zero-state shows correctly        | `[AUTO]` | [BGM-1120](https://linear.app/board-game-matcher/issue/BGM-1120) |        | `popup-dashboard.spec.js` |
| B8  | More tab: all 8+ links present; version string matches `manifest.json`                 | `[AUTO]` | [BGM-1121](https://linear.app/board-game-matcher/issue/BGM-1121) |        | `popup-more.spec.js`      |

**Spec files:** `tests-e2e/popup-logged-in.spec.js`, `popup-games-tab.spec.js`, `popup-dashboard.spec.js`, `popup-more.spec.js` _(all new)_

---

## C · Extract & Review Flow

| #   | Test                                                                                     | Type     | Linear                                                           | Status | Notes                                       |
| --- | ---------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------- | ------ | ------------------------------------------- |
| C1  | Knapix fixture: "Extract & review" button visible; review modal opens with game list     | `[AUTO]` | [BGM-1122](https://linear.app/board-game-matcher/issue/BGM-1122) |        | `popup-knapix-happy-path.spec.js` (enhance) |
| C2  | Review confirm: fires `POST /api/extract/extension`; success card with result link shown | `[AUTO]` | BGM-1122                                                         |        | same spec                                   |
| C3  | Review modal: "Select all" / "Select new" / "Select none" toggle checkboxes correctly    | `[AUTO]` | [BGM-1123](https://linear.app/board-game-matcher/issue/BGM-1123) |        | `popup-extract-review.spec.js` (new)        |
| C4  | Review "Cancel": modal closes, extract tab visible, no API call fired                    | `[AUTO]` | BGM-1123                                                         |        | same spec                                   |
| C5  | Non-shop page: "no pattern for this page" empty state; no Extract button shown           | `[AUTO]` | [BGM-1124](https://linear.app/board-game-matcher/issue/BGM-1124) |        | `popup-supported-sites.spec.js` (enhance)   |
| C6  | Multi-page shop: pagination controls visible; bulk extraction sends correct scope        | `[AUTO]` | —                                                                |        | `popup-extract-review.spec.js` (new)        |

---

## D · Options Page

| #   | Test                                                                                       | Type     | Linear | Status | Notes                                       |
| --- | ------------------------------------------------------------------------------------------ | -------- | ------ | ------ | ------------------------------------------- |
| D1  | Notifications tab: language dropdown + 5 toggle rows render                                | `[AUTO]` | —      |        | `options-notifications.spec.js` (new)       |
| D2  | Language selector: persists to `chrome.storage`; fires `PATCH /api/profile` (mocked)       | `[AUTO]` | —      |        | same spec                                   |
| D3  | Notification toggles: each write reflected in `chrome.storage`; Game Night toggle disabled | `[AUTO]` | —      |        | same spec                                   |
| D4  | Developer mode checkbox: reveals Custom Patterns tab; hides it on uncheck                  | `[AUTO]` | —      |        | `options-custom-patterns.spec.js` (enhance) |
| D5  | Custom patterns CRUD: add → edit → delete; list updates correctly after each op            | `[AUTO]` | —      |        | `options-custom-patterns.spec.js` (enhance) |
| D6  | Custom patterns import/export: export produces valid JSON; import round-trips without loss | `[AUTO]` | —      |        | same spec                                   |

---

## E · Content Scripts

| #   | Test                                                                                | Type     | Linear | Status | Notes                                 |
| --- | ----------------------------------------------------------------------------------- | -------- | ------ | ------ | ------------------------------------- |
| E1  | Wishlist badge visible on shop page for wishlisted game (mocked `/api/wishlist`)    | `[AUTO]` | —      |        | `wishlist-badge.spec.js` (enhance)    |
| E2  | Wishlist badge absent for non-wishlisted game on same page                          | `[AUTO]` | —      |        | same spec                             |
| E3  | Wishlist badge NOT injected at all when logged out; no `/api/wishlist` request made | `[AUTO]` | —      |        | same spec                             |
| E4  | Philibert overlay: card renders when logged out; collection chips absent            | `[AUTO]` | —      |        | `philibert-overlay.spec.js` (enhance) |
| E5  | Philibert overlay: collection chips visible + save fires correct API when logged in | `[AUTO]` | —      |        | same spec                             |

---

## F · Context Menus

| #   | Test                                                                               | Type     | Linear | Status | Notes                             |
| --- | ---------------------------------------------------------------------------------- | -------- | ------ | ------ | --------------------------------- |
| F1  | "Extract from this page" → new tab at `boardgamematcher.com/extract?url=<pageUrl>` | `[AUTO]` | —      |        | `context-menus.spec.js` (enhance) |
| F2  | "Search 'X' on BGM" → new tab at `boardgamematcher.com/search?q=X`                 | `[AUTO]` | —      |        | same spec                         |
| F3  | "Extract from this link" → new tab with link href as `url` param                   | `[AUTO]` | —      |        | same spec                         |
| F4  | "Find in BGM extension" → popup opens pre-filled with selected text                | `[AUTO]` | —      |        | same spec                         |

---

## G · Cross-Browser `[MANUAL]`

> Install as unpacked / temporary add-on. No fixtures — real browser, real extension.

| #   | Test                                                                                                            | Status | Tester | Date | Notes |
| --- | --------------------------------------------------------------------------------------------------------------- | ------ | ------ | ---- | ----- |
| G1  | **Chrome**: install unpacked → popup opens, extract works, options accessible, wishlist badge renders on Amazon |        |        |      |       |
| G2  | **Firefox**: install as temporary add-on (MV3) → full smoke test (popup, options, context menu)                 |        |        |      |       |
| G3  | **Edge**: install unpacked → smoke test popup + context menus                                                   |        |        |      |       |

---

## H · Play Imports — Real Accounts `[MANUAL]`

> Must be logged in to BGM in the browser. Each platform requires a real account with at least 1 logged play.

| #   | Test                                                                                     | Status | Tester | Date | Notes |
| --- | ---------------------------------------------------------------------------------------- | ------ | ------ | ---- | ----- |
| H1  | **BGA**: navigate to BGA player stats page → click import → plays appear in BGM play log |        |        |      |       |
| H2  | **BGG**: import plays from BGG profile → verify count matches BGG                        |        |        |      |       |
| H3  | **Yucata**: import plays from Yucata profile                                             |        |        |      |       |
| H4  | **Tabletopia**: import plays from Tabletopia account                                     |        |        |      |       |
| H5  | **Ludopedia**: import plays from Ludopedia account                                       |        |        |      |       |
| H6  | **All platforms — logged out**: CTA "Sign in to BGM" shown (not an error or blank state) |        |        |      |       |

---

## I · Auth Session Lifecycle `[MANUAL]`

| #   | Test                                                                                | Status | Tester | Date | Notes |
| --- | ----------------------------------------------------------------------------------- | ------ | ------ | ---- | ----- |
| I1  | "Sign in" CTA opens BGM with `utm_source=extension&utm_medium=popup&utm_campaign=*` |        |        |      |       |
| I2  | Log in on BGM web → reopen popup → shows logged-in state (no manual action needed)  |        |        |      |       |
| I3  | Log out on BGM web → reopen popup → shows logged-out state                          |        |        |      |       |

---

## J · Background Notifications `[MANUAL]`

> Requires a real BGM account with another account triggering the event (or admin tooling).

| #   | Test                                                          | Status | Tester | Date | Notes |
| --- | ------------------------------------------------------------- | ------ | ------ | ---- | ----- |
| J1  | Unread message → browser notification fires with sender name  |        |        |      |       |
| J2  | Friend request received → browser notification fires          |        |        |      |       |
| J3  | New player match → browser notification fires                 |        |        |      |       |
| J4  | News/announcement published → browser notification fires      |        |        |      |       |
| J5  | Clicking any notification → navigates to the correct BGM page |        |        |      |       |

---

## K · Internationalisation `[MANUAL]`

| #   | Test                                                                                          | Status | Tester | Date | Notes |
| --- | --------------------------------------------------------------------------------------------- | ------ | ------ | ---- | ----- |
| K1  | Switch to **French** in options → entire popup UI (all tabs, tooltips, CTAs) fully translated |        |        |      |       |
| K2  | Switch to **German**, **Spanish**, **Italian** → spot-check 10+ key strings per locale        |        |        |      |       |
| K3  | Language preference persists after browser restart                                            |        |        |      |       |

---

## L · Real Shop Extraction `[MANUAL]`

> Use a live browser session. Verify both the badge and the extraction flow.

| #   | Test                                                                                               | Status | Tester | Date | Notes |
| --- | -------------------------------------------------------------------------------------------------- | ------ | ------ | ---- | ----- |
| L1  | **Amazon**: wishlist badge on known game; extraction picks up board game titles from category page |        |        |      |       |
| L2  | **Fnac**: extraction happy path on a board games category page                                     |        |        |      |       |
| L3  | **Coolshop**: extraction happy path                                                                |        |        |      |       |
| L4  | **Next.js shop** (Veepee / Privalia): `__NEXT_DATA__` strategy extracts titles correctly           |        |        |      |       |

---

## M · Pre-Release Checklist `[MANUAL]`

| #   | Check                                                                                                                        | Status | Notes |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| M1  | Extension zip size: Chrome < 10 MB, Firefox < 200 MB                                                                         |        |       |
| M2  | `manifest.json` passes [Chrome MV3 validator](https://developer.chrome.com/docs/extensions/mv3/manifest/)                    |        |       |
| M3  | Zero `console.error` on popup open (Chrome DevTools → inspect popup)                                                         |        |       |
| M4  | Chrome Web Store listing: title ≤ 45 chars, short description ≤ 132 chars, 5 screenshots at 1280×800, privacy policy URL set |        |       |
| M5  | Firefox AMO listing: description complete, icon uploaded, source code uploaded if required                                   |        |       |
| M6  | Privacy policy reviewed; extension requests only permissions declared in `manifest.json`                                     |        |       |
| M7  | All strings in `_locales/en/messages.json` have a value (no empty strings)                                                   |        |       |
| M8  | `version` in `manifest.json` and `package.json` match and follow semver                                                      |        |       |

---

## Automated spec map

| Spec file                         | New / Enhance | Covers    |
| --------------------------------- | ------------- | --------- |
| `popup-logged-out.spec.js`        | **New**       | A1–A4     |
| `popup-logged-in.spec.js`         | **New**       | B1–B3     |
| `popup-games-tab.spec.js`         | **New**       | B4–B6     |
| `popup-dashboard.spec.js`         | **New**       | B7        |
| `popup-more.spec.js`              | **New**       | B8        |
| `popup-knapix-happy-path.spec.js` | Enhance       | C1–C2     |
| `popup-extract-review.spec.js`    | **New**       | C3–C4, C6 |
| `popup-supported-sites.spec.js`   | Enhance       | C5        |
| `options-notifications.spec.js`   | **New**       | D1–D3     |
| `options-custom-patterns.spec.js` | Enhance       | D4–D6     |
| `wishlist-badge.spec.js`          | Enhance       | E1–E3     |
| `philibert-overlay.spec.js`       | Enhance       | E4–E5     |
| `context-menus.spec.js`           | Enhance       | F1–F4     |

**Automated total:** 22 test groups across 13 spec files (6 new, 7 enhanced).  
**Manual total:** 28 test cases across 7 areas.  
**Grand total: 50 test cases.**

---

## API mock reference

All `[AUTO]` tests use Playwright's `page.route()` / `context.route()` to intercept BGM API calls. No real BGM session is ever needed.

| Endpoint                          | Mock response shape                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /api/me`                     | `{ id, username, display_name, avatar_url, preferred_language }` or 401                               |
| `GET /api/messages/unread`        | `{ count: N, senders: ["Alice"] }`                                                                    |
| `GET /api/games/search?q=*`       | `[{ id, name, cover_url, min_players, max_players, min_duration, max_duration, weight, bgm_rating }]` |
| `POST /api/collections/:id/:type` | `{ ok: true }`                                                                                        |
| `GET /api/wishlist`               | `[{ bgg_id, name }]`                                                                                  |
| `GET /api/matches/pending`        | `{ count: N }`                                                                                        |
| `PATCH /api/profile`              | `{ ok: true }`                                                                                        |
| `POST /api/extract/extension`     | `{ url: "https://boardgamematcher.com/extract/abc123" }`                                              |

---

## How to run

```bash
# Automated (headless CI)
npm run test:e2e

# Automated (headed, UI mode — useful while writing new specs)
npm run test:e2e:ui

# Unit tests (Jest)
npm test
```

---

_Last updated: 2026-05-09. Update Status column as tests are completed._
