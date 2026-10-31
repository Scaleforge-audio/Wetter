import { hm, hh, dm, dayName, when, deg, num, compass, esc, localHour, dayKey, pct } from "./fmt.js";
import { wmo, icon, isSnowCode } from "./icons.js";
import { rabbitAdvice } from "./rabbits.js";

const H = 3600000;
const svgAt = (s, x, y, size) => s.replace("<svg ", `<svg x="${x}" y="${y}" width="${size}" height="${size}" `);

// ---------- Niederschlag jetzt ----------
const rainWord = (mmh) => (mmh >= 15 ? "sehr stark" : mmh >= 5 ? "stark" : mmh >= 2 ? "mäßig" : mmh >= 0.4 ? "leicht" : "Niesel");

export function nowcastSeries(m) {
  const now = m.now;
  if (m.nc && m.nc.pts && m.nc.pts.length) {
    const pts = m.nc.pts.filter((p) => p.t >= now - 5 * 60000).slice(0, 25);
    if (pts.length >= 6) return { pts, src: "radar", ref: m.nc.ref };
  }
  const q = m.fc.minutely_15;
  if (q && q.time) {
    const pts = q.time.map((t, i) => ({ t: t * 1000, mmh: (q.precipitation[i] || 0) * 4 })).filter((p) => p.t >= now - 15 * 60000 && p.t <= now + 2 * H);
    if (pts.length) return { pts, src: "model" };
  }
  return null;
}

function currentCondition(m) {
  const c = m.fc.current;
  let { text, kind } = wmo(c.weather_code, !!c.is_day);
  const s = nowcastSeries(m);
  const nowMmh = s && s.src === "radar" ? s.pts[0].mmh : null;
  if (nowMmh != null && nowMmh >= 0.1 && c.weather_code < 51) {
    const snow = c.temperature_2m <= 0.5;
    text = snow ? "Leichter Schneefall" : nowMmh >= 5 ? "Starker Regen" : nowMmh >= 0.4 ? "Leichter Regen" : "Nieselregen";
    kind = snow ? "snow" : nowMmh >= 5 ? "heavy" : nowMmh >= 0.4 ? "rain" : "drizzle";
  }
  return { text, kind, mmh: nowMmh };
}

// ---------- Kopfbereich ----------
export function heroView(m) {
  const c = m.fc.current, d = m.fc.daily;
  const cond = currentCondition(m);
  const code = cond.kind === wmo(c.weather_code).kind ? c.weather_code : { snow: 71, heavy: 65, rain: 61, drizzle: 51 }[cond.kind];
  const gust = c.wind_gusts_10m >= 40 ? `, Böen ${Math.round(c.wind_gusts_10m)}` : "";
  const facts = [
    `Gefühlt <b>${deg(c.apparent_temperature)}</b>`,
    `Höchst <b>${deg(d.temperature_2m_max[0])}</b>`,
    `Tiefst <b>${deg(d.temperature_2m_min[0])}</b>`,
    `Wind <b>${Math.round(c.wind_speed_10m)} km/h</b> aus ${compass(c.wind_direction_10m)}${gust}`,
  ];
  let station = "";
  const st = m.station;
  if (st && st.weather && st.weather.temperature != null && st.sources && st.sources[0]) {
    const s0 = st.sources.find((s) => s.id === st.weather.source_id) || st.sources[0];
    if (s0.distance <= 25000 && Date.parse(st.weather.timestamp) > m.now - 3 * H) {
      const name = String(s0.station_name || "DWD-Station").replace(/[-\s]+$/, "");
      station = `Gemessen um ${hm(new Date(st.weather.timestamp))} an der DWD-Station ${esc(name)} (${s0.distance < 1500 ? "unter 2" : Math.round(s0.distance / 1000)} km): <b>${num(st.weather.temperature)}°</b>`;
    }
  }
  const age = m.now - m.ts;
  const stale = m.offline || age > 2 * H;
  return `
    <div class="hero-main">
      <div class="hero-temp" aria-label="${deg(c.temperature_2m)}">${deg(c.temperature_2m).replace("°", '<span class="deg">°</span>').replace("\u2212", '<span class="neg">\u2212</span>')}</div>
      <div class="hero-icon">${icon(code, !!c.is_day, { anim: true })}</div>
    </div>
    <p class="hero-cond">${esc(cond.text)}</p>
    <p class="hero-facts">${facts.map((f) => `<span>${f}</span>`).join("")}</p>
    ${station ? `<p class="hero-station">${station}</p>` : ""}
    ${stale ? `<span class="offline-note">Keine Verbindung, Stand ${inlineDay(new Date(m.ts), new Date(m.now))} ${hm(new Date(m.ts))}</span>` : ""}`;
}

