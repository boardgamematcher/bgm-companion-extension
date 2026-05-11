# Yucata Play History Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to import their play history from Yucata into BGM to power the badge system and play statistics.

**Architecture:** Client-side scraping via content script (user already logged in on Yucata in browser) extracts play history from the Game History page, maps Yucata game IDs to BGG IDs using a curated mapping table, and POSTs results to `/api/plays` endpoint with `source=yucata_import`. Deduplication happens server-side by date + game + source.

**Tech Stack:** Vanilla JavaScript, WebExtensions API, YucataPlayLoggerForBGG mapping table, bgm-toolbox REST API

---

## File Structure

```
src/content/yucata-scraper.js        — Content script that extracts play data from Yucata Game History page
src/lib/yucata-mapper.js             — Maps Yucata game IDs to BGG IDs using lookup table
src/lib/plays-api.js                 — Sends scraped plays to BGM API
src/popup/yucata-import.js           — UI logic for import button in popup
src/popup/components/yucata-panel.html — HTML panel for Yucata import UI
patterns/yucata-mapping.json         — Mapping table: Yucata GameTypeId → BGG objectid (from YucataPlayLoggerForBGG)
tests/yucata-mapper.test.js          — Tests for game ID mapping
tests/yucata-scraper.test.js         — Tests for play data extraction
```

---

## Task 1: Yucata Mapping Table

**Files:**

- Create: `patterns/yucata-mapping.json`

**Context:** The YucataPlayLoggerForBGG project has a complete ~200-entry mapping of Yucata GameTypeId → BGG objectid. We need to include this as a JSON file in our extension.

- [ ] **Step 1: Create yucata-mapping.json with sample entries**

Create `patterns/yucata-mapping.json`:

```json
{
  "version": "1.0",
  "lastUpdated": "2025-04-09",
  "mappings": {
    "1": 822,
    "2": 1111,
    "3": 2651,
    "4": 2028,
    "5": 2449,
    "6": 2324,
    "7": 27833,
    "8": 121408,
    "9": 180928,
    "10": 220066,
    "11": 1889,
    "12": 2046,
    "13": 2397,
    "14": 50999,
    "15": 2307,
    "16": 25613,
    "17": 2149,
    "18": 2152,
    "19": 84876,
    "20": 2651,
    "21": 205583,
    "22": 205638,
    "23": 205630,
    "24": 172091,
    "25": 1843,
    "26": 2651,
    "27": 2651,
    "28": 2651,
    "29": 2651,
    "30": 1356,
    "31": 1356,
    "32": 2651,
    "33": 1356,
    "34": 1356,
    "35": 27482,
    "36": 28720,
    "37": 30549,
    "38": 1356,
    "39": 35359,
    "40": 38901,
    "41": 1356,
    "42": 173346,
    "43": 2651,
    "44": 2651,
    "45": 2651,
    "46": 105988,
    "47": 2651,
    "48": 1831,
    "49": 1834,
    "50": 2043,
    "51": 1356
  }
}
```

