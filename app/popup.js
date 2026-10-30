import { describe, detailsText, logError, ERROR_HOVER, ERROR_LIST_URL, REPO } from "../src/shared/errors.js";
import { DEFAULTS, INTERVALS, SITES, allSites, siteOn, cleanDomain, matchPatterns, customSite } from "../src/shared/core.js";

const VERSION = chrome.runtime.getManifest().version;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clock = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} minute${m === 1 ? "" : "s"} ago` : clock(t);
};
const every = (m) => (m === 1 ? "minute" : `${m} minutes`);

let settings = { ...DEFAULTS };
const save = (patch) => guard("SB-301", async () => {
  settings = { ...settings, ...patch };
  await chrome.storage.local.set({ settings });
  await chrome.runtime.sendMessage({ type: "settingsChanged" });
  await render();
})();

// ---------- errors: code, hover text, "?" link, Copy Details ----------

function errorBanner(err, onDismiss, prefix = "") {
  const d = describe(err.code);
  const el = document.createElement("div");
  el.className = "banner error";
  el.title = ERROR_HOVER;
  el.innerHTML = `
    <span class="grow" title="${esc(ERROR_HOVER)}">⚠️ ${esc(prefix)}<span class="err-code" title="${esc(ERROR_HOVER)}">Error code: ${esc(d.code)}</span>
      <a class="help" href="${ERROR_LIST_URL}" target="_blank" title="${esc(ERROR_HOVER)}">?</a><br>
      <span title="${esc(ERROR_HOVER)}">${esc(d.summary)} ${esc(d.hint)}</span></span>
    <button class="btn copy">Copy Error Details</button>
    ${onDismiss ? `<button class="btn dismiss">Dismiss</button>` : ""}`;
  el.querySelector(".copy").onclick = async (e) => {
    await navigator.clipboard.writeText(detailsText(err, VERSION));
    e.target.textContent = "Copied";
  };
  const dismiss = el.querySelector(".dismiss");
  if (dismiss) dismiss.onclick = () => { el.remove(); onDismiss(); };
  return el;
}

function guard(code, fn) {
  return async (...args) => {
    try { return await fn(...args); } catch (e) {
      const c = e.code || code;
      await logError(c, e.stack || String(e)).catch(() => {});
      $("#banners").prepend(errorBanner({ code: c, details: e.stack || String(e), t: Date.now() }));
    }
  };
}

function updateBanner(u) {
  const el = document.createElement("div");
  el.className = "banner update";
  el.innerHTML = `<span class="grow">⬆︎ <strong>Social Media Bell v${esc(u.latest)} is available</strong> (you have v${esc(u.current)}).
    ${u.notes ? `<br>${esc(u.notes)}` : ""}
    <br>To install: download it, replace your SocialMediaBell folder with the new one, then click ↻ on Social Media Bell in your browser's extensions page.
    If you cloned the repo, run <code>git pull</code> instead. Your settings are kept either way.</span>
    ${u.url ? `<a class="btn" href="${esc(u.url)}" target="_blank">Download</a>` : ""}`;
  return el;
}

const passing = (code) => /^SB-[24]05$/.test(code);   // rate limits: shown on the site's row instead

function renderBanners(store, sites) {
  const box = $("#banners");
  box.innerHTML = "";
  // Each site's current problem stays up until a check succeeds.
  const current = new Set();
  for (const s of sites) {
    const st = store.status?.[s.id];
    if (st?.state === "error" && !passing(st.error.code) && siteOn(s, settings)) {
      current.add(st.error.code);
      box.append(errorBanner(st.error, null, `${s.name}: `));
    }
  }
  // A logged site error ("X: ...") is over once that site has checked fine since.
  const recovered = (e) => sites.some((s) => e.details?.startsWith(`${s.name}: `)
    && store.status?.[s.id]?.state !== "error" && store.status?.[s.id]?.checkedAt > e.t);
  const seen = settings.errorsSeenAt || 0;
  for (const err of (store.errors || []).filter((e) => e.t > seen && !current.has(e.code) && !passing(e.code) && !recovered(e)).slice(-2).reverse()) {
    box.append(errorBanner(err, () => save({ errorsSeenAt: err.t })));
  }
  if (store.update && store.update.available) box.prepend(updateBanner(store.update));
}

// ---------- main view ----------

function siteNote(site, st, waitUntil) {
  if (!st) return { text: "Not checked yet." };
  switch (st.state) {
    case "signedOut": return { text: `Not signed in to ${site.name} in this browser.`, dim: true };
    case "noTab": return { text: `Open a ${site.name} tab to get alerts.`, dim: true };
    case "error":
      if (passing(st.error.code) && waitUntil > Date.now()) return { text: `⏳ ${st.error.code}: ${site.name} asked to slow down. Back at ${clock(waitUntil)}.`, coded: true };
      return { text: `⚠️ ${st.error.code}: see above.`, coded: true };
    case "ok":
      return { text: site.kind === "title" ? `Watching ${st.tabs} tab${st.tabs === 1 ? "" : "s"}.` : `Checked ${ago(st.checkedAt)}.` };
    default: return { text: "" };
  }
}

function renderSites(store, sites) {
  const on = sites.filter((s) => siteOn(s, settings));
  $("#siteList").innerHTML = on.map((s) => {
    const c = store.counts?.[s.id];
    const note = siteNote(s, store.status?.[s.id], store.waitUntil?.[s.id] || 0);
    const n = c ? c.n : "–";
    const dm = s.hasDm && settings.notifyMessages && c ? `<span class="dm" data-kind="messages" title="Unread direct messages: open ${esc(s.name)} messages">✉️ ${c.dm}</span>` : "";
    return `<li><button class="site ${c && (c.n || (s.hasDm && c.dm)) ? "unread" : ""} ${note.dim ? "dim" : ""}" data-id="${esc(s.id)}" title="Open ${esc(s.name)}">
      <span class="icon">${esc(s.icon)}</span>
      <span class="name">${esc(s.name)}<br><span class="note" ${note.coded ? `title="${esc(ERROR_HOVER)}"` : ""}>${esc(note.text)}</span></span>
      ${dm}<span class="num">${n}</span></button></li>`;
  }).join("") || `<li class="muted">${settings.enabled ? "Every site is turned off. Turn some on under Sites." : ""}</li>`;
  for (const b of $("#siteList").querySelectorAll(".site")) {
    b.onclick = (e) => {
      const kind = e.target.closest(".dm") ? "messages" : "notifications";
      chrome.runtime.sendMessage({ type: "open", site: b.dataset.id, kind }).then(() => window.close());
    };
  }

  $("#siteToggles").innerHTML = sites.map((s) => `
    <label class="check toggle"><input type="checkbox" data-id="${esc(s.id)}" ${(settings.off || []).includes(s.id) ? "" : "checked"}>
      <span>${esc(s.icon)} ${esc(s.name)}</span>
      ${s.custom ? `<button type="button" class="x" data-remove="${esc(s.name)}" title="Remove ${esc(s.name)}" aria-label="Remove ${esc(s.name)}">×</button>` : ""}</label>`).join("");
  for (const i of $("#siteToggles").querySelectorAll("input")) {
    i.onchange = () => {
      const off = new Set(settings.off || []);
      i.checked ? off.delete(i.dataset.id) : off.add(i.dataset.id);
      save({ off: [...off] });
    };
  }
  for (const b of $("#siteToggles").querySelectorAll("[data-remove]")) {
    b.onclick = (e) => {
      e.preventDefault();
      const d = b.dataset.remove;
      chrome.permissions.remove({ origins: matchPatterns(customSite(d)) }).catch(() => {});
      save({ custom: settings.custom.filter((x) => x !== d), off: (settings.off || []).filter((x) => x !== `custom:${d}`) });
    };
  }
}

async function render() {
  const store = await chrome.storage.local.get(null);
  settings = { ...DEFAULTS, ...(store.settings || {}) };
  const sites = allSites(settings);

  $("#enabled").checked = settings.enabled;
  for (const k of ["notifyMessages", "showBadge"]) $(`#${k}`).checked = settings[k];
  $("#intervalMin").innerHTML = INTERVALS.map((m) => `<option value="${m}" ${m === settings.intervalMin ? "selected" : ""}>${every(m)}</option>`).join("");
  $("#statusLine").textContent = settings.enabled ? "" : "Social Media Bell is off: no checks, no alerts.";
  $("#statusLine").hidden = settings.enabled;

  renderSites(store, sites);
  $("#updateSource").value = settings.updateSource || "";
  $("#versionLine").textContent = `You have Social Media Bell v${VERSION}.`;
  $("#ghLink").href = `https://github.com/${REPO}`;
  $("#errLink").href = ERROR_LIST_URL;
  renderBanners(store, sites);
}

