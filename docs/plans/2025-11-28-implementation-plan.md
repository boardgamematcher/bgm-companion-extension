# Board Game Extractor Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cross-browser extension (Chrome/Firefox) that extracts board game names from websites using configurable CSS selector patterns.

**Architecture:** Manifest V3 extension with background service worker, content scripts, popup UI, and options page. Two-tier pattern system (built-in + user custom) with localStorage persistence. No build step required.

**Tech Stack:** Vanilla JavaScript, WebExtensions API (Manifest V3), Chrome Storage API

---

## Task 1: Project Foundation & Manifest

**Files:**

- Create: `manifest.json`
- Create: `.gitignore`
- Create: `README.md`

**Step 1: Create .gitignore**

Create `.gitignore`:

```
# Browser extension artifacts
*.crx
*.xpi
*.zip

# OS files
.DS_Store
Thumbs.db

# Editor files
.vscode/
.idea/
*.swp
*.swo

# Node modules (if we add build step later)
node_modules/
```

**Step 2: Create README**

Create `README.md`:

```markdown
# Board Game Extractor

A browser extension for extracting board game names from websites.

## Features

- Extract board game names from supported sites with one click
- Built-in patterns for popular board game sites
- Add custom extraction patterns
- Copy results to clipboard

## Installation

### Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension directory

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `manifest.json`

## Usage

1. Navigate to a supported site (knapix.com, amazon, philibert, etc.)
2. Click the extension icon
3. Click "Extract Board Games"
4. Game names are copied to clipboard

## Development

Built with vanilla JavaScript and WebExtensions API (Manifest V3).

No build step required - load directly in browser.
```

**Step 3: Create manifest.json**

Create `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Board Game Extractor",
  "version": "1.0.0",
  "description": "Extract board game names from websites with configurable patterns",
  "permissions": ["activeTab", "clipboardWrite", "storage"],
  "background": {
    "service_worker": "src/background/service-worker.js"
  },
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/lib/pattern-matcher.js", "src/content/content-script.js"]
    }
  ],
  "options_page": "src/options/options.html",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Step 4: Commit foundation**

```bash
git add .gitignore README.md manifest.json
git commit -m "feat: add project foundation and manifest"
```

---

## Task 2: Create Directory Structure & Placeholder Icons

**Files:**

- Create: `src/background/` (directory)
- Create: `src/content/` (directory)
- Create: `src/popup/` (directory)
- Create: `src/options/` (directory)
- Create: `src/lib/` (directory)
- Create: `patterns/` (directory)
- Create: `icons/` (directory)
- Create: `icons/icon16.png`
- Create: `icons/icon48.png`
- Create: `icons/icon128.png`

**Step 1: Create directory structure**

```bash
mkdir -p src/background src/content src/popup src/options src/lib patterns icons
```

**Step 2: Create placeholder icons**

For now, we'll create simple colored squares as placeholder icons. These can be replaced with proper icons later.

Create three identical placeholder files (we'll use a simple approach - you can generate proper icons later):

```bash
# Create simple SVG placeholders that browsers will accept
echo '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#4CAF50"/></svg>' > icons/icon16.svg
echo '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#4CAF50"/></svg>' > icons/icon48.svg
echo '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#4CAF50"/></svg>' > icons/icon128.svg
```

**Note:** For production, convert these SVGs to PNG or create proper board game-themed icons. For development, SVG works but PNG is preferred for better browser support.

**Step 3: Commit structure**

```bash
git add src/ patterns/ icons/
git commit -m "feat: create directory structure and placeholder icons"
```

---

## Task 3: Storage Helper Module

**Files:**

- Create: `src/lib/storage.js`

**Step 1: Create storage.js with pattern management**

Create `src/lib/storage.js`:

```javascript
// Storage helper for managing patterns and stats
const Storage = {
  // Load built-in patterns from JSON file
  async loadBuiltInPatterns() {
    try {
      const response = await fetch(chrome.runtime.getURL('patterns/built-in.json'));
      const data = await response.json();
      return data.patterns || [];
    } catch (error) {
      console.error('Error loading built-in patterns:', error);
      return [];
    }
  },

  // Load user custom patterns from storage
  async loadCustomPatterns() {
    try {
      const result = await chrome.storage.local.get('customPatterns');
      return result.customPatterns || [];
    } catch (error) {
      console.error('Error loading custom patterns:', error);
      return [];
    }
  },

  // Save custom patterns to storage
  async saveCustomPatterns(patterns) {
    try {
      await chrome.storage.local.set({ customPatterns: patterns });
      return true;
    } catch (error) {
      console.error('Error saving custom patterns:', error);
      return false;
    }
  },

  // Load and merge all patterns (custom overrides built-in by domain)
  async loadAllPatterns() {
    const builtIn = await this.loadBuiltInPatterns();
    const custom = await this.loadCustomPatterns();

    // Create map with built-in patterns
    const patternMap = new Map();
    builtIn.forEach((pattern) => {
      patternMap.set(pattern.domain, pattern);
    });

    // Override with custom patterns
    custom.forEach((pattern) => {
      patternMap.set(pattern.domain, pattern);
    });

    return Array.from(patternMap.values());
  },

  // Find pattern matching current domain
  findPatternForDomain(patterns, domain) {
    // Try exact match first
    let pattern = patterns.find((p) => domain === p.domain || domain.endsWith('.' + p.domain));
    return pattern || null;
  },

  // Load extraction stats
  async loadStats() {
    try {
      const result = await chrome.storage.local.get('stats');
      return result.stats || { lastExtraction: null };
    } catch (error) {
      console.error('Error loading stats:', error);
      return { lastExtraction: null };
    }
  },

  // Save extraction stats
  async saveStats(stats) {
    try {
      await chrome.storage.local.set({ stats });
      return true;
    } catch (error) {
      console.error('Error saving stats:', error);
      return false;
    }
  },
};