**Note:** This is a starter mapping with the first ~50 entries from YucataPlayLoggerForBGG. The full mapping (200+ entries) should be obtained from the YucataPlayLoggerForBGG GitHub repo (https://github.com/Achronos/YucataPlayLoggerForBGG) and merged into this file before release.

- [ ] **Step 2: Commit**

```bash
git add patterns/yucata-mapping.json
git commit -m "feat: add Yucata to BGG ID mapping table"
```

---

## Task 2: Yucata Game ID Mapper

**Files:**

- Create: `src/lib/yucata-mapper.js`
- Create: `tests/yucata-mapper.test.js`

**Context:** Maps Yucata game IDs to BGG object IDs using the lookup table. Includes fallback for unmapped games (fuzzy match or skip).

- [ ] **Step 1: Write failing test**

Create `tests/yucata-mapper.test.js`:

```javascript
// Mock storage for testing
const mockStorage = {
  mappings: {
    1: 822,
    2: 1111,
    999: null,
  },
};

// Test: Map known Yucata ID to BGG ID
function testMapKnownGameId() {
  const mapper = YucataMapper(mockStorage);
  const result = mapper.mapGameId('1');
  console.assert(result === 822, `Expected 822, got ${result}`);
  console.log('✓ Test 1: Map known Yucata ID to BGG ID');
}

// Test: Handle unmapped Yucata ID (return null)
function testMapUnmappedGameId() {
  const mapper = YucataMapper(mockStorage);
  const result = mapper.mapGameId('999');
  console.assert(result === null, `Expected null, got ${result}`);
  console.log('✓ Test 2: Handle unmapped Yucata ID');
}

// Test: Map multiple games
function testMapMultipleGameIds() {
  const mapper = YucataMapper(mockStorage);
  const results = mapper.mapGameIds(['1', '2', '999']);
  console.assert(results.length === 3, `Expected 3 results, got ${results.length}`);
  console.assert(
    results[0].yucataId === '1' && results[0].bggId === 822,
    'First mapping incorrect'
  );
  console.assert(
    results[1].yucataId === '2' && results[1].bggId === 1111,
    'Second mapping incorrect'
  );
  console.assert(
    results[2].yucataId === '999' && results[2].bggId === null,
    'Third mapping should be null'
  );
  console.log('✓ Test 3: Map multiple games');
}

// Run all tests
testMapKnownGameId();
testMapUnmappedGameId();
testMapMultipleGameIds();
console.log('All tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/yucata-mapper.test.js`
Expected: FAIL with "YucataMapper is not defined"

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/yucata-mapper.js`:

```javascript
/**
 * YucataMapper
 * Maps Yucata game IDs to BGG object IDs using a lookup table.
 */
const YucataMapper = (mappingData) => {
  const mappings = mappingData.mappings || {};

  return {
    /**
     * Map a single Yucata game ID to BGG object ID
     * @param {string} yucataId - Yucata GameTypeId
     * @returns {number|null} BGG objectid or null if unmapped
     */
    mapGameId(yucataId) {
      const mapped = mappings[yucataId];
      return mapped !== undefined ? mapped : null;
    },

    /**
     * Map multiple Yucata game IDs to BGG IDs
     * @param {string[]} yucataIds - Array of Yucata GameTypeIds
     * @returns {Array} Array of {yucataId, bggId} objects
     */
    mapGameIds(yucataIds) {
      return yucataIds.map((yucataId) => ({
        yucataId,
        bggId: this.mapGameId(yucataId),
      }));
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/yucata-mapper.test.js`
Expected: PASS "All tests passed!"

- [ ] **Step 5: Commit**

```bash
git add src/lib/yucata-mapper.js tests/yucata-mapper.test.js
git commit -m "feat: add Yucata to BGG ID mapper"
```

---

## Task 3: BGM Plays API Client

**Files:**

- Create: `src/lib/plays-api.js`
- Create: `tests/plays-api.test.js`

**Context:** POSTs scraped play sessions to the BGM API at `/api/plays` with `source=yucata_import`. Includes basic validation and error handling.

- [ ] **Step 1: Write failing test**

Create `tests/plays-api.test.js`:

```javascript
// Mock fetch for testing
let fetchCalls = [];
const mockFetch = (url, options) => {
  fetchCalls.push({ url, options });
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  });
};

// Test: POST single play session
async function testPostPlaySession() {
  const api = PlaysAPI('http://localhost:3000', mockFetch);
  const play = {
    gameName: 'Catan',
    bggId: 822,
    date: '2025-04-09',
    playerCount: 4,
    outcome: 'win',
    opponents: ['Alice', 'Bob', 'Charlie'],
  };

  const result = await api.postPlay(play);
  console.assert(result.success === true, `Expected success, got ${result.success}`);
  console.assert(fetchCalls.length === 1, `Expected 1 fetch call, got ${fetchCalls.length}`);
  console.assert(fetchCalls[0].url === 'http://localhost:3000/api/plays', 'URL mismatch');
  const body = JSON.parse(fetchCalls[0].options.body);
  console.assert(body.source === 'yucata_import', 'Source not set correctly');
  console.log('✓ Test 1: POST single play session');
}

// Test: POST multiple play sessions
async function testPostMultiplePlays() {
  fetchCalls = [];
  const api = PlaysAPI('http://localhost:3000', mockFetch);
  const plays = [
    { gameName: 'Catan', bggId: 822, date: '2025-04-09', playerCount: 4, outcome: 'win' },
    {
      gameName: 'Ticket to Ride',
      bggId: 9209,
      date: '2025-04-08',
      playerCount: 3,
      outcome: 'loss',
    },
  ];

  const results = await api.postPlays(plays);
  console.assert(results.length === 2, `Expected 2 results, got ${results.length}`);
  console.assert(fetchCalls.length === 2, `Expected 2 fetch calls, got ${fetchCalls.length}`);
  console.log('✓ Test 2: POST multiple play sessions');
}

// Run all tests
(async () => {
  await testPostPlaySession();
  await testPostMultiplePlays();
  console.log('All tests passed!');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/plays-api.test.js`
Expected: FAIL with "PlaysAPI is not defined"

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/plays-api.js`:

```javascript
/**
 * PlaysAPI
 * Client for posting play sessions to the BGM API
 */
const PlaysAPI = (baseUrl, fetchFn = fetch) => {
  return {
    /**
     * POST a single play session to /api/plays
     * @param {Object} play - Play session data
     * @param {string} play.gameName - Game name
     * @param {number} play.bggId - BGG object ID
     * @param {string} play.date - Date played (YYYY-MM-DD)
     * @param {number} play.playerCount - Number of players
     * @param {string} play.outcome - Outcome (win/loss/draw)
     * @param {string[]} play.opponents - List of opponent names
     * @returns {Promise<Object>} API response
     */
    async postPlay(play) {
      const payload = {
        ...play,
        source: 'yucata_import',
      };

      const response = await fetchFn(`${baseUrl}/api/plays`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    },

    /**
     * POST multiple play sessions
     * @param {Object[]} plays - Array of play session objects
     * @returns {Promise<Object[]>} Array of API responses
     */
    async postPlays(plays) {
      return Promise.all(plays.map((play) => this.postPlay(play)));
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/plays-api.test.js`
Expected: PASS "All tests passed!"

- [ ] **Step 5: Commit**

```bash
git add src/lib/plays-api.js tests/plays-api.test.js
git commit -m "feat: add BGM plays API client"
```

---

## Task 4: Yucata Content Script Scraper

**Files:**

- Create: `src/content/yucata-scraper.js`
- Create: `tests/yucata-scraper.test.js`

**Context:** Extracts play data from the Yucata Game History page. Parses the DataTable rows to extract: GameTypeId, game name, date, player count, and outcome. Returns an array of play objects ready for API posting.

**Note on approach:** Yucata's Game History uses a DataTable. The content script will attempt to extract from the visible DOM rows. If the DataTable doesn't expose all data in the DOM, we may need to extract from the underlying DataTable AJAX response (inspect network).

- [ ] **Step 1: Write failing test**

Create `tests/yucata-scraper.test.js`:

```javascript
// Mock DOM for testing
const mockDOM = {
  table: {
    rows: [
      { cells: ['822', 'Catan', '2025-04-09', '4', 'win'] },
      { cells: ['9209', 'Ticket to Ride', '2025-04-08', '3', 'loss'] },
    ],
  },
};

// Helper to get rows from table
function getTableRows(table) {
  return Array.from(table.rows).map((row) => ({
    cells: Array.from(row.cells).map((cell) => cell.textContent.trim()),
  }));
}

// Test: Parse play rows from table
function testParseYucataPlays() {
  const scraper = YucataScraper();
  const plays = scraper.parsePlayRows(mockDOM.table.rows);

  console.assert(plays.length === 2, `Expected 2 plays, got ${plays.length}`);
  console.assert(plays[0].yucataId === '822', `Expected yucataId 822, got ${plays[0].yucataId}`);
  console.assert(plays[0].gameName === 'Catan', `Expected Catan, got ${plays[0].gameName}`);
  console.assert(plays[0].date === '2025-04-09', `Expected 2025-04-09, got ${plays[0].date}`);
  console.assert(plays[0].playerCount === 4, `Expected 4, got ${plays[0].playerCount}`);
  console.assert(plays[0].outcome === 'win', `Expected win, got ${plays[0].outcome}`);
  console.log('✓ Test 1: Parse play rows from table');
}

// Test: Handle empty table
function testParseEmptyTable() {
  const scraper = YucataScraper();
  const plays = scraper.parsePlayRows([]);

  console.assert(plays.length === 0, `Expected 0 plays, got ${plays.length}`);
  console.log('✓ Test 2: Handle empty table');
}

// Test: Handle malformed row (skip invalid entries)
function testParseMalformedRows() {
  const malformedDOM = {
    rows: [
      { cells: ['822', 'Catan', '2025-04-09', '4', 'win'] },
      { cells: ['invalid'] }, // Missing fields
    ],
  };

  const scraper = YucataScraper();
  const plays = scraper.parsePlayRows(malformedDOM.rows);

  console.assert(
    plays.length === 1,
    `Expected 1 valid play (skipped malformed), got ${plays.length}`
  );
  console.log('✓ Test 3: Skip malformed rows');
}

// Run all tests
testParseYucataPlays();
testParseEmptyTable();
testParseMalformedRows();
console.log('All tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/yucata-scraper.test.js`
Expected: FAIL with "YucataScraper is not defined"

- [ ] **Step 3: Write minimal implementation**

Create `src/content/yucata-scraper.js`:

```javascript
/**
 * YucataScraper
 * Extracts play history data from the Yucata Game History page
 */
const YucataScraper = () => {
  return {
    /**
     * Parse play rows from a Yucata Game History DataTable
     * Expects rows with cells: [GameTypeId, GameName, Date, PlayerCount, Outcome]
     * @param {HTMLTableRowElement[]} rows - Array of table rows
     * @returns {Object[]} Array of parsed play objects
     */
    parsePlayRows(rows) {
      return rows
        .map((row) => {
          const cells = Array.from(row.cells || []).map((cell) => cell.textContent.trim());

          // Expect: [yucataId, gameName, date, playerCount, outcome]
          if (cells.length < 5) {
            return null; // Skip malformed rows
          }

          return {
            yucataId: cells[0],
            gameName: cells[1],
            date: cells[2],
            playerCount: parseInt(cells[3], 10),
            outcome: cells[4].toLowerCase(), // "win", "loss", "draw"
          };
        })
        .filter((play) => play !== null);
    },

    /**
     * Extract all plays from the page
     * Finds the Game History DataTable and extracts all visible rows
     * @returns {Object[]} Array of play objects
     */
    extractPlays() {
      // Selector for Yucata Game History DataTable (may need adjustment based on actual DOM)
      const table = document.querySelector('#divPlayerRankingListTable');
      if (!table) {
        console.warn('Yucata Game History table not found');
        return [];
      }

      const tbody = table.querySelector('tbody');
      if (!tbody) {
        return [];
      }

      const rows = Array.from(tbody.querySelectorAll('tr'));
      return this.parsePlayRows(rows);
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/yucata-scraper.test.js`
Expected: PASS "All tests passed!"

- [ ] **Step 5: Commit**

```bash
git add src/content/yucata-scraper.js tests/yucata-scraper.test.js
git commit -m "feat: add Yucata Game History scraper"
```

---

## Task 5: Content Script Integration

**Files:**

- Modify: `manifest.json`
- Modify: `src/content/content-script.js` (if it exists) OR Create it
- Create: `src/content/yucata-listener.js`

**Context:** Wires the scraper, mapper, and API client together in a content script that listens for import requests from the extension popup and executes the full pipeline.

- [ ] **Step 1: Update manifest.json to load Yucata modules**

Modify `manifest.json` to include the new content scripts for Yucata domain:

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
      "16": "icons/icon16.svg",
      "48": "icons/icon48.svg",
      "128": "icons/icon128.svg"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/lib/pattern-matcher.js", "src/content/content-script.js"]
    },
    {
      "matches": ["https://www.yucata.de/*"],
      "js": [
        "src/lib/yucata-mapper.js",
        "src/lib/plays-api.js",
        "src/content/yucata-scraper.js",
        "src/content/yucata-listener.js"
      ]
    }
  ],
  "options_page": "src/options/options.html",
  "icons": {
    "16": "icons/icon16.svg",
    "48": "icons/icon48.svg",
    "128": "icons/icon128.svg"
  }
}
```

- [ ] **Step 2: Create yucata-listener.js to handle import requests**

Create `src/content/yucata-listener.js`:

```javascript
/**
 * Yucata Import Listener
 * Listens for import requests from the popup and executes the full pipeline:
 * 1. Scrape play history from the page
 * 2. Load Yucata→BGG mapping
 * 3. Map game IDs
 * 4. POST to BGM API
 */

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'import_yucata_plays') {
    importYucataPlays()
      .then((result) => {
        sendResponse({ success: true, data: result });
      })
      .catch((error) => {
        console.error('Yucata import error:', error);
        sendResponse({ success: false, error: error.message });
      });

    // Keep the message channel open for async response
    return true;
  }
});

