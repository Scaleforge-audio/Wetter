import { fetchForecast, fetchEnsemble, fetchAlerts, fetchStation, fetchNowcast, geocode, reverse } from "./api.js";
import { setTZ, hm, deg, esc, dayName } from "./fmt.js";
import { sunTimes, sunPosition } from "./sun.js";
import { createSky } from "./sky.js";
import { heroView, heroSky, nowcastView, warningsView, rabbitsView, hoursView, daysView, ensembleStats } from "./views.js";
import { createRadar } from "./radar.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem("klar." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("klar." + k, JSON.stringify(v)); } catch { /* voll oder gesperrt */ } },
  del(k) { try { localStorage.removeItem("klar." + k); } catch { /* egal */ } },
};

const DEFAULTS = [
  { id: "oberzent", name: "Oberzent", region: "Odenwaldkreis, Hessen", lat: 49.5677, lon: 8.9737 },
  { id: "heilbronn", name: "Heilbronn", region: "Baden-Württemberg", lat: 49.1427, lon: 9.2109 },
];
let places = store.get("places", null) || DEFAULTS.slice();
let currentId = store.get("current", places[0].id);
let tab = store.get("tab", "hours");
const data = new Map();
const ensCache = new WeakMap();

const sky = createSky($("sky"));
const radar = createRadar({ map: $("map"), play: $("rPlay"), slider: $("rSlider"), now: $("rNow"), time: $("rTime"), kind: $("rKind"), ticks: $("rTicks") });

const place = () => places.find((p) => p.id === currentId) || places[0];
function savePlaces() { store.set("places", places); store.set("current", currentId); }
function cached(id) {
  if (!data.has(id)) { const c = store.get("data." + id, null); if (c) data.set(id, c); }
  return data.get(id);
}
function stats(d) {
  if (!d.ens) return null;
  if (!ensCache.has(d.ens)) ensCache.set(d.ens, ensembleStats(d.ens));
  return ensCache.get(d.ens);
}

let toastT = 0;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 4200);
}

// ---------- Daten laden ----------
let inflight = null;
async function refresh(force = false) {
  const p = place(), id = p.id;
  const d = cached(id) || {};
  const age = d.ts ? Date.now() - d.ts : Infinity;
  if (!force && age < 10 * 60000) {
    if (!d.ncTs || Date.now() - d.ncTs > 5 * 60000) refreshNowcast(p);
    return;
  }
  if (inflight && inflight.id === id) return inflight.run;
  $("refreshBtn").classList.add("busy");
  const needEns = force || !d.ensTs || Date.now() - d.ensTs > 60 * 60000;
  const run = (async () => {
    const [fc, ens, alerts, station, nc] = await Promise.allSettled([
      fetchForecast(p), needEns ? fetchEnsemble(p) : Promise.resolve(null), fetchAlerts(p), fetchStation(p), fetchNowcast(p),
    ]);
    const next = { ...(cached(id) || {}) };
    if (fc.status === "fulfilled") { next.fc = fc.value; next.ts = Date.now(); next.offline = false; } else next.offline = true;
    if (ens.status === "fulfilled" && ens.value) { next.ens = ens.value; next.ensTs = Date.now(); }
    if (alerts.status === "fulfilled") next.alerts = alerts.value;
    if (station.status === "fulfilled") next.station = station.value;
    else if (fc.status === "fulfilled") next.station = null;
    if (nc.status === "fulfilled") { next.nc = nc.value; next.ncTs = Date.now(); }
    data.set(id, next);
    if (next.fc) store.set("data." + id, next);
    if (fc.status === "rejected") {
      toast(next.fc ? "Keine Verbindung. Du siehst den letzten Stand." : "Keine Verbindung zu den Wetterdiensten. Prüfe das Internet und tippe auf Aktualisieren.");
    }
    if (currentId === id) render();
  })();
  inflight = { id, run };
  try { await run; } finally { inflight = null; $("refreshBtn").classList.remove("busy"); }
}

async function refreshNowcast(p) {
  try {
    const nc = await fetchNowcast(p);
    const d = cached(p.id);
    if (!d) return;
    d.nc = nc; d.ncTs = Date.now();
    store.set("data." + p.id, d);
    if (currentId === p.id) render(true);
  } catch { /* Radar gerade nicht erreichbar */ }
}

