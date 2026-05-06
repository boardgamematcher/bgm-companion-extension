// Background service worker for managing patterns
const PROFILES_URL =
  'https://raw.githubusercontent.com/boardgamematcher/site-profiles/main/profiles.json';
const PROFILES_CACHE_KEY = 'cachedProfiles';
const PROFILES_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const WISHLIST_CACHE_KEY = 'cachedWishlist';
const WISHLIST_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const BGM_BASE_URL = 'https://boardgamematcher.com';
const NEWS_POLL_ALARM = 'bgm-news-poll';
const MSG_POLL_ALARM = 'bgm-messages-poll';
const FRIEND_REQ_POLL_ALARM = 'bgm-friend-req-poll';
const MATCH_POLL_ALARM = 'bgm-match-poll';
const SESSION_INVITE_POLL_ALARM = 'bgm-session-invite-poll';

// Verbose service-worker logs are off in shipped builds. Flip to `true`
// locally when debugging pattern loading or cache behaviour. Errors and
// warnings are always emitted regardless of this flag.
const DEBUG = false;
const debug = DEBUG ? console.log.bind(console) : () => {};

let cachedPatterns = [];
let reloadingPromise = null;
let patternsReady = false;

// Load patterns eagerly on service worker start
reloadPatterns();

// Clear profile cache on install/update so new profiles take effect
chrome.runtime.onInstalled.addListener(async () => {
  debug('BGM Toolbox installed/updated — clearing profile cache');
  await chrome.storage.local.remove(PROFILES_CACHE_KEY);
  await reloadPatterns();

  chrome.alarms.create(NEWS_POLL_ALARM, { periodInMinutes: 60 });
  chrome.alarms.create(MSG_POLL_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(FRIEND_REQ_POLL_ALARM, { periodInMinutes: 5 });
  chrome.alarms.create(MATCH_POLL_ALARM, { periodInMinutes: 60 });
  chrome.alarms.create(SESSION_INVITE_POLL_ALARM, { periodInMinutes: 5 });
  pollNews();
  pollUnreadMessages();
  pollFriendRequests();
  pollNewMatches();
  pollSessionInvites();

  // Create context menus (removeAll first to avoid duplicate-ID errors on reload)
  chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'bgm-extract-page',
    title: 'Extract Board Games from this page',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'bgm-extract-link',
    title: 'Extract Board Games from this link',
    contexts: ['link'],
  });
  chrome.contextMenus.create({
    id: 'bgm-search-game',
    title: 'Search "%s" on BoardGameMatcher',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'bgm-extract-url-selection',
    title: 'Extract Board Games from this URL',
    contexts: ['selection'],
    visible: false,
  });
  chrome.contextMenus.create({
    id: 'bgm-search-game-popup',
    title: 'Find "%s" in BGM extension',
    contexts: ['selection'],
  });
});

// Show URL-extract item only when the selection is an actual URL.
// onShown / refresh() are Firefox-only — guard so Chromium SW doesn't crash.
// On Chromium the URL-extract item simply stays hidden (visible: false), and
// the click handler ignores non-URL selections defensively.
if (chrome.contextMenus.onShown && chrome.contextMenus.refresh) {
  chrome.contextMenus.onShown.addListener((info) => {
    if (!info.contexts.includes('selection')) return;
    const t = (info.selectionText ?? '').trim();
    const isUrl = t.startsWith('http://') || t.startsWith('https://');
    chrome.contextMenus.update('bgm-extract-url-selection', { visible: isUrl });
    chrome.contextMenus.refresh();
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  let extractUrl;

  if (info.menuItemId === 'bgm-extract-link' && info.linkUrl) {
    extractUrl = BGM_BASE_URL + '/extract?url=' + encodeURIComponent(info.linkUrl);
  } else if (info.menuItemId === 'bgm-extract-page') {
    const pageUrl = info.pageUrl || tab?.url;
    if (pageUrl) {
      extractUrl = BGM_BASE_URL + '/extract?url=' + encodeURIComponent(pageUrl);
    }
  }

  if (info.menuItemId === 'bgm-search-game' && info.selectionText) {
    chrome.tabs.create({
      url: BGM_BASE_URL + '/search?q=' + encodeURIComponent(info.selectionText.trim()),
    });
    return;
  }

  if (info.menuItemId === 'bgm-extract-url-selection' && info.selectionText) {
    const trimmed = info.selectionText.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      chrome.tabs.create({ url: BGM_BASE_URL + '/extract?url=' + encodeURIComponent(trimmed) });
    }
    return;
  }

  if (info.menuItemId === 'bgm-search-game-popup' && info.selectionText) {
    const query = info.selectionText.trim();
    chrome.storage.session.set({ pendingPopupSearch: query }).then(() => {
      chrome.action.openPopup().catch(() => {
        // openPopup() not available in this browser/version — fall back to website search
        chrome.tabs.create({ url: BGM_BASE_URL + '/search?q=' + encodeURIComponent(query) });
      });
    });
    return;
  }

  if (extractUrl) {
    chrome.tabs.create({ url: extractUrl });
  }
});

