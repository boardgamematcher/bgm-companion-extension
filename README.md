# BGM Toolbox — BoardGameMatcher Companion

Cross-browser extension (Chrome / Firefox / Edge) that connects board game shops, play platforms, and your collection on **[BoardGameMatcher.com](https://boardgamematcher.com)**.

## What it does

- **Shop deals** — on supported board game shops, click the toolbar icon to extract game names and prices, then match them against the BGM database.
- **Play history** — on Board Game Arena and Yucata.de, import your past plays into your BGM profile in one click (game IDs auto-mapped to BGG).
- **Wishlist** — quick-add games to your BGM wishlist directly from the popup.
- **Custom patterns** — teach the extension a new shop with a CSS selector or a Next.js `__NEXT_DATA__` path.

Built-in shop coverage spans 51 retail domains across Amazon, Veepee, Coolshop, Philibert, Knapix, Cultura, Fnac, Esprit Jeu, Ludum, Le Passe-Temps, Okkazeo, Le Pion, Gamers Dream, Ludisphere, Ludifolie, CoolStuffInc, Miniature Market, BoardGameBliss, Zatu Games, GameNerdz, brettspielversand, Milan Spiele, Fantasywelt, Spiele-Offensive, Thalia, Kutami, Spieletaxi, Privalia, Bol.com. See [`docs/supported-sites.md`](docs/supported-sites.md) for the full table of sites, every popup/context-menu action, and the BGM endpoints each one hits (with logged-in vs logged-out behavior).

Site patterns are maintained in the public [boardgamematcher/site-profiles](https://github.com/boardgamematcher/site-profiles) repo and update automatically (no extension release needed for new shops).

## Installation

### Chrome / Edge / Brave

1. Clone this repository
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the repo directory

### Firefox

1. Clone this repository
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** and pick `manifest.json`

> Firefox unloads temporary extensions on browser restart. For a persistent install, the AMO-signed build is needed.

## Usage

**Extract from a shop:** open a supported shop's catalog page, click the toolbar icon, click **Extract Games**. Results land on `boardgamematcher.com/extract`.

**Import BGA plays:** sign in at `boardgamearena.com`, navigate to your game stats page, click the toolbar icon, click **Import BGA Plays**.

**Import Yucata plays:** sign in at `yucata.de`, open your Game History, click the toolbar icon, click **Import Yucata Plays**.

**Add a custom shop:** Settings → Custom Patterns → Add New Pattern. For Next.js shops, use Import JSON with a `data_source: "next_data"` profile.

## Privacy & data flow

This extension **does** transmit data — that's the whole point. Specifically:

- When you click **Extract**, the page's product list (game names, prices, image URLs) is sent to `boardgamematcher.com/api/extract/extension`. Source URL and domain are included.
- When you import plays, the parsed play list (game id, date, player count, outcome) is sent to `boardgamematcher.com/api/plays/batch`.
- Auth and wishlist actions use your `boardgamematcher.com` session cookie.

It does **not** transmit anything to third parties. Custom patterns and stats are stored locally in `chrome.storage.local`. See [`PRIVACY.md`](PRIVACY.md) for the full disclosure.

## Development

```
toolbox-extension/
├── manifest.json
├── src/
│   ├── background/        # service worker
│   ├── content/           # content scripts (BGA, Yucata, generic)
│   ├── popup/             # toolbar popup UI
│   ├── options/           # settings page
│   └── lib/               # shared utilities
├── patterns/              # bundled fallback profiles + ID mappings
├── icons/
└── tests/                 # jest (jsdom) — 108 tests
```

Stack: vanilla JS, WebExtensions Manifest V3, no build step. Jest + jsdom for tests, ESLint + Prettier for style.

```bash
npm ci
npm test          # jest
npm run lint      # eslint
npm run format    # prettier --write
```

CI runs the same on every PR (`.github/workflows/test.yml`).

## Contributing

PRs welcome. To suggest a new shop, the cleanest path is a profile PR to [`site-profiles`](https://github.com/boardgamematcher/site-profiles) — no extension release required. For extension features and bugfixes, fork + branch + PR here.

## License

MIT — see [LICENSE](LICENSE).

## Support

- Issues / bugs / shop suggestions: [github.com/boardgamematcher/toolbox-extension/issues](https://github.com/boardgamematcher/toolbox-extension/issues)
- Site patterns: [github.com/boardgamematcher/site-profiles](https://github.com/boardgamematcher/site-profiles)
