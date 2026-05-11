# Privacy Policy — BGM Toolbox

_Last updated: 2026-04-26_

The BGM Toolbox browser extension ("the extension") is a companion for [boardgamematcher.com](https://boardgamematcher.com) ("BGM"). This document describes what data the extension reads, what it transmits, and where.

## TL;DR

The extension transmits data to **`boardgamematcher.com` only**. It does not send data to any third party. It does not include any analytics, tracking, or advertising SDKs.

## Data the extension reads

Depending on the page you're on:

| Site                       | What the extension reads                                                                           | When                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Supported board game shops | Product names, prices, image URLs from the catalog page DOM (or `__NEXT_DATA__` for Next.js shops) | Only when you click **Extract Games** in the popup          |
| Board Game Arena           | Your play history via the BGA API                                                                  | Only when you click **Import BGA Plays**                    |
| Yucata.de                  | Your play history from the Game History page                                                       | Only when you click **Import Yucata Plays**                 |
| `boardgamematcher.com`     | Your BGM session cookie                                                                            | On every popup open, to show login state and wishlist count |

The extension does **not** read data from any other website.

## Data the extension transmits

All transmissions go to `https://boardgamematcher.com`:

| Endpoint                                                          | Payload                                          | Purpose                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `POST /api/extract/extension`                                     | `{ source, url, games[] }` (extracted shop data) | Match against BGM database, return a job id for the results page |
| `POST /api/plays/batch`                                           | `{ plays[], digital_platform_slug }`             | Add the imported plays to your BGM history                       |
| `POST /api/collections/{game_id}/wishlist`                        | empty                                            | Add a game to your BGM wishlist                                  |
| `GET /api/me`, `GET /api/collections/me`, `GET /api/games/search` | none                                             | Show login state and power the wishlist quick-add                |

The session cookie used for these requests is the one you already have for `boardgamematcher.com`. The extension does not store, copy, or transmit it elsewhere.

## Data stored locally

Stored in your browser's `chrome.storage.local`, never transmitted:

- Custom site patterns you create
- Cached site profiles (refreshed every 6 hours from the public [`site-profiles`](https://github.com/boardgamematcher/site-profiles) GitHub repo)
- UI preferences (theme)
- Last extraction stats (one entry: domain + count + timestamp)

## What the extension does **not** do

- No third-party analytics, telemetry, or advertising
- No reading of pages outside the supported sites listed above
- No interaction with your browsing history, bookmarks, downloads, cookies of unrelated sites, or local files
- No transmission of personally identifiable information beyond what's already exchanged with BGM via the website itself

## Permissions explained

| Manifest permission                                          | Why                                                                    |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `activeTab`                                                  | Read the current tab's URL to detect supported sites                   |
| `contextMenus`                                               | Add right-click "Extract from this page/link/selection" menu           |
| `storage`                                                    | Persist custom patterns, theme, stats                                  |
| `scripting`                                                  | Inject the content script when the popup is opened on a supported page |
| `host_permissions: boardgamematcher.com, boardgamearena.com` | Allow the extension to call those sites' APIs with your session cookie |

The content script matches `<all_urls>` so the popup can detect a supported shop on any tab — but it only **reads** the page after you click Extract, and only sends data when there's a matching site profile.

## Contact

Questions, concerns, or data deletion requests:

- Open an issue at [github.com/boardgamematcher/toolbox-extension/issues](https://github.com/boardgamematcher/toolbox-extension/issues)
- Or contact [boardgamematcher.com](https://boardgamematcher.com) directly

## Changes

Material changes to this policy will be reflected by an updated "Last updated" date and called out in the extension's release notes.
