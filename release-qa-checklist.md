# Release QA — v___________

**Date:** ___________

> **Automated tests** (`npm run test:e2e` + `npm test`) must be green before starting this checklist.
> Check every box or leave a note explaining why it was skipped.

---

## G · Cross-browser load

- [ ] **Chrome** — load unpacked → popup opens, no console errors
- [ ] **Firefox** — install as temporary add-on → popup opens, no console errors
- [ ] **Edge** — load unpacked → popup opens, no console errors

## H · Header

- [ ] Theme toggle (☽) switches dark ↔ light instantly
- [ ] Settings (⚙) opens the options page
- [ ] User avatar visible when logged in, hidden when logged out
- [ ] Unread-messages banner appears with correct count when messages exist; hidden otherwise
- [ ] Clicking the banner navigates to the BGM messages page

## I · Extract tab — Shop scanner

- [ ] On an unsupported page: strip shows "Visit a supported shop to activate", Extract button disabled
- [ ] On a supported shop page: shop name shown in strip, Extract button enabled
- [ ] Extract → review card overlays with game list and item count
- [ ] Review card: All / New only / None toggles select/deselect correctly
- [ ] Confirm → success card shows count and "View results on BGM →" link
- [ ] "Extract again" button returns to extract tab
- [ ] Back arrow on review card cancels and returns to extract tab
- [ ] Bulk-extract flow (paginated shop): progress bar advances, cancel button stops crawl

## J · Extract tab — Play history (real accounts)

- [ ] **BGA** — navigate to BGA player stats page → panel appears → Import → plays reach BGM, count matches, no duplicates on re-import
- [ ] **BGG** — navigate to BGG profile → panel appears → Import → count matches BGG XML API
- [ ] **Yucata** — navigate to Yucata profile → panel appears → Import → status updates
- [ ] **Tabletopia** — navigate to Tabletopia matches page → panel appears → Import → status updates
- [ ] **Ludopedia** — navigate to Ludopedia → panel appears → Import → status updates
- [ ] **Logged-out CTA** — on every platform page, "Sign in to BGM" shown instead of import button; no import triggered

## K · Games tab

- [ ] **Logged out** — login card shown with feature bullets; Sign in + Create account buttons visible; search hidden
- [ ] **Logged in, neutral page** — search input visible with correct placeholder; collection chips render
- [ ] Typing a game name → results list appears
- [ ] Clicking a result → game detail card shows: cover, name, year, player count / duration specs, BGM star rating
- [ ] No personal rating → "Rate on BGM →" link shown instead
- [ ] "Your stats" block appears when play data exists
- [ ] Arrow nav (← →) between results in detail card
- [ ] Collection chip not active → clicking it fires POST and chip activates
- [ ] Collection chip already active → clicking it fires DELETE and chip deactivates
- [ ] "View on BoardGameMatcher →" link present and correct
- [ ] Wishlist count + "View collection →" link shown in footer
- [ ] **Logged in, shop page** — shop sign-in nudge hidden; search and chips visible normally

## L · Dashboard tab

- [ ] **Logged out** — signed-out card shown; Sign in + Create account buttons visible
- [ ] **Logged in** — Messages row visible; unread badge appears when count > 0
- [ ] Matches row visible with correct sub-text
- [ ] Notifications row visible
- [ ] Quick links — Home, Collections, Wishlist all render and open the correct BGM pages

## M · More tab

- [ ] "Import your plays" → navigates to Extract tab and scrolls to play-history strip
- [ ] "Suggest a new shop" → opens BGM contact URL in new tab
- [ ] "Rate this extension" → opens Chrome Web Store / Firefox AMO page
- [ ] "What's new" → opens changelog
- [ ] "Send feedback" → opens BGM contact URL in new tab
- [ ] "Help & documentation" → opens README in new tab
- [ ] "Settings" → opens options page
- [ ] "Privacy" → opens PRIVACY.md in new tab
- [ ] Version number matches `manifest.json`

## N · Options page

- [ ] Page opens from header ⚙ and from More → Settings
- [ ] Language selector present; selecting a language updates the popup UI immediately
- [ ] Language choice syncs to BGM and persists after browser restart
- [ ] Notification toggles: disabling a type → no browser notification fires for it
- [ ] Custom Patterns tab hidden by default; developer-mode toggle reveals it
- [ ] Custom pattern CRUD: create → edit → delete round-trip works
- [ ] Export / import pattern JSON round-trip works

## O · Wishlist badges & content overlays

- [ ] **Amazon** — wishlist badge visible next to wishlisted game titles on search/listing page; absent when wishlist is empty
- [ ] **Philibert product page** — BGM overlay renders with correct game info
- [ ] **Philibert non-product page** — no overlay rendered
- [ ] **Coolshop** — wishlist badge visible on board-games listing
- [ ] **Fnac** — badge visible on board-games search results

## P · Context menus

- [ ] All expected items registered (right-click shows BGM entries)
- [ ] "Search BGM" (text selection) → opens /search?q=\<query\> in BGM
- [ ] "Extract from this page" → opens /extract?url=\<pageUrl\> in BGM
- [ ] "Extract from this link" (link right-click) → opens /extract?url=\<linkUrl\>
- [ ] "Find in BGM extension" → stashes query; popup opens with it pre-filled
- [ ] "Extract URL from selection" → only fires when selected text looks like a URL

## Q · Background notifications

- [ ] Unread message → browser notification fires with sender name
- [ ] Friend request → browser notification fires
- [ ] New player match → browser notification fires
- [ ] News / announcement → browser notification fires
- [ ] Clicking any notification → navigates to the correct BGM page
- [ ] Disabled notification type (Options toggle off) → no notification fired

## R · Internationalisation

- [ ] **French** — entire popup UI translated (all tabs, tooltips, CTAs, error messages)
- [ ] **German** — spot-check 10+ key strings
- [ ] **Spanish** — spot-check 10+ key strings
- [ ] **Italian** — spot-check 10+ key strings
- [ ] Language preference persists after browser restart
- [ ] No raw i18n keys or empty strings visible in any locale

## S · Pre-Release

- [ ] Extension zip < 10 MB (Chrome); Firefox zip < 200 MB
- [ ] `manifest.json` version and `package.json` version match
- [ ] `manifest.json` passes Chrome MV3 validator
- [ ] All declared `permissions` and `host_permissions` are actually used
- [ ] Zero `console.error` on popup open
- [ ] `PRIVACY.md` accurately describes all data sent to BGM; no third-party data sharing
- [ ] **Chrome Web Store** — name ≤ 45 chars, short description ≤ 132 chars, 5 screenshots (1280×800), promo tile (440×280), privacy policy URL, permission justifications
- [ ] **Firefox AMO** — `gecko.id` + `strict_min_version` set in manifest, `web-ext lint` passes, source zip prepared

---

## Notes / skipped items

_Explain any skipped checkboxes or issues found._

&nbsp;

&nbsp;

&nbsp;
