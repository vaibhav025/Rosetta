"use client";

import { useEffect, useRef } from "react";

/**
 * One fixed, full-screen light-ribbon canvas behind the whole site. Mounted
 * once in the root layout, so it never restarts between pages.
 *
 * - Hero: a hairpin of ~170 lime fibers (blue and teal along the outer edge)
 *   that sweeps in from the upper right, pinches into a blazing white-lime
 *   point between the headline and the product window, and fans back out to
 *   the lower right. Sparkles ride along the fibers.
 * - Middle sections: the same light, widened and heavily blurred into soft
 *   lime / teal aurora beams that keep sweeping as you scroll.
 * - Pricing: sharp horizontal waves.
 * - Always moving (silk ripple, flowing sparkles); scroll drives the shape,
 *   heavily smoothed so it trails; the cursor gently bends nearby fibers.
 * - A second, blurred copy of the canvas is screened on top as bloom.
 */

type Fiber = {
  a: number;
  b: number;
  phase: number;
  speed: number;
  width: number;
  alpha: number;
  color: number;
  /** Rainbow stripe (light theme), ordered across the ribbon's width. */
  band: number;
};
type Mote = { x: number; y: number; r: number; vx: number; vy: number; alpha: number };
type Spark = { fiber: number; offset: number; speed: number; size: number };

/** Lime, pale lime, green, teal, blue. */
const COLORS = ["200,245,60", "232,255,150", "150,235,90", "70,220,200", "79,168,255"];
/** Light theme: the six classic rainbow stripes — green, yellow, orange, red, purple, blue. */
const RAINBOW = ["122,185,41", "254,197,43", "255,102,28", "209,15,42", "174,27,174", "1,160,224"];
const SAMPLES = 56;

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Where the hero hairpin pinches, in viewport fractions. */
const pinchFor = (small: boolean) => (small ? { x: 0.78, y: 0.32 } : { x: 0.5, y: 0.6 });

/* Shapes: (u along the fiber 0..1, fiber, time, scroll flow) -> viewport fractions. */

function heroShape(u: number, f: Fiber, t: number, flow: number, small: boolean): [number, number] {
  const P = pinchFor(small);
  const v = -1.15 + 2.5 * u; // top arm (v < 0) -> pinch (0) -> lower arm (v > 0)
  const av = Math.abs(v);
  const reach = v < 0 ? 0.56 + 0.16 * f.a : 0.6 + 0.3 * f.a;
  const open = (small ? 0.26 : 0.4) + (small ? 0.12 : 0.24) * f.b;
  let x = P.x + Math.pow(av, 1.7) * open + Math.abs(f.a) * 0.004;
  let y = P.y + v * reach;
  // The lower arm sweeps out in an S, like silk.
  x += 0.09 * Math.sin(v * 2.4 + f.a * 1.4 + t * 0.5 + flow * 1.4) * av;
  x += 0.009 * Math.sin(v * 5 + t * f.speed * 0.7 + f.phase) * av;
  y += 0.02 * Math.sin(v * 6 + t * f.speed * 1.6 + f.phase) * av + 0.015 * Math.sin(t * 0.6) * av;
  // Scrolling carries the ribbon right to left.
  x -= flow * 0.22;
  y -= flow * 0.1;
  return [x, y];
}

function swirlShape(u: number, f: Fiber, t: number, flow: number): [number, number] {
  // A zoomed-in arm of the ribbon that keeps sweeping with scroll: aurora beams.
  const tilt = 0.8 + 0.5 * Math.sin(flow * 0.7);
  // Drifts steadily right -> left down the page.
  const x = -0.15 + 1.3 * u + 0.3 * Math.cos(flow * 0.35);
  const y =
    0.5 + (0.55 - u) * 1.2 * tilt + 0.16 * Math.sin(2 * Math.PI * u * 1.1 + f.a * 1.5 + t * 0.12 + flow * 1.1);
  const width = 0.22 * (0.65 + 0.35 * Math.sin(u * 3.2 + t * 0.18 + f.phase + flow * 0.8));
  const ripple = Math.sin(u * 7 + t * f.speed * 0.8 + f.phase + flow * 1.6) * 0.02;
  return [x + (f.a * width + ripple) * 0.68, y + (f.a * width + ripple) * 0.73];
}

