/* eslint-disable no-undef */
/**
 * BGG Import Listener
 * Listens for import requests from the popup and executes the pipeline:
 * 1. Detect logged-in BGG username from the current page
 * 2. Fetch all plays via the BGG XML2 API (same-origin, credentials included)
 * 3. Post to BGM via the service worker
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'import_bgg_plays') {
    importBGGPlays()
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => {
        console.error('BGG import error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

async function importBGGPlays() {
  const scraper = BGGScraper();

  // Step 1: Detect username
  const username = scraper.getUsername();
  if (!username) {
    throw new Error(
      'Could not detect your BGG username. Navigate to boardgamegeek.com/user/YOUR_USERNAME and try again.'
    );
  }

  // Step 2: Fetch all plays (XML2 API, same-origin, session cookie included)
  const plays = await scraper.extractPlays(username, (fetched, total) => {
    chrome.runtime
      .sendMessage({ action: 'playsImportProgress', current: fetched, total })
      .catch(() => {});
  });

  if (plays.length === 0) {
    throw new Error('No plays recorded on this BGG account yet.');
  }

  // Step 3: Build payload — BGG IDs are native so no mapping file needed
  const mappedPlays = plays.map((play) => ({
    gameName: play.gameName,
    boardgame_id: play.bggId,
    played_at: play.date,
    player_count: play.playerCount,
    outcome: play.outcome,
  }));

  // Step 4: POST to BGM via service worker
  const response = await chrome.runtime.sendMessage({
    action: 'postPlays',
    plays: mappedPlays,
    platformSlug: 'boardgamegeek',
  });

  if (!response.success) {
    throw new Error(response.error);
  }

  const { posted, skipped, duplicates } = response.results;

  return {
    scraped: plays.length,
    posted: posted.length,
    skipped: skipped.length,
    duplicates,
  };
}