// Make available to other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
}
```

**Step 2: Commit storage helper**

```bash
git add src/lib/storage.js
git commit -m "feat: add storage helper module"
```

---

## Task 4: Pattern Matcher Module

**Files:**

- Create: `src/lib/pattern-matcher.js`

**Step 1: Create pattern-matcher.js with extraction logic**

Create `src/lib/pattern-matcher.js`:

```javascript
// Pattern matching and extraction logic
const PatternMatcher = {
  // Extract board game names using a pattern
  extract(pattern) {
    if (!pattern || !pattern.selector) {
      return [];
    }

    try {
      // Execute CSS selector
      const elements = document.querySelectorAll(pattern.selector);
      let games = Array.from(elements).map((el) => el.textContent);

      // Apply filters
      if (pattern.filters) {
        games = this.applyFilters(games, pattern.filters);
      }

      return games;
    } catch (error) {
      console.error('Error extracting games:', error);
      return [];
    }
  },

  // Apply filters to extracted text
  applyFilters(games, filters) {
    let filtered = games;

    // Trim whitespace if enabled
    if (filters.trim !== false) {
      filtered = filtered.map((game) => game.trim());
    }

    // Apply exclude patterns
    if (filters.exclude && Array.isArray(filters.exclude)) {
      filters.exclude.forEach((pattern) => {
        const regex = new RegExp(pattern);
        filtered = filtered.filter((game) => !regex.test(game));
      });
    }

    // Apply include patterns (only keep matches)
    if (filters.include && Array.isArray(filters.include)) {
      const includeRegexes = filters.include.map((pattern) => new RegExp(pattern));
      filtered = filtered.filter((game) => includeRegexes.some((regex) => regex.test(game)));
    }

    // Remove empty strings
    filtered = filtered.filter((game) => game.length > 0);

    // Deduplicate if enabled
    if (filters.deduplicate !== false) {
      filtered = [...new Set(filtered)];
    }

    return filtered;
  },

  // Validate a pattern structure
  validatePattern(pattern) {
    if (!pattern || typeof pattern !== 'object') {
      return { valid: false, error: 'Pattern must be an object' };
    }

    if (!pattern.domain || typeof pattern.domain !== 'string') {
      return { valid: false, error: 'Pattern must have a domain string' };
    }

    if (!pattern.name || typeof pattern.name !== 'string') {
      return { valid: false, error: 'Pattern must have a name string' };
    }

    if (!pattern.selector || typeof pattern.selector !== 'string') {
      return { valid: false, error: 'Pattern must have a selector string' };
    }

    // Validate selector syntax
    try {
      document.querySelector(pattern.selector);
    } catch (error) {
      return { valid: false, error: 'Invalid CSS selector: ' + error.message };
    }

    return { valid: true };
  },
};

// Make available to other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PatternMatcher;
}
```

**Step 2: Commit pattern matcher**

```bash
git add src/lib/pattern-matcher.js
git commit -m "feat: add pattern matcher module with extraction logic"
```

---

## Task 5: Built-in Patterns Configuration

**Files:**

- Create: `patterns/built-in.json`

**Step 1: Create built-in.json with initial patterns**

Create `patterns/built-in.json`:

```json
{
  "version": "1.0.0",
  "patterns": [
    {
      "domain": "knapix.com",
      "name": "Knapix",
      "selector": "article h3",
      "filters": {
        "exclude": [],
        "include": null,
        "trim": true,
        "deduplicate": true
      }
    },
    {
      "domain": "amazon.com",
      "name": "Amazon",
      "selector": "[data-component-type='s-search-result'] h2 a span",
      "filters": {
        "exclude": ["^Sponsored", "^Advertisement"],
        "include": null,
        "trim": true,
        "deduplicate": true
      }
    },
    {
      "domain": "amazon.fr",
      "name": "Amazon France",
      "selector": "[data-component-type='s-search-result'] h2 a span",
      "filters": {
        "exclude": ["^Sponsorisé", "^Publicité"],
        "include": null,
        "trim": true,
        "deduplicate": true
      }
    },
    {
      "domain": "philibert.com",
      "name": "Philibert",
      "selector": ".product-name",
      "filters": {
        "exclude": [],
        "include": null,
        "trim": true,
        "deduplicate": true
      }
    }
  ]
}
```

**Step 2: Commit built-in patterns**

```bash
git add patterns/built-in.json
git commit -m "feat: add built-in patterns for knapix, amazon, philibert"
```

---

## Task 6: Background Service Worker

**Files:**

- Create: `src/background/service-worker.js`

**Step 1: Create service-worker.js**

Create `src/background/service-worker.js`:

```javascript
// Background service worker for managing patterns and clipboard
let cachedPatterns = [];

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Board Game Extractor installed');
  await reloadPatterns();
});

// Reload patterns on startup
chrome.runtime.onStartup.addListener(async () => {
  await reloadPatterns();
});

// Load patterns from storage helper
async function reloadPatterns() {
  try {
    // Load built-in patterns
    const response = await fetch(chrome.runtime.getURL('patterns/built-in.json'));
    const data = await response.json();
    const builtIn = data.patterns || [];

    // Load custom patterns
    const result = await chrome.storage.local.get('customPatterns');
    const custom = result.customPatterns || [];

    // Merge patterns (custom overrides built-in by domain)
    const patternMap = new Map();
    builtIn.forEach((pattern) => {
      patternMap.set(pattern.domain, pattern);
    });
    custom.forEach((pattern) => {
      patternMap.set(pattern.domain, pattern);
    });

    cachedPatterns = Array.from(patternMap.values());
    console.log('Loaded patterns:', cachedPatterns.length);
  } catch (error) {
    console.error('Error loading patterns:', error);
    cachedPatterns = [];
  }
}

