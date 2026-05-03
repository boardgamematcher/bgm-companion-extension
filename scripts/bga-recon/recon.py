#!/usr/bin/env python3
"""BGM-789 spike — capture BGA per-game player stat pages.

Output goes to /tmp/bga-recon/. Auth state is cached at /tmp/bga-recon/auth.json
so subsequent runs are headless. Credentials live in ./.env (gitignored).
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from playwright.async_api import async_playwright, Page, BrowserContext

OUT_DIR = Path("/tmp/bga-recon")
AUTH_STATE = OUT_DIR / "auth.json"
HOME_URL = "https://en.boardgamearena.com/"
LOGIN_URL = "https://en.boardgamearena.com/account"


REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def load_env():
    env_path = REPO_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "game"


async def has_valid_session(context: BrowserContext) -> bool:
    cookies = await context.cookies()
    return any(
        c.get("name", "").startswith("TournoiEnLigne") and len(c.get("value", "")) > 4
        for c in cookies
    )


async def do_login(context: BrowserContext, email: str, password: str):
    page = await context.new_page()
    print(f"[login] navigating to {LOGIN_URL}")
    await page.goto(LOGIN_URL, wait_until="domcontentloaded")

    # BGA shows a cookie consent banner; dismiss if present.
    try:
        await page.click("button:has-text('Accept'), button:has-text('Agree'), #cookie_accept", timeout=2000)
    except Exception:
        pass

    # Try the most common selectors for BGA's login form.
    print("[login] filling credentials — if the form looks different, log in manually in the window")
    try:
        await page.fill("input[name='email'], #username_input", email, timeout=5000)
        await page.fill("input[name='password'], #password_input", password, timeout=5000)
        await page.click("button[type='submit'], #submit_login_button", timeout=5000)
    except Exception as e:
        print(f"[login] auto-fill failed ({e}); switch to the browser window and log in manually")

    print("[login] waiting up to 10 minutes for a logged-in session — log in normally in the browser window. Handle 2FA / captcha if BGA shows them. The script will detect login passively via cookies (works on any page).")
    # Cookie-based detection: BGA sets several cookies starting with
    # 'TournoiEnLigne' once a session exists. We check the BrowserContext's
    # cookie jar (no page navigation, no page-DOM dependency).
    for i in range(300):  # 300 * 2s = 10 minutes
        await asyncio.sleep(2)
        try:
            cookies = await context.cookies()
            session_cookies = [
                c for c in cookies
                if c.get("name", "").startswith("TournoiEnLigne") and len(c.get("value", "")) > 4
            ]
            if session_cookies:
                names = sorted({c["name"] for c in session_cookies})
                print(f"[login] success — session cookies: {', '.join(names)}", flush=True)
                await page.close()
                return
        except Exception:
            pass
        if i and i % 15 == 0:
            try:
                cur_url = page.url
            except Exception:
                cur_url = "(page closed)"
            print(f"[login] still waiting… ({i*2}s elapsed; current url: {cur_url})", flush=True)
    await page.close()
    raise RuntimeError("Login timed out after 10 minutes")


async def discover_games(page: Page, player_id: str) -> list[tuple[str, str]]:
    """Visit /gamestats and pull a list of (game_name, game_id) the user has played."""
    url = f"https://en.boardgamearena.com/gamestats?player={player_id}"
    print(f"[discover] {url}")
    await page.goto(url, wait_until="networkidle")

    # Persist the page so we can rewrite the selectors offline if discovery
    # comes up empty.
    try:
        (OUT_DIR / "gamestats.html").write_text(await page.content(), encoding="utf-8")
        await page.screenshot(path=str(OUT_DIR / "gamestats.png"), full_page=True)
    except Exception as e:
        print(f"[discover]   warn: could not save gamestats artefacts: {e}")

    games = await page.evaluate(
        """() => {
            // BGA's gamestats page lists games in elements with data-game-id or
            // links to /playerstat?...&game=<id>.
            const out = new Map();

            document.querySelectorAll('[data-game-id]').forEach(el => {
                const id = el.getAttribute('data-game-id');
                const name = (el.getAttribute('data-game-name')
                              || el.textContent || '').trim().split('\\n')[0].trim();
                if (id && !out.has(id)) out.set(id, name || `game_${id}`);
            });

            document.querySelectorAll("a[href*='playerstat']").forEach(a => {
                const m = a.href.match(/[?&]game=(\\d+)/);
                if (!m) return;
                const id = m[1];
                const name = (a.textContent || '').trim();
                if (!out.has(id)) out.set(id, name || `game_${id}`);
            });

            return Array.from(out.entries()).map(([id, name]) => ({ id, name }));
        }"""
    )
    print(f"[discover] found {len(games)} games on profile")
    return [(g["name"], g["id"]) for g in games]


def pick_games(discovered: list[tuple[str, str]], explicit: list[str] | None) -> list[tuple[str, str]]:
    if explicit:
        by_id = {gid: name for name, gid in discovered}
        return [(by_id.get(gid, f"game_{gid}"), gid) for gid in explicit]

    # Default: Formula D first if present; then 3 others.
    chosen: list[tuple[str, str]] = []
    for name, gid in discovered:
        if gid == "1845":
            chosen.append((name, gid))
            break
    if not chosen:
        chosen.append(("formulad", "1845"))  # fallback to ticket example

    for name, gid in discovered:
        if gid == "1845":
            continue
        chosen.append((name, gid))
        if len(chosen) >= 4:
            break
    return chosen[:4]


async def capture_game(context: BrowserContext, player_id: str, name: str, game_id: str):
    slug = slugify(name) or f"game-{game_id}"
    target = OUT_DIR / f"{slug}__{game_id}"
    target.mkdir(parents=True, exist_ok=True)

    page = await context.new_page()
    requests_log: list[dict] = []

    async def on_response(response):
        try:
            req = response.request
            entry = {
                "method": req.method,
                "url": response.url,
                "status": response.status,
                "resource_type": req.resource_type,
                "request_headers": await req.all_headers(),
                "response_headers": await response.all_headers(),
            }
            ct = entry["response_headers"].get("content-type", "")
            # Save bodies only for XHR/fetch JSON & HTML — skip images/css/fonts
            if req.resource_type in ("xhr", "fetch") or "json" in ct or ("html" in ct and "playerstat" in response.url):
                try:
                    body = await response.body()
                    entry["body_preview"] = body[:200_000].decode("utf-8", errors="replace")
                    entry["body_truncated"] = len(body) > 200_000
                except Exception as e:
                    entry["body_error"] = str(e)
            requests_log.append(entry)
        except Exception as e:
            requests_log.append({"error": str(e), "url": getattr(response, "url", "?")})

    page.on("response", lambda r: asyncio.create_task(on_response(r)))

    url = f"https://en.boardgamearena.com/playerstat?id={player_id}&game={game_id}"
    print(f"[capture] {name} ({game_id}) → {url}")
    try:
        await page.goto(url, wait_until="networkidle", timeout=60_000)
    except Exception as e:
        print(f"[capture]   warn: navigation issue: {e}")

    # Give late XHRs a moment to settle
    await asyncio.sleep(3)

    html = await page.content()
    (target / "page.html").write_text(html, encoding="utf-8")

    try:
        await page.screenshot(path=str(target / "page.png"), full_page=True)
    except Exception as e:
        print(f"[capture]   warn: screenshot failed: {e}")

    (target / "network.json").write_text(json.dumps(requests_log, indent=2), encoding="utf-8")

    # Quick summary: which XHR/fetch responses contain JSON
    xhrs = [r for r in requests_log if r.get("resource_type") in ("xhr", "fetch")]
    json_xhrs = [r for r in xhrs if "json" in r.get("response_headers", {}).get("content-type", "")]
    print(f"[capture]   {len(xhrs)} XHR/fetch  ({len(json_xhrs)} JSON)  HTML {len(html):,} bytes")

    await page.close()
    return target


async def main():
    load_env()
    email = os.environ.get("BGA_EMAIL")
    password = os.environ.get("BGA_PASSWORD")
    player_id = os.environ.get("BGA_PLAYER_ID", "84147370")
    explicit_ids = [g.strip() for g in os.environ.get("BGA_GAME_IDS", "").split(",") if g.strip()] or None
    headful = os.environ.get("HEADFUL") == "1"

    if not email or not password:
        print(f"ERROR: set BGA_EMAIL and BGA_PASSWORD in {REPO_ROOT / '.env'}")
        print(f"       (copy {REPO_ROOT / '.env.example'} → {REPO_ROOT / '.env'})")
        sys.exit(2)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[setup] output dir: {OUT_DIR}")
    print(f"[setup] player id:  {player_id}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not headful and AUTH_STATE.exists())

        # If we have cached auth, try it first; otherwise headful login.
        if AUTH_STATE.exists():
            print(f"[setup] reusing auth state {AUTH_STATE}")
            context = await browser.new_context(storage_state=str(AUTH_STATE))
            if not await has_valid_session(context):
                print("[setup] cached auth invalid — re-login")
                await context.close()
                await browser.close()
                AUTH_STATE.unlink(missing_ok=True)
                browser = await p.chromium.launch(headless=False)
                context = await browser.new_context()
                await do_login(context, email, password)
                await context.storage_state(path=str(AUTH_STATE))
        else:
            print("[setup] no cached auth — opening headful browser for login")
            await browser.close()
            browser = await p.chromium.launch(headless=False)
            context = await browser.new_context()
            await do_login(context, email, password)
            await context.storage_state(path=str(AUTH_STATE))

        # Skip discovery when explicit IDs are provided — saves a fragile
        # navigation and we don't need it to pick targets anyway.
        if explicit_ids:
            print(f"[setup] BGA_GAME_IDS set → skipping discovery")
            discovered: list[tuple[str, str]] = []
        else:
            discovery_page = await context.new_page()
            try:
                discovered = await discover_games(discovery_page, player_id)
            except Exception as e:
                print(f"[discover]   warn: failed ({e}); continuing with fallback")
                discovered = []
            await discovery_page.close()
            (OUT_DIR / "discovered_games.json").write_text(
                json.dumps([{"name": n, "id": gid} for n, gid in discovered], indent=2),
                encoding="utf-8",
            )

        targets = pick_games(discovered, explicit_ids)
        print(f"[setup] inspecting {len(targets)} games:")
        for n, gid in targets:
            print(f"        - {n} ({gid})")

        for name, gid in targets:
            await capture_game(context, player_id, name, gid)

        await context.close()
        await browser.close()

    print(f"\nDone. Inspect output at: {OUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
