// ---------- aggregation & tree helpers (ported verbatim from wedding-planner.jsx) ----------
import { num } from "./utils.js";

export function computeStats(data, side) {
  const g = side ? data.guests.filter((x) => x.side === side) : data.guests;
  const invitedPax = g.reduce((s, x) => s + num(x.invitedPax || 1), 0);
  const invitedBabies = g.reduce((s, x) => s + Math.min(num(x.invitedBabies), num(x.invitedPax || 1)), 0);
  const invitedEating = Math.max(0, invitedPax - invitedBabies);
  const attending = g.filter((x) => x.rsvp === "yes");
  const confirmedPax = attending.reduce((s, x) => s + num(x.confirmedPax || x.invitedPax || 1), 0);
  const confirmedBabies = attending.reduce((s, x) => {
    const pax = num(x.confirmedPax || x.invitedPax || 1);
    const babies = x.confirmedBabies === "" || x.confirmedBabies === undefined ? num(x.invitedBabies) : num(x.confirmedBabies);
    return s + Math.min(babies, pax);
  }, 0);
  const confirmedEating = Math.max(0, confirmedPax - confirmedBabies);
  const pending = g.filter((x) => x.rsvp === "pending").length;
  const declined = g.filter((x) => x.rsvp === "no").length;
  // shortlisted budget items are candidates being compared — they don't count as
  // committed spend until confirmed (items with no status are treated as confirmed)
  const confirmedBudget = data.budget.filter((x) => x.status !== "shortlisted");
  const budgeted = confirmedBudget.reduce((s, x) => s + num(x.budgeted), 0);
  const actual = confirmedBudget.reduce((s, x) => s + num(x.actual), 0);
  const paidOut = confirmedBudget.reduce((s, x) => s + num(x.paidAmount !== undefined ? x.paidAmount : x.paid ? x.actual : 0), 0);
  const balanceToPay = Math.max(0, actual - paidOut);
  const depositsToCollect = confirmedBudget.reduce((s, x) => s + (x.depositCollected ? 0 : num(x.deposit)), 0);
  const extras = side ? data.extraGifts.filter((x) => (x.side || "bride") === side) : data.extraGifts;
  const gifts = g.reduce((s, x) => s + num(x.giftAmount), 0) + extras.reduce((s, x) => s + num(x.amount), 0);
  return {
    guestCount: g.length,
    budgetTarget: num(data.budgetTarget),
    invitedPax,
    invitedBabies,
    invitedEating,
    confirmedPax,
    confirmedBabies,
    confirmedEating,
    attendingCount: attending.length,
    pending,
    declined,
    budgeted,
    actual,
    paidOut,
    balanceToPay,
    depositsToCollect,
    gifts,
    net: actual - gifts,
  };
}

// ---------- family tree ----------
export function branchStats(guests) {
  const invites = guests.length;
  const pax = guests.reduce((s, g) => s + num(g.invitedPax || 1), 0);
  const babies = guests.reduce((s, g) => s + Math.min(num(g.invitedBabies), num(g.invitedPax || 1)), 0);
  const attending = guests.filter((g) => g.rsvp === "yes").length;
  return { invites, pax, babies, attending };
}

// legacy rsvpDot returned JSX; here we return the palette key + label and let a
// component render the dot (color comes from the reactive theme palette)
export function rsvpDotInfo(rsvp) {
  const colorKey = rsvp === "yes" ? "green" : rsvp === "no" ? "red" : "gold";
  const label = rsvp === "yes" ? "Attending" : rsvp === "no" ? "Declined" : "Pending";
  return { colorKey, label };
}

// build a nested tree from group paths like "Dad's family / Uncle Ravi's family"
export function buildGroupTree(guests) {
  const root = { children: {}, guests: [] };
  guests.forEach((g) => {
    const path = (g.group || "").split("/").map((p) => p.trim()).filter(Boolean);
    let node = root;
    (path.length ? path : ["Ungrouped"]).forEach((part) => {
      node.children[part] = node.children[part] || { children: {}, guests: [] };
      node = node.children[part];
    });
    node.guests.push(g);
  });
  return root;
}

// all guests in a branch, including every sub-branch
export function collectGuests(node) {
  return Object.values(node.children).reduce((acc, c) => acc.concat(collectGuests(c)), [...node.guests]);
}