// Find pattern for domain
function findPatternForDomain(domain) {
  return cachedPatterns.find((p) => domain === p.domain || domain.endsWith('.' + p.domain)) || null;
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkSiteSupport') {
    const pattern = findPatternForDomain(message.domain);
    sendResponse({
      supported: pattern !== null,
      pattern: pattern,
    });
    return false;
  }

  if (message.action === 'copyToClipboard') {
    copyToClipboard(message.text);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'updateStats') {
    updateStats(message.stats);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'reloadPatterns') {
    reloadPatterns().then(() => {
      sendResponse({ success: true, count: cachedPatterns.length });
    });
    return true; // Async response
  }

  if (message.action === 'getStats') {
    getStats().then((stats) => {
      sendResponse({ success: true, stats });
    });
    return true; // Async response
  }
});

// Copy text to clipboard
async function copyToClipboard(text) {
  try {
    // Create offscreen document for clipboard access in Manifest V3
    await navigator.clipboard.writeText(text);
    console.log('Copied to clipboard:', text.substring(0, 100));
  } catch (error) {
    console.error('Error copying to clipboard:', error);
  }
}

// Update extraction stats
async function updateStats(stats) {
  try {
    await chrome.storage.local.set({ stats });
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

// Get extraction stats
async function getStats() {
  try {
    const result = await chrome.storage.local.get('stats');
    return result.stats || { lastExtraction: null };
  } catch (error) {
    console.error('Error getting stats:', error);
    return { lastExtraction: null };
  }
}
```

**Step 2: Commit background service worker**

```bash
git add src/background/service-worker.js
git commit -m "feat: add background service worker with pattern management"
```

---

## Task 7: Content Script

**Files:**

- Create: `src/content/content-script.js`

**Step 1: Create content-script.js**

Create `src/content/content-script.js`:

```javascript
// Content script for extracting games from webpages
console.log('Board Game Extractor content script loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractGames') {
    const games = extractGames(message.pattern);
    sendResponse({
      success: true,
      games: games,
      count: games.length,
    });
    return false;
  }

  if (message.action === 'getCurrentDomain') {
    sendResponse({ domain: window.location.hostname });
    return false;
  }
});

// Extract games using pattern
function extractGames(pattern) {
  if (!pattern || !pattern.selector) {
    console.error('Invalid pattern:', pattern);
    return [];
  }

  try {
    console.log('Extracting with selector:', pattern.selector);

    // Execute CSS selector
    const elements = document.querySelectorAll(pattern.selector);
    console.log('Found elements:', elements.length);

    let games = Array.from(elements).map((el) => el.textContent);
    console.log('Raw games:', games.length);

    // Apply filters using PatternMatcher
    if (pattern.filters && typeof PatternMatcher !== 'undefined') {
      games = PatternMatcher.applyFilters(games, pattern.filters);
      console.log('Filtered games:', games.length);
    }

    return games;
  } catch (error) {
    console.error('Error extracting games:', error);
    return [];
  }
}
```

**Step 2: Commit content script**

```bash
git add src/content/content-script.js
git commit -m "feat: add content script for DOM extraction"
```

---

## Task 8: Popup HTML Structure

**Files:**

- Create: `src/popup/popup.html`

**Step 1: Create popup.html**

Create `src/popup/popup.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Board Game Extractor</title>
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <div class="container">
      <header>
        <h1>Board Game Extractor</h1>
      </header>

      <main>
        <div id="status-section">
          <div id="site-status" class="status-badge">
            <span id="status-icon">⏳</span>
            <span id="status-text">Checking site...</span>
          </div>
        </div>

        <div id="action-section">
          <button id="extract-btn" class="primary-btn" disabled>Extract Board Games</button>
        </div>

        <div id="stats-section">
          <p id="stats-text" class="stats">No extractions yet</p>
        </div>

        <div id="message" class="message hidden"></div>
      </main>

      <footer>
        <div class="footer-links">
          <button id="suggest-btn" class="link-btn">Suggest a Site</button>
          <button id="settings-btn" class="link-btn">Settings</button>
        </div>
        <div class="version">v1.0.0</div>
      </footer>
    </div>

    <script src="popup.js"></script>
  </body>
</html>
```

**Step 2: Commit popup HTML**

```bash
git add src/popup/popup.html
git commit -m "feat: add popup HTML structure"
```

---

## Task 9: Popup Styles

**Files:**

- Create: `src/popup/popup.css`

**Step 1: Create popup.css**

Create `src/popup/popup.css`:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  color: #333;
  width: 320px;
  min-height: 200px;
}

.container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

header {
  background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
  color: white;
  padding: 16px;
  text-align: center;
}

header h1 {
  font-size: 16px;
  font-weight: 600;
}

main {
  padding: 16px;
  flex: 1;
}

#status-section {
  margin-bottom: 16px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 13px;
}

.status-badge.supported {
  background: #e8f5e9;
  color: #2e7d32;
}

.status-badge.unsupported {
  background: #f5f5f5;
  color: #757575;
}

#status-icon {
  font-size: 16px;
}

#action-section {
  margin-bottom: 16px;
}

.primary-btn {
  width: 100%;
  padding: 12px 24px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.primary-btn:hover:not(:disabled) {
  background: #45a049;
}

.primary-btn:active:not(:disabled) {
  background: #3d8b40;
}

.primary-btn:disabled {
  background: #cccccc;
  cursor: not-allowed;
}

#stats-section {
  margin-bottom: 16px;
}

.stats {
  text-align: center;
  color: #666;
  font-size: 12px;
}

.message {
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
  text-align: center;
}

.message.success {
  background: #e8f5e9;
  color: #2e7d32;
}

.message.error {
  background: #ffebee;
  color: #c62828;
}

.message.hidden {
  display: none;
}

footer {
  border-top: 1px solid #e0e0e0;
  padding: 12px 16px;
}

.footer-links {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-bottom: 8px;
}

.link-btn {
  background: none;
  border: none;
  color: #4caf50;
  font-size: 12px;
  cursor: pointer;
  text-decoration: none;
  padding: 4px 8px;
}

.link-btn:hover {
  text-decoration: underline;
}

.version {
  text-align: center;
  font-size: 11px;
  color: #999;
}
```

