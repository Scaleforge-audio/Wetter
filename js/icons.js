// WMO-Wettercodes -> Text + Symbol, und kleine SVG-Wettersymbole
const W = {
  0: ["Klar", "clear"], 1: ["Überwiegend klar", "mostly"], 2: ["Teils bewölkt", "partly"], 3: ["Bedeckt", "cloudy"],
  45: ["Nebel", "fog"], 48: ["Nebel mit Reif", "fog"],
  51: ["Leichter Nieselregen", "drizzle"], 53: ["Nieselregen", "drizzle"], 55: ["Starker Nieselregen", "drizzle"],
  56: ["Gefrierender Niesel", "sleet"], 57: ["Gefrierender Nieselregen", "sleet"],
  61: ["Leichter Regen", "rain"], 63: ["Regen", "rain"], 65: ["Starker Regen", "heavy"],
  66: ["Leichter Eisregen", "sleet"], 67: ["Eisregen", "sleet"],
  71: ["Leichter Schneefall", "snow"], 73: ["Schneefall", "snow"], 75: ["Starker Schneefall", "snow"], 77: ["Schneegriesel", "snow"],
  80: ["Leichte Regenschauer", "rain"], 81: ["Regenschauer", "rain"], 82: ["Heftige Regenschauer", "heavy"],
  85: ["Leichte Schneeschauer", "snow"], 86: ["Schneeschauer", "snow"],
  95: ["Gewitter", "thunder"], 96: ["Gewitter mit Hagel", "thunder"], 99: ["Schweres Gewitter mit Hagel", "thunder"],
};

export function wmo(code, isDay = true) {
  const e = W[code] || ["Unbekannt", "cloudy"];
  let text = e[0];
  if (isDay && code === 0) text = "Sonnig";
  if (isDay && code === 1) text = "Überwiegend sonnig";
  return { text, kind: e[1] };
}
export const isWetCode = (c) => c >= 51;
export const isSnowCode = (c) => (c >= 71 && c <= 77) || c === 85 || c === 86;
export const isThunderCode = (c) => c >= 95;

const SUN = "#ffc94a", RAY = "#ffd77a", MOON = "#e6edf8", CL = "#eef2f8", CL2 = "#aab6c8", CLD = "#8693a8", DROP = "#62cff0", FLAKE = "#ffffff", BOLT = "#ffd84a";
const CLOUD_D = "M20 48H46A10 10 0 0 0 46 28A13 13 0 0 0 21 25A11.5 11.5 0 0 0 20 48Z";

const cloud = (tr, fill, cls = "drift") => `<g class="${cls}"><path transform="${tr}" fill="${fill}" d="${CLOUD_D}"/></g>`;
function sun(cx, cy, r) {
  let rays = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
    rays += `M${(cx + c * (r + 4)).toFixed(1)} ${(cy + s * (r + 4)).toFixed(1)}L${(cx + c * (r + 9)).toFixed(1)} ${(cy + s * (r + 9)).toFixed(1)}`;
  }
  return `<g class="rays" style="--ox:${cx}px;--oy:${cy}px"><path d="${rays}" stroke="${RAY}" stroke-width="3" stroke-linecap="round"/></g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${SUN}"/>`;
}
function moon(tr) {
  return `<path transform="${tr}" fill="${MOON}" d="M28.1 16.1A16 16 0 1 0 44.7 38.3A14 14 0 0 1 28.1 16.1Z"/>`;
}
function drops(n, heavy, only) {
  const xs = only || (n === 3 ? [22, 32, 42] : [17, 25, 33, 41, 49]);
  return xs.map((x, i) => `<path class="drop" style="animation-delay:${(i * 0.37) % 1.4}s" d="M${x} ${heavy ? 47 : 48}l-3 ${heavy ? 9 : 7}" stroke="${DROP}" stroke-width="${heavy ? 3.2 : 3}" stroke-linecap="round"/>`).join("");
}
function dots(n) {
  return [22, 32, 42].slice(0, n).map((x, i) => `<circle class="drop" style="animation-delay:${i * 0.45}s" cx="${x}" cy="52" r="2" fill="${DROP}"/>`).join("");
}
function flakes() {
  return [[21, 51], [32, 55], [43, 51]].map(([x, y], i) => `<g class="flake" style="animation-delay:${i * 0.8}s"><circle cx="${x}" cy="${y}" r="2.6" fill="${FLAKE}"/></g>`).join("");
}

export function icon(code, isDay = true, opts = {}) {
  const { kind } = wmo(code, isDay);
  const cls = "wi" + (opts.anim ? " anim" : "");
  const body = (() => {
    const lit = (x, y, r) => isDay ? sun(x, y, r) : moon(`translate(${x - 31} ${y - 32}) scale(${r / 13})`);
    switch (kind) {
      case "clear": return isDay ? sun(32, 32, 12) : moon("translate(2 0)");
      case "mostly": return lit(28, 27, 11) + cloud("translate(24 27) scale(.58)", CL);
      case "partly": return lit(24, 22, 10) + cloud("translate(7 7) scale(.86)", CL);
      case "cloudy": return cloud("translate(14 -2) scale(.78)", CL2) + cloud("translate(-3 6)", CL);
      case "fog": return cloud("translate(0 -8)", CL2) + `<g class="fogline"><path d="M12 48h40M17 55h30" stroke="${CL}" stroke-width="3.2" stroke-linecap="round"/></g>`;
      case "drizzle": return cloud("translate(0 -8)", CL) + dots(3);
      case "rain": return cloud("translate(0 -8)", CL) + drops(3);
      case "heavy": return cloud("translate(0 -9)", CL2) + drops(5, true);
      case "sleet": return cloud("translate(0 -8)", CL) + drops(2, false, [22, 32]) +`<g class="flake" style="animation-delay:.6s"><circle cx="42" cy="53" r="2.6" fill="${FLAKE}"/></g>`;
      case "snow": return cloud("translate(0 -8)", CL) + flakes();
      case "thunder": return cloud("translate(0 -10)", CLD) + `<path class="bolt" d="M34 38L25 52H32L28 62L42 46H35L39 38Z" fill="${BOLT}"/>` ;
      default: return cloud("translate(0 0)", CL);
    }
  })();
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
}

// Kleine Linien-Icons für die Hasen-Karte
export const UI = {
  dusk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 18h19M5.5 21h13"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 6.5v3M5.3 10.3l1.8 1.8M18.7 10.3l-1.8 1.8"/></svg>`,
  dawn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 18h19M5.5 21h13"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 4v5M9.5 6.5L12 4l2.5 2.5"/></svg>`,
  frost: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9.5 4L12 6.5 14.5 4M9.5 20l2.5-2.5 2.5 2.5"/></svg>`,
  heat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 4.5a2 2 0 0 1 4 0v9.2a4.2 4.2 0 1 1-4 0z"/><path d="M12 10v6"/><path d="M18 5.5h3M18 9h2"/></svg>`,
  wind: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 14h15a3 3 0 1 1-3 3"/><path d="M3 19h6"/></svg>`,
  rain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10z"/></svg>`,
  storm: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2.5L5.5 13.5h6l-1 8 8-11.5h-6z"/></svg>`,
  bug: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="14" rx="3" ry="5.5"/><path d="M12 8.5V5M9 4l3 1 3-1"/><path d="M9 11.5l-5-3M15 11.5l5-3M9 15.5l-5 1.5M15 15.5l5 1.5"/></svg>`,
};
