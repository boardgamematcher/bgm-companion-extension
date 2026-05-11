import { test, expect } from './fixtures/extension.js';
import { mockJson } from './helpers/routes.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(__dirname, '../manifest.json'), 'utf-8'));

test.beforeEach(async ({ context }) => {
  await mockJson(context, 'https://boardgamematcher.com/api/me', {}, 401);
});

async function openMoreTab(context, extensionId) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await popup.click('#bn-more');
  await expect(popup.locator('#tab-more')).toBeVisible({ timeout: 5000 });
  return popup;
}

test('all main sections and links render', async ({ context, extensionId }) => {
  const popup = await openMoreTab(context, extensionId);

  // "Get More Out of BGM" section
  await expect(popup.locator('#more-import-plays-btn')).toBeVisible();

  // "Help" section links
  await expect(popup.locator('#more-feedback-btn')).toBeVisible();
  await expect(popup.locator('#settings-more-btn')).toBeVisible();
  await expect(popup.locator('#more-privacy-btn')).toBeVisible();
});

test('version number matches manifest.json', async ({ context, extensionId }) => {
  const popup = await openMoreTab(context, extensionId);

  // Find the element that displays the version string
  const versionEl = popup
    .locator('[id*="version"], [class*="version"], [data-i18n*="version"]')
    .first();
  // If no dedicated element, check the whole tab text
  const tabText = await popup.locator('#tab-more').textContent();
  expect(tabText).toContain(manifest.version);
});

test('settings button opens options page', async ({ context, extensionId }) => {
  const popup = await openMoreTab(context, extensionId);

  const [newPage] = await Promise.all([
    context.waitForEvent('page'),
    popup.locator('#settings-more-btn').click(),
  ]);
  await newPage.waitForLoadState('domcontentloaded');
  expect(newPage.url()).toContain('options.html');
});