**Step 2: Commit popup styles**

```bash
git add src/popup/popup.css
git commit -m "feat: add popup styles"
```

---

## Task 10: Popup JavaScript Logic

**Files:**

- Create: `src/popup/popup.js`

**Step 1: Create popup.js**

Create `src/popup/popup.js`:

```javascript
// Popup controller
let currentDomain = null;
let currentPattern = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await checkSiteSupport();
  await loadStats();
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  document.getElementById('extract-btn').addEventListener('click', handleExtract);
  document.getElementById('suggest-btn').addEventListener('click', handleSuggest);
  document.getElementById('settings-btn').addEventListener('click', handleSettings);
}

// Check if current site is supported
async function checkSiteSupport() {
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      setUnsupported('No active tab');
      return;
    }

    // Extract domain from URL
    const url = new URL(tab.url);
    currentDomain = url.hostname;

    // Check with background
    chrome.runtime.sendMessage(
      { action: 'checkSiteSupport', domain: currentDomain },
      (response) => {
        if (response && response.supported) {
          currentPattern = response.pattern;
          setSupported(response.pattern.name);
        } else {
          setUnsupported('Site not supported');
        }
      }
    );
  } catch (error) {
    console.error('Error checking site support:', error);
    setUnsupported('Error checking site');
  }
}

// Set UI to supported state
function setSupported(siteName) {
  const statusBadge = document.getElementById('site-status');
  const statusIcon = document.getElementById('status-icon');
  const statusText = document.getElementById('status-text');
  const extractBtn = document.getElementById('extract-btn');

  statusBadge.className = 'status-badge supported';
  statusIcon.textContent = '✓';
  statusText.textContent = `Supported Site: ${siteName}`;
  extractBtn.disabled = false;
}

// Set UI to unsupported state
function setUnsupported(reason) {
  const statusBadge = document.getElementById('site-status');
  const statusIcon = document.getElementById('status-icon');
  const statusText = document.getElementById('status-text');
  const extractBtn = document.getElementById('extract-btn');

  statusBadge.className = 'status-badge unsupported';
  statusIcon.textContent = '✗';
  statusText.textContent = reason;
  extractBtn.disabled = true;
}

// Handle extract button click
async function handleExtract() {
  if (!currentPattern) {
    showMessage('No pattern available', 'error');
    return;
  }

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to content script
    chrome.tabs.sendMessage(
      tab.id,
      { action: 'extractGames', pattern: currentPattern },
      async (response) => {
        if (chrome.runtime.lastError) {
          showMessage('Error: ' + chrome.runtime.lastError.message, 'error');
          return;
        }

        if (response && response.success) {
          const games = response.games;

          if (games.length === 0) {
            showMessage('No board games found', 'error');
            return;
          }

          // Copy to clipboard
          const text = games.join('\n');
          await chrome.runtime.sendMessage({
            action: 'copyToClipboard',
            text: text,
          });

          // Update stats
          const stats = {
            lastExtraction: {
              domain: currentDomain,
              count: games.length,
              timestamp: Date.now(),
            },
          };
          await chrome.runtime.sendMessage({
            action: 'updateStats',
            stats: stats,
          });

          // Update UI
          showMessage(`Copied ${games.length} games to clipboard!`, 'success');
          updateStatsDisplay(stats);
        } else {
          showMessage('Failed to extract games', 'error');
        }
      }
    );
  } catch (error) {
    console.error('Error extracting:', error);
    showMessage('Error: ' + error.message, 'error');
  }
}

// Load and display stats
async function loadStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
    if (response && response.success && response.stats) {
      updateStatsDisplay(response.stats);
    }
  });
}

// Update stats display
function updateStatsDisplay(stats) {
  const statsText = document.getElementById('stats-text');

  if (stats.lastExtraction) {
    const { count, domain } = stats.lastExtraction;
    statsText.textContent = `Last: ${count} games from ${domain}`;
  } else {
    statsText.textContent = 'No extractions yet';
  }
}

// Show message to user
function showMessage(text, type) {
  const message = document.getElementById('message');
  message.textContent = text;
  message.className = `message ${type}`;

  // Hide after 3 seconds
  setTimeout(() => {
    message.className = 'message hidden';
  }, 3000);
}

// Handle suggest button click
function handleSuggest() {
  const subject = encodeURIComponent('Board Game Extractor - Site Suggestion');
  const body = encodeURIComponent(`I would like to suggest support for the following site:

Site Name:
Site URL:
CSS Selector for game names:

Additional notes:
`);

  window.open(`mailto:?subject=${subject}&body=${body}`);
}

// Handle settings button click
function handleSettings() {
  chrome.runtime.openOptionsPage();
}
```

**Step 2: Commit popup JavaScript**

```bash
git add src/popup/popup.js
git commit -m "feat: add popup JavaScript logic"
```

---

## Task 11: Options Page HTML Structure

**Files:**

- Create: `src/options/options.html`

**Step 1: Create options.html**

