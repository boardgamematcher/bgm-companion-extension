/**
 * TabletopiasScraper
 * Fetches finished match history from Tabletopia's internal REST API.
 *
 * NOTE: The exact API path was inferred from Tabletopia's SPA network traffic.
 * If the endpoint returns 404, check the browser DevTools Network tab on
 * tabletopia.com and update the path accordingly.
 */
function TabletopiasScraper(fetchFn) {
  const _fetch = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

  return {
    /**
     * Normalise a game title to a slug for mapping lookup.
     * e.g. "Ticket to Ride" → "ticket-to-ride"
     */
    slugify(title) {
      return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    },

    /**
     * Fetch all finished matches from the Tabletopia API (paginated).
     * @returns {Promise<Object[]>} Array of raw play objects
     */
    async extractPlays() {
      if (!_fetch) throw new Error('No fetch function available');

      const plays = [];
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 100) {
        let res;
        try {
          res = await _fetch(
            `/api/v2/players/current/matches?status=finished&page=${page}&per_page=50`,
            {
              credentials: 'include',
              headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            }
          );
        } catch (e) {
          throw new Error(`Network error fetching Tabletopia history: ${e.message}`);
        }

        if (res.status === 401 || res.status === 403) {
          throw new Error('Not logged in to Tabletopia. Please log in and try again.');
        }
        if (!res.ok) {
          throw new Error(`Tabletopia API error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();

        // Support multiple response shapes from different API versions
        const items = data.items || data.matches || data.games || data.data || [];

        if (!Array.isArray(items) || items.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of items) {
          const gameName = item.game?.title || item.game_title || item.title || '';
          const playedAt = item.finished_at || item.played_at || item.started_at || '';
          const isWin = item.is_win ?? item.is_winner ?? item.won ?? null;
          const playerCount =
            typeof item.players_count === 'number'
              ? item.players_count
              : Array.isArray(item.players)
                ? item.players.length
                : null;

          if (!gameName || !playedAt) continue;

          const d = new Date(playedAt);
          if (isNaN(d.getTime())) continue;
          const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

          plays.push({
            gameSlug: this.slugify(gameName),
            gameName,
            date,
            playerCount,
            outcome: isWin === true ? 'win' : isWin === false ? 'loss' : null,
          });
        }

        hasMore =
          data.has_more === true ||
          data.next_page != null ||
          data.has_next_page === true ||
          items.length === 50;
        page++;
      }

      return plays;
    },
  };
}

if (typeof window !== 'undefined') window.TabletopiasScraper = TabletopiasScraper;
if (typeof module !== 'undefined' && module.exports) module.exports = { TabletopiasScraper };
