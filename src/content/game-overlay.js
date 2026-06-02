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

// Normalize a community rating to the 0–5 display scale. Values > 5 are
// treated as legacy 0–10 and halved (resilient if the API ever returns
// the pre-BGM-1200 scale).
function normalizeBgg(rating) {
  return rating > 5 ? rating / 2 : rating;
}

// Pick the best community-rating value to display from a game payload.
// BGM-1231: prefer ``display_rating`` (soft Bayesian, honest for low-N
// games) and fall back to legacy ``bayes_average``. Returns null when
// both are absent.
function pickDisplayRating(game) {
  if (!game) return null;
  const raw = game.display_rating ?? game.bayes_average ?? null;
  return raw == null ? null : normalizeBgg(Number(raw));
}

// Format a vote count for compact display: 12,345 → "12K", 1,234,000 →
// "1.2M", < 10,000 → "1,234" with locale grouping. Empty string when the
// game has no votes (caller should hide the surface).
function formatVoteCount(n) {
  if (n == null) return '';
  const count = Number(n);
  if (!Number.isFinite(count) || count <= 0) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${Math.round(count / 1000)}K`;
  return count.toLocaleString();
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

// Returns the percentage (0–100) of 5 stars that should be visually filled
// for a normalized 0–5 rating. e.g. 3.5 → 70, 4.0 → 80.
function ratingFillPercent(rating) {
  return Math.max(0, Math.min(100, Math.round(rating * 20)));
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

function showOverlayError(overlay, code) {
  const loadingEl = overlay.querySelector('.bgm-overlay-loading');
  if (!loadingEl) return;
  loadingEl.outerHTML = `<div class="bgm-overlay-error">${escapeHtml(code)}</div>`;
}

(async function bgmGameOverlay() {
  if (typeof chrome === 'undefined' || !chrome.runtime) return;

  // ── Per-site adapters ─────────────────────────────────────────────────────
  // Each adapter: { isProductPage(): bool, extractTitle(): string | null }

  const BGA_ADAPTER = {
    isProductPage() {
      return location.pathname === '/gamepanel' && new URLSearchParams(location.search).has('game');
    },
    extractTitle() {
      // BGA's #game_name anchor is server-rendered and locale-independent
      const nameEl = document.querySelector('a#game_name, span#game_name');
      if (nameEl?.textContent?.trim()) return nameEl.textContent.trim();

      // BGA title pattern varies by locale but always wraps the game name:
      // EN: "Play <Name> online from your browser"
      // FR: "Jouer à <Name> en ligne depuis votre navigateur"
      // DE: "Spielen Sie <Name> online..."  ES: "Jugar a <Name> en línea..."
      const BGA_TITLE_RE =
        /^(?:Play|Jouer\s+[aà]|Spielen?\s+(?:Sie\s+)?|Jugar?\s+(?:a\s+)?|Gioca(?:re)?\s+(?:a\s+)?|Speel\s+|Zagraj\s+w\s+|Hrát?\s+)\s*(.+?)\s+(?:online|en\s+ligne|en\s+l[ií]nea|in\s+lijn)\b/i;

      const og = document.querySelector('meta[property="og:title"]');
      if (og?.content) {
        const m = og.content.match(BGA_TITLE_RE);
        if (m) return m[1].trim();
      }

      const titleMatch = document.title.match(BGA_TITLE_RE);
      if (titleMatch) return titleMatch[1].trim();

      return null;
    },
    // BGA is a SPA — the game name lands in the DOM after JS runs.
    // Poll for up to 3 s before giving up.
    async extractTitleAsync() {
      for (let i = 0; i < 30; i++) {
        const title = this.extractTitle();
        if (title) return title;
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    },
  };

  const ADAPTERS = {
    'boardgamearena.com': BGA_ADAPTER,
    'en.boardgamearena.com': BGA_ADAPTER,
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

  const title = adapter.extractTitleAsync
    ? await adapter.extractTitleAsync()
    : adapter.extractTitle();
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
        <div class="bgm-overlay-logo">BGM</div>
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

  const { game, collectionTypes, userRating, imageFetched } = gameData;
  // game: { id, name, slug, display_rating, bayes_average, users_rated, image_url }
  // collectionTypes: string[] e.g. ['own', 'played']
  // userRating: 1–5 | null

  // ── Render overlay with real data ─────────────────────────────────────────

  const PILLS = [
    { type: 'wishlist', label: '★ Wishlist' },
    { type: 'wanttoplay', label: '▷ Want to play' },
    { type: 'own', label: '✓ Own' },
    { type: 'played', label: '● Played' },
  ];

  const activeTypes = new Set(collectionTypes);

  // BGM-1231: headline uses soft Bayesian display_rating when present, else
  // legacy bayes_average. Vote count surfaces the confidence signal so users
  // can judge how much to trust the score.
  const bggRating = pickDisplayRating(game);
  const votesLabel = formatVoteCount(game.users_rated);
  const ratingHtml = bggRating != null
    ? `<div class="bgm-overlay-rating">
        <div class="bgm-rating-row">
          <div class="bgm-rating-stars" aria-label="${bggRating.toFixed(1)} out of 5">
            <span class="bgm-stars-empty">★★★★★</span>
            <span class="bgm-stars-fill" style="width:${ratingFillPercent(bggRating)}%">★★★★★</span>
          </div>
          <span class="bgm-rating-value">${bggRating.toFixed(1)}<span class="bgm-rating-denom">/5</span></span>
        </div>
        <span class="bgm-rating-label">${escapeHtml(ratingTier(bggRating))}${votesLabel ? ` · ${votesLabel} votes` : ''}</span>
       </div>`
    : '';

  const pillsHtml = PILLS.map(
    ({ type, label }) =>
      `<button class="bgm-collection-pill${activeTypes.has(type) ? ' bgm-active' : ''}"
               data-type="${type}">${label}</button>`
  ).join('');

  // Cover image is injected as extension CSS by the service worker (bypasses page CSP).
  // Only render the div when the fetch actually succeeded to avoid an empty block.
  const coverHtml = imageFetched ? `<div class="bgm-overlay-cover"></div>` : '';

  const myStarsHtml = [1, 2, 3, 4, 5]
    .map((n) => {
      const cls =
        userRating >= n
          ? 'bgm-my-star bgm-my-star-on'
          : userRating > n - 1
            ? 'bgm-my-star bgm-my-star-half'
            : 'bgm-my-star';
      return `<button class="${cls}" data-value="${n}" title="${n} star${n > 1 ? 's' : ''}">★</button>`;
    })
    .join('');

  const bodyEl = overlay.querySelector('.bgm-overlay-loading');
  bodyEl.outerHTML = `
    <div class="bgm-overlay-body">
      <div class="bgm-overlay-info">
        ${coverHtml}
        <div class="bgm-overlay-meta">
          <p class="bgm-overlay-game-name" title="${escapeAttr(game.name)}">${escapeHtml(game.name)}</p>
          ${ratingHtml}
        </div>
      </div>
      <div class="bgm-overlay-collection">${pillsHtml}</div>
      <div class="bgm-overlay-my-rating">
        <span class="bgm-my-rating-label">Your rating</span>
        <div class="bgm-my-stars" role="group">${myStarsHtml}</div>
      </div>
    </div>
    <div class="bgm-overlay-footer">
      <a class="bgm-overlay-open-link"
         href="${localizedGameUrl(game.slug)}"
         target="_blank" rel="noopener noreferrer">
        Open on BoardGameMatcher →
      </a>
    </div>
  `;

  // ── Link clicks: bypass host-page click handlers via SW.openTab ──────────
  // Some retailers (e.g. Philibert) have global delegated click handlers that
  // swallow or hijack <a> clicks on the page. Capture-phase + stopImmediate +
  // route through the service worker which has tabs permission.
  overlay.querySelectorAll('a[href]').forEach((a) => {
    a.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const url = a.href;
        chrome.runtime
          .sendMessage({ action: 'openTab', url })
          .catch(() => window.open(url, '_blank', 'noopener'));
      },
      true
    );
  });

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

  // ── Personal star rating ──────────────────────────────────────────────────

  let currentRating = userRating || 0;
  const starBtns = [...overlay.querySelectorAll('.bgm-my-star')];

  function applyStarVisual(upTo) {
    starBtns.forEach((s) => {
      const n = Number(s.dataset.value);
      s.classList.remove('bgm-my-star-on', 'bgm-my-star-half');
      if (upTo >= n) s.classList.add('bgm-my-star-on');
      else if (upTo > n - 1) s.classList.add('bgm-my-star-half');
    });
  }

  starBtns.forEach((btn) => {
    const n = Number(btn.dataset.value);
    btn.addEventListener('mousemove', (e) => {
      applyStarVisual(e.offsetX < btn.offsetWidth / 2 ? n - 0.5 : n);
    });
    btn.addEventListener('mouseleave', () => applyStarVisual(currentRating));
    btn.addEventListener('click', async (e) => {
      const value = e.offsetX < btn.offsetWidth / 2 ? n - 0.5 : n;
      const prevRating = currentRating;
      const newRating = value === currentRating ? 0 : value; // toggle off on same half
      applyStarVisual(newRating);
      currentRating = newRating;
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'setGameRating',
          gameId: game.id,
          rating: newRating || null,
        });
        if (!res || !res.success) {
          currentRating = prevRating;
          applyStarVisual(prevRating);
          if (res?.status === 401) {
            // Not logged into BGM — open the game page so the user can log in and rate
            chrome.runtime
              .sendMessage({ action: 'openTab', url: localizedGameUrl(game.slug) })
              .catch(() => {});
          }
        }
      } catch (_) {
        currentRating = prevRating;
        applyStarVisual(prevRating);
      }
    });
  });
})();
