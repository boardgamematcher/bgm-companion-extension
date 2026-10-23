const { describe, test, expect } = require('@jest/globals');
const { normalizeName, isConfidentTitleMatch } = require('../src/lib/normalize.js');

describe('normalizeName', () => {
  test('lowercases and strips punctuation', () => {
    expect(normalizeName('Catan')).toBe('catan');
    expect(normalizeName('Catan: Cities & Knights')).toBe('catan cities knights');
  });

  test('collapses whitespace', () => {
    expect(normalizeName('  Azul  ')).toBe('azul');
    expect(normalizeName('Brass  Birmingham')).toBe('brass birmingham');
  });

  test('strips typographic apostrophes and backticks', () => {
    expect(normalizeName("L'Île Interdite")).toBe('l le interdite');
    expect(normalizeName('L’Île Interdite')).toBe('l le interdite');
  });

  test('returns empty string for blank input', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName('   ')).toBe('');
  });

  test('returns empty string for non-string input', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
    expect(normalizeName(42)).toBe('');
  });

  test('wishlist title matches page title after minor punctuation differences', () => {
    // Wishlist: "Catan" vs page: "Catan." (trailing dot)
    expect(normalizeName('Catan')).toBe(normalizeName('Catan.'));
    // Colon vs no colon
    expect(normalizeName('Ticket to Ride Europe')).toBe(normalizeName('Ticket to Ride: Europe'));
  });
});

describe('isConfidentTitleMatch', () => {
  test.each([
    ['Sherlock : Connectez les Indices', 'Sherlock: Case Connection'],
    ["L'Île des Chats - Explore & Draw", 'The Isle of Cats: Explore & Draw'],
    ["Kingdom Rush - Vez'Nan vs Moloch", "Kingdom Rush: Rift in Time – Vez'nan vs. Moloch"],
    ['Catan', 'CATAN'],
    ['Carcassonne', 'Carcassonne'],
    ['Dixit', 'Dixit: Odyssey'],
  ])('accepts %s ~ %s', (title, name) => {
    expect(isConfidentTitleMatch(title, name)).toBe(true);
  });

  test.each([
    ['Classeur Ultra Pro 9 cases', 'Chasseur de tête'],
    ['Sleeves Standard Dragon Shield', 'Tanto Cuore: Standard Art Sleeves – Claudine'],
    ['Puzzle 1000 pièces Paysage', '1 vs. 100: The Puzzle Game'],
  ])('rejects %s ~ %s', (title, name) => {
    expect(isConfidentTitleMatch(title, name)).toBe(false);
  });

  test('rejects empty input', () => {
    expect(isConfidentTitleMatch('', 'Catan')).toBe(false);
    expect(isConfidentTitleMatch('Catan', '')).toBe(false);
  });
});
