#!/usr/bin/env node
// Regenerate docs/supported-sites.md from manifest + patterns + service-worker.
//
// Modes:
//   node scripts/gen-supported-sites.mjs           # write
//   node scripts/gen-supported-sites.mjs --check   # exit 1 if file is stale
//
// The generator only rewrites content inside `<!-- AUTO:NAME START -->` /
// `<!-- AUTO:NAME END -->` fence pairs. Everything outside the fences (intros,
// editorial sections like §3.1–3.5, §3.7, §4) is preserved verbatim. Adding a
// new fenced section requires both a fence pair in the doc and a renderer key
// in `SECTION_RENDERERS` below.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const docPath = join(repoRoot, 'docs/supported-sites.md');

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const manifest = JSON.parse(readFileSync(join(repoRoot, 'manifest.json'), 'utf8'));
const swSource = readFileSync(join(repoRoot, 'src/background/service-worker.js'), 'utf8');

// ---------------------------------------------------------------------------
// Hand-curated metadata. Each map is keyed by something stable from the source
// (a content-script filename, a context-menu id, an alarm constant). Adding a
// new platform / menu / poll requires a one-line update here AND in the source
// of truth — that's intentional, the generator surfaces drift but doesn't
// invent friendly names.
// ---------------------------------------------------------------------------

// Map a per-platform content-script entry to the editorial fields the doc
// needs. The key is the *first* non-`pattern-matcher`/`normalize` js file in
// the entry — that's the platform's own scraper.
const SITE_META = {
  'src/content/bga-scraper.js': {
    site: 'Board Game Arena',
    pageType: 'Player stats / profile',
    exampleUrl: 'https://boardgamearena.com/gamestats?player=123',
    action: 'Popup → "Import BGA Plays" → POST plays to BGM',
    mechanism:
      "Content script calls BGA's internal AJAX with the page's request token; mapping via `patterns/bga-mapping.json`",
  },
  'src/content/yucata-scraper.js': {
    site: 'Yucata',
    pageType: 'Game History',
    exampleUrl: 'https://www.yucata.de/.../GameHistory',
    action: 'Popup → "Import Yucata Plays"',
    mechanism: 'Page-context script needed for DataTable API; mapping via `yucata-mapping.json`',
  },
  'src/content/tabletopia-scraper.js': {
    site: 'Tabletopia',
    pageType: 'Any page when logged in',
    exampleUrl: 'https://tabletopia.com/...',
    action: 'Popup → "Import Tabletopia Matches"',
    mechanism: 'Calls Tabletopia REST `/api/v2/players/current/matches` with pagination',
  },
  'src/content/ludopedia-scraper.js': {
    site: 'Ludopedia',
    pageType: 'User history',
    exampleUrl: 'https://ludopedia.com.br/usuario/...',
    action: 'Popup → "Import Ludopedia Plays"',
    mechanism: 'Calls Ludopedia `/api/v1/plays`; BGG IDs already in payload',
  },
  'src/content/spielbyweb-scraper.js': {
    site: 'SpielByWeb',
    pageType: 'Finished games list',
    exampleUrl: 'https://www.spielbyweb.de/GameList.php',
    action: 'Popup → "Import SpielByWeb Plays"',
    mechanism: 'DOM table parser, mapping via `spielbyweb-mapping.json`',
  },
  'src/content/bgg-scraper.js': {
    site: 'BoardGameGeek',
    pageType: 'User plays / collection / game detail',
    exampleUrl: 'https://boardgamegeek.com/user/<u>/plays',
    action:
      'Popup → "Import BGG Plays" / "Sync BGG Collection"; on game detail pages popup auto-targets the game (one-click add to BGM collection)',
    mechanism:
      'Calls BGG XML2 API `/xmlapi2/user/<u>/{plays,collection}`; on `/boardgame/<id>/<slug>` pages the popup runs `/api/games/search` then `/api/collections/{id}/{type}`',
  },
  'src/content/game-overlay.js': {
    site: 'Philibert (game-detail overlay)',
    pageType: 'Product detail',
    exampleUrl: 'https://www.philibertnet.com/{lang}/cat/<id>-<slug>.html',
    action:
      'Inline overlay: BGM card, rating, wishlist status; per-user collection pills when logged in',
    mechanism:
      'Reads page metadata, resolves via `resolveOverlayGame` background message, posts to `/api/collections/<id>/<type>`',
  },
};

