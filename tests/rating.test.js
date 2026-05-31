const { describe, test, expect } = require('@jest/globals');
const { normalizeBgg, ratingTier, ratingFillPercent } = require('../src/lib/rating.js');

describe('normalizeBgg', () => {
  test('passes through 0–5 values unchanged (current API scale)', () => {
    expect(normalizeBgg(2.8)).toBe(2.8);
    expect(normalizeBgg(5)).toBe(5);
    expect(normalizeBgg(0)).toBe(0);
  });

  test('halves legacy 0–10 values (> 5)', () => {
    expect(normalizeBgg(7.6)).toBeCloseTo(3.8);
    expect(normalizeBgg(10)).toBe(5);
  });
});

describe('ratingTier', () => {
  test('maps the 0–5 scale to sentiment labels', () => {
    expect(ratingTier(4.2)).toBe('Outstanding');
    expect(ratingTier(4.0)).toBe('Outstanding');
    expect(ratingTier(3.8)).toBe('Excellent');
    expect(ratingTier(3.5)).toBe('Very good');
    expect(ratingTier(3.0)).toBe('Solid');
    expect(ratingTier(2.5)).toBe('Below average');
    expect(ratingTier(1.0)).toBe('Poor');
  });
});

describe('ratingFillPercent', () => {
  test('converts a 0–5 rating to a 0–100 fill width', () => {
    expect(ratingFillPercent(3.5)).toBe(70);
    expect(ratingFillPercent(4.0)).toBe(80);
    expect(ratingFillPercent(5)).toBe(100);
    expect(ratingFillPercent(0)).toBe(0);
  });

  test('clamps out-of-range input', () => {
    expect(ratingFillPercent(6)).toBe(100);
    expect(ratingFillPercent(-1)).toBe(0);
  });
});
