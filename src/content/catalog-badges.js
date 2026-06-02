// BGM Catalog Badges — injects a BGM info badge on each game image on
// Veepee (and Privalia) catalog pages, showing game details on hover.

(async function bgmCatalogBadges() {
  if (typeof chrome === 'undefined' || !chrome.runtime) return;
  if (!isVeepeeCatalog()) return;

  // Get the matched pattern (for name cleanup config)
  let pattern;
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'checkSiteSupport',
      domain: location.hostname,
      url: location.href,
    });
    if (!res?.supported || res.pattern?.data_source !== 'next_data') return;
    pattern = res.pattern;
  } catch {
    return;
  }

  // __NEXT_DATA__ may not yet contain catalog items on SPA navigation; retry once
  let games = readNextDataGames(pattern);
  if (!games.length) {
    await new Promise((r) => setTimeout(r, 1500));
    games = readNextDataGames(pattern);
    if (!games.length) return;
  }

  injectBadges(games);
})();

// ── Helpers ────────────────────────────────────────────────────────────────

function isVeepeeCatalog() {
  return /veepee\.|privalia\.com/.test(location.hostname) && /\/catalog\//.test(location.pathname);
}

function getPath(obj, path) {
  if (!path || obj == null) return undefined;
  for (const part of path.split('.')) {
    const m = part.match(/^([^[\]]+)((?:\[\d+\])*)$/);
    if (!m) return undefined;
    obj = obj[m[1]];
    if (obj == null) return undefined;
    for (const idx of m[2].match(/\d+/g) || []) {
      if (!Array.isArray(obj)) return undefined;
      obj = obj[parseInt(idx, 10)];
    }
  }
  return obj;
}

function buildCleanupFn(cfg) {
  if (!cfg) return (s) => s;
  const pre = cfg.strip_prefix_pattern ? new RegExp(cfg.strip_prefix_pattern) : null;
  const suf = cfg.strip_suffix_pattern ? new RegExp(cfg.strip_suffix_pattern) : null;
  return (name) => {
    if (typeof name !== 'string') return name;
    if (suf) name = name.replace(suf, '');
    if (pre) name = name.replace(pre, '');
    return name.trim();
  };
}

// Walk the React fiber tree to find the live Redux store state.
// Mirrors the same logic in content-script.js for SPA navigation.
function findReduxState() {
  const root = document.getElementById('__next');
  if (!root) return null;
  const key = Object.keys(root).find(
    (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
  );
  if (!key) return null;
  let fiber = root[key];
  for (let i = 0; fiber && i < 200; i++, fiber = fiber.return) {
    const store =
      fiber.memoizedProps?.store ||
      fiber.pendingProps?.store ||
      fiber.memoizedProps?.value?.store ||
      fiber.pendingProps?.value?.store;
    if (store && typeof store.getState === 'function') return store.getState();
  }
  return null;
}

function readNextDataGames(pattern) {
  const script = document.getElementById('__NEXT_DATA__');
  if (!script) return [];
  let data;
  try {
    data = JSON.parse(script.textContent || '');
  } catch {
    return [];
  }

  const ITEMS_PATH = 'props.initialState.CatalogItems.result.items';
  let items = getPath(data, ITEMS_PATH);

  if (!Array.isArray(items)) {
    const redux = findReduxState();
    if (redux) items = getPath({ props: { initialState: redux } }, ITEMS_PATH);
  }
  if (!Array.isArray(items)) return [];

  const cleanup = buildCleanupFn(pattern?.next_data?.name_cleanup);
  const seen = new Set();
  const results = [];

  for (const item of items) {
    const rawName = getPath(item, 'name');
    if (!rawName) continue;
    const name = cleanup(rawName);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    results.push({ name, imageUrl: getPath(item, 'medias[0].url') || null });
  }

  return results;
}

// Normalize an image URL to a stable key for matching.
// Handles Next.js image optimizer: /_next/image?url=ENCODED
function normalizeImgUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl, location.href);
    if (u.pathname === '/_next/image' && u.searchParams.has('url')) {
      try {
        return new URL(u.searchParams.get('url')).pathname;
      } catch {
        return u.searchParams.get('url');
      }
    }
    return u.pathname;
  } catch {
    return rawUrl;
  }
}

