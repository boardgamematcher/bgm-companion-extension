# Supported sites & extension actions

Reference for v0.7.1.

This document lists every external site the extension touches, every action the user can trigger, and every BoardGameMatcher endpoint hit by each action. Hand-maintained — see [BGM-1009](https://linear.app/board-game-matcher/issue/BGM-1009/auto-generate-docssupported-sitesmd-from-manifest-patterns) for the long-term plan to auto-generate it from `manifest.json` + `patterns/built-in.json`.

---

## 1. Sites with in-page integrations

For each row: "On-page extraction?" means a content script runs in the user's tab and reads the DOM (or calls the site's own API from the page). "Action in extension" describes what the popup or background actually does.

### 1.1 Play-import platforms

| Site | Page type | Example URL | On-page extraction? | Action in extension | Mechanism |
|---|---|---|---|---|---|
| Board Game Arena | Player stats / profile | `https://boardgamearena.com/gamestats?player=123` | Yes — `src/content/bga-scraper.js` | Popup → "Import BGA Plays" → POST plays to BGM | Content script calls BGA's internal AJAX with the page's request token; mapping via `patterns/bga-mapping.json` |
| Board Game Arena (spike) | Playerstat page | `boardgamearena.com/playerstat` | Prototype only | — | `bga-playerstat-scraper.js` (BGM-789) — **not yet wired in `manifest.json`** |
| Yucata | Game History | `https://www.yucata.de/.../GameHistory` | Yes — `yucata-scraper.js` + injected `yucata-page-extract.js` | Popup → "Import Yucata Plays" | Page-context script needed for DataTable API; mapping via `yucata-mapping.json` |
| Tabletopia | Any page when logged in | `https://tabletopia.com/...` | Yes — `tabletopia-scraper.js` | Popup → "Import Tabletopia Matches" | Calls Tabletopia REST `/api/v2/players/current/matches` with pagination |
| Ludopedia | User history | `https://ludopedia.com.br/usuario/...` | Yes — `ludopedia-scraper.js` | Popup → "Import Ludopedia Plays" | Calls Ludopedia `/api/v1/plays`; BGG IDs already in payload |
| SpielByWeb | Finished games list | `https://www.spielbyweb.de/GameList.php` | Yes — `spielbyweb-scraper.js` | Popup → "Import SpielByWeb Plays" | DOM table parser, mapping via `spielbyweb-mapping.json` |
| BoardGameGeek | User plays | `https://boardgamegeek.com/user/<u>/plays` | Yes — `bgg-scraper.js` | Popup → "Import BGG Plays" | Calls BGG XML2 API `/xmlapi2/user/<u>/plays` |
| BoardGameGeek | User collection | `.../user/<u>/collection` | Yes — same scraper | Popup → "Sync BGG Collection" | XML2 `/xmlapi2/collection/<u>` |
| BoardGameGeek | Game detail page | `.../boardgame/<id>/<slug>` | UI injection (BGM-937) | Popup auto-targets the game; one-click add to BGM collection | Title detected, popup runs `/api/games/search` then `/api/collections/{id}/{type}` |

All play imports POST the parsed list to `boardgamematcher.com/api/plays/batch` (overridable via `chrome.storage.local.apiUrl` for dev). Login on BGM is required for the POST to succeed.

### 1.2 Retail / e-commerce

All sites in this group share the same flow:

