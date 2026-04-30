/**
 * LudopediaScraper
 * Fetches play history from Ludopedia's REST API.
 *
 * Ludopedia (ludopedia.com.br) includes id_bgg on each play record,
 * so no local mapping file is needed — BGG IDs come directly from the API.
 *
 * Authentication: uses the browser session cookie (user must be logged in).
 */
function LudopediaScraper(fetchFn) {
  const _fetch = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

  return {
    /**
     * Resolve the current user's Ludopedia numeric ID.
     * Tries: API /api/v1/usuario/me → page meta → URL.
     * @returns {Promise<string>} User ID
     */
    async getUserId() {
      // Option 1: dedicated "me" endpoint
      try {
        const res = await _fetch('/api/v1/usuario/me', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          const id = data.id_usuario || data.id || data.usuario?.id;
          if (id) return String(id);
        }
      } catch (_e) {
        // fall through
      }

      // Option 2: id in a <meta> or global JS var
      const metaUserId = document.querySelector('meta[name="user-id"], meta[name="userId"]');
      if (metaUserId) return metaUserId.getAttribute('content');

      if (typeof window.userId !== 'undefined') return String(window.userId);
      if (typeof window.loggedUserId !== 'undefined') return String(window.loggedUserId);

      // Option 3: extract from current URL /usuario/{slug}, then look up the ID
      const slugMatch = window.location.pathname.match(/\/usuario\/([^/]+)/);
      if (slugMatch) {
        try {
          const res = await _fetch(`/api/v1/usuario/${slugMatch[1]}`, {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });
          if (res.ok) {
            const data = await res.json();
            const id = data.id_usuario || data.id;
            if (id) return String(id);
          }
        } catch (_e) {
          // fall through
        }
      }

      throw new Error(
        'Could not determine your Ludopedia user ID. Navigate to your profile page and try again.'
      );
    },

    /**
     * Parse a Ludopedia outcome value to win/loss/draw/null.
     * Ludopedia uses fl_vencedor (1=win), colocacao (placement), or resultado text.
     */
    parseOutcome(play) {
      // fl_vencedor: 1 = won, 0 = did not win
      if (play.fl_vencedor === 1 || play.fl_vencedor === '1') return 'win';
      if (play.fl_vencedor === 0 || play.fl_vencedor === '0') return 'loss';

      // colocacao: 1 = first place
      if (play.colocacao === 1 || play.colocacao === '1') return 'win';
      if (typeof play.colocacao === 'number' && play.colocacao > 1) return 'loss';

      // resultado text fallback
      const res = (play.resultado || '').toLowerCase();
      if (res === 'vitoria' || res === 'venceu' || res === 'ganhou') return 'win';
      if (res === 'derrota' || res === 'perdeu') return 'loss';
      if (res === 'empate') return 'draw';

      return null;
    },

    /**
     * Fetch all plays for the current user from Ludopedia's API.
     * @returns {Promise<Object[]>} Array of play objects with bggId
     */
    async extractPlays() {
      if (!_fetch) throw new Error('No fetch function available');

      const userId = await this.getUserId();
      const plays = [];
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 100) {
        let res;
        try {
          res = await _fetch(`/api/v1/partidas?id_usuario=${userId}&pagina=${page}`, {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });
        } catch (e) {
          throw new Error(`Network error fetching Ludopedia plays: ${e.message}`);
        }

        if (res.status === 401 || res.status === 403) {
          throw new Error('Not logged in to Ludopedia. Please log in and try again.');
        }
        if (!res.ok) {
          throw new Error(`Ludopedia API error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();

        // Support both array response and { partidas: [...] } envelope
        const items = Array.isArray(data) ? data : data.partidas || data.items || data.data || [];

        if (!Array.isArray(items) || items.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of items) {
          const bggId = item.id_bgg ? Number(item.id_bgg) : null;
          const gameName = item.nm_jogo || item.jogo?.nm_jogo || '';
          const playedAt = item.dt_partida || item.data_partida || '';
          const playerCount = item.qt_jogadores != null ? Number(item.qt_jogadores) : null;

          if (!gameName || !playedAt) continue;

          // Ensure YYYY-MM-DD format (Ludopedia returns this natively)
          const dateMatch = playedAt.match(/^(\d{4}-\d{2}-\d{2})/);
          if (!dateMatch) continue;
          const date = dateMatch[1];

          plays.push({
            bggId,
            gameName,
            date,
            playerCount,
            outcome: this.parseOutcome(item),
          });
        }

        hasMore =
          data.proxima_pagina != null ||
          data.has_more === true ||
          data.next_page != null ||
          items.length >= 20;
        page++;
      }

      return plays;
    },
  };
}

if (typeof window !== 'undefined') window.LudopediaScraper = LudopediaScraper;
if (typeof module !== 'undefined' && module.exports) module.exports = { LudopediaScraper };