// ---------- wiring ----------

$("#enabled").onchange = (e) => save({ enabled: e.target.checked });
for (const k of ["notifyMessages", "showBadge"]) $(`#${k}`).onchange = (e) => save({ [k]: e.target.checked });
$("#intervalMin").onchange = (e) => save({ intervalMin: Number(e.target.value) });
$("#updateSource").onchange = (e) => save({ updateSource: e.target.value.trim() });

$("#addForm").onsubmit = guard("SB-502", async (e) => {
  e.preventDefault();
  const raw = $("#addDomain").value;
  const d = cleanDomain(raw);
  const note = $("#addNote");
  note.hidden = false;
  if (!d) { note.textContent = `"${raw.trim()}" doesn't look like a website address. Try something like mastodon.social.`; return; }
  if (SITES.some((s) => s.hosts.some((h) => d === h || d.endsWith("." + h))) || settings.custom.includes(d)) {
    note.textContent = `${d} is already on the list.`;
    return;
  }
  // Seeing a site's tab titles needs the browser's permission for that site.
  const ok = await chrome.permissions.request({ origins: matchPatterns(customSite(d)) });
  if (!ok) throw Object.assign(new Error(`Permission for ${d} was declined`), { code: "SB-502" });
  $("#addDomain").value = "";
  note.textContent = `Added ${d}. It works if ${d} shows an unread count like "(3)" at the start of its tab title.`;
  await save({ custom: [...settings.custom, d] });
});

$("#checkNow").onclick = guard("SB-999", async (e) => {
  e.target.textContent = "Checking…";
  e.target.disabled = true;
  await chrome.runtime.sendMessage({ type: "checkNow" });
  e.target.textContent = "Check now";
  e.target.disabled = false;
  await render();
});
$("#testAlert").onclick = () => chrome.runtime.sendMessage({ type: "testAlert" });

$("#checkUpdates").onclick = guard("SB-999", async (e) => {
  e.target.textContent = "Checking for Updates…";
  const u = await chrome.runtime.sendMessage({ type: "checkUpdates" });
  e.target.textContent = "Check for Updates…";
  const out = $("#updateResult");
  out.innerHTML = "";
  if (u.error) out.append(errorBanner({ ...u.error, t: u.checkedAt }));
  else if (u.available) out.append(updateBanner(u));
  else out.textContent = `Social Media Bell is up to date (v${VERSION}).`;
});

chrome.storage.onChanged.addListener((ch) => { if (ch.counts || ch.status) guard("SB-301", render)(); });
guard("SB-301", render)().then(() => requestAnimationFrame(() => document.body.classList.add("ready")));
