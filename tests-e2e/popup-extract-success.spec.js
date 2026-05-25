import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson, pinActiveTab } from './helpers/routes.js';

// Tests for the success card reached via the review-panel confirm path.
// Strategy: first call to /api/extract/extension returns 500 (forces review panel),
// second call (from confirmExtract) returns a valid job_id (shows success card).

const KNAPIX_URL = 'https://www.knapix.com/2025/11/top-jeux';

const PREVIEW_WITH_NEW = {
  games: [
    { name: 'Catan', status: 'new', bgm_name: 'Catan' },
    { name: 'Ticket to Ride', status: 'new', bgm_name: 'Ticket to Ride' },
    { name: 'Azul', status: 'known', bgm_name: 'Azul' },
    { name: 'Wingspan', status: 'new', bgm_name: 'Wingspan' },
    { name: 'Everdell', status: 'new', bgm_name: 'Everdell' },
  ],
};

async function openReviewPanelWithSucceedingConfirm(context, extensionId) {
  await serveFixture(context, 'https://www.knapix.com/**', 'shops/knapix.html');
  await mockJson(context, 'https://boardgamematcher.com/api/me', {}, 401);
  await mockJson(context, 'https://boardgamematcher.com/api/extract/preview', PREVIEW_WITH_NEW);

  // First call (auto-extract): 500 → falls back to review panel.
  // Second call (confirmExtract): 200 with job_id → success card.
  let callCount = 0;
  await context.route('https://boardgamematcher.com/api/extract/extension', async (route) => {
    callCount += 1;
    if (callCount === 1) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job_id: 'job_success_456' }),
      });
    }
  });

  const knapix = await context.newPage();
  await knapix.goto(KNAPIX_URL);

  const popup = await context.newPage();
  await pinActiveTab(popup, KNAPIX_URL);
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await expect(popup.locator('#ctx-shop-name')).toHaveText(/Knapix/, { timeout: 5000 });
  await popup.click('#extract-btn');
  await expect(popup.locator('#card-review')).toBeVisible({ timeout: 5000 });

  // Confirm with all checked (4 new are pre-checked, 1 known is not)
  await expect(popup.locator('#review-confirm')).toBeEnabled();
  await popup.click('#review-confirm');

  return popup;
}

test("success message shows 'X games matched'", async ({ context, extensionId }) => {
  const popup = await openReviewPanelWithSucceedingConfirm(context, extensionId);

  await expect(popup.locator('#card-success')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#success-msg')).toContainText(/matched/i);
});

test("'Extract again' returns to extract view", async ({ context, extensionId }) => {
  const popup = await openReviewPanelWithSucceedingConfirm(context, extensionId);

  await expect(popup.locator('#card-success')).toBeVisible({ timeout: 5000 });
  await popup.click('#success-extract-again');

  await expect(popup.locator('#card-success')).not.toBeVisible();
  await expect(popup.locator('#tab-panes')).toBeVisible();
});
