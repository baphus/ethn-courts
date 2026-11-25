"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarDays, CirclePlay, ClipboardList, Mail } from "lucide-react";
import { activeNav, isPublicPath } from "./public-path";
import { drawPickleball } from "@/components/ui/pickleball";

/* 3D pickleball spins with scroll; progress arc surrounds the home link. */
function ScrollBall() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const arc = useRef<SVGCircleElement>(null);
  const box = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const cv = canvas.current, ring = arc.current, el = box.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ring || !el || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SIZE = 72, CIRC = 2 * Math.PI * 43;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = cv.height = SIZE * dpr; ctx.scale(dpr, dpr);
    const progressOf = (y: number) => { const max = document.documentElement.scrollHeight - window.innerHeight; return max > 0 ? Math.min(1, Math.max(0, y / max)) : 0; };
    const render = (y: number) => {
      drawPickleball(ctx, reduce ? 0.6 : y * 0.012);
      ring.style.strokeDashoffset = String(CIRC * (1 - progressOf(y)));
    };
    let shownY = window.scrollY, raf = 0;
    const tick = () => {
      const t = window.scrollY;
      shownY += (t - shownY) * (reduce ? 1 : 0.14);
      if (Math.abs(t - shownY) < 0.3) shownY = t;
      render(shownY);
      raf = shownY !== t ? requestAnimationFrame(tick) : 0;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    render(shownY);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);
  return (
    <a ref={box} href="/" aria-label="ETHN Courts home" className="relative h-12 w-12 shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffad4c] sm:h-20 sm:w-20">
      <svg viewBox="0 0 96 96" aria-hidden="true" className="absolute inset-0 h-full w-full -rotate-90"><circle cx="48" cy="48" r="43" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="5" /><circle ref={arc} cx="48" cy="48" r="43" fill="none" stroke="#ffad4c" strokeWidth="5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 43} strokeDashoffset={2 * Math.PI * 43} /></svg>
      <canvas ref={canvas} aria-hidden="true" className="absolute left-1/2 top-1/2 h-9 w-9 sm:h-[60px] sm:w-[60px] -translate-x-1/2 -translate-y-1/2" />
    </a>
  );
}

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 60);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  if (!isPublicPath(pathname)) return null;
  const active = activeNav(pathname);
  const navLink = "inline-flex min-h-11 items-center justify-center gap-0.5 px-0.5 text-[9px] sm:gap-2 sm:px-3 sm:text-sm font-extrabold uppercase tracking-wider text-white/90 transition-colors hover:text-[#ffad4c] focus-visible:outline-2 focus-visible:outline-[#ffad4c] aria-[current=page]:text-[#ffad4c] aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-4";
  return (
    <header className={`sticky top-0 z-50 h-14 text-white sm:h-24 ${scrolled || pathname === "/" ? "bg-transparent" : "bg-[#447244]"}`}>
      <div className={`mx-auto grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-0 ${scrolled || pathname !== "/" ? "bg-[#447244]" : "bg-transparent"} px-2 transition-[width,max-width,transform,border-radius,box-shadow] duration-500 ease-out motion-reduce:transition-none sm:h-24 sm:px-6 ${scrolled ? "w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-[960px] translate-y-2 rounded-full shadow-[0_8px_30px_rgba(0,0,0,.25)] ring-1 ring-white/15" : "w-full max-w-7xl"}`}>
        <div className="relative min-w-0">
          <span aria-hidden="true" className={`pointer-events-none absolute left-0 top-1/2 hidden -translate-y-1/2 text-sm font-extrabold tracking-[.14em] text-[#ffad4c] transition-opacity motion-reduce:transition-none lg:block ${scrolled ? "opacity-100" : "opacity-0"}`}>ETHN</span>
          <nav aria-label="Booking navigation" className={`absolute top-1/2 flex -translate-y-1/2 items-center whitespace-nowrap transition-[left,transform] duration-500 ease-out motion-reduce:transition-none ${scrolled ? "left-full -translate-x-full" : "left-0 translate-x-0"}`}><a href="/book" aria-current={active === "book" ? "page" : undefined} className={navLink}><CalendarDays className="size-3 shrink-0 sm:size-4" aria-hidden="true" />Book</a><a href="/open-plays" aria-current={active === "plays" ? "page" : undefined} className={navLink}><CirclePlay className="size-3 shrink-0 sm:size-4" aria-hidden="true" />Plays</a></nav>
        </div>
        <ScrollBall />
        <div className="relative flex items-center justify-end gap-2">
          <span aria-hidden="true" className={`pointer-events-none absolute right-0 top-1/2 hidden -translate-y-1/2 text-sm font-extrabold tracking-[.14em] text-white transition-opacity motion-reduce:transition-none lg:block ${scrolled ? "opacity-100" : "opacity-0"}`}>COURTS</span>
          <nav aria-label="More navigation" className={`absolute top-1/2 flex -translate-y-1/2 items-center whitespace-nowrap transition-[left,transform] duration-500 ease-out motion-reduce:transition-none ${scrolled ? "left-0 translate-x-0" : "left-full -translate-x-full"}`}><a href="/track" aria-current={active === "track" ? "page" : undefined} className={navLink}><ClipboardList className="size-3 shrink-0 sm:size-4" aria-hidden="true" />Track</a><a href="/contact" aria-current={active === "contact" ? "page" : undefined} className={navLink}><Mail className="size-3 shrink-0 sm:size-4" aria-hidden="true" />Contact</a></nav>
        </div>
      </div>
    </header>
  );
}
