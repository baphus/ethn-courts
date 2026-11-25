import { VENUE_PHONE_DISPLAY } from "@/lib/booking/constants";
import { VENUE_ADDRESS, VENUE_EMAIL, VENUE_FACEBOOK_LINK, VENUE_MAP_EMBED, VENUE_MAP_LINK } from "@/lib/venue";
import { getCheckoutPool } from "@/db/checkout-client";
import { getContact } from "@/lib/admin/ethn-contact";
import ContactForm from "./contact-form";

export const metadata = { title: "Contact — ETHN Courts" };
export const dynamic = "force-dynamic";
export default async function ContactPage() {
  let contact: { facebook: string; phone: string; email: string } | null = null;
  try { contact = await getContact(getCheckoutPool()); } catch { /* Contact details may not be configured yet. */ }
  const phone = contact?.phone || VENUE_PHONE_DISPLAY;
  const email = contact?.email || VENUE_EMAIL;
  return <main className="min-h-svh bg-[#f6f8f8]"><div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16"><h1 className="font-display text-5xl font-black uppercase leading-[.9] tracking-tight text-[#447244] sm:text-7xl">Contact ETHN Courts</h1><div className="mt-8 grid items-start gap-5 md:grid-cols-[1fr_1fr]"><section className="rounded-2xl bg-[#447244] p-7 text-white shadow-xl shadow-[#447244]/10 sm:p-9"><h2 className="font-display text-3xl tracking-wide">Your neighborhood court for better rallies.</h2><p className="mt-5 text-sm leading-7 text-white/70">{VENUE_ADDRESS} &middot; <a href={VENUE_MAP_LINK} target="_blank" rel="noopener noreferrer" className="font-bold text-white underline underline-offset-4 hover:text-[#ffad4c]">Open in Google Maps</a></p><iframe title="Google map of ETHN Courts" src={VENUE_MAP_EMBED} className="mt-6 h-[300px] w-full rounded-xl border-0" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /><div className="mt-6 space-y-3 border-t border-white/15 pt-5 text-sm"><p><span className="mr-2 text-white/60">Facebook</span><a className="break-all underline underline-offset-4 hover:text-[#ffad4c]" href={contact?.facebook || VENUE_FACEBOOK_LINK} target="_blank" rel="noopener noreferrer">Visit our page</a></p><p><span className="mr-2 text-white/60">Phone</span><a className="underline underline-offset-4 hover:text-[#ffad4c]" href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a></p><p><span className="mr-2 text-white/60">Email</span><a className="break-all underline underline-offset-4 hover:text-[#ffad4c]" href={`mailto:${encodeURIComponent(email)}`}>{email}</a></p></div></section><section className="rounded-2xl border border-[#dce5e8] bg-white p-7 shadow-sm sm:p-9"><h2 className="font-display text-3xl text-[#447244]">Send us a message</h2><p className="mt-3 text-sm leading-6 text-[#718189]">Have a question about the courts? Tell us how we can help.</p><ContactForm email={email} /></section></div></div></main>;
}
