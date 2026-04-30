/* eslint-disable no-undef */
/**
 * Tabletopia Import Listener
 * Listens for import requests from the popup and runs the pipeline:
 * 1. Fetch match history from Tabletopia's API
 * 2. Map game slugs to BGG IDs via the bundled mapping file
 * 3. POST to BGM API via the background service worker
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'import_tabletopia_plays') {
    importTabletopiaPlays()
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => {
        console.error('Tabletopia import error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

async function importTabletopiaPlays() {
  const mappingRes = await fetch(chrome.runtime.getURL('patterns/tabletopia-mapping.json'));
  const mappingData = await mappingRes.json();
  const mappings = mappingData.mappings || {};

  const scraper = TabletopiasScraper();
  const rawPlays = await scraper.extractPlays();

  if (rawPlays.length === 0) {
    throw new Error(
      'No finished matches found. Make sure you are logged in to Tabletopia and have played games.'
    );
  }

  const mappedPlays = [];
  const unmapped = new Set();

  for (const play of rawPlays) {
    const bggId = mappings[play.gameSlug] || mappings[play.gameName.toLowerCase()];
    if (!bggId) {
      unmapped.add(`${play.gameName} (${play.gameSlug})`);
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
    console.warn('Tabletopia import: unmapped games:', [...unmapped].join(', '));
  }

  if (mappedPlays.length === 0) {
    throw new Error(
      `None of your ${rawPlays.length} Tabletopia plays could be matched to BGM games. The game mapping may need to be expanded.`
    );
  }

  const response = await chrome.runtime.sendMessage({
    action: 'postPlays',
    plays: mappedPlays,
    platformSlug: 'tabletopia',
  });

  if (!response.success) throw new Error(response.error);

  const { posted, skipped } = response.results;
  return {
    scraped: rawPlays.length,
    posted: posted.length,
    skipped: unmapped.size + skipped.length,
  };
}
