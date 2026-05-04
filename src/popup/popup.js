// BGM Toolbox — Popup controller
const BGM_BASE_URL = 'https://boardgamematcher.com';

// Localized URL path segments per language — mirrors i18n_constants.py on the web
const GAME_PATH_SEGMENTS = { en: 'game', fr: 'jeu', de: 'spiel', es: 'juego', it: 'gioco' };

function bgmLink(path, campaign) {
  const sep = path.includes('?') ? '&' : '?';
  return `${BGM_BASE_URL}${path}${sep}utm_source=extension&utm_medium=popup&utm_campaign=${campaign}`;
}

function gameDetailUrl(slug, campaign) {
  const lang = chrome.i18n.getUILanguage().split('-')[0];
  const segment = GAME_PATH_SEGMENTS[lang] || 'game';
  const prefix = lang !== 'en' ? `/${lang}` : '';
  return bgmLink(`${prefix}/${segment}/${encodeURIComponent(slug)}`, campaign);
}
let currentDomain = null;
let currentPattern = null;
let currentUser = null;
let bggUsername = null;
let siteContext = 'neutral'; // 'shop' | 'bga' | 'yucata' | 'bgg' | 'bgg-game' | 'neutral'
let bggGameName = null;
let bggGameAutoSelect = false; // true on BGG game pages — auto-jump to detail card on first search result

// State held across the extraction review panel
let _reviewTab = null;
let _reviewGames = null;
let _reviewDomain = null;

// State for the success card
let _successTimer = null;

// State for bulk paginated extraction
let _bulkCancelRequested = false;

// Tab ID of the active shop page (set in checkSiteSupport)
let _activeTabId = null;

const COLLECTION_TYPES = [
  { key: 'own', i18nKey: 'popupCollTypeOwn', emoji: '📦' },
  { key: 'played', i18nKey: 'popupCollTypePlayed', emoji: '✅' },
  { key: 'wishlist', i18nKey: 'popupCollTypeWishlist', emoji: '⭐' },
  { key: 'wanttoplay', i18nKey: 'popupCollTypeWantToPlay', emoji: '🎯' },
  { key: 'wanttolearn', i18nKey: 'popupCollTypeWantToLearn', emoji: '📖' },
  { key: 'canteach', i18nKey: 'popupCollTypeCanTeach', emoji: '🎓' },
];

let selectedTypes = ['wishlist'];

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  setupWishlistPagination();
  await checkAuth();
  await checkSiteSupport();
  await loadStats();
  setupEventListeners();
  // On BGG game pages, applyCardLayout() pre-fills the input before the listener
  // is attached — re-fire the event now that the handler is live.
  if (siteContext === 'bgg-game' && bggGameName) {
    const input = document.getElementById('wishlist-input');
    if (input?.value) input.dispatchEvent(new Event('input'));
  }
  await applyPendingPopupSearch();
});

async function applyPendingPopupSearch() {
  const { pendingPopupSearch } = await chrome.storage.session.get('pendingPopupSearch');
  if (!pendingPopupSearch) return;
  await chrome.storage.session.remove('pendingPopupSearch');
  switchTab('games');
  const input = document.getElementById('wishlist-input');
  if (input) {
    input.value = pendingPopupSearch;
    input.dispatchEvent(new Event('input'));
  }
}

// Setup event listeners
function setupEventListeners() {
  document.getElementById('extract-btn').addEventListener('click', handleExtract);
  document.getElementById('bulk-extract-btn').addEventListener('click', handleBulkExtract);
  document.getElementById('bulk-cancel-btn').addEventListener('click', () => {
    _bulkCancelRequested = true;
  });
  document.getElementById('settings-btn').addEventListener('click', handleSettings);
  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('signup-link').addEventListener('click', handleSignup);
  document.getElementById('shop-signin-btn').addEventListener('click', handleLogin);
  document.getElementById('shop-signup-link').addEventListener('click', handleSignup);
  document.getElementById('wishlist-input').addEventListener('input', handleWishlistInput);
  document.getElementById('wishlist-input').addEventListener('keydown', handleWishlistKeydown);
  document.getElementById('user-avatar').addEventListener('click', handleAvatarClick);
  document.getElementById('bggSyncBtn').addEventListener('click', handleBggSync);
  document.getElementById('bggSyncClear').addEventListener('click', handleBggSyncClear);
  document.getElementById('bgaTeaserSignin').addEventListener('click', handleLogin);

  document.getElementById('review-back').addEventListener('click', hideReviewPanel);
  document.getElementById('review-cancel').addEventListener('click', hideReviewPanel);
  document.getElementById('review-confirm').addEventListener('click', confirmExtract);
  document.getElementById('review-select-all').addEventListener('click', () => {
    document.querySelectorAll('.review-game-cb').forEach((cb) => (cb.checked = true));
    updateReviewCount();
  });
  document.getElementById('review-deselect-all').addEventListener('click', () => {
    document.querySelectorAll('.review-game-cb').forEach((cb) => (cb.checked = false));
    updateReviewCount();
  });
  document.getElementById('review-select-new').addEventListener('click', () => {
    document.querySelectorAll('.review-game-cb').forEach((cb) => {
      cb.checked = cb.closest('.review-game-row').dataset.status === 'new';
    });
    updateReviewCount();
  });

  document.getElementById('gd-prev').addEventListener('click', () => navigateGameDetail(-1));
  document.getElementById('gd-next').addEventListener('click', () => navigateGameDetail(1));
  document.getElementById('success-extract-again').addEventListener('click', hideSuccessState);
  document.getElementById('success-link').addEventListener('click', (e) => {
    e.preventDefault();
    const href = e.currentTarget.href;
    if (href && href !== '#') chrome.tabs.create({ url: href });
  });

  document.getElementById('bn-extract').addEventListener('click', () => switchTab('extract'));
  document.getElementById('bn-games').addEventListener('click', () => switchTab('games'));
  document.getElementById('bn-dashboard').addEventListener('click', () => switchTab('dashboard'));
  document.getElementById('bn-more').addEventListener('click', () => switchTab('more'));

  const settingsMoreBtn = document.getElementById('settings-more-btn');
  if (settingsMoreBtn) settingsMoreBtn.addEventListener('click', handleSettings);

  document
    .getElementById('more-import-plays-btn')
    ?.addEventListener('click', handleMoreImportPlays);
  document.getElementById('more-bgg-sync-btn')?.addEventListener('click', handleMoreBggSync);
  document.getElementById('more-custom-patterns-btn')?.addEventListener('click', handleSettings);
  document.getElementById('more-share-btn')?.addEventListener('click', handleMoreShare);

  document.getElementById('dash-signin-btn').addEventListener('click', handleLogin);
  document.getElementById('dash-signup-link').addEventListener('click', handleSignup);
  document.getElementById('wl-strip-signin').addEventListener('click', handleLogin);
  document.getElementById('wl-strip-signup').addEventListener('click', handleSignup);

  for (const id of [
    'dash-messages',
    'dash-matches',
    'dash-notifs',
    'dash-link-home',
    'dash-link-collections',
    'dash-link-wishlist',
  ]) {
    document.getElementById(id).addEventListener('click', (e) => {
      e.preventDefault();
      const url = e.currentTarget.dataset.href;
      if (url) chrome.tabs.create({ url });
    });
  }
}

