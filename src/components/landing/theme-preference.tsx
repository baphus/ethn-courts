"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemePreference() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return <label className="inline-flex items-center gap-2 text-sm text-foreground">
    Appearance
    <select className="min-h-11 rounded-lg border border-input bg-muted px-2 text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2" value={mounted ? theme ?? "system" : "system"} disabled={!mounted} onChange={event => setTheme(event.target.value)}>
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>;
}
