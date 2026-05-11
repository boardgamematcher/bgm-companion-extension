const { describe, test, expect } = require('@jest/globals');
const PlaysAPI = require('../src/lib/plays-api.js');

describe('PlaysAPI', () => {
  let fetchCalls = [];
  const mockFetch = (url, options) => {
    fetchCalls.push({ url, options });
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  };

  test('POSTs single play session', async () => {
    fetchCalls = [];
    const api = PlaysAPI('http://localhost:3000', mockFetch);
    const play = {
      gameName: 'Catan',
      bggId: 822,
      date: '2025-04-09',
      playerCount: 4,
      outcome: 'win',
      opponents: ['Alice', 'Bob', 'Charlie'],
    };

    const result = await api.postPlay(play);
    expect(result.success).toBe(true);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('http://localhost:3000/api/plays');
    const body = JSON.parse(fetchCalls[0].options.body);
    expect(body.source).toBe('yucata_import');
  });

  test('POSTs multiple play sessions', async () => {
    fetchCalls = [];
    const api = PlaysAPI('http://localhost:3000', mockFetch);
    const plays = [
      { gameName: 'Catan', bggId: 822, date: '2025-04-09', playerCount: 4, outcome: 'win' },
      {
        gameName: 'Ticket to Ride',
        bggId: 9209,
        date: '2025-04-08',
        playerCount: 3,
        outcome: 'loss',
      },
    ];

    const results = await api.postPlays(plays);
    expect(results).toHaveLength(2);
    expect(fetchCalls).toHaveLength(2);
  });
});
