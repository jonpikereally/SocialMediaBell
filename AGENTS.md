# Brief for anyone (human or AI) working on Social Media Bell

Manifest V3 extension (Chrome/Brave/Edge). Plain JS, no build step, no dependencies. Sibling of Social Media Moat, FakeSale and TimeLock (jonpikereally), with the same release and error-code conventions.

- **Sites** are declared in `SITES` in `src/shared/core.js`; user-added domains become `custom:<domain>` title sites (`settings.custom`), with a runtime `optional_host_permissions` grant per domain.
- **api sites** (checked on the `check` alarm, every `settings.intervalMin` minutes, no tab needed):
  - **X:** `GET https://x.com/i/api/2/badge_count/badge_count.json?supports_ntab_urt=1` with the web app's public bearer token, `x-csrf-token` = `ct0` cookie, `x-twitter-auth-type: OAuth2Session`. Answer `{ ntab_unread_count, dm_unread_count }`. Signed out = no `auth_token`/`ct0` cookie.
  - **Reddit:** `GET https://www.reddit.com/api/me.json` with cookies. Answer `data.inbox_count`; `{}` = signed out. Signed out also = no `reddit_session` cookie.
  - Both: a direct `fetch` from the service worker first; on 401/403/network error the same request runs inside an open tab of the site via `chrome.scripting.executeScript`. 429 stores `waitUntil[site]`.
- **title sites** (Facebook, Instagram, LinkedIn, Threads, Bluesky, custom): `titleCount()` reads a leading `(N)` / `(N+)` from tab titles, max over the site's loaded tabs. Re-read on `tabs.onUpdated` (title/status/url) and `tabs.onRemoved`, debounced. A site's first tab gets `SETTLE_MS` (15 s, tracked in `storage.session` `since`) during which counts set the baseline silently. No tab = `noTab`, counts forgotten.
- **Alerts:** `alertsFor()` announces only rises versus the stored count. No stored count (first check, just signed in, tab just opened) = no alert. Notification ids are `sb|<site>|<kind>|<ts>`; a click opens/focuses the site (title-site tabs are focused, never navigated, so they keep counting).
- **Storage** (`chrome.storage.local`): `settings`, `counts` `{ [site]: {n, dm?, t} }`, `status` `{ [site]: {state: ok|signedOut|noTab|error|off, checkedAt, tabs?, error?} }`, `waitUntil` `{ [site]: ts }`, `errors` (last 100), `update`. Never rename keys without a migration.
- **Errors:** `SB-###` codes in `src/shared/errors.js`, documented in `ERRORS.md`; `scripts/check-errors.sh` enforces this. 2xx X, 4xx Reddit (same last digit = same failure), 5xx tab sites. A failing check logs its code once when the problem starts. Not signed in is a state, not an error.
- **Testing:** `node tests/core.test.mjs`; `tests/popup-harness.html` over http (mocked `chrome.*`; `?err`, `?rl`, `?off`, `?new`). Real sites can only be tested in a signed-in browser with the extension loaded.
- **Releases:** bump `manifest.json` version + `RELEASE_NOTES.txt`, push to `main`; the Action builds `updates/`.