Create `src/options/options.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Board Game Extractor - Settings</title>
    <link rel="stylesheet" href="options.css" />
  </head>
  <body>
    <div class="container">
      <header>
        <h1>Board Game Extractor Settings</h1>
      </header>

      <nav class="tabs">
        <button class="tab-btn active" data-tab="supported">Supported Sites</button>
        <button class="tab-btn" data-tab="custom">Custom Patterns</button>
        <button class="tab-btn" data-tab="help">Help</button>
      </nav>

      <main>
        <!-- Supported Sites Tab -->
        <div id="supported-tab" class="tab-content active">
          <div class="section-header">
            <h2>Built-in Site Patterns</h2>
            <p class="subtitle">These patterns are included with the extension</p>
          </div>

          <div class="search-box">
            <input type="text" id="search-supported" placeholder="Search sites..." />
          </div>

          <div id="supported-list" class="pattern-list">
            <!-- Populated by JavaScript -->
          </div>
        </div>

        <!-- Custom Patterns Tab -->
        <div id="custom-tab" class="tab-content">
          <div class="section-header">
            <h2>Custom Patterns</h2>
            <p class="subtitle">Add your own site extraction patterns</p>
          </div>

          <div class="actions">
            <button id="add-pattern-btn" class="primary-btn">Add New Pattern</button>
            <button id="import-btn" class="secondary-btn">Import JSON</button>
            <button id="export-btn" class="secondary-btn">Export JSON</button>
          </div>

          <div id="custom-list" class="pattern-list">
            <!-- Populated by JavaScript -->
          </div>

          <div id="custom-empty" class="empty-state">
            <p>No custom patterns yet</p>
            <p class="hint">Click "Add New Pattern" to create one</p>
          </div>
        </div>

        <!-- Help Tab -->
        <div id="help-tab" class="tab-content">
          <div class="section-header">
            <h2>Help & Documentation</h2>
          </div>

          <section class="help-section">
            <h3>How to Use</h3>
            <ol>
              <li>Navigate to a supported website</li>
              <li>Click the extension icon in your browser toolbar</li>
              <li>Click "Extract Board Games"</li>
              <li>Game names are copied to your clipboard</li>
            </ol>
          </section>

          <section class="help-section">
            <h3>CSS Selector Guide</h3>
            <p>CSS selectors are patterns used to find elements on a webpage:</p>
            <ul>
              <li><code>h3</code> - All h3 elements</li>
              <li><code>.product-name</code> - Elements with class "product-name"</li>
              <li><code>#game-title</code> - Element with id "game-title"</li>
              <li><code>article h3</code> - h3 elements inside article elements</li>
              <li><code>[data-id]</code> - Elements with data-id attribute</li>
            </ul>
          </section>

          <section class="help-section">
            <h3>Filter Patterns</h3>
            <p>Use regex patterns to filter results:</p>
            <ul>
              <li><code>^Sponsored</code> - Exclude items starting with "Sponsored"</li>
              <li><code>Advertisement</code> - Exclude items containing "Advertisement"</li>
              <li><code>.*Game$</code> - Include only items ending with "Game"</li>
            </ul>
          </section>

          <section class="help-section">
            <h3>Need Help?</h3>
            <p>
              Visit our
              <a href="https://github.com/yourusername/bgm-extension" target="_blank"
                >GitHub repository</a
              >
              for more information and to report issues.
            </p>
          </section>
        </div>
      </main>
    </div>

    <!-- Pattern Editor Modal -->
    <div id="pattern-modal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="modal-title">Add Pattern</h2>
          <button id="modal-close" class="close-btn">&times;</button>
        </div>

        <form id="pattern-form">
          <div class="form-group">
            <label for="domain-input">Domain *</label>
            <input type="text" id="domain-input" placeholder="example.com" required />
            <span class="hint">Without http:// or www</span>
          </div>

          <div class="form-group">
            <label for="name-input">Display Name *</label>
            <input type="text" id="name-input" placeholder="Example Site" required />
          </div>

          <div class="form-group">
            <label for="selector-input">CSS Selector *</label>
            <input type="text" id="selector-input" placeholder=".product-name" required />
            <span class="hint">CSS selector to find game names</span>
          </div>

          <div class="form-group">
            <label for="exclude-input">Exclude Patterns (comma-separated)</label>
            <input type="text" id="exclude-input" placeholder="^Sponsored, ^Ad" />
            <span class="hint">Regex patterns to exclude results</span>
          </div>

          <div class="form-group">
            <label for="include-input">Include Patterns (comma-separated)</label>
            <input type="text" id="include-input" placeholder="Game$, Board" />
            <span class="hint">Regex patterns to include only matching results</span>
          </div>

          <div class="form-group checkbox-group">
            <label>
              <input type="checkbox" id="trim-input" checked />
              Trim whitespace
            </label>
          </div>

          <div class="form-group checkbox-group">
            <label>
              <input type="checkbox" id="dedupe-input" checked />
              Remove duplicates
            </label>
          </div>

          <div class="modal-actions">
            <button type="button" id="cancel-btn" class="secondary-btn">Cancel</button>
            <button type="submit" class="primary-btn">Save Pattern</button>
          </div>
        </form>
      </div>
    </div>

    <script src="options.js"></script>
  </body>
</html>
```

**Step 2: Commit options HTML**

```bash
git add src/options/options.html
git commit -m "feat: add options page HTML structure"
```

---

## Task 12: Options Page Styles

**Files:**

- Create: `src/options/options.css`

**Step 1: Create options.css**

Create `src/options/options.css`:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  color: #333;
  background: #f5f5f5;
}

.container {
  max-width: 900px;
  margin: 0 auto;
  background: white;
  min-height: 100vh;
}

header {
  background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
  color: white;
  padding: 24px;
  text-align: center;
}

header h1 {
  font-size: 24px;
  font-weight: 600;
}

.tabs {
  display: flex;
  border-bottom: 2px solid #e0e0e0;
  background: white;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tab-btn {
  flex: 1;
  padding: 16px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 14px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: #f5f5f5;
  color: #333;
}

.tab-btn.active {
  color: #4caf50;
  border-bottom-color: #4caf50;
}

main {
  padding: 24px;
}

.tab-content {
  display: none;
}

.tab-content.active {
  display: block;
}

.section-header {
  margin-bottom: 24px;
}

.section-header h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
}

