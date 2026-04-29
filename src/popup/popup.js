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
}

function handleAvatarClick(e) {
  const url = e.currentTarget.dataset.profileUrl;
  if (url) chrome.tabs.create({ url });
}

// ── Card layout ──

function hideAllMainCards() {
  [
    'card-shop',
    'card-review',
    'card-success',
    'card-neutral',
    'card-login',
    'bggSyncPanel',
    'bottom-nav',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function applyCardLayout() {
  hideAllMainCards();

  if (!currentUser) {
    if (siteContext === 'shop') {
      document.getElementById('card-shop').style.display = '';
      document.getElementById('shop-loggedin').style.display = 'none';
      document.getElementById('shop-loggedout').style.display = '';
    } else if (siteContext === 'bga' || siteContext === 'yucata' || siteContext === 'bgg') {
      // platform panels managed by bga-import.js / yucata-import.js / bgg-import.js
    } else {
      document.getElementById('card-login').style.display = '';
    }
    return;
  }

  document.getElementById('bottom-nav').style.display = '';

  switch (siteContext) {
    case 'shop':
      document.getElementById('card-shop').style.display = '';
      document.getElementById('shop-loggedin').style.display = '';
      document.getElementById('shop-loggedout').style.display = 'none';
      break;
    case 'bga':
    case 'yucata':
      // platform panels shown by their own import scripts
      break;
    case 'bgg':
      showBggSyncPanel(currentUser);
      break;
    default:
      document.getElementById('card-neutral').style.display = '';
      break;
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
  const u = encodeURIComponent(user.username || '');

  const profile = document.getElementById('bn-profile');
  const players = document.getElementById('bn-players');
  const wishlist = document.getElementById('bn-wishlist');

  if (profile) {
    profile.href = `${BGM_BASE_URL}/users/${u}`;
    profile.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: profile.href });
    });
  }
  if (players) {
    players.href = `${BGM_BASE_URL}/play/players`;
    players.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: players.href });
    });
  }
  if (wishlist) {
    wishlist.href = `${BGM_BASE_URL}/collections/${u}?tab=wishlist`;
    wishlist.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: wishlist.href });
    });
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
  document.getElementById('card-shop').style.display = 'none';
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
  document.getElementById('card-shop').style.display = '';
  document.getElementById('extract-btn').disabled = false;
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
  hideAllMainCards();
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
  applyCardLayout();
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
    link.href = `${BGM_BASE_URL}/collections/${encodeURIComponent(user.username)}?tab=wishlist`;
  }
  loadWishlistCount();
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

  const btn = document.createElement('button');
  btn.className = 'wl-btn-add';
  btn.type = 'button';
  btn.textContent = chrome.i18n.getMessage('popupWishlistAdd');
  btn.addEventListener('click', () => addToWishlist(game, row, btn));

  row.append(thumb, info, btn);
  return row;
}

async function addToWishlist(game, row, btn) {
  btn.disabled = true;
  try {
    const response = await fetch(
      `${BGM_BASE_URL}/api/collections/${encodeURIComponent(game.id)}/wishlist`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }
    );
    if (!response.ok) {
      btn.disabled = false;
      btn.textContent = chrome.i18n.getMessage('popupWishlistTryAgain');
      return;
    }
    const marker = document.createElement('span');
    marker.className = 'wl-btn-added';
    marker.textContent = chrome.i18n.getMessage('popupWishlistAdded');
    btn.replaceWith(marker);
    if (wishlistCount !== null) {
      wishlistCount += 1;
      renderWishlistCount();
    }
  } catch (error) {
    console.warn('Add to wishlist failed:', error);
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
