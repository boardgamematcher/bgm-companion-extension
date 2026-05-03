/**
 * @jest-environment jsdom
 */
const { describe, test, expect, beforeEach } = require('@jest/globals');
const {
  extractPlayerId,
  readPlayerIdFromCookie,
} = require('../src/content/bga-listener.js');

function resetDom() {
  document.documentElement.innerHTML = '<head></head><body></body>';
  // Clear cookies left over from earlier tests by expiring them.
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
  // Reset URL to a neutral BGA path so URL-param checks don't false-positive.
  window.history.replaceState({}, '', '/');
}

function setUrl(path) {
  window.history.replaceState({}, '', path);
}

function addInlineScript(text) {
  const s = document.createElement('script');
  s.textContent = text;
  document.head.appendChild(s);
}

describe('extractPlayerId', () => {
  beforeEach(resetDom);

  test('returns ?player= from URL when present (gamestats page)', () => {
    setUrl('/gamestats?player=84147370');
    expect(extractPlayerId()).toBe('84147370');
  });

  test('returns ?id= from URL when present (player profile)', () => {
    setUrl('/player?id=84147370');
    expect(extractPlayerId()).toBe('84147370');
  });

  test('reads body[data-current-user-id] when URL params are absent', () => {
    setUrl('/');
    document.body.setAttribute('data-current-user-id', '84147370');
    expect(extractPlayerId()).toBe('84147370');
  });

  test('treats body[data-current-user-id]="0" as logged-out and falls through', () => {
    setUrl('/');
    document.body.setAttribute('data-current-user-id', '0');
    // Provide a valid cookie further down the chain so we can prove we fell
    // through past the body attribute.
    document.cookie = 'TournoiEnLigne_sso_user=99999; path=/';
    expect(extractPlayerId()).toBe('99999');
  });

  test('reads bgaConfig inline-script id', () => {
    setUrl('/welcome');
    addInlineScript(`
      var bgaConfig = {"requestToken":"abc","id":"84147370","lang":"fr"};
    `);
    expect(extractPlayerId()).toBe('84147370');
  });

  test('reads globaluserinfos inline-script id', () => {
    setUrl('/welcome');
    addInlineScript(`
      window.globaluserinfos = { "name": "GreenVelvet", "id": "84147370" };
    `);
    expect(extractPlayerId()).toBe('84147370');
  });

  test('reads TournoiEnLigne_sso_user cookie (bare integer)', () => {
    setUrl('/');
    document.cookie = 'TournoiEnLigne_sso_user=84147370; path=/';
    expect(extractPlayerId()).toBe('84147370');
  });

  test('falls back to <meta name="player_id"> as last resort', () => {
    setUrl('/');
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'player_id');
    meta.setAttribute('content', '84147370');
    document.head.appendChild(meta);
    expect(extractPlayerId()).toBe('84147370');
  });

  test('returns null when no source can resolve the ID (logged out)', () => {
    setUrl('/');
    expect(extractPlayerId()).toBeNull();
  });

  test('URL ?player= takes priority over body attribute', () => {
    setUrl('/gamestats?player=11111');
    document.body.setAttribute('data-current-user-id', '22222');
    expect(extractPlayerId()).toBe('11111');
  });

  test('body attribute takes priority over inline script', () => {
    setUrl('/');
    document.body.setAttribute('data-current-user-id', '11111');
    addInlineScript(`var bgaConfig = {"id":"22222"};`);
    expect(extractPlayerId()).toBe('11111');
  });

  test('inline script takes priority over cookie', () => {
    setUrl('/');
    addInlineScript(`var bgaConfig = {"id":"11111"};`);
    document.cookie = 'TournoiEnLigne_sso_user=22222; path=/';
    expect(extractPlayerId()).toBe('11111');
  });

  test('ignores inline scripts that do not mention bgaConfig/globaluserinfos', () => {
    setUrl('/');
    addInlineScript(`var unrelated = {"id":"99999"};`);
    document.cookie = 'TournoiEnLigne_sso_user=84147370; path=/';
    // Cookie should win because the inline script is filtered out.
    expect(extractPlayerId()).toBe('84147370');
  });
});

describe('readPlayerIdFromCookie', () => {
  test('returns null when the cookie is not set', () => {
    expect(readPlayerIdFromCookie('foo=bar; baz=qux')).toBeNull();
  });

  test('returns the bare integer value', () => {
    expect(readPlayerIdFromCookie('TournoiEnLigne_sso_user=84147370; foo=bar')).toBe('84147370');
  });

  test('extracts id from URL-encoded JSON value', () => {
    // {"id":"84147370","name":"GreenVelvet"} URL-encoded
    const encoded = encodeURIComponent('{"id":"84147370","name":"GreenVelvet"}');
    expect(readPlayerIdFromCookie(`TournoiEnLigne_sso_user=${encoded}`)).toBe('84147370');
  });

  test('extracts id from key=value style payload (id=84147370)', () => {
    const raw = encodeURIComponent('id=84147370&token=abc');
    expect(readPlayerIdFromCookie(`TournoiEnLigne_sso_user=${raw}`)).toBe('84147370');
  });

  test('returns null when the value contains no id', () => {
    expect(readPlayerIdFromCookie('TournoiEnLigne_sso_user=garbage_no_id_here')).toBeNull();
  });
});
