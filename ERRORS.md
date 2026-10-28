# Social Media Bell error codes

Every problem Social Media Bell can show you has a code like `SB-202`. Find yours below.

**Getting help from an AI assistant:** click **Copy Error Details** on the error, then paste it into ChatGPT, Claude or similar along with a link to this page. For a plain-text copy that's easy for AI assistants to read, use https://raw.githubusercontent.com/jonpikereally/SocialMediaBell/main/ERRORS.md

Codes are grouped: `1xx` updates, `2xx` X, `3xx` saved data, `4xx` Reddit, `5xx` sites read from tab titles (Facebook, Instagram, LinkedIn, Threads, Bluesky, sites you add), `999` anything else. Codes are never reused or renumbered.

Not being signed in to X or Reddit isn't an error: that site's row just says "Not signed in".

| Code | What happened | What to try |
|---|---|---|
| `SB-101` | Social Media Bell couldn't reach the update feed. | Check your internet connection. If you set a custom Update source in Settings, make sure the URL is right, or clear it. |
| `SB-102` | The update feed answered, but not with a valid `latest.json`. | Clear the Update source in Settings to go back to the built-in GitHub feed. If you're already on it, open an issue. |
| `SB-202` | X refused the unread-count request (HTTP 401/403), both from the extension and from an open x.com tab (if any). | Open x.com (signed in), leave the tab open, and click **Check now**. Some privacy settings (e.g. Brave Shields blocking cookies) cause this; the open-tab route usually works around it. |
| `SB-203` | The request to x.com failed at the network level. | Check your internet connection. Social Media Bell keeps retrying on its own. |
| `SB-204` | X answered, but not with the unread counts expected (`ntab_unread_count` / `dm_unread_count` from `/i/api/2/badge_count/badge_count.json`). X may have changed the endpoint. | Check for an update (Settings → Check for Updates). Copy the details if you open an issue. |
| `SB-205` | X is rate-limiting the unread-count check (HTTP 429). Not a fault: X checks pause until the time shown, then resume. | Nothing. If it happens often, pick a longer interval under "Check X and Reddit every". |
| `SB-301` | Reading or saving Social Media Bell's settings failed. | Restart the browser. If it persists, copy the details. |
| `SB-402` | Reddit refused the unread-count request (HTTP 401/403), both from the extension and from an open reddit.com tab (if any). | Open reddit.com (signed in), leave the tab open, and click **Check now**. |
| `SB-403` | The request to reddit.com failed at the network level. | Check your internet connection. Social Media Bell keeps retrying on its own. |
| `SB-404` | Reddit answered, but not with the expected `data.inbox_count` from `/api/me.json`. Reddit may have changed it. | Check for an update. Copy the details if you open an issue. |
| `SB-405` | Reddit is rate-limiting the unread-count check (HTTP 429). Not a fault: Reddit checks pause, then resume. | Nothing. If it happens often, pick a longer interval. |
| `SB-501` | Reading the open tabs (to find "(3)"-style counts in their titles) failed. | Reload Social Media Bell on your browser's extensions page. If it persists, copy the details. |
| `SB-502` | You added a site, but the browser's permission to see that site's tabs was declined. | Add the site again and click **Allow** when the browser asks. |
| `SB-999` | Something unexpected went wrong. | Copy the details and paste them into an AI assistant with a link to this page, or open an issue. |
