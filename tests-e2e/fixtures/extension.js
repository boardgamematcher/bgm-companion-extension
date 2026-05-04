import { test as base, chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(__dirname, '..', '..');

export const test = base.extend({
  context: async ({}, use) => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bgm-pw-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    await use(context);
    await context.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  },

  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const id = worker.url().split('/')[2];
    await use(id);
  },
});

export const expect = test.expect;
