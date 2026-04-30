/* eslint-disable no-undef */
/**
 * Ludopedia Import Listener
 * Listens for import requests from the popup and runs the pipeline:
 * 1. Resolve current user's ID
 * 2. Fetch all plays via Ludopedia's API (BGG IDs come directly from the API)
 * 3. POST to BGM API via the background service worker
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'import_ludopedia_plays') {
    importLudopediaPlays()
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => {
        console.error('Ludopedia import error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

async function importLudopediaPlays() {
  const scraper = LudopediaScraper();
  const rawPlays = await scraper.extractPlays();

  if (rawPlays.length === 0) {
    throw new Error(
      'No plays found. Make sure you are logged in to Ludopedia and have recorded plays.'
    );
  }

  // Filter out plays without a BGG ID — these games have no BGM match
  const mappedPlays = [];
  let skippedNoBgg = 0;

  for (const play of rawPlays) {
    if (!play.bggId) {
      console.warn(`Ludopedia import: no BGG ID for "${play.gameName}" — skipping`);
      skippedNoBgg++;
      continue;
    }
    mappedPlays.push({
      gameName: play.gameName,
      boardgame_id: play.bggId,
      played_at: play.date,
      player_count: play.playerCount,
      outcome: play.outcome,
    });
  }

  if (mappedPlays.length === 0) {
    throw new Error(
      `None of your ${rawPlays.length} Ludopedia plays have a BGG ID. They cannot be matched to BGM games.`
    );
  }

  const response = await chrome.runtime.sendMessage({
    action: 'postPlays',
    plays: mappedPlays,
    platformSlug: 'ludopedia',
  });

  if (!response.success) throw new Error(response.error);

  const { posted, skipped } = response.results;
  return {
    scraped: rawPlays.length,
    posted: posted.length,
    skipped: skippedNoBgg + skipped.length,
  };
}
