// Every error a user can see has a stable code. Never reuse or renumber.
// The public list lives in ERRORS.md; scripts/check-errors.sh fails the
// build if a code used in src/ or app/ is missing from it.
//   1xx updates   2xx X   3xx saved data   4xx Reddit   5xx tab-title sites   999 unexpected

export const REPO = "jonpikereally/SocialMediaBell";
export const ERROR_LIST_URL = `https://github.com/${REPO}/blob/main/ERRORS.md`;
export const ERROR_LIST_RAW = `https://raw.githubusercontent.com/${REPO}/main/ERRORS.md`;
export const ERROR_HOVER = `Look this code up on the Social Media Bell error list: ${ERROR_LIST_URL}`;

export const ERRORS = {
  "SB-101": ["Couldn't reach the update feed.", "Check your internet connection, or the Update source in Settings."],
  "SB-102": ["The update feed returned something unreadable.", "Clear the Update source in Settings to go back to the built-in feed."],
  "SB-202": ["X refused the unread-count check.", "Open x.com once (signed in) and leave the tab open, then click Check now."],
  "SB-203": ["Couldn't reach x.com.", "Check your internet connection. Social Media Bell keeps trying on its own."],
  "SB-204": ["X answered with something Social Media Bell couldn't read.", "X may have changed how the count works: check for an update, or copy the details."],
  "SB-205": ["X is limiting how often the count can be checked.", "Nothing to fix: checks resume on their own. Choose a longer check interval if it keeps happening."],
  "SB-301": ["Couldn't read or save Social Media Bell's settings.", "Restart the browser. If it persists, copy the details."],
  "SB-402": ["Reddit refused the unread-count check.", "Open reddit.com once (signed in) and leave the tab open, then click Check now."],
  "SB-403": ["Couldn't reach reddit.com.", "Check your internet connection. Social Media Bell keeps trying on its own."],
  "SB-404": ["Reddit answered with something Social Media Bell couldn't read.", "Reddit may have changed how the count works: check for an update, or copy the details."],
  "SB-405": ["Reddit is limiting how often the count can be checked.", "Nothing to fix: checks resume on their own. Choose a longer check interval if it keeps happening."],
  "SB-501": ["Couldn't read the open tabs to find unread counts.", "Reload Social Media Bell in your browser's extensions page. If it persists, copy the details."],
  "SB-502": ["The browser didn't allow Social Media Bell to see that site's tabs.", "Add the site again and click Allow when the browser asks."],
  "SB-999": ["Something unexpected went wrong.", "Copy the details and paste them into an AI assistant along with the error list link."],
};

export function describe(code) {
  const [summary, hint] = ERRORS[code] || ERRORS["SB-999"];
  return { code: ERRORS[code] ? code : "SB-999", summary, hint };
}

export function detailsText(err, version) {
  const d = describe(err.code);
  return [
    `Social Media Bell error ${d.code}: ${d.summary}`,
    `What to try: ${d.hint}`,
    err.details ? `Details: ${err.details}` : null,
    `When: ${new Date(err.t || Date.now()).toISOString()}`,
    `Social Media Bell version: ${version}`,
    `Browser: ${navigator.userAgent}`,
    `Error list: ${ERROR_LIST_URL}`,
    `Error list (plain text for AI assistants): ${ERROR_LIST_RAW}`,
  ].filter(Boolean).join("\n");
}

export async function logError(code, details) {
  const { errors = [] } = await chrome.storage.local.get("errors");
  errors.push({ code, details: details ? String(details).slice(0, 2000) : null, t: Date.now() });
  await chrome.storage.local.set({ errors: errors.slice(-100) });
  console.warn(`Social Media Bell ${code}`, details || "");
}