function waveShape(u: number, f: Fiber, t: number, flow: number): [number, number] {
  const x = -0.1 + 1.2 * u + 0.15 * Math.cos(flow * 0.35);
  const y =
    0.5 +
    f.a * 0.2 +
    0.045 * Math.sin(2 * Math.PI * u * 1.4 + t * 0.45 + f.a * 1.4 + f.phase * 0.25 + flow * 1.4) +
    0.012 * Math.sin(u * 11 + t * f.speed + f.phase + flow * 2);
  return [x, y];
}

export function RibbonField() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const glow = glowRef.current;
    if (!wrap || !canvas || !glow) return;
    const ctx = canvas.getContext("2d");
    const gctx = glow.getContext("2d");
    if (!ctx || !gctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const small = window.matchMedia("(max-width: 767px)").matches;
    const r = rng(11);

    const fibers: Fiber[] = Array.from({ length: small ? 110 : 170 }, () => {
      const a = r() * 2 - 1;
      const pick = r();
      // Blue and teal sit along the outer edge of the fan.
      const color = a > 0.35 && pick < 0.5 ? (pick < 0.3 ? 4 : 3) : pick < 0.15 ? 1 : pick < 0.3 ? 2 : 0;
      return {
        a,
        b: r() * 2 - 1,
        phase: r() * Math.PI * 2,
        speed: 0.35 + r() * 0.5,
        width: r() < 0.12 ? 1.4 + r() * 1.2 : 0.4 + r() * 0.8,
        alpha: 0.28 + r() * 0.55,
        color,
        band: Math.min(5, Math.floor(((a + 1) / 2) * 6)),
      };
    });
    const sparks: Spark[] = Array.from({ length: small ? 140 : 240 }, () => ({
      fiber: Math.floor(r() * fibers.length),
      offset: r(),
      speed: 0.05 + r() * 0.09,
      size: 0.6 + r() * 1.4,
    }));
    const dust: Mote[] = Array.from({ length: small ? 40 : 80 }, () => ({
      x: r(),
      y: r(),
      r: 0.5 + r() * 1.3,
      vx: (r() - 0.3) * 0.006,
      vy: -(0.004 + r() * 0.01),
      alpha: 0.15 + r() * 0.45,
    }));
    const bokeh: Mote[] = Array.from({ length: small ? 6 : 12 }, () => ({
      x: r(),
      y: r(),
      r: 30 + r() * 70,
      vx: (r() - 0.5) * 0.004,
      vy: (r() - 0.5) * 0.003,
      alpha: 0.03 + r() * 0.06,
    }));

    // Soft lime sprite (bokeh, halo) and a white-hot core sprite.
    const sprite = (inner: string) => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g2 = c.getContext("2d")!;
      const g = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, inner);
      g.addColorStop(0.3, "rgba(200,245,60,0.35)");
      g.addColorStop(1, "rgba(200,245,60,0)");
      g2.fillStyle = g;
      g2.fillRect(0, 0, 128, 128);
      return c;
    };
    const lime = sprite("rgba(200,245,60,1)");
    const hot = sprite("rgba(255,255,240,1)");
    const tint = (c: string) => {
      const s = document.createElement("canvas");
      s.width = s.height = 128;
      const g2 = s.getContext("2d")!;
      const g = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, `rgba(${c},0.9)`);
      g.addColorStop(0.35, `rgba(${c},0.35)`);
      g.addColorStop(1, `rgba(${c},0)`);
      g2.fillStyle = g;
      g2.fillRect(0, 0, 128, 128);
      return s;
    };
    const tints = RAINBOW.map(tint);
    // The pinch in light theme: a soft rainbow wheel where every stripe meets.
    const wheel = (() => {
      const s = document.createElement("canvas");
      s.width = s.height = 128;
      const g2 = s.getContext("2d")!;
      const cg = g2.createConicGradient(-Math.PI / 2, 64, 64);
      [...RAINBOW, RAINBOW[0]].forEach((c, i) => cg.addColorStop(i / 6, `rgb(${c})`));
      g2.fillStyle = cg;
      g2.fillRect(0, 0, 128, 128);
      g2.globalCompositeOperation = "destination-in";
      const m = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
      m.addColorStop(0, "rgba(0,0,0,0.85)");
      m.addColorStop(0.4, "rgba(0,0,0,0.35)");
      m.addColorStop(1, "rgba(0,0,0,0)");
      g2.fillStyle = m;
      g2.fillRect(0, 0, 128, 128);
      return s;
    })();

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Bloom at half resolution: it's blurred anyway.
      glow.width = Math.round(w / 2);
      glow.height = Math.round(h / 2);
    };
    resize();

    // Pointer, smoothed.
    let px = -9999;
    let py = -9999;
    let mx = px;
    let my = py;
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (mx < -9000) {
        mx = px;
        my = py;
      }
    };
    const onLeave = () => {
      px = py = -9999;
    };

    /** 0 = hero, 1 = middle, 2 = pricing. */
    const targetStage = () => {
      const y = window.scrollY;
      const vh = h || window.innerHeight;
      const pricing = document.getElementById("pricing");
      const pricingTop = pricing ? pricing.getBoundingClientRect().top + y : document.documentElement.scrollHeight - vh;
      const toMiddle = smooth(vh * 0.25, vh * 1.1, y);
      const toPricing = smooth(pricingTop - vh * 1.3, pricingTop - vh * 0.35, y);
      return Math.min(toMiddle + toPricing, 2);
    };
    let stage = targetStage();
    let target = stage;
    /** Scroll position in viewport heights: keeps the ribbon moving through every section. */
    let flowTarget = window.scrollY / window.innerHeight;
    let flow = flowTarget;
    const onScroll = () => {
      target = targetStage();
      flowTarget = window.scrollY / (h || window.innerHeight);
    };

    let t = 0;
    let last = performance.now();
    let raf = 0;
    let lastFilter = "";
    const pts = new Float32Array((SAMPLES + 1) * 2);
    let wHero = 1;
    let wMid = 0;
    let wWave = 0;
    /** Opening: fibers draw in from the upper right over ~2.4s. */
    let intro = 0;

    /** One point of fiber f at u, blended across the three shapes, in px. */
    const pointAt = (u: number, f: Fiber): [number, number] => {
      let x = 0;
      let y = 0;
      if (wHero > 0.001) {
        const [hx, hy] = heroShape(u, f, t, flow, small);
        x += hx * wHero;
        y += hy * wHero;
      }
      if (wMid > 0.001) {
        const [sx, sy] = swirlShape(u, f, t, flow);
        x += sx * wMid;
        y += sy * wMid;
      }
      if (wWave > 0.001) {
        const [vx, vy] = waveShape(u, f, t, flow);
        x += vx * wWave;
        y += vy * wWave;
      }
      x *= w;
      y *= h;
      // Cursor bends nearby fibers away, gently.
      const dx = x - mx;
      const dy = y - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < 170 * 170) {
        const d = Math.sqrt(d2) || 1;
        const k = Math.pow(1 - d / 170, 2) * 34;
        x += (dx / d) * k;
        y += (dy / d) * k;
      }
      return [x, y];
    };

    const frame = (now: number) => {
      const light = document.documentElement.dataset.theme === "light";
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      // Always moving (the owner wants it alive); gentler with reduced motion.
      const still = false;
      t += dt * (reduce.matches ? 0.5 : 1.25);
      intro = Math.min(1, intro + dt / 2.4);
      const reach = 1 - Math.pow(1 - intro, 3);
      const n = Math.max(1, Math.round(SAMPLES * reach));

      // Heavy smoothing: the shape trails the scroll.
      const ease = 1 - Math.pow(0.03, dt);
      stage += (target - stage) * ease;
      flow += (flowTarget - flow) * ease;
      mx += (px - mx) * (1 - Math.pow(0.001, dt));
      my += (py - my) * (1 - Math.pow(0.001, dt));

      wHero = 1 - smooth(0, 1, stage);
      wWave = smooth(1, 2, stage);
      wMid = Math.max(0, 1 - wHero - wWave);

      // Middle sections: soft aurora beams, still in full colour.
      const blur = 22 * wMid;
      const filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "none";
      if (filter !== lastFilter) {
        wrap.style.filter = filter;
        lastFilter = filter;
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      // Additive light on black; plain painting on a light page (additive would wash to white).
      ctx.globalCompositeOperation = light ? "source-over" : "lighter";

      // Bokeh.
      for (const [bi, b] of bokeh.entries()) {
        if (!still) {
          b.x = (b.x + b.vx * dt + 1.2) % 1.2;
          b.y = (b.y + b.vy * dt + 1.2) % 1.2;
        }
        ctx.globalAlpha = b.alpha;
        ctx.drawImage(light ? tints[bi % 6] : lime, b.x * w - b.r - 0.1 * w, b.y * h - b.r - 0.1 * h, b.r * 2, b.r * 2);
      }

      // Brightest where the light is focused: the pinch in the hero.
      const P = pinchFor(small);
      const fx = ((P.x - flow * 0.22) * wHero + (0.4 + 0.3 * Math.cos(flow * 0.35)) * wMid + 0.5 * wWave) * w;
      const fy = ((P.y - flow * 0.1) * wHero + 0.45 * wMid + 0.5 * wWave) * h;
      const span = Math.max(w, h) * (0.55 * wHero + 0.9 * wMid + 0.75 * wWave);
      const styles = (light ? RAINBOW : COLORS).map((c) => {
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, span);
        g.addColorStop(0, `rgba(${c},1)`);
        g.addColorStop(0.05, `rgba(${c},0.95)`);
        g.addColorStop(0.25, `rgba(${c},0.55)`);
        g.addColorStop(0.6, `rgba(${c},0.26)`);
        g.addColorStop(1, `rgba(${c},0.1)`);
        return g;
      });

      // Fibers.
      const widen = 1 + 3 * wMid;
      for (const f of fibers) {
        for (let i = 0; i <= n; i++) {
          const [x, y] = pointAt((i / SAMPLES), f);
          pts[i * 2] = x;
          pts[i * 2 + 1] = y;
        }
        // Aurora in the middle is softer so card text stays readable.
        ctx.globalAlpha = Math.min(1, f.alpha * (light ? 1.25 : 1)) * (1 - (light ? 0.5 : 0.78) * wMid);
        ctx.strokeStyle = styles[light ? f.band : f.color];
        ctx.lineWidth = f.width * widen;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 1; i < n; i++) {
          const cx = pts[i * 2];
          const cy = pts[i * 2 + 1];
          ctx.quadraticCurveTo(cx, cy, (cx + pts[i * 2 + 2]) / 2, (cy + pts[i * 2 + 3]) / 2);
        }
        ctx.lineTo(pts[n * 2], pts[n * 2 + 1]);
        ctx.stroke();
      }

      // Sparkles flowing along the fibers.
      for (const s of sparks) {
        const u = (((s.offset + t * s.speed) % 1) + 1) % 1;
        if (u > reach) continue;
        const [x, y] = pointAt(u, fibers[s.fiber]);
        const d = Math.hypot(x - fx, y - fy) / span;
        ctx.globalAlpha = Math.max(0, 0.9 - d) * (0.6 + 0.4 * Math.sin(t * 3 + s.offset * 20));
        ctx.fillStyle = light ? `rgb(${RAINBOW[fibers[s.fiber].band]})` : "rgb(240,255,210)";
        ctx.fillRect(x - s.size / 2, y - s.size / 2, s.size, s.size);
      }

      // The blazing pinch (hero only).
      if (wHero > 0.01 && reach > 0.45) {
        const gx = (P.x - flow * 0.22) * w;
        const gy = (P.y - flow * 0.1) * h;
        const pulse = 1 + 0.06 * Math.sin(t * 1.4);
        ctx.globalAlpha = 0.5 * wHero;
        ctx.drawImage(light ? wheel : lime, gx - 170 * pulse, gy - 170 * pulse, 340 * pulse, 340 * pulse);
        ctx.globalAlpha = 0.95 * wHero * smooth(0.45, 0.6, reach);
        ctx.drawImage(light ? wheel : hot, gx - 34, gy - 34, 68, 68);
      }

      // Dust.
      ctx.fillStyle = "rgb(235,255,200)";
      for (const [mi, m] of dust.entries()) {
        if (light) ctx.fillStyle = `rgb(${RAINBOW[mi % 6]})`;
        if (!still) {
          m.x = (m.x + m.vx * dt + 1) % 1;
          m.y = (m.y + m.vy * dt + 1) % 1;
        }
        ctx.globalAlpha = m.alpha * (0.6 + 0.4 * Math.sin(t * 0.8 + m.x * 40));
        ctx.beginPath();
        ctx.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Bloom: a blurred copy screened on top (blur is CSS, so it works in Safari).
      gctx.clearRect(0, 0, glow.width, glow.height);
      gctx.drawImage(canvas, 0, 0, glow.width, glow.height);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(onScroll);
    ro.observe(document.body);
    const onResize = () => {
      resize();
      onScroll();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} aria-hidden className="ribbon-field">
      <canvas ref={canvasRef} />
      <canvas ref={glowRef} className="ribbon-glow" />
    </div>
  );
}
