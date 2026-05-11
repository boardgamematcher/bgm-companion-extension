const { describe, test, expect } = require('@jest/globals');
const YucataMapper = require('../src/lib/yucata-mapper.js');

describe('YucataMapper', () => {
  const mockStorage = {
    mappings: {
      1: 822,
      2: 1111,
      999: null,
    },
  };

  test('maps known Yucata ID to BGG ID', () => {
    const mapper = YucataMapper(mockStorage);
    const result = mapper.mapGameId('1');
    expect(result).toBe(822);
  });

  test('handles unmapped Yucata ID', () => {
    const mapper = YucataMapper(mockStorage);
    const result = mapper.mapGameId('999');
    expect(result).toBeNull();
  });

  test('maps multiple game IDs', () => {
    const mapper = YucataMapper(mockStorage);
    const results = mapper.mapGameIds(['1', '2', '999']);
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ yucataId: '1', bggId: 822 });
    expect(results[1]).toEqual({ yucataId: '2', bggId: 1111 });
    expect(results[2]).toEqual({ yucataId: '999', bggId: null });
  });
});