export function heroSky(m) {
  const c = m.fc.current;
  const cond = currentCondition(m);
  return { kind: cond.kind, intensity: cond.mmh, cloud: c.cloud_cover, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, isDay: !!c.is_day };
}

// ---------- Nowcast ----------
export function nowcastView(m, width) {
  const s = nowcastSeries(m);
  if (!s) return "";
  const c = m.fc.current;
  const snow = isSnowCode(c.weather_code) || c.temperature_2m <= 0.5;
  const pts = s.pts, THR = 0.1;
  const wet = (p) => p && p.mmh >= THR;
  let head;
  if (wet(pts[0])) {
    const nowPhrase = snow ? "Es schneit" : pts[0].mmh < 0.4 ? "Es nieselt" : `Es regnet ${rainWord(pts[0].mmh)}`;
    let end = null;
    for (let i = 1; i < pts.length - 1; i++) if (!wet(pts[i]) && !wet(pts[i + 1])) { end = pts[i].t; break; }
    head = end ? `${nowPhrase}, hört gegen ${hm(end)} auf` : `${nowPhrase}, bis mindestens ${hm(pts[pts.length - 1].t)}`;
  } else {
    const i0 = pts.findIndex(wet);
    if (i0 >= 0) {
      const peak = Math.max(...pts.slice(i0, i0 + 6).map((p) => p.mmh));
      const w = snow ? "Schnee" : peak < 0.4 ? "Niesel" : "Regen";
      head = `${w} ab ${hm(pts[i0].t)}${w === "Regen" ? `, ${rainWord(peak)}` : ""}`;
    } else head = `Trocken bis mindestens ${hm(pts[pts.length - 1].t)}`;
  }

  // Nächster Extremwert aus der Stundenvorhersage
  const h = m.fc.hourly;
  const lh = localHour(new Date(m.now));
  let sub = "";
  const win = h.time.map((t, i) => [t * 1000, i]).filter(([t]) => t >= m.now - H / 2);
  if (lh < 15) {
    const today = win.filter(([t]) => dayKey(new Date(t)) === dayKey(new Date(m.now)));
    if (today.length) { const [t, i] = today.reduce((a, b) => (h.temperature_2m[b[1]] > h.temperature_2m[a[1]] ? b : a)); sub = `Höchstwert ${deg(h.temperature_2m[i])} gegen ${hh(new Date(t))} Uhr`; }
  } else {
    const night = win.filter(([t]) => t < m.fc.daily.time[1] * 1000 + 10 * H);
    if (night.length) { const [t, i] = night.reduce((a, b) => (h.temperature_2m[b[1]] < h.temperature_2m[a[1]] ? b : a)); sub = `Tiefstwert ${deg(h.temperature_2m[i])} ${dayKey(new Date(t)) === dayKey(new Date(m.now)) ? "gegen" : "morgen gegen"} ${hh(new Date(t))} Uhr`; }
  }

  // Balken
  const W = Math.max(240, width || 320), Hc = 74, base = 52, n = pts.length;
  const bw = W / Math.max(n, 12);
  const any = pts.some(wet);
  let bars = "";
  pts.forEach((p, i) => {
    if (p.mmh < 0.05) return;
    const bh = Math.max(2, 44 * Math.min(1, Math.sqrt(p.mmh / 10)));
    const col = p.mmh >= 15 ? "#ff6b5e" : p.mmh >= 5 ? "#ffc94a" : p.mmh >= 2 ? "#7fe0f2" : "#58d5ec";
    const op = p.mmh < 0.4 ? 0.55 : 0.95;
    bars += `<rect x="${(i * bw + 1).toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="${col}" opacity="${op}"/>`;
  });
  let labels = `<text x="0" y="${Hc - 4}" class="nc-now">Jetzt</text>`;
  pts.forEach((p, i) => {
    const d = new Date(p.t);
    if (i > 1 && i < n - 1 && hm(d).endsWith(":00")) labels += `<text x="${(i * bw).toFixed(1)}" y="${Hc - 4}" text-anchor="middle">${hm(d)}</text>`;
  });
  const span = n * bw;
  const chart = `<svg class="nc-chart" viewBox="0 0 ${W} ${Hc}" width="${W}" height="${Hc}" role="img" aria-label="Niederschlag in 5-Minuten-Schritten">
    <line x1="0" x2="${span}" y1="${base + 0.5}" y2="${base + 0.5}" stroke="rgba(255,255,255,.25)"/>
    ${any ? bars : `<text x="${span / 2}" y="${base - 10}" text-anchor="middle">kein Niederschlag in Sicht</text>`}
    ${labels}</svg>`;

  const src = s.src === "radar"
    ? `Radar des DWD${s.ref ? `, letzte Messung ${hm(new Date(s.ref))}` : ""}`
    : "Kein Radar verfügbar, Werte aus dem Wettermodell";
  return `<h2 class="ph">Die nächsten 2 Stunden</h2>
    <p class="nc-head">${esc(head)}</p>
    ${sub ? `<p class="nc-sub">${sub}</p>` : ""}
    ${chart}
    <p class="src">${src}</p>`;
}