function handleAvatarClick(e) {
  const url = e.currentTarget.dataset.profileUrl;
  if (url) chrome.tabs.create({ url });
}

// ── Card layout ──

function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.bn-item').forEach((b) => b.classList.remove('active'));
  const pane = document.getElementById('tab-' + tabId);
  if (pane) pane.classList.add('active');
  const btn = document.getElementById('bn-' + tabId);
  if (btn) btn.classList.add('active');
}

function applyCardLayout() {
  const bnExtract = document.getElementById('bn-extract');
  if (bnExtract) bnExtract.classList.remove('compatible');

  // Reset extract strips
  ['strip-shop', 'strip-play', 'strip-bgg'].forEach((id) => {
    document.getElementById(id)?.classList.remove('active');
  });

  if (siteContext === 'shop') {
    document.getElementById('strip-shop')?.classList.add('active');
    const sub = document.getElementById('strip-shop-sub');
    const shopName = document.getElementById('ctx-shop-name')?.textContent;
    if (sub && shopName) sub.textContent = shopName;
    const btn = document.getElementById('extract-btn');
    btn.disabled = false;
    const bulkBtn = document.getElementById('bulk-extract-btn');
    const hasPagination = currentPattern?.data_source !== 'next_data';
    bulkBtn.style.display = hasPagination ? '' : 'none';
    bulkBtn.disabled = !hasPagination;
    if (bnExtract) bnExtract.classList.add('compatible');
    switchTab('extract');
  } else if (siteContext === 'bgg-game') {
    bggGameAutoSelect = true;
    switchTab('games');
  } else if (
    siteContext === 'bga' ||
    siteContext === 'yucata' ||
    siteContext === 'bgg' ||
    siteContext === 'tabletopia' ||
    siteContext === 'ludopedia' ||
    siteContext === 'spielbyweb'
  ) {
    document.getElementById('strip-play')?.classList.add('active');
    if (bnExtract) bnExtract.classList.add('compatible');
    switchTab('extract');
    if (siteContext === 'bgg') {
      document.getElementById('strip-bgg')?.classList.add('active');
      if (currentUser) showBggSyncPanel(currentUser);
    }
  }

  // Collection tab: show the right card based on auth state
  const cardLogin = document.getElementById('card-login');
  const cardNeutral = document.getElementById('card-neutral');
  const cardShop = document.getElementById('card-shop');
  cardLogin.style.display = 'none';
  cardNeutral.style.display = 'none';
  cardShop.style.display = 'none';

  if (!currentUser) {
    if (siteContext === 'shop') {
      cardShop.style.display = '';
    } else {
      cardNeutral.style.display = '';
      document.getElementById('col-chips-row').style.display = 'none';
      document.getElementById('col-chips').style.display = 'none';
      document.getElementById('wl-footer').style.display = 'none';
      document.getElementById('wl-login-strip').style.display = '';
      if (siteContext === 'bgg-game' && bggGameName) {
        const input = document.getElementById('wishlist-input');
        if (input) {
          input.value = bggGameName;
          input.dispatchEvent(new Event('input'));
        }
      }
    }
  } else {
    cardNeutral.style.display = '';
    document.getElementById('wl-login-strip').style.display = 'none';
    if (siteContext === 'shop' && _activeTabId && currentPattern) {
      loadPopupWishlistMatches(_activeTabId, currentPattern);
    }
    if (siteContext === 'bgg-game' && bggGameName) {
      const input = document.getElementById('wishlist-input');
      if (input) {
        input.value = bggGameName;
        input.dispatchEvent(new Event('input'));
      }
    }
  }
}

// ── Auth ──

async function checkAuth() {
  try {
    const response = await fetch(BGM_BASE_URL + '/api/me', { credentials: 'include' });
    if (response.ok) {
      currentUser = await response.json();
      setLoggedIn(currentUser);
      syncUiLocaleFromUser(currentUser);
    } else {
      setLoggedOut();
    }
  } catch (error) {
    console.warn('Auth check failed:', error);
    setLoggedOut();
  }
}

// Mirror the user's BGM web profile language into the extension UI (BGM-1016).
// Logged-out users keep the browser default. Fire-and-forget — translation
// re-apply happens inside bgmI18n.setLocale.
function syncUiLocaleFromUser(user) {
  const lang = user && user.preferred_language;
  if (!lang || !window.bgmI18n) return;
  window.bgmI18n.setLocale(lang).catch((err) => {
    console.warn('Failed to sync UI locale from BGM profile:', err);
  });
}

function setLoggedIn(user) {
  const avatar = document.getElementById('user-avatar');
  const initial = (user.display_name || user.username || '?').charAt(0).toUpperCase();
  avatar.textContent = '';
  avatar.classList.remove('has-image');
  if (user.avatar_url) {
    const img = document.createElement('img');
    const url = /^https?:\/\//i.test(user.avatar_url)
      ? user.avatar_url
      : BGM_BASE_URL + (user.avatar_url.startsWith('/') ? '' : '/') + user.avatar_url;
    img.src = url;
    img.alt = '';
    img.addEventListener('error', () => {
      avatar.textContent = initial;
      avatar.classList.remove('has-image');
    });
    avatar.appendChild(img);
    avatar.classList.add('has-image');
  } else {
    avatar.textContent = initial;
  }
  avatar.title = chrome.i18n.getMessage('popupAvatarUserTooltip', [
    user.display_name || user.username || '',
  ]);
  avatar.style.display = '';
  if (user.username) {
    avatar.dataset.profileUrl = bgmLink(`/users/${encodeURIComponent(user.username)}`, 'profile');
  } else {
    delete avatar.dataset.profileUrl;
  }

  setupBottomNav(user);
  setupWishlist(user);
  loadBgaStats(user);
  loadMsgBanner();
  loadDashboard(user);
}

function setLoggedOut() {
  document.getElementById('user-avatar').style.display = 'none';
  document.getElementById('msg-banner').style.display = 'none';
  const bgaTeaserRow = document.getElementById('bgaTeaserRow');
  if (bgaTeaserRow) bgaTeaserRow.style.display = '';
  document.getElementById('dash-logged-out').style.display = '';
  document.getElementById('dash-logged-in').style.display = 'none';

  // Clear any web-profile locale override so a logged-out user falls back to
  // the browser default instead of being stranded on the previous user's
  // language (BGM-1016).
  if (window.bgmI18n) {
    window.bgmI18n.setLocale(null).catch(() => {});
  }
}

function handleLogin() {
  chrome.tabs.create({ url: bgmLink('/auth/login', 'auth-login') });
}

function handleSignup(e) {
  e.preventDefault();
  chrome.tabs.create({ url: bgmLink('/auth/register', 'auth-signup') });
}

// ── Theme ──

function loadTheme() {
  chrome.storage.local.get('theme', (data) => {
    const theme = data.theme || 'dark';
    applyTheme(theme);
  });
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light');
  const newTheme = isLight ? 'dark' : 'light';
  chrome.storage.local.set({ theme: newTheme });
  applyTheme(newTheme);
}

function applyTheme(theme) {
  const icon = document.getElementById('theme-icon');
  if (theme === 'light') {
    document.body.classList.add('light');
    icon.innerHTML = '&#9788;';
  } else {
    document.body.classList.remove('light');
    icon.innerHTML = '&#9790;';
  }
}

// ── Site support ──