// ---------- Darstellung ----------
let lastModel = null;
function render(soft = false) {
  const p = place();
  $("placeName").textContent = p.name;
  $("placeSub").textContent = p.region || "Orte verwalten";
  renderChips();
  const d = cached(p.id);
  if (!d || !d.fc) {
    $("hero").innerHTML = d && d.offline
      ? `<p class="hero-loading">Keine Verbindung zu den Wetterdiensten. Prüfe das Internet und tippe oben rechts auf Aktualisieren.</p>`
      : `<p class="hero-loading">Lade Wetter für ${esc(p.name)} …</p>`;
    ["nowcast", "rabbits"].forEach((id) => ($(id).hidden = true));
    $("warnings").innerHTML = "";
    ["tab-hours", "tab-days"].forEach((id) => ($(id).innerHTML = ""));
    return;
  }
  setTZ(d.fc.timezone);
  const now = Date.now();
  const m = {
    place: p, fc: d.fc, ens: stats(d), alerts: d.alerts, station: d.station, nc: d.nc, ts: d.ts, now, offline: d.offline,
    sunDays: [0, 1, 2].filter((i) => d.fc.daily.time[i] != null).map((i) => sunTimes(d.fc.daily.time[i] * 1000, p.lat, p.lon)),
  };
  lastModel = m;
  $("hero").innerHTML = heroView(m);
  const nc = $("nowcast");
  nc.innerHTML = nowcastView(m, nc.clientWidth ? nc.clientWidth - 34 : Math.min(window.innerWidth, 420) - 66);
  nc.hidden = !nc.innerHTML;
  $("warnings").innerHTML = warningsView(m);
  const rb = $("rabbits");
  rb.innerHTML = rabbitsView(m); rb.hidden = false;
  if (!soft) {
    const hs = $("tab-hours");
    const scroll = hs.querySelector(".hscroll")?.scrollLeft || 0;
    hs.innerHTML = hoursView(m);
    const sc = hs.querySelector(".hscroll"); if (sc) sc.scrollLeft = scroll;
    renderDays();
  }
  // Himmel
  const el = sunPosition(new Date(now), p.lat, p.lon).elevation;
  const top = sky.set({ ...heroSky(m), el });
  document.querySelector('meta[name="theme-color"]').content = top;
  document.title = `${deg(d.fc.current.temperature_2m)} in ${p.name} | Klar`;
  $("footStand").textContent = `Zuletzt aktualisiert: ${dayName(new Date(d.ts), new Date(now))} ${hm(new Date(d.ts))} Uhr`;
  if (tab === "radar") radar.open(p, d.nc && d.nc.ref).catch(() => {});
}
function renderDays() {
  if (!lastModel) return;
  const el = $("tab-days");
  const w = el.clientWidth || $("tab-hours").clientWidth || Math.min(window.innerWidth - 32, 700);
  el.innerHTML = daysView(lastModel, w);
}

function renderChips() {
  const c = $("placeChips");
  if (places.length < 2) { c.innerHTML = ""; c.hidden = true; return; }
  c.hidden = false;
  c.innerHTML = places.map((p) => {
    const d = cached(p.id);
    const t = d && d.fc ? `<span class="chip-t">${deg(d.fc.current.temperature_2m)}</span>` : "";
    return `<button data-id="${esc(p.id)}" aria-current="${p.id === currentId}">${esc(p.name)}${t}</button>`;
  }).join("");
}
$("placeChips").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (b) select(b.dataset.id);
});

function select(id) {
  if (!places.some((p) => p.id === id)) return;
  currentId = id; savePlaces();
  render();
  refresh();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- Tabs ----------
const TABS = ["hours", "days", "radar"];
function setTab(t, focus = false) {
  tab = TABS.includes(t) ? t : "hours";
  store.set("tab", tab);
  TABS.forEach((k) => {
    const btn = $("t-" + k), pnl = $("tab-" + k), on = k === tab;
    btn.setAttribute("aria-selected", on); btn.tabIndex = on ? 0 : -1;
    pnl.hidden = !on;
    if (on && focus) btn.focus();
  });
  if (tab === "days") renderDays();
  if (tab === "radar") { const d = cached(place().id); radar.open(place(), d && d.nc && d.nc.ref).catch(() => toast("Radarkarte konnte nicht geladen werden.")); }
  else radar.close();
}
document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest('[role="tab"]');
  if (b) setTab(b.id.slice(2));
});
document.querySelector(".tabs").addEventListener("keydown", (e) => {
  const i = TABS.indexOf(tab);
  if (e.key === "ArrowRight") setTab(TABS[(i + 1) % 3], true);
  else if (e.key === "ArrowLeft") setTab(TABS[(i + 2) % 3], true);
});

