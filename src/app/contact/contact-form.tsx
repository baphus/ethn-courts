"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ContactForm({ email }: { email: string }) {
  const [name, setName] = useState(""), [reply, setReply] = useState(""), [message, setMessage] = useState("");
  function openEmail(e: React.FormEvent) {
    e.preventDefault();
    const body = `Name: ${name}\nEmail: ${reply}\n\n${message}`;
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Enquiry for ETHN Courts")}&body=${encodeURIComponent(body)}`;
  }
  const input = "public-field mt-2 text-base";
  return <form onSubmit={openEmail} className="mt-6 space-y-4"><label className="block text-sm font-semibold text-[#271815]">Your name<Input required maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} className={input} /></label><label className="block text-sm font-semibold text-[#271815]">Your email<Input required type="email" maxLength={254} autoComplete="email" value={reply} onChange={e => setReply(e.target.value)} className={input} /></label><label className="block text-sm font-semibold text-[#271815]">Message<Textarea required maxLength={2000} rows={5} value={message} onChange={e => setMessage(e.target.value)} className={input} /></label><Button type="submit" disabled={!email} className="public-cta-primary min-h-11 px-5">Open email app</Button><p className="text-sm leading-6 text-[#3C3835]">{email ? "Your email app will open with your message ready to review and send." : "Email is not available yet. Please use another contact option."}</p></form>;
}