// ---------- DWD-Warnungen ----------
const SEV = { minor: 1, moderate: 2, severe: 3, extreme: 4 };
const SMALL = new Set(["mit", "und", "oder", "vor", "von", "bei", "im", "in", "auf", "über", "unter"]);
// DWD-Ereignisse kommen in Großbuchstaben. Nomen groß, Präpositionen und gebeugte Adjektive (nicht am Anfang) klein.
const titleCase = (s) => {
  const w = String(s || "").toLowerCase().split(/\s+/);
  return w.map((x, i) => {
    if (i > 0 && SMALL.has(x)) return x;
    if (i > 0 && /(em|en|er|es|e)$/.test(x) && w[i + 1] && !SMALL.has(w[i + 1])) return x;
    return x.charAt(0).toUpperCase() + x.slice(1);
  }).join(" ");
};
const inlineDay = (d, now) => { const n = dayName(d, now); return n === "Heute" || n === "Morgen" ? n.toLowerCase() : n; };

export function warningsView(m) {
  const a = m.alerts;
  if (!a || !a.location) return "";
  const list = (a.alerts || [])
    .filter((x) => x.status !== "test" && (!x.expires || Date.parse(x.expires) > m.now))
    .sort((x, y) => (SEV[y.severity] || 0) - (SEV[x.severity] || 0) || Date.parse(x.onset) - Date.parse(y.onset));
  if (!list.length) return `<p class="no-warn">Keine amtlichen Warnungen für ${esc(a.location.name)}</p>`;
  const now = new Date(m.now);
  return list.map((x) => {
    const lvl = SEV[x.severity] || 1;
    const on = new Date(x.onset), ex = x.expires ? new Date(x.expires) : null;
    const time = (+on > m.now ? `Ab ${inlineDay(on, now)} ${hm(on)}` : "Jetzt") + (ex ? ` bis ${inlineDay(ex, now)} ${hm(ex)}` : "");
    const lvlText = x.category === "health" ? "Hitze" : `Stufe ${lvl}`;
    return `<details class="warn lvl-${lvl}">
      <summary><span class="w-title">${esc(titleCase(x.event_de || x.headline_de))}</span><span class="w-meta">${esc(time)}</span><span class="w-lvl">${lvlText}</span></summary>
      <div class="w-body"><p>${esc(x.description_de)}</p>${x.instruction_de ? `<p>${esc(x.instruction_de)}</p>` : ""}<p class="src">Deutscher Wetterdienst, ${esc(a.location.name)}</p></div>
    </details>`;
  }).join("");
}

