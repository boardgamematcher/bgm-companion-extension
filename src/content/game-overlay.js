// BGM Game Overlay — BGM-976
// Injects a personal game status card on supported retailer product detail pages.

const BGM_BASE_URL = 'https://boardgamematcher.com';
const GAME_PATH_SEGMENTS = { en: 'game', fr: 'jeu', de: 'spiel', es: 'juego', it: 'gioco' };

function localizedGameUrl(slug) {
  const lang = (chrome.i18n.getUILanguage() || 'en').split('-')[0];
  const segment = GAME_PATH_SEGMENTS[lang] || 'game';
  const prefix = lang !== 'en' ? `/${lang}` : '';
  return (
    `${BGM_BASE_URL}${prefix}/${segment}/${encodeURIComponent(slug)}` +
    `?utm_source=extension&utm_medium=overlay&utm_campaign=retailer-overlay`
  );
}

// Map BGG bayes_average (≈4.5–8.5 in practice) to Steam-style sentiment + 5 stars.
function ratingTier(rating) {
  if (rating >= 8.0) return 'Outstanding';
  if (rating >= 7.5) return 'Excellent';
  if (rating >= 7.0) return 'Very good';
  if (rating >= 6.5) return 'Good';
  if (rating >= 6.0) return 'Solid';
  if (rating >= 5.5) return 'Mixed';
  if (rating >= 5.0) return 'Below average';
  return 'Poor';
}

// Returns the percentage (0–100) of 5 stars that should be visually filled
// for a /10 rating. e.g. 6.9 → 69, 8.0 → 80.
function ratingFillPercent(rating) {
  return Math.max(0, Math.min(100, Math.round(rating * 10)));
}

