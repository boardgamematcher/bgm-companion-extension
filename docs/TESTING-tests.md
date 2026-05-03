# Automated test inventory

Literal list of every Playwright spec, in the wording the test runner uses.
Companion to `TESTING.md` — see that file for what to run, how the harness
works, and what's still manual.

> Refresh with `npm run test:e2e -- --list` and update by hand. The titles
> here are tied to test names; if you rename a test, update this file too.

**Total: 59 tests across 8 specs.**

## `tests-e2e/extension-load.spec.js` (1)

- extension loads with MV3 service worker and no console errors

## `tests-e2e/popup-supported-sites.spec.js` (38)

### built-in profile detection (service worker)

Drives the SW's `checkSiteSupport` handler with one representative URL per
profile in `patterns/built-in.json`. Covers all 33 profiles plus 3
unsupported URLs.

- matches profile for `https://www.veepee.fr/fr/catalog/jeux-de-societe`
- matches profile for `https://www.philibertnet.com/fr/123/flash-sales`
- matches profile for `https://www.philibertnet.com/fr/123/promotions`
- matches profile for `https://www.philibertnet.com/fr/`
- matches profile for `https://www.philibertnet.com/fr/some-game/12345-some-game.html`
- matches profile for `https://www.philibertnet.com/fr/category/12-strategy`
- matches profile for `https://www.amazon.com/s?k=board+games`
- matches profile for `https://www.amazon.com/gp/bestsellers/toys`
- matches profile for `https://www.knapix.com/2025/11/top-games`
- matches profile for `https://www.cultura.com/jeux-de-societe`
- matches profile for `https://www.fnac.com/SearchResult/ResultList.aspx?Search=jeux`
- matches profile for `https://www.espritjeu.com/jeux-de-societe.html`
- matches profile for `https://www.ludum.fr/categorie/jeux`
- matches profile for `https://www.le-passe-temps.com/category/jeux`
- matches profile for `https://www.okkazeo.com/jeux/liste/recent`
- matches profile for `https://www.lepion.com/jeux-de-societe`
- matches profile for `https://www.gamersdream.shop/collections/board-games`
- matches profile for `https://www.ludisphere.fr/jeux-de-societe`
- matches profile for `https://www.ludifolie.com/jeux-de-societe`
- matches profile for `https://www.coolstuffinc.com/main_browse.php?cat=board-games`
- matches profile for `https://www.miniaturemarket.com/board-games.html`
- matches profile for `https://www.boardgamebliss.com/collections/all`
- matches profile for `https://www.board-game.co.uk/collections/all`
- matches profile for `https://www.gamenerdz.com/board-games`
- matches profile for `https://www.brettspielversand.de/brettspiele`
- matches profile for `https://www.milan-spiele.de/Brettspiele`
- matches profile for `https://www.fantasywelt.de/brettspiele`
- matches profile for `https://www.spiele-offensive.de/brettspiele`
- matches profile for `https://www.thalia.de/kategorie/spielwaren-brettspiele`
- matches profile for `https://www.kutami.de/brettspiele`
- matches profile for `https://www.spieletaxi.de/brettspiele`
- matches profile for `https://www.bol.com/nl/nl/l/gezelschapsspellen/`
- matches profile for `https://www.coolshop.dk/produkt/braetspil/`
- does not match anything for `https://example.com/`
- does not match anything for `https://www.google.com/search?q=board+games`
- does not match anything for `https://www.wikipedia.org/wiki/Catan`

### popup UI states

- supported shop page enables extract button and shows shop name
- unsupported page leaves extract button disabled

## `tests-e2e/popup-knapix-happy-path.spec.js` (1)

- Knapix happy path: extract → review → confirm → success

## `tests-e2e/options-custom-patterns.spec.js` (2)

### options page — custom patterns CRUD

- create / edit / delete / export-import roundtrip
- cancelling the delete confirm keeps the pattern

## `tests-e2e/wishlist-badge.spec.js` (3)

- renders badges next to wishlisted titles on Amazon search
- renders badges on Philibert category page
- does not render badges when wishlist is empty

## `tests-e2e/context-menus.spec.js` (6)

- context menus — all expected items are registered
- Search BGM (selection) opens `/search?q=<query>`
- Extract from this page opens `/extract?url=<pageUrl>`
- Extract from this link opens `/extract?url=<linkUrl>`
- Extract URL from selection only fires when the selection looks like a URL
- Find in BGM extension stashes the query for the popup

## `tests-e2e/popup-play-history.spec.js` (6)

### play-history platform smoke tests

For each platform: panel renders on its domain, import click sends the right
message, status div reflects the canned success payload.

- BGA
- Yucata
- BGG
- Tabletopia
- Ludopedia
- SpielByWeb

## `tests-e2e/philibert-overlay.spec.js` (2)

- Philibert product page renders the BGM overlay (BGM-976)
- Philibert non-product page does not render the overlay

## Jest unit tests (`tests/`, 131)

For completeness — these run via `npm test`. Not E2E, but listed here so
the inventory is complete.

- `tests/bga-scraper.test.js`
- `tests/bga-playerstat-scraper.test.js`
- `tests/next-data-extraction.test.js`
- `tests/normalize.test.js`
- `tests/pattern-matcher.test.js`
- `tests/plays-api.test.js`
- `tests/yucata-integration.test.js`
- `tests/yucata-mapper.test.js`
- `tests/yucata-scraper.test.js`