async function checkSiteSupport() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      applyCardLayout();
      return;
    }

    const url = new URL(tab.url);
    currentDomain = url.hostname;

    if (url.hostname.includes('boardgamearena.com')) {
      siteContext = 'bga';
      applyCardLayout();
      return;
    }
    if (url.hostname.includes('yucata.de')) {
      siteContext = 'yucata';
      applyCardLayout();
      return;
    }
    if (url.hostname.includes('boardgamegeek.com')) {
      const gameMatch = url.pathname.match(/^\/boardgame\/\d+\/([^/]+)/);
      if (gameMatch) {
        siteContext = 'bgg-game';
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.title,
          });
          const rawTitle = results?.[0]?.result || '';
          bggGameName = rawTitle.replace(/\s*\|.*$/, '').trim() || gameMatch[1].replace(/-/g, ' ');
        } catch (_e) {
          bggGameName = gameMatch[1].replace(/-/g, ' ');
        }
      } else {
        siteContext = 'bgg';
      }
      applyCardLayout();
      return;
    }

    chrome.runtime.sendMessage(
      { action: 'checkSiteSupport', domain: currentDomain, url: tab.url },
      async (response) => {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.lastError);
          applyCardLayout();
          return;
        }
        if (response && response.supported) {
          currentPattern = response.pattern;
          siteContext = 'shop';
          _activeTabId = tab.id;
          document.getElementById('ctx-shop-name').textContent = response.pattern.name;
          document.getElementById('ctx-success-name').textContent = response.pattern.name;
          applyCardLayout();
          await countGames(tab.id, response.pattern);
        } else {
          siteContext = 'neutral';
          applyCardLayout();
        }
      }
    );
  } catch (error) {
    console.error('Error checking site support:', error);
    applyCardLayout();
  }
}

async function countGames(tabId, pattern) {
  if (pattern.data_source === 'next_data') {
    const itemsPath = pattern.next_data?.items_path;
    if (!itemsPath) return;
    const paths = Array.isArray(itemsPath) ? itemsPath : [itemsPath];
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (paths) => {
          const script = document.getElementById('__NEXT_DATA__');
          if (!script) return 0;
          let data;
          try {
            data = JSON.parse(script.textContent || '');
          } catch {
            return 0;
          }
          const walk = (obj, path) => {
            if (!path || obj == null) return undefined;
            const parts = path.split('.');
            let cur = obj;
            for (const part of parts) {
              const m = part.match(/^([^[\]]+)((?:\[\d+\])*)$/);
              if (!m) return undefined;
              cur = cur == null ? undefined : cur[m[1]];
              if (m[2]) {
                const idxs = m[2].match(/\d+/g) || [];
                for (const idx of idxs) {
                  if (!Array.isArray(cur)) return undefined;
                  cur = cur[parseInt(idx, 10)];
                }
              }
              if (cur === undefined) return undefined;
            }
            return cur;
          };
          let total = 0;
          for (const p of paths) {
            const items = walk(data, p);
            if (Array.isArray(items)) total += items.length;
          }
          return total;
        },
        args: [paths],
      });
      const count = results?.[0]?.result;
      if (count > 0) {
        document.getElementById('extract-btn').textContent = chrome.i18n.getMessage(
          'popupExtractCount',
          [String(count)]
        );
      }
    } catch (_e) {
      // Can't inject (e.g. chrome:// URLs)
    }
    return;
  }

  const selector = pattern.card_selector || pattern.selector;
  if (!selector) return;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => document.querySelectorAll(sel).length,
      args: [selector],
    });
    const count = results?.[0]?.result;
    if (count > 0) {
      document.getElementById('extract-btn').textContent = chrome.i18n.getMessage(
        'popupExtractCount',
        [String(count)]
      );
    }
  } catch (_e) {
    // Can't inject (e.g. chrome:// URLs)
  }
}

// ── Bottom nav ──

function setupBottomNav(user) {
  const link = document.getElementById('wishlist-link');
  if (link && user.username) {
    link.href = bgmLink(
      `/collections/${encodeURIComponent(user.username)}`,
      'extract-shop-collection'
    );
  }
}

// ── Extraction ──

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/lib/pattern-matcher.js', 'src/content/content-script.js'],
  });
}

function sendExtractMessage(tabId, pattern) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'extractGames', pattern }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
      } else if (response) {
        resolve(response);
      } else {
        resolve({ error: 'No response from content script' });
      }
    });
  });
}

function openFallbackExtraction(url) {
  chrome.tabs.create({
    url: bgmLink(`/extract?url=${encodeURIComponent(url)}`, 'extract-fallback'),
  });
  window.close();
}

async function handleExtract() {
  if (!currentPattern) {
    showMessage(chrome.i18n.getMessage('popupNoPattern'), 'error');
    return;
  }

  const extractBtn = document.getElementById('extract-btn');
  extractBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      showMessage(chrome.i18n.getMessage('popupNoTab'), 'error');
      return;
    }

    let response = await sendExtractMessage(tab.id, currentPattern);
    if (response.error) {
      try {
        await injectContentScript(tab.id);
        response = await sendExtractMessage(tab.id, currentPattern);
      } catch (_e) {
        openFallbackExtraction(tab.url);
        return;
      }
    }

    if (response.error || !response.success || !response.games?.length) {
      openFallbackExtraction(tab.url);
      return;
    }

    _reviewTab = tab;
    _reviewGames = response.games;
    _reviewDomain = currentDomain;
    await showReviewPanel(response.games);
  } catch (error) {
    extractBtn.disabled = false;
    console.error('Error extracting:', error);
    showMessage(chrome.i18n.getMessage('popupErrorPrefix', [error.message]), 'error');
  }
}

async function showReviewPanel(games) {
  document.getElementById('review-domain').textContent = currentDomain || '';
  document.getElementById('tab-panes').style.display = 'none';
  document.getElementById('card-review').style.display = '';

  const loading = document.getElementById('review-loading');
  const gameList = document.getElementById('review-game-list');
  loading.style.display = '';
  gameList.innerHTML = '';

  let previewData = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(BGM_BASE_URL + '/api/extract/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ games }),
      signal: controller.signal,
    });
    if (resp.ok) previewData = await resp.json();
  } catch (e) {
    console.warn('Preview API failed:', e);
  } finally {
    clearTimeout(timer);
  }

  loading.style.display = 'none';

  const fallback = games.map((g) => ({ name: g.name, status: 'unrecognised', bgm_name: null }));
  const previewGames = Array.isArray(previewData?.games) ? previewData.games : fallback;

  for (const g of previewGames) {
    const row = document.createElement('label');
    row.className = 'review-game-row';
    row.dataset.status = g.status;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'review-game-cb';
    cb.dataset.name = g.name;
    cb.checked = g.status === 'new';
    cb.addEventListener('change', updateReviewCount);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'review-game-name';
    nameSpan.textContent = g.bgm_name || g.name;

    const badge = document.createElement('span');
    const statusKey = 'popupReviewStatus' + g.status.charAt(0).toUpperCase() + g.status.slice(1);
    badge.className = `review-badge review-badge-${g.status}`;
    badge.textContent = chrome.i18n.getMessage(statusKey) || g.status;

    row.appendChild(cb);
    row.appendChild(nameSpan);
    row.appendChild(badge);
    gameList.appendChild(row);
  }

  updateReviewCount();
}

