"use client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect } from "@/components/ui/form-select";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSidebarActivity } from "@/components/admin/admin-shell";

const success = {
  approve: "Payment approved.", reject: "Payment rejected.",
  refund: "Full refund recorded."
};
type Action = keyof typeof success;
const rejectionReasons = [
  "We could not find the payment in our receiving account.",
  "The payment amount does not match the booking total.",
  "The payment proof is incomplete or unreadable.",
  "The payment was sent to a different account.",
];
export default function BookingDecision({id,initialAction,status,proof,canRefund,onSaved,onDelete,className}:{id:string;initialAction?: "approve" | "reject" | "refund";status:string;proof:boolean;canRefund:boolean;onSaved:()=>void;onDelete?:()=>void;className?:string}) {
 const canReview = status === "pending" && proof;
  const [action,setAction]=useState<Action|null>(initialAction === "refund" ? (canRefund ? initialAction : null) : canReview ? initialAction ?? null : null);const [reason,setReason]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [pending,setPending]=useState<{url:string;body:Record<string,unknown>}|null>(null);const lock=useRef(false);
 const [rejectionReason,setRejectionReason]=useState("");
 const [reference,setReference]=useState("");
  const reasonId=useId();
 const decisionReason=(action==="reject"&&rejectionReason!=="other"?rejectionReason:reason).trim();
  const [announceError,setAnnounceError]=useState(true);
 const { refreshCounts } = useSidebarActivity();
 async function send(url:string,body:Record<string,unknown>){
   if(lock.current||!action)return;
   lock.current=true;setBusy(true);setError("");
   try{
     const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
     const conflict = r.status === 409 ? (await r.json()).error : null;
      if(r.status>=500||conflict==="IDEMPOTENCY_INCOMPLETE")throw Error();
     if(!r.ok){
       setPending(null);
       setAnnounceError(r.status===400);
       setError(conflict === "REFERENCE_ALREADY_USED" ? "This transfer ID is already used. Check the receiving account before approving." : r.status===409?"Booking changed or action is no longer available. Reload before retrying.":"Action unavailable. Check details and Owner access.");
       if(r.status!==400)toast.error("Booking action rejected.", { description: "Check booking details before retrying." });
       return;
     }
   }catch{
     setAnnounceError(false);
     setPending({url,body});setError("Result unknown. Retry the same request or reload before making another change.");
     toast.warning("Booking action not confirmed.", { description: "Check the booking or retry the same request." });
     return;
   }finally{lock.current=false;setBusy(false);}
   setPending(null);setAction(null);
   toast.success(success[action]);
   void refreshCounts().catch(() => {});
   onSaved();
 }
 function confirm(){if(!action)return;setAnnounceError(true);if((action==="reject"||action==="refund")&&!decisionReason){setError(action==="reject"&&!rejectionReason?"Select a reason.":"Enter a reason.");return;}if(action==="refund"&&!reference.trim()){setError("Enter the external refund reference.");return;}const key=crypto.randomUUID();const url=action==="approve"||action==="reject"?`/api/ethn/admin/payments/${encodeURIComponent(id)}/decision`:`/api/ethn/admin/bookings/${encodeURIComponent(id)}/${action}`;const body=action==="approve"?{key,action,paymentReceived:true}:action==="reject"?{key,action,reason:decisionReason}:{key,reason:decisionReason,reference:reference.trim()};setPending({url,body});void send(url,body);}
 const reviewReason = canReview ? undefined : "Only pending bookings with payment proof can be reviewed.";
  const refundReason = canRefund ? undefined : "Requires an eligible confirmed booking with full payment, before play starts, and no active extension.";
  return <section className={`space-y-4 rounded-xl border bg-card p-5 ${className ?? ""}`}><h2 className="font-semibold">Booking actions</h2>
    <div className="flex flex-wrap gap-2">
      {([["approve", "Approve", reviewReason], ["reject", "Reject", reviewReason], ["refund", "Cancel (full refund)", refundReason]] as const).map(([option, label, reasonUnavailable]) => <Button key={option} type="button" variant="outline" title={reasonUnavailable} aria-disabled={!!reasonUnavailable || !!pending} className={reasonUnavailable || pending ? "opacity-50" : undefined} onClick={() => {
        if (reasonUnavailable || pending) return;
        setAction(option);setReference("");setReason("");setRejectionReason("");setError("");
      }}>{label}{reasonUnavailable && <span className="sr-only">: {reasonUnavailable}</span>}</Button>)}
      {onDelete && <Button type="button" variant="destructive" className="sm:ml-auto" disabled={!!pending} onClick={onDelete}>Delete</Button>}
    </div>
    {action&&!pending&&<div className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold capitalize">{action==="approve"?"Approve payment?":`Confirm ${action}`}</h3>{action==="refund"&&<p className="text-sm">Only record this after returning the full payment outside ETHN Courts. This releases the court time and does not send money.</p>}{action==="reject"&&<div className="grid gap-1 text-sm">
   <label htmlFor={reasonId}>Rejection reason (required)</label>
   <FormSelect id={reasonId} aria-describedby={`${reasonId}-hint`} required value={rejectionReason || null} placeholder="Select a reason" onValueChange={value => {setRejectionReason(value ?? "");setReason("");setError("");}} options={[...rejectionReasons.map(value => ({ value, label: value })), { value: "other", label: "Other" }]} />
   <p id={`${reasonId}-hint`} className="text-muted-foreground">The customer will see this reason. Do not include private payment details.</p>
 </div>}{(action==="refund"||(action==="reject"&&rejectionReason==="other"))&&<div className="grid gap-1 text-sm">
   <label htmlFor={`${reasonId}-text`}>{action==="reject"?"Other reason (required)":"Reason (required)"}</label>
   <Textarea placeholder={action==="reject"?"Why the payment could not be verified":undefined} id={`${reasonId}-text`} required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} />
 </div>}{action==="refund"&&<label className="grid gap-1 text-sm">External refund reference (required)<Input required maxLength={200} value={reference} onChange={e=>setReference(e.target.value)} /></label>}<div className="flex gap-2"><Button disabled={busy} onClick={confirm}>{action==="approve"?"Approve booking":`Confirm ${action}`}</Button><Button variant="outline" disabled={busy} onClick={()=>setAction(null)}>Go back</Button></div></div>}{error&&<p role={announceError ? "alert" : undefined} className="text-sm text-destructive">{error}</p>}{pending&&!busy&&<Button variant="outline" onClick={()=>void send(pending.url,pending.body)}>Retry same request</Button>}</section>;
}
