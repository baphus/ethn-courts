"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isPublicPath } from "./public-path";

export default function PublicOnly({ children }: { children: ReactNode }) {
  return isPublicPath(usePathname()) ? children : null;
}