.subtitle {
  color: #666;
  font-size: 14px;
}

.search-box {
  margin-bottom: 16px;
}

.search-box input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
}

.actions {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.primary-btn {
  padding: 10px 20px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.primary-btn:hover {
  background: #45a049;
}

.secondary-btn {
  padding: 10px 20px;
  background: white;
  color: #4caf50;
  border: 1px solid #4caf50;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.secondary-btn:hover {
  background: #f1f8f4;
}

.pattern-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pattern-card {
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: white;
}

.pattern-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 12px;
}

.pattern-info h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.pattern-domain {
  color: #666;
  font-size: 13px;
}

.pattern-actions {
  display: flex;
  gap: 8px;
}

.icon-btn {
  padding: 6px 12px;
  background: none;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: #f5f5f5;
  border-color: #bbb;
}

.icon-btn.delete:hover {
  background: #ffebee;
  border-color: #ef5350;
  color: #c62828;
}

.pattern-details {
  display: grid;
  gap: 8px;
  font-size: 13px;
}

.pattern-row {
  display: flex;
  gap: 8px;
}

.pattern-label {
  font-weight: 600;
  min-width: 80px;
  color: #666;
}

.pattern-value {
  flex: 1;
  font-family: 'Courier New', monospace;
  color: #333;
  word-break: break-all;
}

.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: #999;
}

.empty-state p {
  margin-bottom: 8px;
}

.hint {
  font-size: 12px;
  color: #999;
}

.help-section {
  margin-bottom: 32px;
}

.help-section h3 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
}

.help-section p {
  margin-bottom: 12px;
  line-height: 1.6;
}

.help-section ul,
.help-section ol {
  margin-left: 24px;
  line-height: 1.8;
}

.help-section code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.help-section a {
  color: #4caf50;
  text-decoration: none;
}

.help-section a:hover {
  text-decoration: underline;
}

/* Modal */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal.hidden {
  display: none;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #333;
}

#pattern-form {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 13px;
}

.form-group input[type='text'] {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.form-group input[type='text']:focus {
  outline: none;
  border-color: #4caf50;
}

.form-group .hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #999;
}

.checkbox-group {
  display: flex;
  align-items: center;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: normal;
  cursor: pointer;
}

.checkbox-group input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
}
```

**Step 2: Commit options styles**

```bash
git add src/options/options.css
git commit -m "feat: add options page styles"
```

---

## Task 13: Options Page JavaScript - Part 1 (Tab Management & Pattern Loading)

**Files:**

- Create: `src/options/options.js`

**Step 1: Create options.js with tab management**

Create `src/options/options.js`:

```javascript
// Options page controller
let customPatterns = [];
let builtInPatterns = [];
let editingIndex = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadPatterns();
  setupTabs();
  setupEventListeners();
  renderPatterns();
});

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

// Setup event listeners
function setupEventListeners() {
  // Custom pattern actions
  document.getElementById('add-pattern-btn').addEventListener('click', () => openModal());
  document.getElementById('import-btn').addEventListener('click', handleImport);
  document.getElementById('export-btn').addEventListener('click', handleExport);

  // Modal actions
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  document.getElementById('pattern-form').addEventListener('submit', handleFormSubmit);

  // Search
  document.getElementById('search-supported').addEventListener('input', handleSearch);
}

// Load patterns from storage
async function loadPatterns() {
  try {
    // Load built-in patterns
    const response = await fetch(chrome.runtime.getURL('patterns/built-in.json'));
    const data = await response.json();
    builtInPatterns = data.patterns || [];

    // Load custom patterns
    const result = await chrome.storage.local.get('customPatterns');
    customPatterns = result.customPatterns || [];
  } catch (error) {
    console.error('Error loading patterns:', error);
  }
}

// Render all patterns
function renderPatterns() {
  renderSupportedPatterns();
  renderCustomPatterns();
}

// Render built-in patterns
function renderSupportedPatterns(filter = '') {
  const list = document.getElementById('supported-list');
  list.innerHTML = '';

  const filtered = builtInPatterns.filter(
    (p) =>
      filter === '' ||
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.domain.toLowerCase().includes(filter.toLowerCase())
  );

  filtered.forEach((pattern) => {
    const card = createPatternCard(pattern, false);
    list.appendChild(card);
  });
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
    const card = createPatternCard(pattern, true, index);
    list.appendChild(card);
  });
}

// Create pattern card element
function createPatternCard(pattern, isCustom, index) {
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

  if (isCustom) {
    const actions = document.createElement('div');
    actions.className = 'pattern-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => editPattern(index));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deletePattern(index));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    header.appendChild(actions);
  }

  card.appendChild(header);

  const details = document.createElement('div');
  details.className = 'pattern-details';
  details.innerHTML = `
    <div class="pattern-row">
      <span class="pattern-label">Selector:</span>
      <span class="pattern-value">${escapeHtml(pattern.selector)}</span>
    </div>
  `;

  if (pattern.filters) {
    if (pattern.filters.exclude && pattern.filters.exclude.length > 0) {
      details.innerHTML += `
        <div class="pattern-row">
          <span class="pattern-label">Exclude:</span>
          <span class="pattern-value">${escapeHtml(pattern.filters.exclude.join(', '))}</span>
        </div>
      `;
    }
    if (pattern.filters.include && pattern.filters.include.length > 0) {
      details.innerHTML += `
        <div class="pattern-row">
          <span class="pattern-label">Include:</span>
          <span class="pattern-value">${escapeHtml(pattern.filters.include.join(', '))}</span>
        </div>
      `;
    }
  }

  card.appendChild(details);
  return card;
}

