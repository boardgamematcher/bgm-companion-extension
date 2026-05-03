/**
 * BGAPlayerStatScraper — BGM-789 spike prototype (Phase 1).
 *
 * Reads per-game player stats from BGA's playerstat page. Phase 1 scope:
 * the cross-game time series — current ELO and rating evolution — which is
 * uniform across every BGA game and works with the same auth pattern as
 * the existing `bga-scraper.js`. Per-game stat-table parsing is included
 * for completeness but isn't part of the recommended initial ship (Phase 2).
 *
 * Not wired into manifest.json. See docs/plans/2026-05-03-bga-playerstat-spike.md.
 */

function BGAPlayerStatScraper(fetchFn, tokenOverride) {
  const _fetch = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

  return {
    getRequestToken() {
      const scripts =
        typeof document !== 'undefined' ? document.querySelectorAll('script:not([src])') : [];
      for (const script of scripts) {
        const m = script.textContent.match(/requestToken\s*[:=]\s*["']([^"']+)["']/);
        if (m) return m[1];
      }
      if (typeof document !== 'undefined') {
        const cookieMatch = document.cookie.match(/TournoiEnLigneidt=([^;]+)/);
        if (cookieMatch) return cookieMatch[1];
      }
      return null;
    },

    async _getJson(url) {
      if (!_fetch) throw new Error('No fetch function available');
      const token = tokenOverride !== undefined ? tokenOverride : this.getRequestToken();
      if (!token) {
        throw new Error('Could not find BGA request token. Make sure you are logged in.');
      }
      const response = await _fetch(url, {
        credentials: 'include',
        headers: {
          'x-request-token': token,
          'x-requested-with': 'XMLHttpRequest',
        },
      });
      if (!response.ok) {
        throw new Error(`BGA API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (!data || data.status !== 1) {
        throw new Error(`BGA API rejected the request: ${JSON.stringify(data).slice(0, 200)}`);
      }
      return data.data;
    },

    /**
     * Fetch the rank/ELO evolution time series for one game.
     * @param {string} playerId
     * @param {string|number} gameId  BGA numeric game id (e.g. 1845 for Formula D)
     * @returns {Promise<{points: Array<{date: string, elo: number, daysFromToday: number}>, hideY: boolean}>}
     *   `hideY` is true for co-op games where BGA hides the y-axis in its
     *   own UI; the values still come through but BGM should respect that.
     */
    async getRankEvolution(playerId, gameId) {
      const url =
        `/playerstat/playerstat/getrankevol.html?player=${encodeURIComponent(playerId)}` +
        `&game=${encodeURIComponent(gameId)}`;
      const data = await this._getJson(url);
      const evol = data.rank_evolution || {};
      return {
        points: zipRankSeries(evol.labels || [], evol.values || []),
        hideY: Boolean(data.hide_y),
      };
    },

    /**
     * Fetch the most recent N game results for one game.
     * Same news/HTML shape as the existing `playerresult` scraper, so the
     * existing `parseResultHtml` could be reused to extract outcomes.
     * @param {string} playerId
     * @param {string|number} gameId
     * @param {number} [perPage=10]
     */
    async getLastResults(playerId, gameId, perPage) {
      const n = perPage || 10;
      const url =
        `/message/board?type=lastresult&id=${encodeURIComponent(gameId)}` +
        `&arg=${encodeURIComponent(playerId)}&social=false&per_page=${n}`;
      const data = await this._getJson(url);
      return data.news || [];
    },
  };
}

/**
 * Zip BGA's parallel `labels` and `values` arrays into one list.
 *
 * BGA returns:
 *   labels: [{value: -112, text: "11 Jan"}, ...]
 *   values: [{x: -112, y: 1330}, ...]
 *
 * The `value` / `x` integer is days-from-today (negative). We keep that as
 * `daysFromToday` and pair it with the human label for display. ELO is `y`.
 *
 * @param {Array<{value:number, text:string}>} labels
 * @param {Array<{x:number, y:number}>} values
 */
function zipRankSeries(labels, values) {
  const labelByX = new Map();
  for (const l of labels) labelByX.set(l.value, l.text);
  return values.map((v) => ({
    daysFromToday: v.x,
    elo: v.y,
    date: labelByX.get(v.x) || null,
  }));
}

/**
 * Parse the server-rendered `<table id="player_stats_table">` into a flat
 * map of localized label → {player, allPlayers, winners}.
 *
 * Phase 2 entry point — included for the spike, not wired up.
 *
 * Caveats:
 * - Labels are localized in the user's BGA locale. Pin locale to `en` via
 *   the BGA locale cookie before navigation if stable keys are required.
 * - Empty cells (player hasn't done that stat) come through as `null`.
 *
 * @param {string} html  Full HTML of the playerstat page
 * @returns {Object<string, {player: number|null, allPlayers: number|null, winners: number|null}>}
 */
function parseStatsTable(html) {
  const tableMatch = html.match(/<table[^>]*id="player_stats_table"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return {};
  const inner = tableMatch[1];
  const result = {};
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  let isFirstRow = true;
  while ((m = rowRegex.exec(inner)) !== null) {
    if (isFirstRow) {
      // Header row carries the column titles; skip.
      isFirstRow = false;
      continue;
    }
    const cells = [];
    const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g;
    let c;
    while ((c = cellRegex.exec(m[1])) !== null) {
      cells.push(c[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length < 4) continue;
    const [label, p, all, win] = cells;
    if (!label) continue;
    result[label] = {
      player: numOrNull(p),
      allPlayers: numOrNull(all),
      winners: numOrNull(win),
    };
  }
  return result;
}

function numOrNull(text) {
  if (!text) return null;
  // Strip unit suffixes like " min" so the value parses as a number.
  const stripped = text.replace(/\s*[a-zA-Zµ%]+\s*$/, '').trim();
  if (!stripped) return null;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract the player's current ELO from the playerstat HTML (the
 * `<span class="gamerank_value">240</span>` element). Returns null for
 * pure co-op games where the page doesn't render a rank value.
 */
function parseGameRankValue(html) {
  const m = html.match(/class="gamerank_value"[^>]*>(\d+)/);
  return m ? Number(m[1]) : null;
}

if (typeof window !== 'undefined') {
  window.BGAPlayerStatScraper = BGAPlayerStatScraper;
  window.parseStatsTable = parseStatsTable;
  window.parseGameRankValue = parseGameRankValue;
  window.zipRankSeries = zipRankSeries;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BGAPlayerStatScraper,
    parseStatsTable,
    parseGameRankValue,
    zipRankSeries,
  };
}