// ---------- Hasen ----------
export function rabbitsView(m) {
  const r = rabbitAdvice(m.fc, m.sunDays, m.now);
  const sum = r.worst >= 3 ? "Achtung" : r.hints ? `${r.hints} ${r.hints === 1 ? "Hinweis" : "Hinweise"}` : "Alles im grünen Bereich";
  return `<h2 class="ph"><span class="rb-title"><svg aria-hidden="true"><use href="#i-rabbit"/></svg>Für die Hasen</span><span class="rb-sum l${r.worst}">${sum}</span></h2>
    <ul class="rb-list">${r.items.map((it) => `<li class="rb l${it.level}"><span class="rb-ico" aria-hidden="true">${it.ico}</span><div><b>${esc(it.title)}</b><span>${esc(it.note)}</span></div></li>`).join("")}</ul>
    ${r.ok.length ? `<ul class="rb-ok">${r.ok.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}`;
}

// ---------- 48 Stunden ----------
export function hoursView(m) {
  const h = m.fc.hourly;
  let i0 = h.time.findIndex((t, i) => t * 1000 <= m.now && (h.time[i + 1] ?? Infinity) * 1000 > m.now);
  if (i0 < 0) i0 = 0;
  const idx = [];
  for (let i = i0; i < h.time.length && idx.length < 49; i++) idx.push(i);
  if (!idx.length) return "";

  // Zusammenfassung
  const now = new Date(m.now);
  let firstWet = null, total = 0, gust = 0, gustI = idx[0], tmin = Infinity, tmax = -Infinity, snowy = false;
  idx.forEach((i) => {
    const p = h.precipitation[i] || 0;
    total += p;
    if (firstWet == null && p >= 0.2) firstWet = i;
    if (p >= 0.2 && isSnowCode(h.weather_code[i])) snowy = true;
    if ((h.wind_gusts_10m[i] || 0) > gust) { gust = h.wind_gusts_10m[i]; gustI = i; }
    tmin = Math.min(tmin, h.temperature_2m[i]); tmax = Math.max(tmax, h.temperature_2m[i]);
  });
  const what = snowy ? "Schnee" : "Regen";
  let sum = firstWet == null
    ? "Die nächsten 48 Stunden bleibt es <b>trocken</b>."
    : (firstWet === i0 ? `<b>${what}</b> schon jetzt` : `<b>${what} ab ${when(new Date(h.time[firstWet] * 1000), now)}</b>`) + `, zusammen ${num(total, total < 10 ? 1 : 0)} mm${snowy ? " Niederschlag" : ""} in 48 Stunden.`;
  sum += ` Zwischen ${deg(tmin)} und ${deg(tmax)}.`;
  if (gust >= 50) sum += ` Böen bis ${Math.round(gust)} km/h, ${when(new Date(h.time[gustI] * 1000), now)}.`;

  const COL = 56, n = idx.length, Wd = n * COL, Ht = 296;
  const T = idx.map((i) => h.temperature_2m[i]);
  const lo = Math.min(...T), hi = Math.max(...T), rng = Math.max(4, hi - lo);
  const ty = (v) => 112 + (1 - (v - lo) / rng) * 48;
  const cx = (k) => k * COL + COL / 2;
  let night = "", seps = "", cols = "", line = "", area = "";
  idx.forEach((i, k) => {
    const t = new Date(h.time[i] * 1000);
    if (!h.is_day[i]) night += `<rect class="night" x="${k * COL}" y="18" width="${COL}" height="${Ht - 18}"/>`;
    const hr = hh(t);
    if (k === 0) cols += `<text class="t-day" x="6" y="12">${dayName(t, now)}</text>`;
    else if (hr === "00") {
      seps += `<line class="daysep" x1="${k * COL}" x2="${k * COL}" y1="2" y2="${Ht}"/>`;
      cols += `<text class="t-day" x="${k * COL + 6}" y="12">${dayName(t, now)} ${dm(t)}</text>`;
    }
    cols += `<text class="t-hour${k === 0 ? " t-now" : ""}" x="${cx(k)}" y="36" text-anchor="middle">${k === 0 ? "Jetzt" : hr}</text>`;
    cols += svgAt(icon(h.weather_code[i], !!h.is_day[i]), cx(k) - 16, 46, 32);
    const y = ty(h.temperature_2m[i]);
    cols += `<text class="t-temp" x="${cx(k)}" y="${(y - 10).toFixed(1)}" text-anchor="middle">${deg(h.temperature_2m[i])}</text>`;
    line += `${k ? "L" : "M"}${cx(k)} ${y.toFixed(1)}`;
    // Niederschlag
    const p = h.precipitation[i] || 0, pp = h.precipitation_probability?.[i];
    if (p >= 0.05) {
      const bh = Math.max(3, 40 * Math.min(1, Math.sqrt(p / 6)));
      const op = pp == null ? 0.9 : 0.35 + 0.65 * (pp / 100);
      cols += `<rect x="${cx(k) - 11}" y="${(216 - bh).toFixed(1)}" width="22" height="${bh.toFixed(1)}" rx="3" fill="#58d5ec" opacity="${op.toFixed(2)}"/>`;
      cols += `<text class="t-mm" x="${cx(k)}" y="${(212 - bh).toFixed(1)}" text-anchor="middle">${num(p, p < 10 ? 1 : 0)}</text>`;
    }
    if (pp != null && pp >= 10) cols += `<text class="t-pp" x="${cx(k)}" y="231" text-anchor="middle">${pp} %</text>`;
    // Wind
    const dir = (h.wind_direction_10m[i] + 180) % 360;
    cols += `<path d="M0 -7L5 5L0 2.2L-5 5Z" fill="rgba(245,247,250,.72)" transform="translate(${cx(k)} 250) rotate(${dir})"/>`;
    cols += `<text class="t-wind" x="${cx(k)}" y="274" text-anchor="middle">${Math.round(h.wind_speed_10m[i])}</text>`;
    if (h.wind_gusts_10m[i] >= 40) cols += `<text class="t-gust" x="${cx(k)}" y="289" text-anchor="middle">B ${Math.round(h.wind_gusts_10m[i])}</text>`;
  });
  area = `${line}L${cx(n - 1)} 168L${cx(0)} 168Z`;
  const svg = `<svg class="hs" width="${Wd}" height="${Ht}" viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Stundenvorhersage für 48 Stunden">
    <defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffb45e" stop-opacity=".32"/><stop offset="1" stop-color="#ffb45e" stop-opacity="0"/></linearGradient></defs>
    ${night}${seps}
    <path d="${area}" fill="url(#tg)"/>
    <path d="${line}" fill="none" stroke="#ffb45e" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    <line x1="0" x2="${Wd}" y1="216.5" y2="216.5" stroke="rgba(255,255,255,.14)"/>
    ${cols}</svg>`;
  return `<p class="sum">${sum}</p><div class="hscroll" tabindex="0" aria-label="Stunden, seitlich scrollbar">${svg}</div>
    <p class="src">Balken: Niederschlag in mm pro Stunde, blasser bei geringer Wahrscheinlichkeit. Wind in km/h, B = Böen.</p>`;
}

// ---------- 16 Tage ----------
export function daysView(m, width) {
  const d = m.fc.daily, E = m.ens;
  const now = new Date(m.now);
  const n = d.time.length;
  const rows = d.time.map((t, i) => {
    const e = E ? E.get(t) : null;
    const late = i >= 7 && e;
    const hi = late ? e.maxP50 : d.temperature_2m_max[i];
    const lo = late ? e.minP50 : d.temperature_2m_min[i];
    const spread = e ? e.maxP90 - e.maxP10 : null;
    const conf = spread == null ? null : spread <= 3 ? 3 : spread <= 6 ? 2 : 1;
    const chance = e && e.rain != null ? Math.round(e.rain * 100) : d.precipitation_probability_max?.[i];
    const mm = late ? e.prP50 : d.precipitation_sum[i];
    return { t, i, e, hi, lo, conf, chance, mm, code: d.weather_code[i] };
  }).filter((r) => r.hi != null);

  // Fächerdiagramm
  const W = Math.max(300, width || 360), Hc = 214, L = 34, R = 14, Tp = 22, B = 26;
  const vals = [];
  rows.forEach((r) => { vals.push(r.hi, r.lo); if (r.e) vals.push(r.e.maxP90, r.e.minP10); });
  const vmin = Math.floor((Math.min(...vals) - 1) / 5) * 5, vmax = Math.ceil((Math.max(...vals) + 1) / 5) * 5;
  const x = (i) => L + (i + 0.5) * ((W - L - R) / n);
  const y = (v) => Tp + ((vmax - v) / (vmax - vmin)) * (Hc - Tp - B);
  let g = "";
  for (let v = vmin; v <= vmax; v += 5) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${deg(v)}</text>`;
  const band = (k1, k2) => {
    const pts = rows.filter((r) => r.e);
    if (pts.length < 2) return "";
    return "M" + pts.map((r) => `${x(r.i).toFixed(1)} ${y(r.e[k1]).toFixed(1)}`).join("L") + "L" + pts.slice().reverse().map((r) => `${x(r.i).toFixed(1)} ${y(r.e[k2]).toFixed(1)}`).join("L") + "Z";
  };
  const path = (key) => "M" + rows.map((r) => `${x(r.i).toFixed(1)} ${y(r[key]).toFixed(1)}`).join("L");
  const unsureFrom = rows.find((r) => r.conf === 1);
  let unsure = "";
  if (unsureFrom) {
    const ux = x(unsureFrom.i) - (W - L - R) / n / 2;
    unsure = `<rect x="${ux.toFixed(1)}" y="${Tp - 16}" width="${(W - R - ux).toFixed(1)}" height="${Hc - B - Tp + 16}" fill="rgba(255,255,255,.06)"/><line x1="${ux.toFixed(1)}" x2="${ux.toFixed(1)}" y1="${Tp - 16}" y2="${Hc - B}" stroke="rgba(255,255,255,.35)" stroke-dasharray="3 3"/><text class="lbl-unsure" x="${(ux + 6).toFixed(1)}" y="${Tp - 4}">ab hier unsicher</text>`;
  }
  const every = W < 420 ? 2 : 1;
  let xl = "";
  rows.forEach((r, k) => { if (k % every === 0) xl += `<text x="${x(r.i).toFixed(1)}" y="${Hc - 8}" text-anchor="middle">${r.i === 0 ? "Heute" : dayName(new Date(r.t * 1000), now)}</text>`; });
  const fan = `<svg class="fan" viewBox="0 0 ${W} ${Hc}" width="${W}" height="${Hc}" role="img" aria-label="Temperaturverlauf 16 Tage mit Unsicherheitsbändern">
    ${unsure}${g}
    <path d="${band("maxP90", "maxP10")}" fill="rgba(255,180,94,.30)"/>
    <path d="${band("minP90", "minP10")}" fill="rgba(143,203,255,.28)"/>
    <path d="${path("hi")}" fill="none" stroke="#ffb45e" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="${path("lo")}" fill="none" stroke="#8fcbff" stroke-width="2.2" stroke-linejoin="round"/>
    ${xl}</svg>`;

  const list = rows.map((r) => {
    const dt = new Date(r.t * 1000);
    const name = r.i === 0 ? "Heute" : dayName(dt, now);
    const sp = r.e ? `Spanne ${deg(r.e.maxP10).replace("°", "")}-${deg(r.e.maxP90)}` : "";
    const confTxt = { 3: "sicher", 2: "mittel", 1: "unsicher" }[r.conf] || "";
    return `<li class="dl">
      <div class="dl-day"><b>${name}</b><span>${dm(dt)}</span></div>
      <div class="dl-ico">${icon(r.code, true)}</div>
      <div class="dl-t"><b><span class="lo">${deg(r.lo)}</span> / ${deg(r.hi)}</b>${sp ? `<span>${sp}</span>` : ""}</div>
      <div class="dl-r"><b class="${r.chance >= 40 ? "wet" : ""}">${r.chance == null ? "–" : r.chance + " %"}</b><span>${r.mm != null && r.mm >= 0.1 ? num(r.mm, r.mm < 10 ? 1 : 0) + " mm" : "trocken"}</span></div>
      <div class="conf c${r.conf || 0}" title="Sicherheit der Vorhersage"><span class="bars"><i></i><i></i><i></i></span><span>${confTxt}</span></div>
    </li>`;
  }).join("");

  return `<h2 class="ph">Temperatur <span class="aside">Höchst- und Tiefstwerte</span></h2>
    ${fan}
    <div class="fan-key"><span><i style="background:rgba(255,180,94,.45)"></i>Höchstwert</span><span><i style="background:rgba(143,203,255,.45)"></i>Tiefstwert</span></div>
    <p class="note">${E ? "Linie: wahrscheinlichster Verlauf. Band: 80 % der 51 Läufe des europäischen Ensembles (ECMWF) liegen darin, je breiter, desto unsicherer. Ab Tag 8 zeigt die Liste den Median des Ensembles." : "Unsicherheitsbänder gerade nicht verfügbar."}</p>
    <ul class="dlist">${list}</ul>
    <p class="src">Regen: Anteil der Ensemble-Läufe mit mindestens 1 mm am Tag.</p>`;
}

// Ensemble -> Perzentile je Tag
export function ensembleStats(ens) {
  if (!ens || !ens.daily || !ens.daily.time) return null;
  const d = ens.daily, keys = Object.keys(d);
  const grp = (b) => keys.filter((k) => k === b || k.startsWith(b + "_member"));
  const kx = grp("temperature_2m_max"), kn = grp("temperature_2m_min"), kp = grp("precipitation_sum");
  const map = new Map();
  d.time.forEach((t, i) => {
    const mx = kx.map((k) => d[k][i]).filter((v) => v != null);
    if (mx.length < 5) return;
    const mn = kn.map((k) => d[k][i]).filter((v) => v != null);
    const pr = kp.map((k) => d[k][i]).filter((v) => v != null);
    map.set(t, {
      maxP10: pct(mx, 0.1), maxP50: pct(mx, 0.5), maxP90: pct(mx, 0.9),
      minP10: pct(mn, 0.1), minP50: pct(mn, 0.5), minP90: pct(mn, 0.9),
      rain: pr.length ? pr.filter((v) => v >= 1).length / pr.length : null,
      prP50: pct(pr, 0.5), n: mx.length,
    });
  });
  return map.size ? map : null;
}
