// Alle Datenquellen. Keine Schlüssel nötig, alle mit CORS direkt aus dem Browser abrufbar.
const OM = "https://api.open-meteo.com/v1/forecast";
const OM_ENS = "https://ensemble-api.open-meteo.com/v1/ensemble";
const OM_GEO = "https://geocoding-api.open-meteo.com/v1/search";
const BS = "https://api.brightsky.dev";
const DWD_WMS = "https://maps.dwd.de/geoserver/dwd/wms";
export const RADAR_LAYER = "dwd:Niederschlagsradar";
const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";

async function getJSON(url, timeout = 15000) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(id);
  }
}
const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
const c4 = (v) => (+v).toFixed(4);

export function fetchForecast(p) {
  return getJSON(`${OM}?${q({
    latitude: c4(p.lat), longitude: c4(p.lon), timezone: "auto", timeformat: "unixtime",
    forecast_days: 16, forecast_hours: 72, past_hours: 1,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation",
    hourly: "temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,is_day,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,uv_index_max",
    minutely_15: "precipitation", forecast_minutely_15: 12,
  })}`);
}

// 51 Läufe des ECMWF-Ensembles (15 Tage) für die Unsicherheitsbänder
export function fetchEnsemble(p) {
  return getJSON(`${OM_ENS}?${q({
    latitude: c4(p.lat), longitude: c4(p.lon), timezone: "auto", timeformat: "unixtime", forecast_days: 16,
    models: "ecmwf_ifs025", daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
  })}`, 20000);
}

// Amtliche DWD-Warnungen (nur Deutschland). location ist null außerhalb Deutschlands.
export function fetchAlerts(p) {
  return getJSON(`${BS}/alerts?${q({ lat: c4(p.lat), lon: c4(p.lon) })}`);
}

// Letzte Messung der nächsten DWD-Station
export function fetchStation(p) {
  return getJSON(`${BS}/current_weather?${q({ lat: c4(p.lat), lon: c4(p.lon), max_dist: 30000 })}`);
}

// Radar-Nowcast am Ort: 5-Minuten-Werte, Messung + 2 h Vorhersage. Liefert [{t, mmh}], ref (letzte Messung)
const STEP = 5 * 60000;
const isoMs = (d) => d.toISOString().replace(/\.\d+Z$/, ".000Z");
export async function fetchNowcast(p) {
  try {
    const e = 0.005;
    const from = new Date(Math.floor((Date.now() - 15 * 60000) / STEP) * STEP);
    const to = new Date(+from + 140 * 60000);
    const url = `${DWD_WMS}?service=WMS&version=1.1.1&request=GetFeatureInfo&layers=${RADAR_LAYER}&query_layers=${RADAR_LAYER}&styles=` +
      `&srs=EPSG:4326&bbox=${p.lon - e},${p.lat - e},${p.lon + e},${p.lat + e}&width=3&height=3&x=1&y=1` +
      `&info_format=application/json&feature_count=100&time=${isoMs(from)}/${isoMs(to)}`;
    const j = await getJSON(url, 12000);
    const f = j.features || [];
    if (!f.length) throw new Error("keine Radardaten");
    const ref = f.find((x) => x.properties.REFERENCE_TIME)?.properties.REFERENCE_TIME;
    const pts = f.map((x) => {
      const pr = x.properties;
      const v = pr.RV_ANALYSIS ?? Object.values(pr).find((y) => typeof y === "number") ?? 0;
      return { t: Date.parse(pr.TIME), mmh: Math.max(0, v) * 12 };
    }).sort((a, b) => a.t - b.t);
    return { src: "dwd", ref: ref ? Date.parse(ref) : null, pts };
  } catch (err) {
    // Ersatz: Bright Sky (gleiche DWD-Daten, auf 0,01 mm gerundet)
    const date = new Date(Date.now() - 10 * 60000).toISOString();
    const j = await getJSON(`${BS}/radar?${q({ lat: c4(p.lat), lon: c4(p.lon), distance: 1000, format: "plain", date })}`, 15000);
    const x = Math.round(j.latlon_position.x), y = Math.round(j.latlon_position.y);
    const pts = j.radar.map((r) => ({ t: Date.parse(r.timestamp), mmh: ((r.precipitation_5[y] || [])[x] || 0) * 12 / 100 }));
    if (!pts.length) throw err;
    return { src: "brightsky", ref: null, pts };
  }
}

export function radarMapUrl(time, bbox3857, w, h) {
  return `${DWD_WMS}?service=WMS&version=1.3.0&request=GetMap&layers=${RADAR_LAYER}&styles=&format=image/png&transparent=true` +
    `&crs=EPSG:3857&width=${w}&height=${h}&bbox=${bbox3857.join(",")}&time=${isoMs(new Date(time))}`;
}

export async function geocode(name) {
  const j = await getJSON(`${OM_GEO}?${q({ name, count: 8, language: "de", format: "json" })}`, 10000);
  return (j.results || []).map((r) => ({
    id: "g" + r.id,
    name: r.name,
    region: [r.admin1, r.country_code !== "DE" ? r.country : null].filter(Boolean).join(", "),
    detail: [r.admin3 || r.admin2, r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude, lon: r.longitude,
  }));
}

export async function reverse(lat, lon) {
  const j = await getJSON(`${NOMINATIM}?${q({ format: "jsonv2", lat: c4(lat), lon: c4(lon), zoom: 12, "accept-language": "de" })}`, 8000);
  const a = j.address || {};
  return {
    name: a.village || a.town || a.city || a.municipality || a.suburb || j.name || "Mein Standort",
    region: [a.county, a.state].filter(Boolean).join(", "),
  };
}
