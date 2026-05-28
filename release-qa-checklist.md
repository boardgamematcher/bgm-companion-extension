# BGM Companion — Release QA v0.7.2

**Date:** ___________  
**Tester:** ___________  
**Score:** _____ / 900 XP

> Before you roll the dice: **CI must be green** (`npm test` + `npm run test:e2e`).  
> Each checkbox = 10 XP. Boss fights = 30 XP each. Full clear = 900 XP + achievement unlocked.

---

## LEVEL 1 · Boot Sequence `[___ / 80 XP]`

*The extension wakes up. Make sure it's alive.*

- [ ] Load unpacked in **Chrome** → popup opens, zero console errors
- [ ] Load unpacked in **Edge** → popup opens, zero console errors
- [ ] Extension icon is pinned in the toolbar and shows the BGM logo
- [ ] `manifest.json` version = **0.7.2** and matches `package.json`
- [ ] Zero `console.error` on popup open (check DevTools)
- [ ] Theme toggle (☽) switches dark ↔ light instantly
- [ ] Settings (⚙) opens the options page
- [ ] User avatar visible when logged in, hidden when logged out

**Level 1 complete → unlock: LEVEL 2** 🔓

---

## LEVEL 2 · Shop Scanner — Search Page `[___ / 150 XP]`

*This is the big new feature in this release. Test it first.*

URL: `https://ludiprix.fr/item/search/?tags=2`

- [ ] Shop name "Ludiprix" shown in the strip, Extract button enabled
- [ ] Clicking Extract → button shows `…` immediately (loading feedback)
- [ ] BGM results tab opens automatically — no review panel shown in between
- [ ] Results page shows **only the results table** — no extraction form, no header
- [ ] Breadcrumb ("Home / Game Extractor") is hidden on the results page
- [ ] Count of matched games is reasonable (10–20)
- [ ] Refreshing the results page does **not** show "No URL or text provided" error
- [ ] Closing the popup and reopening on the same page → Extract works again

> **BOSS FIGHT (30 XP)** — Extract on a search page while **logged out**  
> Expected: review panel appears as fallback (no auto-extract without auth)
- [ ] Boss defeated

**Level 2 complete → unlock: LEVEL 3** 🔓

---

## LEVEL 3 · Shop Scanner — Product Page `[___ / 120 XP]`

URL: `https://ludiprix.fr/item/show/55129/hamlet`

- [ ] Shop name shown, Extract enabled
- [ ] Clicking Extract → popup closes immediately, BGM page for **Hamlet: The Village Building Game** opens in a new tab (no review panel)
- [ ] The BGM page is the correct Hamlet game (bgg_id 276086), not a different one
- [ ] Success message reads **"1 game matched"** (not "1 game added to BGM")

> **BOSS FIGHT (30 XP)** — Test a product page **without** a BGG link (paste this into the browser console to simulate: open any non-BGG ludiprix page). Expected: review panel appears with the game name to confirm.

- [ ] Boss defeated

Try a second supported shop (your choice):

- [ ] Shop name detected correctly on a non-ludiprix shop page
- [ ] Extract → auto-extract or review panel depending on match confidence
- [ ] Games land correctly on BGM

**Level 3 complete → unlock: LEVEL 4** 🔓

---

## LEVEL 4 · Review Panel (Fallback Mode) `[___ / 80 XP]`

*The review panel still exists for ambiguous cases. Make sure it works.*

- [ ] All / New only / None toggles select/deselect correctly
- [ ] "Add to BGM" button disabled when 0 games checked, enabled otherwise
- [ ] Confirming 1 matched game → opens its BGM page directly in a new tab
- [ ] Confirming multiple games → opens BGM results page directly
- [ ] Back arrow (←) cancels and returns to extract tab with button re-enabled
- [ ] "Extract again" button on success card works

**Level 4 complete → unlock: LEVEL 5** 🔓

---

## LEVEL 5 · Play History Import `[___ / 130 XP]`

*Platforms that matter to real users.*

- [ ] **BGA** — navigate to BGA player stats page → panel appears → Import → plays reach BGM, no duplicates on re-import
- [ ] **BGG** — navigate to BGG profile → panel appears → Import → count matches BGG XML API
- [ ] **Yucata** — panel appears on Yucata profile → Import → status updates correctly
- [ ] **Tabletopia** — panel appears → Import → status updates
- [ ] **Ludopedia** — panel appears → Import → status updates
- [ ] **Logged-out CTA** — "Sign in to BGM" shown on every platform page instead of import button; no import triggered

> **BONUS (30 XP)** — Re-import BGA with the same account. Confirm no duplicate plays added.
- [ ] Bonus claimed

