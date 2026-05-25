import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson, pinActiveTab } from './helpers/routes.js';

// Force the review panel to appear by making the extract API return 500,
// so auto-extract fails and the popup falls through to the review panel.
// Preview returns 4 new + 1 known (mirrors the knapix fixture's 5 games).

const KNAPIX_URL = 'https://www.knapix.com/2025/11/top-jeux';

const PREVIEW_MIXED = {
  games: [
    { name: 'Catan', status: 'new', bgm_name: 'Catan' },
    { name: 'Ticket to Ride', status: 'new', bgm_name: 'Ticket to Ride' },
    { name: 'Azul', status: 'known', bgm_name: 'Azul' },
    { name: 'Wingspan', status: 'new', bgm_name: 'Wingspan' },
    { name: 'Everdell', status: 'new', bgm_name: 'Everdell' },
  ],
};

test.beforeEach(async ({ context }) => {
  await serveFixture(context, 'https://www.knapix.com/**', 'shops/knapix.html');
  await mockJson(context, 'https://boardgamematcher.com/api/me', {}, 401);
  await mockJson(context, 'https://boardgamematcher.com/api/extract/preview', PREVIEW_MIXED);
  // 500 on extract forces fallback to review panel
  await mockJson(context, 'https://boardgamematcher.com/api/extract/extension', {}, 500);
});

async function openReviewPanel(context, extensionId) {
  const knapix = await context.newPage();
  await knapix.goto(KNAPIX_URL);

  const popup = await context.newPage();
  await pinActiveTab(popup, KNAPIX_URL);
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await expect(popup.locator('#ctx-shop-name')).toHaveText(/Knapix/, { timeout: 5000 });
  await popup.click('#extract-btn');
  await expect(popup.locator('#card-review')).toBeVisible({ timeout: 5000 });
  return popup;
}

test("'Select All' checks all games", async ({ context, extensionId }) => {
  const popup = await openReviewPanel(context, extensionId);

  await popup.click('#review-select-all');

  const checkboxes = popup.locator('.review-game-cb');
  const checkedBoxes = popup.locator('.review-game-cb:checked');
  await expect(checkboxes).toHaveCount(5);
  await expect(checkedBoxes).toHaveCount(5);
});

test("'None' unchecks all games", async ({ context, extensionId }) => {
  const popup = await openReviewPanel(context, extensionId);

  await popup.click('#review-deselect-all');

  await expect(popup.locator('.review-game-cb:checked')).toHaveCount(0);
});

test("'New only' checks only new-status games", async ({ context, extensionId }) => {
  const popup = await openReviewPanel(context, extensionId);

  // First select all, then switch to new-only to verify it unchecks known games
  await popup.click('#review-select-all');
  await popup.click('#review-select-new');

  // 4 new + 1 known → only 4 should be checked
  await expect(popup.locator('.review-game-cb:checked')).toHaveCount(4);
  // The known-status row's checkbox must be unchecked
  await expect(
    popup.locator('.review-game-row[data-status="known"] .review-game-cb')
  ).not.toBeChecked();
});

test('confirm button disabled when nothing checked', async ({ context, extensionId }) => {
  const popup = await openReviewPanel(context, extensionId);

  await popup.click('#review-deselect-all');

  await expect(popup.locator('#review-confirm')).toBeDisabled();
});

test('back button cancels review and returns to extract tab', async ({ context, extensionId }) => {
  const popup = await openReviewPanel(context, extensionId);

  await popup.click('#review-back');

  await expect(popup.locator('#card-review')).not.toBeVisible();
  await expect(popup.locator('#tab-panes')).toBeVisible();
});
