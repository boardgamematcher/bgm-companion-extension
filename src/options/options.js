// Options page controller
let customPatterns = [];
let editingIndex = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadDevMode();
  await loadPatterns();
  await loadNotifSettings();
  setupTabs();
  setupEventListeners();
  renderCustomPatterns();
  await handleScrollTo();
});

async function handleScrollTo() {
  const { optionsScrollTo } = await chrome.storage.session.get('optionsScrollTo');
  if (!optionsScrollTo) return;
  await chrome.storage.session.remove('optionsScrollTo');

  const target = document.getElementById(optionsScrollTo);
  if (!target) return;

  const tabName = target.closest('.tab-content')?.id?.replace('-tab', '');
  if (tabName) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (btn) btn.click();
  }
  setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

async function loadDevMode() {
  const { bgmDevMode = false } = await chrome.storage.local.get('bgmDevMode');
  document.body.classList.toggle('dev-mode', bgmDevMode);
  const toggle = document.getElementById('dev-mode-toggle');
  if (toggle) toggle.checked = bgmDevMode;

  // The Custom Patterns tab is the default active tab in markup but is gated
  // behind dev mode. If the user opens options without dev mode on, switch
  // the active tab to Notifications so they don't land on a hidden surface.
  if (!bgmDevMode) {
    const customBtn = document.querySelector('.tab-btn[data-tab="custom"]');
    const customPanel = document.getElementById('custom-tab');
    if (customBtn && customBtn.classList.contains('active')) {
      customBtn.classList.remove('active');
      customPanel.classList.remove('active');
      const notifBtn = document.querySelector('.tab-btn[data-tab="notifications"]');
      const notifPanel = document.getElementById('notifications-tab');
      if (notifBtn && notifPanel) {
        notifBtn.classList.add('active');
        notifPanel.classList.add('active');
      }
    }
  }
}

// Setup tab switching
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;

      // Update active states
      tabButtons.forEach((btn) => btn.classList.remove('active'));
      tabContents.forEach((content) => content.classList.remove('active'));

      button.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
}

// ── Notifications settings ──

async function loadNotifSettings() {
  const { newsNotifEnabled = true } = await chrome.storage.local.get('newsNotifEnabled');
  document.getElementById('notif-news').checked = newsNotifEnabled;

  const { msgBadgeEnabled = true } = await chrome.storage.local.get('msgBadgeEnabled');
  document.getElementById('notif-messages').checked = msgBadgeEnabled;

  const { friendReqNotifEnabled = true } = await chrome.storage.local.get('friendReqNotifEnabled');
  document.getElementById('notif-friend-req').checked = friendReqNotifEnabled;

  const { matchNotifEnabled = true } = await chrome.storage.local.get('matchNotifEnabled');
  document.getElementById('notif-match').checked = matchNotifEnabled;

  const { sessionInviteNotifEnabled = true } = await chrome.storage.local.get(
    'sessionInviteNotifEnabled'
  );
  document.getElementById('notif-session-invite').checked = sessionInviteNotifEnabled;
}

// Setup event listeners
function setupEventListeners() {
  // Notifications toggles
  document.getElementById('notif-news').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ newsNotifEnabled: e.target.checked });
    if (e.target.checked) {
      chrome.runtime.sendMessage({ action: 'pollNews' }).catch(() => {});
    }
  });

  document.getElementById('notif-messages').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ msgBadgeEnabled: e.target.checked });
    chrome.runtime.sendMessage({ action: 'pollMessages' }).catch(() => {});
  });

  document.getElementById('notif-friend-req').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ friendReqNotifEnabled: e.target.checked });
    if (e.target.checked) {
      chrome.runtime.sendMessage({ action: 'pollFriendRequests' }).catch(() => {});
    }
  });

  document.getElementById('notif-match').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ matchNotifEnabled: e.target.checked });
    if (e.target.checked) {
      chrome.runtime.sendMessage({ action: 'pollMatches' }).catch(() => {});
    }
  });

  document.getElementById('notif-session-invite').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ sessionInviteNotifEnabled: e.target.checked });
    if (e.target.checked) {
      chrome.runtime.sendMessage({ action: 'pollSessionInvites' }).catch(() => {});
    }
  });

  // Custom pattern actions
  document.getElementById('add-pattern-btn').addEventListener('click', () => openModal());
  document.getElementById('import-btn').addEventListener('click', handleImport);
  document.getElementById('export-btn').addEventListener('click', handleExport);

  // Modal actions
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  document.getElementById('pattern-form').addEventListener('submit', handleFormSubmit);

  // Developer mode toggle
  document.getElementById('dev-mode-toggle').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await chrome.storage.local.set({ bgmDevMode: enabled });
    document.body.classList.toggle('dev-mode', enabled);
    if (!enabled) {
      const customTab = document.getElementById('custom-tab');
      if (customTab.classList.contains('active')) {
        document.querySelector('.tab-btn[data-tab="notifications"]').click();
      }
    }
  });
}