function hideReviewPanel() {
  document.getElementById('card-review').style.display = 'none';
  document.getElementById('tab-panes').style.display = '';
}

// ── Bulk (paginated) extraction ──

async function handleBulkExtract() {
  if (!currentPattern || !_activeTabId) return;
  _bulkCancelRequested = false;

  const [initialTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!initialTab) return;

  const bulkBtn = document.getElementById('bulk-extract-btn');
  bulkBtn.disabled = true;

  const maxPages = currentPattern.pagination?.max_pages ?? 10;
  const allGames = [];
  const seenNames = new Set();
  let page = 1;

  showBulkProgress(page, maxPages, `Page ${page}…`);

  try {
    while (page <= maxPages && !_bulkCancelRequested) {
      try {
        await injectContentScript(_activeTabId);
      } catch (_e) {
        break;
      }

      const response = await sendExtractMessage(_activeTabId, currentPattern);
      if (response.error || !response.success) break;

      for (const g of response.games || []) {
        const key = normalizeName(g.name);
        if (!seenNames.has(key)) {
          seenNames.add(key);
          allGames.push(g);
        }
      }

      showBulkProgress(
        page,
        maxPages,
        `Page ${page} — ${allGames.length} game${allGames.length === 1 ? '' : 's'} found`
      );

      if (_bulkCancelRequested) break;

      const nextUrl = await findNextPageUrlInTab(_activeTabId, currentPattern);
      if (!nextUrl) break;

      page++;
      if (page > maxPages) break;

      const loadPromise = waitForTabLoad(_activeTabId);
      await chrome.tabs.update(_activeTabId, { url: nextUrl });
      await loadPromise;

      showBulkProgress(page, maxPages, `Page ${page}…`);
    }
  } catch (err) {
    console.error('Bulk extract error:', err);
  }

  bulkBtn.disabled = false;
  hideBulkProgress();

  if (allGames.length === 0) {
    showMessage('No games found across pages', 'error');
    return;
  }

  _reviewTab = initialTab;
  _reviewGames = allGames;
  _reviewDomain = currentDomain;
  await showReviewPanel(allGames);
}

async function findNextPageUrlInTab(tabId, pattern) {
  const selector = pattern.pagination?.next_selector ?? 'a[rel="next"], link[rel="next"]';
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        return el ? el.href || el.getAttribute('href') || null : null;
      },
      args: [selector],
    });
    return results?.[0]?.result || null;
  } catch (_e) {
    return null;
  }
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function showBulkProgress(page, maxPages, statusText) {
  document.getElementById('tab-panes').style.display = 'none';
  document.getElementById('card-review').style.display = 'none';
  document.getElementById('card-success').style.display = 'none';
  document.getElementById('card-bulk-progress').style.display = '';
  const pct = maxPages > 0 ? Math.round(((page - 1) / maxPages) * 100) : 0;
  document.getElementById('bulk-bar').style.width = pct + '%';
  document.getElementById('bulk-status').textContent = statusText;
}

function hideBulkProgress() {
  document.getElementById('card-bulk-progress').style.display = 'none';
  document.getElementById('tab-panes').style.display = '';
}

function updateReviewCount() {
  const count = document.querySelectorAll('.review-game-cb:checked').length;
  document.getElementById('review-count').textContent = chrome.i18n.getMessage('popupReviewCount', [
    String(count),
  ]);
  document.getElementById('review-confirm').disabled = count === 0;
}

async function confirmExtract() {
  const checkedNames = new Set(
    [...document.querySelectorAll('.review-game-cb:checked')].map((cb) => cb.dataset.name)
  );
  const selected = _reviewGames.filter((g) => checkedNames.has(g.name));
  if (!selected.length) return;

  const tab = _reviewTab;
  const domain = _reviewDomain;
  hideReviewPanel();

  const payload = { source: domain, url: tab.url, games: selected };
  try {
    const postResponse = await fetch(BGM_BASE_URL + '/api/extract/extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (postResponse.ok) {
      const result = await postResponse.json();
      if (result && result.job_id) {
        showSuccessState(selected.length, domain, result.job_id);
      } else {
        console.warn('Invalid API response, missing job_id');
        openFallbackExtraction(tab.url);
        return;
      }
    } else {
      console.warn('API returned', postResponse.status);
      openFallbackExtraction(tab.url);
      return;
    }
  } catch (fetchError) {
    console.warn('POST to BGM failed:', fetchError);
    openFallbackExtraction(tab.url);
    return;
  }

  const stats = {
    lastExtraction: { domain, count: selected.length, timestamp: Date.now() },
  };
  await chrome.runtime.sendMessage({ action: 'updateStats', stats });
  updateStatsDisplay(stats);
}

// ── Success state ──

function showSuccessState(count, domain, jobId) {
  document.getElementById('tab-panes').style.display = 'none';
  document.getElementById('card-success').style.display = '';
  document.getElementById('ctx-success-name').textContent = domain;
  document.getElementById('success-msg').textContent = chrome.i18n.getMessage('popupSuccessMsg', [
    String(count),
  ]);
  const link = document.getElementById('success-link');
  link.href = jobId
    ? bgmLink(`/extract?job=${jobId}`, 'extract-result')
    : bgmLink('/extract', 'extract-result');

  if (_successTimer) clearTimeout(_successTimer);
  _successTimer = setTimeout(hideSuccessState, 8000);
}

function hideSuccessState() {
  if (_successTimer) {
    clearTimeout(_successTimer);
    _successTimer = null;
  }
  document.getElementById('card-success').style.display = 'none';
  document.getElementById('tab-panes').style.display = '';
}

// ── Stats ──

async function loadStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.success && response.stats) {
      updateStatsDisplay(response.stats);
    }
  });
}

