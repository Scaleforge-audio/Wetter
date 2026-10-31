// Hinweise für Kaninchen in Außenhaltung. Schwellen:
// Hitze: ab 25 °C kritisch, ab 30 °C Hitzschlaggefahr (TASSO, zooplus Tierratgeber)
// Kälte: bis −10 °C für gesunde Tiere im gut eingerichteten Gehege meist unproblematisch (ZZF)
// Wind: DWD-Stufen Windböen ab 50 km/h, Sturmböen ab 65 km/h
// Mücken (Überträger von Myxomatose und RHD): grobe Faustregel, abends warm und windstill
import { hm, dur, deg, num, when, localHour, dayKey } from "./fmt.js";
import { UI, isThunderCode, isSnowCode } from "./icons.js";

const H = 3600000;

function hoursIn(fc, from, to) {
  const h = fc.hourly, out = [];
  for (let i = 0; i < h.time.length; i++) {
    const t = h.time[i] * 1000;
    if (t >= from && t < to) out.push(i);
  }
  return out;
}

export function rabbitAdvice(fc, sunDays, now = Date.now()) {
  const h = fc.hourly, d = fc.daily;
  const items = [], ok = [];

  // 1) Hell / dunkel
  const events = [];
  sunDays.forEach((s) => {
    if (s.dawn) events.push({ t: +s.dawn, k: "dawn", s });
    if (s.dusk) events.push({ t: +s.dusk, k: "dusk", s });
  });
  events.sort((a, b) => a.t - b.t);
  const next = events.find((e) => e.t > now);
  if (next && next.k === "dusk") {
    const ss = next.s.sunset;
    items.push({
      ico: UI.dusk, level: 0,
      title: `Dunkel ab ${hm(next.t)}`,
      note: ss && +ss > now ? `Noch ${dur(next.t - now)} hell, Sonnenuntergang ${hm(ss)}` : `Dämmerung läuft, Sonne seit ${hm(ss)} unter`,
    });
  } else if (next) {
    const sr = next.s.sunrise;
    items.push({ ico: UI.dawn, level: 0, title: `Hell ab ${hm(next.t)}`, note: `Noch ${dur(next.t - now)} dunkel${sr ? `, Sonnenaufgang ${hm(sr)}` : ""}` });
  }

  // 2) Frost in der kommenden Nacht
  const lh = localHour(new Date(now));
  const midnight0 = d.time[0] * 1000, midnight1 = d.time[1] * 1000;
  const nightFrom = lh < 9 ? now : Math.max(now, midnight0 + 18 * H);
  const nightTo = lh < 9 ? midnight0 + 9 * H : midnight1 + 9 * H;
  const nIdx = hoursIn(fc, nightFrom - H, nightTo);
  if (nIdx.length) {
    let min = Infinity, minI = nIdx[0], wet = 0;
    nIdx.forEach((i) => { if (h.temperature_2m[i] < min) { min = h.temperature_2m[i]; minI = i; } wet += h.precipitation[i] || 0; });
    const at = new Date(h.time[minI] * 1000);
    const label = lh < 9 ? "Bis zum Morgen" : "Heute Nacht";
    if (min <= -10) items.push({ ico: UI.frost, level: 3, title: `${label} strenger Frost bis ${deg(min)}`, note: `Tiefster Wert ${when(at)}. Schutzhütte dick einstreuen, Wasser mehrmals tauschen.` });
    else if (min <= 0) items.push({ ico: UI.frost, level: 2, title: `${label} Frost bis ${deg(min)}`, note: `Trinkwasser kann einfrieren, morgens kontrollieren. Tiefster Wert ${when(at)}.` });
    else if (min <= 3) items.push({ ico: UI.frost, level: 1, title: `${label} knapp über null, ${deg(min)}`, note: "Bodenfrost möglich, Wasser morgens kurz prüfen." });
    else ok.push("Kein Frost");
    const nmax = Math.max(...nIdx.map((i) => h.temperature_2m[i]));
    if (wet >= 2 && min <= 6 && nmax > 0.5) items.push({ ico: UI.rain, level: 1, title: "Nasskalt", note: `${num(wet)} mm bei ${deg(min)} bis ${deg(nmax)}. Einstreu und Unterstand trocken halten.` });
  }

  // 3) Hitze (heute, ab 17 Uhr morgen)
  const di = lh < 17 ? 0 : 1;
  const tmax = d.temperature_2m_max[di];
  const dayLbl = di === 0 ? "Heute" : "Morgen";
  if (tmax >= 30) items.push({ ico: UI.heat, level: 3, title: `${dayLbl} bis ${deg(tmax)}: Hitzschlaggefahr`, note: "Gehege beschatten und kühlen, notfalls ins Haus holen. Frisches Wasser in Schalen." });
  else if (tmax >= 25) items.push({ ico: UI.heat, level: 2, title: `${dayLbl} bis ${deg(tmax)}`, note: "Ab 25° wird es kritisch: Schatten, frisches Wasser, kühle Fliesen." });
  else ok.push("Keine Hitze");

  // 4) Wind, Gewitter, Regen in den nächsten 24 h
  const n24 = hoursIn(fc, now - H, now + 24 * H);
  let gust = 0, gustI = n24[0], rain = 0, snow = 0, thunderI = null;
  n24.forEach((i) => {
    if ((h.wind_gusts_10m[i] || 0) > gust) { gust = h.wind_gusts_10m[i]; gustI = i; }
    rain += h.precipitation[i] || 0;
    if (isSnowCode(h.weather_code[i])) snow += h.precipitation[i] || 0;
    if (thunderI == null && isThunderCode(h.weather_code[i])) thunderI = i;
  });
  let calm = true;
  if (thunderI != null) { calm = false; items.push({ ico: UI.storm, level: 2, title: `Gewitter möglich, ${when(new Date(h.time[thunderI] * 1000))}`, note: "Gehege und Abdeckungen sichern, Unterstand muss trocken bleiben." }); }
  if (gust >= 65) { calm = false; items.push({ ico: UI.wind, level: 3, title: `Sturmböen bis ${Math.round(gust)} km/h`, note: `Am stärksten ${when(new Date(h.time[gustI] * 1000))}. Dach, Planen und Gehegeteile sichern.` }); }
  else if (gust >= 50) { calm = false; items.push({ ico: UI.wind, level: 2, title: `Windböen bis ${Math.round(gust)} km/h`, note: `Am stärksten ${when(new Date(h.time[gustI] * 1000))}. Lose Teile sichern.` }); }
  if (snow >= 2 && snow >= rain / 2) {
    calm = false;
    items.push({ ico: UI.frost, level: snow >= 5 ? 2 : 1, title: `Schneefall: ${num(rain, 0)} mm Niederschlag in 24 Stunden`, note: "Schneelast auf Netz und Dach im Blick behalten, Zugang zu Wasser und Heu freihalten." });
  } else if (rain >= 15) { calm = false; items.push({ ico: UI.rain, level: 2, title: `Viel Regen: ${num(rain, 0)} mm in 24 Stunden`, note: "Unterstand und Einstreu trocken halten, Gehegeboden auf Staunässe prüfen." }); }
  else if (rain >= 5) { calm = false; items.push({ ico: UI.rain, level: 1, title: `Regen: ${num(rain, 0)} mm in 24 Stunden`, note: "Trockener Rückzugsort nötig." }); }
  if (calm) ok.push("Ruhiges Wetter");

  // 5) Mücken am Abend (Sonnenuntergang bis +3 h)
  const evening = sunDays.map((s) => s.sunset && +s.sunset).filter(Boolean).find((ss) => ss + 3 * H > now);
  if (evening) {
    const eIdx = hoursIn(fc, evening - H / 2, evening + 3 * H);
    if (eIdx.length) {
      const avg = (k) => eIdx.reduce((a, i) => a + (h[k][i] || 0), 0) / eIdx.length;
      const t = avg("temperature_2m"), w = avg("wind_speed_10m");
      const lbl = dayKey(new Date(evening)) === dayKey(new Date(now)) ? "heute Abend" : "morgen Abend";
      if (t >= 15 && w < 12) items.push({ ico: UI.bug, level: 2, title: `Mückenabend wahrscheinlich, ${lbl}`, note: `Um ${deg(t)} und kaum Wind. Insektenschutzgitter schließen, Mücken übertragen Myxomatose und RHD.` });
      else if (t >= 12 && w < 15) items.push({ ico: UI.bug, level: 1, title: `Mücken möglich, ${lbl}`, note: `Um ${deg(t)}, wenig Wind. Insektenschutz lohnt sich.` });
      else ok.push(t < 12 ? "Zu kühl für Mücken" : "Zu windig für Mücken");
    }
  }

  const worst = items.reduce((m, it) => Math.max(m, it.level), 0);
  const hints = items.filter((it) => it.level > 0).length;
  return { items, ok, worst, hints };
}
