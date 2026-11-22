"use client";

import { memo, useEffect, useRef } from "react";

type Pt = { x: number; y: number };
type Side = "near" | "far";
type Plan = { gs: number; ge: number; from: Pt; to: Pt; a0: number; hitT: number; aw: number; ah: number; ready: Pt };
type Shot = { t0: number; d: number; from: Pt; to: Pt; peak: number; bounce: number | null; peak2: number; hitter: Side; miss: boolean };

const RallyCourt = memo(function RallyCourt() {
  const root = useRef<SVGSVGElement>(null);
  const ballG = useRef<SVGGElement>(null), lift = useRef<SVGGElement>(null), shade = useRef<SVGEllipseElement>(null), spin = useRef<SVGGElement>(null);
  const nearG = useRef<SVGGElement>(null), farG = useRef<SVGGElement>(null);

  useEffect(() => {
    const svg = root.current, ball = ballG.current, lf = lift.current, sh = shade.current, sp = spin.current, nr = nearG.current, fr = farG.current;
    if (!svg || !ball || !lf || !sh || !sp || !nr || !fr) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = [ball, lf, sh, sp, nr, fr];
    const initial = elements.map(el => ({ transform: el.getAttribute("transform"), opacity: el.getAttribute("opacity") }));

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const c01 = (v: number) => clamp(v, 0, 1);
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const lerp = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    const RAD = Math.PI / 180, REACH = 80; // grip â†’ face edge distance
    const dir = (side: Side, deg: number): Pt => { const s = Math.sin(deg * RAD), c = Math.cos(deg * RAD); return side === "near" ? { x: s, y: -c } : { x: -s, y: c }; };
    const readyOf = (side: Side): Pt => (side === "near" ? { x: rnd(150, 250), y: 252 } : { x: rnd(150, 250), y: -138 });

    const mkPlan = (side: Side, cur: { p: Pt; a: number }, t0: number, hitT: number, contact: Pt): Plan => {
      const sign = Math.random() < 0.5 ? -1 : 1;
      const ah = sign * rnd(16, 36), aw = -sign * rnd(18, 34);
      const d = dir(side, ah);
      return { gs: t0 + 0.06, ge: Math.max(t0 + 0.1, hitT - 0.32), from: cur.p, to: { x: contact.x - REACH * d.x, y: contact.y - REACH * d.y }, a0: cur.a, hitT, aw, ah, ready: readyOf(side) };
    };
    const pose = (pl: Plan, t: number): { p: Pt; a: number } => {
      if (t < pl.hitT - 0.3) { const k = ease(c01((t - pl.gs) / Math.max(0.01, pl.ge - pl.gs))); return { p: lerp(pl.from, pl.to, k), a: pl.a0 * (1 - c01((t - pl.gs) / 0.25)) }; }
      if (t < pl.hitT - 0.08) return { p: pl.to, a: pl.aw * ease((t - (pl.hitT - 0.3)) / 0.22) };
      if (t < pl.hitT) { const u = (t - (pl.hitT - 0.08)) / 0.08; return { p: pl.to, a: pl.aw + (pl.ah - pl.aw) * u * u }; }
      return { p: lerp(pl.to, pl.ready, ease(c01((t - pl.hitT - 0.2) / 1.0))), a: pl.ah * (1 - ease(c01((t - pl.hitT) / 0.35))) };
    };

    const idle = (side: Side): Plan => { const r = readyOf(side); return { gs: 0, ge: 0.001, from: r, to: r, a0: 0, hitT: 1e9, aw: 0, ah: 0, ready: r }; };
    const plans: Record<Side, Plan> = { near: idle("near"), far: idle("far") };
    const cur: Record<Side, { p: Pt; a: number }> = { near: { p: plans.near.to, a: 0 }, far: { p: plans.far.to, a: 0 } };

    let shot: Shot | null = null, phase: "pause" | "play" = "pause", serveAt = 0, server: Side = Math.random() < 0.5 ? "near" : "far", serveC: Pt = { x: 0, y: 0 };
    let rallyLeft = 0, spinDeg = 0;

    const prepareServe = (t: number, afterMs: number) => {
      server = Math.random() < 0.5 ? "near" : "far";
      serveAt = t + afterMs;
      serveC = server === "near" ? { x: rnd(140, 260), y: rnd(170, 200) } : { x: rnd(140, 260), y: rnd(-74, -64) };
      plans[server] = mkPlan(server, cur[server], t, serveAt, serveC);
      rallyLeft = Math.floor(rnd(3, 10));
      shot = null;
    };

    const startShot = (hitter: Side, from: Pt, t0: number) => {
      const recv: Side = hitter === "near" ? "far" : "near";
      const r = Math.random(), type = rallyLeft === 1 ? "miss" : r < 0.34 ? "drive" : r < 0.58 ? "dink" : r < 0.74 ? "lob" : "bounce";
      const far = recv === "far";
      let d = 0.9, peak = 16, bounce: number | null = null, peak2 = 0, y = far ? rnd(-72, -62) : rnd(165, 215);
      if (type === "dink") { d = rnd(0.95, 1.2); peak = rnd(10, 18); y = far ? rnd(-60, -48) : rnd(105, 150); }
      else if (type === "lob") { d = rnd(1.5, 1.9); peak = rnd(48, 62); y = far ? rnd(-74, -68) : rnd(205, 225); }
      else if (type === "bounce") { d = rnd(1.15, 1.45); peak = rnd(22, 32); bounce = rnd(0.62, 0.74); peak2 = rnd(10, 18); y = far ? rnd(-70, -58) : rnd(150, 200); }
      else if (type === "drive") { d = rnd(0.72, 0.98); peak = rnd(12, 20); }
      else { d = rnd(1.0, 1.3); peak = rnd(20, 30); bounce = 0.7; peak2 = 10; } // missed return
      const base = cur[recv].p.x; // receiver's current grip x
      const tx = clamp(base + rnd(-150, 150), 35, 365);
      const to: Pt = { x: tx, y };
      const miss = type === "miss";
      // on a miss the receiver reaches for it but ends up short of the ball
      const contact: Pt = miss ? { x: clamp(tx + (tx < 200 ? -1 : 1) * rnd(55, 80), 20, 380), y: y + (far ? 8 : -8) } : to;
      shot = { t0, d, from, to, peak, bounce, peak2, hitter, miss };
      plans[recv] = mkPlan(recv, cur[recv], t0, t0 + d, contact);
      rallyLeft -= 1;
    };

    const ballAt = (s: Shot, t: number) => {
      const p = (t - s.t0) / s.d, q = clamp(p, 0, 1.45), e = 1 - Math.pow(1 - clamp(q, 0, 1), 1.2);
      let g = lerp(s.from, s.to, e), h = 0;
      if (p > 1) g = { x: s.to.x + (s.to.x - s.from.x) * 0.14 * (p - 1) * 2, y: s.to.y + (s.to.y - s.from.y) * 0.14 * (p - 1) * 2 }; // roll-out after a miss
      else if (s.bounce === null) h = s.peak * 4 * p * (1 - p);
      else if (p < s.bounce) { const u = p / s.bounce; h = s.peak * 4 * u * (1 - u); }
      else { const v = (p - s.bounce) / (1 - s.bounce); h = s.peak2 * 4 * v * (1 - v); }
      return { g, h };
    };

    let vt = 0, last = 0, raf = 0, running = false;
    prepareServe(0, 0.9);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; vt += dt;
      const t = vt;
      let guard = 0;
      while (guard++ < 12) {
        if (phase === "pause" && t >= serveAt) { startShot(server, serveC, serveAt); phase = "play"; continue; }
        if (phase === "play" && shot) {
          const end = shot.t0 + shot.d;
          if (t >= end && !shot.miss) { startShot(shot.hitter === "near" ? "far" : "near", shot.to, end); continue; }
          if (shot.miss && t >= end + 0.55) { phase = "pause"; prepareServe(t, rnd(1.0, 1.5)); continue; }
        }
        break;
      }
      for (const side of ["near", "far"] as Side[]) {
        const c = pose(plans[side], t); cur[side] = c;
        (side === "near" ? nr : fr).setAttribute("transform", `translate(${c.p.x.toFixed(2)} ${c.p.y.toFixed(2)}) rotate(${c.a.toFixed(2)})`);
      }
      if (shot && phase === "play") {
        const { g, h } = ballAt(shot, t);
        const fade = shot.miss && t > shot.t0 + shot.d ? 1 - c01((t - shot.t0 - shot.d) / 0.55) : 1;
        ball.setAttribute("transform", `translate(${g.x.toFixed(2)} ${g.y.toFixed(2)})`);
        lf.setAttribute("transform", `translate(0 ${(-h).toFixed(2)}) scale(${(1 + h * 0.008).toFixed(3)})`);
        sh.setAttribute("transform", `scale(${(1 - h * 0.008).toFixed(3)})`); sh.setAttribute("opacity", String(Math.max(0.1, 0.3 - h * 0.003) * fade));
        spinDeg += dt * 420; sp.setAttribute("transform", `rotate(${spinDeg.toFixed(1)})`);
        ball.setAttribute("opacity", String(fade));
      } else ball.setAttribute("opacity", "0");
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    let visible = false;
    const updateMotion = () => {
      if (motion.matches) {
        stop();
        elements.forEach((el, i) => {
          for (const name of ["transform", "opacity"] as const) {
            const value = initial[i][name];
            if (value === null) el.removeAttribute(name); else el.setAttribute(name, value);
          }
        });
      } else if (visible) start();
    };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) updateMotion(); else stop(); }, { threshold: 0.05 });
    motion.addEventListener("change", updateMotion);
    io.observe(svg);
    return () => { io.disconnect(); motion.removeEventListener("change", updateMotion); stop(); };
  }, []);

  return (
    <svg ref={root} viewBox="-26 -162 452 390" role="img" aria-label="Two rackets rallying a pickleball over the net" className="block h-auto w-full">
      <defs>
        {/* top of the court fades into the hero background */}
        <linearGradient id="ethn-fade-grad" gradientUnits="userSpaceOnUse" x1="0" y1="-162" x2="0" y2="-85"><stop offset="0" stopColor="#000" /><stop offset="1" stopColor="#fff" /></linearGradient>
        <mask id="ethn-fade-mask" maskUnits="userSpaceOnUse" x="-40" y="-170" width="480" height="630"><rect x="-40" y="-170" width="480" height="630" fill="url(#ethn-fade-grad)" /></mask>
        {/* racket drawn with its origin at the grip, face pointing up */}
        <g id="ethn-paddle">
          <rect x="-4" y="-28" width="8" height="28" rx="3" fill="#16384d" />
          <path d="M-3 -7h6M-3 -13h6M-3 -19h6" stroke="#ffad4c" strokeWidth="1.5" fill="none" />
          <rect x="-18" y="-80" width="36" height="54" rx="17" fill="#000" opacity=".22" transform="translate(5 7)" />
          <rect x="-18" y="-80" width="36" height="54" rx="17" fill="#f28500" stroke="#fff" strokeWidth="3" />
          <rect x="-11" y="-73" width="22" height="40" rx="11" fill="#ffad4c" />
          <g fill="#f28500"><circle cx="-5" cy="-64" r="1.7" /><circle cx="5" cy="-64" r="1.7" /><circle cx="-5" cy="-55" r="1.7" /><circle cx="5" cy="-55" r="1.7" /><circle cx="-5" cy="-46" r="1.7" /><circle cx="5" cy="-46" r="1.7" /></g>
        </g>
      </defs>
      <g mask="url(#ethn-fade-mask)">
        <rect x="0" y="-200" width="400" height="200" fill="#e8591a" />
        <rect x="0" y="0" width="400" height="140" fill="#e8591a" />
        <rect x="0" y="140" width="400" height="300" fill="#1f4fa3" />
        <rect x="0" y="4" width="400" height="10" fill="#000" opacity=".18" />
        <g fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="square">
          <path d="M0 -200V440H400V-200" /><path d="M0 140H400" /><path d="M200 140V440" /><path d="M-14 0H414" strokeLinecap="butt" />
        </g>
        <circle cx="-14" cy="0" r="8" fill="#fff" /><circle cx="414" cy="0" r="8" fill="#fff" />
      </g>
      <g ref={farG} transform="translate(250 -141) rotate(20)"><use href="#ethn-paddle" transform="scale(1 -1)" /></g>
      <g ref={nearG} transform="translate(200 238)"><use href="#ethn-paddle" /></g>
      <g ref={ballG} transform="translate(233 -65)">
        <ellipse ref={shade} cx="0" cy="0" rx="7" ry="4" fill="#000" opacity=".3" />
        <g ref={lift}>
          <circle r="8.5" fill="#ffe45c" stroke="#fff" strokeWidth="1.5" />
          <g ref={spin} fill="#16384d"><circle cx="0" cy="-4.5" r="1.4" /><circle cx="4.3" cy="-1.4" r="1.4" /><circle cx="2.6" cy="3.6" r="1.4" /><circle cx="-2.6" cy="3.6" r="1.4" /><circle cx="-4.3" cy="-1.4" r="1.4" /></g>
        </g>
      </g>
    </svg>
  );
});

export default RallyCourt;
