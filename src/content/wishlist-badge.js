// Wishlist badge content script — BGM-895
// Injects an "✓ On your wishlist" badge next to board game titles on supported
// retailer pages for games the user has saved to their BGM wishlist.
(async function bgmWishlistBadge() {
  if (typeof chrome === 'undefined' || !chrome.runtime) return;

  let pattern;
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'checkSiteSupport',
      domain: window.location.hostname,
      url: window.location.href,
    });
    if (!res || !res.supported || !res.pattern) return;
    pattern = res.pattern;
  } catch (_e) {
    return;
  }

  // Only proceed when a selector is present (next_data-only profiles have no DOM selector)
  if (!pattern.selector && pattern.data_source === 'next_data') return;

  let wishlist;
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getWishlist' });
    wishlist = res && res.wishlist;
  } catch (_e) {
    return;
  }
  if (!wishlist || wishlist.length === 0) return;

  const badgeLabel = chrome.i18n.getMessage('wishlistBadgeLabel') || '✓ On your wishlist';

  // Pre-normalize wishlist titles once
  const normalized = wishlist.map((item) => ({
    slug: item.slug,
    norm: normalizeName(item.title),
  }));

  let bgmWishlistCount = 0;

  function scanAndBadge() {
    // Build the selector: when a card_selector is present use the inner title
    // selector so we match the per-card element, not random page text.
    const titleSelector = pattern.card_selector
      ? `${pattern.card_selector} ${pattern.selector}`
      : pattern.selector;

    const elements = document.querySelectorAll(titleSelector);
    for (const el of elements) {
      // Skip if we already injected a badge for this element
      if (el.dataset.bgmBadgeDone) continue;

      const text = el.textContent.trim();
      if (!text) continue;

      const pageNorm = normalizeName(text);
      const match = normalized.find((item) => pageNorm === item.norm);
      if (!match) continue;

      el.dataset.bgmBadgeDone = '1';
      bgmWishlistCount++;

      const badge = document.createElement('a');
      badge.className = 'bgm-wishlist-badge';
      badge.href = `https://boardgamematcher.com/boardgames/${match.slug}`;
      badge.target = '_blank';
      badge.rel = 'noopener noreferrer';
      badge.textContent = badgeLabel;

      el.insertAdjacentElement('afterend', badge);
    }

    // Expose count for the extension popup to read
    document.documentElement.dataset.bgmWishlistCount = String(bgmWishlistCount);
  }

  scanAndBadge();

  // Re-scan when the DOM changes (infinite scroll, SPA navigation)
  let timer;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scanAndBadge, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
