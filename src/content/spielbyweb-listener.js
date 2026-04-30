/* eslint-disable no-undef */
/**
 * SpielByWeb Import Listener
 * Listens for import requests from the popup and runs the pipeline:
 * 1. Scrape finished game rows from the current page DOM
 * 2. Map game names to BGG IDs via the bundled mapping file
 * 3. POST to BGM API via the background service worker
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'import_spielbyweb_plays') {
    importSpielByWebPlays()
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => {
        console.error('SpielByWeb import error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

async function importSpielByWebPlays() {
  const mappingRes = await fetch(chrome.runtime.getURL('patterns/spielbyweb-mapping.json'));
  const mappingData = await mappingRes.json();
  const mappings = mappingData.mappings || {};

  const scraper = SpielByWebScraper();
  const rawPlays = scraper.extractPlays();

  if (rawPlays.length === 0) {
    throw new Error(
      'No finished games found. Make sure you are on the SpielByWeb finished-games list page.'
    );
  }

  const mappedPlays = [];
  const unmapped = new Set();

  for (const play of rawPlays) {
    // Try exact name first, then lowercased, then normalised
    const key =
      mappings[play.gameName] != null
        ? play.gameName
        : mappings[play.gameName.toLowerCase()] != null
          ? play.gameName.toLowerCase()
          : null;

    const bggId = key != null ? mappings[key] : null;

    if (!bggId) {
      unmapped.add(play.gameName);
      continue;
    }

    mappedPlays.push({
      gameName: play.gameName,
      boardgame_id: bggId,
      played_at: play.date,
      player_count: play.playerCount,
      outcome: play.outcome,
    });
  }

  if (unmapped.size > 0) {
    console.warn('SpielByWeb import: unmapped games:', [...unmapped].join(', '));
  }

  if (mappedPlays.length === 0) {
    throw new Error(
      `None of your ${rawPlays.length} SpielByWeb games could be matched to BGM games. The game mapping may need to be expanded.`
    );
  }

  const response = await chrome.runtime.sendMessage({
    action: 'postPlays',
    plays: mappedPlays,
    platformSlug: 'spielbyweb',
  });

  if (!response.success) throw new Error(response.error);

  const { posted, skipped } = response.results;
  return {
    scraped: rawPlays.length,
    posted: posted.length,
    skipped: unmapped.size + skipped.length,
  };
}