1. Two content scripts auto-load on every matched URL: `content-script.js` (extraction, runs on demand) and `wishlist-badge.js` + CSS (read-only "✓ on your wishlist" badge, runs at `document_idle`).
2. The user opens the popup and clicks **Extract**. The popup runs the right pattern from `patterns/built-in.json`, the public [`site-profiles`](https://github.com/boardgamematcher/site-profiles) repo (refreshed every 6 h), or a user-defined custom pattern.
3. Matched titles + prices are previewed via `POST /api/extract/preview`, then on confirm sent to `POST /api/extract/extension`. On any failure the popup falls back to opening `boardgamematcher.com/extract?url=<page>` so the BGM web extractor takes over.

**51 retail domains in v0.7.1**, grouped by brand:

| Brand | ccTLDs / domains in `manifest.json` | Notes |
|---|---|---|
| Amazon (16) | .at, .be, .ca, .co.jp, .co.uk, .com, .com.au, .com.br, .com.mx, .de, .es, .fr, .it, .nl, .pl, .se | Search results + Best-Sellers/category pages; sponsored items skipped |
| Veepee (8) | .at, .be, .de, .es, .fr, .it, .lu, .nl | Reads `__NEXT_DATA__` JSON |
| Coolshop (10) | .co, .com, .de, .dk, .fi, .is, .nl, .no, .pl, .se | Generic card selector |
| Philibert (1) | philibertnet.com | **Plus** a special game-detail overlay (`game-overlay.js`, BGM-976) on `/pub/<id>-…html`: shows BGM card, rating, and wishlist status inline on the product page |
| Single-domain shops (26) | board-game.co.uk (Zatu), boardgamebliss.com, bol.com, brettspielversand.de, coolstuffinc.com, cultura.com, espritjeu.com, fantasywelt.de, fnac.com, gamenerdz.com, gamersdream.shop, knapix.com, kutami.de, le-passe-temps.com, lepion.com, ludifolie.com, ludisphere.fr, ludum.fr, milan-spiele.de, miniaturemarket.com, okkazeo.com, privalia.com, spiele-offensive.de, spieletaxi.de, thalia.de | Each has its own selector entry in `built-in.json` |

---

## 2. Context-menu actions (any site, no host permission)

Wired in `src/background/service-worker.js`. Every item is a redirect to `boardgamematcher.com` except the popup-opener.

| Menu item | Visible on | Behavior |
|---|---|---|
| Extract Board Games from this page | page right-click | Opens `boardgamematcher.com/extract?url=<pageUrl>` |
| Extract Board Games from this link | link right-click | Opens `…/extract?url=<linkUrl>` |
| Extract Board Games from this URL | text selection that **is** a URL (Firefox-only auto-hide) | Opens `…/extract?url=<selection>` |
| Search "X" on BoardGameMatcher | text selection | Opens `…/search?q=<selection>` |
| Find "X" in BGM extension | text selection | Opens the extension popup pre-filled with the query (falls back to `…/search?q=` if `chrome.action.openPopup()` is unsupported) |

---

## 3. Extension actions and the BGM URLs they hit

All BGM endpoints below are under `https://boardgamematcher.com` (or `chrome.storage.local.apiUrl` if set, applied only to play imports). Browser-tab navigations include `?utm_source=extension&utm_medium=popup&utm_campaign=<campaign>`.

### 3.1 Popup — always-on

| Action | What the user sees | URL hit | Auth required? |
|---|---|---|---|
| Open popup | Auth check on load | `GET /api/me` | No (returns 401 if logged out, popup switches to logged-out layout) |
| Sign in | Bottom CTA | Opens tab `/auth/login` | — |
| Sign up | Bottom CTA | Opens tab `/auth/register` | — |
| Avatar click | Top-right avatar | Opens tab `/users/<username>` | Logged in |
| Theme toggle | 🌙/☀️ button | Local only (`chrome.storage.local.theme`) | No |
| Settings | ⚙️ button | Opens extension `options.html` | No |

### 3.2 Popup — Extract tab (shop sites)

| Action | URL hit | Auth required? | Notes |
|---|---|---|---|
| Click **Extract** → preview | `POST /api/extract/preview` | Optional | Logged-out users still get a preview; on any error popup falls back to opening `/extract?url=<page>` |
| Confirm extraction | `POST /api/extract/extension` | Logged in for the result to be saved | Returns `job_id`; success card links to `/extract?job=<jobId>` |
| Wishlist badges on shop pages | `GET /api/me/wishlist` (cached in service worker) | Logged in | Without login, no badges render |
| "View collection" link (bottom nav on shop pages) | Opens tab `/collections/<username>` | Logged in | |

### 3.3 Popup — Extract tab (play platforms)

| Action | URL hit | Auth required? |
|---|---|---|
| Import BGA / Yucata / Tabletopia / Ludopedia / SpielByWeb / BGG plays | `POST /api/plays/batch` (per-batch, with progress) | Yes |
| BGA stats summary | `GET /api/plays/summary` | Yes |
| BGG collection sync | `POST /api/bgg/import-collection` | Yes |

### 3.4 Popup — Wishlist tab (game search & quick-add)

| Action | URL hit | Auth required? |
|---|---|---|
| Type in search box | `GET /api/games/search?q=<q>` | No (search works logged out, but pills hidden) |
| Open game detail card | `GET /api/collections/<gameId>` (read user's current types) | Yes |
| Toggle a collection pill (own/played/wishlist/wanttoplay/wanttolearn/canteach) | `POST` or `DELETE /api/collections/<gameId>/<type>` | Yes |
| "Add" button | `POST /api/collections/<gameId>/<type>` × selected types | Yes |
| Open game on BGM (CTA / "rate this") | Opens tab `/{lang}/game/<slug>` (localized: en→game, fr→jeu, de→spiel, es→juego, it→gioco) | — |

### 3.5 Popup — Dashboard tab (logged-in)

| Action | URL hit | Auth required? |
|---|---|---|
| Dashboard load — matches tile | `GET /api/matches/new` | Yes |
| Dashboard load — notifications tile | `GET /api/notifications/count` | Yes |
| Messages tile / banner | reads `chrome.storage.local.unreadMessages` (filled by background poll) | Yes |
| Click messages | Opens tab `/messages` | — |
| Click matches | Opens tab `/play/players` | — |
| Click notifications | Opens tab `/notifications` | — |
| Quick links | Opens tab `/`, `/collections/<u>`, `/collections/<u>?type=wishlist` | — |

### 3.6 Background service worker — periodic polls

Polls run on `chrome.alarms` regardless of login state, but every endpoint requires the BGM session cookie, so logged-out users get 401 and no notification fires.

| Alarm | Endpoint | Notification on hit | Click destination |
|---|---|---|---|
| News | `GET /api/news/latest` (no credentials) | "New on BGM: …" | `/news/<slug>` |
| Friend requests | `GET /api/friends/pending-summary` | "X new friend request(s)" | `/friends` |
| New matches | `GET /api/matches/new` | "X new match(es)" | `/play` |
| Session invites | `GET /api/sessions/invites/pending` | "Invited to <session>" | `/play/sessions/<id>` |
| Unread messages | `GET /api/messages/unread-summary` | "X unread message(s)" | `/messages` |
| Wishlist (overlay support) | `GET /api/me/wishlist` | — (caches list for badges & overlay) | — |

The service worker also exposes message handlers used by the Philibert overlay and the wishlist badge:

| Background message | URL hit | Auth required? |
|---|---|---|
| `resolveOverlayGame` | `GET /api/games/search?q=<title>` then `GET /api/collections/<id>` | Search works logged out; collection types only with login |
| `setCollectionType` (overlay pills) | `POST` or `DELETE /api/collections/<gameId>/<type>` | Yes |

### 3.7 Direct on-page links (no popup)

| Surface | Destination |
|---|---|
| Wishlist badge on shop product card | `/boardgames/<slug>` (no UTM) |
| Philibert game overlay — title / CTA | `/{lang}/game/<slug>` |
| Philibert game overlay — brand link | `https://boardgamematcher.com` |
| BGG sync clear → "log in to BGG" | `https://www.boardgamegeek.com` |

---

## 4. Logged-in vs logged-out summary

| Capability | Logged out | Logged in |
|---|---|---|
| Extract from shops (preview) | ✅ falls back to `/extract?url=` on website | ✅ inline preview + save to BGM |
| Wishlist badges on shop pages | ❌ | ✅ |
| Philibert game overlay (rating, name) | ✅ public data only | ✅ + per-user collection pills |
| Game search in popup | ✅ | ✅ |
| Quick-add to collection | ❌ | ✅ |
| Play imports (BGA, Yucata, …) | ❌ | ✅ |
| BGG collection sync | ❌ | ✅ |
| Background polls / notifications | no-op (401) | ✅ news, friends, matches, sessions, messages |
| Dashboard tiles | sign-in CTA | matches / notifications / messages live counts |
| Context-menu redirects | ✅ (open BGM page) | ✅ |