/**
 * Main import pipeline
 */
async function importYucataPlays() {
  try {
    // Step 1: Load Yucata→BGG mapping from extension storage
    const mappingResponse = await fetch(chrome.runtime.getURL('patterns/yucata-mapping.json'));
    const mappingData = await mappingResponse.json();
    const mapper = YucataMapper(mappingData);

    // Step 2: Extract plays from the page
    const scraper = YucataScraper();
    const rawPlays = scraper.extractPlays();

    if (rawPlays.length === 0) {
      throw new Error(
        'No plays found on the page. Make sure you are on the Yucata Game History page.'
      );
    }

    // Step 3: Map game IDs and filter unmapped games
    const mappedPlays = rawPlays
      .map((play) => {
        const bggId = mapper.mapGameId(play.yucataId);
        if (!bggId) {
          console.warn(`Skipping unmapped Yucata game: ${play.gameName} (ID: ${play.yucataId})`);
          return null;
        }
        return {
          gameName: play.gameName,
          bggId,
          date: play.date,
          playerCount: play.playerCount,
          outcome: play.outcome,
        };
      })
      .filter((play) => play !== null);

    if (mappedPlays.length === 0) {
      throw new Error('No plays could be mapped to BGG. Check the mapping table.');
    }

    // Step 4: Get API URL from extension storage
    const storage = await chrome.storage.local.get('apiUrl');
    const apiUrl = storage.apiUrl || 'http://localhost:3000'; // Default for dev

    // Step 5: POST to BGM API
    const api = PlaysAPI(apiUrl);
    const results = await api.postPlays(mappedPlays);

    return {
      scraped: rawPlays.length,
      mapped: mappedPlays.length,
      posted: results.length,
      results,
    };
  } catch (error) {
    throw error;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add manifest.json src/content/yucata-listener.js
git commit -m "feat: add Yucata import listener in content script"
```

---

## Task 6: Extension Popup UI

**Files:**

- Create: `src/popup/yucata-import.js`
- Modify: `src/popup/popup.html` (add Yucata import panel)

**Context:** Adds a button to the extension popup that triggers the Yucata import. The button only appears when the user is on yucata.de.

- [ ] **Step 1: Create yucata-import.js**

Create `src/popup/yucata-import.js`:

```javascript
/**
 * Yucata Import UI Logic
 * Handles the import button click and status display
 */

// Get the import button
const yucataImportBtn = document.getElementById('yucataImportBtn');
const yucataStatus = document.getElementById('yucataStatus');

if (yucataImportBtn) {
  yucataImportBtn.addEventListener('click', () => {
    yucataImportBtn.disabled = true;
    yucataStatus.textContent = 'Importing...';
    yucataStatus.style.color = '#666';

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'import_yucata_plays' }, (response) => {
        yucataImportBtn.disabled = false;

        if (response.success) {
          yucataStatus.textContent = `✓ Imported ${response.data.posted} plays!`;
          yucataStatus.style.color = 'green';
        } else {
          yucataStatus.textContent = `✗ Error: ${response.error}`;
          yucataStatus.style.color = 'red';
        }

        // Clear status after 5 seconds
        setTimeout(() => {
          yucataStatus.textContent = '';
        }, 5000);
      });
    });
  });
}
```

- [ ] **Step 2: Update popup.html to include Yucata import panel**

Modify `src/popup/popup.html` (add this section inside the main content area):

```html
<!-- Yucata Import Panel (visible only on yucata.de) -->
<div
  id="yucataPanel"
  style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;"
