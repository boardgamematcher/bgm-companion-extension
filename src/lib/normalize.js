// Shared game-title normalization for wishlist matching.
// Used by wishlist-badge.js (content script) and popup.js.
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeName };
}
