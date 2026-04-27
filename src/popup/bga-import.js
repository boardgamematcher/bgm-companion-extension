/**
 * BGA Import UI Logic
 * Handles the import button click and status display for Board Game Arena
 */

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

// Get the import button and status element
const bgaImportBtn = document.getElementById('bgaImportBtn');
const bgaStatus = document.getElementById('bgaStatus');

function setStatus(text, variant) {
  if (!bgaStatus) return;
  bgaStatus.textContent = text;
  bgaStatus.classList.remove('is-error', 'is-success');
  if (variant) bgaStatus.classList.add(variant);
}

// Listen for progress updates from the service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'playsImportProgress' && bgaStatus && bgaImportBtn?.disabled) {
    setStatus(
      chrome.i18n.getMessage('importSendingProgress', [
        String(message.current),
        String(message.total),
      ])
    );
  }
});

if (bgaImportBtn) {
  bgaImportBtn.addEventListener('click', () => {
    bgaImportBtn.disabled = true;
    setStatus(chrome.i18n.getMessage('importBgaFetching'));

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'import_bga_plays' }, (response) => {
        bgaImportBtn.disabled = false;

        if (chrome.runtime.lastError || !response) {
          const msg =
            chrome.runtime.lastError?.message || chrome.i18n.getMessage('importNoResponse');
          setStatus(chrome.i18n.getMessage('importErrorPrefix', [msg]), 'is-error');
        } else if (response.success) {
          const { posted, skipped, errors } = response.data;
          const parts = [chrome.i18n.getMessage('importSuccess', [String(posted)])];
          if (skipped > 0)
            parts.push(chrome.i18n.getMessage('importNotFoundOnBgm', [String(skipped)]));
          if (errors > 0) parts.push(chrome.i18n.getMessage('importErrors', [String(errors)]));
          setStatus(parts.join(' · '), 'is-success');
        } else {
          setStatus(chrome.i18n.getMessage('importErrorPrefix', [response.error]), 'is-error');
        }
      });
    });
  });
}
