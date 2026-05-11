const { describe, test, expect } = require('@jest/globals');
const {
  BGAPlayerStatScraper,
  parseStatsTable,
  parseGameRankValue,
  zipRankSeries,
} = require('../src/content/bga-playerstat-scraper.js');

describe('BGAPlayerStatScraper', () => {
  describe('zipRankSeries', () => {
    test('pairs labels with values by their x/value key', () => {
      const labels = [
        { value: -10, text: '23 Apr' },
        { value: -5, text: '28 Apr' },
        { value: 0, text: '03 May' },
      ];
      const values = [
        { x: -10, y: 1300 },
        { x: -5, y: 1350 },
        { x: 0, y: 1400 },
      ];
      expect(zipRankSeries(labels, values)).toEqual([
        { daysFromToday: -10, elo: 1300, date: '23 Apr' },
        { daysFromToday: -5, elo: 1350, date: '28 Apr' },
        { daysFromToday: 0, elo: 1400, date: '03 May' },
      ]);
    });

    test('value with no matching label still returns the point with date=null', () => {
      const labels = [{ value: -10, text: '23 Apr' }];
      const values = [
        { x: -10, y: 1300 },
        { x: -5, y: 1350 },
      ];
      expect(zipRankSeries(labels, values)).toEqual([
        { daysFromToday: -10, elo: 1300, date: '23 Apr' },
        { daysFromToday: -5, elo: 1350, date: null },
      ]);
    });

    test('empty input → empty output', () => {
      expect(zipRankSeries([], [])).toEqual([]);
    });
  });

  describe('parseGameRankValue', () => {
    test('extracts ELO from gamerank_value span', () => {
      const html =
        '<div class="gamerank gamerank_good "><span class="gamerank_value">240</span></div>';
      expect(parseGameRankValue(html)).toBe(240);
    });

    test('returns null for co-op pages with no rank span', () => {
      const html = '<div class="gamerank_no">(non classé)</div>';
      expect(parseGameRankValue(html)).toBeNull();
    });
  });

  describe('parseStatsTable', () => {
    test('returns empty object when table is missing', () => {
      expect(parseStatsTable('<html></html>')).toEqual({});
    });

    test('parses 3-column rows into a label-keyed dict', () => {
      const html = `
        <table id="player_stats_table" class="statstable">
          <tr id="player_stats_header">
            <th></th>
            <th>Moyenne de Me</th>
            <th>Moyenne de tous les joueurs</th>
            <th>Moyenne des gagnants</th>
          </tr>
          <tr>
            <th>Temps de réflexion</th>
            <td>199702.46 min</td><td>220800.68 min</td><td>146511 min</td>
          </tr>
          <tr>
            <th>Time bonus number</th>
            <td></td><td>94.37</td><td>94.76</td>
          </tr>
        </table>
      `;
      expect(parseStatsTable(html)).toEqual({
        'Temps de réflexion': {
          player: 199702.46,
          allPlayers: 220800.68,
          winners: 146511,
        },
        'Time bonus number': {
          player: null,
          allPlayers: 94.37,
          winners: 94.76,
        },
      });
    });

    test('skips rows with fewer than 4 cells', () => {
      const html = `
        <table id="player_stats_table">
          <tr><th>Header</th><th>One</th></tr>
          <tr><th>Bad row</th><td>1</td><td>2</td></tr>
        </table>
      `;
      expect(parseStatsTable(html)).toEqual({});
    });
  });

  describe('getRankEvolution', () => {
    test('calls the correct endpoint and shapes the response', async () => {
      const calls = [];
      const mockFetch = async (url, opts) => {
        calls.push({ url, opts });
        return {
          ok: true,
          json: async () => ({
            status: 1,
            data: {
              rank_evolution: {
                labels: [
                  { value: -10, text: '23 Apr' },
                  { value: 0, text: '03 May' },
                ],
                values: [
                  { x: -10, y: 1330 },
                  { x: 0, y: 1541 },
                ],
              },
              hide_y: false,
            },
          }),
        };
      };

      const scraper = BGAPlayerStatScraper(mockFetch, 'tok-abc');
      const result = await scraper.getRankEvolution('84147370', 1845);

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(
        '/playerstat/playerstat/getrankevol.html?player=84147370&game=1845'
      );
      expect(calls[0].opts.headers['x-request-token']).toBe('tok-abc');
      expect(result.hideY).toBe(false);
      expect(result.points).toEqual([
        { daysFromToday: -10, elo: 1330, date: '23 Apr' },
        { daysFromToday: 0, elo: 1541, date: '03 May' },
      ]);
    });

    test('passes through hide_y for co-op games', async () => {
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          status: 1,
          data: {
            rank_evolution: { labels: [], values: [] },
            hide_y: true,
          },
        }),
      });
      const scraper = BGAPlayerStatScraper(mockFetch, 'tok');
      const result = await scraper.getRankEvolution('1', 1879);
      expect(result.hideY).toBe(true);
      expect(result.points).toEqual([]);
    });

    test('throws when no token is available', async () => {
      const scraper = BGAPlayerStatScraper(async () => {}, null);
      await expect(scraper.getRankEvolution('1', 1)).rejects.toThrow('request token');
    });

    test('throws on non-OK HTTP response', async () => {
      const mockFetch = async () => ({ ok: false, status: 500, statusText: 'Server Error' });
      const scraper = BGAPlayerStatScraper(mockFetch, 'tok');
      await expect(scraper.getRankEvolution('1', 1)).rejects.toThrow('500');
    });

    test('throws when BGA returns status: 0', async () => {
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({ status: 0, error: 'denied' }),
      });
      const scraper = BGAPlayerStatScraper(mockFetch, 'tok');
      await expect(scraper.getRankEvolution('1', 1)).rejects.toThrow('rejected');
    });
  });

  describe('getLastResults', () => {
    test('hits the lastresult endpoint and returns the news array', async () => {
      const calls = [];
      const mockFetch = async (url) => {
        calls.push(url);
        return {
          ok: true,
          json: async () => ({
            status: 1,
            data: { news: [{ id: '1', html: '<div></div>' }] },
          }),
        };
      };
      const scraper = BGAPlayerStatScraper(mockFetch, 'tok');
      const news = await scraper.getLastResults('84147370', 1845, 25);
      expect(calls[0]).toBe(
        '/message/board?type=lastresult&id=1845&arg=84147370&social=false&per_page=25'
      );
      expect(news).toHaveLength(1);
    });

    test('defaults perPage to 10 when omitted', async () => {
      const calls = [];
      const mockFetch = async (url) => {
        calls.push(url);
        return {
          ok: true,
          json: async () => ({ status: 1, data: { news: [] } }),
        };
      };
      const scraper = BGAPlayerStatScraper(mockFetch, 'tok');
      await scraper.getLastResults('1', 2);
      expect(calls[0]).toContain('per_page=10');
    });
  });
});