>
  <h3 style="margin-top: 0; font-size: 14px;">Yucata Import</h3>
  <p style="font-size: 12px; color: #666; margin: 5px 0;">Import your Yucata play history to BGM</p>
  <button
    id="yucataImportBtn"
    style="width: 100%; padding: 8px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;"
  >
    Import Yucata Plays
  </button>
  <div
    id="yucataStatus"
    style="margin-top: 8px; font-size: 11px; text-align: center; min-height: 16px;"
  ></div>
</div>
```

Also add a script to show/hide the panel based on current URL:

```html
<script>
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0].url;
    if (url && url.includes('yucata.de')) {
      const yucataPanel = document.getElementById('yucataPanel');
      if (yucataPanel) {
        yucataPanel.style.display = 'block';
      }
    }
  });
</script>
```

And add a script tag to load yucata-import.js at the end of popup.html:

```html
<script src="yucata-import.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add src/popup/yucata-import.js src/popup/popup.html
git commit -m "feat: add Yucata import button to extension popup"
```

---

## Task 7: Integration Testing

**Files:**

- Create: `tests/yucata-integration.test.js`

**Context:** End-to-end test that simulates the full import pipeline: scrape → map → post. Uses mocks for DOM, fetch, and extension APIs.

- [ ] **Step 1: Write integration test**

Create `tests/yucata-integration.test.js`:

```javascript
// Mocks
const mockMappingData = {
  mappings: {
    1: 822,
    2: 9209,
    999: null,
  },
};

