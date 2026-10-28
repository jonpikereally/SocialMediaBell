import { REPO, logError } from "./shared/errors.js";
import {
  DEFAULTS, allSites, siteOn, matchPatterns, siteForUrl, titleCount,
  parseX, parseReddit, alertsFor, alertText, badgeText,
} from "./shared/core.js";

const FEED = `https://raw.githubusercontent.com/${REPO}/main/updates/latest.json`;
const VERSION = chrome.runtime.getManifest().version;

// The public bearer token x.com's web app sends with every API call.
const X_BEARER = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
// A title site's tab gets this long to load and settle before its count can
// trigger alerts, so opening Facebook with 5 unread doesn't announce all 5.
const SETTLE_MS = 15000;

const coded = (code, msg, extra) => Object.assign(new Error(msg), { code }, extra);

async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...settings };
}

// ---------- api sites ----------
// Each one: how to ask, and the error codes for its area (x 2xx, reddit 4xx).

const API = {
  x: {
    url: "https://x.com/i/api/2/badge_count/badge_count.json?supports_ntab_urt=1",
    codes: { refused: "SB-202", network: "SB-203", unreadable: "SB-204", limited: "SB-205" },
    async headers() {
      const csrf = await cookie("https://x.com/", "ct0");
      if (!csrf || !(await cookie("https://x.com/", "auth_token"))) return null;   // signed out
      return { authorization: X_BEARER, "x-csrf-token": csrf, "x-twitter-auth-type": "OAuth2Session", "x-twitter-active-user": "yes" };
    },
    parse: parseX,
  },
  reddit: {
    url: "https://www.reddit.com/api/me.json?raw_json=1",
    codes: { refused: "SB-402", network: "SB-403", unreadable: "SB-404", limited: "SB-405" },
    async headers() {
      if (!(await cookie("https://www.reddit.com/", "reddit_session"))) return null;
      return {};
    },
    parse: parseReddit,
  },
};

async function cookie(url, name) {
  return (await chrome.cookies.get({ url, name }))?.value || null;
}

async function readResponse(api, status, reset, text) {
  if (status === 429) throw coded(api.codes.limited, `HTTP 429, resets ${reset}`, { resetAt: Number(reset) * 1000 || Date.now() + 15 * 60e3 });
  if (status === 401 || status === 403) throw coded(api.codes.refused, `HTTP ${status}`);
  if (status < 200 || status >= 300) throw coded(api.codes.unreadable, `HTTP ${status}`);
  let json;
  try { json = JSON.parse(text); } catch { throw coded(api.codes.unreadable, `not JSON: ${text.slice(0, 200)}`); }
  const counts = api.parse(json);
  if (!counts) throw coded(api.codes.unreadable, `no counts in: ${text.slice(0, 200)}`);
  return counts;
}

// Straight from the service worker, using the browser's cookies for the site.
async function fetchDirect(api, headers) {
  let res;
  try {
    res = await fetch(api.url, { credentials: "include", cache: "no-store", headers });
  } catch (e) {
    throw coded(api.codes.network, `${api.url}: ${e.message}`);
  }
  return readResponse(api, res.status, res.headers.get("x-rate-limit-reset") || res.headers.get("x-ratelimit-reset"), await res.text());
}

// Fallback: the same request inside an open tab of the site, where it is a
// same-origin call exactly like the site's own.
async function fetchInTab(api, site, headers) {
  const [tab] = await chrome.tabs.query({ url: matchPatterns(site), discarded: false });
  if (!tab) return null;
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [api.url, headers],
    func: async (url, h) => {
      try {
        const r = await fetch(url, { credentials: "include", cache: "no-store", headers: h });
        return { status: r.status, reset: r.headers.get("x-rate-limit-reset") || r.headers.get("x-ratelimit-reset"), body: await r.text() };
      } catch (e) {
        return { error: String(e) };
      }
    },
  });
  if (!result) return null;
  if (result.error) throw coded(api.codes.network, `in tab: ${result.error}`);
  return readResponse(api, result.status, result.reset, result.body);
}

async function askApi(site) {
  const api = API[site.id];
  const headers = await api.headers();
  if (!headers) return "signedOut";
  try {
    return await fetchDirect(api, headers);
  } catch (e) {
    if (e.code !== api.codes.refused && e.code !== api.codes.network) throw e;
    let viaTab;
    try { viaTab = await fetchInTab(api, site, headers); } catch (e2) {
      throw e2.code ? e2 : coded(e.code, `${e.message}; tab fallback: ${e2.message}`);
    }
    if (viaTab) return viaTab;
    throw e;
  }
}

// ---------- title sites ----------