(async function bgmGameOverlay() {
  if (typeof chrome === 'undefined' || !chrome.runtime) return;

  // ── Per-site adapters ─────────────────────────────────────────────────────
  // Each adapter: { isProductPage(): bool, extractTitle(): string | null }

  const ADAPTERS = {
    'philibertnet.com': {
      isProductPage() {
        // Philibert product URLs: /fr/<publisher>/<id>-<slug>.html
        return /\/fr\/[^/]+\/\d+-[^/]+\.html/.test(location.pathname);
      },
      extractTitle() {
        // Philibert renders the clean product name in h1#product_name.
        // og:title is unusable ("Acheter <name> - Jeu de société - <publisher>")
        // and JSON-LD isn't always present server-side.
        const productName = document.querySelector('h1#product_name');
        if (productName) return productName.textContent.trim();

        // JSON-LD fallback (in case Philibert injects it later)
        for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
          try {
            const data = JSON.parse(el.textContent);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if ((item['@type'] === 'Product' || item['@type'] === 'Game') && item.name) {
                return item.name.trim();
              }
            }
          } catch (_) {
            // skip malformed JSON-LD blocks
          }
        }

        // Last resort: strip the Philibert prefix/suffix from og:title
        const og = document.querySelector('meta[property="og:title"]');
        if (og?.content) {
          return og.content
            .trim()
            .replace(/^Acheter\s+/i, '')
            .replace(/\s+-\s+Jeu de société.*$/i, '')
            .trim();
        }
        return document.querySelector('h1')?.textContent?.trim() ?? null;
      },
    },
  };

  // ── Find matching adapter ─────────────────────────────────────────────────

  const hostname = location.hostname.replace(/^www\./, '');
  const adapter = ADAPTERS[hostname];
  if (!adapter) return;
  if (!adapter.isProductPage()) return;

  const title = adapter.extractTitle();
  if (!title) return;

  // ── Deduplication: don't inject twice on the same page ───────────────────

  if (document.getElementById('bgm-overlay')) return;

  // ── Check session dismiss cache ───────────────────────────────────────────

  const cacheKey = `bgmOverlayDismissed:${location.href}`;
  try {
    const stored = await chrome.storage.session.get(cacheKey);
    if (stored[cacheKey]) return;
  } catch (_) {
    // ignore
  }

  // ── Build initial overlay (loading state) ─────────────────────────────────

  const overlay = document.createElement('div');
  overlay.id = 'bgm-overlay';
  overlay.innerHTML = `
    <div class="bgm-overlay-header">
      <a class="bgm-overlay-brand" href="https://boardgamematcher.com" target="_blank" rel="noopener noreferrer">
        <div class="bgm-overlay-logo">B</div>
        <span class="bgm-overlay-title">BoardGameMatcher</span>
      </a>
      <button class="bgm-overlay-dismiss" title="Dismiss" aria-label="Dismiss">×</button>
    </div>
    <div class="bgm-overlay-loading">
      <div class="bgm-spinner"></div>
      <span>Loading…</span>
    </div>
  `;

  overlay.querySelector('.bgm-overlay-dismiss').addEventListener('click', async () => {
    overlay.classList.add('bgm-hidden');
    setTimeout(() => overlay.remove(), 250);
    try {
      await chrome.storage.session.set({ [cacheKey]: true });
    } catch (_) {
      // ignore
    }
  });

  document.body.appendChild(overlay);

  // ── Resolve game via service worker ──────────────────────────────────────

  console.debug('[BGM overlay] resolving game for title:', title);

  let gameData;
  try {
    const sendPromise = chrome.runtime.sendMessage({ action: 'resolveGameOverlay', title });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 10000)
    );
    const res = await Promise.race([sendPromise, timeoutPromise]);
    console.debug('[BGM overlay] SW response:', res);
    if (!res || res.error || !res.game) {
      showOverlayError(overlay, res?.error || 'no_game');
      return;
    }
    gameData = res;
  } catch (e) {
    console.warn('[BGM overlay] SW call failed:', e.message);
    showOverlayError(overlay, e.message);
    return;
  }

  const { game, collectionTypes } = gameData;
  // game: { id, name, slug, bayes_average }
  // collectionTypes: string[] e.g. ['own', 'played']

  // ── Render overlay with real data ─────────────────────────────────────────

  const PILLS = [
    { type: 'wishlist', label: '★ Wishlist' },
    { type: 'wanttoplay', label: '▷ Want to play' },
    { type: 'own', label: '✓ Own' },
    { type: 'played', label: '● Played' },
  ];

  const activeTypes = new Set(collectionTypes);

  const ratingHtml = game.bayes_average
    ? `<div class="bgm-overlay-rating">
        <div class="bgm-rating-row">
          <div class="bgm-rating-stars" aria-label="${game.bayes_average} out of 10">
            <span class="bgm-stars-empty">★★★★★</span>
            <span class="bgm-stars-fill" style="width:${ratingFillPercent(game.bayes_average)}%">★★★★★</span>
          </div>
          <span class="bgm-rating-value">${game.bayes_average.toFixed(1)}</span>
        </div>
        <span class="bgm-rating-label">${escapeHtml(ratingTier(game.bayes_average))}</span>
       </div>`
    : '';

  const pillsHtml = PILLS.map(
    ({ type, label }) =>
      `<button class="bgm-collection-pill${activeTypes.has(type) ? ' bgm-active' : ''}"
               data-type="${type}">${label}</button>`
  ).join('');

  const bodyEl = overlay.querySelector('.bgm-overlay-loading');
  bodyEl.outerHTML = `
    <div class="bgm-overlay-body">
      <p class="bgm-overlay-game-name" title="${escapeAttr(game.name)}">${escapeHtml(game.name)}</p>
      ${ratingHtml}
      <div class="bgm-overlay-collection">${pillsHtml}</div>
    </div>
    <div class="bgm-overlay-footer">
      <a class="bgm-overlay-open-link"
         href="${localizedGameUrl(game.slug)}"
         target="_blank" rel="noopener noreferrer">
        Open on BoardGameMatcher →
      </a>
    </div>
  `;

  // ── Collection pill toggle ────────────────────────────────────────────────

  overlay.querySelectorAll('.bgm-collection-pill').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const adding = !btn.classList.contains('bgm-active');

      btn.classList.add('bgm-loading');

      try {
        const res = await chrome.runtime.sendMessage({
          action: 'setCollectionType',
          gameId: game.id,
          collectionType: type,
          add: adding,
        });
        if (res && res.success) {
          btn.classList.toggle('bgm-active', adding);
        }
      } catch (_) {
        // ignore
      }

      btn.classList.remove('bgm-loading');
    });
  });
})();

function showOverlayError(overlay, code) {
  const loadingEl = overlay.querySelector('.bgm-overlay-loading');
  if (!loadingEl) return;
  loadingEl.outerHTML = `<div class="bgm-overlay-error">${escapeHtml(code)}</div>`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}
