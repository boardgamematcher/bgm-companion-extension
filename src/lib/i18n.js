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
// Locales bundled under _locales/<lang>/messages.json. The browser auto-
// picks based on UI language, falling back to the manifest's default_locale.
// Missing translations fall through to the default_locale value, so partial
// translations are safe.

(function () {
  function t(key) {
    if (!key || typeof chrome === 'undefined' || !chrome.i18n) return '';
    return chrome.i18n.getMessage(key) || '';
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

  // Apply on DOM ready and expose to other scripts that need ad-hoc lookups.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => applyI18n());
    } else {
      applyI18n();
    }
  }
  if (typeof window !== 'undefined') {
    window.bgmI18n = { t, applyI18n };
  }
})();
