import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Link Expired — ETHN Courts",
};

// /auth/error — landing for failed auth-email links (expired/used PKCE
// recovery codes, provider errors). Generic: any auth failure lands here.
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-4 overflow-hidden bg-[#447244] p-6 text-white md:p-10"><div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_20%,rgba(242,133,0,.2),transparent_38%),linear-gradient(135deg,#447244,#447244)]"/>
      <div className="relative z-10 w-full max-w-sm">
        <Card className="overflow-hidden rounded-2xl border-white/15 bg-white p-0 text-[#17252e] shadow-2xl shadow-black/25">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center md:p-8">
            <img src="/ethn-courts-logo.svg" alt="ETHN Courts" className="h-auto w-40" />
            <h1 className="font-display text-4xl font-black uppercase leading-none tracking-tight text-[#447244]">This link can&apos;t be used</h1>
            <p className="text-sm text-balance text-muted-foreground">
              The email link is invalid or has expired. Links are single-use
              and short-lived — request a fresh one.
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <Link href="/forgot-password" className="underline-offset-4 hover:underline">
                Request a new reset link
              </Link>
              <Link href="/login" className="underline-offset-4 hover:underline">
                ← Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
