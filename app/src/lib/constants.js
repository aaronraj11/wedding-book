// ---------- constants (ported verbatim from wedding-planner.jsx) ----------
import { uid } from "./utils.js";

// every wedding gets its own space in the shared database, identified by a wedding code.
// unlike the legacy app (module-global WEDDING), the code is always passed explicitly.
export const DATA_KEY = (code) => `w:${code}:data`; // shared: one wedding's planning data
export const ACCT_KEY = (code) => `w:${code}:accounts`; // shared: one wedding's role passcodes
export const META_KEY = (code) => `w:${code}:meta`; // shared: wedding registration record
export const SESSION_KEY = "wedding-planner:session"; // personal: who is logged in on this device
export const WEDDING_KEY = "wedding-planner:wedding"; // personal: last-opened wedding code on this device
export const THEME_KEY = "wedding-planner:theme"; // personal: light/dark preference

// pastel wedding palette: blush ivory, sage, champagne gold, dusty rose
export const LIGHT = {
  ivory: "#FAF5F1",
  card: "#FFFFFF",
  soft: "#FDFAF7",
  neutral: "#F2EBE4",
  ink: "#443F3A",
  green: "#6B8E7B",
  greenSoft: "#E8F1EB",
  gold: "#BC9459",
  goldSoft: "#F6EEDF",
  line: "#EAE0D5",
  muted: "#9A8E82",
  red: "#B57373",
  redSoft: "#F8EAEA",
  onGreen: "#FFFFFF",
  onGold: "#FFFFFF",
  waSoft: "#EAF7EF",
  waBorder: "#C8E6D2",
  waText: "#2F5D46",
  waBtn: "#41A868",
};

export const DARK = {
  ivory: "#1B1917",
  card: "#252220",
  soft: "#2B2825",
  neutral: "#332F2A",
  ink: "#EDE7DE",
  green: "#A9C6B2",
  greenSoft: "#2C382F",
  gold: "#DFC292",
  goldSoft: "#3B3323",
  line: "#3D3833",
  muted: "#A89D90",
  red: "#E0A9A4",
  redSoft: "#40302D",
  onGreen: "#1B2620",
  onGold: "#2C2415",
  waSoft: "#20372A",
  waBorder: "#335843",
  waText: "#C4E6CF",
  waBtn: "#53C07E",
};

export const ROLES = {
  bride: { label: "Bride", icon: "🌸", side: null, tabs: ["overview", "guests", "catering", "budget", "todo", "team", "gifts", "dayof", "data"] },
  groom: { label: "Groom", icon: "🤵", side: null, tabs: ["overview", "guests", "catering", "budget", "todo", "team", "gifts", "dayof", "data"] },
  brideAcct: { label: "Bride's Accountant", icon: "📒", side: "bride", tabs: ["overview", "guests", "gifts", "dayof"] },
  groomAcct: { label: "Groom's Accountant", icon: "📗", side: "groom", tabs: ["overview", "guests", "gifts", "dayof"] },
};

export const EMPTY = {
  settings: { couple: "", date: "" },
  events: [],
  guests: [],
  caterers: [],
  budget: [],
  extraGifts: [],
  todos: [],
  team: [],
  trash: [],
  bufferPct: 10,
  budgetTarget: "",
};

// starter template for the wedding-day team hierarchy (🎭 Team tab).
// fresh ids each call so weddings never share ids.
export const defaultTeam = () => {
  const cat = (name, titles) => ({
    id: "tc-" + uid(),
    name,
    roles: titles.map((title) => ({ id: "tr-" + uid(), title, person: "", phone: "" })),
  });
  return [
    cat("💍 Couple", ["Groom", "Bride"]),
    cat("🌸 Bridal Party", ["Maid of Honour", "Bridesmaid 1", "Bridesmaid 2", "Bridesmaid 3", "Bridesmaid 4", "Bridesmaid 5", "Bridesmaid 6", "Bridesman"]),
    cat("🤵 Groom's Party", ["Best Man", "Groomsman 1", "Groomsman 2", "Groomsman 3", "Groomsman 4", "Groomsman 5", "Groomsman 6"]),
    cat("⛪ Ceremony", ["Emcee / Chairperson", "Pastor / Speaker"]),
    cat("🎵 Worship Team", ["Worship Lead", "Singer 1", "Singer 2", "Pianist", "Acoustic Guitarist", "Drummer", "Bassist", "Electric Guitarist", "Violinist"]),
    cat("📋 Coordination", ["Floor Manager", "Service Coordinator", "Assistant Coordinator", "Usher 1", "Usher 2"]),
    cat("🎥 Production & AV", ["Designer", "Primary Tech (actual day)", "Sound 1", "Sound 2", "Video 1", "Video 2", "Video 3", "AV Room"]),
    cat("🎪 Setup & Front of House", ["Deco Team Lead", "Registration Table 1", "Registration Table 2"]),
  ];
};

export const GROUP_PRESETS = [
  "Immediate family",
  "Immediate family / Mom's side",
  "Immediate family / Dad's side",
  "Extended family",
  "Extended family / Mom's side",
  "Extended family / Dad's side",
  "Close friends",
  "Friends",
  "Friends / Mom's friends",
  "Friends / Dad's friends",
  "Colleagues",
  "Neighbours",
];

export const defaultEvents = (settings) => [
  { id: "ev-" + uid(), name: "Wedding Day", icon: "💒", date: (settings && settings.date) || "" },
];

export const EVENT_ICONS = ["💒", "📸", "🌼", "⛪", "🍽️", "🎉", "🫖", "💍", "🎊"];

// palette for the svg donut charts
export const CHART_COLORS = ["#6B8E7B", "#BC9459", "#8FA8C9", "#B48EAD", "#D9A66C", "#7FA8A0", "#B57373", "#9A8E82"];

// preset budget categories; the picker also offers "✏️ Other — type my own…" for custom ones
export const BUDGET_CATS = ["Venue & catering", "Attire & beauty", "Photography & video", "Decor & flowers", "Invitations", "Rings & jewellery", "Entertainment", "Dowry / hantaran", "Honeymoon"];

export const DEFAULT_TEMPLATE = `Dear {name} 💕

We're getting married! 💍

{couple} warmly invite you ({pax} pax) to celebrate our wedding on {date}.

{location}

Kindly let us know if you can make it — just tap the link below to RSVP:
{rsvp}

With love,
{couple}`;
