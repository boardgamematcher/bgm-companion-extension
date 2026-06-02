// Shared BGG/BGM community-rating helpers — keep the popup, game overlay and
// catalog badges visually identical. The website shows the soft Bayesian
// display_rating on a 0–5 scale (BGM-1230/1231); these mirror that.

// Normalize a rating to the 0–5 display scale. The API returns 0–5 today;
// values > 5 are treated as legacy 0–10 and halved, so the widgets stay
// correct across the migration in either direction.
function normalizeBgg(rating) {
  return rating > 5 ? rating / 2 : rating;
}

// Pick the best community-rating value to display from a game payload.
// BGM-1231: prefer ``display_rating`` (soft Bayesian — honest for low-N
// games), then fall back to legacy ``bayes_average`` (was raw community
// average since BGM-1235). Returns null when both are absent.
function pickDisplayRating(game) {
  if (!game) return null;
  const raw = game.display_rating ?? game.bayes_average ?? null;
  return raw == null ? null : normalizeBgg(Number(raw));
}

// Map a normalized (0–5) rating to a Steam-style sentiment label.
function ratingTier(rating) {
  if (rating >= 4.0) return 'Outstanding';
  if (rating >= 3.75) return 'Excellent';
  if (rating >= 3.5) return 'Very good';
  if (rating >= 3.25) return 'Good';
  if (rating >= 3.0) return 'Solid';
  if (rating >= 2.75) return 'Mixed';
  if (rating >= 2.5) return 'Below average';
  return 'Poor';
}

// Percentage (0–100) of the 5-star bar to fill for a normalized 0–5 rating.
// e.g. 3.5 → 70, 4.0 → 80.
function ratingFillPercent(rating) {
  return Math.max(0, Math.min(100, Math.round(rating * 20)));
}

// Format a vote count for compact display alongside the rating.
// 12,345 → "12K", 1,234,000 → "1.2M", < 10,000 → "1,234" with locale grouping.
function formatVoteCount(n) {
  if (n == null) return '';
  const count = Number(n);
  if (!Number.isFinite(count) || count <= 0) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${Math.round(count / 1000)}K`;
  return count.toLocaleString();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeBgg,
    pickDisplayRating,
    ratingTier,
    ratingFillPercent,
    formatVoteCount,
  };
}
