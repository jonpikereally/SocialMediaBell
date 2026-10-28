// node tests/core.test.mjs
import assert from "node:assert/strict";
import {
  DEFAULTS, SITES, parseX, parseReddit, titleCount, cleanDomain, siteForUrl, allSites,
  alertsFor, alertText, badgeText, matchPatterns,
} from "../src/shared/core.js";

const S = { ...DEFAULTS };
const X = SITES.find((s) => s.id === "x"), FB = SITES.find((s) => s.id === "facebook");

// X and Reddit answers
assert.deepEqual(parseX({ ntab_unread_count: 3, dm_unread_count: 1, total_unread_count: 4 }), { n: 3, dm: 1 });
assert.deepEqual(parseX({ ntab_unread_count: 2 }), { n: 2, dm: 0 });
assert.equal(parseX({ errors: [{ code: 32 }] }), null);
assert.deepEqual(parseReddit({ data: { name: "jon", inbox_count: 4 } }), { n: 4 });
assert.equal(parseReddit({}), "signedOut");
assert.equal(parseReddit({ data: {} }), null);

// Tab titles
assert.equal(titleCount("(3) Facebook"), 3);
assert.equal(titleCount("(99+) Feed | LinkedIn"), 99);
assert.equal(titleCount("Facebook"), 0);
assert.equal(titleCount("Instagram (2)"), 0);
assert.equal(titleCount(undefined), 0);

// Custom domains
assert.equal(cleanDomain("https://www.Mastodon.social/home"), "mastodon.social");
assert.equal(cleanDomain("  tiktok.com "), "tiktok.com");
assert.equal(cleanDomain("not a site"), null);
const sites = allSites({ ...S, custom: ["mastodon.social"] });
assert.equal(siteForUrl("https://web.facebook.com/x", sites).id, "facebook");
assert.equal(siteForUrl("https://www.threads.net/@a", sites).id, "threads");
assert.equal(siteForUrl("https://mastodon.social/home", sites).id, "custom:mastodon.social");
assert.equal(siteForUrl("https://notfacebook.com/", sites), null);
assert.deepEqual(matchPatterns(FB), ["https://facebook.com/*", "https://*.facebook.com/*"]);

// Alerts: silent baseline, rises only, DMs only for X and only when wanted
assert.deepEqual(alertsFor(X, undefined, { n: 5, dm: 2 }, S), []);
assert.deepEqual(alertsFor(X, { n: 1, dm: 0 }, { n: 3, dm: 1 }, S).map((a) => [a.kind, a.added, a.total]), [["notifications", 2, 3], ["messages", 1, 1]]);
assert.deepEqual(alertsFor(X, { n: 4, dm: 1 }, { n: 0, dm: 1 }, S), []);
assert.deepEqual(alertsFor(X, { n: 0, dm: 0 }, { n: 1, dm: 1 }, { ...S, notifyMessages: false }).map((a) => a.kind), ["notifications"]);
assert.deepEqual(alertsFor(FB, { n: 2 }, { n: 3 }, S).map((a) => [a.name, a.added]), [["Facebook", 1]]);

assert.equal(alertText({ name: "Facebook", kind: "notifications", added: 1, total: 1 }).title, "New notification on Facebook");
assert.equal(alertText({ name: "X", kind: "notifications", added: 2, total: 5 }).message, "5 notifications unread in total.");
assert.equal(alertText({ name: "X", kind: "messages", added: 3, total: 3 }).title, "3 new messages on X");

// Badge: total of sites that are on
const counts = { x: { n: 2, dm: 1 }, facebook: { n: 4 }, reddit: { n: 1 } };
assert.equal(badgeText(counts, S), "8");
assert.equal(badgeText(counts, { ...S, notifyMessages: false }), "7");
assert.equal(badgeText(counts, { ...S, off: ["facebook"] }), "4");
assert.equal(badgeText(counts, { ...S, showBadge: false }), "");
assert.equal(badgeText(counts, { ...S, enabled: false }), "");
assert.equal(badgeText({ facebook: { n: 150 } }, S), "99+");

console.log("core tests passed");
