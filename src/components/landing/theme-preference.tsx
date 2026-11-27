"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemePreference() {
  const { resolvedTheme, systemTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  const nextTheme = dark ? "light" : "dark";

  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 self-start text-foreground sm:self-auto"
      disabled={!mounted}
      aria-pressed={dark}
      onClick={() => setTheme(nextTheme === systemTheme ? "system" : nextTheme)}
    >
      {dark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
      Dark mode
    </Button>
  );
}
