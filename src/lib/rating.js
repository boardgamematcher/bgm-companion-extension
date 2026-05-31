// Shared BGG/BGM community-rating helpers — keep the popup, game overlay and
// catalog badges visually identical. The website shows the Bayesian rating on
// a 0–5 scale; these mirror that (see game-overlay.js, which this consolidates).

// Normalize a bayes_average to the 0–5 display scale. The API returns 0–5
// today; values > 5 are treated as legacy 0–10 and halved, so the widgets
// stay correct across the migration in either direction.
function normalizeBgg(rating) {
  return rating > 5 ? rating / 2 : rating;
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeBgg, ratingTier, ratingFillPercent };
}