// Brand grouping for the retail catchall content script. Keyed by the base
// host token (everything before the first TLD-ish suffix). Override the
// auto-derived display name + roll subsidiaries up under their parent brand.
const BRAND_DISPLAY = {
  amazon: 'Amazon',
  veepee: 'Veepee',
  privalia: 'Veepee', // Privalia is part of the Veepee group; group together
  coolshop: 'Coolshop',
  philibertnet: 'Philibert',
  'board-game': 'Zatu',
  boardgamebliss: 'Board Game Bliss',
  bol: 'bol.com',
  brettspielversand: 'Brettspielversand',
  coolstuffinc: 'Coolstuff Inc.',
  cultura: 'Cultura',
  espritjeu: 'Esprit Jeu',
  fantasywelt: 'Fantasywelt',
  fnac: 'Fnac',
  gamenerdz: 'Game Nerdz',
  gamersdream: "Gamer's Dream",
  knapix: 'Knapix',
  kutami: 'Kutami',
  'le-passe-temps': 'Le Passe-Temps',
  lepion: 'Le Pion',
  ludifolie: 'Ludifolie',
  ludisphere: 'Ludisphère',
  ludum: 'Ludum',
  'milan-spiele': 'Milan Spiele',
  miniaturemarket: 'Miniature Market',
  okkazeo: 'Okkazeo',
  'spiele-offensive': 'Spiele-Offensive',
  spieletaxi: 'Spieletaxi',
  thalia: 'Thalia',
};

// Per-brand notes. Empty string by default; only override when something is
// genuinely worth flagging (special integrations, data source quirks, etc.).
const BRAND_NOTES = {
  Veepee:
    'Reads `__NEXT_DATA__` JSON; Privalia (`.es`, `.it`) shares the same Veepee back-end and is grouped here',
  Philibert:
    '**Plus** a separate game-detail overlay (`game-overlay.js`) on `/{lang}/cat/<id>-…html` — see the platforms table above',
  Coolshop: 'Generic card selector across all 10 ccTLDs',
};

const CONTEXT_MENU_BEHAVIOR = {
  'bgm-extract-page': {
    visibleOn: 'page right-click',
    behavior: 'Opens `boardgamematcher.com/extract?url=<pageUrl>`',
  },
  'bgm-extract-link': {
    visibleOn: 'link right-click',
    behavior: 'Opens `…/extract?url=<linkUrl>`',
  },
  'bgm-search-game': {
    visibleOn: 'text selection',
    behavior: 'Opens `…/search?q=<selection>`',
  },
  'bgm-extract-url-selection': {
    visibleOn: 'text selection that **is** a URL (Firefox-only auto-hide)',
    behavior: 'Opens `…/extract?url=<selection>`',
  },
  'bgm-search-game-popup': {
    visibleOn: 'text selection',
    behavior:
      'Opens the extension popup pre-filled with the query (falls back to `…/search?q=` if `chrome.action.openPopup()` is unsupported)',
  },
};

// Background polls. The endpoint URL is extracted from the source so a typo
// would surface in the diff, but the editorial labels (notification, click
// destination) are kept here.
const POLLS = [
  {
    alarmConst: 'NEWS_POLL_ALARM',
    label: 'News',
    pollFn: 'pollNews',
    notification: '"New on BGM: …"',
    clickDest: '`/news/<slug>`',
  },
  {
    alarmConst: 'FRIEND_REQ_POLL_ALARM',
    label: 'Friend requests',
    pollFn: 'pollFriendRequests',
    notification: '"X new friend request(s)"',
    clickDest: '`/friends`',
  },
  {
    alarmConst: 'MATCH_POLL_ALARM',
    label: 'New matches',
    pollFn: 'pollNewMatches',
    notification: '"X new match(es)"',
    clickDest: '`/play`',
  },
  {
    alarmConst: 'SESSION_INVITE_POLL_ALARM',
    label: 'Session invites',
    pollFn: 'pollSessionInvites',
    notification: '"Invited to <session>"',
    clickDest: '`/play/sessions/<id>`',
  },
  {
    alarmConst: 'MSG_POLL_ALARM',
    label: 'Unread messages',
    pollFn: 'pollUnreadMessages',
    notification: '"X unread message(s)"',
    clickDest: '`/messages`',
  },
];

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

