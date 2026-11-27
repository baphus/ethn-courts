import EthnBooking from "@/components/booking/ethn-booking";
import { daylightFonts } from "../daylight-fonts";

export const metadata = { title: "Book a court — ETHN Courts" };
export default function BookPage() { return <div className={`daylight ${daylightFonts}`}><EthnBooking bookingPage /></div>; }
