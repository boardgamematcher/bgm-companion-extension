# Board Game Extractor Browser Extension - Design Document

**Date:** 2025-11-28
**Status:** Approved

## Overview

A cross-browser extension (Chrome & Firefox) that extracts board game names from supported websites using configurable CSS selector patterns. Users can extract games with one click, copy them to clipboard, and eventually redirect to a companion website.

## Goals

1. Extract board game names from multiple websites (knapix.com, amazon, philibert, etc.)
2. Support both built-in curated patterns and user-customizable patterns
3. Allow users to suggest new site patterns via email
4. Provide a clean, informative UI showing site support status
5. Work on both Chrome and Firefox with minimal code differences

## Architecture

### Core Components

**Background Service Worker**

- Manages pattern loading and caching
- Handles clipboard write operations
- Coordinates messages between popup and content scripts
- Maintains extraction statistics

**Content Scripts**

- Injected into webpages to perform DOM extraction
- Executes CSS selectors based on matched patterns
- Applies text filters (exclude/include regex, trimming, deduplication)
- Returns extracted game names to background worker

**Popup UI (Browser Action)**

- Mini dashboard showing current site support status
- Primary "Extract Board Games" button
- Last extraction statistics
- Quick links to settings and site suggestions

**Options Page**

- Full settings interface with tabs
- View built-in patterns (read-only)
- Manage custom user patterns (add/edit/delete)
- Import/export pattern configurations
- Help documentation and pattern syntax guide

### Technical Stack

- **Manifest V3**: Future-proof WebExtensions API
- **Vanilla JavaScript**: No build step required initially
- **Chrome Storage API**: For user patterns and stats
- **No backend**: Client-side only (clipboard + mailto)

## Pattern Matching System

### Pattern Structure

Each site pattern is defined as:

```json
{
  "domain": "knapix.com",
  "name": "Knapix",
  "selector": "h3",
  "filters": {
    "exclude": ["^Advertisement", "^Sponsored"],
    "include": null,
    "trim": true,
    "deduplicate": true
  }
}
```

### Two-Tier Configuration

**Built-in Patterns** (`patterns/built-in.json`)

- Shipped with extension
- Curated and tested site patterns
- Updated via extension releases

**User Custom Patterns** (browser local storage)

- User-added patterns for unsupported sites
- Override built-in patterns by domain
- Stored in `chrome.storage.local`

### Pattern Matching Logic

1. Content script checks current page domain against all patterns
2. Finds exact or subdomain match
3. Executes CSS selector: `document.querySelectorAll(pattern.selector)`
4. Applies filters in order:
   - Extract text content from elements
   - Apply `exclude` regex patterns (remove matches)
   - Apply `include` regex patterns (keep only matches)
   - Trim whitespace if enabled
   - Remove duplicates if enabled
5. Return array of board game names

### Filter Capabilities

- **exclude**: Array of regex patterns to filter out unwanted text
- **include**: Optional array of regex patterns (only keep matches)
- **trim**: Boolean, remove leading/trailing whitespace
- **deduplicate**: Boolean, remove duplicate names

## User Interface Design

### Popup Mini Dashboard

**Layout:**

```
┌─────────────────────────────┐
│  Board Game Extractor       │
├─────────────────────────────┤
│  ✓ Supported Site: Knapix   │
│                             │
│  [Extract Board Games]      │
│                             │
│  Last: 12 games extracted   │
│                             │
│  [Suggest a Site] [Settings]│
│  v1.0.0                     │
└─────────────────────────────┘
```

**States:**

- Supported site: Green badge, button enabled
- Unsupported site: Gray badge, button disabled
- No extractions yet: "No extractions yet" message

### Options/Settings Page

**Tab Structure:**

1. **Supported Sites Tab**
   - List of built-in patterns (read-only)
   - Shows domain, name, and selector for each
   - Searchable/filterable list

2. **Custom Patterns Tab**
   - List of user-added patterns
   - Edit/delete buttons for each
   - "Add New Pattern" button → form modal
   - Import/Export JSON buttons

3. **Help Tab**
   - How to use the extension
   - Pattern syntax documentation
   - CSS selector guide
   - Link to GitHub repository

**Add/Edit Pattern Form:**

- Domain input (e.g., "example.com")
- Display name input
- CSS selector input
- Optional filters section (exclude/include patterns)
- Test button (validates selector on current tab if domain matches)

## Data Flow

### Extension Initialization

1. Extension installed/loaded
2. Background worker loads `patterns/built-in.json`
3. Load user patterns from `chrome.storage.local`
4. Merge patterns (user patterns override by domain)
5. Cache merged patterns in memory

