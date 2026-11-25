import { VENUE_PHONE_DISPLAY } from "@/lib/booking/constants";
import { VENUE_EMAIL } from "@/lib/venue";

export const metadata = {
  title: "Privacy Policy — ETHN Courts",
  description:
    "How ETHN Courts collects, uses, and protects your personal information when you book a court.",
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "1. Who this policy covers",
    body: [
      "ETHN Courts handles personal information when you book or track a reservation, submit payment proof, contact us, or sign in as a staff member. This policy explains what we handle and how to contact us about your rights under the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).",
    ],
  },
  {
    heading: "2. Information we collect",
    body: [
      "For bookings, we collect your name, email address, phone number, reservation details, and payment information related to the booking, including the selected method and the proof you upload. Your proof may contain a payment reference or other details visible in the image. Do not include passwords, PINs, or unrelated transactions.",
      "If you email us, we receive the address and message you send. The Contact form opens your email app; it does not send or store your message on the website. Staff sign-in uses an authentication provider.",
    ],
  },
  {
    heading: "3. How we use your information",
    body: [
      "We use it to reserve court time, manage rentals and bookings, verify payments, provide status updates, answer inquiries, handle disputes and refunds, keep operational and accounting records, and protect the service. Booking emails may be sent when email delivery is enabled.",
    ],
  },
  {
    heading: "4. Private payment proofs and tracking",
    body: [
      "Payment proofs are kept in private storage and can be opened by authorized staff through short-lived links. Keep your booking code and private tracking link to yourself. Anyone with the private link can see the reservation status and schedule.",
    ],
  },
  {
    heading: "5. Service providers and external sites",
    body: [
      "We use service providers for website hosting, authentication, database and file storage, and email delivery where enabled. The site embeds Google Maps, which may receive your IP address and information about your browser when the map loads. External services such as Google Maps, Facebook, and your payment provider have their own privacy policies.",
    ],
  },
  {
    heading: "6. Browser storage and staff sessions",
    body: [
      "Guest booking does not require an account. The site uses session storage in your browser tab to restore checkout progress and let you reopen your receipt after refreshing. Staff authentication uses session cookies.",
    ],
  },
  {
    heading: "7. Retention and security",
    body: [
      "We retain booking records and payment proofs as needed for booking administration, payment verification, disputes, accounting, and legal obligations. We use private storage and access controls to limit access to this information.",
    ],
  },
  {
    heading: "8. Your rights and how to contact us",
    body: [
      "You may request access to or correction of your personal information, object to its processing, or request erasure or blocking where the law permits. You may also file a complaint with the Philippine National Privacy Commission.",
      `For privacy questions or requests, email ${VENUE_EMAIL} or call ${VENUE_PHONE_DISPLAY}.`,
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main id="main" className="bg-[#f6f8f8] pt-0">
      <section
        className="mx-auto w-full max-w-3xl px-4 pt-12 pb-8 sm:px-6"
        aria-labelledby="privacy-heading"
      >
        <h1
          id="privacy-heading"
          className="font-display text-5xl font-black uppercase leading-[.9] tracking-tight text-pine sm:text-7xl"
        >
          Privacy Policy
        </h1>
        <p className="mt-3 text-base leading-7 text-warm-muted">
          How ETHN Courts handles your personal information. Last updated November 25, 2026.
        </p>
      </section>

      <section
        className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6"
        aria-label="Privacy Policy"
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
