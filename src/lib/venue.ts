import { isValidPhMobile, normalizePhone } from "./booking/phone";

/** Venue details shared by the landing page and contact surfaces. */
export const VENUE_ADDRESS = "FPV7+75P, Balamban, Cebu, Philippines";
export const VENUE_MAP_LINK = "https://maps.app.goo.gl/jCeS5x6pWBaNXd67A";
export const VENUE_MAP_EMBED =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d980.8043173831779!2d123.71519261104508!3d10.483531370796115!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33a90900214d29bf%3A0xaee49eba1ff21194!2sETHN%20Courts!5e0!3m2!1sen!2sph!4v1795612755750!5m2!1sen!2sph";
export const VENUE_EMAIL = "ethncourts@gmail.com";
export const VENUE_FACEBOOK_LINK = "https://www.facebook.com/profile.php?id=61595506081491";

const VENUE_PHONE_NUMBERS = ["0923 473 1093", "0961 821 3351", "0917 164 0092", "0905 521 7858"];

export function venuePhoneLinks(override?: string) {
  const links = new Map<string, { label: string; href: string }>();
  for (const label of [override ?? "", ...VENUE_PHONE_NUMBERS]) {
    const local = normalizePhone(label);
    const dial = isValidPhMobile(local) ? `+63${local.slice(1)}` : label.replace(/[^+\d]/g, "");
    if (/^\+?\d+$/.test(dial) && !links.has(dial)) links.set(dial, { label, href: `tel:${dial}` });
  }
  return [...links.values()];
}