function updateStatsDisplay(stats) {
  const el = document.getElementById('shop-last-extraction');
  if (!el) return;
  if (stats.lastExtraction && typeof stats.lastExtraction.count === 'number') {
    const { count, domain } = stats.lastExtraction;
    el.textContent = chrome.i18n.getMessage('popupStatsLast', [
      String(count),
      domain || chrome.i18n.getMessage('popupStatsUnknown'),
    ]);
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

// Extract cleaned game title strings from the active tab.
// Works for both CSS-selector and next_data profiles, applying name_cleanup
// so that titles match against BGM wishlist entries.
async function extractPageNames(tabId, pattern) {
  try {
    if (pattern.data_source === 'next_data') {
      const cfg = pattern.next_data;
      if (!cfg || !cfg.items_path) return [];
      const paths = Array.isArray(cfg.items_path) ? cfg.items_path : [cfg.items_path];
      const fieldsName = (cfg.fields && cfg.fields.name) || null;
      const nameCleanup = cfg.name_cleanup || null;
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (paths, fieldsName, nameCleanup) => {
          const script = document.getElementById('__NEXT_DATA__');
          if (!script) return [];
          let data;
          try {
            data = JSON.parse(script.textContent || '');
          } catch {
            return [];
          }
          const walk = (obj, path) => {
            if (!path || obj == null) return undefined;
            for (const part of path.split('.')) {
              const m = part.match(/^([^[\]]+)((?:\[\d+\])*)$/);
              if (!m) return undefined;
              obj = obj == null ? undefined : obj[m[1]];
              if (m[2]) {
                for (const idx of m[2].match(/\d+/g) || []) {
                  if (!Array.isArray(obj)) return undefined;
                  obj = obj[parseInt(idx, 10)];
                }
              }
              if (obj === undefined) return undefined;
            }
            return obj;
          };
          const applyCleanup = (name, cleanup) => {
            if (!cleanup || typeof name !== 'string') return name;
            let c = name;
            if (cleanup.strip_prefix_pattern)
              c = c.replace(new RegExp(cleanup.strip_prefix_pattern), '');
            if (cleanup.strip_suffix_pattern)
              c = c.replace(new RegExp(cleanup.strip_suffix_pattern), '');
            return c.trim();
          };
          const names = [];
          for (const p of paths) {
            const items = walk(data, p);
            if (!Array.isArray(items)) continue;
            for (const item of items) {
              const raw = fieldsName ? walk(item, fieldsName) : null;
              if (!raw || typeof raw !== 'string') continue;
              const name = applyCleanup(raw, nameCleanup);
              if (name) names.push(name);
            }
          }
          return names;
        },
        args: [paths, fieldsName, nameCleanup],
      });
      return results?.[0]?.result || [];
    }

    // CSS-selector path
    const titleSelector = pattern.card_selector
      ? `${pattern.card_selector} ${pattern.selector}`
      : pattern.selector;
    if (!titleSelector) return [];
    const nameCleanup = pattern.name_cleanup || null;
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, nameCleanup) => {
        const applyCleanup = (name, cleanup) => {
          if (!cleanup || typeof name !== 'string') return name;
          let c = name;
          if (cleanup.strip_prefix_pattern)
            c = c.replace(new RegExp(cleanup.strip_prefix_pattern), '');
          if (cleanup.strip_suffix_pattern)
            c = c.replace(new RegExp(cleanup.strip_suffix_pattern), '');
          return c.trim();
        };
        return Array.from(document.querySelectorAll(sel))
          .map((el) => applyCleanup(el.textContent.trim(), nameCleanup))
          .filter(Boolean);
      },
      args: [titleSelector, nameCleanup],
    });
    return results?.[0]?.result || [];
  } catch (_e) {
    return [];
  }
}

// Show how many wishlist games appear on the current shop page.
// Works for both CSS-selector and next_data sites.
async function loadPopupWishlistMatches(tabId, pattern) {
  try {
    const [wlRes, pageNames] = await Promise.all([
      new Promise((resolve) => chrome.runtime.sendMessage({ action: 'getWishlist' }, resolve)),
      extractPageNames(tabId, pattern),
    ]);

    const wishlist = wlRes && wlRes.wishlist;
    if (!wishlist || wishlist.length === 0 || !pageNames || pageNames.length === 0) return;

    const wishlistNorms = new Set(wishlist.map((item) => normalizeName(item.title)));
    const matchCount = pageNames.filter((name) => wishlistNorms.has(normalizeName(name))).length;
    if (matchCount < 1) return;

    const el = document.getElementById('shop-wishlist-count');
    if (!el) return;
    const key = matchCount === 1 ? 'popupShopWishlistSingular' : 'popupShopWishlistPlural';
    el.textContent = chrome.i18n.getMessage(key, [String(matchCount)]);
    el.style.display = '';
  } catch (_e) {
    // silently skip — wishlist unavailable or tab not injectable
  }
}

// ── UI helpers ──

function showMessage(text, type) {
  const message = document.getElementById('message');
  message.textContent = text;
  message.className = `message ${type}`;
  setTimeout(() => {
    message.className = 'message hidden';
  }, 3000);
}

function handleSettings() {
  chrome.runtime.openOptionsPage();
}

// ── More tab: cross-tab CTAs ──

function flashElement(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash-highlight');
  setTimeout(() => el.classList.remove('flash-highlight'), 1600);
}

function handleMoreImportPlays() {
  switchTab('extract');
  setTimeout(() => flashElement('strip-play'), 50);
}

function handleMoreBggSync() {
  if (!currentUser) {
    handleLogin();
    return;
  }
  switchTab('extract');
  showBggSyncPanel(currentUser);
  setTimeout(() => flashElement('bggSyncPanel'), 50);
}

