// Sonnenstand (vereinfachter Almanach-Algorithmus, Genauigkeit ~1 min) und Dämmerungszeiten
const RAD = Math.PI / 180;

export function sunPosition(date, lat, lon) {
  const n = +date / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24;
  const H = (gmst * 15 + lon) * RAD - ra;
  const phi = lat * RAD;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  return { elevation: el / RAD, azimuth: ((az / RAD) + 360) % 360 };
}

// Zeitpunkte, an denen die Sonnenhöhe den Wert h0 kreuzt, im Fenster [start, start+24h]
function crossings(startMs, lat, lon, h0) {
  const step = 10 * 60000, end = startMs + 86400000;
  const f = (t) => sunPosition(new Date(t), lat, lon).elevation - h0;
  let rise = null, set = null, t = startMs, v = f(t);
  while (t < end) {
    const t2 = t + step, v2 = f(t2);
    if ((v < 0) !== (v2 < 0)) {
      let a = t, b = t2, va = v;
      for (let i = 0; i < 12; i++) {
        const m = (a + b) / 2, vm = f(m);
        if ((va < 0) === (vm < 0)) { a = m; va = vm; } else b = m;
      }
      const tc = new Date((a + b) / 2);
      if (v < 0) rise = rise || tc; else set = set || tc;
    }
    t = t2; v = v2;
  }
  return { rise, set };
}

// dayStart = lokale Mitternacht (ms). Liefert Sonnenauf-/untergang und bürgerliche Dämmerung.
export function sunTimes(dayStart, lat, lon) {
  const s = crossings(dayStart, lat, lon, -0.833);
  const c = crossings(dayStart, lat, lon, -6);
  return { sunrise: s.rise, sunset: s.set, dawn: c.rise, dusk: c.set };
}
