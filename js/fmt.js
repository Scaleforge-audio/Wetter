// Formatierung in der Zeitzone des angezeigten Ortes
let TZ = "Europe/Berlin";
const cache = new Map();
export function setTZ(tz) { if (tz) TZ = tz; }

function dtf(opts) {
  const key = TZ + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) { f = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...opts }); cache.set(key, f); }
  return f;
}

export const hm = (d) => dtf({ hour: "2-digit", minute: "2-digit" }).format(d);
const part = (d, opts, type) => dtf(opts).formatToParts(d).find((p) => p.type === type).value;
export const hh = (d) => part(d, { hour: "2-digit", hourCycle: "h23" }, "hour");
export const wd = (d) => dtf({ weekday: "short" }).format(d).replace(".", "");
export const dm = (d) => dtf({ day: "numeric", month: "numeric" }).format(d);
export const dayKey = (d) => dtf({ year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const localHour = (d) => +part(d, { hour: "numeric", hourCycle: "h23" }, "hour");

export function dayName(d, now = new Date()) {
  const k = dayKey(d);
  if (k === dayKey(now)) return "Heute";
  if (k === dayKey(new Date(+now + 86400000))) return "Morgen";
  return wd(d);
}
// "heute 17 Uhr", "morgen 03 Uhr", "So 14 Uhr"
export function when(d, now = new Date()) {
  const n = dayName(d, now);
  return `${n === "Heute" || n === "Morgen" ? n.toLowerCase() : n} ${hh(d)} Uhr`;
}

const MINUS = "−";
export function deg(v) {
  if (v == null || Number.isNaN(v)) return "–";
  const r = Math.round(v);
  return (r < 0 ? MINUS + Math.abs(r) : String(r)) + "°";
}
export function num(v, digits = 1) {
  if (v == null) return "–";
  const s = v.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  return s.replace("-", MINUS);
}
export function dur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
export const compass = (d) => ["Nord", "Nordost", "Ost", "Südost", "Süd", "Südwest", "West", "Nordwest"][Math.round(((d % 360) + 360) % 360 / 45) % 8];
export const compassShort = (d) => ["N", "NO", "O", "SO", "S", "SW", "W", "NW"][Math.round(((d % 360) + 360) % 360 / 45) % 8];

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function pct(values, p) {
  const a = values.filter((v) => v != null && !Number.isNaN(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
