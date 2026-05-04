import { test, expect } from './fixtures/extension.js';

test('extension loads with MV3 service worker and no console errors', async ({
  context,
  extensionId,
}) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);

  const [worker] = context.serviceWorkers();
  expect(worker).toBeTruthy();
  expect(worker.url()).toContain(extensionId);
  expect(worker.url()).toMatch(/service-worker\.js$/);

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
