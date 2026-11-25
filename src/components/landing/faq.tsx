const faqs = [
  {
    q: "How do I book a court?",
    a: "Choose a date and available court times. If you’re on the homepage, select Continue booking. Select Review selection to check your times and estimated total and enter your contact details, then select Confirm and hold. Pay using a method listed at checkout, and upload your receipt as a JPG, PNG, or WebP file up to 5 MiB before submitting.",
  },
  {
    q: "Do I need an account?",
    a: "No. Book as a guest and track your request with your private link or with your tracking code and email.",
  },
  {
    q: "What are the court rates?",
    a: "Rates depend on the court and time you choose. Select your times to see the hourly rates and estimated total. Checkout confirms the final total before you pay.",
  },
  {
    q: "How does the checkout hold work?",
    a: "A hold temporarily reserves your chosen times. The checkout countdown shows how long you have to submit your booking and payment proof. If the hold expires before you submit, the times can become available again.",
  },
  {
    q: "When is my booking confirmed?",
    a: "Your request stays pending until staff review and approve your payment. Use your private tracking link or your tracking code and email to check its status.",
  },
  {
    q: "Can I book a court for today?",
    a: "Yes, if there’s still an available time that hasn’t started. Select today in the booking calendar to see what’s open.",
  },
  {
    q: "Can I cancel or get a refund?",
    a: "Check the booking terms before paying. If you have a question about an existing reservation, contact venue staff with your tracking code.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="scroll-mt-28 bg-white sm:scroll-mt-32" aria-labelledby="faq-heading">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <h2 id="faq-heading" className="font-display text-center text-3xl font-black tracking-tight text-[#447244] sm:text-4xl">
          Frequently Asked Questions
        </h2>
        <div className="mt-8 space-y-3">
          {faqs.map(({ q, a }, i) => (
            <details key={q} open={i === 0} className="rounded-2xl bg-[#e7f0f3] px-5 py-4 open:bg-[#fff0dc]">
              <summary className="cursor-pointer text-[15px] font-bold text-[#447244]">{q}</summary>
              <p className="pt-2 text-sm leading-6 text-[#405966]">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