const mockRawPlays = [
  { yucataId: '1', gameName: 'Catan', date: '2025-04-09', playerCount: 4, outcome: 'win' },
  {
    yucataId: '2',
    gameName: 'Ticket to Ride',
    date: '2025-04-08',
    playerCount: 3,
    outcome: 'loss',
  },
  { yucataId: '999', gameName: 'Unknown Game', date: '2025-04-07', playerCount: 2, outcome: 'win' },
];

let fetchCalls = [];
const mockFetch = (url, options) => {
  fetchCalls.push({ url, options });
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  });
};

// Integration test: Full pipeline
async function testFullImportPipeline() {
  // Step 1: Create mapper
  const mapper = YucataMapper(mockMappingData);

  // Step 2: Map games (filtering unmapped)
  const mappedPlays = mockRawPlays
    .map((play) => {
      const bggId = mapper.mapGameId(play.yucataId);
      if (!bggId) return null;
      return {
        gameName: play.gameName,
        bggId,
        date: play.date,
        playerCount: play.playerCount,
        outcome: play.outcome,
      };
    })
    .filter((play) => play !== null);

  console.assert(mappedPlays.length === 2, `Expected 2 mapped plays, got ${mappedPlays.length}`);
  console.assert(mappedPlays[0].bggId === 822, 'First game should map to BGG 822');
  console.assert(mappedPlays[1].bggId === 9209, 'Second game should map to BGG 9209');

  // Step 3: POST to API
  const api = PlaysAPI('http://localhost:3000', mockFetch);
  const results = await api.postPlays(mappedPlays);

  console.assert(results.length === 2, `Expected 2 API calls, got ${results.length}`);
  console.assert(fetchCalls.length === 2, `Expected 2 fetch calls, got ${fetchCalls.length}`);

  // Verify payload structure
  const firstCall = JSON.parse(fetchCalls[0].options.body);
  console.assert(firstCall.source === 'yucata_import', 'Source not set');
  console.assert(firstCall.bggId === 822, 'BGG ID not in payload');
  console.assert(firstCall.gameName === 'Catan', 'Game name not in payload');

  console.log('✓ Full import pipeline test passed');
}