// Fetch shared profiles from GitHub, with local cache and bundled fallback
async function fetchSharedProfiles() {
  // Check local cache first
  try {
    const cached = await chrome.storage.local.get(PROFILES_CACHE_KEY);
    const entry = cached[PROFILES_CACHE_KEY];
    if (entry && Date.now() - entry.timestamp < PROFILES_CACHE_TTL) {
      debug('Using cached profiles (%d profiles)', entry.profiles.length);
      return entry.profiles;
    }
  } catch (_e) {
    // Cache read failed, continue to fetch
  }

  // Fetch from GitHub
  try {
    const response = await fetch(PROFILES_URL);
    if (response.ok) {
      const data = await response.json();
      const profiles = data.profiles || [];
      await chrome.storage.local.set({
        [PROFILES_CACHE_KEY]: { profiles, timestamp: Date.now() },
      });
      debug('Fetched %d profiles from GitHub', profiles.length);
      return profiles;
    }
  } catch (_e) {
    console.warn('Failed to fetch profiles from GitHub, using fallback');
  }

  // Fall back to bundled file
  try {
    const response = await fetch(chrome.runtime.getURL('patterns/built-in.json'));
    const data = await response.json();
    return data.profiles || [];
  } catch (_e) {
    return [];
  }
}

// Load patterns from shared profiles + custom patterns
function reloadPatterns() {
  if (reloadingPromise) return reloadingPromise;
  reloadingPromise = (async () => {
    try {
      const sharedProfiles = await fetchSharedProfiles();

      const result = await chrome.storage.local.get('customPatterns');
      const custom = result.customPatterns || [];

      // Merge: shared profiles first, custom overrides by domain+name
      const patternMap = new Map();
      sharedProfiles.forEach((p) => patternMap.set(p.domain + ':' + p.name, p));
      custom.forEach((p) => patternMap.set(p.domain + ':' + (p.name || 'custom'), p));

      cachedPatterns = Array.from(patternMap.values());
      patternsReady = true;
      debug('Loaded patterns:', cachedPatterns.length);
    } catch (error) {
      console.error('Error loading patterns:', error);
      cachedPatterns = [];
      patternsReady = false;
    } finally {
      reloadingPromise = null;
    }
  })();
  return reloadingPromise;
}