function getImgSrc(img) {
  return (
    img.src ||
    img.getAttribute('data-src') ||
    img.getAttribute('data-lazy-src') ||
    (img.getAttribute('srcset') || '').split(',')[0].trim().split(/\s+/)[0] ||
    ''
  );
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Localized BGM URL ─────────────────────────────────────────────────────

const BGM_BASE = 'https://boardgamematcher.com';
const GAME_SEGMENTS = { en: 'game', fr: 'jeu', de: 'spiel', es: 'juego', it: 'gioco' };

function localizedGameUrl(slug) {
  const lang = (chrome.i18n?.getUILanguage() || 'en').split('-')[0];
  const seg = GAME_SEGMENTS[lang] || 'game';
  const prefix = lang !== 'en' ? `/${lang}` : '';
  return `${BGM_BASE}${prefix}/${seg}/${encodeURIComponent(slug)}?utm_source=extension&utm_medium=catalog-badge&utm_campaign=catalog-badge`;
}

// ── Rating helpers ─────────────────────────────────────────────────────────

function normBgg(r) {
  return r > 5 ? r / 2 : r;
}

// BGM-1231: prefer soft Bayesian display_rating, fall back to legacy
// bayes_average. Returns null when both are absent.
function pickDisplayRating(game) {
  if (!game) return null;
  const raw = game.display_rating ?? game.bayes_average ?? null;
  return raw == null ? null : normBgg(Number(raw));
}

// Compact vote-count formatter: 12,345 → "12K", 1,234,000 → "1.2M",
// < 10,000 → locale-grouped integer; empty when there are no votes.
function formatVotes(n) {
  if (n == null) return '';
  const c = Number(n);
  if (!Number.isFinite(c) || c <= 0) return '';
  if (c >= 1_000_000) return `${(c / 1_000_000).toFixed(1)}M`;
  if (c >= 10_000) return `${Math.round(c / 1000)}K`;
  return c.toLocaleString();
}

function ratingPct(r) {
  return Math.round(Math.min(5, Math.max(0, r)) * 20);
}
const TIERS = [
  [4.0, 'Outstanding'],
  [3.75, 'Excellent'],
  [3.5, 'Very good'],
  [3.25, 'Good'],
  [3.0, 'Solid'],
  [2.75, 'Mixed'],
  [2.5, 'Below average'],
  [0, 'Poor'],
];
function ratingTier(r) {
  return (TIERS.find(([t]) => r >= t) || TIERS.at(-1))[1];
}

// ── Tooltip ────────────────────────────────────────────────────────────────

function createTooltip() {
  const el = document.createElement('div');
  el.id = 'bgm-cat-tooltip';
  el.className = 'bgm-ct-hidden';
  el.innerHTML = `
    <div class="bgm-ct-header">
      <div class="bgm-ct-logo">BGM</div>
      <span class="bgm-ct-brand">BoardGameMatcher</span>
    </div>
    <div class="bgm-ct-body"></div>
  `;
  return el;
}

function positionTooltip(tooltip, badge) {
  const r = badge.getBoundingClientRect();
  const TW = 240;
  let left = r.left;
  let top = r.bottom + 6;

  if (left + TW > window.innerWidth - 8) left = Math.max(8, r.right - TW);
  if (top + 250 > window.innerHeight) top = Math.max(8, r.top - 6 - (tooltip.offsetHeight || 200));

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function setLoading(tooltip) {
  tooltip.querySelector('.bgm-ct-body').innerHTML =
    '<div class="bgm-ct-loading"><div class="bgm-ct-spinner"></div></div>';
}

function setError(tooltip, code) {
  tooltip.querySelector('.bgm-ct-body').innerHTML = `<div class="bgm-ct-error">${esc(code)}</div>`;
}

function renderGame(tooltip, { game, collectionTypes, userRating }) {
  // BGM-1231: headline uses soft Bayesian display_rating when present, else
  // legacy bayes_average. Vote count surfaces the confidence signal.
  const bgg = pickDisplayRating(game);
  const votesLabel = formatVotes(game.users_rated);
  const PILLS = [
    { type: 'wishlist', label: '★ Wishlist' },
    { type: 'wanttoplay', label: '▷ Want to play' },
    { type: 'own', label: '✓ Own' },
    { type: 'played', label: '● Played' },
  ];
  const active = new Set(collectionTypes || []);

  const starsHtml = bgg != null
    ? `<div class="bgm-ct-rating">
        <div class="bgm-ct-stars">
          <span class="bgm-ct-s-empty">★★★★★</span>
          <span class="bgm-ct-s-fill" style="width:${ratingPct(bgg)}%">★★★★★</span>
        </div>
        <span class="bgm-ct-rval">${bgg.toFixed(1)}<small>/5</small></span>
        <span class="bgm-ct-rtier">${esc(ratingTier(bgg))}${votesLabel ? ` · ${votesLabel} votes` : ''}</span>
      </div>`
    : '';

  const pillsHtml = PILLS.map(
    ({ type, label }) =>
      `<button class="bgm-ct-pill${active.has(type) ? ' bgm-ct-pill-on' : ''}" data-type="${type}">${label}</button>`
  ).join('');

  const myStarsHtml = [1, 2, 3, 4, 5]
    .map((n) => {
      const cls =
        userRating >= n
          ? 'bgm-ct-my-star bgm-ct-my-star-on'
          : userRating > n - 1
            ? 'bgm-ct-my-star bgm-ct-my-star-half'
            : 'bgm-ct-my-star';
      return `<button class="${cls}" data-value="${n}">★</button>`;
    })
    .join('');

  tooltip.querySelector('.bgm-ct-body').innerHTML = `
    <p class="bgm-ct-name" title="${esc(game.name)}">${esc(game.name)}</p>
    ${starsHtml}
    <div class="bgm-ct-pills">${pillsHtml}</div>
    <div class="bgm-ct-my-rating">
      <span class="bgm-ct-my-rating-label">Your rating</span>
      <div class="bgm-ct-my-stars">${myStarsHtml}</div>
    </div>
    <a class="bgm-ct-link" href="${esc(localizedGameUrl(game.slug))}" target="_blank" rel="noopener noreferrer">Open on BoardGameMatcher →</a>
  `;

  // Collection pill toggles
  tooltip.querySelectorAll('.bgm-ct-pill').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const type = btn.dataset.type;
      const adding = !btn.classList.contains('bgm-ct-pill-on');
      btn.classList.add('bgm-ct-loading');
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'setCollectionType',
          gameId: game.id,
          collectionType: type,
          add: adding,
        });
        if (res?.success) btn.classList.toggle('bgm-ct-pill-on', adding);
      } catch {
        // ignore
      }
      btn.classList.remove('bgm-ct-loading');
    });
  });

  // Personal star rating — mirrors game-overlay.js interaction
  let currentRating = userRating || 0;
  const starBtns = [...tooltip.querySelectorAll('.bgm-ct-my-star')];

  function applyStars(upTo) {
    starBtns.forEach((s) => {
      const n = Number(s.dataset.value);
      s.classList.remove('bgm-ct-my-star-on', 'bgm-ct-my-star-half');
      if (upTo >= n) s.classList.add('bgm-ct-my-star-on');
      else if (upTo > n - 1) s.classList.add('bgm-ct-my-star-half');
    });
  }

  starBtns.forEach((btn) => {
    const n = Number(btn.dataset.value);
    btn.addEventListener('mousemove', (e) => {
      applyStars(e.offsetX < btn.offsetWidth / 2 ? n - 0.5 : n);
    });
    btn.addEventListener('mouseleave', () => applyStars(currentRating));
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const value = e.offsetX < btn.offsetWidth / 2 ? n - 0.5 : n;
      const prev = currentRating;
      const next = value === currentRating ? 0 : value;
      applyStars(next);
      currentRating = next;
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'setGameRating',
          gameId: game.id,
          rating: next || null,
        });
        if (!res?.success) {
          currentRating = prev;
          applyStars(prev);
          if (res?.status === 401) {
            chrome.runtime
              .sendMessage({ action: 'openTab', url: localizedGameUrl(game.slug) })
              .catch(() => {});
          }
        }
      } catch {
        currentRating = prev;
        applyStars(prev);
      }
    });
  });

  // Bypass host-page link hijacking
  tooltip.querySelectorAll('a[href]').forEach((a) => {
    a.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        chrome.runtime
          .sendMessage({ action: 'openTab', url: a.href })
          .catch(() => window.open(a.href, '_blank', 'noopener'));
      },
      true
    );
  });
}

