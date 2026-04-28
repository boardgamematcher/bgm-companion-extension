/**
 * BGGScraper
 * Extracts play history from BoardGameGeek using the XML2 API.
 * Must run as a content script on boardgamegeek.com so the browser
 * sends the session cookie automatically (same-origin fetch).
 */
function BGGScraper(fetchFn) {
  const _fetch = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

  return {
    /**
     * Find the logged-in BGG username from the current page.
     * BGG sets a data attribute on the body and also puts the username in
     * the top-right nav link. We try several selectors in order.
     * @returns {string|null}
     */
    getUsername() {
      // 1. Current URL: boardgamegeek.com/user/<username> or /profile/<username>
      const urlMatch = window.location.pathname.match(/^\/(?:user|profile)\/([^/]+)/);
      if (urlMatch) return urlMatch[1];

      // 2. Window globals BGG may inject
      for (const key of ['bggusername', 'BGG_USERNAME', 'currentUser']) {
        if (window[key] && typeof window[key] === 'string') return window[key];
        if (window[key] && typeof window[key] === 'object' && window[key].username)
          return window[key].username;
      }

      // 3. React / Redux initial state (__NEXT_DATA__, __BGG_STATE__, etc.)
      for (const key of ['__NEXT_DATA__', '__BGG_STATE__', '__INITIAL_STATE__']) {
        try {
          const state = window[key];
          if (!state) continue;
          const str = JSON.stringify(state);
          const m = str.match(/"username":"([^"]+)"/);
          if (m) return m[1];
        } catch (_e) {
          // ignore parse errors in individual script tags
        }
      }

      // 4. Inline scripts: look for `"username":"bob"` or `username: "bob"`
      const scripts = document.querySelectorAll('script:not([src])');
      for (const script of scripts) {
        const text = script.textContent;
        // Match  "username":"bob"  or  username: "bob"  or  'username': 'bob'
        const m = text.match(/["']?username["']?\s*:\s*["']([A-Za-z0-9_-]{2,30})["']/);
        if (m && m[1] && m[1] !== 'undefined') return m[1];
      }

      // 5. Body / html data attribute
      for (const el of [document.body, document.documentElement]) {
        if (el && el.dataset.username) return el.dataset.username;
      }

      // 6. Any cookie readable by JS
      const cookieMatch = document.cookie.match(/(?:^|;\s*)bgg[_-]?username=([^;]+)/i);
      if (cookieMatch) return decodeURIComponent(cookieMatch[1]);

      return null;
    },

    /**
     * Parse a single page of BGG XML2 plays response.
     * @param {string} xml
     * @param {string} username - logged-in username (for win/loss detection)
     * @returns {{ plays: Object[], total: number }}
     */
    parsePlaysXml(xml, username) {
      const totalMatch = xml.match(/\btotal="(\d+)"/);
      const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;

      const plays = [];
      const playRegex = /<play\s([^>]*)>([\s\S]*?)<\/play>/g;
      let m;

      while ((m = playRegex.exec(xml)) !== null) {
        const attrs = parseAttrs(m[1]);
        const inner = m[2];

        // <item name="..." objectid="...">
        const itemMatch = inner.match(/<item\s([^>]*)/);
        if (!itemMatch) continue;
        const itemAttrs = parseAttrs(itemMatch[1]);

        const gameName = itemAttrs.name || '';
        const bggId = itemAttrs.objectid ? parseInt(itemAttrs.objectid, 10) : null;
        const subtype = itemAttrs.subtype || '';

        // Skip expansions and accessories — import board games and RPGs only
        if (subtype && subtype !== 'boardgame' && subtype !== 'boardgameexpansion') continue;
        if (!bggId || !gameName) continue;

        const date = attrs.date || '';
        const quantity = parseInt(attrs.quantity || '1', 10) || 1;
        const playerCount = itemAttrs.numplayers ? parseInt(itemAttrs.numplayers, 10) : null;

        // Determine outcome from <player> elements
        const outcome = resolveOutcomeFromXml(inner, username);

        // BGG allows quantity > 1 for the same session; emit one play per unit
        for (let q = 0; q < quantity; q++) {
          plays.push({
            bggId,
            gameName,
            date,
            playerCount: playerCount || null,
            outcome,
          });
        }
      }

      return { plays, total };
    },

    /**
     * Fetch all plays for `username` by paginating through the XML2 API.
     * @param {string} username
     * @param {function(number, number): void} [onProgress] - called with (fetched, total)
     * @returns {Promise<Object[]>}
     */
    async extractPlays(username, onProgress) {
      if (!_fetch) throw new Error('No fetch function available');
      if (!username) throw new Error('BGG username is required');

      const allPlays = [];
      let page = 1;
      let total = null;

      while (true) {
        const url = `/xmlapi2/plays?username=${encodeURIComponent(username)}&page=${page}`;
        let res;

        // Retry on 202 (BGG queues requests when data isn't ready)
        for (let attempt = 0; attempt < 5; attempt++) {
          res = await _fetch(url, { credentials: 'include' });
          if (res.status !== 202) break;
          await new Promise((r) => setTimeout(r, 2000));
        }

        if (res.status === 401) {
          throw new Error('Not logged in to BGG. Please sign in and try again.');
        }
        if (!res.ok) {
          throw new Error(`BGG API error: ${res.status}`);
        }

        const xml = await res.text();
        const { plays, total: pageTotal } = this.parsePlaysXml(xml, username);

        if (total === null) total = pageTotal;
        allPlays.push(...plays);

        if (onProgress) onProgress(allPlays.length, total);

        // BGG returns 100 plays per page
        if (plays.length < 100 || allPlays.length >= total) break;
        page++;
      }

      return allPlays;
    },
  };
}

/**
 * Parse XML attribute string into a key→value map.
 * Handles both single and double-quoted values.
 * @param {string} str
 * @returns {Object}
 */
function parseAttrs(str) {
  const result = {};
  const re = /(\w+)=["']([^"']*)["']/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}

/**
 * Determine win/loss/draw/null from the <players> block for the given username.
 *
 * BGG <player win="1"> marks the winner(s). Multiple players can have win="1"
 * in a draw. If nobody has win="1", outcome is unknown (null).
 *
 * @param {string} inner - inner XML of a <play> element
 * @param {string} username - the logged-in user's BGG username
 * @returns {'win'|'loss'|'draw'|null}
 */
function resolveOutcomeFromXml(inner, username) {
  if (!username) return null;

  const playerRegex = /<player\s([^>]*)/g;
  const players = [];
  let m;
  while ((m = playerRegex.exec(inner)) !== null) {
    const attrs = parseAttrs(m[1]);
    players.push(attrs);
  }

  if (players.length === 0) return null;

  // Count winners and find the current user's entry
  const winnerCount = players.filter((p) => p.win === '1').length;
  if (winnerCount === 0) return null;

  const me = players.find((p) => p.username && p.username.toLowerCase() === username.toLowerCase());
  if (!me) return null;

  if (me.win !== '1') return 'loss';
  return winnerCount > 1 ? 'draw' : 'win';
}

// Export to global scope for content scripts
if (typeof window !== 'undefined') {
  window.BGGScraper = BGGScraper;
  window.resolveOutcomeFromXml = resolveOutcomeFromXml;
}

// Export for Node.js/Jest tests (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BGGScraper, parseAttrs, resolveOutcomeFromXml };
}
