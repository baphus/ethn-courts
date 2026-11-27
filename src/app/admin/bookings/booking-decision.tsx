"use client";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect } from "@/components/ui/form-select";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSidebarActivity } from "@/components/admin/admin-shell";

const success = {
  approve: "Payment approved.", reject: "Payment rejected.",
  cancel: "Booking cancelled.", archive: "Booking archived.", complete: "Booking marked completed."
};
type Action = keyof typeof success;
const rejectionReasons = [
  "We could not find the payment in our receiving account.",
  "The payment amount does not match the booking total.",
  "The payment proof is incomplete or unreadable.",
  "The payment was sent to a different account.",
];
export default function BookingDecision({id,status,proof,internal,archived,beforeStart,extensionsClear,canComplete,onSaved,className}:{id:string;status:string;proof:boolean;internal:boolean;archived:boolean;beforeStart:boolean;extensionsClear:boolean;canComplete:boolean;onSaved:()=>void;className?:string}) {
 const [action,setAction]=useState<Action|null>(null);const [reason,setReason]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [pending,setPending]=useState<{url:string;body:Record<string,unknown>}|null>(null);const lock=useRef(false);
 const [rejectionReason,setRejectionReason]=useState("");
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
   if(action==="approve"||action==="reject")void refreshCounts();
   onSaved();
 }
 function confirm(){if(!action)return;setAnnounceError(true);if((action==="reject"||action==="cancel")&&!decisionReason){setError(action==="reject"&&!rejectionReason?"Select a reason.":"Enter a reason.");return;}const key=crypto.randomUUID();const url=action==="complete"?"/api/ethn/admin/outcomes":action==="approve"||action==="reject"?`/api/ethn/admin/payments/${encodeURIComponent(id)}/decision`:`/api/ethn/admin/bookings/${encodeURIComponent(id)}/${action}`;const body=action==="complete"?{action,bookingId:id}:action==="approve"?{key,action,paymentReceived:true}:action==="reject"?{key,action,reason:decisionReason}:action==="cancel"?{key,reason:decisionReason}:{key};setPending({url,body});void send(url,body);}
 const options:Action[]=status==="pending"&&proof?["approve","reject"]:canComplete?["complete"]:status==="confirmed"&&internal&&beforeStart&&extensionsClear?["cancel"]:!archived&&["completed","expired","rejected","refunded","cancelled"].includes(status)?["archive"]:[];
 if(!options.length)return null;
 return <section className={`space-y-4 rounded-xl border bg-card p-5 ${className ?? ""}`}><h2 className="font-semibold">Booking actions</h2>{!action&&!pending&&<div className="flex flex-wrap gap-2">{options.map(a=><Button key={a} variant={a==="approve"?"default":"outline"} className={a==="approve"?"bg-green-700 text-white hover:bg-green-800":a==="reject"?"border-red-600 text-red-700 hover:bg-red-50 hover:text-red-800":""} onClick={()=>{setAction(a);setReason("");setRejectionReason("");setError("");}}>{a==="approve"?<><svg aria-hidden="true" viewBox="0 0 24 24" className="mr-2 size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>Approve</>:a==="reject"?<><svg aria-hidden="true" viewBox="0 0 24 24" className="mr-2 size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg>Reject</>:a==="cancel"?"Cancel internal booking":a==="complete"?"Mark completed":a[0].toUpperCase()+a.slice(1)}</Button>)}</div>}{action&&!pending&&<div className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold capitalize">{action==="approve"?"Approve payment?":`Confirm ${action}`}</h3>{action==="cancel"&&<p className="text-sm">Only eligible internal bookings can be cancelled. Payment is retained; no refund is recorded.</p>}{action==="complete"&&<p className="text-sm">Mark this booking completed. Payment and booking history stay unchanged.</p>}{action==="archive"&&<p className="text-sm">Archive hides this terminal booking from the default list. History remains available.</p>}{action==="reject"&&<div className="grid gap-1 text-sm">
   <label htmlFor={reasonId}>Rejection reason (required)</label>
   <FormSelect id={reasonId} aria-describedby={`${reasonId}-hint`} required value={rejectionReason || null} placeholder="Select a reason" onValueChange={value => {setRejectionReason(value ?? "");setReason("");setError("");}} options={[...rejectionReasons.map(value => ({ value, label: value })), { value: "other", label: "Other" }]} />
   <p id={`${reasonId}-hint`} className="text-muted-foreground">The customer will see this reason. Do not include private payment details.</p>
 </div>}{(action==="cancel"||(action==="reject"&&rejectionReason==="other"))&&<div className="grid gap-1 text-sm">
   <label htmlFor={`${reasonId}-text`}>{action==="reject"?"Other reason (required)":"Reason (required)"}</label>
   <Textarea id={`${reasonId}-text`} required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} />
 </div>}<div className="flex gap-2"><Button disabled={busy} onClick={confirm}>{action==="approve"?"Approve booking":action==="complete"?"Mark completed":`Confirm ${action}`}</Button><Button variant="outline" disabled={busy} onClick={()=>setAction(null)}>Go back</Button></div></div>}{error&&<p role={announceError ? "alert" : undefined} className="text-sm text-destructive">{error}</p>}{pending&&!busy&&<Button variant="outline" onClick={()=>void send(pending.url,pending.body)}>Retry same request</Button>}</section>;
}
