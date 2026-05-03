import { test, expect } from './fixtures/extension.js';

const MENU_IDS = [
  'bgm-extract-page',
  'bgm-extract-link',
  'bgm-search-game',
  'bgm-extract-url-selection',
  'bgm-search-game-popup',
];

async function getServiceWorker(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  return worker;
}

test('context menus — all expected items are registered', async ({ context }) => {
  const worker = await getServiceWorker(context);
  // Menus are created inside chrome.runtime.onInstalled, which fires async
  // after the extension is loaded — poll until the IDs are registered.
  const results = await worker.evaluate(async (ids) => {
    const probe = (id) =>
      new Promise((resolve) => {
        chrome.contextMenus.update(id, {}, () => {
          resolve(chrome.runtime.lastError?.message ?? null);
        });
      });
    const deadline = Date.now() + 5000;
    let last;
    while (Date.now() < deadline) {
      last = await Promise.all(ids.map((id) => probe(id).then((error) => ({ id, error }))));
      if (last.every((r) => r.error === null)) return last;
      await new Promise((r) => setTimeout(r, 100));
    }
    return last;
  }, MENU_IDS);
  for (const r of results) {
    expect(r.error, `menu ${r.id} should be registered`).toBeNull();
  }
});

test('Search BGM (selection) opens /search?q=<query>', async ({ context }) => {
  const worker = await getServiceWorker(context);
  const url = await worker.evaluate(() => {
    const calls = [];
    const orig = chrome.tabs.create;
    chrome.tabs.create = (props) => {
      calls.push(props.url);
      return Promise.resolve({ id: -1 });
    };
    try {
      chrome.contextMenus.onClicked.dispatch(
        { menuItemId: 'bgm-search-game', selectionText: 'Catan' },
        { id: 1, url: 'https://example.com/' }
      );
    } finally {
      chrome.tabs.create = orig;
    }
    return calls[0];
  });
  expect(url).toBe(
    'https://boardgamematcher.com/search?q=Catan'
  );
});

test('Extract from this page opens /extract?url=<pageUrl>', async ({ context }) => {
  const worker = await getServiceWorker(context);
  const url = await worker.evaluate(() => {
    const calls = [];
    const orig = chrome.tabs.create;
    chrome.tabs.create = (props) => {
      calls.push(props.url);
      return Promise.resolve({ id: -1 });
    };
    try {
      chrome.contextMenus.onClicked.dispatch(
        { menuItemId: 'bgm-extract-page', pageUrl: 'https://www.knapix.com/2025/top' },
        { id: 1, url: 'https://www.knapix.com/2025/top' }
      );
    } finally {
      chrome.tabs.create = orig;
    }
    return calls[0];
  });
  expect(url).toBe(
    'https://boardgamematcher.com/extract?url=' +
      encodeURIComponent('https://www.knapix.com/2025/top')
  );
});

test('Extract from this link opens /extract?url=<linkUrl>', async ({ context }) => {
  const worker = await getServiceWorker(context);
  const url = await worker.evaluate(() => {
    const calls = [];
    const orig = chrome.tabs.create;
    chrome.tabs.create = (props) => {
      calls.push(props.url);
      return Promise.resolve({ id: -1 });
    };
    try {
      chrome.contextMenus.onClicked.dispatch(
        { menuItemId: 'bgm-extract-link', linkUrl: 'https://www.amazon.com/s?k=catan' },
        { id: 1, url: 'https://example.com/' }
      );
    } finally {
      chrome.tabs.create = orig;
    }
    return calls[0];
  });
  expect(url).toBe(
    'https://boardgamematcher.com/extract?url=' +
      encodeURIComponent('https://www.amazon.com/s?k=catan')
  );
});

test('Extract URL from selection only fires when the selection looks like a URL', async ({
  context,
}) => {
  const worker = await getServiceWorker(context);
  const result = await worker.evaluate(() => {
    const calls = [];
    const orig = chrome.tabs.create;
    chrome.tabs.create = (props) => {
      calls.push(props.url);
      return Promise.resolve({ id: -1 });
    };
    try {
      chrome.contextMenus.onClicked.dispatch(
        { menuItemId: 'bgm-extract-url-selection', selectionText: 'not a url' },
        { id: 1 }
      );
      chrome.contextMenus.onClicked.dispatch(
        {
          menuItemId: 'bgm-extract-url-selection',
          selectionText: 'https://www.knapix.com/list',
        },
        { id: 1 }
      );
    } finally {
      chrome.tabs.create = orig;
    }
    return calls;
  });
  expect(result).toHaveLength(1);
  expect(result[0]).toBe(
    'https://boardgamematcher.com/extract?url=' +
      encodeURIComponent('https://www.knapix.com/list')
  );
});

test('Find in BGM extension stashes the query for the popup', async ({ context }) => {
  const worker = await getServiceWorker(context);
  const stored = await worker.evaluate(async () => {
    // chrome.action.openPopup may not resolve in headless; swallow it.
    const origOpen = chrome.action.openPopup;
    chrome.action.openPopup = () => Promise.resolve();
    try {
      chrome.contextMenus.onClicked.dispatch(
        { menuItemId: 'bgm-search-game-popup', selectionText: 'Wingspan' },
        { id: 1 }
      );
    } finally {
      chrome.action.openPopup = origOpen;
    }
    // dispatch is fire-and-forget; allow the promise chain to settle.
    await new Promise((r) => setTimeout(r, 100));
    const { pendingPopupSearch } = await chrome.storage.session.get('pendingPopupSearch');
    return pendingPopupSearch;
  });
  expect(stored).toBe('Wingspan');
});
