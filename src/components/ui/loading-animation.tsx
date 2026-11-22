"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { drawPickleball } from "./pickleball";

type LoadingAnimationProps = {
  label?: string;
  size?: "compact" | "default" | "large";
  className?: string;
};

const sizes = {
  compact: "size-5",
  default: "size-16 sm:size-20",
  large: "size-24 sm:size-28",
};

export function LoadingAnimation({ label = "Loading", size = "default", className }: LoadingAnimationProps) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const render = (time: number) => {
      drawPickleball(ctx, motion.matches ? 0.6 : time * 0.004);
      if (!motion.matches) frame = requestAnimationFrame(render);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      render(performance.now());
    };
    update();
    motion.addEventListener("change", update);
    return () => { cancelAnimationFrame(frame); motion.removeEventListener("change", update); };
  }, []);

  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center justify-center", size !== "compact" && "w-full", className)}>
      <canvas ref={canvas} width={72} height={72} aria-hidden="true" className={sizes[size]} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
