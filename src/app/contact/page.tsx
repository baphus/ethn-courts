import Link from "next/link";

export const metadata = { title: "Contact — ETHN Courts" };
export default function ContactPage() {
  return <main className="mx-auto max-w-2xl px-5 py-16"><Link href="/" className="text-sm underline">← Back to booking</Link><h1 className="mt-8 text-3xl font-bold">ETHN Courts</h1><p className="mt-4">Daylor Village, Abucayan, Balamban, Cebu</p><p className="mt-2 text-muted-foreground">Contact details will be provided by the venue.</p></main>;
}