async function readTitles(site) {
  const tabs = await chrome.tabs.query({ url: matchPatterns(site) });
  const loaded = tabs.filter((t) => t.status === "complete" && t.title);
  return { tabs: tabs.length, n: Math.max(0, ...loaded.map((t) => titleCount(t.title))) };
}

// ---------- the check ----------
// One pass over every site. api sites are asked only when `apis` is true
// (the timer, Check now); title sites are cheap and read every time.

let running = null, again = false;

async function check({ apis = false, manual = false } = {}) {
  if (running) { again = again || apis || "titles"; return running; }
  running = (async () => {
    const settings = await getSettings();
    const store = await chrome.storage.local.get(["counts", "status", "waitUntil"]);
    const counts = { ...(store.counts || {}) }, status = { ...(store.status || {}) }, waitUntil = { ...(store.waitUntil || {}) };
    const { since = {} } = await chrome.storage.session.get("since");
    const sites = allSites(settings);
    const now = Date.now();

    for (const site of sites) {
      const old = status[site.id];
      if (!siteOn(site, settings)) { status[site.id] = { state: "off" }; continue; }
      if (site.kind === "api" && !apis) continue;
      if (site.kind === "api" && !manual && now < (waitUntil[site.id] || 0)) continue;
      try {
        let next;
        if (site.kind === "api") {
          next = await askApi(site);
          if (next === "signedOut") {
            // Forget old counts, so signing back in doesn't announce what piled up meanwhile.
            delete counts[site.id];
            status[site.id] = { state: "signedOut", checkedAt: now };
            continue;
          }
        } else {
          const t = await readTitles(site);
          if (!t.tabs) {
            delete counts[site.id];
            delete since[site.id];
            status[site.id] = { state: "noTab", checkedAt: now };
            continue;
          }
          since[site.id] ||= now;
          next = { n: t.n };
          status[site.id] = { state: "ok", checkedAt: now, tabs: t.tabs };
          if (now - since[site.id] < SETTLE_MS) {   // still settling: set the baseline quietly
            counts[site.id] = { ...next, t: now };
            continue;
          }
        }
        for (const a of alertsFor(site, counts[site.id], next, settings)) notify(a);
        counts[site.id] = { ...next, t: now };
        if (site.kind === "api") { status[site.id] = { state: "ok", checkedAt: now }; delete waitUntil[site.id]; }
      } catch (e) {
        const code = e.code || (site.kind === "title" ? "SB-501" : "SB-999");
        status[site.id] = { state: "error", checkedAt: now, error: { code, details: e.stack || e.message, t: now } };
        if (e.resetAt) waitUntil[site.id] = e.resetAt;
        // Log each problem once when it starts, not on every failed check.
        if (manual || old?.error?.code !== code) await logError(code, `${site.name}: ${e.stack || e.message}`);
      }
    }
    // Drop entries for custom sites that were removed.
    const ids = new Set(sites.map((s) => s.id));
    for (const o of [counts, status, waitUntil, since]) for (const k of Object.keys(o)) if (!ids.has(k)) delete o[k];

    await chrome.storage.local.set({ counts, status, waitUntil });
    await chrome.storage.session.set({ since });
    setBadge(counts, status, settings);
    return status;
  })();
  try { return await running; } finally {
    running = null;
    if (again) { const apis = again === true; again = false; check({ apis }); }
  }
}

function setBadge(counts, status, settings) {
  const text = badgeText(counts, settings);
  const problems = Object.values(status).filter((s) => s.state === "error" && !/^SB-[24]05$/.test(s.error.code));
  chrome.action.setBadgeText({ text: text || (problems.length && settings.enabled ? "!" : "") });
  chrome.action.setBadgeBackgroundColor({ color: problems.length && !text ? "#c62828" : "#1d9bf0" });
  chrome.action.setBadgeTextColor?.({ color: "#ffffff" });
  const parts = allSites(settings).filter((s) => counts[s.id] && (counts[s.id].n || counts[s.id].dm))
    .map((s) => `${s.name} ${counts[s.id].n}${s.hasDm && counts[s.id].dm ? ` + ${counts[s.id].dm} messages` : ""}`);
  chrome.action.setTitle({
    title: !settings.enabled ? "Social Media Bell: off"
      : problems.length ? `Social Media Bell: problem ${problems[0].error.code} (click for details)`
      : `Social Media Bell${parts.length ? `: ${parts.join(", ")} unread` : ": nothing unread"}`,
  });
}

// ---------- desktop alerts ----------

