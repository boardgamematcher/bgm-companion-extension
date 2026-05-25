import { test, expect } from './fixtures/extension.js';
import { mockJson } from './helpers/routes.js';

test('extension loads with MV3 service worker and no console errors', async ({
  context,
  extensionId,
}) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);

  const [worker] = context.serviceWorkers();
  expect(worker).toBeTruthy();
  expect(worker.url()).toContain(extensionId);
  expect(worker.url()).toMatch(/service-worker\.js$/);

  // Mock all BGM API calls so CI never hits the real server (avoids 403s from
  // rate-limiting or IP blocks that show up as console errors).
  await mockJson(context, 'https://boardgamematcher.com/api/me', {}, 401);
  await mockJson(context, 'https://boardgamematcher.com/api/**', {});

  const errors = [];
  context.on('weberror', (e) => errors.push(e.error().message));

  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await page.waitForLoadState('domcontentloaded');

  expect(errors, `unexpected console errors: ${errors.join('\n')}`).toEqual([]);
});
