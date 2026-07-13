// ---------- guest model helpers (ported verbatim from wedding-planner.jsx) ----------
import { num } from "./utils.js";

// a guest with no event tags is invited to everything (the default)
export const guestInEvent = (g, evId) => !evId || !g.events || g.events.length === 0 || g.events.includes(evId);

// "Nathan Mama, Vicky Mami; Prabhu" -> ["Nathan Mama", "Vicky Mami", "Prabhu"]
export const parseMembers = (s) => (s || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

// members were once plain name strings; now they're { name, type: "adult"|"baby" }
export const asMember = (m) => (typeof m === "string" ? { name: m, type: "adult" } : { type: "adult", ...m });
export const membersOf = (g) => (g.members || []).map(asMember).filter((m) => m.name && m.name.trim());
export const babyCount = (list) => list.filter((m) => m.type === "baby").length;

// vegetarian meals needed for one invite (babies don't get a meal)
export const vegOf = (g) => {
  const mm = membersOf(g);
  if (mm.length) {
    const coming = g.rsvp === "yes" && Array.isArray(g.confirmedMembers) ? mm.filter((m) => g.confirmedMembers.includes(m.name)) : mm;
    return coming.filter((m) => m.diet === "veg" && m.type !== "baby").length;
  }
  return num(g.confirmedVeg);
};

// cross-check naming clashes that can confuse RSVP/check-in search or member ticking
export function findNameClashes(guests) {
  const inviteSeen = {};
  const inviteDupes = new Set();
  guests.forEach((g) => {
    const k = g.name.trim().toLowerCase();
    if (inviteSeen[k]) inviteDupes.add(g.name.trim());
    inviteSeen[k] = true;
  });
  const withinDupes = []; // same member name twice inside one invite
  const memberMap = {}; // member name -> which invites it appears in
  guests.forEach((g) => {
    const seen = {};
    membersOf(g).forEach((m) => {
      const k = m.name.trim().toLowerCase();
      if (seen[k]) withinDupes.push({ invite: g.name, name: m.name });
      seen[k] = true;
      (memberMap[k] = memberMap[k] || { name: m.name, invites: new Set() }).invites.add(g.name);
    });
  });
  const acrossDupes = Object.values(memberMap)
    .filter((x) => x.invites.size > 1)
    .map((x) => ({ name: x.name, invites: [...x.invites] }));
  return { inviteDupes: [...inviteDupes], withinDupes, acrossDupes };
}
