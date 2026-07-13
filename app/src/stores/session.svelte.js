// Session store — replaces the legacy WeddingApp useState hoard and the
// module-global WEDDING. Same localStorage keys, so devices logged in via the
// legacy app stay logged in here.
import { storage } from "../lib/storage.js";
import { ROLES, SESSION_KEY, WEDDING_KEY } from "../lib/constants.js";

export const app = $state({
  wedding: undefined, // undefined = checking, null = none picked yet
  session: undefined, // undefined = checking, null = logged out
  guestMode: null, // null | "checkin" | "rsvp"
  guestLock: false, // true when opened via a ?p= link — kiosk mode, no way out
  adminMode: false,
});

export async function initApp() {
  // which wedding? URL ?w=code wins, else the last one opened on this device
  let w = null;
  try {
    const params = new URL(window.location.href).searchParams;
    const qw = (params.get("w") || "").trim().toLowerCase();
    if (qw) {
      w = qw;
      await storage.set(WEDDING_KEY, qw);
    } else {
      const r = await storage.get(WEDDING_KEY);
      w = r && r.value ? r.value : null;
    }
    // ?p=rsvp or ?p=checkin locks the page to that guest function (kiosk mode)
    const p = (params.get("p") || "").toLowerCase();
    if (w && (p === "rsvp" || p === "checkin")) {
      app.guestMode = p;
      app.guestLock = true;
    }
  } catch (e) {
    w = null;
  }
  let s = null;
  try {
    const r = await storage.get(SESSION_KEY);
    s = r && r.value ? JSON.parse(r.value) : null;
  } catch (e) {}
  // a saved session only counts for the wedding it belongs to
  if (!(s && ROLES[s.role] && s.wedding && s.wedding === w)) s = null;
  app.wedding = w;
  app.session = s;
}

export async function openWedding(code) {
  try {
    await storage.set(WEDDING_KEY, code);
  } catch (e) {}
  app.session = null;
  app.wedding = code;
}

export async function switchWedding() {
  try {
    await storage.delete(WEDDING_KEY);
    await storage.delete(SESSION_KEY);
  } catch (e) {}
  app.session = null;
  app.wedding = null;
}

// master control: jump straight into a wedding with full (couple-level) access
export async function enterWedding(code) {
  const s = { role: "bride", wedding: code, at: Date.now() };
  try {
    await storage.set(WEDDING_KEY, code);
    await storage.set(SESSION_KEY, JSON.stringify(s));
  } catch (e) {}
  app.adminMode = false;
  app.wedding = code;
  app.session = s;
}

export async function login(role) {
  const s = { role, wedding: app.wedding, at: Date.now() };
  app.session = s;
  try {
    await storage.set(SESSION_KEY, JSON.stringify(s));
  } catch (e) {}
}

export async function logout() {
  app.session = null;
  try {
    await storage.delete(SESSION_KEY);
  } catch (e) {}
}
