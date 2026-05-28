import { test, expect } from './fixtures/extension.js';
import { serveFixture, mockJson } from './helpers/routes.js';

// ── Happy path ────────────────────────────────────────────────────────────────

test('BGA game panel renders the BGM overlay', async ({ context }) => {
  await serveFixture(
    context,
    'https://boardgamearena.com/gamepanel?game=cafe',
    'shops/bga-gamepanel.html'
  );

  await mockJson(context, 'https://boardgamematcher.com/api/games/search**', {
    games: [{ id: 42, name: 'Café', slug: 'cafe', bayes_average: 7.5 }],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/42', {
    collection_types: ['played'],
  });

  const page = await context.newPage();
  await page.goto('https://boardgamearena.com/gamepanel?game=cafe');

  const overlay = page.locator('#bgm-overlay');
  await expect(overlay).toBeVisible({ timeout: 8000 });
  await expect(overlay.locator('.bgm-overlay-game-name')).toHaveText('Café');
  await expect(
    overlay.locator('.bgm-collection-pill[data-type="played"].bgm-active')
  ).toHaveCount(1);
  await expect(
    overlay.locator('.bgm-collection-pill[data-type="own"].bgm-active')
  ).toHaveCount(0);
});

// ── Subdomain variant ─────────────────────────────────────────────────────────

test('en.boardgamearena.com gamepanel renders the BGM overlay', async ({ context }) => {
  await serveFixture(
    context,
    'https://en.boardgamearena.com/gamepanel?game=cafe',
    'shops/bga-gamepanel.html'
  );

  await mockJson(context, 'https://boardgamematcher.com/api/games/search**', {
    games: [{ id: 42, name: 'Café', slug: 'cafe', bayes_average: 7.5 }],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/42', {
    collection_types: [],
  });

  const page = await context.newPage();
  await page.goto('https://en.boardgamearena.com/gamepanel?game=cafe');

  await expect(page.locator('#bgm-overlay')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#bgm-overlay .bgm-overlay-game-name')).toHaveText('Café');
});

// ── Title extraction fallbacks ────────────────────────────────────────────────

test('extracts title from document.title when game_name element and og:title are absent', async ({ context }) => {
  await serveFixture(
    context,
    'https://boardgamearena.com/gamepanel?game=terraformingmars',
    'shops/bga-gamepanel-no-og.html'
  );

  await mockJson(context, 'https://boardgamematcher.com/api/games/search**', {
    games: [{ id: 99, name: 'Terraforming Mars', slug: 'terraforming-mars', bayes_average: 8.1 }],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/99', {
    collection_types: [],
  });

  const page = await context.newPage();
  await page.goto('https://boardgamearena.com/gamepanel?game=terraformingmars');

  await expect(page.locator('#bgm-overlay')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#bgm-overlay .bgm-overlay-game-name')).toHaveText('Terraforming Mars');
});

test('extracts title from document.title when og:title is also absent (title-only fallback)', async ({ context }) => {
  await serveFixture(
    context,
    'https://boardgamearena.com/gamepanel?game=wingspan',
    'shops/bga-gamepanel-title-only.html'
  );

  await mockJson(context, 'https://boardgamematcher.com/api/games/search**', {
    games: [{ id: 77, name: 'Wingspan', slug: 'wingspan', bayes_average: 7.9 }],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/77', {
    collection_types: [],
  });

  const page = await context.newPage();
  await page.goto('https://boardgamearena.com/gamepanel?game=wingspan');

  await expect(page.locator('#bgm-overlay')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#bgm-overlay .bgm-overlay-game-name')).toHaveText('Wingspan');
});

// ── Guard: non-gamepanel pages ────────────────────────────────────────────────

test('BGA non-gamepanel page does not render the overlay', async ({ context }) => {
  await serveFixture(context, 'https://boardgamearena.com/', 'shops/bga-gamepanel.html');
  const page = await context.newPage();
  await page.goto('https://boardgamearena.com/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
  await expect(page.locator('#bgm-overlay')).toHaveCount(0);
});

// ── Error: game not found ─────────────────────────────────────────────────────

test('overlay shows error state when game is not found in BGM', async ({ context }) => {
  await serveFixture(
    context,
    'https://boardgamearena.com/gamepanel?game=unknowngame',
    'shops/bga-gamepanel.html'
  );

  await mockJson(context, 'https://boardgamematcher.com/api/games/search**', { games: [] });

  const page = await context.newPage();
  await page.goto('https://boardgamearena.com/gamepanel?game=unknowngame');

  const overlay = page.locator('#bgm-overlay');
  await expect(overlay).toBeVisible({ timeout: 8000 });
  await expect(overlay.locator('.bgm-overlay-error')).toBeVisible();
  await expect(overlay.locator('.bgm-overlay-game-name')).toHaveCount(0);
});

// ── Dismiss ───────────────────────────────────────────────────────────────────

test('dismiss button hides the overlay', async ({ context }) => {
  await serveFixture(
    context,
    'https://boardgamearena.com/gamepanel?game=cafe',
    'shops/bga-gamepanel.html'
  );

  await mockJson(context, 'https://boardgamematcher.com/api/games/search**', {
    games: [{ id: 42, name: 'Café', slug: 'cafe', bayes_average: 7.5 }],
  });
  await mockJson(context, 'https://boardgamematcher.com/api/collections/42', {
    collection_types: [],
  });

  const page = await context.newPage();
  await page.goto('https://boardgamearena.com/gamepanel?game=cafe');

  const overlay = page.locator('#bgm-overlay');
  await expect(overlay).toBeVisible({ timeout: 8000 });

  await overlay.locator('.bgm-overlay-dismiss').click();
  await expect(overlay).toHaveCount(0, { timeout: 2000 });
});
