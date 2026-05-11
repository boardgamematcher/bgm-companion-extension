const { describe, test, expect } = require('@jest/globals');
const YucataMapper = require('../src/lib/yucata-mapper.js');
const PlaysAPI = require('../src/lib/plays-api.js');

describe('Yucata Import Pipeline', () => {
  const mockMappingData = {
    mappings: {
      1: 822,
      2: 9209,
      999: null,
    },
  };

  const mockRawPlays = [
    { yucataId: '1', gameName: 'Carcassonne', date: '2026-04-09', playerCount: 4, outcome: 'win' },
    {
      yucataId: '2',
      gameName: 'Ticket to Ride',
      date: '2026-04-08',
      playerCount: 3,
      outcome: 'loss',
    },
    {
      yucataId: '999',
      gameName: 'Unknown Game',
      date: '2026-04-07',
      playerCount: 2,
      outcome: 'win',
    },
  ];

  let fetchCalls = [];
  const mockFetch = (url, options) => {
    fetchCalls.push({ url, options });
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  };

  test('full import pipeline: scrape -> map -> POST', async () => {
    fetchCalls = [];

    // Step 1: Create mapper
    const mapper = YucataMapper(mockMappingData);

    // Step 2: Map games (filtering unmapped)
    const mappedPlays = mockRawPlays
      .map((play) => {
        const boardgame_id = mapper.mapGameId(play.yucataId);
        if (!boardgame_id) return null;
        return {
          gameName: play.gameName,
          boardgame_id,
          date: play.date,
          playerCount: play.playerCount,
          outcome: play.outcome,
        };
      })
      .filter((play) => play !== null);

    expect(mappedPlays).toHaveLength(2);
    expect(mappedPlays[0].boardgame_id).toBe(822);
    expect(mappedPlays[1].boardgame_id).toBe(9209);

    // Step 3: POST to API
    const api = PlaysAPI('http://localhost:3000', mockFetch);
    const results = await api.postPlays(mappedPlays);

    expect(results).toHaveLength(2);
    expect(fetchCalls).toHaveLength(2);

    // Verify payload structure
    const firstCall = JSON.parse(fetchCalls[0].options.body);
    expect(firstCall.source).toBe('yucata_import');
    expect(firstCall.boardgame_id).toBe(822);
    expect(firstCall.gameName).toBe('Carcassonne');
  });
});
