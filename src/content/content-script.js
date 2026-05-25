// Content script for extracting games from webpages.
// Listener is only registered in the extension context (chrome.runtime exists),
// so the module can be required from Node tests without crashing.
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
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
}

// Get image URL from an img element, checking multiple attributes
function getImageUrl(img) {
  if (!img) return null;
  return img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || null;
}

// Get text content from an element, trimmed
function getText(el) {
  return el ? el.textContent.trim() : null;
}

// Extract structured game data using pattern
function extractGames(pattern) {
  if (!pattern) {
    console.error('Invalid pattern:', pattern);
    return [];
  }

  try {
    // Strategy: read product list from a Next.js __NEXT_DATA__ payload
    // (used for client-rendered apps where DOM scraping is brittle).
    if (pattern.data_source === 'next_data') {
      return extractFromNextData(pattern);
    }

    if (!pattern.selector) {
      console.error('Pattern missing selector:', pattern);
      return [];
    }

    // If card_selector is present, extract structured data per card
    if (pattern.card_selector) {
      return extractStructured(pattern);
    }

    // Legacy: flat text extraction
    console.log('Extracting with selector:', pattern.selector);
    const elements = document.querySelectorAll(pattern.selector);
    let names = Array.from(elements).map((el) => el.textContent);

    if (pattern.filters && typeof PatternMatcher !== 'undefined') {
      names = PatternMatcher.applyFilters(names, pattern.filters);
    }

    // Return as structured objects for consistency
    return names.map((name) => ({ name }));
  } catch (error) {
    console.error('Error extracting games:', error);
    return [];
  }
}