// Find pattern for domain (simple) or full URL (precise via url_pattern)
function findPatternForDomain(domain, url) {
  // Try URL pattern match first (more specific, first match wins)
  if (url) {
    for (const p of cachedPatterns) {
      if (p.url_pattern) {
        try {
          if (new RegExp(p.url_pattern).test(url)) {
            return p;
          }
        } catch (_e) {
          // Invalid regex, skip
        }
      }
    }
  }
  // Fall back to domain match
  return cachedPatterns.find((p) => domain === p.domain || domain.endsWith('.' + p.domain)) || null;
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkSiteSupport') {
    const respond = () => {
      const pattern = findPatternForDomain(message.domain, message.url);
      sendResponse({ supported: pattern !== null, pattern });
    };
    if (!patternsReady) {
      reloadPatterns().then(respond);
      return true;
    }
    respond();
    return false;
  }

  if (message.action === 'updateStats') {
    updateStats(message.stats);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'reloadPatterns') {
    reloadPatterns().then(() => {
      sendResponse({ success: true, count: cachedPatterns.length });
    });
    return true;
  }

  if (message.action === 'postPlays') {
    postPlays(message.plays, { platformSlug: message.platformSlug })
      .then((results) => sendResponse({ success: true, results }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'getStats') {
    getStats().then((stats) => {
      sendResponse({ success: true, stats });
    });
    return true;
  }

  if (message.action === 'pollMessages') {
    pollUnreadMessages();
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'pollNews') {
    pollNews();
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'pollFriendRequests') {
    pollFriendRequests();
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'pollMatches') {
    pollNewMatches();
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'pollSessionInvites') {
    pollSessionInvites();
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'getWishlist') {
    fetchWishlist().then((wishlist) => sendResponse({ wishlist }));
    return true;
  }

  if (message.action === 'resolveGameOverlay') {
    resolveGameOverlay(message.title)
      .then((data) => sendResponse(data))
      .catch(() => sendResponse({ error: 'resolve_failed' }));
    return true;
  }

  if (message.action === 'setCollectionType') {
    setCollectionType(message.gameId, message.collectionType, message.add)
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  // Open a URL in a new tab. Used by the overlay's links so host-page
  // global click handlers (e.g. Philibert's) can't swallow them.
  if (message.action === 'openTab' && typeof message.url === 'string') {
    if (message.url.startsWith('https://') || message.url.startsWith('http://')) {
      chrome.tabs.create({ url: message.url });
    }
    sendResponse({ success: true });
    return false;
  }
});

// Update extraction stats
async function updateStats(stats) {
  try {
    await chrome.storage.local.set({ stats });
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

// POST plays to BGM API in chunks to avoid server timeouts.
// platformSlug tags the batch with its source (e.g. "yucata", "board-game-arena").
async function postPlays(plays, { platformSlug } = {}) {
  const storage = await chrome.storage.local.get('apiUrl');
  const apiUrl = storage.apiUrl || BGM_BASE_URL;
  const CHUNK_SIZE = 200;

  // Build the per-play payload. The game identifier coming from the mapping
  // files is either a BGG integer id (most games) or a BGM-native boardgame
  // UUID string (for BGA/Yucata-exclusive games that have no BGG entry — see
  // BGM-812). The batch endpoint accepts either `bgg_id` or `boardgame_id`.
  //
  // Omit outcome when the scraper couldn't determine it — the server records
  // NULL rather than a bogus 'loss'. See BGM-812 / BGM-810.
  const allPlays = plays.map((play) => {
    const payload = {
      gameName: play.gameName,
      played_at: play.played_at,
      player_count: play.player_count,
    };
    if (typeof play.boardgame_id === 'number') {
      payload.bgg_id = play.boardgame_id;
    } else {
      payload.boardgame_id = play.boardgame_id;
    }
    if (play.outcome === 'win' || play.outcome === 'loss' || play.outcome === 'draw') {
      payload.outcome = play.outcome;
    }
    return payload;
  });

  const allPosted = [];
  const allSkipped = [];

  for (let i = 0; i < allPlays.length; i += CHUNK_SIZE) {
    const chunk = allPlays.slice(i, i + CHUNK_SIZE);

    // Broadcast progress
    chrome.runtime
      .sendMessage({
        action: 'playsImportProgress',
        current: Math.min(i + CHUNK_SIZE, allPlays.length),
        total: allPlays.length,
      })
      .catch(() => {});

    const body = { plays: chunk };
    if (platformSlug) body.digital_platform_slug = platformSlug;

    const response = await fetch(`${apiUrl}/api/plays/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-BGM-Source': 'toolbox' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API error ${response.status}: ${body}`);
    }

    const result = await response.json();
    allPosted.push(...(result.play_sessions || []));
    allSkipped.push(...(result.skipped_games || []));
  }

  if (allSkipped.length > 0) {
    console.warn('Yucata import: games not found on BGM:', allSkipped.join(', '));
  }

  return {
    posted: allPosted,
    skipped: allSkipped,
    duplicates: allSkipped.length,
  };
}

// Get extraction stats
async function getStats() {
  try {
    const result = await chrome.storage.local.get('stats');
    return result.stats || { lastExtraction: null };
  } catch (error) {
    console.error('Error getting stats:', error);
    return { lastExtraction: null };
  }
}

// ── Notification polling ──

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === NEWS_POLL_ALARM) pollNews();
  if (alarm.name === MSG_POLL_ALARM) pollUnreadMessages();
  if (alarm.name === FRIEND_REQ_POLL_ALARM) pollFriendRequests();
  if (alarm.name === MATCH_POLL_ALARM) pollNewMatches();
  if (alarm.name === SESSION_INVITE_POLL_ALARM) pollSessionInvites();
});

chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId.startsWith('bgm-news-')) {
    const slug = notifId.slice('bgm-news-'.length);
    chrome.tabs.create({ url: `${BGM_BASE_URL}/news/${slug}` });
    chrome.notifications.clear(notifId);
  }
  if (notifId.startsWith('bgm-friend-')) {
    chrome.tabs.create({ url: `${BGM_BASE_URL}/friends` });
    chrome.notifications.clear(notifId);
  }
  if (notifId.startsWith('bgm-match-')) {
    chrome.tabs.create({ url: `${BGM_BASE_URL}/play` });
    chrome.notifications.clear(notifId);
  }
  if (notifId.startsWith('bgm-session-')) {
    const gameNightId = notifId.slice('bgm-session-'.length).split('_')[0];
    chrome.tabs.create({ url: `${BGM_BASE_URL}/play/sessions/${gameNightId}` });
    chrome.notifications.clear(notifId);
  }
  if (notifId.startsWith('bgm-game-')) {
    const slug = notifId.slice('bgm-game-'.length);
    chrome.tabs.create({ url: `${BGM_BASE_URL}/boardgames/${slug}` });
    chrome.notifications.clear(notifId);
  }
});

async function pollNews() {
  try {
    const { newsNotifEnabled = true } = await chrome.storage.local.get('newsNotifEnabled');
    if (!newsNotifEnabled) return;

    const res = await fetch(`${BGM_BASE_URL}/api/news/latest`);
    if (!res.ok) return;

    const item = await res.json();
    if (!item || !item.id) return;

    const { lastSeenNewsId } = await chrome.storage.local.get('lastSeenNewsId');

    // First run: just record the current latest item without notifying
    if (!lastSeenNewsId) {
      await chrome.storage.local.set({ lastSeenNewsId: item.id });
      return;
    }

    if (item.id !== lastSeenNewsId) {
      chrome.notifications.create(`bgm-news-${item.slug}`, {
        type: 'basic',
        iconUrl: '/icons/icon128.png',
        title: chrome.i18n.getMessage('notifNewsTitle'),
        message: item.title,
      });
      await chrome.storage.local.set({ lastSeenNewsId: item.id });
    }
  } catch (_e) {
    // Network failure — silently skip
  }
}

async function pollFriendRequests() {
  try {
    const { friendReqNotifEnabled = true } =
      await chrome.storage.local.get('friendReqNotifEnabled');
    if (!friendReqNotifEnabled) return;

    const res = await fetch(`${BGM_BASE_URL}/api/friends/pending-summary`, {
      credentials: 'include',
    });
    if (!res.ok) return;

    const { requests } = await res.json();
    if (!requests || requests.length === 0) return;

    const { notifiedFriendReqIds = [] } = await chrome.storage.local.get('notifiedFriendReqIds');
    const seenSet = new Set(notifiedFriendReqIds);

    const newRequests = requests.filter((r) => !seenSet.has(r.id));
    if (newRequests.length === 0) return;

    const names = newRequests.map((r) => r.username);
    let message;
    if (names.length === 1) {
      message = chrome.i18n.getMessage('notifFriendReqOne', [names[0]]);
    } else if (names.length === 2) {
      message = chrome.i18n.getMessage('notifFriendReqTwo', [names[0], names[1]]);
    } else {
      message = chrome.i18n.getMessage('notifFriendReqMany', [names[0], String(names.length - 1)]);
    }

    chrome.notifications.create(`bgm-friend-${Date.now()}`, {
      type: 'basic',
      iconUrl: '/icons/icon128.png',
      title: chrome.i18n.getMessage('notifFriendReqTitle'),
      message,
    });

    // Store all currently-pending IDs (prunes accepted/declined ones automatically)
    const allCurrentIds = requests.map((r) => r.id);
    await chrome.storage.local.set({ notifiedFriendReqIds: allCurrentIds });
  } catch (_e) {
    // Network failure — silently skip
  }
}

