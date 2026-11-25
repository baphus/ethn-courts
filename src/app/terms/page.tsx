import { VENUE_PHONE_DISPLAY } from "@/lib/booking/constants";
import { VENUE_ADDRESS, VENUE_EMAIL } from "@/lib/venue";

export const metadata = {
  title: "Terms of Service — ETHN Courts",
  description:
    "The terms that apply when you book a pickleball court at ETHN Courts in Balamban, Cebu.",
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "1. About ETHN Courts",
    body: [
      `ETHN Courts offers pickleball court reservations at ${VENUE_ADDRESS}.`,
    ],
  },
  {
    heading: "2. Times, availability, and prices",
    body: [
      "You can book available times without creating an account. Times are shown in Philippine time. Available courts, slot length, minimum booking duration, and how far ahead you can book depend on the venue settings shown on the booking page.",
      "Court charges and any selected rentals are shown in your total. Review your court, times, and total before paying. If the price or booking details change during checkout, review and accept the updated total before proceeding.",
    ],
  },
  {
    heading: "3. Temporary holds",
    body: [
      "Starting checkout temporarily holds the selected times. The checkout timer shows how long you have to finish. Refreshing the page does not extend that deadline. If the hold expires before a valid submission, those times are no longer reserved for you.",
    ],
  },
  {
    heading: "4. Payment and confirmation",
    body: [
      "Pay the full total outside the website using a method and the payment instructions shown in checkout. Upload a clear JPG, PNG, or WebP screenshot or photo of your payment (up to 5 MiB), then submit it before the hold expires. The website does not charge your card or bank account.",
      "Submitting proof is not confirmation. Staff must verify payment. Use your private tracking link or your booking code and booking email to check your status. If you paid but the site says you are not booked, do not pay again. Contact us with your payment receipt and checkout ID.",
    ],
  },
  {
    heading: "5. Changes, cancellations, and refunds",
    body: [
      "Bookings cannot be extended through the website. The website does not offer self-service rescheduling or cancellation and does not process refunds. Contact ETHN Courts if you need help. Nothing here limits rights you have under applicable law.",
    ],
  },
  {
    heading: "6. Open Plays and court conduct",
    body: [
      "Open Play listings are for information only. The website does not take sign-ups or payments for those sessions.",
      "Please arrive on time, wear non-marking shoes, keep food and drinks off the playing surface, and respect other players and staff. Follow posted safety rules and report injuries or hazards to staff.",
    ],
  },
  {
    heading: "7. Contact",
    body: [
      `For booking or policy questions, email ${VENUE_EMAIL} or call ${VENUE_PHONE_DISPLAY}.`,
    ],
  },
];

export default function TermsPage() {
  return (
    <main id="main" className="bg-[#f6f8f8] pt-0">
      <section
        className="mx-auto w-full max-w-3xl px-4 pt-12 pb-8 sm:px-6"
        aria-labelledby="terms-heading"
      >
        <h1
          id="terms-heading"
          className="font-display text-5xl font-black uppercase leading-[.9] tracking-tight text-pine sm:text-7xl"
        >
          Terms of Service
        </h1>
        <p className="mt-3 text-base leading-7 text-warm-muted">
          These terms explain how to book, pay for, and use a court at ETHN Courts. Last updated November 25, 2026.
        </p>
      </section>

      <section
        className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6"
        aria-label="Terms of Service"
      >
        <article className="space-y-8">
          {SECTIONS.map((s) => (
            <div key={s.heading} className="space-y-3">
              <h2 className="text-xl font-bold text-pine">{s.heading}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="text-[15px] leading-7 text-ink/80">
                  {p}
                </p>
              ))}
            </div>
          ))}
        </article>
      </section>
    </main>
  );
}
