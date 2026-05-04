// Tiny i18n helper for the popup and options pages.
//
// Usage in HTML:
//   <span data-i18n="popupExtractTitle">fallback text</span>
//   <input data-i18n-placeholder="popupWishlistPlaceholder" placeholder="...">
//   <button data-i18n-title="popupSettingsTooltip" title="...">⚙</button>
//
// Usage in JS:
//   element.textContent = chrome.i18n.getMessage('someKey');
//   element.textContent = chrome.i18n.getMessage('keyWithSubst', [count]);
//
// Locale resolution order:
//   1. `chrome.storage.local.uiLocale` override (synced from BGM web profile via
//      `bgmI18n.setLocale(...)` after /api/me succeeds — BGM-1016).
//   2. `chrome.i18n.getMessage` native (browser UI language → manifest default).
//
// The override is async: on cold start the popup briefly renders in the native
// locale, then re-applies translations once the override messages.json is
// fetched. Logged-out users keep the native locale.

(function () {
  const SUPPORTED_LOCALES = ['en', 'fr', 'de', 'es', 'it'];
  const STORAGE_KEY = 'bgmUiLocale';

  // Loaded override messages: { [key]: { message, placeholders } } — null when
  // no override is active (use native chrome.i18n.getMessage).
  let overrides = null;

  // Monotonic token for in-flight loadOverride calls. init() and setLocale()
  // can race (init reads storage, setLocale fires from checkAuth right after).
  // Without a token, a slower stale fetch could clobber a faster fresh one.
  // Each load bumps the token; only the latest token's result is committed.
  let loadToken = 0;

  function nativeUiLanguage() {
    if (typeof chrome === 'undefined' || !chrome.i18n) return 'en';
    // chrome.i18n.getUILanguage() returns e.g. "fr", "fr-FR", "en-US".
    return (chrome.i18n.getUILanguage() || 'en').toLowerCase().split('-')[0];
  }

  // Apply chrome.i18n-compatible substitution to a raw message.
  //
  //   "$count$ games" + { count: { content: "$1" } } + ["12"]  →  "12 games"
  //   "$1 of $2"      + (no placeholders)              + ["a","b"] → "a of b"
  function substitute(message, placeholders, substitutions) {
    if (!message) return '';
    const args = Array.isArray(substitutions)
      ? substitutions
      : substitutions != null
        ? [substitutions]
        : [];

    let out = message;

    if (placeholders && typeof placeholders === 'object') {
      for (const [name, def] of Object.entries(placeholders)) {
        const content = def && typeof def.content === 'string' ? def.content : '';
        const resolved = content.replace(/\$(\d+)/g, (_, n) => {
          const idx = parseInt(n, 10) - 1;
          return idx >= 0 && idx < args.length ? args[idx] : '';
        });
        out = out.split('$' + name + '$').join(resolved);
      }
    }

    out = out.replace(/\$(\d+)/g, (_, n) => {
      const idx = parseInt(n, 10) - 1;
      return idx >= 0 && idx < args.length ? args[idx] : '';
    });

    return out;
  }

  // Capture the native chrome.i18n.getMessage before we patch it below, so
  // override-miss fall-through still hits the real implementation instead of
  // recursing into our shim.
  const nativeGetMessage =
    typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage
      ? chrome.i18n.getMessage.bind(chrome.i18n)
      : null;

  function t(key, substitutions) {
    if (!key) return '';
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
      const entry = overrides[key];
      if (entry && typeof entry.message === 'string') {
        return substitute(entry.message, entry.placeholders, substitutions);
      }
    }
    if (!nativeGetMessage) return '';
    return nativeGetMessage(key, substitutions) || '';
  }

  // Patch chrome.i18n.getMessage so existing callsites pick up the override
  // without per-callsite changes. Native behavior is preserved when no
  // override is active or the key is missing from the override messages.json.
  //
  // Side-effect contract: this monkey-patch is global within the page that
  // loads i18n.js (popup, options, any HTML page that includes the script).
  // Any other script in the same page that calls chrome.i18n.getMessage —
  // including third-party libraries we might add later — will go through this
  // shim. The shim falls through to the captured native impl on a miss, so
  // the only observable difference is that override-resolved keys win.
  // Service worker / content scripts are unaffected (they don't load this
  // file). If a callsite must always read the native bundle regardless of
  // override, capture chrome.i18n.getMessage before i18n.js runs and call
  // through that saved reference.
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    chrome.i18n.getMessage = (key, substitutions) => t(key, substitutions);
  }

  function applyI18n(root) {
    root = root || document;
    for (const el of root.querySelectorAll('[data-i18n]')) {
      const msg = t(el.getAttribute('data-i18n'));
      if (msg) el.textContent = msg;
    }
    for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
      const msg = t(el.getAttribute('data-i18n-placeholder'));
      if (msg) el.placeholder = msg;
    }
    for (const el of root.querySelectorAll('[data-i18n-title]')) {
      const msg = t(el.getAttribute('data-i18n-title'));
      if (msg) el.title = msg;
    }
    for (const el of root.querySelectorAll('[data-i18n-html]')) {
      // Allow markup-bearing strings (use sparingly, only with strings the
      // extension itself authors — never user input).
      const msg = t(el.getAttribute('data-i18n-html'));
      if (msg) el.innerHTML = msg;
    }
  }

  async function loadOverride(locale) {
    const token = ++loadToken;

    if (!locale || !SUPPORTED_LOCALES.includes(locale)) {
      if (token === loadToken) overrides = null;
      return;
    }
    if (locale === nativeUiLanguage()) {
      // Native already serves this locale — no override needed.
      // NOTE: this short-circuit assumes the override source is the bundled
      // _locales/<lang>/messages.json (same file the browser would serve
      // natively). If we ever fetch overrides from a remote source whose
      // translations could differ from the bundle for the same locale, drop
      // this branch — otherwise users on a matching browser locale would
      // silently miss the remote translations.
      if (token === loadToken) overrides = null;
      return;
    }
    try {
      const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      // A newer load won the race — drop this stale result.
      if (token !== loadToken) return;
      overrides = data;
    } catch (err) {
      console.warn('bgmI18n: failed to load override locale', locale, err);
      if (token === loadToken) overrides = null;
    }
  }

  // Update the persisted locale + re-apply translations. Called by the popup
  // after /api/me returns a `preferred_language` that differs from storage.
  async function setLocale(locale) {
    if (!locale) {
      // Bump the token first so any in-flight loadOverride from a prior login
      // can't commit a stale `overrides` after we clear it here.
      ++loadToken;
      await chrome.storage.local.remove(STORAGE_KEY);
      overrides = null;
    } else {
      await chrome.storage.local.set({ [STORAGE_KEY]: locale });
      await loadOverride(locale);
    }
    applyI18n();
  }

  async function init() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const locale = stored && stored[STORAGE_KEY];
      if (locale) await loadOverride(locale);
    } catch (err) {
      console.warn('bgmI18n: init failed', err);
    }
    applyI18n();
  }

  if (typeof document !== 'undefined') {
    // init() calls applyI18n() once it has resolved any stored override, so we
    // don't need a separate pre-init paint. Cold-start flicker is bounded by
    // the storage.get round-trip (sub-millisecond in practice).
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => init());
    } else {
      init();
    }
  }
  if (typeof window !== 'undefined') {
    window.bgmI18n = { t, applyI18n, setLocale };
  }
})();