async function pollNewMatches() {
  try {
    const { matchNotifEnabled = true } = await chrome.storage.local.get('matchNotifEnabled');
    if (!matchNotifEnabled) return;

    const res = await fetch(`${BGM_BASE_URL}/api/matches/new`, { credentials: 'include' });
    if (!res.ok) return;

    const { matches } = await res.json();
    if (!matches || matches.length === 0) return;

    const { notifiedMatchIds = [] } = await chrome.storage.local.get('notifiedMatchIds');
    const seenSet = new Set(notifiedMatchIds);

    const newMatches = matches.filter((m) => !seenSet.has(m.user_id));
    if (newMatches.length === 0) return;

    const top = newMatches[0];
    const message =
      newMatches.length === 1
        ? chrome.i18n.getMessage('notifMatchOne', [top.username, String(top.score)])
        : chrome.i18n.getMessage('notifMatchMany', [top.username, String(newMatches.length - 1)]);

    chrome.notifications.create(`bgm-match-${Date.now()}`, {
      type: 'basic',
      iconUrl: '/icons/icon128.png',
      title: chrome.i18n.getMessage('notifMatchTitle'),
      message,
    });

    // Store all current match IDs so we don't re-notify on the next poll
    await chrome.storage.local.set({ notifiedMatchIds: matches.map((m) => m.user_id) });
  } catch (_e) {
    // Network failure — silently skip
  }
}

async function pollSessionInvites() {
  try {
    const { sessionInviteNotifEnabled = true } = await chrome.storage.local.get(
      'sessionInviteNotifEnabled'
    );
    if (!sessionInviteNotifEnabled) return;

    const res = await fetch(`${BGM_BASE_URL}/api/sessions/invites/pending`, {
      credentials: 'include',
    });
    if (!res.ok) return;

    const { invites } = await res.json();
    if (!invites || invites.length === 0) return;

    const { notifiedInviteIds = [] } = await chrome.storage.local.get('notifiedInviteIds');
    const seenSet = new Set(notifiedInviteIds);

    const newInvites = invites.filter((inv) => !seenSet.has(inv.id));
    if (newInvites.length === 0) return;

    const top = newInvites[0];
    const message =
      newInvites.length === 1
        ? chrome.i18n.getMessage('notifSessionInviteOne', [top.host_username, top.title])
        : chrome.i18n.getMessage('notifSessionInviteMany', [
            top.host_username,
            String(newInvites.length - 1),
          ]);

    chrome.notifications.create(`bgm-session-${top.game_night_id}_${Date.now()}`, {
      type: 'basic',
      iconUrl: '/icons/icon128.png',
      title: chrome.i18n.getMessage('notifSessionInviteTitle'),
      message,
    });

    // Store all current invite IDs (removes accepted/declined ones automatically)
    await chrome.storage.local.set({ notifiedInviteIds: invites.map((inv) => inv.id) });
  } catch (_e) {
    // Network failure — silently skip
  }
}

