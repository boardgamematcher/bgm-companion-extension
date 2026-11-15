import { test, expect } from './fixtures/extension.js';
import { mockJson } from './helpers/routes.js';

const PROFILES_URL =
  /raw\.githubusercontent\.com\/boardgamematcher\/site-profiles\/main\/profiles\.json/;

test('refresh shop profiles fetches a fresh copy and reports success', async ({
  context,
  extensionId,
}) => {
  const requested = [];
  await mockJson(context, PROFILES_URL, (request) => {
    requested.push(request.url());
    return {
      version: 1,
      profiles: [
        {
          name: 'Refresh Test Shop',
          domain: 'refresh-test.example',
          url_pattern: '.*',
          selector: 'h1',
        },
      ],
    };
  });

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  await page.click('button[data-tab="notifications"]');

  await page.click('#refresh-profiles-btn');
  await expect(page.locator('#refresh-profiles-status')).toHaveText(/up to date/i, {
    timeout: 8000,
  });

  // A manual refresh bypasses GitHub's edge cache with a cache-busting query
  expect(requested.some((u) => /profiles\.json\?t=\d+/.test(u))).toBe(true);

  // …and the new profile is live in the service worker
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const found = await worker.evaluate(
    () => findPatternForDomain('refresh-test.example', 'https://refresh-test.example/')?.name
  );
  expect(found).toBe('Refresh Test Shop');
});

test('refresh reports failure when GitHub is unreachable and keeps working', async ({
  context,
  extensionId,
}) => {
  await context.route(PROFILES_URL, (route) => route.abort());

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  await page.click('button[data-tab="notifications"]');

  await page.click('#refresh-profiles-btn');
  await expect(page.locator('#refresh-profiles-status')).toHaveText(/could not reach github/i, {
    timeout: 8000,
  });
  await expect(page.locator('#refresh-profiles-btn')).toBeEnabled();
});