// Continue in next step...
```

**Step 2: Commit options JavaScript part 1**

```bash
git add src/options/options.js
git commit -m "feat: add options page JavaScript (part 1 - tab management)"
```

---

## Task 14: Options Page JavaScript - Part 2 (CRUD Operations)

**Files:**

- Modify: `src/options/options.js`

**Step 1: Add CRUD operations to options.js**

Add to `src/options/options.js`:

```javascript
// Modal management
function openModal(index = null) {
  const modal = document.getElementById('pattern-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('pattern-form');

  editingIndex = index;

  if (index !== null) {
    // Edit mode
    title.textContent = 'Edit Pattern';
    const pattern = customPatterns[index];
    populateForm(pattern);
  } else {
    // Add mode
    title.textContent = 'Add Pattern';
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
  if (!confirm('Are you sure you want to delete this pattern?')) {
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
    alert('Failed to save patterns');
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
        alert('Invalid format: JSON must be an array of patterns');
        return;
      }

      // Validate patterns
      for (const pattern of imported) {
        if (!pattern.domain || !pattern.name || !pattern.selector) {
          alert('Invalid pattern format in imported file');
          return;
        }
      }

      // Merge with existing (don't overwrite)
      customPatterns = [...customPatterns, ...imported];
      await saveCustomPatterns();
      renderCustomPatterns();

      chrome.runtime.sendMessage({ action: 'reloadPatterns' });
      alert(`Imported ${imported.length} patterns`);
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import patterns: ' + error.message);
    }
  });

  input.click();
}