// Extract structured data from card elements
function extractStructured(pattern) {
  const cards = document.querySelectorAll(pattern.card_selector);
  console.log('Found %d cards with selector: %s', cards.length, pattern.card_selector);

  const results = [];
  const seen = new Set();

  for (const card of cards) {
    // Extract name
    const nameEl = card.querySelector(pattern.selector);
    const name = cleanName(getText(nameEl), pattern.name_cleanup);
    if (!name) continue;

    // Apply exclude filters
    if (pattern.filters && pattern.filters.exclude) {
      let excluded = false;
      for (const pat of pattern.filters.exclude) {
        if (new RegExp(pat).test(name)) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;
    }

    // Deduplicate
    if (pattern.filters && pattern.filters.deduplicate !== false) {
      if (seen.has(name)) continue;
      seen.add(name);
    }

    // Extract image
    const imgEl = pattern.image_selector ? card.querySelector(pattern.image_selector) : null;
    const image = getImageUrl(imgEl);

    // Extract price (current/sale price)
    const priceEl = pattern.price_selector ? card.querySelector(pattern.price_selector) : null;
    const price = cleanName(getText(priceEl), pattern.price_cleanup);

    // Extract original/struck-through price
    const salePriceEl = pattern.sale_price_selector
      ? card.querySelector(pattern.sale_price_selector)
      : null;
    const sale_price = getText(salePriceEl);

    // Extract BGG ID from a BGG link href for unambiguous catalog matching.
    // Fall back to document scope — on product pages the BGG link may sit
    // outside the card container (e.g. ludiprix ul.actions outside #main).
    let bgg_id = null;
    if (pattern.bgg_id_selector) {
      const bggEl =
        card.querySelector(pattern.bgg_id_selector) ||
        document.querySelector(pattern.bgg_id_selector);
      if (bggEl) {
        const href = bggEl.href || bggEl.getAttribute('href') || '';
        const m = href.match(/\/boardgame\/(\d+)/);
        if (m) bgg_id = parseInt(m[1], 10);
      }
    }

    results.push({
      name,
      image: image || null,
      price: price || null,
      sale_price: sale_price || null,
      bgg_id: bgg_id || null,
    });
  }

  console.log('Extracted %d structured games', results.length);
  return results;
}

// Read a value from a nested object via a dot path. Supports array indexing
// like "medias[0].url". Returns undefined if any segment is missing.
function getByPath(obj, path) {
  if (!path || obj == null) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    const m = part.match(/^([^[\]]+)((?:\[\d+\])*)$/);
    if (!m) return undefined;
    const key = m[1];
    cur = cur == null ? undefined : cur[key];
    if (m[2]) {
      const indexes = m[2].match(/\d+/g) || [];
      for (const idx of indexes) {
        if (!Array.isArray(cur)) return undefined;
        cur = cur[parseInt(idx, 10)];
      }
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

// Format a price value with optional currency symbol.
function formatPrice(value, currency) {
  if (value == null || value === '') return null;
  return currency ? `${value} ${currency}` : String(value);
}

// Apply optional name cleanup rules from pattern.next_data.name_cleanup.
// Only used to strip stable, language-agnostic noise (e.g. trailing
// "1000 pièces - dès 12 ans" descriptors). Keep it conservative — over-
// stripping turns "Catan: Cities & Knights" into "Catan".
function cleanName(name, cleanup) {
  if (!cleanup || typeof name !== 'string') return name;
  let cleaned = name;
  if (cleanup.strip_prefix_pattern) {
    cleaned = cleaned.replace(new RegExp(cleanup.strip_prefix_pattern), '');
  }
  if (cleanup.strip_suffix_pattern) {
    cleaned = cleaned.replace(new RegExp(cleanup.strip_suffix_pattern), '');
  }
  return cleaned.trim();
}

// Extract games from a Next.js __NEXT_DATA__ payload.
// pattern.next_data describes:
//   items_path: dot path to the array of items (e.g. "props.initialState.CatalogItems.result.items")
//   fields: { name, price, sale_price, currency, image } — each a dot path inside an item
//   name_cleanup: optional { strip_prefix_pattern, strip_suffix_pattern }
function extractFromNextData(pattern) {
  const cfg = pattern.next_data;
  if (!cfg || !cfg.items_path) {
    console.error('Pattern data_source=next_data requires next_data.items_path');
    return [];
  }

  const script = document.getElementById('__NEXT_DATA__');
  if (!script) {
    console.warn('__NEXT_DATA__ script tag not found');
    return [];
  }

  let data;
  try {
    data = JSON.parse(script.textContent || '');
  } catch (e) {
    console.error('Failed to parse __NEXT_DATA__:', e);
    return [];
  }

  const itemsPaths = Array.isArray(cfg.items_path) ? cfg.items_path : [cfg.items_path];
  const fields = cfg.fields || {};
  const filters = pattern.filters || {};
  const seen = new Set();
  const results = [];

  for (const itemsPath of itemsPaths) {
    const items = getByPath(data, itemsPath);
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      const rawName = fields.name ? getByPath(item, fields.name) : null;
      if (!rawName || typeof rawName !== 'string') continue;

      const name = cleanName(rawName, cfg.name_cleanup);
      if (!name) continue;

      // Apply exclude filters (regex against cleaned name)
      if (filters.exclude) {
        let excluded = false;
        for (const pat of filters.exclude) {
          if (new RegExp(pat).test(name)) {
            excluded = true;
            break;
          }
        }
        if (excluded) continue;
      }

      // Deduplicate by cleaned name
      if (filters.deduplicate !== false) {
        if (seen.has(name)) continue;
        seen.add(name);
      }

      const price = fields.price
        ? formatPrice(
            getByPath(item, fields.price),
            fields.currency ? getByPath(item, fields.currency) : null
          )
        : null;
      const sale_price = fields.sale_price
        ? formatPrice(
            getByPath(item, fields.sale_price),
            fields.currency ? getByPath(item, fields.currency) : null
          )
        : null;
      const image = fields.image ? getByPath(item, fields.image) : null;

      results.push({
        name,
        image: image || null,
        price: price || null,
        sale_price: sale_price || null,
      });
    }
  }

  console.log('Extracted %d games from __NEXT_DATA__', results.length);
  return results;
}

// Export for Node.js/Jest tests (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractGames,
    extractFromNextData,
    getByPath,
    formatPrice,
    cleanName,
  };
}