async function handleMoreShare() {
  const shareUrl = bgmLink('/', 'extension-share');
  const shareText = chrome.i18n.getMessage('moreShareText') || 'Check out BoardGameMatcher';
  const shareData = { title: 'BoardGameMatcher', text: shareText, url: shareUrl };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (_e) {
      // user cancelled or share unavailable — fall through to clipboard copy
    }
  }

  try {
    await navigator.clipboard.writeText(shareUrl);
    showMessage(
      chrome.i18n.getMessage('moreShareCopied') || 'Link copied — share it with a fellow gamer!',
      'success'
    );
  } catch (_e) {
    chrome.tabs.create({
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`,
    });
  }
}

// ── Wishlist quick-add ──

const WISHLIST_DEBOUNCE_MS = 250;
const WISHLIST_MIN_QUERY = 2;
const WISHLIST_PAGE_SIZE = 4;
let wishlistSearchTimer = null;
let wishlistSearchAbort = null;
let wishlistCount = null;
let wishlistAllResults = [];
let wishlistPage = 0;
let wishlistHighlightIndex = -1;
let wishlistPageGames = [];

function setupWishlist(user) {
  const link = document.getElementById('wishlist-link');
  if (user.username) {
    link.href = bgmLink(`/collections/${encodeURIComponent(user.username)}`, 'collection-view-all');
  }

  chrome.storage.local.get('selectedCollectionTypes', (data) => {
    if (data.selectedCollectionTypes?.length) {
      selectedTypes = data.selectedCollectionTypes;
    }
    renderChips();
    syncChipReadout();
  });

  loadWishlistCount();
}

function getTypeLabel(typeKey) {
  const type = COLLECTION_TYPES.find((t) => t.key === typeKey);
  return type ? chrome.i18n.getMessage(type.i18nKey) || typeKey : typeKey;
}

function getAddButtonLabel() {
  return '+ ' + selectedTypes.map(getTypeLabel).join(' · ');
}

function syncChipReadout() {
  const readout = document.getElementById('col-chips-readout');
  if (readout) readout.textContent = selectedTypes.map(getTypeLabel).join(' · ');
}

function renderChips() {
  const container = document.getElementById('col-chips');
  if (!container) return;
  container.textContent = '';
  for (const type of COLLECTION_TYPES) {
    const isActive = selectedTypes.includes(type.key);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'col-chip' + (isActive ? ' active' : '');
    btn.dataset.typeKey = type.key;
    const label = chrome.i18n.getMessage(type.i18nKey) || type.key;
    btn.textContent = (isActive ? '✓ ' : '') + type.emoji + ' ' + label;
    btn.addEventListener('click', () => toggleChip(type.key));
    container.appendChild(btn);
  }
}

function toggleChip(typeKey) {
  const isActive = selectedTypes.includes(typeKey);
  if (isActive && selectedTypes.length === 1) return; // keep at least one selected
  selectedTypes = isActive
    ? selectedTypes.filter((k) => k !== typeKey)
    : [...selectedTypes, typeKey];
  chrome.storage.local.set({ selectedCollectionTypes: selectedTypes });
  renderChips();
  syncChipReadout();
  document.querySelectorAll('.wl-btn-add').forEach((btn) => {
    btn.textContent = getAddButtonLabel();
    btn.title = getAddButtonLabel();
  });
}

async function loadWishlistCount() {
  try {
    const response = await fetch(`${BGM_BASE_URL}/api/collections/me`, { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    const list = (data && data.collections && data.collections.wishlist) || [];
    wishlistCount = list.length;
    renderWishlistCount();
  } catch (error) {
    console.warn('Failed to load wishlist count:', error);
  }
}

function renderWishlistCount() {
  const el = document.getElementById('wishlist-count');
  if (wishlistCount === null) {
    el.textContent = '';
  } else if (wishlistCount === 1) {
    el.textContent = chrome.i18n.getMessage('popupWishlistCountSingular');
  } else {
    el.textContent = chrome.i18n.getMessage('popupWishlistCountPlural', [String(wishlistCount)]);
  }
}

function handleWishlistInput(event) {
  if (document.getElementById('gd-card').style.display !== 'none') hideGameDetail();
  const query = event.target.value.trim();
  clearTimeout(wishlistSearchTimer);
  if (wishlistSearchAbort) {
    wishlistSearchAbort.abort();
    wishlistSearchAbort = null;
  }
  if (query.length < WISHLIST_MIN_QUERY) {
    clearWishlistResults();
    document.getElementById('wl-loading').style.display = 'none';
    return;
  }
  document.getElementById('wl-loading').style.display = '';
  document.getElementById('wishlist-results').textContent = '';
  wishlistSearchTimer = setTimeout(() => searchWishlistGames(query), WISHLIST_DEBOUNCE_MS);
}

function handleWishlistKeydown(e) {
  const card = document.getElementById('gd-card');

  // Card is open: Escape closes, arrow keys navigate prev/next
  if (card.style.display !== 'none') {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideGameDetail();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateGameDetail(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateGameDetail(1);
    }
    return;
  }

  const rows = [...document.querySelectorAll('#wishlist-results .wl-result')];
  if (!rows.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setWishlistHighlight(Math.min(wishlistHighlightIndex + 1, rows.length - 1), rows);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setWishlistHighlight(Math.max(wishlistHighlightIndex - 1, 0), rows);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const idx = wishlistHighlightIndex >= 0 ? wishlistHighlightIndex : 0;
    const game = wishlistPageGames[idx];
    if (game) renderGameDetail(game);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    document.getElementById('wishlist-input').value = '';
    clearWishlistResults();
  }
}

function setWishlistHighlight(index, rows) {
  rows.forEach((r) => r.classList.remove('wl-result--highlighted'));
  wishlistHighlightIndex = index;
  rows[index].classList.add('wl-result--highlighted');
  rows[index].scrollIntoView({ block: 'nearest' });
}

async function searchWishlistGames(query) {
  wishlistSearchAbort = new AbortController();
  try {
    const response = await fetch(
      `${BGM_BASE_URL}/api/games/search?q=${encodeURIComponent(query)}`,
      { credentials: 'include', signal: wishlistSearchAbort.signal }
    );
    document.getElementById('wl-loading').style.display = 'none';
    if (response.status === 404) {
      renderWishlistResults([]);
      return;
    }
    if (!response.ok) {
      renderWishlistError(chrome.i18n.getMessage('popupWishlistSearchError'));
      return;
    }
    const data = await response.json();
    renderWishlistResults(data.games || []);
  } catch (error) {
    document.getElementById('wl-loading').style.display = 'none';
    if (error.name === 'AbortError') return;
    console.warn('Wishlist search failed:', error);
    renderWishlistError(chrome.i18n.getMessage('popupWishlistSearchError'));
  }
}

function clearWishlistResults() {
  wishlistAllResults = [];
  wishlistPage = 0;
  document.getElementById('wishlist-results').textContent = '';
  document.getElementById('wl-loading').style.display = 'none';
  document.getElementById('wl-pagination').style.display = 'none';
}

function renderWishlistError(text) {
  wishlistAllResults = [];
  wishlistPage = 0;
  document.getElementById('wl-pagination').style.display = 'none';
  const container = document.getElementById('wishlist-results');
  container.textContent = '';
  const err = document.createElement('div');
  err.className = 'wl-error';
  err.textContent = text;
  container.appendChild(err);
}

function renderWishlistResults(games) {
  wishlistAllResults = games;
  wishlistPage = 0;
  if (bggGameAutoSelect && games.length > 0) {
    bggGameAutoSelect = false;
    wishlistPageGames = games.slice(0, WISHLIST_PAGE_SIZE);
    wishlistHighlightIndex = 0;
    renderGameDetail(games[0]);
    return;
  }
  renderWishlistPage();
}

function renderWishlistPage() {
  const container = document.getElementById('wishlist-results');
  const pagination = document.getElementById('wl-pagination');
  container.textContent = '';

  if (!wishlistAllResults.length) {
    const empty = document.createElement('div');
    empty.className = 'wl-empty';
    empty.textContent = chrome.i18n.getMessage('popupWishlistNoGames');
    container.appendChild(empty);
    pagination.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(wishlistAllResults.length / WISHLIST_PAGE_SIZE);
  const start = wishlistPage * WISHLIST_PAGE_SIZE;
  const slice = wishlistAllResults.slice(start, start + WISHLIST_PAGE_SIZE);
  wishlistPageGames = slice;
  wishlistHighlightIndex = -1;

  for (const game of slice) {
    container.appendChild(buildWishlistRow(game));
  }

  if (totalPages > 1) {
    pagination.style.display = '';
    document.getElementById('wl-page-info').textContent = `${wishlistPage + 1} / ${totalPages}`;
    document.getElementById('wl-prev').disabled = wishlistPage === 0;
    document.getElementById('wl-next').disabled = wishlistPage >= totalPages - 1;
  } else {
    pagination.style.display = 'none';
  }
}

function setupWishlistPagination() {
  document.getElementById('wl-prev').addEventListener('click', () => {
    if (wishlistPage > 0) {
      wishlistPage--;
      renderWishlistPage();
    }
  });
  document.getElementById('wl-next').addEventListener('click', () => {
    const totalPages = Math.ceil(wishlistAllResults.length / WISHLIST_PAGE_SIZE);
    if (wishlistPage < totalPages - 1) {
      wishlistPage++;
      renderWishlistPage();
    }
  });
}

function buildWishlistRow(game) {
  const row = document.createElement('div');
  row.className = 'wl-result';

  const link = document.createElement('a');
  link.className = 'wl-game-link';
  link.href = '#';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    renderGameDetail(game);
  });

  const thumb = document.createElement('img');
  thumb.className = 'wl-thumb';
  thumb.alt = '';
  if (game.image_url) {
    thumb.src = game.image_url;
    thumb.onerror = () => thumb.removeAttribute('src');
  }

  const info = document.createElement('div');
  info.className = 'wl-info';
  const name = document.createElement('div');
  name.className = 'wl-name';
  name.textContent = game.name;
  const year = document.createElement('div');
  year.className = 'wl-year';
  if (game.year_published) year.textContent = String(game.year_published);
  info.append(name, year);
  link.append(thumb, info);

  const zone = document.createElement('div');
  zone.className = 'wl-add-zone';
  const btn = document.createElement('button');
  btn.className = 'wl-btn-add';
  btn.type = 'button';
  btn.textContent = getAddButtonLabel();
  btn.title = getAddButtonLabel();
  btn.addEventListener('click', () => addToCollection(game, btn));
  zone.appendChild(btn);

  row.append(link, zone);
  return row;
}

function navigateGameDetail(delta) {
  const total = wishlistPageGames.length;
  if (total === 0) return;
  const newIdx = Math.max(0, Math.min(total - 1, wishlistHighlightIndex + delta));
  if (newIdx === wishlistHighlightIndex) return;
  const rows = [...document.querySelectorAll('#wishlist-results .wl-result')];
  setWishlistHighlight(newIdx, rows);
  const game = wishlistPageGames[newIdx];
  if (game) renderGameDetail(game);
}

function hideGameDetail() {
  document.getElementById('gd-card').style.display = 'none';
  document.getElementById('wl-search-view').style.display = '';
  if (currentUser) document.getElementById('wl-footer').style.display = '';
}

async function renderGameDetail(game) {
  document.getElementById('wl-search-view').style.display = 'none';
  document.getElementById('wl-footer').style.display = 'none';

  const card = document.getElementById('gd-card');
  card.style.display = '';

  // Nav arrows
  const total = wishlistPageGames.length;
  const idx = wishlistHighlightIndex >= 0 ? wishlistHighlightIndex : 0;
  const nav = document.getElementById('gd-nav');
  if (nav) nav.style.display = total > 1 ? '' : 'none';
  const navPos = document.getElementById('gd-nav-pos');
  if (navPos) navPos.textContent = `${idx + 1} / ${total}`;
  const prevBtn = document.getElementById('gd-prev');
  if (prevBtn) prevBtn.disabled = idx <= 0;
  const nextBtn = document.getElementById('gd-next');
  if (nextBtn) nextBtn.disabled = idx >= total - 1;

  // Cover image
  const cover = document.getElementById('gd-cover');
  if (game.image_url_large || game.image_url) {
    cover.src = game.image_url_large || game.image_url;
    cover.style.display = '';
  } else {
    cover.style.display = 'none';
  }

  // Name + year
  document.getElementById('gd-name').textContent = game.name;
  document.getElementById('gd-year').textContent = game.year_published
    ? String(game.year_published)
    : '';

  // Rating — show score badge if available, otherwise invite user to rate
  const ratingWrap = document.getElementById('gd-rating');
  const noRatingWrap = document.getElementById('gd-no-rating');
  const gameUrl = gameDetailUrl(game.slug, 'game-detail-card');
  if (game.bayes_average) {
    document.getElementById('gd-rating-val').textContent = String(game.bayes_average);
    ratingWrap.style.display = '';
    noRatingWrap.style.display = 'none';
  } else {
    ratingWrap.style.display = 'none';
    const rateLink = document.getElementById('gd-rate-link');
    rateLink.href = gameUrl;
    rateLink.onclick = (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: gameUrl });
    };
    noRatingWrap.style.display = '';
  }

  // CTA — always link directly to the game detail page via slug
  const cta = document.getElementById('gd-cta');
  cta.href = gameUrl;
  cta.onclick = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: gameUrl });
  };

  // Focus + select the search input so typing immediately starts a new search
  const input = document.getElementById('wishlist-input');
  input.focus();
  input.select();

  // Collection pills — only for logged-in users
  const pillsContainer = document.getElementById('gd-pills');
  pillsContainer.textContent = '';

  if (!currentUser) {
    pillsContainer.style.display = 'none';
    return;
  }
  pillsContainer.style.display = '';

  let activeTypes = new Set();
  try {
    const res = await fetch(`${BGM_BASE_URL}/api/collections/${encodeURIComponent(game.id)}`, {
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      activeTypes = new Set(data.collection_types || []);
    }
  } catch (_e) {
    // no-op — pills start unchecked
  }

  for (const ct of COLLECTION_TYPES) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'gd-pill' + (activeTypes.has(ct.key) ? ' active' : '');
    pill.textContent = `${ct.emoji} ${chrome.i18n.getMessage(ct.i18nKey) || ct.key}`;
    pill.addEventListener('click', async () => {
      pill.disabled = true;
      const isActive = pill.classList.contains('active');
      const method = isActive ? 'DELETE' : 'POST';
      try {
        const r = await fetch(
          `${BGM_BASE_URL}/api/collections/${encodeURIComponent(game.id)}/${ct.key}`,
          {
            method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          }
        );
        if (r.ok) pill.classList.toggle('active');
      } catch (_e) {
        // no-op
      } finally {
        pill.disabled = false;
      }
    });
    pillsContainer.appendChild(pill);
  }
}

async function addToCollection(game, btn) {
  btn.disabled = true;
  const typesToAdd = [...selectedTypes];
  try {
    const results = await Promise.all(
      typesToAdd.map((type) =>
        fetch(`${BGM_BASE_URL}/api/collections/${encodeURIComponent(game.id)}/${type}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
          .then((r) => (r.ok ? r.json().catch(() => ({})) : Promise.resolve({})))
          .catch(() => ({}))
      )
    );
    const addedTypes = typesToAdd.filter((_, i) => results[i].added);
    if (!addedTypes.length) {
      btn.disabled = false;
      btn.textContent = chrome.i18n.getMessage('popupWishlistTryAgain');
      return;
    }
    const marker = document.createElement('span');
    marker.className = 'wl-btn-added';
    marker.textContent = '✓ ' + addedTypes.map(getTypeLabel).join(' · ');
    marker.title = marker.textContent;
    btn.replaceWith(marker);
    if (addedTypes.includes('wishlist') && wishlistCount !== null) {
      wishlistCount += 1;
      renderWishlistCount();
    }
  } catch (error) {
    console.warn('Add to collection failed:', error);
    btn.disabled = false;
    btn.textContent = chrome.i18n.getMessage('popupWishlistTryAgain');
  }
}

