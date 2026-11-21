"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';

export default function OutcomeControls({bookingId,noShow,onSaved}:{bookingId:string;noShow:boolean;onSaved:()=>void}){
  const[reason,setReason]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  async function save(){
    if(busy||!reason.trim())return;
    if(!window.confirm(`${noShow?'Clear':'Record'} no-show outcome? Payment and reserved history remain unchanged.`))return;
    setBusy(true);setError('');
    try{const r=await fetch('/api/ethn/admin/outcomes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'noShow',bookingId,noShow:!noShow,expectedNoShow:noShow,reason:reason.trim()})});if(!r.ok)throw new Error(r.status===409?'Outcome changed or booking is not completed. Reload before retrying.':'Could not save outcome. Reload to verify current state.');onSaved();}catch(e){setError(e instanceof Error?e.message:'Outcome unavailable.');}finally{setBusy(false);}
  }
  return <section className="rounded-xl border bg-card p-5 space-y-3"><h2 className="font-semibold">Completion outcome: {noShow?'No-show':'Completed'}</h2><p className="text-sm text-muted-foreground">Correcting attendance does not cancel, release or refund this booking.</p><label className="block text-sm">Reason<textarea required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded-md border bg-background p-2"/></label>{error&&<p role="alert">{error}</p>}<Button disabled={busy||!reason.trim()} onClick={()=>void save()}>{noShow?'Clear no-show':'Record no-show'}</Button></section>;
}