// Load patterns from storage
async function loadPatterns() {
  try {
    const result = await chrome.storage.local.get('customPatterns');
    customPatterns = result.customPatterns || [];
  } catch (error) {
    console.error('Error loading patterns:', error);
  }
}

// Render custom patterns
function renderCustomPatterns() {
  const list = document.getElementById('custom-list');
  const empty = document.getElementById('custom-empty');

  if (customPatterns.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = '';

  customPatterns.forEach((pattern, index) => {
    const card = createPatternCard(pattern, index);
    list.appendChild(card);
  });
}

// Create pattern card element
function createPatternCard(pattern, index) {
  const card = document.createElement('div');
  card.className = 'pattern-card';

  const header = document.createElement('div');
  header.className = 'pattern-header';

  const info = document.createElement('div');
  info.className = 'pattern-info';
  info.innerHTML = `
    <h3>${escapeHtml(pattern.name)}</h3>
    <div class="pattern-domain">${escapeHtml(pattern.domain)}</div>
  `;

  header.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'pattern-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.textContent = chrome.i18n.getMessage('optionsCardEdit');
  editBtn.addEventListener('click', () => editPattern(index));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn delete';
  deleteBtn.textContent = chrome.i18n.getMessage('optionsCardDelete');
  deleteBtn.addEventListener('click', () => deletePattern(index));

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  header.appendChild(actions);

  card.appendChild(header);

  const details = document.createElement('div');
  details.className = 'pattern-details';
  // data_source profiles (e.g. next_data) have no CSS selector — show the
  // strategy + items_path instead so the card stays informative.
  if (pattern.data_source === 'next_data') {
    const itemsPath = pattern.next_data?.items_path;
    const itemsPathStr = Array.isArray(itemsPath) ? itemsPath.join(' | ') : itemsPath || '';
    details.innerHTML = `
      <div class="pattern-row">
        <span class="pattern-label">${chrome.i18n.getMessage('optionsCardStrategy')}</span>
        <span class="pattern-value">${chrome.i18n.getMessage('optionsCardStrategyNextData')}</span>
      </div>
      <div class="pattern-row">
        <span class="pattern-label">${chrome.i18n.getMessage('optionsCardItemsPath')}</span>
        <span class="pattern-value">${escapeHtml(itemsPathStr)}</span>
      </div>
    `;
  } else {
    details.innerHTML = `
      <div class="pattern-row">
        <span class="pattern-label">${chrome.i18n.getMessage('optionsCardSelector')}</span>
        <span class="pattern-value">${escapeHtml(pattern.selector || '')}</span>
      </div>
    `;
  }

  if (pattern.filters) {
    if (pattern.filters.exclude && pattern.filters.exclude.length > 0) {
      details.innerHTML += `
        <div class="pattern-row">
          <span class="pattern-label">${chrome.i18n.getMessage('optionsCardExclude')}</span>
          <span class="pattern-value">${escapeHtml(pattern.filters.exclude.join(', '))}</span>
        </div>
      `;
    }
    if (pattern.filters.include && pattern.filters.include.length > 0) {
      details.innerHTML += `
        <div class="pattern-row">
          <span class="pattern-label">${chrome.i18n.getMessage('optionsCardInclude')}</span>
          <span class="pattern-value">${escapeHtml(pattern.filters.include.join(', '))}</span>
        </div>
      `;
    }
  }

  card.appendChild(details);
  return card;
}

// Modal management
function openModal(index = null) {
  const modal = document.getElementById('pattern-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('pattern-form');

  editingIndex = index;

  if (index !== null) {
    // Edit mode
    title.textContent = chrome.i18n.getMessage('optionsModalEditTitle');
    const pattern = customPatterns[index];
    populateForm(pattern);
  } else {
    // Add mode
    title.textContent = chrome.i18n.getMessage('optionsModalAddTitle');
    form.reset();
    document.getElementById('trim-input').checked = true;
    document.getElementById('dedupe-input').checked = true;
  }

  modal.classList.remove('hidden');
}

function closeModal() {
  const modal = document.getElementById('pattern-modal');
  modal.classList.add('hidden');
  editingIndex = null;
}

// Populate form with pattern data
function populateForm(pattern) {
  document.getElementById('domain-input').value = pattern.domain;
  document.getElementById('name-input').value = pattern.name;
  document.getElementById('selector-input').value = pattern.selector;

  if (pattern.filters) {
    if (pattern.filters.exclude) {
      document.getElementById('exclude-input').value = pattern.filters.exclude.join(', ');
    }
    if (pattern.filters.include) {
      document.getElementById('include-input').value = pattern.filters.include.join(', ');
    }
    document.getElementById('trim-input').checked = pattern.filters.trim !== false;
    document.getElementById('dedupe-input').checked = pattern.filters.deduplicate !== false;
  }
}

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();

  const pattern = {
    domain: document.getElementById('domain-input').value.trim(),
    name: document.getElementById('name-input').value.trim(),
    selector: document.getElementById('selector-input').value.trim(),
    filters: {
      exclude: parseCommaSeparated(document.getElementById('exclude-input').value),
      include: parseCommaSeparated(document.getElementById('include-input').value),
      trim: document.getElementById('trim-input').checked,
      deduplicate: document.getElementById('dedupe-input').checked,
    },
  };

  // Set include to null if empty
  if (pattern.filters.include.length === 0) {
    pattern.filters.include = null;
  }

  if (editingIndex !== null) {
    // Update existing
    customPatterns[editingIndex] = pattern;
  } else {
    // Add new
    customPatterns.push(pattern);
  }

  // Save to storage
  await saveCustomPatterns();

  // Update UI
  renderCustomPatterns();
  closeModal();

  // Notify background to reload
  chrome.runtime.sendMessage({ action: 'reloadPatterns' });
}

// Edit pattern
function editPattern(index) {
  openModal(index);
}

// Delete pattern
async function deletePattern(index) {
  if (!confirm(chrome.i18n.getMessage('optionsConfirmDelete'))) {
    return;
  }

  customPatterns.splice(index, 1);
  await saveCustomPatterns();
  renderCustomPatterns();

  // Notify background to reload
  chrome.runtime.sendMessage({ action: 'reloadPatterns' });
}

// Save custom patterns to storage
async function saveCustomPatterns() {
  try {
    await chrome.storage.local.set({ customPatterns });
  } catch (error) {
    console.error('Error saving patterns:', error);
    alert(chrome.i18n.getMessage('optionsSavePatternsFailed'));
  }
}

// Handle import
async function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);

      if (!Array.isArray(imported)) {
        alert(chrome.i18n.getMessage('optionsImportInvalidArray'));
        return;
      }

      // Validate patterns: every pattern needs domain + name + either a CSS
      // selector (DOM scrape) or a data_source descriptor (e.g. next_data).
      for (const pattern of imported) {
        const hasSelector = typeof pattern.selector === 'string';
        const hasDataSource =
          pattern.data_source === 'next_data' && pattern.next_data && pattern.next_data.items_path;
        if (!pattern.domain || !pattern.name || (!hasSelector && !hasDataSource)) {
          alert(chrome.i18n.getMessage('optionsImportInvalidPattern'));
          return;
        }
      }

      // Merge with existing (don't overwrite)
      customPatterns = [...customPatterns, ...imported];
      await saveCustomPatterns();
      renderCustomPatterns();

      chrome.runtime.sendMessage({ action: 'reloadPatterns' });
      alert(chrome.i18n.getMessage('optionsImportSuccess', [String(imported.length)]));
    } catch (error) {
      console.error('Import error:', error);
      alert(chrome.i18n.getMessage('optionsImportFailed', [error.message]));
    }
  });

  input.click();
}

// Handle export
function handleExport() {
  if (customPatterns.length === 0) {
    alert(chrome.i18n.getMessage('optionsExportEmpty'));
    return;
  }

  const json = JSON.stringify(customPatterns, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'bgm-extractor-patterns.json';
  a.click();

  URL.revokeObjectURL(url);
}

// Parse comma-separated string to array
function parseCommaSeparated(str) {
  if (!str || !str.trim()) return [];
  return str
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
