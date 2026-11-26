"use client";
import { useState } from "react";

export default function ContactForm({ email }: { email: string }) {
  const [name, setName] = useState(""), [reply, setReply] = useState(""), [message, setMessage] = useState("");
  function openEmail(e: React.FormEvent) {
    e.preventDefault();
    const body = `Name: ${name}\nEmail: ${reply}\n\n${message}`;
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Enquiry for ETHN Courts")}&body=${encodeURIComponent(body)}`;
  }
  const input = "mt-2 w-full rounded-lg border border-[#8c7167] bg-white px-4 py-3 text-base text-[#271815] outline-none focus-visible:border-[#7f2a00] focus-visible:ring-2 focus-visible:ring-[#7f2a00]/30";
  return <form onSubmit={openEmail} className="mt-6 space-y-4"><label className="block text-sm font-semibold text-[#271815]">Your name<input required maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} className={input} /></label><label className="block text-sm font-semibold text-[#271815]">Your email<input required type="email" maxLength={254} autoComplete="email" value={reply} onChange={e => setReply(e.target.value)} className={input} /></label><label className="block text-sm font-semibold text-[#271815]">Message<textarea required maxLength={2000} rows={5} value={message} onChange={e => setMessage(e.target.value)} className={input} /></label><button type="submit" disabled={!email} className="min-h-11 rounded-lg public-cta-primary px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-50">Open email app</button><p className="text-sm leading-6 text-[#3C3835]">{email ? "Your email app will open with your message ready to review and send." : "Email is not available yet. Please use another contact option."}</p></form>;
}