// Handle export
function handleExport() {
  if (customPatterns.length === 0) {
    alert('No custom patterns to export');
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

// Handle search
function handleSearch(e) {
  const query = e.target.value;
  renderSupportedPatterns(query);
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
```

**Step 2: Commit options JavaScript part 2**

```bash
git add src/options/options.js
git commit -m "feat: add options page JavaScript (part 2 - CRUD operations)"
```

---

## Task 15: Testing & Documentation

**Files:**

- Create: `docs/TESTING.md`

**Step 1: Create testing documentation**

Create `docs/TESTING.md`:

```markdown
# Testing Guide

## Manual Testing Checklist

### Extension Loading

- [ ] **Chrome**: Load unpacked extension from `chrome://extensions/`
- [ ] **Firefox**: Load temporary add-on from `about:debugging`
- [ ] Extension icon appears in toolbar
- [ ] No console errors on load

### Basic Functionality

- [ ] Navigate to knapix.com
- [ ] Click extension icon
- [ ] Status shows "Supported Site: Knapix"
- [ ] Extract button is enabled
- [ ] Click "Extract Board Games"
- [ ] Success message shows game count
- [ ] Games are copied to clipboard (paste to verify)
- [ ] Last extraction stats update

### Unsupported Sites

- [ ] Navigate to unsupported site (e.g., google.com)
- [ ] Status shows "Site not supported"
- [ ] Extract button is disabled

### Custom Patterns

- [ ] Open settings (click "Settings" in popup)
- [ ] Navigate to "Custom Patterns" tab
- [ ] Click "Add New Pattern"
- [ ] Fill in pattern form:
  - Domain: test.com
  - Name: Test Site
  - Selector: h1
- [ ] Save pattern
- [ ] Pattern appears in custom list
- [ ] Edit pattern
- [ ] Delete pattern (with confirmation)

### Pattern Import/Export

- [ ] Add a custom pattern
- [ ] Click "Export JSON"
- [ ] JSON file downloads
- [ ] Delete the custom pattern
- [ ] Click "Import JSON"
- [ ] Select exported file
- [ ] Pattern reappears in list

### Supported Sites Tab

- [ ] View built-in patterns list
- [ ] Search for "amazon"
- [ ] List filters correctly
- [ ] Clear search
- [ ] Full list returns

### Help Tab

- [ ] View help documentation
- [ ] All sections render correctly
- [ ] External links work

### Edge Cases

- [ ] Extract from page with no matching elements (should show error)
- [ ] Extract from page with 100+ games (should work)
- [ ] Add pattern with invalid CSS selector (should validate)
- [ ] Navigate between tabs quickly (no errors)

## Test Sites

### Knapix.com

- URL: https://www.knapix.com/2025/11/...
- Selector: `article h3`
- Expected: List of board game names from article headings

### Amazon

- URL: https://www.amazon.com/s?k=board+games
- Selector: `[data-component-type='s-search-result'] h2 a span`
- Expected: Product names (with ads filtered out)

## Debugging Tips

### Check Console Logs

- Background: `chrome://extensions/` → Inspect views: service worker
- Content Script: Open DevTools on webpage
- Popup: Right-click extension icon → Inspect popup

### Common Issues

**"No board games found"**

- Check if selector matches elements on page
- Inspect page HTML structure
- Verify filters aren't excluding all results

**"Error copying to clipboard"**

- Check clipboardWrite permission in manifest
- Verify extension has activeTab permission

**Pattern not working after add**

- Check background console for reload confirmation
- Verify pattern saved in storage (DevTools → Application → Storage)

## Performance Testing

- [ ] Extract 1000+ items (should complete in < 2s)
- [ ] Switch between tabs rapidly (no UI lag)
- [ ] Load extension with 50+ custom patterns (no startup lag)

## Browser Compatibility

- [ ] All features work in Chrome
- [ ] All features work in Firefox
- [ ] Icons display correctly in both browsers
- [ ] Storage works in both browsers
```

**Step 2: Commit testing documentation**

```bash
git add docs/TESTING.md
git commit -m "docs: add testing guide"
```

---

## Task 16: Update README with Usage Instructions

**Files:**

- Modify: `README.md`

**Step 1: Expand README**

Update `README.md`:

```markdown
# Board Game Extractor

A cross-browser extension (Chrome/Firefox) for extracting board game names from websites using configurable CSS selector patterns.

## Features

- 🎲 Extract board game names from supported sites with one click
- 📋 Copy results directly to clipboard
- ⚙️ Built-in patterns for popular board game sites (Knapix, Amazon, Philibert)
- ✏️ Add custom extraction patterns for any website
- 📤 Import/export custom patterns
- 🔍 Filter results with regex patterns
- 🎨 Clean, intuitive interface

## Installation

### Chrome

1. Download or clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `bgm-extension` directory
6. Extension icon will appear in your toolbar

### Firefox

1. Download or clone this repository
2. Open `about:debugging#/runtime/this-firefox` in Firefox
3. Click "Load Temporary Add-on"
4. Navigate to the extension directory and select `manifest.json`
5. Extension icon will appear in your toolbar

**Note:** In Firefox, temporary extensions are removed when you close the browser. For permanent installation, the extension needs to be signed by Mozilla.

## Usage

### Basic Extraction

1. Navigate to a supported website (e.g., knapix.com)
2. Click the Board Game Extractor icon in your toolbar
3. Verify the site is supported (green badge)
4. Click "Extract Board Games"
5. Game names are copied to your clipboard
6. Paste anywhere to use the results

### Adding Custom Patterns

1. Click the extension icon
2. Click "Settings"
3. Navigate to "Custom Patterns" tab
4. Click "Add New Pattern"
5. Fill in the form:
   - **Domain**: Website domain (e.g., "example.com")
   - **Display Name**: Friendly name for the site
   - **CSS Selector**: Pattern to find game names (e.g., ".product-title")
   - **Exclude Patterns** (optional): Regex to filter out unwanted results
   - **Include Patterns** (optional): Regex to keep only matching results
6. Click "Save Pattern"

### Pattern Examples

**Simple selector:**
```

Selector: h3

```

**Class-based selector:**
```

Selector: .product-name

```

**Nested selector:**
```

Selector: article .game-title

```

**With filters:**
```

Selector: .product h2
Exclude: ^Sponsored, ^Advertisement

```

### Import/Export Patterns

**Export:**
1. Open Settings → Custom Patterns
2. Click "Export JSON"
3. Save the downloaded file

**Import:**
1. Open Settings → Custom Patterns
2. Click "Import JSON"
3. Select a previously exported JSON file
4. Patterns are added to your collection

### Suggesting New Sites

1. Click the extension icon
2. Click "Suggest a Site"
3. Your email client opens with a pre-filled template
4. Fill in the site details and send

## Supported Sites

Currently includes built-in patterns for:

- **Knapix** (knapix.com)
- **Amazon** (amazon.com, amazon.fr)
- **Philibert** (philibert.com)

More sites coming soon! You can add your own via custom patterns.

## Development

### Project Structure

```

bgm-extension/
├── manifest.json # Extension manifest
├── src/
│ ├── background/ # Service worker
│ ├── content/ # Content scripts
│ ├── popup/ # Extension popup UI
│ ├── options/ # Settings page
│ └── lib/ # Shared utilities
├── patterns/ # Built-in site patterns
├── icons/ # Extension icons
└── docs/ # Documentation

```

### Tech Stack

- Vanilla JavaScript (no build step required)
- WebExtensions API (Manifest V3)
- Chrome Storage API for persistence

### Testing

See [docs/TESTING.md](docs/TESTING.md) for comprehensive testing guide.

### Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly in both Chrome and Firefox
5. Submit a pull request

## Pattern Syntax Reference

### CSS Selectors

- `h3` - All h3 elements
- `.class-name` - Elements with class
- `#id-name` - Element with ID
- `div > p` - Direct child
- `div p` - Any descendant
- `[data-attr]` - Elements with attribute

### Regex Filters

- `^Text` - Starts with "Text"
- `Text$` - Ends with "Text"
- `.*Text.*` - Contains "Text"
- `\d+` - Contains numbers

## Privacy

This extension:
- ✅ Works entirely locally (no external servers)
- ✅ Only reads page content when you click "Extract"
- ✅ Stores patterns only in your browser
- ✅ Never transmits data to external services

## License

MIT License - see LICENSE file for details

## Support

- Report bugs: [GitHub Issues](https://github.com/yourusername/bgm-extension/issues)
- Feature requests: [GitHub Issues](https://github.com/yourusername/bgm-extension/issues)
- Questions: [GitHub Discussions](https://github.com/yourusername/bgm-extension/discussions)

## Roadmap

- [ ] Firefox Add-ons store submission
- [ ] Chrome Web Store submission
- [ ] Pattern testing playground
- [ ] Export to multiple formats (CSV, JSON, etc.)
- [ ] Website redirect feature
- [ ] Pattern auto-update system
- [ ] Browser sync for custom patterns
```

**Step 2: Commit README updates**

```bash
git add README.md
git commit -m "docs: expand README with usage instructions"
```

---

## Final Steps

### Step 1: Verify all files are committed

```bash
git status
```

Expected: "working tree clean"

### Step 2: Create initial release tag

```bash
git tag -a v1.0.0 -m "Initial release - Board Game Extractor v1.0.0"
```

### Step 3: Test the extension

Follow the manual testing checklist in `docs/TESTING.md` to verify:

1. Extension loads without errors
2. Basic extraction works on knapix.com
3. Custom patterns can be added/edited/deleted
4. Import/export functionality works
5. Both Chrome and Firefox compatibility

---

## Summary

This implementation plan creates a fully functional cross-browser extension with:

✅ Manifest V3 configuration
✅ Background service worker with pattern management
✅ Content script for DOM extraction
✅ Popup UI with status detection
✅ Options page with full pattern management
✅ Built-in patterns for Knapix, Amazon, Philibert
✅ Custom pattern support with import/export
✅ Complete documentation

**Next Steps:**

1. Test thoroughly in both browsers
2. Create proper extension icons (replace SVG placeholders with PNG)
3. Prepare for store submission (Chrome Web Store, Firefox Add-ons)
4. Set up GitHub repository with issue templates
5. Consider adding automated tests (Jest for JS unit tests)