function notify(a) {
  const { title, message } = alertText(a);
  chrome.notifications.create(`sb|${a.site}|${a.kind}|${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message,
    priority: 1,
  });
}

async function openSite(id, kind) {
  const settings = await getSettings();
  const site = allSites(settings).find((s) => s.id === id);
  if (!site) return;
  const url = kind === "messages" && site.messages ? site.messages : site.home;
  const tabs = await chrome.tabs.query({ url: matchPatterns(site) });
  const tab = tabs.find((t) => t.url?.startsWith(url)) || tabs.find((t) => t.pinned) || tabs[0];
  if (tab) {
    // Title sites keep counting in their tab, so don't navigate it away; just bring it forward.
    const go = site.kind === "api" && !tab.url?.startsWith(url);
    await chrome.tabs.update(tab.id, { active: true, ...(go ? { url } : {}) });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
  // Opening the page marks things read on the site; check soon so the badge follows.
  if (site.kind === "api") setTimeout(() => check({ apis: true }), 8000);
}

chrome.notifications.onClicked.addListener((nid) => {
  chrome.notifications.clear(nid);
  const [, id, kind] = nid.split("|");
  openSite(id, kind).catch((e) => logError("SB-999", e.stack || e));
});

// ---------- watching tab titles ----------

let titleTimer = null;
function titlesSoon() {
  clearTimeout(titleTimer);
  titleTimer = setTimeout(() => check().catch((e) => logError("SB-999", e.stack || e)), 800);
}

chrome.tabs.onUpdated.addListener(async (_id, info, tab) => {
  if (!("title" in info) && !("status" in info) && !("url" in info)) return;
  if (!tab.url) return;   // no permission for this site's tabs
  const settings = await getSettings();
  if (siteForUrl(tab.url, allSites(settings))?.kind === "title") titlesSoon();
});
chrome.tabs.onRemoved.addListener(() => titlesSoon());

// ---------- messages from the popup ----------

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "checkNow") {
    check({ apis: true, manual: true }).then(reply);
    return true;
  } else if (msg.type === "checkUpdates") {
    checkForUpdates(true).then(reply);
    return true;
  } else if (msg.type === "open") {
    openSite(msg.site, msg.kind).then(() => reply(true), (e) => { logError("SB-999", e.stack || e); reply(false); });
    return true;
  } else if (msg.type === "testAlert") {
    notify({ site: "x", name: "Social Media Bell", kind: "notifications", added: 1, total: 1 });
  } else if (msg.type === "settingsChanged") {
    schedule().then(() => check({ apis: true, manual: true })).then(reply);
    return true;
  }
});

// ---------- updates ----------
// Unpacked extensions can't replace their own files, so this only tells you
// a newer version exists; the popup shows how to install it.

function newer(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function checkForUpdates(manual = false) {
  const settings = await getSettings();
  const feed = settings.updateSource || FEED;
  let state;
  try {
    let res;
    try {
      res = await fetch(feed, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      throw Object.assign(new Error(`${feed}: ${e.message}`), { code: "SB-101" });
    }
    let latest;
    try {
      latest = await res.json();
      if (!latest.version) throw new Error("no version field");
    } catch (e) {
      throw Object.assign(new Error(`${feed}: ${e.message}`), { code: "SB-102" });
    }
    state = {
      checkedAt: Date.now(),
      current: VERSION,
      latest: latest.version,
      available: newer(latest.version, VERSION),
      notes: latest.notes || "",
      url: latest.url ? new URL(latest.url, feed).toString() : null,
    };
  } catch (e) {
    state = { checkedAt: Date.now(), current: VERSION, available: false, error: { code: e.code || "SB-999", details: e.message } };
    if (manual) await logError(state.error.code, state.error.details);
  }
  await chrome.storage.local.set({ update: state });
  return state;
}

// ---------- schedule ----------

async function schedule() {
  const { intervalMin } = await getSettings();
  await chrome.alarms.create("check", { delayInMinutes: 0.1, periodInMinutes: Math.max(0.5, intervalMin) });
  if (!(await chrome.alarms.get("updates"))) chrome.alarms.create("updates", { periodInMinutes: 6 * 60 });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "check") check({ apis: true }).catch((e) => logError("SB-999", e.stack || e));
  else if (a.name === "updates") checkForUpdates();
});

// Signing in or out shows up as the session cookie changing: check right away.
chrome.cookies.onChanged.addListener(({ cookie: c }) => {
  if ((c.name === "auth_token" && /(^|\.)x\.com$/.test(c.domain)) || (c.name === "reddit_session" && /(^|\.)reddit\.com$/.test(c.domain))) {
    setTimeout(() => check({ apis: true }), 3000);
  }
});

chrome.runtime.onStartup.addListener(() => { schedule(); setTimeout(checkForUpdates, 5000); });
chrome.runtime.onInstalled.addListener(() => { schedule(); setTimeout(checkForUpdates, 5000); });