async function pollUnreadMessages() {
  try {
    const { msgBadgeEnabled = true } = await chrome.storage.local.get('msgBadgeEnabled');
    if (!msgBadgeEnabled) {
      chrome.action.setBadgeText({ text: '' });
      await chrome.storage.local.remove('unreadMessages');
      return;
    }
    const res = await fetch(`${BGM_BASE_URL}/api/messages/unread-summary`, {
      credentials: 'include',
    });
    if (!res.ok) {
      chrome.action.setBadgeText({ text: '' });
      await chrome.storage.local.remove('unreadMessages');
      return;
    }
    const { count, senders } = await res.json();
    if (count > 0) {
      chrome.action.setBadgeText({ text: String(count) });
      chrome.action.setBadgeBackgroundColor({ color: '#f5a623' });
      await chrome.storage.local.set({ unreadMessages: { count, senders } });
    } else {
      chrome.action.setBadgeText({ text: '' });
      await chrome.storage.local.remove('unreadMessages');
    }
  } catch (_e) {
    chrome.action.setBadgeText({ text: '' });
    await chrome.storage.local.remove('unreadMessages');
  }
}

// Fetch the user's wishlist from BGM, cached for 10 minutes.
// Returns null when the user is not logged in or on network failure.
async function fetchWishlist() {
  try {
    const cached = await chrome.storage.local.get(WISHLIST_CACHE_KEY);
    const entry = cached[WISHLIST_CACHE_KEY];
    if (entry && Date.now() - entry.timestamp < WISHLIST_CACHE_TTL) {
      return entry.wishlist;
    }
  } catch (_e) {
    // Cache read failed, continue to fetch
  }

  try {
    const res = await fetch(`${BGM_BASE_URL}/api/me/wishlist`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    const wishlist = data.wishlist || [];
    await chrome.storage.local.set({
      [WISHLIST_CACHE_KEY]: { wishlist, timestamp: Date.now() },
    });
    return wishlist;
  } catch (_e) {
    return null;
  }
}

// ── Game overlay (BGM-976) ────────────────────────────────────────────────

const OVERLAY_GAME_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function normalizeForMatch(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Resolve a retailer page title to a BGM game + the user's collection types.
// Returns { game: {id, name, slug, bayes_average}, collectionTypes: [] } or { error }.
async function resolveGameOverlay(title) {
  if (!title || typeof title !== 'string') return { error: 'invalid_title' };

  // Per-tab session cache keyed by normalized title
  const cacheKey = `bgmOverlayGame:${normalizeForMatch(title)}`;
  let game;
  try {
    const cached = await chrome.storage.session.get(cacheKey);
    const entry = cached[cacheKey];
    if (entry && Date.now() - entry.timestamp < OVERLAY_GAME_CACHE_TTL) {
      game = entry.game;
    }
  } catch (_) {
    // ignore
  }

  if (!game) {
    try {
      const url = `${BGM_BASE_URL}/api/games/search?q=${encodeURIComponent(title)}`;
      debug('[BGM overlay] fetching', url);
      const res = await fetch(url, { credentials: 'include' });
      debug('[BGM overlay] search status', res.status);
      if (!res.ok) return { error: `search_${res.status}` };
      const data = await res.json();
      const games = data.games || [];
      debug('[BGM overlay] search returned', games.length, 'games');
      if (games.length === 0) return { error: 'not_found' };

      // Prefer exact normalized match; otherwise fall back to first result
      const wanted = normalizeForMatch(title);
      game = games.find((g) => normalizeForMatch(g.name) === wanted) || games[0];

      try {
        await chrome.storage.session.set({
          [cacheKey]: { game, timestamp: Date.now() },
        });
      } catch (_) {
        // ignore
      }
    } catch (e) {
      console.warn('[BGM overlay] search failed:', e.message);
      return { error: 'network: ' + e.message };
    }
  }

  // Fetch the user's collection types for this game (requires login)
  let collectionTypes = [];
  try {
    const res = await fetch(`${BGM_BASE_URL}/api/collections/${game.id}`, {
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      collectionTypes = data.collection_types || [];
    }
  } catch (_) {
    // ignore
  }

  return { game, collectionTypes };
}

// Add or remove a collection type for a game.
async function setCollectionType(gameId, collectionType, add) {
  const url = `${BGM_BASE_URL}/api/collections/${gameId}/${collectionType}`;
  const res = await fetch(url, {
    method: add ? 'POST' : 'DELETE',
    credentials: 'include',
    headers: { 'X-BGM-Source': 'toolbox' },
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
}
