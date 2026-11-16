const { describe, test, expect } = require('@jest/globals');
const {
  normalizeBgg,
  pickDisplayRating,
  ratingTier,
  ratingFillPercent,
  formatVoteCount,
} = require('../src/lib/rating.js');

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

describe('pickDisplayRating', () => {
  test('reads display_rating', () => {
    expect(pickDisplayRating({ display_rating: 3.4 })).toBe(3.4);
  });

  test('ignores legacy bayes_average (no fallback)', () => {
    expect(pickDisplayRating({ bayes_average: 4.5 })).toBeNull();
    expect(pickDisplayRating({ display_rating: null, bayes_average: 4.5 })).toBeNull();
  });

  test('returns null when display_rating is absent or 0 (unrated sentinel)', () => {
    expect(pickDisplayRating({})).toBeNull();
    expect(pickDisplayRating({ display_rating: null })).toBeNull();
    expect(pickDisplayRating({ display_rating: 0 })).toBeNull();
  });

  test('halves legacy 0–10 values', () => {
    expect(pickDisplayRating({ display_rating: 7.6 })).toBeCloseTo(3.8);
  });

  test('handles null game gracefully', () => {
    expect(pickDisplayRating(null)).toBeNull();
    expect(pickDisplayRating(undefined)).toBeNull();
  });
});

describe('formatVoteCount', () => {
  test('uses compact M for >= 1,000,000', () => {
    expect(formatVoteCount(1_234_000)).toBe('1.2M');
    expect(formatVoteCount(10_500_000)).toBe('10.5M');
  });

  test('uses compact K for >= 10,000', () => {
    expect(formatVoteCount(12_345)).toBe('12K');
    expect(formatVoteCount(99_500)).toBe('100K');
  });

  test('uses locale-grouped integer below 10,000', () => {
    const r = formatVoteCount(1234);
    // Either '1,234' (en) or '1 234' (fr) depending on locale; just check digits.
    expect(r.replace(/[^0-9]/g, '')).toBe('1234');
  });

  test('returns empty string for null, zero, or invalid values', () => {
    expect(formatVoteCount(null)).toBe('');
    expect(formatVoteCount(undefined)).toBe('');
    expect(formatVoteCount(0)).toBe('');
    expect(formatVoteCount(-5)).toBe('');
    expect(formatVoteCount(NaN)).toBe('');
  });
});
