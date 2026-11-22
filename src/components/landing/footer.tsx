import Image from "next/image";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { FALLBACK_RATES, type DisplayRates } from "@/lib/pricing-display";
import { VENUE_PHONE_DISPLAY, VENUE_PHONE_LINK } from "@/lib/booking/constants";
import { VENUE_FACEBOOK_LINK, VENUE_MAP_LINK } from "@/lib/venue";
import DeveloperPromo from "@/components/landing/developer-promo";

const SEPHUS_PORTFOLIO_URL = "https://www.sephus.tech";

export default function Footer({ rates = FALLBACK_RATES }: { rates?: DisplayRates }) {
  void rates;
  return (
    <footer
      id="contact"
      className="scroll-mt-20 border-t border-white/10 bg-[#16384d] text-white"
      aria-labelledby="footer-heading"
    >
      <div className="mx-auto w-full max-w-6xl px-4 pt-12 pb-6 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.7fr_1fr_1fr]">
          <div className="space-y-3">
            <p className="flex items-center gap-2.5" id="footer-heading">
              <Image
                src="/ethn-courts-mark.png"
                alt="ETHN Courts — home"
                width={36}
                height={36}
                className="size-9 rounded-full object-cover"
              />
              <span className="text-sm font-extrabold tracking-[.16em]">ETHN <span className="text-flame">COURTS</span></span>
            </p>
            <p className="max-w-xs text-[13px] leading-5 text-white/65">
              Outdoor pickleball courts in Tabuelan, Cebu. Choose a court time and request your reservation online.
            </p>

          </div>

          <nav className="space-y-2.5" aria-label="Quick links">
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-white/65 uppercase">
              Quick Links
            </p>
            {[
              { href: "/#top", label: "Home" },
              { href: "/book", label: "Book Now" },
              { href: "/#how-it-works", label: "How It Works" },
              { href: "/contact", label: "Contact" },
              { href: "/#faq", label: "FAQ" },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="block w-fit text-sm font-medium text-white/70 hover:text-flame hover:underline"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="space-y-2.5">
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-white/65 uppercase">
              Location
            </p>
            <p className="flex items-start gap-2 text-[13px] leading-5 text-white/70">
              <MapPin className="mt-0.5 size-4 shrink-0 text-flame" aria-hidden />
              RVF9+6XW, Poblacion, Tabuelan, Cebu, Philippines
            </p>
            <a
              href={VENUE_MAP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-fit text-[13px] font-bold text-flame hover:text-flame-hover hover:underline"
            >
              Open in Google Maps
            </a>
          </div>

          <div className="space-y-2.5">
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-white/65 uppercase">
              Direct Contact
            </p>
            <p className="text-[13px] leading-5 text-white/70">
              Questions, private tournaments, or venue bookings? Reach us directly:
            </p>
            <p className="text-[11px] font-extrabold tracking-[0.12em] text-white/55 uppercase">
              Email us
            </p>
            <a
              href="mailto:ckgrounds1@gmail.com"
              className="flex items-center gap-2 text-[13px] font-bold break-all text-white/85 hover:text-flame hover:underline"
            >
              <Mail className="size-4 shrink-0 text-flame" aria-hidden />
              ckgrounds1@gmail.com
            </a>
            <p className="pt-1 text-[11px] font-extrabold tracking-[0.12em] text-white/55 uppercase">
              Call or text
            </p>
            <a
              href={VENUE_PHONE_LINK}
              className="flex items-center gap-2 text-[13px] font-bold text-white/85 hover:text-flame hover:underline"
            >
              <Phone className="size-4 shrink-0 text-flame" aria-hidden />
              {VENUE_PHONE_DISPLAY}
            </a>
            <p className="pt-1 text-[11px] font-extrabold tracking-[0.12em] text-white/55 uppercase">
              Facebook
            </p>
            <a
              href={VENUE_FACEBOOK_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[13px] font-bold text-white/85 hover:text-flame hover:underline"
            >
              <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.883v2.26h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
              </svg>
              CK Grounds
            </a>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-5 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © 2026 ETHN Courts. All rights reserved. · Website & booking system built by{" "}
            <a
              href={SEPHUS_PORTFOLIO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-white/80 hover:text-flame hover:underline"
            >
              Sephus
            </a>
          </p>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Legal">
            {[
              { href: "/#faq", label: "Court Rules" },
              { href: "/terms", label: "Terms of Service" },
              { href: "/privacy", label: "Privacy Policy" },
              { href: "/contact", label: "Contact Support" },
            ].map((l) => (
              <a key={l.label} href={l.href} className="hover:text-flame hover:underline">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
      <DeveloperPromo />
    </footer>
  );
}
