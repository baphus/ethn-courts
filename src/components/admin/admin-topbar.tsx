"use client";

import { useEffect, useState } from "react";

const stamp = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

export default function AdminClock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () => setNow(stamp.format(new Date()));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);

  return <p className="truncate px-2 pb-2 text-xs tabular-nums text-sidebar-foreground group-data-[collapsible=icon]:hidden">{now}</p>;
}
