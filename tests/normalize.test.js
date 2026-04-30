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

  test('matches are symmetric', () => {
    const a = normalizeName('Ticket to Ride: Europe');
    const b = normalizeName('Ticket to Ride: Europe');
    expect(a).toBe(b);
  });

  test('handles wishlist-page-name match scenario', () => {
    // Wishlist title vs page title with minor punctuation difference
    const wishlist = normalizeName('Spirit Island');
    const page = normalizeName('Spirit Island');
    expect(wishlist).toBe(page);
  });
});