// ── BGA play stats ──

async function loadBgaStats(user) {
  if (!user) return;
  const playsLink = document.getElementById('bgaPlaysLink');
  if (playsLink && user.username) {
    playsLink.href = bgmLink(`/users/${encodeURIComponent(user.username)}`, 'bga-plays-history');
  }
  try {
    const res = await fetch(`${BGM_BASE_URL}/api/plays/summary`, { credentials: 'include' });
    if (!res.ok) return;
    const { total_plays, win_rate } = await res.json();
    const statText = document.getElementById('bgaStatText');
    if (!statText) return;
    const key = win_rate !== null ? 'popupBgaStats' : 'popupBgaStatsNoRate';
    const args =
      win_rate !== null ? [String(total_plays), String(win_rate)] : [String(total_plays)];
    statText.textContent = chrome.i18n.getMessage(key, args);
    document.getElementById('bgaStatsRow').style.display = '';
  } catch (_e) {
    // stats are optional
  }
}

// ── Unread messages banner ──

async function loadMsgBanner() {
  const banner = document.getElementById('msg-banner');
  const { unreadMessages } = await chrome.storage.local.get('unreadMessages');
  if (!unreadMessages || unreadMessages.count < 1) {
    banner.style.display = 'none';
    return;
  }
  const { count, senders } = unreadMessages;
  let label;
  if (senders && senders.length > 0) {
    const names = senders.slice(0, 2).join(', ');
    label =
      count === 1
        ? chrome.i18n.getMessage('msgBannerNewMessageFrom', [names])
        : chrome.i18n.getMessage('msgBannerNewMessagesFrom', [String(count), names]);
  } else {
    label =
      count === 1
        ? chrome.i18n.getMessage('msgBannerNewMessage')
        : chrome.i18n.getMessage('msgBannerNewMessages', [String(count)]);
  }
  document.getElementById('msg-banner-text').textContent = label;
  banner.href = bgmLink('/messages', 'msg-banner');
  banner.onclick = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: bgmLink('/messages', 'msg-banner') });
  };
  banner.style.display = '';
}

