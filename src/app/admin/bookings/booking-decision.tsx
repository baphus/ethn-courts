"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSidebarActivity } from "@/components/admin/admin-shell";

const success = {
  approve: "Payment approved.", reject: "Payment rejected.", refund: "Refund recorded. No money was sent.",
  cancel: "Booking cancelled.", archive: "Booking archived.",
};
type Action = keyof typeof success;
export default function BookingDecision({id,status,proof,internal,archived,beforeStart,extensionsClear,onSaved}:{id:string;status:string;proof:boolean;internal:boolean;archived:boolean;beforeStart:boolean;extensionsClear:boolean;onSaved:()=>void}) {
 const [action,setAction]=useState<Action|null>(null);const [reason,setReason]=useState("");const [reference,setReference]=useState("");const [checked,setChecked]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [pending,setPending]=useState<{url:string;body:Record<string,unknown>}|null>(null);const lock=useRef(false);
  const [announceError,setAnnounceError]=useState(true);
 const { refreshCounts } = useSidebarActivity();
 async function send(url:string,body:Record<string,unknown>){
   if(lock.current||!action)return;
   lock.current=true;setBusy(true);setError("");
   try{
     const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
     if(r.status>=500||(r.status===409&&(await r.json()).error==="IDEMPOTENCY_INCOMPLETE"))throw Error();
     if(!r.ok){
       setPending(null);
       setAnnounceError(r.status===400);
       setError(r.status===409?"Booking changed or action is no longer available. Reload before retrying.":"Action unavailable. Check details and staff access.");
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
 function confirm(){if(!action)return;setAnnounceError(true);if((action==="reject"||action==="refund"||action==="cancel")&&!reason.trim()){setError("Enter a reason.");return;}if(action==="refund"&&!reference.trim()){setError("Enter the external refund reference.");return;}if(action==="approve"&&!checked){setError("Confirm full payment in the merchant account.");return;}const key=crypto.randomUUID();const url=action==="approve"||action==="reject"?`/api/ethn/admin/payments/${encodeURIComponent(id)}/decision`:`/api/ethn/admin/bookings/${encodeURIComponent(id)}/${action}`;const body=action==="approve"?{key,action,paymentReceived:true}:action==="reject"?{key,action,reason:reason.trim()}:action==="refund"?{key,reason:reason.trim(),reference:reference.trim()}:action==="cancel"?{key,reason:reason.trim()}:{key};setPending({url,body});void send(url,body);}
 const options:Action[]=status==="pending"&&proof?["approve","reject"]:status==="confirmed"&&beforeStart&&extensionsClear?(internal?["refund","cancel"]:["refund"]):!archived&&["completed","expired","rejected","refunded","cancelled"].includes(status)?["archive"]:[];
 if(!options.length)return null;
 return <section className="space-y-4 rounded-xl border bg-card p-5"><h2 className="font-semibold">Booking actions</h2>{!action&&!pending&&<div className="flex flex-wrap gap-2">{options.map(a=><Button key={a} variant={a==="approve"?"default":"outline"} onClick={()=>{setAction(a);setReason("");setReference("");setChecked(false);setError("");}}>{a==="refund"?"Record full refund":a==="cancel"?"Cancel internal booking":a[0].toUpperCase()+a.slice(1)}</Button>)}</div>}{action&&!pending&&<div className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold capitalize">Confirm {action}</h3>{action==="approve"&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>I checked the merchant account and received the full booking total. A screenshot alone is not confirmation.</label>}{action==="refund"&&<p className="text-sm">Return the full amount externally first. This action records the refund; it does not send money. Only bookings before play starts can be refunded.</p>}{action==="cancel"&&<p className="text-sm">Only eligible internal bookings can be cancelled. Payment is retained; no refund is recorded.</p>}{action==="archive"&&<p className="text-sm">Archive hides this terminal booking from the default list. History remains available.</p>}{["reject","refund","cancel"].includes(action)&&<label className="grid gap-1 text-sm">{action==="reject"?"Customer-visible reason":"Reason"}<textarea maxLength={500} className="rounded-md border bg-background p-2" value={reason} onChange={e=>setReason(e.target.value)} /></label>}{action==="refund"&&<label className="grid gap-1 text-sm">External refund reference<input maxLength={200} className="rounded-md border bg-background p-2" value={reference} onChange={e=>setReference(e.target.value)} /></label>}<div className="flex gap-2"><Button disabled={busy} onClick={confirm}>Confirm {action}</Button><Button variant="outline" disabled={busy} onClick={()=>setAction(null)}>Go back</Button></div></div>}{error&&<p role={announceError ? "alert" : undefined} className="text-sm text-destructive">{error}</p>}{pending&&!busy&&<Button variant="outline" onClick={()=>void send(pending.url,pending.body)}>Retry same request</Button>}</section>;
}
