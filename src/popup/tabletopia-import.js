/**
 * Tabletopia Import UI Logic
 */

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || '';
  if (url.includes('tabletopia.com')) {
    const panel = document.getElementById('tabletopiaPanel');
    if (panel) panel.style.display = 'block';
  }
});

const tabletopiaImportBtn = document.getElementById('tabletopiaImportBtn');
const tabletopiaStatus = document.getElementById('tabletopiaStatus');

function setTabletopiaStatus(text, variant) {
  if (!tabletopiaStatus) return;
  tabletopiaStatus.textContent = text;
  tabletopiaStatus.classList.remove('is-error', 'is-success');
  if (variant) tabletopiaStatus.classList.add(variant);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'playsImportProgress' && tabletopiaStatus) {
    setTabletopiaStatus(
      chrome.i18n.getMessage('importSendingProgress', [
        String(message.current),
        String(message.total),
      ])
    );
  }
});

if (tabletopiaImportBtn) {
  tabletopiaImportBtn.addEventListener('click', () => {
    tabletopiaImportBtn.disabled = true;
    setTabletopiaStatus(chrome.i18n.getMessage('importTabletopiaFetching'));

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'import_tabletopia_plays' }, (response) => {
        tabletopiaImportBtn.disabled = false;

        if (chrome.runtime.lastError || !response) {
          const msg =
            chrome.runtime.lastError?.message || chrome.i18n.getMessage('importNoResponse');
          setTabletopiaStatus(chrome.i18n.getMessage('importErrorPrefix', [msg]), 'is-error');
          return;
        }

        if (response.success) {
          const { posted, skipped } = response.data;
          const parts = [chrome.i18n.getMessage('importSuccess', [String(posted)])];
          if (skipped > 0)
            parts.push(chrome.i18n.getMessage('importNotFoundOnBgm', [String(skipped)]));
          setTabletopiaStatus(parts.join(' · '), 'is-success');
        } else {
          setTabletopiaStatus(
            chrome.i18n.getMessage('importErrorPrefix', [response.error]),
            'is-error'
          );
        }
      });
    });
  });
}