**Level 5 complete → unlock: LEVEL 6** 🔓

---

## LEVEL 6 · Games Tab `[___ / 100 XP]`

- [ ] **Logged out** — login card with feature bullets; Sign in + Create account visible
- [ ] **Logged in** — search input and collection chips visible
- [ ] Typing a game name → results appear
- [ ] Clicking a result → game detail card: cover, name, year, specs, BGM rating
- [ ] No personal rating → "Rate on BGM →" link shown
- [ ] "Your stats" block appears when play history exists
- [ ] Arrow nav (← →) between results works
- [ ] Collection chip click → activates chip and fires correct POST
- [ ] Already active chip → click deactivates and fires DELETE
- [ ] "View on BoardGameMatcher →" link present and correct

**Level 6 complete → unlock: LEVEL 7** 🔓

---

## LEVEL 7 · Dashboard + More `[___ / 80 XP]`

- [ ] **Dashboard logged out** — sign-in card with buttons
- [ ] **Dashboard logged in** — Messages, Matches, Notifications rows with correct counts
- [ ] Quick links (Home, Collections, Wishlist) open correct BGM pages
- [ ] More → "Suggest a new shop" → correct URL in new tab
- [ ] More → "Rate this extension" → Chrome Web Store page
- [ ] More → "What's new" → changelog opens
- [ ] More → "Send feedback" → BGM contact URL
- [ ] Version in More tab = **0.7.2**

**Level 7 complete → unlock: LEVEL 8** 🔓

---

## LEVEL 8 · Wishlist Badges + Overlays `[___ / 90 XP]`

- [ ] **Amazon** — badge visible next to wishlisted game on search/listing page
- [ ] **Philibert product page** — BGM overlay renders with correct game info
- [ ] **Philibert non-product page** — no overlay rendered
- [ ] **BGA game panel** (`boardgamearena.com/gamepanel?game=<slug>`) — BGM overlay renders with correct game info
- [ ] **BGA non-gamepanel page** — no overlay shown on lobby or other BGA pages
- [ ] **Coolshop** — badge visible on board-games listing
- [ ] **Fnac** — badge visible on board-games search results
- [ ] No JavaScript errors on badge-injected pages

> **BONUS (20 XP)** — Add a game to wishlist, reload Amazon, confirm badge appears without page refresh
- [ ] Bonus claimed

**Level 8 complete → unlock: FINAL BOSS** 🔓

---

## FINAL BOSS · Pre-Release Checklist `[___ / 90 XP]`

*You're this close. Don't fumble it.*

- [ ] Extension zip < 10 MB
- [ ] `manifest.json` version = `package.json` version = **0.7.2**
- [ ] `manifest.json` passes Chrome MV3 validator (`chrome://extensions` shows no warnings)
- [ ] All declared `permissions` and `host_permissions` are actually used (check manifest vs code)
- [ ] `PRIVACY.md` accurately reflects all data sent to BGM; no third-party sharing
- [ ] **French** UI fully translated (all tabs, tooltips, error messages)
- [ ] **German** spot-check: 10+ strings correct
- [ ] Bulk-extract flow (paginated shop): progress bar advances, cancel stops crawl
- [ ] Context menu "Extract from this page" → opens BGM `/extract?url=…`

> **BOSS FIGHT (30 XP)** — Chrome Web Store checklist  
> - Name ≤ 45 chars  
> - Short description ≤ 132 chars  
> - 5 screenshots (1280×800 or 640×400)  
> - Promo tile (440×280)  
> - Privacy policy URL set  
> - Permission justifications written  
- [ ] Boss defeated — store listing ready

---

## TOTAL SCORE

| Level | Name | Max XP | Your XP |
|-------|------|--------|---------|
| 1 | Boot Sequence | 80 | |
| 2 | Search Page (new!) | 150 | |
| 3 | Product Page (new!) | 120 | |
| 4 | Review Panel | 80 | |
| 5 | Play History | 130 | |
| 6 | Games Tab | 100 | |
| 7 | Dashboard + More | 80 | |
| 8 | Badges + Overlays | 90 | |
| Final | Pre-Release | 90 | |
| **TOTAL** | | **920** | |

### Achievements

- [ ] **Speedrunner** — Complete levels 1–4 in under 20 minutes
- [ ] **No Bug Left Behind** — Found and reported at least 1 issue
- [ ] **Polyglot** — Verified French + German + Spanish in one session
- [ ] **Full Clear** — 900 / 900 XP — you may submit to the Chrome Store

---

## Notes / Issues Found

| # | Level | Description | Severity |
|---|-------|-------------|----------|
| 1 | | | |
| 2 | | | |
| 3 | | | |