// ── Dashboard ──

function setDashHref(id, url) {
  const el = document.getElementById(id);
  if (el) el.dataset.href = url;
}

async function loadDashboard(user) {
  document.getElementById('dash-logged-out').style.display = 'none';
  document.getElementById('dash-logged-in').style.display = '';

  if (user.username) {
    const u = encodeURIComponent(user.username);
    setDashHref('dash-link-home', bgmLink('/', 'dash-home'));
    setDashHref('dash-link-collections', bgmLink(`/collections/${u}`, 'dash-collections'));
    setDashHref('dash-link-wishlist', bgmLink(`/collections/${u}?tab=wishlist`, 'dash-wishlist'));
  }

  setDashHref('dash-messages', bgmLink('/messages', 'dash-messages'));
  setDashHref('dash-matches', bgmLink('/friends/suggestions', 'dash-matches'));
  setDashHref('dash-notifs', bgmLink('/notifications', 'dash-notifs'));

  // Messages — from service-worker cache
  const { unreadMessages } = await chrome.storage.local.get('unreadMessages');
  if (unreadMessages && unreadMessages.count > 0) {
    const { count, senders } = unreadMessages;
    const badge = document.getElementById('dash-messages-badge');
    badge.textContent = String(count);
    badge.style.display = '';
    document.getElementById('dash-messages').classList.add('has-badge');
    const names = senders && senders.length > 0 ? senders.slice(0, 2).join(', ') : '';
    document.getElementById('dash-messages-sub').textContent = names
      ? chrome.i18n.getMessage('dashMsgFrom', [names])
      : chrome.i18n.getMessage(count === 1 ? 'dashMsgUnread' : 'dashMsgUnreadPlural', [
          String(count),
        ]);
  } else {
    document.getElementById('dash-messages-sub').textContent =
      chrome.i18n.getMessage('dashMsgNone');
  }

  loadDashMatches();
  loadDashNotifications();
}

async function loadDashMatches() {
  try {
    const res = await fetch(`${BGM_BASE_URL}/api/matches/new`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const matches = data.matches || [];
    const sub = document.getElementById('dash-matches-sub');
    if (matches.length > 0) {
      const badge = document.getElementById('dash-matches-badge');
      badge.textContent = String(matches.length);
      badge.style.display = '';
      document.getElementById('dash-matches').classList.add('has-badge');
      const names = matches
        .slice(0, 2)
        .map((m) => m.username)
        .join(', ');
      sub.textContent = `${names}${matches.length > 2 ? ` +${matches.length - 2}` : ''}`;
    } else {
      sub.textContent = chrome.i18n.getMessage('dashMatchesNone');
    }
  } catch (_e) {
    document.getElementById('dash-matches-sub').textContent =
      chrome.i18n.getMessage('dashMatchesFallback');
  }
}

async function loadDashNotifications() {
  try {
    const res = await fetch(`${BGM_BASE_URL}/api/notifications/count`, { credentials: 'include' });
    if (!res.ok) return;
    const text = (await res.text()).trim();
    const count = parseInt(text, 10) || 0;
    const sub = document.getElementById('dash-notifs-sub');
    if (count > 0) {
      const badge = document.getElementById('dash-notifs-badge');
      badge.textContent = String(count);
      badge.style.display = '';
      document.getElementById('dash-notifs').classList.add('has-badge');
      sub.textContent = chrome.i18n.getMessage(
        count === 1 ? 'dashNotifsUnread' : 'dashNotifsUnreadPlural',
        [String(count)]
      );
    } else {
      sub.textContent = chrome.i18n.getMessage('dashNotifsNone');
    }
  } catch (_e) {
    document.getElementById('dash-notifs-sub').textContent = '';
  }
}

// ── BGG Collection Sync ──

async function showBggSyncPanel(_user) {
  document.getElementById('bggSyncPanel').style.display = '';

  let detected = await detectBggUsername();
  if (!detected) {
    const stored = await chrome.storage.local.get('bggUsername');
    detected = stored.bggUsername || null;
  }

  renderBggSyncPanel(detected);
}

async function detectBggUsername() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return null;
    const url = new URL(tab.url);
    if (!url.hostname.includes('boardgamegeek.com')) return null;
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const m = location.pathname.match(/^\/(?:profile|user)\/([^/]+)/);
        if (m) return decodeURIComponent(m[1]);
        if (document.body.dataset.username) return document.body.dataset.username;
        const navLink = document.querySelector('a[href*="/user/"]');
        if (navLink) {
          const lm = navLink.href.match(/\/user\/([^/?#]+)/);
          if (lm) return lm[1];
        }
        return null;
      },
    });
    return results?.[0]?.result || null;
  } catch (_e) {
    return null;
  }
}

function renderBggSyncPanel(username) {
  bggUsername = username;
  const btn = document.getElementById('bggSyncBtn');
  const row = document.getElementById('bggSyncAsRow');
  const asText = document.getElementById('bggSyncAsText');
  const status = document.getElementById('bggSyncStatus');

  if (username) {
    asText.textContent = chrome.i18n.getMessage('popupBggSyncAs', [username]);
    row.style.display = '';
    btn.disabled = false;
    status.textContent = '';
    status.className = 'import-status';
  } else {
    row.style.display = 'none';
    btn.disabled = true;
    status.textContent = chrome.i18n.getMessage('popupBggSyncNoUser');
    status.className = 'import-status';
  }
}

function handleBggSyncClear(e) {
  e.preventDefault();
  chrome.storage.local.remove('bggUsername');
  renderBggSyncPanel(null);
  chrome.tabs.create({ url: 'https://www.boardgamegeek.com' });
}

async function handleBggSync() {
  if (!bggUsername) return;

  const btn = document.getElementById('bggSyncBtn');
  const status = document.getElementById('bggSyncStatus');

  btn.disabled = true;
  status.textContent = chrome.i18n.getMessage('importBggSyncFetching');
  status.className = 'import-status';

  chrome.runtime.sendMessage({ action: 'syncBggCollection', bggUsername }, (response) => {
    btn.disabled = false;
    if (chrome.runtime.lastError) {
      status.textContent = chrome.i18n.getMessage('importErrorPrefix', [
        chrome.runtime.lastError.message,
      ]);
      status.className = 'import-status is-error';
      return;
    }
    if (!response || !response.success) {
      status.textContent = chrome.i18n.getMessage('importErrorPrefix', [
        (response && response.error) || 'Unknown error',
      ]);
      status.className = 'import-status is-error';
      return;
    }
    chrome.storage.local.set({ bggUsername });
    const r = response.results;
    status.textContent = chrome.i18n.getMessage('popupBggSyncSummary', [
      String(r.owned_imported ?? 0),
      String(r.wishlist_imported ?? 0),
      String(r.ratings_imported ?? 0),
    ]);
    status.className = 'import-status is-success';
  });
}
