import { CalendarDays, ClipboardCheck, CreditCard, SearchCheck } from "lucide-react";

const steps = [
  { title: "Select court & time", text: "Choose a date and select the available times you want on either court.", icon: CalendarDays },
  { title: "Review your booking", text: "Check your court, time, and total before confirming your hold.", icon: ClipboardCheck },
  { title: "Pay & upload proof", text: "Enter your contact details, pay using a method listed at checkout, and upload your receipt before your hold expires.", icon: CreditCard },
  { title: "Track your reservation", text: "Use your tracking code and booking email to follow your request. Your reservation is confirmed after staff verify payment.", icon: SearchCheck },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="landing-type scroll-mt-28 bg-background px-5 py-14 text-foreground sm:scroll-mt-32 sm:px-8 sm:py-20" aria-labelledby="how-heading">
      <div className="mx-auto max-w-[70rem]">
        <h2 id="how-heading" className="landing-heading">How booking works</h2>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">No account needed. Review your booking before you pay, then track its status while staff verify your payment.</p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground" aria-hidden="true">0{i + 1}</span>
                <step.icon className="size-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-lg font-extrabold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
