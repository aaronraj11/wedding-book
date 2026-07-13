// Storage backend — reproduces the legacy window.storage contract exactly.
// Shared keys (wedding data, role passcodes) live in Firestore so everyone
// sees the same data; session + theme stay in this browser's localStorage.
//
// Firestore doc shape (MUST stay identical to the legacy app):
//   collection "kv", doc id = key, fields { value: <string>, client: <clientId>, updatedAt: <serverTimestamp> }
import { doc, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db, authReady } from "./firebase.js";

const _doc = (key) => doc(db, "kv", key);

export const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

// ---- data-safety guard -----------------------------------------------------
// A wedding's data doc is irreplaceable (the guest list lives there). Deleting
// one must be an explicit, deliberate act — only the admin panel's confirmed
// delete flow passes the override flag.
const WEDDING_DATA_RE = /^w:.+:data$/;

export const storage = {
  clientId: CLIENT_ID,

  async get(key, shared) {
    if (shared) {
      await authReady;
      const snap = await getDoc(_doc(key));
      return snap.exists() ? { value: snap.data().value } : null;
    }
    const v = localStorage.getItem(key);
    return v === null ? null : { value: v };
  },

  async set(key, value, shared) {
    if (shared) {
      await authReady;
      await setDoc(_doc(key), { value: String(value), client: CLIENT_ID, updatedAt: serverTimestamp() });
      return;
    }
    localStorage.setItem(key, String(value));
  },

  // live updates: calls cb({value, client}) whenever the doc changes (shared keys only)
  subscribe(key, cb) {
    let un = null;
    let cancelled = false;
    authReady
      .then(() => {
        if (cancelled) return;
        un = onSnapshot(_doc(key), (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            cb({ value: d.value, client: d.client || null });
          }
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (un) un();
    };
  },

  // when a shared doc was last written (ms since epoch), or null
  async getUpdatedAt(key) {
    await authReady;
    const snap = await getDoc(_doc(key));
    const t = snap.exists() ? snap.data().updatedAt : null;
    return t && t.toMillis ? t.toMillis() : null;
  },

  async delete(key, shared, opts) {
    if (WEDDING_DATA_RE.test(key) && !(opts && opts.iKnowThisDestroysAWedding)) {
      throw new Error(
        `storage.delete refused for "${key}" — wedding data docs are protected. ` +
          `Pass { iKnowThisDestroysAWedding: true } only from the admin panel's confirmed delete flow.`
      );
    }
    if (shared) {
      await authReady;
      await deleteDoc(_doc(key));
      return;
    }
    localStorage.removeItem(key);
  },
};
