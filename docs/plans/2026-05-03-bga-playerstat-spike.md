# BGM-789 — Spike: BGA per-game player stats

Investigation of `https://en.boardgamearena.com/playerstat?id=<player>&game=<gameId>`
to assess scraping feasibility from the extension. Captured live data from a
logged-in premium BGA account across four games of varied weight: **Formula D
(1845)**, **Sky Team (1879, co-op)**, **Sea Salt & Paper (1631)**, **7 Wonders
Architects (1520)**.

Recon artefacts (gitignored, local only): `/tmp/bga-recon/`. Recon script:
`scripts/bga-recon/recon.py`.

## Where the data lives

Per-game page renders `~2 MB` of HTML. Network traffic is almost entirely
static assets; only **two** request types carry actual stats data:

| Endpoint | Method | Shape | Purpose |
|---|---|---|---|
| `/playerstat/playerstat/getrankevol.html?player=<id>&game=<gid>` | GET → JSON | `{labels: [{value,text}], values: [{x,y}]}` | ELO rating curve over time |
| `/message/board?type=lastresult&id=<gid>&arg=<player>&per_page=N` | GET → JSON | `{news: [...]}` (same shape as existing `playerresult` scraper, filtered to one game) | Recent results for the game |
| `<table id="player_stats_table">` (in HTML) | server-rendered | 3-column table | All other stats — game-specific |

Auth pattern is identical to the existing `bga-scraper.js` (request token from
inline script + `x-request-token` header). The same logged-in session works.

## Cross-game vs game-specific

**Identical across all 4 games:**

- Both XHR endpoints (URL shape, response shape, auth, status).
- Stats table structure: `<table id="player_stats_table">` with header row
  `[blank, "<player avg>", "<all players avg>", "<winners avg>"]` and one
  `<tr>` per stat with `<th>` label then 3 numeric `<td>`s.
- Three core stats appear on every game (with FR/EN mixing): "Temps de
  réflexion", "Time bonus number", "Reflexion time standard deviation".
- Current ELO rendered as `<span class="gamerank_value">` (or absent for
  pure co-op).

**Game-specific:**

| Game | Stat rows | Stat examples |
|---|---|---|
| Sky Team (co-op) | **3** | Just the 3 universal time stats. No game-specific data. |
| 7 Wonders Architects | **13** | Wonders played, victory points by colour, cards drawn from each pile, gold spent. |
| Sea Salt & Paper | **25** | Cards from deck/discard, Duo card variants, Mermaid wins, "DERNIÈRE CHANCE" calls. |
| Formula D | **113** | Per-gear lap counts, per-tire-type laps, every wear-point category, qualifying telemetry. |

Stat *names* are ad-hoc localized labels — no `data-stat-key` or stable ID
exists. Each game effectively defines its own metric vocabulary.

## Things that bite

1. **Localization, no stable keys.** The page renders in the user's BGA
   locale. Even visiting `en.boardgamearena.com` 302-redirects to the bare
   domain and the locale cookie wins. Some labels stay untranslated in
   English regardless ("Time bonus number"). To get stable-ish keys, the
   scraper must set BGA's locale cookie to `en` before navigating, then the
   labels stabilise. We did not test this in the spike.

2. **Sky Team-style co-op edge cases.** Co-op games render the same template
   but: no `gamerank_value` span (no ELO display), the rank evolution series
   has `hide_y: true` (BGA's UI hides the axis), the "winners avg" column is
   identical to "all players avg" (degenerate). Scraper must handle these.

3. **Premium gating untested.** This account is premium. We have no
   non-premium fixture, so we don't know which stats (if any) are gated for
   free users. Likely a subset of the table is omitted; ticket flagged this.

4. **`lastresult` returned 0 items** for all four games at `per_page=10`. The
   existing scraper paginates `playerresult` to walk full history; for
   per-game results the same pagination applies. Don't assume the first page
   has data.

5. **The 113-stat games make full semantic mapping infeasible by hand.** BGA
   hosts hundreds of games. A "give every stat a canonical name and type"
   project is open-ended and ongoing.

## Effort assessment

Three layers, each independently shippable:

### Phase 1 — Cross-game time-series (low effort, high value)

Scrape `getrankevol.html` for every game the user has played. Send to BGM as
`{game_id, slug, timeseries: [{ts, elo}], hide_y}`. Powers a unified "ELO
across all platforms" view (BGA + Yucata + physical) without per-game work.

- **Reuses:** existing auth, slug→BGG mapping in `patterns/bga-mapping.json`.
- **New code:** ~100 lines in `bga-scraper.js` style + a new BGM ingest
  endpoint accepting the time-series shape.
- **Per-game cost to extend:** zero — same endpoint for every game.

### Phase 2 — Generic stats table dump (medium effort, medium value)

Scrape `<table id="player_stats_table">` as a flat
`{label: {player, avg, winners}}` dict, no semantic interpretation. Force
locale to `en` via cookie before each page load to get stable keys. Display
in BGM as a raw labeled list per platform.

- **New code:** ~150 lines (locale-cookie management + DOM extraction +
  pagination of the user's played-games list to know which `gameId`s to
  visit).
- **Per-game cost to extend:** zero, but UX is "pile of numbers, untranslated
  in places" — not a polished product surface.
- **Discovery problem to solve first:** the `/gamestats?player=…` page lists
  games by **slug** only (`/gamepanel?game=cantstop`); numeric `gameId` for
  the playerstat URL must be resolved separately. Either reuse the existing
  `playerresult` scraper output (already returns `subject_id` = numeric
  `gameId`), or extract slug↔id pairs from inline JSON on the gamestats
  page (`recently_met_players` block, ~16 pairs in our capture — partial).
  The first option is strictly cleaner and already implemented.

### Phase 3 — Per-game stat schemas (high effort, ongoing)

Build per-game manifests mapping localized labels → canonical keys + types
(percentage, count, duration, currency, …). Enables charts, comparisons,
cross-player insights. Open-ended scope: every new BGA game = new manifest.

- **Recommended:** community-sourced or LLM-assisted, top-N games first.
- **Out of scope** for an initial ship.

## Recommendation

Ship **Phase 1 only** as the first BGM-side feature. It's a clean win,
matches the existing scraper's complexity, and gives users meaningful
unified-rating visualization. Defer Phase 2 until Phase 1 traction justifies
the localization work. Do not pursue Phase 3 until Phase 2 is shipped and
users actually request semantic stats.

## Loose ends if we proceed

- Verify English-locale cookie pinning works without disrupting the user's
  normal BGA session (test: scraper sets cookie, runs, restores).
- Add a non-premium fixture for the gating question.
- Decide where `gameId` resolution lives — fold it into the existing
  play-history scraper output rather than re-deriving from gamestats HTML.
- Network endpoints sit on bare `boardgamearena.com` (no `en.` prefix
  even when navigated from the localized subdomain). `manifest.json`
  `host_permissions` already covers both.
