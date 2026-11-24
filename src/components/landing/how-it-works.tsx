const steps = [
  { title: "Select court & time", text: "Choose an available date and a continuous time range on either court." },
  { title: "Review your booking", text: "Check your court, time, and total before confirming your hold." },
  { title: "Pay & upload proof", text: "Enter your contact details and GCash reference, then upload your receipt before your hold expires." },
  { title: "Track your reservation", text: "Use your tracking code and booking email to follow your request. Your reservation is confirmed after staff verify payment." },
];

const faqs = [
  { q: "Do I need an account to book?", a: "No account is needed. Enter your contact details during checkout so the venue can identify your reservation." },
  { q: "How do holds and payment work?", a: "After you confirm your selection, your hold lasts for the time shown at checkout. Pay the configured GCash recipient and upload a JPG, PNG, or WebP receipt up to 5 MiB. Staff review your payment before confirming your reservation." },
  { q: "What are the rates, exactly?", a: "Rates follow each court’s configured operating hours. The booking grid and checkout show the applicable rates and total." },
  { q: "Can I book for today?", a: "Yes, when future slots are available. The booking calendar shows the available dates and times." },
  { q: "Can I cancel or get a refund?", a: "Bookings are final: cancellations, rescheduling, and refunds are not allowed. Please review your date, time, and booking details carefully before submitting payment." },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-28 bg-[#f2f6f7] px-5 py-14 text-[#447244] sm:scroll-mt-32 sm:px-8 sm:py-20" aria-labelledby="how-heading">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#a65300]">From booking to court</p>
        <h2 id="how-heading" className="font-display mt-3 text-4xl font-black uppercase leading-none sm:text-6xl">How booking works</h2>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[#405966]">No account needed. Review your booking before you pay, then track its status while staff verify your payment.</p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-[#d5e1e5] bg-white p-6">
              <span className="font-display text-4xl font-black text-[#c35f00]" aria-hidden="true">0{i + 1}</span>
              <h3 className="mt-4 text-lg font-extrabold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#405966]">{step.text}</p>
            </li>
          ))}
        </ol>
        <a href="/book" className="mt-7 inline-flex min-h-12 items-center rounded-lg bg-[#447244] px-6 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]">Book a court <span aria-hidden="true" className="ml-2">→</span></a>
        <div className="mt-14 max-w-3xl">
          <h3 className="font-display text-3xl font-black uppercase">Questions, answered</h3>
          <div className="mt-5 space-y-3">
            {faqs.map((faq) => (
              <details key={faq.q} className="group rounded-xl border border-[#d5e1e5] bg-white px-5">
                <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]">{faq.q}<span aria-hidden="true" className="text-xl text-[#a65300] group-open:rotate-45">+</span></summary>
                <p className="pb-5 text-sm leading-6 text-[#405966]">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
