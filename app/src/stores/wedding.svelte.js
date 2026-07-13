// The wedding data store — port of legacy Planner's data lifecycle:
// load → normalize → subscribe (live sync with echo suppression) → debounced save.
//
// Rules:
// - ALL local mutations go through up(patch) so the debounced save fires.
//   Never mutate wd.data directly from components.
// - Remote changes bypass up() (they must not re-save what the DB just told us).
// - Conflict policy is last-write-wins, same as the legacy app.
import { storage, CLIENT_ID } from "../lib/storage.js";
import { DATA_KEY, EMPTY, defaultEvents } from "../lib/constants.js";
import { trashFresh } from "../lib/utils.js";

export const wd = $state({
  data: null, // the whole wedding doc (EMPTY shape); null until load starts
  loaded: false,
  saveState: "saved", // saved | saving | error
});

let code = null; // wedding code this store is bound to
let lastRemote = ""; // last state received from (or confirmed in) the shared database
let saveTimer = null;
let unsub = null;

function normalize(parsed) {
  const next = { ...EMPTY, ...parsed, settings: { ...EMPTY.settings, ...(parsed.settings || {}) } };
  if (!next.events || next.events.length === 0) next.events = defaultEvents(next.settings);
  // repair icons mangled by an old data migration ("💒" -> "??")
  next.events = next.events.map((e) => (/^\?+$/.test((e.icon || "").trim()) ? { ...e, icon: "💒" } : e));
  // the default event follows the wedding date until it gets its own
  if (next.events.length === 1 && !next.events[0].date && next.settings.date) {
    next.events = [{ ...next.events[0], date: next.settings.date }];
  }
  next.trash = (next.trash || []).filter(trashFresh);
  return next;
}

// open a wedding: load its doc (read-only — normalization is NOT written back
// until the user makes an edit) and start the live-sync subscription
export async function startWedding(weddingCode) {
  stopWedding();
  code = weddingCode;

  let next = { ...EMPTY };
  try {
    const r = await storage.get(DATA_KEY(code), true);
    if (r && r.value) next = normalize(JSON.parse(r.value));
    else next = normalize(next);
  } catch (e) {
    next = normalize(next);
  }
  lastRemote = JSON.stringify(next);
  wd.data = next;
  wd.loaded = true;

  // live sync: apply changes other people make, as they make them
  unsub = storage.subscribe(DATA_KEY(code), (r) => {
    if (!r || typeof r.value !== "string") return;
    if (r.client && r.client === CLIENT_ID) return; // our own write echoing back
    try {
      const incoming = normalize(JSON.parse(r.value));
      lastRemote = JSON.stringify(incoming);
      wd.data = incoming;
    } catch (e) {}
  });
}

export function stopWedding() {
  if (unsub) unsub();
  unsub = null;
  clearTimeout(saveTimer);
  saveTimer = null;
  code = null;
  lastRemote = "";
  wd.data = null;
  wd.loaded = false;
  wd.saveState = "saved";
}

// shallow-merge a patch into the doc and schedule the debounced save —
// the exact call-site shape of the legacy `up(patch)`
export function up(patch) {
  if (!wd.data) return;
  Object.assign(wd.data, patch);
  scheduleSave();
}

function scheduleSave() {
  wd.saveState = "saving";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!code) return;
    const json = JSON.stringify($state.snapshot(wd.data));
    if (json === lastRemote) {
      // change came from (or matches) the database — nothing to write
      wd.saveState = "saved";
      return;
    }
    try {
      await storage.set(DATA_KEY(code), json, true);
      lastRemote = json;
      wd.saveState = "saved";
    } catch (e) {
      wd.saveState = "error";
    }
  }, 400);
}
