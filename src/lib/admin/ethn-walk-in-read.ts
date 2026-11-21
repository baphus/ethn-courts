import type {Pool} from 'pg';
import {getStaff,type StaffVerifier} from './ethn-payments';
export async function readWalkInHold(pool:Pick<Pool,'connect'>,verify:StaffVerifier){
 const{userId}=await getStaff(pool,verify),c=await pool.connect();
 try{const row=(await c.query("SELECT b.id,b.operating_date::text,b.total::text,b.settings_version::text,b.merchant_snapshot,b.expires_at,b.guest_name,b.guest_phone,i.court_id::text,c.name,i.starts_at,i.ends_at FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id JOIN ethn.courts c ON c.id=i.court_id WHERE b.walk_in_actor=$1 AND b.status='held' AND b.expires_at>clock_timestamp() ORDER BY b.created_at DESC,b.id DESC LIMIT 1",[userId])).rows[0];
 return row?{holdId:row.id,courtId:row.court_id,courtName:row.name,operatingDate:row.operating_date,startsAt:new Date(row.starts_at).toISOString(),endsAt:new Date(row.ends_at).toISOString(),total:row.total,settingsVersion:row.settings_version,merchant:row.merchant_snapshot,expiresAt:new Date(row.expires_at).toISOString(),guestName:row.guest_name,guestPhone:row.guest_phone}:null;
 }finally{c.release();}
}
