#!/usr/bin/env node
/**
 * Opens a headed Chromium with the BGM extension loaded and a test URL.
 * Auto-pins the extension to the toolbar on first run (no manual step needed).
 *
 * Usage:
 *   npm run test:browser
 *   npm run test:browser -- https://ludiprix.fr/item/show/55129/hamlet
 */

import { chromium } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const EXT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_DIR = path.join(os.homedir(), '.bgm-dev-profile');
const PREFS_PATH = path.join(PROFILE_DIR, 'Default', 'Preferences');
const DEFAULT_URL = process.argv[2] || 'https://ludiprix.fr/item/show/55129/hamlet';

const LAUNCH_OPTS = {
  headless: false,
  channel: 'chromium',
  args: [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
};

async function getExtensionId(context) {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  return sw.url().split('/')[2];
}

async function ensurePinned(extId) {
  let prefs = {};
  try {
    prefs = JSON.parse(await fs.readFile(PREFS_PATH, 'utf-8'));
  } catch {
    // Preferences file may not exist yet — Chrome will create it on first launch.
    return false;
  }
  const pinned = prefs?.extensions?.pinned_extensions ?? [];
  return pinned.includes(extId);
}

async function writePin(extId) {
  let prefs = {};
  try {
    prefs = JSON.parse(await fs.readFile(PREFS_PATH, 'utf-8'));
  } catch {}
  prefs.extensions ??= {};
  const pinned = prefs.extensions.pinned_extensions ?? [];
  if (!pinned.includes(extId)) {
    prefs.extensions.pinned_extensions = [...pinned, extId];
    await fs.writeFile(PREFS_PATH, JSON.stringify(prefs));
  }
}

// ── First pass: get extension ID and pin it if needed ──────────────────────
const probe = await chromium.launchPersistentContext(PROFILE_DIR, LAUNCH_OPTS);
const extId = await getExtensionId(probe);
const alreadyPinned = await ensurePinned(extId);
await probe.close();

// Chrome writes its own Preferences on exit — write our pin AFTER it closes.
if (!alreadyPinned) {
  await writePin(extId);
  console.log(`Extension ${extId} pinned.`);
}

// ── Real launch ─────────────────────────────────────────────────────────────
const context = await chromium.launchPersistentContext(PROFILE_DIR, LAUNCH_OPTS);

// Force fresh profile fetch so bgg_id_selector and other recent changes are
// always picked up — probe close may have interrupted the first cache write.
const [sw] = context.serviceWorkers();
await sw.evaluate(async () => {
  await chrome.storage.local.remove('cachedProfiles');
  // reloadPatterns is defined in the service worker scope
  await reloadPatterns(); // eslint-disable-line no-undef
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(DEFAULT_URL);

console.log(`BGM test browser ready → ${DEFAULT_URL}`);
console.log('Ctrl+C to quit.\n');

await new Promise((resolve) => {
  context.on('close', resolve);
  process.on('SIGINT', async () => {
    await context.close();
    resolve();
  });
});
