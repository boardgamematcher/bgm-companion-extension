const { describe, test, expect, beforeEach } = require('@jest/globals');
const {
  extractGames,
  extractFromNextData,
  getByPath,
  formatPrice,
  cleanName,
  getReactReduxState,
} = require('../src/content/content-script.js');

const { normalizeName } = require('../src/lib/normalize.js');

// Helper to install a __NEXT_DATA__ payload into the jsdom document.
function setNextData(payload) {
  document.body.innerHTML = '';
  const script = document.createElement('script');
  script.id = '__NEXT_DATA__';
  script.type = 'application/json';
  script.textContent = JSON.stringify(payload);
  document.body.appendChild(script);
}

describe('getByPath', () => {
  test('walks a simple dot path', () => {
    expect(getByPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  test('returns undefined for missing path', () => {
    expect(getByPath({ a: 1 }, 'a.b.c')).toBeUndefined();
  });

  test('handles array index notation', () => {
    expect(getByPath({ items: [{ url: 'first' }, { url: 'second' }] }, 'items[0].url')).toBe(
      'first'
    );
    expect(getByPath({ items: [{ url: 'first' }, { url: 'second' }] }, 'items[1].url')).toBe(
      'second'
    );
  });

  test('returns undefined when array index is out of range', () => {
    expect(getByPath({ items: [] }, 'items[0].url')).toBeUndefined();
  });

  test('returns undefined for null/empty input', () => {
    expect(getByPath(null, 'a.b')).toBeUndefined();
    expect(getByPath({}, '')).toBeUndefined();
  });
});

describe('formatPrice', () => {
  test('appends currency symbol when provided', () => {
    expect(formatPrice(12.99, '€')).toBe('12.99 €');
  });

  test('returns plain string when no currency', () => {
    expect(formatPrice(12.99)).toBe('12.99');
  });

  test('returns null for null/empty value', () => {
    expect(formatPrice(null, '€')).toBeNull();
    expect(formatPrice('', '€')).toBeNull();
  });
});

describe('cleanName', () => {
  test('strips piece-count suffix in French', () => {
    const cleanup = {
      strip_suffix_pattern: '\\s*-\\s*\\d+\\s*pi[eè]ces?\\s*$',
    };
    expect(cleanName('Schmidt - Puzzle Mer - 1000 pièces', cleanup)).toBe('Schmidt - Puzzle Mer');
  });

  test('strips chained piece + age descriptors', () => {
    const cleanup = {
      strip_suffix_pattern: '(\\s*[-–]\\s*(?:\\d+\\s*pi[eè]ces?|d[eè]s?\\s+\\d+\\s*ans?))+\\s*$',
    };
    expect(cleanName('Schmidt - Puzzle Le panda - 1000 pièces - dès 14 ans', cleanup)).toBe(
      'Schmidt - Puzzle Le panda'
    );
  });

  test('does not strip mid-name digits', () => {
    const cleanup = {
      strip_suffix_pattern: '\\s*-\\s*\\d+\\s*pi[eè]ces?\\s*$',
    };
    // Mid-name "1000 pièces" inside the title is preserved; only trailing matches.
    expect(cleanName('Trefl - Puzzle 1000 pièces Héros de Marvel', cleanup)).toBe(
      'Trefl - Puzzle 1000 pièces Héros de Marvel'
    );
  });

  test('returns input unchanged when no cleanup config', () => {
    expect(cleanName('Catan', null)).toBe('Catan');
  });

  test('strips trailing language code suffix — Fantasywelt (BGM-917)', () => {
    const cleanup = { strip_suffix_pattern: '\\s*\\([A-Z]{2,3}\\)\\s*$' };
    expect(cleanName('Catan (DE)', cleanup)).toBe('Catan');
    expect(cleanName('Catan (EN)', cleanup)).toBe('Catan');
    expect(cleanName('Pandemic (FR)', cleanup)).toBe('Pandemic');
    expect(cleanName('Catan', cleanup)).toBe('Catan');
    // Full matching chain: DOM title cleaned+normalized matches wishlist entry
    expect(normalizeName(cleanName('Catan (DE)', cleanup))).toBe(normalizeName('Catan'));
  });

  test('strips German/Italian/Spanish piece descriptors', () => {
    const cleanup = {
      strip_suffix_pattern: '\\s*-\\s*\\d+\\s*(?:pezzi|piezas?|Teile|stuks)\\s*$',
    };
    expect(cleanName('Schmidt - Mer - 1000 Teile', cleanup)).toBe('Schmidt - Mer');
    expect(cleanName('Schmidt - Mer - 1000 pezzi', cleanup)).toBe('Schmidt - Mer');
    expect(cleanName('Schmidt - Mer - 1000 piezas', cleanup)).toBe('Schmidt - Mer');
  });
});

describe('extractFromNextData', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const veepeePattern = {
    data_source: 'next_data',
    next_data: {
      items_path: 'props.initialState.CatalogItems.result.items',
      fields: {
        name: 'name',
        price: 'pricing.price.value',
        sale_price: 'pricing.retailPrice.value',
        currency: 'pricing.currency.symbol',
        image: 'medias[0].url',
      },
      name_cleanup: {
        strip_suffix_pattern: '(\\s*[-–]\\s*(?:\\d+\\s*pi[eè]ces?|d[eè]s?\\s+\\d+\\s*ans?))+\\s*$',
      },
    },
    filters: { deduplicate: true },
  };

  test('extracts items from a Veepee-shaped payload', () => {
    setNextData({
      props: {
        initialState: {
          CatalogItems: {
            result: {
              items: [
                {
                  name: 'Schmidt - Puzzle Mer - 1000 pièces - dès 12 ans',
                  pricing: {
                    price: { value: 9.99 },
                    retailPrice: { value: 17.6 },
                    currency: { symbol: '€' },
                  },
                  medias: [{ url: 'https://example.com/img.jpg' }],
                },
                {
                  name: 'Winning Moves - Puzzle Mario Kart World - 1000 pièces - à partir de 8 ans',
                  pricing: {
                    price: { value: 12.99 },
                    retailPrice: { value: 18.99 },
                    currency: { symbol: '€' },
                  },
                  medias: [{ url: 'https://example.com/mk.jpg' }],
                },
              ],
            },
          },
        },
      },
    });

    const games = extractFromNextData(veepeePattern);
    expect(games).toHaveLength(2);
    expect(games[0]).toEqual({
      name: 'Schmidt - Puzzle Mer',
      image: 'https://example.com/img.jpg',
      price: '9.99 €',
      sale_price: '17.6 €',
    });
    // Note: "à partir de 8 ans" is part of the broader pattern but not
    // included in this minimal test cleanup regex; only "1000 pièces" strips.
    expect(games[1].name).toBe(
      'Winning Moves - Puzzle Mario Kart World - 1000 pièces - à partir de 8 ans'
    );
  });

  test('returns empty array when __NEXT_DATA__ is absent', () => {
    expect(extractFromNextData(veepeePattern)).toEqual([]);
  });

  test('returns empty array when items path resolves to non-array', () => {
    setNextData({ props: { initialState: { CatalogItems: { result: {} } } } });
    expect(extractFromNextData(veepeePattern)).toEqual([]);
  });

  test('skips items with missing or non-string name', () => {
    setNextData({
      props: {
        initialState: {
          CatalogItems: {
            result: {
              items: [
                { pricing: { price: { value: 1 } } },
                { name: '', pricing: { price: { value: 1 } } },
                { name: 'Catan', pricing: { price: { value: 1 } } },
              ],
            },
          },
        },
      },
    });
    const games = extractFromNextData(veepeePattern);
    expect(games).toHaveLength(1);
    expect(games[0].name).toBe('Catan');
  });

  test('deduplicates by cleaned name', () => {
    setNextData({
      props: {
        initialState: {
          CatalogItems: {
            result: {
              items: [
                { name: 'Schmidt - Puzzle Mer - 1000 pièces' },
                { name: 'Schmidt - Puzzle Mer - 1000 pièces - dès 12 ans' },
              ],
            },
          },
        },
      },
    });
    const games = extractFromNextData(veepeePattern);
    expect(games).toHaveLength(1);
    expect(games[0].name).toBe('Schmidt - Puzzle Mer');
  });

  test('applies exclude filter against cleaned name', () => {
    setNextData({
      props: {
        initialState: {
          CatalogItems: {
            result: {
              items: [{ name: 'Schmidt - Puzzle Mer - 1000 pièces' }, { name: 'Hasbro - Catan' }],
            },
          },
        },
      },
    });
    const games = extractFromNextData({
      ...veepeePattern,
      filters: { exclude: ['^Schmidt'] },
    });
    expect(games).toHaveLength(1);
    expect(games[0].name).toBe('Hasbro - Catan');
  });

  test('supports multiple items_paths (in-stock + out-of-stock)', () => {
    setNextData({
      props: {
        initialState: {
          CatalogItems: { result: { items: [{ name: 'Catan' }] } },
          OutOfStockItems: { result: { items: [{ name: 'Azul' }] } },
        },
      },
    });
    const pattern = {
      ...veepeePattern,
      next_data: {
        ...veepeePattern.next_data,
        items_path: [
          'props.initialState.CatalogItems.result.items',
          'props.initialState.OutOfStockItems.result.items',
        ],
      },
    };
    const games = extractFromNextData(pattern);
    expect(games.map((g) => g.name)).toEqual(['Catan', 'Azul']);
  });

  test('survives malformed JSON in __NEXT_DATA__', () => {
    document.body.innerHTML = '';
    const script = document.createElement('script');
    script.id = '__NEXT_DATA__';
    script.type = 'application/json';
    script.textContent = '{ not json';
    document.body.appendChild(script);
    expect(extractFromNextData(veepeePattern)).toEqual([]);
  });

  test('handles missing pricing/media fields gracefully', () => {
    setNextData({
      props: {
        initialState: {
          CatalogItems: { result: { items: [{ name: 'Catan' }] } },
        },
      },
    });
    const games = extractFromNextData(veepeePattern);
    expect(games[0]).toEqual({
      name: 'Catan',
      image: null,
      price: null,
      sale_price: null,
    });
  });
});

describe('extractGames dispatch', () => {
  test('routes data_source=next_data through extractFromNextData', () => {
    setNextData({
      props: {
        initialState: {
          CatalogItems: { result: { items: [{ name: 'Brass Birmingham' }] } },
        },
      },
    });
    const games = extractGames({
      data_source: 'next_data',
      next_data: {
        items_path: 'props.initialState.CatalogItems.result.items',
        fields: { name: 'name' },
      },
    });
    expect(games).toEqual([
      { name: 'Brass Birmingham', image: null, price: null, sale_price: null },
    ]);
  });

  test('returns empty array for null pattern', () => {
    expect(extractGames(null)).toEqual([]);
  });

  test('returns empty array for pattern with no selector and no data_source', () => {
    expect(extractGames({ name: 'broken' })).toEqual([]);
  });
});

describe('getReactReduxState', () => {
  test('returns null when #__next element is absent', () => {
    document.body.innerHTML = '';
    expect(getReactReduxState()).toBeNull();
  });

  test('returns null when #__next has no React fiber key', () => {
    document.body.innerHTML = '<div id="__next"></div>';
    expect(getReactReduxState()).toBeNull();
  });

  test('reads store from memoizedProps.store on a fiber node', () => {
    document.body.innerHTML = '<div id="__next"></div>';
    const root = document.getElementById('__next');
    const fakeState = { CatalogItems: { result: { items: [{ name: 'Catan' }] } } };
    const fakeStore = { getState: () => fakeState };
    // Simulate a React fiber with the store on memoizedProps
    root.__reactFiber$test = { memoizedProps: { store: fakeStore }, return: null };
    expect(getReactReduxState()).toBe(fakeState);
    delete root.__reactFiber$test;
  });

  test('reads store from memoizedProps.value.store (react-redux context API)', () => {
    document.body.innerHTML = '<div id="__next"></div>';
    const root = document.getElementById('__next');
    const fakeState = { CatalogItems: { result: { items: [{ name: 'Azul' }] } } };
    const fakeStore = { getState: () => fakeState };
    root.__reactFiber$test = {
      memoizedProps: { value: { store: fakeStore } },
      return: null,
    };
    expect(getReactReduxState()).toBe(fakeState);
    delete root.__reactFiber$test;
  });
});

describe('extractFromNextData — SPA navigation fallback', () => {
  const veepeePattern = {
    data_source: 'next_data',
    next_data: {
      items_path: 'props.initialState.CatalogItems.result.items',
      fields: { name: 'name' },
    },
    filters: { deduplicate: true },
  };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('falls back to Redux store when __NEXT_DATA__ has no items (SPA navigation)', () => {
    // Simulate stale __NEXT_DATA__ from the homepage (no CatalogItems)
    const script = document.createElement('script');
    script.id = '__NEXT_DATA__';
    script.type = 'application/json';
    script.textContent = JSON.stringify({ props: { initialState: {} }, buildId: 'abc' });
    document.body.appendChild(script);

    // Simulate #__next with a Redux fiber holding catalog data
    const next = document.createElement('div');
    next.id = '__next';
    document.body.appendChild(next);
    const fakeState = { CatalogItems: { result: { items: [{ name: 'Brass Birmingham' }] } } };
    next.__reactFiber$spa = {
      memoizedProps: { store: { getState: () => fakeState } },
      return: null,
    };

    const games = extractFromNextData(veepeePattern);
    expect(games).toHaveLength(1);
    expect(games[0].name).toBe('Brass Birmingham');

    delete next.__reactFiber$spa;
  });

  test('uses __NEXT_DATA__ when it already has items (direct page load)', () => {
    // Simulate a direct page load with CatalogItems in __NEXT_DATA__
    const script = document.createElement('script');
    script.id = '__NEXT_DATA__';
    script.type = 'application/json';
    script.textContent = JSON.stringify({
      props: {
        initialState: {
          CatalogItems: { result: { items: [{ name: 'Wingspan' }] } },
        },
      },
    });
    document.body.appendChild(script);

    // Even if a Redux store exists it should not be consulted
    const next = document.createElement('div');
    next.id = '__next';
    document.body.appendChild(next);
    const fakeState = { CatalogItems: { result: { items: [{ name: 'Azul' }] } } };
    next.__reactFiber$spa = {
      memoizedProps: { store: { getState: () => fakeState } },
      return: null,
    };

    const games = extractFromNextData(veepeePattern);
    expect(games).toHaveLength(1);
    expect(games[0].name).toBe('Wingspan');

    delete next.__reactFiber$spa;
  });
});