// ── Main badge injection ───────────────────────────────────────────────────

function injectBadges(games) {
  const imageToName = new Map();
  for (const g of games) {
    if (g.imageUrl) imageToName.set(normalizeImgUrl(g.imageUrl), g.name);
  }
  if (!imageToName.size) return;

  const tooltip = createTooltip();
  document.body.appendChild(tooltip);
  let hideTimer = null;
  let currentGame = null;

  function keepTooltip() {
    clearTimeout(hideTimer);
  }
  function scheduleHide() {
    hideTimer = setTimeout(() => {
      tooltip.classList.add('bgm-ct-hidden');
      currentGame = null;
    }, 200);
  }

  tooltip.addEventListener('mouseenter', keepTooltip);
  tooltip.addEventListener('mouseleave', scheduleHide);

  function showFor(badge, gameName) {
    keepTooltip();
    tooltip.classList.remove('bgm-ct-hidden');
    positionTooltip(tooltip, badge);

    if (currentGame === gameName) return;
    currentGame = gameName;
    setLoading(tooltip);

    chrome.runtime
      .sendMessage({ action: 'resolveGameOverlay', title: gameName })
      .then((res) => {
        if (currentGame !== gameName) return;
        if (!res?.game) {
          setError(tooltip, res?.error || 'not_found');
          return;
        }
        renderGame(tooltip, res);
        positionTooltip(tooltip, badge);
      })
      .catch(() => {
        if (currentGame === gameName) setError(tooltip, 'error');
      });
  }

  function scanAndBadge() {
    for (const img of document.querySelectorAll('img')) {
      if (img.dataset.bgmBadged) continue;
      const src = getImgSrc(img);
      if (!src) continue;

      const gameName = imageToName.get(normalizeImgUrl(src));
      if (!gameName) continue;

      img.dataset.bgmBadged = '1';

      // The badge is positioned absolutely inside the image's closest
      // positioned ancestor; if there isn't one, make the parent relative.
      const wrap = img.parentElement;
      if (wrap && getComputedStyle(wrap).position === 'static') {
        wrap.style.position = 'relative';
      }

      const badge = document.createElement('button');
      badge.className = 'bgm-cat-badge';
      badge.setAttribute('aria-label', `BoardGameMatcher: ${gameName}`);
      badge.innerHTML = '<span>BGM</span>';
      badge.addEventListener('mouseenter', () => showFor(badge, gameName));
      badge.addEventListener('mouseleave', scheduleHide);
      (wrap || img.parentElement).appendChild(badge);
    }
  }

  scanAndBadge();

  // Re-scan on DOM changes (lazy loading, SPA navigation within catalog)
  let scanTimer;
  new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanAndBadge, 200);
  }).observe(document.body, { childList: true, subtree: true });
}
