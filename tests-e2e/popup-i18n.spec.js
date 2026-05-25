import { test, expect } from './fixtures/extension.js';
import { mockJson } from './helpers/routes.js';

// The French extract button text from _locales/fr/messages.json
const FR_EXTRACT_BUTTON = 'Tout extraire';

test('French locale: extract tab shows French UI when user preferred_language is fr', async ({
  context,
  extensionId,
}) => {
  // Respond to /api/me with preferred_language: 'fr' so bgmI18n.setLocale('fr')
  // is called and the UI re-renders in French.
  await mockJson(context, 'https://boardgamematcher.com/api/me', {
    id: 1,
    username: 'qa_fr',
    display_name: 'QA French',
    preferred_language: 'fr',
  });
  await mockJson(context, 'https://boardgamematcher.com/api/plays/summary', { total: 0 });
  await mockJson(context, 'https://boardgamematcher.com/api/matches/new', { count: 0 });
  await mockJson(context, 'https://boardgamematcher.com/api/notifications/count', { count: 0 });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  // bgmI18n.setLocale('fr') is triggered after /api/me resolves and re-applies
  // translations — wait for the extract button to show the French label.
  await expect(popup.locator('#extract-btn')).toHaveText(FR_EXTRACT_BUTTON, { timeout: 5000 });
});
