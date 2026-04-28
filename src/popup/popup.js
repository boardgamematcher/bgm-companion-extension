// BGM Toolbox — Popup controller
const BGM_BASE_URL = 'https://boardgamematcher.com';
let currentDomain = null;
let currentPattern = null;
let currentUser = null;
let bggUsername = null;

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
  document.getElementById('wishlist-input').addEventListener('input', handleWishlistInput);
  document.getElementById('user-avatar').addEventListener('click', handleAvatarClick);
  document.getElementById('bggSyncBtn').addEventListener('click', handleBggSync);
  document.getElementById('bggSyncClear').addEventListener('click', handleBggSyncClear);
  document.getElementById('bgaTeaserSignin').addEventListener('click', handleLogin);
}

function handleAvatarClick(e) {
  const url = e.currentTarget.dataset.profileUrl;
  if (url) {
    chrome.tabs.create({ url });
  }
}

// ── Auth ──

async function checkAuth() {
  try {
    const response = await fetch(BGM_BASE_URL + '/api/me', {
      credentials: 'include',
    });
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

  document.getElementById('card-login').style.display = 'none';
  document.getElementById('card-teaser').style.display = 'none';
  document.getElementById('banner-text').textContent =
    chrome.i18n.getMessage('popupBannerLoggedIn');
  showWishlistCard(user);
  showBggSyncPanel(user);
  loadBgaStats(user);
}

function setLoggedOut() {
  document.getElementById('user-avatar').style.display = 'none';
  document.getElementById('card-login').style.display = '';
  document.getElementById('card-wishlist').style.display = 'none';
  document.getElementById('card-teaser').style.display = '';
  document.getElementById('bggSyncPanel').style.display = 'none';
  document.getElementById('bgaTeaserRow').style.display = '';
  document.getElementById('banner-text').textContent =
    chrome.i18n.getMessage('popupBannerLoggedOut');
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
    icon.innerHTML = '&#9788;'; // sun
  } else {
    document.body.classList.remove('light');
    icon.innerHTML = '&#9790;'; // moon
  }
}

// ── Site support ──

async function checkSiteSupport() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      setUnsupported(null);
      return;
    }

    const url = new URL(tab.url);
    currentDomain = url.hostname;

    chrome.runtime.sendMessage(
      { action: 'checkSiteSupport', domain: currentDomain, url: tab.url },
      async (response) => {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.lastError);
          setUnsupported('Error checking site');
          return;
        }
        if (response && response.supported) {
          currentPattern = response.pattern;
          setSupported(response.pattern.name);
          await countGames(tab.id, response.pattern);
        } else {
          setUnsupported(currentDomain);
        }
      }
    );
  } catch (error) {
    console.error('Error checking site support:', error);
    setUnsupported('Error checking site');
  }
}

function setSupported(siteName) {
  document.getElementById('card-extract').style.display = '';
  document.getElementById('card-unsupported').style.display = 'none';
  document.getElementById('detected-site').textContent = chrome.i18n.getMessage(
    'popupSiteDetected',
    [siteName]
  );
  document.getElementById('extract-btn').disabled = false;
  // Extract is the primary CTA when on a supported shop. Suppress the
  // teaser pitch — the login card alone is enough sign-up nudge, and
  // shop extraction does not require a BGM account.
  document.getElementById('card-teaser').style.display = 'none';
}

function setUnsupported(domain) {
  document.getElementById('card-extract').style.display = 'none';
  document.getElementById('card-unsupported').style.display = '';
  let msg;
  if (domain === null) {
    msg = chrome.i18n.getMessage('popupUnsupportedNoTab');
  } else if (domain) {
    msg = chrome.i18n.getMessage('popupUnsupportedDomain', [domain]);
  } else {
    msg = chrome.i18n.getMessage('popupUnsupportedDefault');
  }
  document.getElementById('unsupported-text').textContent = msg;
}

async function countGames(tabId, pattern) {
  // Count items from a Next.js __NEXT_DATA__ payload (Veepee, etc.)
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
      // Can't inject into this page (e.g. chrome:// URLs)
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
    // Can't inject into this page (e.g. chrome:// URLs)
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

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      showMessage(chrome.i18n.getMessage('popupNoTab'), 'error');
      return;
    }

    // Inject content script and extract structured data from the page
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

    const games = response.games;

    // POST structured data to BGM and open results page
    const payload = { source: currentDomain, url: tab.url, games };
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
          chrome.tabs.create({ url: BGM_BASE_URL + '/extract?job=' + result.job_id });
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

    // Update stats
    const stats = {
      lastExtraction: {
        domain: currentDomain,
        count: games.length,
        timestamp: Date.now(),
      },
    };
    await chrome.runtime.sendMessage({ action: 'updateStats', stats });
    updateStatsDisplay(stats);
    window.close();
  } catch (error) {
    console.error('Error extracting:', error);
    showMessage(chrome.i18n.getMessage('popupErrorPrefix', [error.message]), 'error');
  }
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
  const statsText = document.getElementById('stats-text');
  if (stats.lastExtraction && typeof stats.lastExtraction.count === 'number') {
    const { count, domain } = stats.lastExtraction;
    statsText.textContent = chrome.i18n.getMessage('popupStatsLast', [
      String(count),
      domain || chrome.i18n.getMessage('popupStatsUnknown'),
    ]);
  } else {
    statsText.textContent = chrome.i18n.getMessage('popupStatsEmpty');
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

function showWishlistCard(user) {
  document.getElementById('card-wishlist').style.display = '';
  const link = document.getElementById('wishlist-link');
  if (user.username) {
    link.href = `${BGM_BASE_URL}/collections/${encodeURIComponent(user.username)}?tab=wishlist`;
  }
  loadWishlistCount();
}

async function loadWishlistCount() {
  try {
    const response = await fetch(`${BGM_BASE_URL}/api/collections/me`, {
      credentials: 'include',
    });
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
    // stats are optional — silently skip
  }
}

// ── BGG Collection Sync ──

async function showBggSyncPanel(_user) {
  document.getElementById('bggSyncPanel').style.display = '';

  // 1. Try auto-detect from active tab if it's on BGG
  let detected = await detectBggUsername();

  // 2. Fall back to last-saved username
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
