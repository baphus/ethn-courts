"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarDays, CirclePlay, ClipboardList, Mail } from "lucide-react";
import { activeNav, isPublicPath } from "./public-path";
import { drawPickleball } from "@/components/ui/pickleball";

/* 3D pickleball spins with scroll; progress arc surrounds the back-to-top button. */
function ScrollBall({ booking, onBackToTop }: { booking: boolean; onBackToTop: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const arc = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const cv = canvas.current, ring = arc.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ring || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SIZE = 72, CIRC = 2 * Math.PI * 21;
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
    <button type="button" data-back-to-top aria-label="Back to top" onClick={onBackToTop} className={`fixed right-[max(1rem,env(safe-area-inset-right))] z-40 size-11 cursor-pointer rounded-full bg-popover shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244] ${booking ? "bottom-[calc(6.5rem+env(safe-area-inset-bottom))] lg:bottom-[max(1rem,env(safe-area-inset-bottom))]" : "bottom-[max(1rem,env(safe-area-inset-bottom))]"}`}>
      <svg viewBox="0 0 48 48" aria-hidden="true" className="absolute inset-0 h-full w-full -rotate-90"><circle cx="24" cy="24" r="21" fill="none" stroke="rgba(6,52,92,.18)" strokeWidth="3" /><circle ref={arc} cx="24" cy="24" r="21" fill="none" stroke="#E8591A" strokeWidth="3" strokeLinecap="round" strokeDasharray={2 * Math.PI * 21} strokeDashoffset={2 * Math.PI * 21} /></svg>
      <canvas ref={canvas} aria-hidden="true" className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2" />
    </button>
  );
}

export default function Header() {
  const top = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const scrollFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), [pathname]);

  function backToTop() {
    cancelAnimationFrame(scrollFrame.current);
    top.current?.focus({ preventScroll: true });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    const start = window.scrollY, began = performance.now();
    let last = start;
    const tick = (now: number) => {
      if (window.scrollY !== last) return; // Let manual scrolling interrupt the spring.
      const t = Math.max(0, now - began) / 70;
      const y = start * (1 + t) * Math.exp(-t); // Critically damped; no overshoot at the top edge.
      const done = y < 1 || t >= 12;
      window.scrollTo({ top: done ? 0 : y, behavior: "instant" });
      last = window.scrollY;
      if (!done) scrollFrame.current = requestAnimationFrame(tick);
    };
    scrollFrame.current = requestAnimationFrame(tick);
  }

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 60);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  if (!isPublicPath(pathname)) return null;
  const active = activeNav(pathname);
  const overHero = pathname === "/" && !scrolled;
  const navLink = `inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-xs font-semibold sm:flex-row sm:gap-2 sm:px-3 sm:text-sm transition-colors focus-visible:outline-2 aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-4 ${overHero ? "text-white hover:text-[#ffad4c] focus-visible:outline-[#ffad4c]" : "text-foreground hover:text-primary focus-visible:outline-ring aria-[current=page]:text-primary"}`;
  return (
    <><header ref={top} tabIndex={-1} className={`daylight public-header sticky top-0 z-50 pt-2 ${pathname === "/" ? "h-14 sm:h-24" : "h-[4.0625rem] sm:h-[4.5625rem]"} ${scrolled || overHero ? "bg-transparent" : "border-b border-border bg-background"}`}>
      <div className={`mx-auto grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-2 transition-[width,max-width,transform,border-radius,box-shadow] duration-500 ease-out motion-reduce:transition-none sm:px-4 ${scrolled ? "w-[calc(100%-1rem)] max-w-[960px] rounded-full bg-white shadow-[0_8px_30px_rgba(0,0,0,.16)] ring-1 ring-border" : "w-full max-w-7xl sm:h-16"}`}>
        <div className="relative flex min-w-0 items-center">
          <nav aria-label="Booking navigation" className="flex items-center whitespace-nowrap"><a href="/book" aria-current={active === "book" ? "page" : undefined} className={navLink}><CalendarDays className="size-3.5 shrink-0 sm:size-4" aria-hidden="true" />Book</a><a href="/open-plays" aria-current={active === "plays" ? "page" : undefined} className={navLink}><CirclePlay className="size-3.5 shrink-0 sm:size-4" aria-hidden="true" />Plays</a></nav>
        </div>
        <div className="flex min-w-0 justify-center">{!overHero && <a href="/" aria-label="ETHN Courts home" className="flex min-h-11 items-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><img src="/ethn-courts-logo.svg" alt="ETHN Courts" className="h-9 w-16 rounded-md object-contain dark:bg-white dark:px-1 sm:h-11 sm:w-28" /></a>}</div>
        <div className="relative flex min-w-0 items-center justify-end">
          <nav aria-label="More navigation" className="flex items-center whitespace-nowrap"><a href="/track" aria-current={active === "track" ? "page" : undefined} className={navLink}><ClipboardList className="size-3.5 shrink-0 sm:size-4" aria-hidden="true" />Track</a><a href="/contact" aria-current={active === "contact" ? "page" : undefined} className={navLink}><Mail className="size-3.5 shrink-0 sm:size-4" aria-hidden="true" />Contact</a></nav>
        </div>
      </div>
    </header>{scrolled && <ScrollBall booking={pathname === "/book"} onBackToTop={backToTop} />}</>
  );
}
