const { describe, test, expect } = require('@jest/globals');
const { normalizeName } = require('../src/lib/normalize.js');

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
    expect(normalizeName('Ticket to Ride Europe')).toBe(
      normalizeName('Ticket to Ride: Europe')
    );
  });
});
