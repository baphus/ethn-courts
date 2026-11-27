export function GuestName({ name, email, truncate = false }: { name: string | null; email?: string | null; truncate?: boolean }) {
  const guestName = name?.trim();
  const displayName = guestName || "Guest";
  const words = (guestName || email?.trim().split("@", 1)[0] || displayName).split(/\s+/u);
  const initials = [words[0], ...(words.length > 1 ? [words[words.length - 1]] : [])]
    .map(word => Array.from(word)[0]).join("").toLocaleUpperCase();
  return <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</span><span className={truncate ? "truncate" : undefined}>{displayName}</span></span>;
}