### Site Detection Flow

```
User navigates → Content script checks domain
                        ↓
              Background worker: pattern match?
                        ↓
              Popup updates status badge
```

### Extraction Flow

```
User clicks Extract → Popup → Content script
                                    ↓
                          Execute selector + filters
                                    ↓
                          Return game names array
                                    ↓
                          Background → clipboard
                                    ↓
                          Update stats → notification
```

### Custom Pattern Management

```
User adds pattern → Options page → chrome.storage.local
                                          ↓
                                Background reloads cache
                                          ↓
                                Pattern available immediately
```

## File Structure

```
bgm-extension/
├── manifest.json                 # Extension manifest (V3)
├── src/
│   ├── background/
│   │   └── service-worker.js    # Background service worker
│   ├── content/
│   │   └── content-script.js    # DOM extraction logic
│   ├── popup/
│   │   ├── popup.html           # Mini dashboard
│   │   ├── popup.js             # Popup controller
│   │   └── popup.css            # Popup styles
│   ├── options/
│   │   ├── options.html         # Settings page
│   │   ├── options.js           # Settings controller
│   │   └── options.css          # Settings styles
│   └── lib/
│       ├── pattern-matcher.js   # Core matching logic (shared)
│       └── storage.js           # Storage helpers
├── patterns/
│   └── built-in.json            # Curated site patterns
├── icons/
│   ├── icon16.png               # Extension icons
│   ├── icon48.png
│   └── icon128.png
├── docs/
│   └── plans/
│       └── 2025-11-28-boardgame-extractor-design.md
└── README.md
```

## Key Implementation Details

### Manifest V3 Configuration

```json
{
  "manifest_version": 3,
  "name": "Board Game Extractor",
  "version": "1.0.0",
  "permissions": ["activeTab", "clipboardWrite", "storage"],
  "background": {
    "service_worker": "src/background/service-worker.js"
  },
  "action": {
    "default_popup": "src/popup/popup.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/content-script.js"]
    }
  ],
  "options_page": "src/options/options.html"
}
```

### Message Passing

**Check Site Support:**

```javascript
// Popup → Background
{ action: "checkSiteSupport", domain: "knapix.com" }
// Response
{ supported: true, pattern: {...} }
```

**Extract Games:**

```javascript
// Popup → Content Script
{ action: "extractGames", pattern: {...} }
// Response
{ success: true, games: ["Game 1", "Game 2", ...] }
```

**Pattern Update:**

```javascript
// Options → Background
{
  action: 'reloadPatterns';
}
```

### Storage Schema

**chrome.storage.local:**

```json
{
  "customPatterns": [
    { "domain": "...", "name": "...", "selector": "...", "filters": {...} }
  ],
  "stats": {
    "lastExtraction": {
      "domain": "knapix.com",
      "count": 12,
      "timestamp": 1732800000000
    }
  }
}
```

## Future Enhancements

### Phase 2 (Website Redirect)

- Add "Redirect to website" option
- POST extracted games to companion website
- User preference for clipboard vs redirect

### Phase 3 (Advanced Features)

- Remote pattern updates (auto-fetch new patterns)
- Pattern testing playground
- Export extracted games to various formats
- Browser sync for custom patterns

### Phase 4 (Community Features)

- Public pattern repository
- In-extension pattern browsing/installation
- Pattern rating/voting system
- Automatic pattern suggestions based on page structure

## Testing Strategy

### Manual Testing Checklist

- [ ] Extension loads in Chrome
- [ ] Extension loads in Firefox
- [ ] Popup shows correct status on supported sites
- [ ] Popup shows correct status on unsupported sites
- [ ] Extract button copies games to clipboard
- [ ] Custom pattern add/edit/delete works
- [ ] Pattern import/export works
- [ ] Suggest a site opens mailto correctly
- [ ] Last extraction stats update correctly

### Initial Test Sites

- knapix.com (h3 tags)
- amazon.com (product titles)
- philibert.net (game names)

### Edge Cases

- Page with no matching elements
- Very large extractions (1000+ games)
- Duplicate game names
- Special characters in game names
- Dynamic content (AJAX-loaded games)

## Success Criteria

1. Successfully extracts games from 3+ initial sites
2. User can add custom pattern and extract immediately
3. Clean, intuitive UI that clearly shows site support
4. Works on both Chrome and Firefox without code changes
5. Pattern suggestion process is obvious and easy

## Open Questions

None - design validated through collaborative discussion.

## References

- WebExtensions API: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions
- Manifest V3: https://developer.chrome.com/docs/extensions/mv3/
- Chrome Storage API: https://developer.chrome.com/docs/extensions/reference/storage/
