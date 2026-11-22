export function isPublicPath(pathname: string): boolean {
  return pathname !== "/admin" && !pathname.startsWith("/admin/");
}

export function activeNav(pathname: string): "book" | "plays" | "track" | "contact" | null {
  const within = (route: string) => pathname === route || pathname.startsWith(`${route}/`);
  if (within("/book")) return "book";
  if (within("/open-plays")) return "plays";
  if (within("/track") || within("/checkout/track")) return "track";
  if (within("/contact")) return "contact";
  return null;
}
