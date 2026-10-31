// Regenradar: DWD-WMS (dwd:Niederschlagsradar), ein Bild pro Zeitpunkt für den sichtbaren Ausschnitt
import { radarMapUrl } from "./api.js";
import { hm, dur } from "./fmt.js";

const STEP = 5 * 60000, FRAME = 10 * 60000, PAST = 6, FUTURE = 12; // −60 min … +120 min in 10-min-Schritten
let L = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((res, rej) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "vendor/leaflet/leaflet.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "vendor/leaflet/leaflet.js";
    s.onload = () => res(window.L);
    s.onerror = () => rej(new Error("Leaflet konnte nicht geladen werden"));
    document.head.appendChild(s);
  });
}

export function createRadar(els) {
  let map, me, place = null, ref = null;
  let frames = [], view = null, idx = PAST, timer = 0, playing = false, shown = null;
  let queue = [], active = 0, gen = 0, loadingEl = null;

  async function init() {
    L = await loadLeaflet();
    map = L.map(els.map, { zoomControl: false, minZoom: 5, maxZoom: 12, attributionControl: true, zoomSnap: 1 });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: "topright", zoomInTitle: "Hineinzoomen", zoomOutTitle: "Herauszoomen" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> | Radar © <a href="https://www.dwd.de" target="_blank" rel="noopener">DWD</a>',
    }).addTo(map);
    const pane = map.createPane("radar");
    pane.style.zIndex = 350; pane.style.pointerEvents = "none";
    loadingEl = document.createElement("div");
    loadingEl.className = "radar-loading"; loadingEl.hidden = true;
    els.map.parentElement.appendChild(loadingEl);
    let t = 0;
    map.on("moveend zoomend", () => { clearTimeout(t); t = setTimeout(() => { if (!covers()) rebuild(); }, 250); });
    els.play.addEventListener("click", () => (playing ? pause() : play()));
    els.slider.addEventListener("input", () => { pause(); show(+els.slider.value); });
    els.now.addEventListener("click", () => { pause(); if (place) map.setView([place.lat, place.lon], 8); show(PAST); });
  }

  function anchor() {
    // letzte Messung: aus dem Punkt-Nowcast, sonst geschätzt (Radar ist ca. 5–10 min alt)
    const r = ref && Date.now() - ref < 30 * 60000 ? ref : Math.floor((Date.now() - 8 * 60000) / STEP) * STEP;
    return r;
  }

  function makeView() {
    const size = map.getSize(), crs = L.CRS.EPSG3857, b = map.getBounds();
    const sw = crs.project(b.getSouthWest()), ne = crs.project(b.getNorthEast());
    const mx = (ne.x - sw.x) * 0.25, my = (ne.y - sw.y) * 0.25;
    let w = size.x * 1.5, h = size.y * 1.5;
    const sc = Math.min(1, 1280 / Math.max(w, h));
    w = Math.round(w * sc); h = Math.round(h * sc);
    const x0 = sw.x - mx, x1 = ne.x + mx, y0 = sw.y - my, y1 = ne.y + my;
    return { zoom: map.getZoom(), bbox: [x0, y0, x1, y1], w, h, bounds: L.latLngBounds(crs.unproject(L.point(x0, y0)), crs.unproject(L.point(x1, y1))) };
  }
  const covers = () => view && view.zoom === map.getZoom() && view.bounds.contains(map.getBounds());

  function rebuild() {
    gen++;
    frames.forEach((f) => f.ov && map.removeLayer(f.ov));
    queue = []; active = 0;
    view = makeView();
    const r = anchor();
    frames = [];
    for (let k = -PAST; k <= FUTURE; k++) frames.push({ t: r + k * FRAME, ov: null, state: "idle" });
    // Reihenfolge: aktueller Zeitpunkt, dann Vorhersage, dann Vergangenheit
    const order = [PAST, ...frames.map((_, i) => i).filter((i) => i > PAST), ...frames.map((_, i) => i).filter((i) => i < PAST).reverse()];
    order.forEach((i) => queue.push(i));
    ticks();
    pump();
    show(idx);
  }

  function pump() {
    const g = gen;
    while (active < 4 && queue.length) {
      const i = queue.shift(), f = frames[i];
      active++; f.state = "loading";
      const ov = L.imageOverlay(radarMapUrl(f.t, view.bbox, view.w, view.h), view.bounds, { pane: "radar", opacity: 0, interactive: false });
      f.ov = ov;
      const done = (ok) => {
        if (g !== gen) return;
        active--; f.state = ok ? "ready" : "failed";
        if (ok && i === idx) show(idx);
        status(); pump();
      };
      ov.once("load", () => done(true));
      ov.once("error", () => done(false));
      ov.addTo(map);
    }
    status();
  }
  function status() {
    const ready = frames.filter((f) => f.state === "ready").length;
    const pending = frames.filter((f) => f.state === "loading" || f.state === "idle").length;
    loadingEl.hidden = !pending;
    loadingEl.textContent = `Lade Radar ${ready}/${frames.length}`;
  }

  function show(i) {
    idx = Math.max(0, Math.min(frames.length - 1, i));
    els.slider.value = idx;
    const f = frames[idx];
    if (!f) return;
    const r = frames[PAST].t;
    els.time.textContent = hm(new Date(f.t));
    els.kind.textContent = f.t <= r ? (f.t === r ? "letzte Messung" : `Messung, vor ${dur(r - f.t)}`) : `Vorhersage, +${dur(f.t - r)}`;
    els.kind.className = f.t > r ? "fc" : "";
    if (f.state === "ready") {
      if (shown && shown !== f.ov) shown.setOpacity(0);
      f.ov.setOpacity(0.78);
      shown = f.ov;
    } else if (f.state === "failed" && shown) {
      shown.setOpacity(0); shown = null;
    }
  }

  function ticks() {
    const n = frames.length - 1;
    const lab = [[0, "−1 h"], [PAST, "jetzt"], [PAST + 6, "+1 h"], [n, "+2 h"]];
    els.ticks.innerHTML = lab.map(([i, t]) => `<span style="left:${(i / n) * 100}%">${t}</span>`).join("");
    els.slider.max = n;
  }

  function play() {
    playing = true;
    els.play.innerHTML = '<svg aria-hidden="true"><use href="#i-pause"/></svg>';
    els.play.setAttribute("aria-label", "Anhalten");
    const tick = () => {
      if (!playing) return;
      let j = idx + 1;
      while (j < frames.length && frames[j].state !== "ready") j++;
      if (j >= frames.length) { j = 0; while (j < frames.length && frames[j].state !== "ready") j++; }
      show(j);
      timer = setTimeout(tick, j === frames.length - 1 ? 1400 : j === PAST ? 900 : 520);
    };
    tick();
  }
  function pause() {
    playing = false; clearTimeout(timer);
    els.play.innerHTML = '<svg aria-hidden="true"><use href="#i-play"/></svg>';
    els.play.setAttribute("aria-label", "Abspielen");
  }

  let ready = null;
  return {
    async open(p, refTime) {
      if (!ready) ready = init();
      await ready;
      map.invalidateSize();
      const moved = !place || place.lat !== p.lat || place.lon !== p.lon;
      const newRef = refTime && refTime !== ref;
      place = p; if (refTime) ref = refTime;
      if (moved) {
        map.setView([p.lat, p.lon], 8, { animate: false });
        if (me) me.remove();
        me = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false, keyboard: false }).addTo(map);
      }
      // alte Bilder (> 10 min) oder neuer Ort -> neu laden
      if (moved || newRef || !frames.length || Date.now() - frames[PAST].t > 15 * 60000) { idx = PAST; rebuild(); }
    },
    close() { pause(); },
  };
}
