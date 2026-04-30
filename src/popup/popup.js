// BGM Toolbox — Popup controller
const BGM_BASE_URL = 'https://boardgamematcher.com';
let currentDomain = null;
let currentPattern = null;
let currentUser = null;
let bggUsername = null;
let siteContext = 'neutral'; // 'shop' | 'bga' | 'yucata' | 'bgg' | 'neutral'

// State held across the extraction review panel
let _reviewTab = null;
let _reviewGames = null;
let _reviewDomain = null;

// State for the success card
let _successTimer = null;

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
  await checkAuth();
  await checkSiteSupport();
  await loadStats();
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  document.getElementById('extract-btn').addEventListener('click', handleExtract);
  document.getElementById('settings-btn').addEventListener('click', handleSettings);
  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('signup-link').addEventListener('click', handleSignup);
  document.getElementById('shop-signin-btn').addEventListener('click', handleLogin);
  document.getElementById('shop-signup-link').addEventListener('click', handleSignup);
  document.getElementById('wishlist-input').addEventListener('input', handleWishlistInput);
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

  document.getElementById('success-extract-again').addEventListener('click', hideSuccessState);
  document.getElementById('success-link').addEventListener('click', (e) => {
    e.preventDefault();
    const href = e.currentTarget.href;
    if (href && href !== '#') chrome.tabs.create({ url: href });
  });

  document.getElementById('bn-extract').addEventListener('click', () => switchTab('extract'));
  document.getElementById('bn-collection').addEventListener('click', () => switchTab('collection'));
  document.getElementById('bn-friends').addEventListener('click', () => {
    chrome.tabs.create({ url: `${BGM_BASE_URL}/play/players` });
  });
  document.getElementById('bn-more').addEventListener('click', () => switchTab('more'));

  const settingsMoreBtn = document.getElementById('settings-more-btn');
  if (settingsMoreBtn) settingsMoreBtn.addEventListener('click', handleSettings);

  const playersLink = document.getElementById('players-link');
  if (playersLink)
    playersLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: `${BGM_BASE_URL}/play/players` });
    });
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

  // Reset extract tab sub-sections
  document.getElementById('extract-idle').style.display = 'none';
  document.getElementById('extract-active').style.display = 'none';

  if (siteContext === 'shop') {
    document.getElementById('extract-active').style.display = '';
    document.getElementById('extract-ctx-pill').style.display = '';
    const btn = document.getElementById('extract-btn');
    btn.disabled = false;
    if (bnExtract) bnExtract.classList.add('compatible');
    switchTab('extract');
  } else if (siteContext === 'bga' || siteContext === 'yucata' || siteContext === 'bgg') {
    // Platform panels are managed by the import scripts; just activate the tab
    if (bnExtract) bnExtract.classList.add('compatible');
    switchTab('extract');
    if (siteContext === 'bgg' && currentUser) showBggSyncPanel(currentUser);
  } else {
    document.getElementById('extract-idle').style.display = '';
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
      cardLogin.style.display = '';
    }
  } else {
    cardNeutral.style.display = '';
    if (siteContext === 'shop' && _activeTabId && currentPattern) {
      loadPopupWishlistMatches(_activeTabId, currentPattern);
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
    } else {
      setLoggedOut();
    }
  } catch (error) {
    console.warn('Auth check failed:', error);
    setLoggedOut();
  }
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
    avatar.dataset.profileUrl = `${BGM_BASE_URL}/users/${encodeURIComponent(user.username)}`;
  } else {
    delete avatar.dataset.profileUrl;
  }

  setupBottomNav(user);
  setupWishlist(user);
  loadBgaStats(user);
  loadMsgBanner();
}

function setLoggedOut() {
  document.getElementById('user-avatar').style.display = 'none';
  document.getElementById('msg-banner').style.display = 'none';
  const bgaTeaserRow = document.getElementById('bgaTeaserRow');
  if (bgaTeaserRow) bgaTeaserRow.style.display = '';
}

function handleLogin() {
  chrome.tabs.create({ url: BGM_BASE_URL + '/auth/login' });
}

function handleSignup(e) {
  e.preventDefault();
  chrome.tabs.create({ url: BGM_BASE_URL + '/auth/register' });
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
      siteContext = 'bgg';
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
    link.href = `${BGM_BASE_URL}/collections/${encodeURIComponent(user.username)}`;
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
  chrome.tabs.create({ url: BGM_BASE_URL + '/extract?url=' + encodeURIComponent(url) });
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
  link.href = jobId ? `${BGM_BASE_URL}/extract?job=${jobId}` : `${BGM_BASE_URL}/extract`;

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

// ── Wishlist quick-add ──

const WISHLIST_DEBOUNCE_MS = 250;
const WISHLIST_MIN_QUERY = 2;
let wishlistSearchTimer = null;
let wishlistSearchAbort = null;
let wishlistCount = null;

function setupWishlist(user) {
  const link = document.getElementById('wishlist-link');
  if (user.username) {
    link.href = `${BGM_BASE_URL}/collections/${encodeURIComponent(user.username)}`;
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
  const query = event.target.value.trim();
  clearTimeout(wishlistSearchTimer);
  if (wishlistSearchAbort) {
    wishlistSearchAbort.abort();
    wishlistSearchAbort = null;
  }
  if (query.length < WISHLIST_MIN_QUERY) {
    clearWishlistResults();
    return;
  }
  wishlistSearchTimer = setTimeout(() => searchWishlistGames(query), WISHLIST_DEBOUNCE_MS);
}

async function searchWishlistGames(query) {
  wishlistSearchAbort = new AbortController();
  try {
    const response = await fetch(
      `${BGM_BASE_URL}/api/games/search?q=${encodeURIComponent(query)}`,
      { credentials: 'include', signal: wishlistSearchAbort.signal }
    );
    if (!response.ok) {
      renderWishlistError(chrome.i18n.getMessage('popupWishlistSearchError'));
      return;
    }
    const data = await response.json();
    renderWishlistResults(data.games || []);
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.warn('Wishlist search failed:', error);
    renderWishlistError(chrome.i18n.getMessage('popupWishlistSearchError'));
  }
}

function clearWishlistResults() {
  document.getElementById('wishlist-results').textContent = '';
}

function renderWishlistError(text) {
  const container = document.getElementById('wishlist-results');
  container.textContent = '';
  const err = document.createElement('div');
  err.className = 'wl-error';
  err.textContent = text;
  container.appendChild(err);
}

function renderWishlistResults(games) {
  const container = document.getElementById('wishlist-results');
  container.textContent = '';
  if (!games.length) {
    const empty = document.createElement('div');
    empty.className = 'wl-error';
    empty.textContent = chrome.i18n.getMessage('popupWishlistNoGames');
    container.appendChild(empty);
    return;
  }
  for (const game of games) {
    container.appendChild(buildWishlistRow(game));
  }
}

function buildWishlistRow(game) {
  const row = document.createElement('div');
  row.className = 'wl-result';

  const link = document.createElement('a');
  link.className = 'wl-game-link';
  link.href = '#';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const path = game.slug
      ? `/boardgames/${encodeURIComponent(game.slug)}`
      : `/search?q=${encodeURIComponent(game.name)}`;
    chrome.tabs.create({ url: BGM_BASE_URL + path });
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
    playsLink.href = `${BGM_BASE_URL}/users/${encodeURIComponent(user.username)}`;
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
  banner.href = `${BGM_BASE_URL}/messages`;
  banner.onclick = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${BGM_BASE_URL}/messages` });
  };
  banner.style.display = '';
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