// Identify the per-platform scraper (or overlay) inside a content_scripts
// entry. Library helpers (`src/lib/*`), the retail catchall pair
// (`content-script.js` + `wishlist-badge.js`), and per-platform listeners
// (`*-listener.js`) are filtered out. What remains is the file we name in §1.1.
function findScraperFile(jsList) {
  for (const f of jsList) {
    if (f.startsWith('src/lib/')) continue;
    if (f === 'src/content/content-script.js') continue;
    if (f === 'src/content/wishlist-badge.js') continue;
    if (/-listener\.js$/.test(f)) continue;
    return f;
  }
  return null;
}

function renderSitesTable() {
  const rows = [];
  for (const cs of manifest.content_scripts) {
    const scraper = findScraperFile(cs.js || []);
    if (!scraper) continue;
    const meta = SITE_META[scraper];
    if (!meta) {
      throw new Error(
        `Missing SITE_META entry for ${scraper}. Add a row to scripts/gen-supported-sites.mjs.`
      );
    }
    rows.push(
      `| ${meta.site} | ${meta.pageType} | \`${meta.exampleUrl}\` | Yes — \`${scraper}\` | ${meta.action} | ${meta.mechanism} |`
    );
  }
  return [
    '| Site | Page type | Example URL | On-page extraction? | Action in extension | Mechanism |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

// Strip "*://*." prefix and trailing "/*" from a manifest match pattern,
// returning just the host (e.g. `*://*.amazon.fr/*` → `amazon.fr`).
function hostFromMatch(m) {
  return m.replace(/^\*:\/\/(\*\.)?/, '').replace(/\/.*$/, '');
}

// Take a host like `amazon.co.uk` / `veepee.lu` / `philibertnet.com` and
// return the base brand token (`amazon` / `veepee` / `philibertnet`). Strips
// known TLD families: `.com.<cc>`, `.co.<cc>`, plain ccTLDs, plain `.com`.
function brandTokenOf(host) {
  return host.replace(/\.(com\.[a-z]{2}|co\.[a-z]{2}|[a-z]{2,3})$/, '').split('.')[0];
}

function renderRetailBrands() {
  const catchall = manifest.content_scripts.find(
    (cs) => (cs.js || []).includes('src/content/content-script.js') && (cs.matches || []).length > 5
  );
  if (!catchall) throw new Error('Could not locate the retail catchall content_scripts entry.');

  const hosts = catchall.matches.map(hostFromMatch);

  // Group hosts by display brand.
  const groups = new Map();
  for (const h of hosts) {
    const token = brandTokenOf(h);
    const display = BRAND_DISPLAY[token] || token;
    if (!groups.has(display)) groups.set(display, []);
    groups.get(display).push(h);
  }

  // Sort brands by descending size (multi-domain brands first), then alpha.
  const sorted = [...groups.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
  });

  const total = hosts.length;
  const rows = sorted.map(([brand, list]) => {
    list.sort();
    const note = BRAND_NOTES[brand] || '';
    const ccsCol =
      list.length > 1
        ? list.map((h) => h.replace(new RegExp(`^${brandTokenOf(h)}`), '')).join(', ')
        : list[0];
    return `| ${brand} (${list.length}) | ${list.join(', ')} | ${note} |`;
    // (ccsCol kept for potential future column compaction; currently we list full hosts.)
    void ccsCol;
  });

  return [
    `**${total} retail domains in \`manifest.json\`**, grouped by brand:`,
    '',
    '| Brand | Domains | Notes |',
    '|---|---|---|',
    ...rows,
  ].join('\n');
}

function renderContextMenus() {
  // Title strings can contain inner quotes (e.g. `'Search "%s" on …'`), so
  // match the outer delimiter via backreference and non-greedy body.
  const re =
    /chrome\.contextMenus\.create\(\{\s*id:\s*(['"])([\s\S]+?)\1,\s*title:\s*(['"])([\s\S]+?)\3,\s*contexts:\s*\[([^\]]+)\]/g;
  const rows = [];
  let m;
  while ((m = re.exec(swSource)) !== null) {
    const id = m[2];
    const title = m[4];
    const meta = CONTEXT_MENU_BEHAVIOR[id];
    if (!meta) {
      throw new Error(
        `Missing CONTEXT_MENU_BEHAVIOR entry for context-menu id "${id}". Add a row to scripts/gen-supported-sites.mjs.`
      );
    }
    rows.push(`| ${title} | ${meta.visibleOn} | ${meta.behavior} |`);
  }
  if (rows.length === 0) {
    throw new Error('No chrome.contextMenus.create calls matched. Regex out of sync?');
  }
  return ['| Menu item | Visible on | Behavior |', '|---|---|---|', ...rows].join('\n');
}

// Pull the actual fetch URL out of a poll function so a typo at the source
// surfaces in the generated diff. We anchor on `function pollX()` and grab
// the first `${BGM_BASE_URL}/api/...` template inside the body.
function findPollEndpoint(pollFn) {
  const re = new RegExp(
    `function\\s+${pollFn}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?fetch\\(\`\\$\\{(?:BGM_BASE_URL|apiUrl)\\}(/api/[^\`]+)\``,
    'm'
  );
  const m = swSource.match(re);
  if (!m) {
    throw new Error(
      `Could not extract endpoint for ${pollFn} from service-worker.js. Did the function rename or fetch shape change?`
    );
  }
  return m[1];
}

// Pull the alarm period (in minutes) for a given alarm constant from the
// `chrome.alarms.create(NAME, { periodInMinutes: N })` call site.
function findAlarmPeriod(alarmConst) {
  const re = new RegExp(
    `chrome\\.alarms\\.create\\(${alarmConst},\\s*\\{\\s*periodInMinutes:\\s*(\\d+)\\s*\\}`
  );
  const m = swSource.match(re);
  if (!m) {
    throw new Error(`Could not find alarm period for ${alarmConst}.`);
  }
  return parseInt(m[1], 10);
}

function renderBgPolls() {
  const rows = POLLS.map((p) => {
    const endpoint = findPollEndpoint(p.pollFn);
    const period = findAlarmPeriod(p.alarmConst);
    const periodLabel = period === 1 ? '1 min' : period < 60 ? `${period} min` : `${period / 60} h`;
    return `| ${p.label} | every ${periodLabel} | \`GET ${endpoint}\` | ${p.notification} | ${p.clickDest} |`;
  });
  return [
    '| Alarm | Period | Endpoint | Notification on hit | Click destination |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

const SECTION_RENDERERS = {
  'sites-table': renderSitesTable,
  'retail-brands': renderRetailBrands,
  'context-menus': renderContextMenus,
  'bg-polls': renderBgPolls,
};

// ---------------------------------------------------------------------------
// Splice fenced sections + write / check
// ---------------------------------------------------------------------------

function splice(original) {
  let updated = original;
  const expected = new Set(Object.keys(SECTION_RENDERERS));
  const seen = new Set();

  for (const [name, render] of Object.entries(SECTION_RENDERERS)) {
    const re = new RegExp(
      `(<!-- AUTO:${name} START -->)([\\s\\S]*?)(<!-- AUTO:${name} END -->)`,
      'm'
    );
    if (!re.test(updated)) {
      throw new Error(
        `Doc is missing fence pair for "${name}". Add <!-- AUTO:${name} START --> ... <!-- AUTO:${name} END --> in docs/supported-sites.md.`
      );
    }
    seen.add(name);
    const content = render();
    updated = updated.replace(re, `$1\n${content}\n$3`);
  }

  // Detect dangling fences (renderer removed but doc still references it).
  for (const m of original.matchAll(/<!-- AUTO:([a-z-]+) START -->/g)) {
    if (!expected.has(m[1])) {
      throw new Error(
        `Doc has fence pair "${m[1]}" with no matching renderer. Remove the fences or add the renderer.`
      );
    }
  }

  return updated;
}

const original = readFileSync(docPath, 'utf8');
const updated = splice(original);
const isCheck = process.argv.includes('--check');

if (updated === original) {
  if (!isCheck) console.log('docs/supported-sites.md is up to date — no write needed.');
  process.exit(0);
}

if (isCheck) {
  process.stderr.write(
    'docs/supported-sites.md is stale. Run `npm run docs:sites` and commit the result.\n'
  );
  process.exit(1);
}

writeFileSync(docPath, updated);
console.log('Wrote docs/supported-sites.md');
