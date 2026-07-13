// ---------- WhatsApp invitation helpers (ported from wedding-planner.jsx) ----------
import { num } from "./utils.js";
import { DEFAULT_TEMPLATE } from "./constants.js";

// build a personalised message for one guest.
// weddingCode is passed explicitly (legacy app read the module-global WEDDING).
export function buildInviteMessage(template, g, settings, weddingCode) {
  const dateStr = settings.date
    ? new Date(settings.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "(date to be announced)";
  const rsvpLink = `${location.origin}${location.pathname}?w=${weddingCode}&p=rsvp`;
  const locBlock = [
    settings.venueName ? `📍 Venue: ${settings.venueName}` : "",
    settings.venueMaps ? `Google Maps: ${settings.venueMaps}` : "",
    settings.venueWaze ? `Waze: ${settings.venueWaze}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return (template || DEFAULT_TEMPLATE)
    .replace(/\{name\}/g, g.name)
    .replace(/\{couple\}/g, settings.couple || "We")
    .replace(/\{date\}/g, dateStr)
    .replace(/\{pax\}/g, String(num(g.invitedPax) || 1))
    .replace(/\{location\}/g, locBlock)
    .replace(/\{rsvp\}/g, rsvpLink)
    .replace(/\n{3,}/g, "\n\n"); // tidy up blank lines when the venue isn't set
}

// normalise a phone number for wa.me — Malaysian numbers starting with 0 get the 60 prefix
export function waNumber(phone) {
  let d = (phone || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "60" + d.slice(1);
  return d;
}

export function waLink(phone, msg) {
  const n = waNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
}
