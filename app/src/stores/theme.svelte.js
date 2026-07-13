// Theme store — replaces the legacy mutable global palette `C` (which was
// swapped in place with Object.assign on every render). Here `C` keeps the
// exact same property names but each read is reactive via getters.
import { LIGHT, DARK, THEME_KEY } from "../lib/constants.js";
import { storage } from "../lib/storage.js";

export const theme = $state({ mode: "light" });

// C.green, C.ivory, … — identical call-sites to the legacy code, but reactive
export const C = {};
for (const k of Object.keys(LIGHT)) {
  Object.defineProperty(C, k, {
    get: () => (theme.mode === "dark" ? DARK : LIGHT)[k],
    enumerable: true,
  });
}

export async function initTheme() {
  try {
    const t = await storage.get(THEME_KEY);
    if (t && (t.value === "dark" || t.value === "light")) theme.mode = t.value;
  } catch (e) {}
}

export async function toggleTheme() {
  theme.mode = theme.mode === "dark" ? "light" : "dark";
  try {
    await storage.set(THEME_KEY, theme.mode);
  } catch (e) {}
}