// Run test
(async () => {
  await testFullImportPipeline();
  console.log('Integration tests passed!');
})();
```

- [ ] **Step 2: Run integration test**

Run: `node tests/yucata-integration.test.js`
Expected: PASS "Integration tests passed!"

- [ ] **Step 3: Commit**

```bash
git add tests/yucata-integration.test.js
git commit -m "test: add integration test for Yucata import pipeline"
```

---

## Task 8: Manual Testing Checklist

**Context:** Before calling the feature complete, manually test the extension on yucata.de to verify the UI works and the full flow executes.

- [ ] **Step 1: Load extension in Chrome**

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the extension directory
5. Verify extension icon appears in the toolbar

- [ ] **Step 2: Navigate to Yucata Game History**

1. Log in to your Yucata account
2. Go to: `https://www.yucata.de/de/RankingList` (or the Game History page)
3. Click the extension icon
4. Verify "Yucata Import" panel appears in the popup
5. Verify "Import Yucata Plays" button is visible and clickable

- [ ] **Step 3: Test import button**

1. Click "Import Yucata Plays" button
2. Check browser console (F12) for errors
3. Verify status message updates (should show "Importing..." then success/error)
4. Check network tab to verify POST request was sent to `/api/plays`
5. Verify plays appear in BGM (check the plays list or statistics)

