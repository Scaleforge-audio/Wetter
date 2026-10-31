// Lebendiger Himmel als Hintergrund: Farbe nach Sonnenstand und Bewölkung, Wolken, Regen, Schnee, Nebel, Sterne, Blitze
import { clamp, lerp } from "./fmt.js";

// Klarer Himmel nach Sonnenhöhe: [Höhe, oben, unten]
const KEYS = [
  [-18, [3, 8, 26], [10, 21, 50]],
  [-12, [6, 16, 48], [22, 40, 84]],
  [-6, [20, 34, 84], [74, 78, 132]],
  [-2, [36, 52, 110], [178, 108, 126]],
  [2, [56, 96, 164], [236, 160, 112]],
  [8, [44, 108, 190], [132, 180, 228]],
  [22, [28, 96, 182], [104, 166, 222]],
];
function clearSky(el) {
  if (el <= KEYS[0][0]) return [KEYS[0][1], KEYS[0][2]];
  for (let i = 1; i < KEYS.length; i++) {
    if (el <= KEYS[i][0]) {
      const a = KEYS[i - 1], b = KEYS[i], t = (el - a[0]) / (b[0] - a[0]);
      return [a[1].map((v, j) => lerp(v, b[1][j], t)), a[2].map((v, j) => lerp(v, b[2][j], t))];
    }
  }
  const z = KEYS[KEYS.length - 1];
  return [z[1], z[2]];
}
function overcast(rgb, k, dark) {
  const l = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
  const g = [l * 0.94 * dark, l * 0.98 * dark, l * 1.07 * dark];
  return rgb.map((v, i) => clamp(lerp(v, g[i], k), 0, 255));
}
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const WET = { drizzle: 0.35, rain: 0.75, heavy: 1.35, sleet: 0.6, thunder: 1.15 };

