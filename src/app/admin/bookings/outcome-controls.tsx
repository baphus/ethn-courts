"use client";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm";
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function OutcomeControls({bookingId,noShow,onSaved}:{bookingId:string;noShow:boolean;onSaved:()=>void}){
  const confirm = useConfirm();
  const [reason,setReason]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [announceError,setAnnounceError]=useState(false);
  const [open,setOpen]=useState(false); const [unknown,setUnknown]=useState(false); const inflight=useRef(false);
  async function changeOpen(next:boolean){
    if(!next && (inflight.current || unknown)) return;
    if(!next && reason.trim() && !await confirm("Discard this reason?", { confirmLabel: "Discard reason", destructive: true })) return;
    setOpen(next); if(!next){setReason('');setError('');}
  }
  async function save(){
    if(inflight.current||unknown||!reason.trim())return;
    inflight.current=true;setBusy(true);setError('');
    try{
      const r=await fetch('/api/ethn/admin/outcomes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'noShow',bookingId,noShow:!noShow,expectedNoShow:noShow,reason:reason.trim()})});
      if(r.status>=500)throw Error();
      if(!r.ok){
        setAnnounceError(r.status===400);
        setError(r.status===400?'Check the reason before saving.':r.status===409?'Outcome changed or booking is not completed. Reload this page before retrying.':'Could not save outcome. Reload this page to verify current state.');
        if(r.status!==400){setUnknown(true);toast.error('Booking outcome rejected.', { description: 'Reload to check the booking.' });}
        return;
      }
    }catch{
      setAnnounceError(false);setError('Could not confirm whether the outcome was saved. Reload this page to verify current state.');setUnknown(true);
      toast.warning('Booking outcome not confirmed.', { description: 'Reload to check the booking.' });
      return;
    }finally{inflight.current=false;setBusy(false);}
    setReason('');setOpen(false);
    toast.success(noShow?'No-show cleared.':'No-show recorded.');
    onSaved();
  }
  return <section className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold">Completion outcome: {noShow?'No-show':'Completed'}</h2><p className="mt-1 text-sm text-muted-foreground">Attendance corrections do not cancel, release or refund this booking.</p></div><Dialog open={open} onOpenChange={(next, details) => { if (!next && (busy || unknown || reason.trim())) details.cancel(); void changeOpen(next); }}><DialogTrigger render={<Button variant="outline" />}>Change outcome</DialogTrigger><DialogContent showCloseButton={!busy&&!unknown}><DialogTitle>{noShow?'Clear no-show':'Record no-show'}</DialogTitle><DialogDescription>Payment and reserved history remain unchanged. The reason is recorded in the audit history.</DialogDescription><label className="block text-sm font-medium">Reason<Textarea placeholder="Why the attendance status is changing" required maxLength={500} disabled={busy||unknown} value={reason} onChange={e=>setReason(e.target.value)} className="mt-2" /></label>{error&&<p role={announceError ? 'alert' : undefined} className="text-destructive">{error}</p>}<div className="flex flex-wrap gap-2">{unknown ? <Button onClick={() => window.location.reload()}>Reload booking</Button> : <><Button disabled={busy||!reason.trim()} onClick={()=>void save()}>{busy?'Saving…':noShow?'Clear no-show':'Record no-show'}</Button><Button variant="outline" disabled={busy} onClick={()=>changeOpen(false)}>Cancel</Button></>}</div></DialogContent></Dialog></div></section>;
}
