"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
export default function CompleteDue(){
 const[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function run(){setBusy(true);setMessage('');try{const r=await fetch('/api/ethn/admin/outcomes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'complete'})});if(!r.ok)throw new Error();const data=await r.json();setMessage(`${data.completed.length} ended confirmed bookings completed. Refresh booking results to see updated states.`);}catch{setMessage('Completion unavailable. Refresh booking states before retrying.');}finally{setBusy(false);}}
 return <div className="space-y-2"><Button variant="outline" disabled={busy} onClick={()=>void run()}>{busy?'Completing…':'Complete ended bookings'}</Button>{message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}</div>;
}