export function createSky(canvas) {
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let W = 0, H = 0, DPR = 1, area = 1;
  let cond = { el: -20, cloud: 30, kind: "clear", intensity: null, wind: 8, windDir: 270, isDay: false };
  let top = [10, 21, 50], bot = [22, 40, 84], tTop = top, tBot = bot;
  let rain = [], snow = [], clouds = [], stars = [], fog = [];
  let raf = 0, last = 0, lastDraw = 0, flash = 0, nextFlash = 0, flashSeq = [];
  let windVx = 0;

  // Wolken-Sprites vorrendern
  function puff(fill, seed) {
    const c = document.createElement("canvas");
    c.width = 360; c.height = 170;
    const x = c.getContext("2d");
    let s = seed;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 14; i++) {
      const cx = 60 + rnd() * 240, cy = 70 + rnd() * 50 - (Math.abs(cx - 180) < 80 ? 20 : 0), r = 34 + rnd() * 46;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, css(fill, 0.55)); g.addColorStop(0.6, css(fill, 0.28)); g.addColorStop(1, css(fill, 0));
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    }
    return c;
  }
  const SPR = {
    light: [puff([255, 255, 255], 7), puff([255, 255, 255], 23), puff([255, 255, 255], 51)],
    grey: [puff([150, 160, 176], 7), puff([150, 160, 176], 23), puff([150, 160, 176], 51)],
    dark: [puff([72, 80, 96], 7), puff([72, 80, 96], 23), puff([72, 80, 96], 51)],
  };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = Math.max(window.innerHeight, document.documentElement.clientHeight);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    area = clamp((W * H) / (390 * 844), 0.6, 2.6);
    build(true);
    if (!running()) drawFrame(0);
  }

  function rainLevel() {
    if (cond.intensity != null && cond.intensity >= 0.1 && cond.kind !== "snow") return clamp(0.3 + Math.log2(1 + cond.intensity) * 0.4, 0.3, 1.7);
    return WET[cond.kind] || 0;
  }
  function snowLevel() {
    if (cond.kind === "snow") return cond.intensity != null && cond.intensity > 0 ? clamp(0.5 + cond.intensity * 0.4, 0.5, 1.5) : 0.8;
    if (cond.kind === "sleet") return 0.35;
    return 0;
  }

  function build(keepClouds) {
    const rl = rainLevel(), sl = snowLevel();
    const nr = Math.round(rl * 230 * area), ns = Math.round(sl * 150 * area);
    while (rain.length < nr) rain.push(newDrop(true));
    rain.length = nr;
    while (snow.length < ns) snow.push(newFlake(true));
    snow.length = ns;

    const dirTo = ((cond.windDir || 270) + 180) * Math.PI / 180;
    windVx = Math.sin(dirTo) * Math.min(cond.wind || 0, 60);

    const cover = cond.kind === "fog" ? 60 : clamp(cond.cloud ?? 30, 0, 100);
    const nc = Math.min(13, Math.round((cover / 100) * 10) + (WET[cond.kind] ? 3 : 0));
    if (!keepClouds || clouds.length !== nc) {
      clouds = Array.from({ length: nc }, (_, i) => newCloud(i, nc, true));
    }
    if (!stars.length || stars.w !== W) {
      stars = Array.from({ length: Math.round(150 * Math.sqrt(area)) }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.75, r: 0.4 + Math.random() * 1.1, p: Math.random() * 6.28, s: 0.6 + Math.random() * 1.6 }));
      stars.w = W;
    }
    fog = cond.kind === "fog" ? Array.from({ length: 5 }, (_, i) => ({ x: Math.random() * W, y: H * (0.35 + i * 0.14), s: 2.2 + Math.random() * 1.4, v: 4 + Math.random() * 6 })) : [];
  }
  function newDrop(anywhere) {
    const far = Math.random() < 0.55;
    return { x: Math.random() * (W + 200) - 100, y: anywhere ? Math.random() * H : -20 - Math.random() * 60, l: far ? 9 + Math.random() * 7 : 15 + Math.random() * 12, v: far ? 520 + Math.random() * 180 : 760 + Math.random() * 260, far };
  }
  function newFlake(anywhere) {
    return { x: Math.random() * W, y: anywhere ? Math.random() * H : -10, r: 0.8 + Math.random() * 2.4, v: 26 + Math.random() * 46, p: Math.random() * 6.28, a: 0.5 + Math.random() * 0.45 };
  }
  function newCloud(i, n, anywhere) {
    const s = (0.9 + Math.random() * 1.1) * Math.max(W, 420) / 360;
    return { x: anywhere ? Math.random() * (W + 360 * s) - 360 * s : (windVx >= 0 ? -360 * s : W), y: H * (Math.random() * 0.5) - 40 * s, s, k: (i % 3), v: 5 + Math.random() * 6, a: 0.6 + Math.random() * 0.4 };
  }

  function targetColors() {
    let [a, b] = clearSky(cond.el);
    const wet = WET[cond.kind] ? 1 : 0;
    let k = clamp((cond.cloud ?? 0) / 100, 0, 1) * 0.82 + wet * 0.12;
    let dark = 1;
    if (cond.kind === "rain" || cond.kind === "drizzle" || cond.kind === "sleet") dark = 0.8;
    if (cond.kind === "heavy" || cond.kind === "thunder") { dark = 0.62; k = Math.max(k, 0.95); }
    if (cond.kind === "fog") { k = 0.9; dark = 0.92; }
    if (cond.kind === "snow") { k = Math.max(k, 0.85); dark = 0.9; }
    if (cond.kind === "cloudy") dark = 0.9;
    return [overcast(a, clamp(k, 0, 1), dark), overcast(b, clamp(k, 0, 1), dark)];
  }

  function step(dt, t) {
    const slant = windVx / 160;
    for (const d of rain) {
      d.y += d.v * dt; d.x += d.v * slant * dt;
      if (d.y > H + 20) Object.assign(d, newDrop(false));
      if (d.x > W + 120) d.x -= W + 220; else if (d.x < -120) d.x += W + 220;
    }
    for (const f of snow) {
      f.y += f.v * dt; f.x += (Math.sin(t * 0.8 + f.p) * 18 + windVx * 0.8) * dt;
      if (f.y > H + 10) Object.assign(f, newFlake(false));
      if (f.x > W + 10) f.x = -10; else if (f.x < -10) f.x = W + 10;
    }
    const cv = (windVx >= 0 ? 1 : -1);
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      c.x += cv * (c.v + Math.abs(windVx) * 0.35) * dt;
      if (c.x > W + 40 || c.x < -360 * c.s - 40) clouds[i] = newCloud(i, clouds.length, false);
    }
    for (const f of fog) { f.x += f.v * dt; if (f.x > W + 200) f.x = -360 * f.s; }
    if (cond.kind === "thunder" && !reduced.matches) {
      if (t > nextFlash) { flashSeq = [[t, 0.55], [t + 0.08, 0.05], [t + 0.16, 0.35], [t + 0.3, 0]]; nextFlash = t + 4 + Math.random() * 7; }
      flash = 0;
      for (let i = 0; i < flashSeq.length - 1; i++) {
        const [t0, a0] = flashSeq[i], [t1, a1] = flashSeq[i + 1];
        if (t >= t0 && t < t1) flash = lerp(a0, a1, (t - t0) / (t1 - t0));
      }
    } else flash = 0;
  }

  function drawFrame(t) {
    // Himmel
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, css(top)); g.addColorStop(1, css(bot));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Sonnenschein
    const cover = (cond.cloud ?? 0) / 100;
    const glowA = clamp((cond.el + 3) / 8, 0, 1) * (1 - cover * 0.85) * (WET[cond.kind] ? 0.3 : 1) * 0.6;
    if (glowA > 0.01) {
      const gx = W * 0.8, gy = H * clamp(0.42 - (cond.el / 60) * 0.36, 0.04, 0.6), r = Math.max(W, H) * 0.65;
      const warm = clamp(1 - cond.el / 18, 0, 1);
      const col = [255, lerp(244, 196, warm), lerp(206, 128, warm)];
      const sg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      sg.addColorStop(0, css(col, glowA)); sg.addColorStop(0.25, css(col, glowA * 0.35)); sg.addColorStop(1, css(col, 0));
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    }

    // Sterne
    const starA = clamp((-cond.el - 5) / 8, 0, 1) * (1 - cover * 0.95) * (WET[cond.kind] || cond.kind === "fog" ? 0 : 1);
    if (starA > 0.02) {
      ctx.fillStyle = "#fff";
      for (const s of stars) {
        ctx.globalAlpha = starA * (0.45 + 0.55 * Math.sin(t * s.s + s.p) ** 2) * 0.9;
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    }

    // Wolken
    const day = clamp((cond.el + 6) / 10, 0, 1);
    const wet = !!WET[cond.kind];
    const heavy = wet || cover > 0.7 || cond.kind === "snow" || cond.kind === "fog";
    const set = day > 0.4 ? (heavy ? SPR.grey : SPR.light) : wet ? SPR.dark : SPR.grey;
    const baseA = day > 0.4 ? (heavy ? 0.42 : 0.26 + cover * 0.3) : 0.2 + cover * 0.22;
    for (const c of clouds) {
      ctx.globalAlpha = baseA * c.a;
      ctx.drawImage(set[c.k], c.x, c.y, 360 * c.s, 170 * c.s);
    }
    // Nebel
    for (const f of fog) {
      ctx.globalAlpha = day > 0.4 ? 0.32 : 0.22;
      ctx.drawImage(SPR.grey[1], f.x, f.y - 80 * f.s, 360 * f.s * 1.6, 170 * f.s);
    }
    ctx.globalAlpha = 1;

    // Regen
    if (rain.length) {
      const slant = windVx / 160;
      ctx.lineCap = "round";
      for (const far of [true, false]) {
        ctx.beginPath();
        for (const d of rain) {
          if (d.far !== far) continue;
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - slant * d.l, d.y - d.l);
        }
        ctx.strokeStyle = far ? "rgba(200,222,255,0.22)" : "rgba(215,232,255,0.42)";
        ctx.lineWidth = far ? 1 : 1.4;
        ctx.stroke();
      }
    }
    // Schnee
    if (snow.length) {
      ctx.fillStyle = "#fff";
      for (const f of snow) {
        ctx.globalAlpha = f.a;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (flash > 0.01) { ctx.fillStyle = `rgba(235,240,255,${flash})`; ctx.fillRect(0, 0, W, H); }
  }

  const running = () => raf !== 0;
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    const t = ts / 1000;
    const dt = Math.min(0.05, last ? t - last : 0.016);
    last = t;
    // Farbübergang
    const e = Math.min(1, dt * 1.6);
    top = top.map((v, i) => lerp(v, tTop[i], e));
    bot = bot.map((v, i) => lerp(v, tBot[i], e));
    step(dt, t);
    // Ohne Niederschlag reicht eine niedrigere Bildrate (schont den Akku)
    const busy = rain.length || snow.length || flash > 0 || flashSeq.length && t < flashSeq[flashSeq.length - 1][0];
    if (busy || ts - lastDraw > 48) { drawFrame(t); lastDraw = ts; }
  }
  function start() {
    if (reduced.matches || document.hidden || raf) return;
    last = 0; raf = requestAnimationFrame(loop);
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  reduced.addEventListener?.("change", () => { if (reduced.matches) { stop(); top = tTop; bot = tBot; drawFrame(0); } else start(); });
  let rt = 0;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 120); });

  resize();
  start();

  return {
    set(c) {
      const kindChanged = c.kind !== cond.kind || Math.abs((c.cloud ?? 0) - (cond.cloud ?? 0)) > 15;
      cond = { ...cond, ...c };
      [tTop, tBot] = targetColors();
      build(!kindChanged);
      if (reduced.matches || !running()) { top = tTop; bot = tBot; drawFrame(1); }
      return css(tTop);
    },
  };
}
