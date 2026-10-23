// Shared game-title normalization for wishlist matching.
// Used by wishlist-badge.js and catalog-badges.js (content scripts) and popup.js.
function normalizeName(name) {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// BGM's title search is fuzzy: it returns *something* for almost any query
// (accessories, sleeves, ...). Decide whether the top result really is the
// retailer's product, from the shared distinctive words of the two titles.
const TITLE_STOPWORDS = new Set(
  (
    'the and for with les des une aux pour par sur dans avec jeu jeux game games de du la le un et ' +
    'en of to sleeves sleeve standard booster display classeur puzzle cartes carte promo box set'
  ).split(' ')
);

function titleTokens(title) {
  return String(title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3 && !TITLE_STOPWORDS.has(t));
}

function isConfidentTitleMatch(retailerTitle, gameName) {
  const a = titleTokens(retailerTitle);
  const b = titleTokens(gameName);
  if (!a.length || !b.length) return false;
  const inB = new Set(b);
  const shared = a.filter((t) => inB.has(t));
  if (shared.length >= 2) return true;
  // Everything distinctive in the shorter title appears in the longer one
  const [shorter, longer] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)];
  if (shorter.every((t) => longer.has(t))) return true;
  // A single shared word counts only when it leads both titles (a series name)
  return shared.length === 1 && a[0] === b[0] && a[0].length >= 5;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeName, isConfidentTitleMatch };
}
