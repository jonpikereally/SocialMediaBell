# Social Media Bell

A Chrome/Brave/Edge extension that tells you when you get new notifications on your social media sites, all in one place.

- A desktop alert ("2 new notifications on Facebook") whenever a site's unread count goes up. Click it to jump to that site.
- One popup listing every site with its unread count, and the total on the toolbar icon.
- Uses your existing sign-ins in this browser. No accounts, no API keys, no server.

## Sites

| Site | How it's checked | Needs an open tab? |
|---|---|---|
| X | X's own unread-count endpoint (notifications + direct messages) | No |
| Reddit | Reddit's `/api/me.json` inbox count | No |
| Facebook, Instagram, LinkedIn, Threads, Bluesky | The "(3)" count the site shows in its tab title | Yes: keep a tab open (pinned works well) |
| Any other site you add | Same tab-title count, if the site shows one | Yes |

X and Reddit are checked every minute by default (1–30 minutes). Tab-title sites update the moment their title changes. Opening a tab never triggers alerts for what was already unread, only for new things after that.

## Install

1. Download this repo (Code → Download ZIP) and unzip it, or `git clone https://github.com/jonpikereally/SocialMediaBell`.
2. Open `chrome://extensions` (or `brave://extensions`), turn on **Developer mode**, click **Load unpacked**, and pick the `SocialMediaBell` folder.
3. Click the bell icon → **Send a test alert**. If nothing appears, allow notifications for your browser in System Settings → Notifications (macOS) and check your Focus mode.
4. Turn off the sites you don't use under **Sites**.

## Updates

Social Media Bell checks GitHub for new versions and shows a banner in its popup when one exists. Download it (or `git pull`) and click ↻ on Social Media Bell in the extensions page. Settings are kept.

## Problems

Every error has a code (`SB-…`). See [ERRORS.md](ERRORS.md).

MIT licence.