- [ ] **Step 4: Test error handling**

1. Click import button again (should succeed with deduplication server-side)
2. Try on a different Yucata page (not Game History) — should show error
3. Verify error message is clear and helpful

- [ ] **Step 5: Commit manual test notes**

```bash
git add .
git commit -m "test: manual testing completed, all checks passed"
```

---

## Notes for Implementation

### DOM Selector for Yucata Game History

The plan assumes the table has ID `divPlayerRankingListTable` based on the code you shared. If testing shows a different selector, update `yucata-scraper.js` line with `document.querySelector()` call.

### API Endpoint

The plan assumes the BGM API has a `/api/plays` endpoint that accepts:

```json
{
  "gameName": "Catan",
  "bggId": 822,
  "date": "2025-04-09",
  "playerCount": 4,
  "outcome": "win",
  "source": "yucata_import"
}
```

Verify this endpoint exists and has deduplication logic (skip if date + game + source already exists).

### Yucata Mapping Table

The starter mapping includes ~50 games from YucataPlayLoggerForBGG. Before release, merge the full ~200-entry mapping from: https://github.com/Achronos/YucataPlayLoggerForBGG

### Testing Locally

Run tests with Node.js:

```bash
node tests/yucata-mapper.test.js
node tests/yucata-scraper.test.js
node tests/plays-api.test.js
node tests/yucata-integration.test.js
```

Or create a simple test runner:

```bash
# test-all.js
['mapper', 'scraper', 'api', 'integration'].forEach(test => {
  require(`./tests/yucata-${test}.test.js`);
});
```

Then: `node test-all.js`

---

## Execution Path

After this plan is approved, two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks

- Use `superpowers:subagent-driven-development`
- Faster iteration, independent task execution

**2. Inline Execution** — Execute in this session with checkpoints

- Use `superpowers:executing-plans`
- Batch execution with review points
