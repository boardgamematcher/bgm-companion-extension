/**
 * SpielByWebScraper
 * Scrapes finished game history from SpielByWeb's game list page.
 *
 * The user must be on https://www.spielbyweb.de/GameList.php (or any
 * page where the finished game table is rendered).
 *
 * SpielByWeb is a play-by-email board game server. Each finished game row
 * contains: game type, finish date, result (won/lost/draw), player count.
 * Game type names are extracted and mapped to BGG IDs via a bundled file.
 */
function SpielByWebScraper() {
  return {
    /**
     * Parse a SpielByWeb result string to win/loss/draw/null.
     * The site uses German and English labels.
     */
    parseResult(text) {
      const t = text.toLowerCase().trim();
      if (t.includes('gewonnen') || t.includes('won') || t === 'sieg') return 'win';
      if (t.includes('verloren') || t.includes('lost') || t === 'niederlage') return 'loss';
      if (t.includes('remis') || t.includes('draw') || t.includes('unentschieden')) return 'draw';
      return null;
    },

    /**
     * Parse a date string from SpielByWeb rows.
     * SpielByWeb typically shows DD.MM.YYYY or YYYY-MM-DD.
     * @returns {string|null} Date in YYYY-MM-DD format
     */
    parseDate(text) {
      text = text.trim();

      // YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

      // DD.MM.YYYY
      const dmy = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

      // DD.MM.YY
      const dmyShort = text.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
      if (dmyShort) {
        const year = parseInt(dmyShort[3], 10) + 2000;
        return `${year}-${dmyShort[2]}-${dmyShort[1]}`;
      }

      return null;
    },

    /**
     * Scrape finished game rows from the current page DOM.
     * Looks for a table containing finished games; tries multiple selectors
     * to be robust across SpielByWeb page variants.
     * @returns {Object[]} Array of raw play objects
     */
    extractPlays() {
      const plays = [];

      // SpielByWeb game list: rows with class "won", "lost", "draw", or within
      // a table that has finished games. Try progressively wider selectors.
      const rows = Array.from(
        document.querySelectorAll(
          'table.gamelist tr.finished, table#myGames tr[class], table tr.won, table tr.lost, table tr.draw'
        )
      );

      // Fallback: any table row that has a result-like cell
      const fallbackRows =
        rows.length === 0
          ? Array.from(document.querySelectorAll('table tr')).filter((tr) => {
              const text = tr.textContent;
              return (
                (text.includes('gewonnen') ||
                  text.includes('verloren') ||
                  text.includes('Remis')) &&
                tr.querySelectorAll('td').length >= 3
              );
            })
          : [];

      const allRows = rows.length > 0 ? rows : fallbackRows;

      for (const row of allRows) {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 3) continue;

        // Column layout can vary; try to identify cells by content heuristics
        let gameName = '';
        let dateStr = '';
        let resultText = '';
        let playerCount = null;

        for (const cell of cells) {
          const text = cell.textContent.trim();

          // Game name: typically the first non-empty text cell or a cell with an <a>
          if (!gameName && cell.querySelector('a') && text.length > 2) {
            gameName = text;
            continue;
          }

          // Date: matches date pattern
          if (!dateStr && /\d{2}[./]\d{2}[./]\d{2,4}|\d{4}-\d{2}-\d{2}/.test(text)) {
            dateStr = text;
            continue;
          }

          // Result: contains win/loss/draw keywords
          if (
            !resultText &&
            (text.includes('gewonnen') ||
              text.includes('verloren') ||
              text.includes('Remis') ||
              text.toLowerCase().includes('won') ||
              text.toLowerCase().includes('lost') ||
              text.toLowerCase().includes('draw'))
          ) {
            resultText = text;
            continue;
          }

          // Player count: small integer
          const num = parseInt(text, 10);
          if (!playerCount && !isNaN(num) && num >= 2 && num <= 10 && String(num) === text) {
            playerCount = num;
          }
        }

        // Row class fallback for result (SpielByWeb adds won/lost/draw as class)
        if (!resultText) {
          if (row.classList.contains('won')) resultText = 'won';
          else if (row.classList.contains('lost')) resultText = 'lost';
          else if (row.classList.contains('draw')) resultText = 'draw';
        }

        if (!gameName) continue;

        const date = this.parseDate(dateStr);
        if (!date) continue;

        plays.push({
          gameName: gameName.trim(),
          date,
          playerCount,
          outcome: this.parseResult(resultText),
        });
      }

      return plays;
    },
  };
}

if (typeof window !== 'undefined') window.SpielByWebScraper = SpielByWebScraper;
if (typeof module !== 'undefined' && module.exports) module.exports = { SpielByWebScraper };
