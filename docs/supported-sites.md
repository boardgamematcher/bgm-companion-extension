# Supported sites & extension actions

Reference for v0.7.1.

This document lists every external site the extension touches, every action the user can trigger, and every BoardGameMatcher endpoint hit by each action.

**Partially auto-generated.** The four mechanical tables — §1.1 sites table, §1.2 retail brands, §2 context-menu actions, §3.6 background polls — are regenerated from `manifest.json`, `src/background/service-worker.js`, and a small editorial map kept in `scripts/gen-supported-sites.mjs`. Run `npm run docs:sites` after touching any of those sources; CI runs `npm run docs:sites:check` to fail when the committed file drifts. Editorial sections (§3.1–3.5, §3.7, §4) and all narrative outside the `<!-- AUTO:* -->` fences are hand-maintained.

---

## 1. Sites with in-page integrations

For each row: "On-page extraction?" means a content script runs in the user's tab and reads the DOM (or calls the site's own API from the page). "Action in extension" describes what the popup or background actually does.

### 1.1 Play-import platforms & overlays

<!-- AUTO:sites-table START -->
| Site | Page type | Example URL | On-page extraction? | Action in extension | Mechanism |
|---|---|---|---|---|---|
| Yucata | Game History | `https://www.yucata.de/.../GameHistory` | Yes — `src/content/yucata-scraper.js` | Popup → "Import Yucata Plays" | Page-context script needed for DataTable API; mapping via `yucata-mapping.json` |
| Board Game Arena | Player stats / profile | `https://boardgamearena.com/gamestats?player=123` | Yes — `src/content/bga-scraper.js` | Popup → "Import BGA Plays" → POST plays to BGM | Content script calls BGA's internal AJAX with the page's request token; mapping via `patterns/bga-mapping.json` |
| BoardGameGeek | User plays / collection / game detail | `https://boardgamegeek.com/user/<u>/plays` | Yes — `src/content/bgg-scraper.js` | Popup → "Import BGG Plays" / "Sync BGG Collection"; on game detail pages popup auto-targets the game (one-click add to BGM collection) | Calls BGG XML2 API `/xmlapi2/user/<u>/{plays,collection}`; on `/boardgame/<id>/<slug>` pages the popup runs `/api/games/search` then `/api/collections/{id}/{type}` |
| Tabletopia | Any page when logged in | `https://tabletopia.com/...` | Yes — `src/content/tabletopia-scraper.js` | Popup → "Import Tabletopia Matches" | Calls Tabletopia REST `/api/v2/players/current/matches` with pagination |
| Ludopedia | User history | `https://ludopedia.com.br/usuario/...` | Yes — `src/content/ludopedia-scraper.js` | Popup → "Import Ludopedia Plays" | Calls Ludopedia `/api/v1/plays`; BGG IDs already in payload |
| Philibert (game-detail overlay) | Product detail | `https://www.philibertnet.com/{lang}/cat/<id>-<slug>.html` | Yes — `src/content/game-overlay.js` | Inline overlay: BGM card, rating, wishlist status; per-user collection pills when logged in | Reads page metadata, resolves via `resolveOverlayGame` background message, posts to `/api/collections/<id>/<type>` |
<!-- AUTO:sites-table END -->

Notes:

- The `bga-playerstat-scraper.js` prototype (BGM-789) is **not yet wired in `manifest.json`** and intentionally absent from the generated table.

All play imports POST the parsed list to `boardgamematcher.com/api/plays/batch` (overridable via `chrome.storage.local.apiUrl` for dev). Login on BGM is required for the POST to succeed.

### 1.2 Retail / e-commerce

All sites in this group share the same flow:

1. Two content scripts auto-load on every matched URL: `content-script.js` (extraction, runs on demand) and `wishlist-badge.js` + CSS (read-only "✓ on your wishlist" badge, runs at `document_idle`).
2. The user opens the popup and clicks **Extract**. The popup runs the right pattern from `patterns/built-in.json`, the public [`site-profiles`](https://github.com/boardgamematcher/site-profiles) repo (refreshed every 6 h), or a user-defined custom pattern (the Custom Patterns tab is hidden by default — flip "Developer mode" in the Help tab to expose it).
3. Matched titles + prices are previewed via `POST /api/extract/preview`, then on confirm sent to `POST /api/extract/extension`. On any failure the popup falls back to opening `boardgamematcher.com/extract?url=<page>` so the BGM web extractor takes over.

<!-- AUTO:retail-brands START -->
**60 retail domains in `manifest.json`**, grouped by brand:

| Brand | Domains | Notes |
|---|---|---|
| Amazon (16) | amazon.at, amazon.be, amazon.ca, amazon.co.jp, amazon.co.uk, amazon.com, amazon.com.au, amazon.com.br, amazon.com.mx, amazon.de, amazon.es, amazon.fr, amazon.it, amazon.nl, amazon.pl, amazon.se |  |
| Coolshop (10) | coolshop.co, coolshop.com, coolshop.de, coolshop.dk, coolshop.fi, coolshop.is, coolshop.nl, coolshop.no, coolshop.pl, coolshop.se | Generic card selector across all 10 ccTLDs |
| Veepee (9) | privalia.com, veepee.at, veepee.be, veepee.de, veepee.es, veepee.fr, veepee.it, veepee.lu, veepee.nl | Reads `__NEXT_DATA__` JSON; Privalia (`.es`, `.it`) shares the same Veepee back-end and is grouped here |
| Board Game Bliss (1) | boardgamebliss.com |  |
| bol.com (1) | bol.com |  |
| Brettspielversand (1) | brettspielversand.de |  |
| Coolstuff Inc. (1) | coolstuffinc.com |  |
| Cultura (1) | cultura.com |  |
| Esprit Jeu (1) | espritjeu.com |  |
| Fantasywelt (1) | fantasywelt.de |  |
| Fnac (1) | fnac.com |  |
| Game Nerdz (1) | gamenerdz.com |  |
| Gamer's Dream (1) | gamersdream.shop |  |
| Knapix (1) | knapix.com |  |
| Kutami (1) | kutami.de |  |
| Le Passe-Temps (1) | le-passe-temps.com |  |
| Le Pion (1) | lepion.com |  |
| Ludifolie (1) | ludifolie.com |  |
| Ludisphère (1) | ludisphere.fr |  |
| Ludum (1) | ludum.fr |  |
| Milan Spiele (1) | milan-spiele.de |  |
| Miniature Market (1) | miniaturemarket.com |  |
| Okkazeo (1) | okkazeo.com |  |
| Philibert (1) | philibertnet.com | **Plus** a separate game-detail overlay (`game-overlay.js`) on `/{lang}/cat/<id>-…html` — see the platforms table above |
| Spiele-Offensive (1) | spiele-offensive.de |  |
| Spieletaxi (1) | spieletaxi.de |  |
| Thalia (1) | thalia.de |  |
| Zatu (1) | board-game.co.uk |  |
<!-- AUTO:retail-brands END -->

---

## 2. Context-menu actions (any site, no host permission)

Wired in `src/background/service-worker.js`. Every item is a redirect to `boardgamematcher.com` except the popup-opener.

<!-- AUTO:context-menus START -->
| Menu item | Visible on | Behavior |
|---|---|---|
| Extract Board Games from this page | page right-click | Opens `boardgamematcher.com/extract?url=<pageUrl>` |
| Extract Board Games from this link | link right-click | Opens `…/extract?url=<linkUrl>` |
| Search "%s" on BoardGameMatcher | text selection | Opens `…/search?q=<selection>` |
| Extract Board Games from this URL | text selection that **is** a URL (Firefox-only auto-hide) | Opens `…/extract?url=<selection>` |
| Find "%s" in BGM extension | text selection | Opens the extension popup pre-filled with the query (falls back to `…/search?q=` if `chrome.action.openPopup()` is unsupported) |
<!-- AUTO:context-menus END -->

---

## 3. Extension actions and the BGM URLs they hit

All BGM endpoints below are under `https://boardgamematcher.com` (or `chrome.storage.local.apiUrl` if set, applied only to play imports). Browser-tab navigations include `?utm_source=extension&utm_medium=popup&utm_campaign=<campaign>`.

### 3.1 Popup — always-on

| Action       | What the user sees | URL hit                                   | Auth required?                                                      |
| ------------ | ------------------ | ----------------------------------------- | ------------------------------------------------------------------- |
| Open popup   | Auth check on load | `GET /api/me`                             | No (returns 401 if logged out, popup switches to logged-out layout) |
| Sign in      | Bottom CTA         | Opens tab `/auth/login`                   | —                                                                   |
| Sign up      | Bottom CTA         | Opens tab `/auth/register`                | —                                                                   |
| Avatar click | Top-right avatar   | Opens tab `/users/<username>`             | Logged in                                                           |
| Theme toggle | 🌙/☀️ button       | Local only (`chrome.storage.local.theme`) | No                                                                  |
| Settings     | ⚙️ button          | Opens extension `options.html`            | No                                                                  |

### 3.2 Popup — Extract tab (shop sites)

| Action                                            | URL hit                                           | Auth required?                       | Notes                                                                                                |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Click **Extract** → preview                       | `POST /api/extract/preview`                       | Optional                             | Logged-out users still get a preview; on any error popup falls back to opening `/extract?url=<page>` |
| Confirm extraction                                | `POST /api/extract/extension`                     | Logged in for the result to be saved | Returns `job_id`; success card links to `/extract?job=<jobId>`                                       |
| Wishlist badges on shop pages                     | `GET /api/me/wishlist` (cached in service worker) | Logged in                            | Without login, no badges render                                                                      |
| "View collection" link (bottom nav on shop pages) | Opens tab `/collections/<username>`               | Logged in                            |                                                                                                      |

### 3.3 Popup — Extract tab (play platforms)

| Action              | URL hit                           | Auth required? |
| ------------------- | --------------------------------- | -------------- |
| BGA stats summary   | `GET /api/plays/summary`          | Yes            |
| BGG collection sync | `POST /api/bgg/import-collection` | Yes            |

### 3.4 Popup — Wishlist tab (game search & quick-add)

| Action                                                                         | URL hit                                                                                    | Auth required?                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Type in search box                                                             | `GET /api/games/search?q=<q>`                                                              | No (search works logged out, but pills hidden) |
| Open game detail card                                                          | `GET /api/collections/<gameId>` (read user's current types)                                | Yes                                            |
| Toggle a collection pill (own/played/wishlist/wanttoplay/wanttolearn/canteach) | `POST` or `DELETE /api/collections/<gameId>/<type>`                                        | Yes                                            |
| "Add" button                                                                   | `POST /api/collections/<gameId>/<type>` × selected types                                   | Yes                                            |
| Open game on BGM (CTA / "rate this")                                           | Opens tab `/{lang}/game/<slug>` (localized: en→game, fr→jeu, de→spiel, es→juego, it→gioco) | —                                              |

### 3.5 Popup — Dashboard tab (logged-in)

| Action                              | URL hit                                                                 | Auth required? |
| ----------------------------------- | ----------------------------------------------------------------------- | -------------- |
| Dashboard load — matches tile       | `GET /api/matches/new`                                                  | Yes            |
| Dashboard load — notifications tile | `GET /api/notifications/count`                                          | Yes            |
| Messages tile / banner              | reads `chrome.storage.local.unreadMessages` (filled by background poll) | Yes            |
| Click messages                      | Opens tab `/messages`                                                   | —              |
| Click matches                       | Opens tab `/play/players`                                               | —              |
| Click notifications                 | Opens tab `/notifications`                                              | —              |
| Quick links                         | Opens tab `/`, `/collections/<u>`, `/collections/<u>?type=wishlist`     | —              |

### 3.6 Background service worker — periodic polls

Polls run on `chrome.alarms` regardless of login state, but every endpoint requires the BGM session cookie, so logged-out users get 401 and no notification fires.

<!-- AUTO:bg-polls START -->
| Alarm | Period | Endpoint | Notification on hit | Click destination |
|---|---|---|---|---|
| News | every 1 h | `GET /api/news/latest` | "New on BGM: …" | `/news/<slug>` |
| Friend requests | every 5 min | `GET /api/friends/pending-summary` | "X new friend request(s)" | `/friends` |
| New matches | every 1 h | `GET /api/matches/new` | "X new match(es)" | `/play` |
| Session invites | every 5 min | `GET /api/sessions/invites/pending` | "Invited to <session>" | `/play/sessions/<id>` |
| Unread messages | every 1 min | `GET /api/messages/unread-summary` | "X unread message(s)" | `/messages` |
<!-- AUTO:bg-polls END -->

Wishlist refresh is also serviced by the background — see §3.7 / overlay messages — but is request-driven, not alarm-driven, so it's not in the table above.

The service worker also exposes message handlers used by the Philibert overlay and the wishlist badge:

| Background message                  | URL hit                                                            | Auth required?                                            |
| ----------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| `resolveOverlayGame`                | `GET /api/games/search?q=<title>` then `GET /api/collections/<id>` | Search works logged out; collection types only with login |
| `setCollectionType` (overlay pills) | `POST` or `DELETE /api/collections/<gameId>/<type>`                | Yes                                                       |

### 3.7 Direct on-page links (no popup)

| Surface                              | Destination                     |
| ------------------------------------ | ------------------------------- |
| Wishlist badge on shop product card  | `/boardgames/<slug>` (no UTM)   |
| Philibert game overlay — title / CTA | `/{lang}/game/<slug>`           |
| Philibert game overlay — brand link  | `https://boardgamematcher.com`  |
| BGG sync clear → "log in to BGG"     | `https://www.boardgamegeek.com` |

---

## 4. Logged-in vs logged-out summary

| Capability                            | Logged out                                  | Logged in                                      |
| ------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Extract from shops (preview)          | ✅ falls back to `/extract?url=` on website | ✅ inline preview + save to BGM                |
| Wishlist badges on shop pages         | ❌                                          | ✅                                             |
| Philibert game overlay (rating, name) | ✅ public data only                         | ✅ + per-user collection pills                 |
| Game search in popup                  | ✅                                          | ✅                                             |
| Quick-add to collection               | ❌                                          | ✅                                             |
| Play imports (BGA, Yucata, …)         | ❌                                          | ✅                                             |
| BGG collection sync                   | ❌                                          | ✅                                             |
| Background polls / notifications      | no-op (401)                                 | ✅ news, friends, matches, sessions, messages  |
| Dashboard tiles                       | sign-in CTA                                 | matches / notifications / messages live counts |
| Context-menu redirects                | ✅ (open BGM page)                          | ✅                                             |
