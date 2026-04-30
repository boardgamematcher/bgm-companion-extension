/**
 * SpielByWeb Import UI Logic
 */

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || '';
  if (url.includes('spielbyweb.de')) {
    const panel = document.getElementById('spielbywebPanel');
    if (panel) panel.style.display = 'block';
  }
});

const spielbywebImportBtn = document.getElementById('spielbywebImportBtn');
const spielbywebStatus = document.getElementById('spielbywebStatus');

function setStatus(text, variant) {
  if (!spielbywebStatus) return;
  spielbywebStatus.textContent = text;
  spielbywebStatus.classList.remove('is-error', 'is-success');
  if (variant) spielbywebStatus.classList.add(variant);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'playsImportProgress' && spielbywebStatus) {
    setStatus(
      chrome.i18n.getMessage('importSendingProgress', [
        String(message.current),
        String(message.total),
      ])
    );
  }
});

if (spielbywebImportBtn) {
  spielbywebImportBtn.addEventListener('click', () => {
    spielbywebImportBtn.disabled = true;
    setStatus(chrome.i18n.getMessage('importSpielByWebFetching'));

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'import_spielbyweb_plays' }, (response) => {
        spielbywebImportBtn.disabled = false;

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
