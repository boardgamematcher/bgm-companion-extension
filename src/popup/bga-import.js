/* global currentUser */
/**
 * BGA Import UI Logic
 * Handles the import button click and status display for Board Game Arena.
 *
 * Preflight on click:
 *   1. If the user isn't signed in to BGM (no `currentUser`), surface a
 *      "Sign in to BoardGameMatcher" CTA — they need a BGM session for the
 *      service worker's postPlays step to succeed. Don't message the
 *      content script.
 *   2. Otherwise call into the content script. If it returns
 *      code=NOT_LOGGED_IN_BGA (BGM-1007's "no player ID resolvable" path),
 *      surface a "Sign in to BoardGameArena" CTA instead of the small
 *      red one-liner the user can't act on.
 */

const BGM_LOGIN_URL = 'https://boardgamematcher.com/auth/login';
const BGA_LOGIN_URL = 'https://en.boardgamearena.com/account';

// Show BGA panel only on boardgamearena.com
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0].url;
  if (url && url.includes('boardgamearena.com')) {
    const bgaPanel = document.getElementById('bgaPanel');
    if (bgaPanel) {
      bgaPanel.style.display = 'block';
    }
  }
});

const bgaImportBtn = document.getElementById('bgaImportBtn');
const bgaStatus = document.getElementById('bgaStatus');
const bgaSigninCta = document.getElementById('bgaSigninCta');

function setBgaStatus(text, variant) {
  if (!bgaStatus) return;
  bgaStatus.textContent = text;
  bgaStatus.classList.remove('is-error', 'is-success');
  if (variant) bgaStatus.classList.add(variant);
}

function hideSigninCta() {
  if (bgaSigninCta) bgaSigninCta.style.display = 'none';
}

function showSigninCta(label, url) {
  if (!bgaSigninCta) return;
  bgaSigninCta.textContent = label;
  bgaSigninCta.href = url;
  bgaSigninCta.style.display = '';
}

// Listen for progress updates from the service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'playsImportProgress' && bgaStatus && bgaImportBtn?.disabled) {
    setBgaStatus(
      chrome.i18n.getMessage('importSendingProgress', [
        String(message.current),
        String(message.total),
      ])
    );
  }
});

if (bgaImportBtn) {
  bgaImportBtn.addEventListener('click', () => {
    hideSigninCta();
    setBgaStatus('');

    // Preflight: BGM must be signed in for the service-worker postPlays step
    // to succeed. Catching it here gives a clearer signal than letting the
    // round-trip blow up downstream.
    if (typeof currentUser === 'undefined' || !currentUser) {
      setBgaStatus(chrome.i18n.getMessage('importBgaNeedsBgm'), 'is-error');
      showSigninCta(chrome.i18n.getMessage('importBgaSigninBgm'), BGM_LOGIN_URL);
      return;
    }

    bgaImportBtn.disabled = true;
    setBgaStatus(chrome.i18n.getMessage('importBgaFetching'));

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'import_bga_plays' }, (response) => {
        bgaImportBtn.disabled = false;

        if (chrome.runtime.lastError || !response) {
          const msg =
            chrome.runtime.lastError?.message || chrome.i18n.getMessage('importNoResponse');
          setBgaStatus(chrome.i18n.getMessage('importErrorPrefix', [msg]), 'is-error');
        } else if (response.success) {
          const { posted, skipped, errors } = response.data;
          const parts = [chrome.i18n.getMessage('importSuccess', [String(posted)])];
          if (skipped > 0)
            parts.push(chrome.i18n.getMessage('importNotFoundOnBgm', [String(skipped)]));
          if (errors > 0) parts.push(chrome.i18n.getMessage('importErrors', [String(errors)]));
          setBgaStatus(parts.join(' · '), 'is-success');
        } else if (response.code === 'NOT_LOGGED_IN_BGA') {
          setBgaStatus(chrome.i18n.getMessage('importBgaNeedsBga'), 'is-error');
          showSigninCta(chrome.i18n.getMessage('importBgaSigninBga'), BGA_LOGIN_URL);
        } else {
          setBgaStatus(chrome.i18n.getMessage('importErrorPrefix', [response.error]), 'is-error');
        }
      });
    });
  });
}
