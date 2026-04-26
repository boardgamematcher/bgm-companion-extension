/**
 * Yucata Import UI Logic
 * Handles the import button click and status display
 */

// Show Yucata panel only on yucata.de
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0].url;
  if (url && url.includes('yucata.de')) {
    const yucataPanel = document.getElementById('yucataPanel');
    if (yucataPanel) {
      yucataPanel.style.display = 'block';
    }
  }
});

// Get the import button
const yucataImportBtn = document.getElementById('yucataImportBtn');
const yucataStatus = document.getElementById('yucataStatus');

function setStatus(text, variant) {
  if (!yucataStatus) return;
  yucataStatus.textContent = text;
  yucataStatus.classList.remove('is-error', 'is-success');
  if (variant) yucataStatus.classList.add(variant);
}

// Listen for progress updates from the service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'playsImportProgress' && yucataStatus) {
    setStatus(
      chrome.i18n.getMessage('importSendingProgress', [
        String(message.current),
        String(message.total),
      ])
    );
  }
});

if (yucataImportBtn) {
  yucataImportBtn.addEventListener('click', () => {
    yucataImportBtn.disabled = true;
    setStatus(chrome.i18n.getMessage('importYucataFetching'));

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'import_yucata_plays' }, (response) => {
        yucataImportBtn.disabled = false;

        if (chrome.runtime.lastError || !response) {
          const msg =
            chrome.runtime.lastError?.message || chrome.i18n.getMessage('importNoResponse');
          setStatus(chrome.i18n.getMessage('importErrorPrefix', [msg]), 'is-error');
        } else if (response.success) {
          const { posted, skipped, duplicates } = response.data;
          const parts = [chrome.i18n.getMessage('importSuccess', [String(posted)])];
          if (duplicates > 0)
            parts.push(chrome.i18n.getMessage('importDuplicatesSkipped', [String(duplicates)]));
          if (skipped > 0)
            parts.push(chrome.i18n.getMessage('importNotFoundOnBgm', [String(skipped)]));
          setStatus(parts.join(' · '), 'is-success');
        } else {
          setStatus(chrome.i18n.getMessage('importErrorPrefix', [response.error]), 'is-error');
        }

        // Keep status visible (don't auto-clear)
      });
    });
  });
}
