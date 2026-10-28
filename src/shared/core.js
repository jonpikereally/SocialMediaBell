// Pure logic shared by the background, the popup and tests/core.test.mjs.

// Two kinds of site:
//   api   – asked directly on a timer with this browser's sign-in; no tab needed.
//   title – read from the "(3) Facebook" count the site puts in its tab title,
//           so it works while a tab of that site is open (a pinned tab is ideal).
export const SITES = [
  { id: "x", name: "X", icon: "𝕏", kind: "api", hosts: ["x.com"], home: "https://x.com/notifications", messages: "https://x.com/messages", hasDm: true },
  { id: "reddit", name: "Reddit", icon: "👽", kind: "api", hosts: ["reddit.com"], home: "https://www.reddit.com/notifications" },
  { id: "facebook", name: "Facebook", icon: "📘", kind: "title", hosts: ["facebook.com"], home: "https://www.facebook.com/notifications" },
  { id: "instagram", name: "Instagram", icon: "📸", kind: "title", hosts: ["instagram.com"], home: "https://www.instagram.com/" },
  { id: "linkedin", name: "LinkedIn", icon: "💼", kind: "title", hosts: ["linkedin.com"], home: "https://www.linkedin.com/notifications/" },
  { id: "threads", name: "Threads", icon: "🧵", kind: "title", hosts: ["threads.com", "threads.net"], home: "https://www.threads.com/activity" },
  { id: "bluesky", name: "Bluesky", icon: "🦋", kind: "title", hosts: ["bsky.app"], home: "https://bsky.app/notifications" },
];

export const DEFAULTS = {
  enabled: true,
  intervalMin: 1,          // how often to ask the api sites (title sites update live)
  off: [],                 // ids of sites turned off
  custom: [],              // extra domains watched by tab title, e.g. "mastodon.social"
  notifyMessages: true,    // X direct messages
  showBadge: true,
  updateSource: "",
};

export const INTERVALS = [1, 2, 5, 10, 30];

export function cleanDomain(s) {
  let d = String(s || "").trim().toLowerCase();
  try { if (/^[a-z]+:\/\//.test(d)) d = new URL(d).hostname; } catch { return null; }
  d = d.replace(/^www\./, "").replace(/[/:].*$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

export function customSite(domain) {
  return { id: `custom:${domain}`, name: domain, icon: "🌐", kind: "title", hosts: [domain], home: `https://${domain}/`, custom: true };
}

export function allSites(settings) {
  return [...SITES, ...(settings.custom || []).map(customSite)];
}

export function siteOn(site, settings) {
  return settings.enabled && !(settings.off || []).includes(site.id);
}

export function matchPatterns(site) {
  return site.hosts.flatMap((h) => [`https://${h}/*`, `https://*.${h}/*`]);
}

export function siteForUrl(url, sites) {
  let host;
  try { host = new URL(url).hostname; } catch { return null; }
  return sites.find((s) => s.hosts.some((h) => host === h || host.endsWith("." + h))) || null;
}

// "(3) Facebook", "(99+) Feed | LinkedIn", "Facebook" → 3, 99, 0
export function titleCount(title) {
  const m = /^\s*\((\d+)\+?\)/.exec(title || "");
  return m ? Number(m[1]) : 0;
}

// X's badge_count answer → { n: unread notifications, dm: unread messages }.
export function parseX(json) {
  const n = json?.ntab_unread_count, dm = json?.dm_unread_count;
  if (!Number.isFinite(n) && !Number.isFinite(dm)) return null;
  return { n: Number.isFinite(n) ? n : 0, dm: Number.isFinite(dm) ? dm : 0 };
}

// Reddit's /api/me.json → { n: unread inbox items }, or "signedOut".
export function parseReddit(json) {
  if (json && typeof json === "object" && !json.data && Object.keys(json).length === 0) return "signedOut";
  const n = json?.data?.inbox_count;
  return Number.isFinite(n) ? { n } : null;
}

// What to tell the user for one site, given its previous and new counts.
// Only rises are announced; a drop (read on the phone, say) just lowers the
// baseline, so the next new one is announced again. No previous count (first
// check, just signed in, tab just opened) means no alert for old unread items.
export function alertsFor(site, prev, next, settings) {
  if (!prev) return [];
  const out = [];
  if (next.n > prev.n) out.push({ site: site.id, name: site.name, kind: "notifications", added: next.n - prev.n, total: next.n });
  if (site.hasDm && settings.notifyMessages && (next.dm || 0) > (prev.dm || 0)) {
    out.push({ site: site.id, name: site.name, kind: "messages", added: next.dm - (prev.dm || 0), total: next.dm });
  }
  return out;
}

export function alertText(a) {
  const word = a.kind === "messages" ? "message" : "notification";
  const s = (k) => `${k} ${word}${k === 1 ? "" : "s"}`;
  return {
    title: a.added === 1 ? `New ${word} on ${a.name}` : `${a.added} new ${word}s on ${a.name}`,
    message: a.total > a.added ? `${s(a.total)} unread in total.` : `Click to open ${a.name}.`,
  };
}

export function siteTotal(site, c, settings) {
  if (!c) return 0;
  return (c.n || 0) + (site.hasDm && settings.notifyMessages ? c.dm || 0 : 0);
}

export function badgeText(counts, settings) {
  if (!settings.showBadge || !settings.enabled) return "";
  const total = allSites(settings).filter((s) => siteOn(s, settings)).reduce((t, s) => t + siteTotal(s, counts?.[s.id], settings), 0);
  return total > 0 ? (total > 99 ? "99+" : String(total)) : "";
}
