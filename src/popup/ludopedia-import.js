/**
 * Ludopedia Import UI Logic
 */

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || '';
  if (url.includes('ludopedia.com.br')) {
    const panel = document.getElementById('ludopediaPanel');
    if (panel) panel.style.display = 'block';
  }
});

const ludopediaImportBtn = document.getElementById('ludopediaImportBtn');
const ludopediaStatus = document.getElementById('ludopediaStatus');

function setStatus(text, variant) {
  if (!ludopediaStatus) return;
  ludopediaStatus.textContent = text;
  ludopediaStatus.classList.remove('is-error', 'is-success');
  if (variant) ludopediaStatus.classList.add(variant);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'playsImportProgress' && ludopediaStatus) {
    setStatus(
      chrome.i18n.getMessage('importSendingProgress', [
        String(message.current),
        String(message.total),
      ])
    );
  }
});

if (ludopediaImportBtn) {
  ludopediaImportBtn.addEventListener('click', () => {
    ludopediaImportBtn.disabled = true;
    setStatus(chrome.i18n.getMessage('importLudopediaFetching'));

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'import_ludopedia_plays' }, (response) => {
        ludopediaImportBtn.disabled = false;

        if (chrome.runtime.lastError || !response) {
          const msg =
            chrome.runtime.lastError?.message || chrome.i18n.getMessage('importNoResponse');
          setStatus(chrome.i18n.getMessage('importErrorPrefix', [msg]), 'is-error');
          return;
        }

        if (response.success) {
          const { posted, skipped } = response.data;
          const parts = [chrome.i18n.getMessage('importSuccess', [String(posted)])];
          if (skipped > 0)
            parts.push(chrome.i18n.getMessage('importNotFoundOnBgm', [String(skipped)]));
          setStatus(parts.join(' · '), 'is-success');
        } else {
          setStatus(chrome.i18n.getMessage('importErrorPrefix', [response.error]), 'is-error');
        }
      });
    });
  });
}
