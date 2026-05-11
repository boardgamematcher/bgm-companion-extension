#!/usr/bin/env node
/**
 * Generates content_scripts match patterns in manifest.json from retailer
 * profile domains in patterns/built-in.json and ../site-profiles/profiles.json.
 *
 * Usage:  node scripts/update-manifest-matches.js
 *         npm run manifest:update
 *
 * Why: using <all_urls> in content_scripts triggers manual review on both the
 * Chrome Web Store and Firefox AMO. This script enumerates the actual retailer
 * domains so the extension only runs on pages where it does useful work.
 *
 * Re-run whenever profiles.json or built-in.json gains a new domain, then
 * commit the updated manifest.json.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Content-script entries identified by their JS files — these are the two
// that currently use <all_urls> and need to be restricted.
const RESTRICTED_SCRIPTS = ['src/lib/pattern-matcher.js', 'src/content/wishlist-badge.js'];

// Domains whose url_pattern covers multiple TLDs or subdomain variants.
// Derived by reading the url_pattern regex in built-in.json.
// Extend this map whenever a profile's url_pattern adds a new TLD.
const MULTI_TLD = {
  'veepee.fr': [
    'veepee.fr',
    'veepee.de',
    'veepee.es',
    'veepee.it',
    'veepee.at',
    'veepee.lu',
    'veepee.nl',
    'veepee.be',
    'privalia.com',
  ],
  'amazon.com': [
    'amazon.com',
    'amazon.fr',
    'amazon.de',
    'amazon.co.uk',
    'amazon.es',
    'amazon.it',
    'amazon.nl',
    'amazon.se',
    'amazon.pl',
    'amazon.ca',
    'amazon.com.au',
    'amazon.co.jp',
    'amazon.be',
    'amazon.at',
    'amazon.com.mx',
    'amazon.com.br',
  ],
  'coolshop.dk': [
    'coolshop.dk',
    'coolshop.de',
    'coolshop.se',
    'coolshop.no',
    'coolshop.fi',
    'coolshop.nl',
    'coolshop.pl',
    'coolshop.is',
    'coolshop.co',
    'coolshop.com',
  ],
};

function loadProfiles(file) {
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, 'utf8')).profiles ?? [];
  } catch (e) {
    console.warn(`Warning: could not parse ${file}: ${e.message}`);
    return [];
  }
}

function profilesToMatchPatterns(profiles) {
  const domains = new Set();
  for (const p of profiles) {
    const domain = p.domain;
    if (!domain) continue;
    const expanded = MULTI_TLD[domain];
    if (expanded) {
      for (const d of expanded) domains.add(d);
    } else {
      domains.add(domain);
    }
  }
  // *://*.domain/* matches domain itself and all subdomains (Chrome + Firefox MV3)
  return [...domains].sort().map((d) => `*://*.${d}/*`);
}

function needsUpdate(cs) {
  return RESTRICTED_SCRIPTS.some((js) => cs.js?.includes(js));
}

// ── Load profiles from both sources ──────────────────────────────────────────

const builtIn = loadProfiles(join(ROOT, 'patterns/built-in.json'));
const siteProfilesPath = join(ROOT, '../site-profiles/profiles.json');
const remote = loadProfiles(siteProfilesPath);

if (builtIn.length === 0 && remote.length === 0) {
  console.error('No profiles found — check that patterns/built-in.json exists.');
  process.exit(1);
}

const matches = profilesToMatchPatterns([...builtIn, ...remote]);

const sources = ['patterns/built-in.json'];
if (remote.length > 0) sources.push('../site-profiles/profiles.json');
console.log(`Loaded ${builtIn.length + remote.length} profiles from: ${sources.join(', ')}`);
console.log(`Generated ${matches.length} match patterns`);

// ── Update manifest.json ──────────────────────────────────────────────────────

const manifestPath = join(ROOT, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

let updated = 0;
for (const cs of manifest.content_scripts) {
  if (needsUpdate(cs)) {
    cs.matches = matches;
    updated++;
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Updated ${updated} content_script(s) in manifest.json`);
