/**
 * BGG Import UI Logic
 * Handles the import button click and status display for BoardGameGeek
 */

// Show BGG panel only on boardgamegeek.com
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0].url;
  if (url && url.includes('boardgamegeek.com')) {
    const bggPanel = document.getElementById('bggPanel');
    if (bggPanel) {
      bggPanel.style.display = 'block';
    }
  }
});

const bggImportBtn = document.getElementById('bggImportBtn');
const bggStatus = document.getElementById('bggStatus');

function setBggStatus(text, variant) {
  if (!bggStatus) return;
  bggStatus.textContent = text;
  bggStatus.classList.remove('is-error', 'is-success');
  if (variant) bggStatus.classList.add(variant);
}

// Listen for progress updates from the service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'playsImportProgress' && bggStatus && bggImportBtn?.disabled) {
    setBggStatus(
      chrome.i18n.getMessage('importSendingProgress', [
        String(message.current),
        String(message.total),
      ])
    );
  }
});

if (bggImportBtn) {
  bggImportBtn.addEventListener('click', () => {
    bggImportBtn.disabled = true;
    setBggStatus(chrome.i18n.getMessage('importBggFetching'));

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'import_bgg_plays' }, (response) => {
        bggImportBtn.disabled = false;

        if (chrome.runtime.lastError || !response) {
          const msg =
            chrome.runtime.lastError?.message || chrome.i18n.getMessage('importNoResponse');
          setBggStatus(chrome.i18n.getMessage('importErrorPrefix', [msg]), 'is-error');
        } else if (response.success) {
          const { posted, skipped, duplicates } = response.data;
          const parts = [chrome.i18n.getMessage('importSuccess', [String(posted)])];
          if (duplicates > 0)
            parts.push(chrome.i18n.getMessage('importDuplicatesSkipped', [String(duplicates)]));
          if (skipped > 0)
            parts.push(chrome.i18n.getMessage('importNotFoundOnBgm', [String(skipped)]));
          setBggStatus(parts.join(' · '), 'is-success');
        } else {
          setBggStatus(chrome.i18n.getMessage('importErrorPrefix', [response.error]), 'is-error');
        }
      });
    });
  });
}
