import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson, pinActiveTab } from './helpers/routes.js';

test('Knapix happy path: extract → review → confirm → success', async ({
  context,
  extensionId,
}) => {
  await serveFixture(context, 'https://www.knapix.com/**', 'shops/knapix.html');

  await mockJson(context, 'https://boardgamematcher.com/api/extract/preview', {
    games: [
      { name: 'Catan', status: 'new', bgm_name: 'Catan' },
      { name: 'Ticket to Ride', status: 'new', bgm_name: 'Ticket to Ride' },
      { name: 'Azul', status: 'owned', bgm_name: 'Azul' },
      { name: 'Wingspan', status: 'new', bgm_name: 'Wingspan' },
      { name: 'Everdell', status: 'new', bgm_name: 'Everdell' },
    ],
  });

  await mockJson(context, 'https://boardgamematcher.com/api/extract/extension', {
    job_id: 'job_test_123',
  });

  // Mock unrelated BGM endpoints the popup may poll on load to keep CI offline.
  await mockJson(context, 'https://boardgamematcher.com/api/auth/me', { user: null }, 401);

  const knapix = await context.newPage();
  await knapix.goto('https://www.knapix.com/2025/11/top-jeux');
  await expect(knapix.locator('h3').first()).toHaveText('Catan');

  const popup = await context.newPage();
  await pinActiveTab(popup, 'https://www.knapix.com/2025/11/top-jeux');
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await expect(popup.locator('#ctx-shop-name')).toHaveText(/Knapix/, { timeout: 5000 });
  await expect(popup.locator('#extract-btn')).toBeEnabled();

  await popup.click('#extract-btn');

  // Review panel appears with all 5 extracted games
  await expect(popup.locator('#card-review')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('.review-game-row')).toHaveCount(5);

  // 4 are 'new' (auto-checked); 1 is 'owned' (unchecked). Confirm enabled.
  await expect(popup.locator('.review-game-cb:checked')).toHaveCount(4);
  await expect(popup.locator('#review-confirm')).toBeEnabled();

  await popup.click('#review-confirm');

  await expect(popup.locator('#card-success')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#success-msg')).toHaveText(/4.*BGM/);
});