// ---------- Orte ----------
const dlg = $("placesDlg");
function renderSaved() {
  $("placeSaved").innerHTML = places.map((p) => `<li aria-current="${p.id === currentId}">
    <button class="pick" data-id="${esc(p.id)}"><b>${esc(p.name)}</b><span>${esc(p.region || "")}</span></button>
    ${places.length > 1 ? `<button class="del" data-del="${esc(p.id)}" aria-label="${esc(p.name)} entfernen"><svg aria-hidden="true"><use href="#i-close"/></svg></button>` : ""}
  </li>`).join("");
}
$("placeBtn").addEventListener("click", () => {
  renderSaved();
  $("placeResults").innerHTML = ""; $("placeSearch").value = "";
  dlg.showModal();
});
$("placesClose").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
$("placeSaved").addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    const id = del.dataset.del;
    places = places.filter((p) => p.id !== id);
    store.del("data." + id); data.delete(id);
    if (currentId === id) currentId = places[0].id;
    savePlaces(); renderSaved(); render(); refresh();
    return;
  }
  const pick = e.target.closest("[data-id]");
  if (pick) { dlg.close(); select(pick.dataset.id); }
});
let searchT = 0, lastResults = [];
$("placeSearch").addEventListener("input", (e) => {
  clearTimeout(searchT);
  const qv = e.target.value.trim();
  if (qv.length < 2) { $("placeResults").innerHTML = ""; return; }
  searchT = setTimeout(async () => {
    try {
      lastResults = await geocode(qv);
      $("placeResults").innerHTML = lastResults.length
        ? lastResults.map((r, i) => `<li><button data-r="${i}"><b>${esc(r.name)}</b><span>${esc(r.detail)}</span></button></li>`).join("")
        : `<li class="empty">Kein Ort gefunden. Versuch es mit einem anderen Namen oder einer größeren Stadt in der Nähe.</li>`;
    } catch {
      $("placeResults").innerHTML = `<li class="empty">Suche gerade nicht erreichbar. Prüfe die Internetverbindung.</li>`;
    }
  }, 300);
});
$("placeResults").addEventListener("click", (e) => {
  const b = e.target.closest("[data-r]");
  if (!b) return;
  const r = lastResults[+b.dataset.r];
  if (!places.some((p) => p.id === r.id)) places.push({ id: r.id, name: r.name, region: r.region, lat: r.lat, lon: r.lon });
  dlg.close();
  select(r.id);
  toast(`${r.name} gespeichert`);
});

function useGps() {
  if (!navigator.geolocation) { toast("Dieses Gerät kann den Standort nicht bestimmen."); return; }
  const btn = $("gpsBtn");
  btn.classList.add("busy");
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude: lat, longitude: lon } = pos.coords;
    let info = { name: "Mein Standort", region: "" };
    try { info = await reverse(lat, lon); } catch { /* Name bleibt "Mein Standort" */ }
    const gp = { id: "gps", name: info.name, region: info.region ? `Aktueller Standort, ${info.region}` : "Aktueller Standort", lat, lon, gps: true };
    places = [gp, ...places.filter((p) => p.id !== "gps")];
    data.delete("gps"); store.del("data.gps");
    btn.classList.remove("busy");
    if (dlg.open) dlg.close();
    select("gps");
  }, (err) => {
    btn.classList.remove("busy");
    toast(err.code === 1 ? "Standortzugriff ist blockiert. Erlaube ihn in den Einstellungen des Browsers." : "Standort konnte nicht bestimmt werden.");
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60000 });
}
$("gpsBtn").addEventListener("click", useGps);
$("placeGps").addEventListener("click", useGps);
$("refreshBtn").addEventListener("click", () => refresh(true));

// ---------- Zeitsteuerung ----------
setInterval(() => { if (!document.hidden && lastModel) render(true); }, 60000);
setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
window.addEventListener("online", () => refresh(true));
let rzT = 0;
window.addEventListener("resize", () => {
  clearTimeout(rzT);
  rzT = setTimeout(() => {
    if (!lastModel) return;
    const nc = $("nowcast");
    nc.innerHTML = nowcastView(lastModel, nc.clientWidth - 34);
    if (tab === "days") renderDays();
  }, 200);
});

// ---------- Start ----------
setTab(tab);
render();
refresh();
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* ohne Offline-Modus weiter */ });
}
