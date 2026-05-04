import { test, expect } from './fixtures/extension.js';
import fs from 'node:fs/promises';

test.describe('options page — custom patterns CRUD', () => {
  // Custom Patterns is gated behind the Developer mode flag. Seed it via the
  // extension's service worker so the tab is reachable in every test.
  test.beforeEach(async ({ context }) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await worker.evaluate(() => chrome.storage.local.set({ bgmDevMode: true }));
  });

  test('create / edit / delete / export-import roundtrip', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);

    // Switch to Custom Patterns tab
    await page.click('button[data-tab="custom"]');
    await expect(page.locator('#custom-tab')).toHaveClass(/active/);
    await expect(page.locator('#custom-empty')).toBeVisible();

    // ── Create ──
    await page.click('#add-pattern-btn');
    await expect(page.locator('#pattern-modal')).not.toHaveClass(/hidden/);
    await page.fill('#domain-input', 'test.com');
    await page.fill('#name-input', 'Test Site');
    await page.fill('#selector-input', 'h1');
    await page.click('#pattern-form button[type="submit"]');
    await expect(page.locator('#pattern-modal')).toHaveClass(/hidden/);
    await expect(page.locator('#custom-list .pattern-card')).toHaveCount(1);
    await expect(page.locator('#custom-list .pattern-card h3')).toHaveText('Test Site');

    // ── Edit ──
    await page.click('#custom-list .pattern-card .icon-btn:not(.delete)');
    await expect(page.locator('#pattern-modal')).not.toHaveClass(/hidden/);
    await expect(page.locator('#name-input')).toHaveValue('Test Site');
    await page.fill('#name-input', 'Renamed Site');
    await page.click('#pattern-form button[type="submit"]');
    await expect(page.locator('#custom-list .pattern-card h3')).toHaveText('Renamed Site');
    await expect(page.locator('#custom-list .pattern-card')).toHaveCount(1);

    // ── Export → capture downloaded JSON ──
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-btn');
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const exportedJson = await fs.readFile(downloadPath, 'utf-8');
    const exported = JSON.parse(exportedJson);
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({ domain: 'test.com', name: 'Renamed Site', selector: 'h1' });

    // ── Delete (via native confirm) ──
    page.once('dialog', (d) => d.accept());
    await page.click('#custom-list .pattern-card .icon-btn.delete');
    await expect(page.locator('#custom-list .pattern-card')).toHaveCount(0);
    await expect(page.locator('#custom-empty')).toBeVisible();

    // ── Import the previously exported JSON ──
    page.once('dialog', (d) => d.accept()); // import-success alert
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#import-btn');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(downloadPath);

    await expect(page.locator('#custom-list .pattern-card')).toHaveCount(1);
    await expect(page.locator('#custom-list .pattern-card h3')).toHaveText('Renamed Site');
  });

  test('cancelling the delete confirm keeps the pattern', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await page.click('button[data-tab="custom"]');

    await page.click('#add-pattern-btn');
    await page.fill('#domain-input', 'keep.example');
    await page.fill('#name-input', 'Keep Me');
    await page.fill('#selector-input', '.x');
    await page.click('#pattern-form button[type="submit"]');
    await expect(page.locator('#custom-list .pattern-card')).toHaveCount(1);

    page.once('dialog', (d) => d.dismiss());
    await page.click('#custom-list .pattern-card .icon-btn.delete');
    await expect(page.locator('#custom-list .pattern-card')).toHaveCount(1);
  });
});

test.describe('options page — developer mode gating', () => {
  test('Custom Patterns tab is hidden by default and revealed by the toggle', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);

    const customTabBtn = page.locator('button[data-tab="custom"]');
    await expect(customTabBtn).toBeHidden();

    await page.click('button[data-tab="help"]');
    await page.check('#dev-mode-toggle');
    await expect(customTabBtn).toBeVisible();

    await page.uncheck('#dev-mode-toggle');
    await expect(customTabBtn).toBeHidden();
  });
});
