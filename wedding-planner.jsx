import { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";

// ---------- constants & helpers ----------
// every wedding gets its own space in the shared database, identified by a wedding code
let WEDDING = null; // current wedding code — set by WeddingApp before children render
const DATA_KEY = (code) => `w:${code || WEDDING}:data`; // shared: one wedding's planning data
const ACCT_KEY = (code) => `w:${code || WEDDING}:accounts`; // shared: one wedding's role passcodes
const META_KEY = (code) => `w:${code || WEDDING}:meta`; // shared: wedding registration record
const SESSION_KEY = "wedding-planner:session"; // personal: who is logged in on this device
const WEDDING_KEY = "wedding-planner:wedding"; // personal: last-opened wedding code on this device

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const RM = (n) =>
  new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", minimumFractionDigits: 2 }).format(
    Number(n) || 0
  );
const num = (v) => (v === "" || v === null || isNaN(Number(v)) ? 0 : Number(v));

// lightweight scramble so passcodes aren't stored as plain text (not real security)
const scramble = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return "h" + h.toString(36);
};

// pastel wedding palette: blush ivory, sage, champagne gold, dusty rose
const LIGHT = {
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

const DARK = {
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

// mutable palette — swapped in place when the theme changes, then the whole tree re-renders
const C = { ...LIGHT };

const ROLES = {
  bride: { label: "Bride", icon: "🌸", side: null, tabs: ["overview", "guests", "catering", "budget", "todo", "gifts", "dayof", "data"] },
  groom: { label: "Groom", icon: "🤵", side: null, tabs: ["overview", "guests", "catering", "budget", "todo", "gifts", "dayof", "data"] },
  brideAcct: { label: "Bride's Accountant", icon: "📒", side: "bride", tabs: ["overview", "guests", "gifts", "dayof"] },
  groomAcct: { label: "Groom's Accountant", icon: "📗", side: "groom", tabs: ["overview", "guests", "gifts", "dayof"] },
};

const EMPTY = {
  settings: { couple: "", date: "" },
  events: [],
  guests: [],
  caterers: [],
  budget: [],
  extraGifts: [],
  todos: [],
  bufferPct: 10,
};

// a guest with no event tags is invited to everything (the default)
const guestInEvent = (g, evId) => !evId || !g.events || g.events.length === 0 || g.events.includes(evId);

// "Nathan Mama, Vicky Mami; Prabhu" -> ["Nathan Mama", "Vicky Mami", "Prabhu"]
const parseMembers = (s) => (s || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

// members were once plain name strings; now they're { name, type: "adult"|"baby" }
const asMember = (m) => (typeof m === "string" ? { name: m, type: "adult" } : { type: "adult", ...m });
const membersOf = (g) => (g.members || []).map(asMember).filter((m) => m.name && m.name.trim());
const babyCount = (list) => list.filter((m) => m.type === "baby").length;

// vegetarian meals needed for one invite (babies don't get a meal)
const vegOf = (g) => {
  const mm = membersOf(g);
  if (mm.length) {
    const coming = g.rsvp === "yes" && Array.isArray(g.confirmedMembers) ? mm.filter((m) => g.confirmedMembers.includes(m.name)) : mm;
    return coming.filter((m) => m.diet === "veg" && m.type !== "baby").length;
  }
  return num(g.confirmedVeg);
};

const GROUP_PRESETS = [
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

const defaultEvents = (settings) => [{ id: "ev-" + uid(), name: "Wedding Day", icon: "💒", date: (settings && settings.date) || "" }];

const DEFAULT_TEMPLATE = `Dear {name} 💕

We're getting married! 💍

{couple} warmly invite you ({pax} pax) to celebrate our wedding on {date}.

{location}

Kindly let us know if you can make it — just tap the link below to RSVP:
{rsvp}

With love,
{couple}`;

// build a personalised message for one guest
function buildInviteMessage(template, g, settings) {
  const dateStr = settings.date
    ? new Date(settings.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "(date to be announced)";
  const rsvpLink = `${location.origin}${location.pathname}?w=${WEDDING}&p=rsvp`;
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
function waNumber(phone) {
  let d = (phone || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "60" + d.slice(1);
  return d;
}

function waLink(phone, msg) {
  const n = waNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
}

const serif = { fontFamily: "'Cormorant Garamond', Georgia, 'Times New Roman', serif" };

// ---------- small ui pieces ----------
function Field({ label, children, className = "" }) {
  return (
    <label className={"flex flex-col gap-1 " + className}>
      <span className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>
        {label}
      </span>
      {children}
    </label>
  );
}

// one row per family member: name box + adult/baby selector, with add/remove
function MemberRows({ members, onChange }) {
  const rows = members;
  const set = (i, p) => onChange(rows.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const removeRow = (i) => onChange(rows.filter((_, j) => j !== i));
  return (
    <div className="grid gap-2">
      {rows.map((m, i) => (
        <div key={i} className="flex gap-2 items-center flex-wrap">
          <input
            style={{ ...inputStyle, width: 220 }}
            value={m.name}
            placeholder={`Member ${i + 1} — name`}
            onChange={(e) => set(i, { name: e.target.value })}
          />
          <select style={{ ...inputStyle, width: 110 }} value={m.type || "adult"} onChange={(e) => set(i, { type: e.target.value })}>
            <option value="adult">Adult</option>
            <option value="baby">Baby 👶</option>
          </select>
          {(m.type || "adult") !== "baby" && (
            <select style={{ ...inputStyle, width: 140 }} value={m.diet || "non"} onChange={(e) => set(i, { diet: e.target.value })}>
              <option value="non">Non-vegetarian</option>
              <option value="veg">Vegetarian 🥗</option>
            </select>
          )}
          <Btn kind="danger" small onClick={() => removeRow(i)}>
            ✕
          </Btn>
        </div>
      ))}
      <div>
        <Btn kind="ghost" small onClick={() => onChange([...rows, { name: "", type: "adult" }])}>
          ＋ Add member
        </Btn>
      </div>
    </div>
  );
}

// styled group picker: preset + existing groups in a normal select, with an "Other" escape hatch for custom tags
function GroupSelect({ value, options, onChange }) {
  const [custom, setCustom] = useState(() => value !== "" && !options.includes(value));
  const showCustom = custom || (value !== "" && !options.includes(value));
  return (
    <div className="flex gap-2 items-center flex-wrap" style={{ width: "100%" }}>
      <select
        style={{ ...inputStyle, width: showCustom ? 150 : "100%", minWidth: 130, flex: showCustom ? "0 0 auto" : "1" }}
        value={showCustom ? "__other__" : value}
        onChange={(e) => {
          if (e.target.value === "__other__") {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">— no group —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__other__">✏️ Other — type my own…</option>
      </select>
      {showCustom && (
        <input
          style={{ ...inputStyle, flex: 1, minWidth: 150 }}
          value={value}
          autoFocus
          placeholder="Your own tag, e.g. Pastors from FGA (use / to nest)"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

const inputStyle = {
  get border() {
    return `1px solid ${C.line}`;
  },
  get background() {
    return C.soft;
  },
  get color() {
    return C.ink;
  },
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  outline: "none",
  width: "100%",
};

function Btn({ children, onClick, kind = "primary", small, type = "button", disabled }) {
  const base = {
    borderRadius: 8,
    padding: small ? "5px 10px" : "9px 16px",
    fontSize: small ? 12 : 14,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    border: "1px solid transparent",
    transition: "opacity .15s",
  };
  const kinds = {
    primary: { background: C.green, color: C.onGreen },
    gold: { background: C.gold, color: C.onGold },
    ghost: { background: "transparent", color: C.green, border: `1px solid ${C.line}` },
    danger: { background: "transparent", color: C.red, border: `1px solid ${C.line}` },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...kinds[kind] }}>
      {children}
    </button>
  );
}

function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: { background: C.neutral, color: C.muted },
    green: { background: C.greenSoft, color: C.green },
    gold: { background: C.goldSoft, color: C.gold },
    red: { background: C.redSoft, color: C.red },
  };
  return (
    <span
      className="text-xs font-semibold"
      style={{ ...tones[tone], borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}
    >
      {children}
    </span>
  );
}

function Card({ children, className = "", style = {} }) {
  return (
    <div
      className={className}
      style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, ...style }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <Card style={{ padding: 16 }}>
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>
        {label}
      </div>
      <div className="text-2xl" style={{ ...serif, color: tone || C.ink, fontWeight: 600 }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: C.muted }}>
          {sub}
        </div>
      )}
    </Card>
  );
}

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Jost:wght@400;500;600&display=swap');
    html, body { background: ${C.ivory}; margin: 0; }
    body {
      font-family: 'Jost', system-ui, sans-serif;
      padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    }
    input:focus, select:focus, textarea:focus { border-color: ${C.gold} !important; }
    /* 16px stops iOS Safari zooming into focused fields */
    @media (max-width: 640px) { input, select, textarea { font-size: 16px !important; } }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  `}</style>
);

// soft abstract backdrop for the guest-facing pages: blurred pastel washes,
// faint interlocked rings, and a floral motif — all behind the content
function Ornaments() {
  const blob = (key, style) => (
    <div
      key={key}
      style={{
        position: "fixed",
        borderRadius: "50%",
        filter: "blur(70px)",
        pointerEvents: "none",
        zIndex: 0,
        ...style,
      }}
    />
  );
  return (
    <>
      {blob("b1", { width: 360, height: 360, top: -100, left: -120, background: C.goldSoft, opacity: 0.8 })}
      {blob("b2", { width: 320, height: 320, bottom: -80, right: -100, background: C.greenSoft, opacity: 0.8 })}
      {blob("b3", { width: 240, height: 240, top: "38%", right: -130, background: C.redSoft, opacity: 0.7 })}
      {blob("b4", { width: 200, height: 200, bottom: "30%", left: -120, background: C.goldSoft, opacity: 0.55 })}
      <svg
        width="230"
        height="150"
        viewBox="0 0 230 150"
        style={{ position: "fixed", top: 20, right: 26, opacity: 0.16, pointerEvents: "none", zIndex: 0 }}
      >
        <circle cx="90" cy="75" r="54" fill="none" stroke={C.gold} strokeWidth="2.5" />
        <circle cx="140" cy="75" r="54" fill="none" stroke={C.gold} strokeWidth="2.5" />
        <path d="M140 21 l7 -10 M140 21 l-7 -10 M140 21 l0 -13" stroke={C.gold} strokeWidth="2" fill="none" />
      </svg>
      <svg
        width="170"
        height="170"
        viewBox="0 0 100 100"
        style={{ position: "fixed", bottom: 18, left: 20, opacity: 0.14, pointerEvents: "none", zIndex: 0 }}
      >
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse
            key={a}
            cx="50"
            cy="30"
            rx="11"
            ry="20"
            fill="none"
            stroke={C.gold}
            strokeWidth="2"
            transform={`rotate(${a} 50 50)`}
          />
        ))}
        <circle cx="50" cy="50" r="6" fill="none" stroke={C.gold} strokeWidth="2" />
      </svg>
    </>
  );
}

// ---------- root: session gate ----------
export default function WeddingApp() {
  const [wedding, setWedding] = useState(undefined); // undefined = checking, null = none picked yet
  const [session, setSession] = useState(undefined); // undefined = checking, null = logged out
  const [theme, setTheme] = useState("light");
  const [guestMode, setGuestMode] = useState(null); // null | "checkin" | "rsvp"
  const [guestLock, setGuestLock] = useState(false); // true when opened via a ?p= link — kiosk mode, no way out
  const [adminMode, setAdminMode] = useState(false);

  // swap the palette in place before children render
  Object.assign(C, theme === "dark" ? DARK : LIGHT);
  WEDDING = wedding || null;

  // keep the phone status-bar colour in step with the theme
  useEffect(() => {
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", theme === "dark" ? "#1B1917" : "#FAF5F1");
  }, [theme]);

  useEffect(() => {
    (async () => {
      try {
        const t = await window.storage.get("wedding-planner:theme");
        if (t && (t.value === "dark" || t.value === "light")) setTheme(t.value);
      } catch (e) {}
      // which wedding? URL ?w=code wins, else the last one opened on this device
      let w = null;
      try {
        const params = new URL(window.location.href).searchParams;
        const qw = (params.get("w") || "").trim().toLowerCase();
        if (qw) {
          w = qw;
          await window.storage.set(WEDDING_KEY, qw);
        } else {
          const r = await window.storage.get(WEDDING_KEY);
          w = r && r.value ? r.value : null;
        }
        // ?p=rsvp or ?p=checkin locks the page to that guest function (kiosk mode)
        const p = (params.get("p") || "").toLowerCase();
        if (w && (p === "rsvp" || p === "checkin")) {
          setGuestMode(p);
          setGuestLock(true);
        }
      } catch (e) {
        w = null;
      }
      let s = null;
      try {
        const r = await window.storage.get(SESSION_KEY);
        s = r && r.value ? JSON.parse(r.value) : null;
      } catch (e) {}
      // a saved session only counts for the wedding it belongs to
      if (!(s && ROLES[s.role] && s.wedding && s.wedding === w)) s = null;
      setWedding(w);
      setSession(s);
    })();
  }, []);

  const toggleTheme = async () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      await window.storage.set("wedding-planner:theme", next);
    } catch (e) {}
  };

  const openWedding = async (code) => {
    try {
      await window.storage.set(WEDDING_KEY, code);
    } catch (e) {}
    setSession(null);
    setWedding(code);
  };

  const switchWedding = async () => {
    try {
      await window.storage.delete(WEDDING_KEY);
      await window.storage.delete(SESSION_KEY);
    } catch (e) {}
    setSession(null);
    setWedding(null);
  };

  // master control: jump straight into a wedding with full (couple-level) access
  const enterWedding = async (code) => {
    const s = { role: "bride", wedding: code, at: Date.now() };
    try {
      await window.storage.set(WEDDING_KEY, code);
      await window.storage.set(SESSION_KEY, JSON.stringify(s));
    } catch (e) {}
    setAdminMode(false);
    setWedding(code);
    setSession(s);
  };

  const login = async (role) => {
    const s = { role, wedding, at: Date.now() };
    setSession(s);
    try {
      await window.storage.set(SESSION_KEY, JSON.stringify(s));
    } catch (e) {}
  };

  const logout = async () => {
    setSession(null);
    try {
      await window.storage.delete(SESSION_KEY);
    } catch (e) {}
  };

  if (wedding === undefined || session === undefined)
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.ivory, color: C.muted, colorScheme: theme }}>
        <GlobalStyle />
        Checking who's at the door…
      </div>
    );

  if (adminMode)
    return <AdminPanel onExit={() => setAdminMode(false)} onEnter={enterWedding} theme={theme} toggleTheme={toggleTheme} />;
  if (!wedding) return <WeddingGate onOpen={openWedding} theme={theme} toggleTheme={toggleTheme} onAdmin={() => setAdminMode(true)} />;
  if (guestMode === "checkin") return <GuestCheckIn onBack={() => setGuestMode(null)} theme={theme} locked={guestLock} />;
  if (guestMode === "rsvp") return <GuestRSVP onBack={() => setGuestMode(null)} theme={theme} locked={guestLock} />;
  if (!session)
    return <Login onLogin={login} theme={theme} toggleTheme={toggleTheme} onSwitch={switchWedding} wedding={wedding} />;
  return <Planner role={session.role} onLogout={logout} theme={theme} toggleTheme={toggleTheme} wedding={wedding} />;
}

// ---------- admin: master control ----------
// credentials are stored as scramble() hashes, never as plain text
const ADMIN_USER_HASH = "h1tn8uad";
const ADMIN_PASS_HASH = "hum8c2x";

function AdminPanel({ onExit, onEnter, theme, toggleTheme }) {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [list, setList] = useState(null);
  const [detail, setDetail] = useState({}); // code -> { loading | data | error }

  const loginAdmin = () => {
    if (scramble(user.trim()) === ADMIN_USER_HASH && scramble(pass) === ADMIN_PASS_HASH) {
      setAuthed(true);
      setErr("");
    } else {
      setErr("Wrong username or password.");
    }
  };

  useEffect(() => {
    if (!authed) return;
    (async () => {
      try {
        const r = await window.storage.get("registry", true);
        const l = r && r.value ? JSON.parse(r.value) : [];
        setList(l.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      } catch (e) {
        setList([]);
      }
    })();
  }, [authed]);

  const loadDetail = async (code) => {
    setDetail((d) => ({ ...d, [code]: { loading: true } }));
    try {
      const r = await window.storage.get(DATA_KEY(code), true);
      let lastActive = null;
      try {
        if (window.storage.getUpdatedAt) lastActive = await window.storage.getUpdatedAt(DATA_KEY(code));
      } catch (e) {}
      setDetail((d) => ({ ...d, [code]: { data: r && r.value ? JSON.parse(r.value) : null, lastActive } }));
    } catch (e) {
      setDetail((d) => ({ ...d, [code]: { error: true } }));
    }
  };

  const saveRegistry = async (next) => {
    await window.storage.set("registry", JSON.stringify(next), true);
    setList(next.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  };

  const setArchived = async (code, archived) => {
    try {
      await saveRegistry(list.map((x) => (x.code === code ? { ...x, archived } : x)));
    } catch (e) {}
  };

  const [confirmDelete, setConfirmDelete] = useState(null); // code awaiting confirmation
  const [busyDelete, setBusyDelete] = useState(false);

  const doDelete = async (code) => {
    setBusyDelete(true);
    try {
      await window.storage.delete(DATA_KEY(code), true);
      await window.storage.delete(ACCT_KEY(code), true);
      await window.storage.delete(META_KEY(code), true);
      await saveRegistry(list.filter((x) => x.code !== code));
      setDetail((d) => ({ ...d, [code]: undefined }));
      setConfirmDelete(null);
    } catch (e) {}
    setBusyDelete(false);
  };

  const exportWedding = async (code) => {
    try {
      const r = await window.storage.get(DATA_KEY(code), true);
      if (r && r.value) downloadBlob(r.value, `wedding-${code}-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    } catch (e) {}
  };

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: C.ivory, color: C.ink, colorScheme: theme }}>
      <GlobalStyle />
      <div className="w-full max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div style={{ ...serif, fontSize: 28, fontWeight: 600 }}>🛡️ Master control</div>
          <div className="flex gap-2">
            <Btn kind="ghost" small onClick={toggleTheme}>
              {theme === "dark" ? "☀️" : "🌙"}
            </Btn>
            <Btn kind="ghost" small onClick={onExit}>
              Exit
            </Btn>
          </div>
        </div>

        {!authed ? (
          <Card className="max-w-md mx-auto">
            <div className="text-sm font-semibold mb-2">Admin sign-in</div>
            <Field label="Username" className="mb-2">
              <input style={inputStyle} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Password">
              <input
                style={inputStyle}
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loginAdmin()}
              />
            </Field>
            {err && (
              <div className="text-xs mt-2" style={{ color: C.red }}>
                {err}
              </div>
            )}
            <div className="mt-3">
              <Btn onClick={loginAdmin}>Sign in</Btn>
            </div>
          </Card>
        ) : !list ? (
          <Card>
            <span style={{ color: C.muted }}>Loading weddings…</span>
          </Card>
        ) : (
          <div className="grid gap-3">
            <Card style={{ padding: 14 }}>
              <span className="text-sm" style={{ color: C.muted }}>
                {list.length} wedding{list.length === 1 ? "" : "s"} registered on your app.
              </span>
            </Card>
            {list
              .slice()
              .sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0))
              .map((w) => {
                const d = detail[w.code];
                const stats = d && d.data ? computeStats(d.data, null) : null;
                return (
                  <Card key={w.code} style={{ padding: 14, opacity: w.archived ? 0.6 : 1 }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{w.couple || "(unnamed couple)"}</span>
                      <Pill tone="gold">🔑 {w.code}</Pill>
                      {w.archived && <Pill>📦 Archived</Pill>}
                      {w.createdAt && (
                        <span className="text-xs" style={{ color: C.muted }}>
                          registered {new Date(w.createdAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      )}
                      <div className="ml-auto flex gap-2 flex-wrap">
                        {!d && (
                          <Btn kind="ghost" small onClick={() => loadDetail(w.code)}>
                            View details
                          </Btn>
                        )}
                        <Btn kind="ghost" small onClick={() => exportWedding(w.code)}>
                          ⬇ Backup
                        </Btn>
                        <Btn kind="ghost" small onClick={() => setArchived(w.code, !w.archived)}>
                          {w.archived ? "Unarchive" : "📦 Archive"}
                        </Btn>
                        <Btn kind="danger" small onClick={() => setConfirmDelete(w.code)}>
                          Delete
                        </Btn>
                        <Btn small onClick={() => onEnter(w.code)}>
                          Open with full access
                        </Btn>
                      </div>
                    </div>
                    {confirmDelete === w.code && (
                      <div className="p-3 mt-2" style={{ background: C.redSoft, border: `1px solid ${C.red}`, borderRadius: 10 }}>
                        <div className="text-sm font-semibold" style={{ color: C.red }}>
                          Permanently delete "{w.couple || w.code}"?
                        </div>
                        <div className="text-xs mt-1" style={{ color: C.muted }}>
                          This erases the wedding's guests, budget, gifts, and passcodes for everyone. Download a backup
                          first if in doubt. This cannot be undone.
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Btn small onClick={() => doDelete(w.code)} disabled={busyDelete}>
                            {busyDelete ? "Deleting…" : "Yes, delete forever"}
                          </Btn>
                          <Btn kind="ghost" small onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </Btn>
                        </div>
                      </div>
                    )}
                    {d && d.loading && (
                      <div className="text-xs mt-2" style={{ color: C.muted }}>
                        Loading…
                      </div>
                    )}
                    {d && d.error && (
                      <div className="text-xs mt-2" style={{ color: C.red }}>
                        Couldn't load this wedding's data.
                      </div>
                    )}
                    {stats && d.data && (
                      <div className="flex flex-wrap gap-4 mt-3 text-sm">
                        <span>
                          📅 <b>{d.data.settings.date || "no date set"}</b>
                        </span>
                        <span>
                          👥 <b>{stats.guestCount}</b> invites · <b>{stats.invitedPax}</b> pax
                        </span>
                        <span>
                          ✅ <b>{stats.confirmedPax}</b> confirmed · {stats.pending} pending
                        </span>
                        <span>
                          💰 budget <b>{RM(stats.actual)}</b> ({RM(stats.paidOut)} paid)
                        </span>
                        <span>
                          💝 gifts <b>{RM(stats.gifts)}</b>
                        </span>
                        {d.lastActive && (
                          <span>
                            🕐 last activity{" "}
                            <b>{new Date(d.lastActive).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</b>
                          </span>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- wedding gate: create a new wedding or open an existing one ----------
function WeddingGate({ onOpen, theme, toggleTheme, onAdmin }) {
  const [mode, setMode] = useState("open"); // open | create
  const [code, setCode] = useState("");
  const [couple, setCouple] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const norm = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

  const open = async () => {
    setErr("");
    const c = norm(code);
    if (!c) return setErr("Enter your wedding code.");
    setBusy(true);
    try {
      const r = await window.storage.get(META_KEY(c), true);
      if (!r || !r.value) {
        setErr("No wedding found with that code — check the spelling, or create a new one.");
      } else {
        onOpen(c);
      }
    } catch (e) {
      setErr("Couldn't reach the database — check your connection and try again.");
    }
    setBusy(false);
  };

  const create = async () => {
    setErr("");
    const c = norm(code);
    if (!couple.trim()) return setErr("Enter your names first.");
    if (c.length < 4) return setErr("Choose a wedding code of at least 4 characters — letters, numbers and dashes.");
    setBusy(true);
    try {
      const r = await window.storage.get(META_KEY(c), true);
      if (r && r.value) {
        setErr("That wedding code is already taken — pick another.");
        setBusy(false);
        return;
      }
      await window.storage.set(META_KEY(c), JSON.stringify({ couple: couple.trim(), createdAt: Date.now() }), true);
      const seed = { ...EMPTY, settings: { ...EMPTY.settings, couple: couple.trim() } };
      seed.events = defaultEvents(seed.settings);
      await window.storage.set(DATA_KEY(c), JSON.stringify(seed), true);
      // record the new wedding in the app-wide registry (used by master control)
      try {
        const reg = await window.storage.get("registry", true);
        const list = reg && reg.value ? JSON.parse(reg.value) : [];
        if (!list.some((x) => x.code === c)) list.push({ code: c, couple: couple.trim(), createdAt: Date.now() });
        await window.storage.set("registry", JSON.stringify(list), true);
      } catch (e) {}
      onOpen(c);
    } catch (e) {
      setErr("Couldn't create the wedding — try again.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: C.ivory, color: C.ink, colorScheme: theme }}>
      <GlobalStyle />
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-2">
          <Btn kind="ghost" small onClick={toggleTheme}>
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </Btn>
        </div>
        <div className="text-center mb-6">
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: C.gold }}>
            ❦ &nbsp;Wedding Book&nbsp; ❦
          </div>
          <div style={{ ...serif, fontSize: 32, fontWeight: 600 }}>Your wedding, your book</div>
          <p className="text-sm mt-1" style={{ color: C.muted }}>
            Every couple gets their own private space. Open yours with your wedding code, or start a new one.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {[["open", "🔑 I have a code"], ["create", "✨ New wedding"]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setMode(k);
                setErr("");
              }}
              style={{
                background: mode === k ? C.greenSoft : C.card,
                border: `1px solid ${mode === k ? C.green : C.line}`,
                borderRadius: 12,
                padding: "14px 10px",
                cursor: "pointer",
                fontWeight: 600,
                color: mode === k ? C.green : C.ink,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <Card>
          {mode === "create" && (
            <div className="mb-3">
              <Field label="Your names">
                <input style={inputStyle} value={couple} onChange={(e) => setCouple(e.target.value)} placeholder="e.g. Aaron & Joan" />
              </Field>
            </div>
          )}
          <Field label={mode === "create" ? "Choose a wedding code" : "Wedding code"}>
            <input
              style={inputStyle}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={mode === "create" ? "e.g. aaron-joan-2026" : "the code the couple shared with you"}
              onKeyDown={(e) => e.key === "Enter" && (mode === "create" ? create() : open())}
            />
          </Field>
          {mode === "create" && (
            <p className="text-xs mt-2" style={{ color: C.muted }}>
              The code is how you and your team find your wedding — like a room name. Letters, numbers and dashes
              only. Share it only with people who should see your planning data.
            </p>
          )}
          {err && (
            <div className="text-xs mt-2" style={{ color: C.red }}>
              {err}
            </div>
          )}
          <div className="mt-3">
            <Btn onClick={mode === "create" ? create : open} disabled={busy}>
              {busy ? "Checking…" : mode === "create" ? "Create wedding" : "Open wedding"}
            </Btn>
          </div>
        </Card>

        <p className="text-xs text-center mt-4">
          <button
            onClick={onAdmin}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", textDecoration: "underline" }}
          >
            Admin
          </button>
        </p>
      </div>
    </div>
  );
}

// ---------- login screen ----------
function Login({ onLogin, theme, toggleTheme, onSwitch, wedding }) {
  const [accounts, setAccounts] = useState(null); // {role: scrambledCode}
  const [picked, setPicked] = useState(null);
  const [code, setCode] = useState("");
  const [code2, setCode2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(ACCT_KEY(), true);
        setAccounts(r && r.value ? JSON.parse(r.value) : {});
      } catch (e) {
        setAccounts({});
      }
    })();
  }, []);

  const isNew = picked && accounts && !accounts[picked];

  const submit = async () => {
    setErr("");
    if (!code.trim()) return setErr("Enter a passcode.");
    if (isNew) {
      if (code.length < 4) return setErr("Use at least 4 characters.");
      if (code !== code2) return setErr("Passcodes don't match.");
      setBusy(true);
      const next = { ...accounts, [picked]: scramble(code) };
      try {
        await window.storage.set(ACCT_KEY(), JSON.stringify(next), true);
        setAccounts(next);
        onLogin(picked);
      } catch (e) {
        setErr("Couldn't save the passcode. Try again.");
      }
      setBusy(false);
    } else {
      if (scramble(code) === accounts[picked]) onLogin(picked);
      else setErr("Wrong passcode for this role.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: C.ivory, color: C.ink, colorScheme: theme }}>
      <GlobalStyle />
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-2">
          <Btn kind="ghost" small onClick={toggleTheme}>
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </Btn>
        </div>
        <div className="text-center mb-6">
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: C.gold }}>
            ❦ &nbsp;Wedding Book&nbsp; ❦
          </div>
          <div style={{ ...serif, fontSize: 32, fontWeight: 600 }}>Who's signing in?</div>
          <p className="text-sm mt-1" style={{ color: C.muted }}>
            The couple sees everything. Accountants manage their side's guest list and gift money.
          </p>
          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            <Pill tone="gold">🔑 {wedding}</Pill>
            <Btn kind="ghost" small onClick={onSwitch}>
              Switch wedding
            </Btn>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {Object.entries(ROLES).map(([k, r]) => (
            <button
              key={k}
              onClick={() => {
                setPicked(k);
                setCode("");
                setCode2("");
                setErr("");
              }}
              style={{
                background: picked === k ? C.greenSoft : C.card,
                border: `1px solid ${picked === k ? C.green : C.line}`,
                borderRadius: 12,
                padding: "16px 10px",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 26 }}>{r.icon}</div>
              <div className="text-sm font-semibold mt-1">{r.label}</div>
              {accounts && !accounts[k] && (
                <div className="text-xs mt-1" style={{ color: C.gold }}>
                  first sign-in
                </div>
              )}
            </button>
          ))}
        </div>

        {picked && accounts && (
          <Card>
            <div className="text-sm font-semibold mb-2">
              {isNew ? `Create a passcode for ${ROLES[picked].label}` : `Passcode for ${ROLES[picked].label}`}
            </div>
            <input
              style={inputStyle}
              type="password"
              value={code}
              placeholder={isNew ? "Choose a passcode (min. 4 characters)" : "Enter passcode"}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isNew && submit()}
            />
            {isNew && (
              <input
                style={{ ...inputStyle, marginTop: 8 }}
                type="password"
                value={code2}
                placeholder="Repeat passcode"
                onChange={(e) => setCode2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            )}
            {err && (
              <div className="text-xs mt-2" style={{ color: C.red }}>
                {err}
              </div>
            )}
            <div className="mt-3">
              <Btn onClick={submit} disabled={busy}>
                {isNew ? "Set passcode & enter" : "Sign in"}
              </Btn>
            </div>
          </Card>
        )}

        <p className="text-xs text-center mt-4" style={{ color: C.muted }}>
          Wedding data is shared between everyone who signs in to this app. Passcodes are a light lock to keep roles
          tidy — don't reuse a password you use elsewhere.
        </p>
      </div>
    </div>
  );
}

// ---------- guest check-in kiosk ----------
function GuestCheckIn({ onBack, theme, locked }) {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState(null);
  const [pax, setPax] = useState("");
  const [babies, setBabies] = useState("");
  const [checkedMembers, setCheckedMembers] = useState([]);
  const [giftIntent, setGiftIntent] = useState(null); // null | "yes" | "no"
  const [method, setMethod] = useState(null); // "cash" | "qr"
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(DATA_KEY(), true);
        setData(r && r.value ? JSON.parse(r.value) : { ...EMPTY });
      } catch (e) {
        setData({ ...EMPTY });
      }
    })();
  }, []);

  const settings = (data && data.settings) || {};
  const guests = (data && data.guests) || [];
  const q = search.trim().toLowerCase();
  const matches =
    q.length >= 2
      ? guests
          .filter(
            (g) => g.name.toLowerCase().includes(q) || membersOf(g).some((m) => m.name.toLowerCase().includes(q))
          )
          .slice(0, 8)
      : [];

  const pick = (g) => {
    setSel(g);
    setPax(String(num(g.confirmedPax || g.invitedPax) || 1));
    setBabies(String(g.confirmedBabies === "" || g.confirmedBabies === undefined ? num(g.invitedBabies) : num(g.confirmedBabies)));
    const mm = membersOf(g);
    const names = mm.map((m) => m.name);
    const start = g.rsvp === "yes" && Array.isArray(g.confirmedMembers) ? g.confirmedMembers.filter((x) => names.includes(x)) : [...names];
    setCheckedMembers(start);
    if (names.length) {
      setPax(String(start.length || 1));
      setBabies(String(babyCount(mm.filter((x) => start.includes(x.name)))));
    }
    setGiftIntent(null);
    setMethod(null);
    setAmount("");
    setErr("");
  };

  const choiceBtn = (active) => ({
    flex: "1 1 auto",
    padding: "12px 20px",
    borderRadius: 14,
    fontWeight: 600,
    fontSize: 15,
    cursor: "pointer",
    border: `1.5px solid ${active ? C.green : C.line}`,
    background: active ? C.greenSoft : C.card,
    color: active ? C.green : C.muted,
    transition: "all .15s",
  });

  const cardStyle = {
    borderRadius: 18,
    padding: 24,
    borderTop: `3px solid ${C.gold}`,
    boxShadow: "0 16px 48px rgba(34, 48, 31, 0.12)",
  };

  const sectionLabel = { color: C.gold, letterSpacing: 2, fontSize: 11, fontWeight: 700, textTransform: "uppercase" };

  const dateStr = settings.date
    ? new Date(settings.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  const submit = async () => {
    if (!sel) return;
    setBusy(true);
    setErr("");
    try {
      // re-read the latest shared data so we don't overwrite other people's edits
      const r = await window.storage.get(DATA_KEY(), true);
      const fresh = r && r.value ? JSON.parse(r.value) : { ...EMPTY };
      fresh.guests = (fresh.guests || []).map((g) =>
        g.id === sel.id
          ? {
              ...g,
              checkedInAt: Date.now(),
              checkedInPax: num(pax) || 1,
              checkedInBabies: Math.min(num(babies), num(pax) || 1),
              ...(membersOf(sel).length > 0 ? { checkedInMembers: checkedMembers } : {}),
              pledgeAmount: giftIntent === "yes" ? num(amount) : 0,
              pledgeMethod: giftIntent === "yes" ? method || "cash" : "",
            }
          : g
      );
      await window.storage.set(DATA_KEY(), JSON.stringify(fresh), true);
      setDone(true);
    } catch (e) {
      setErr("Couldn't save your check-in — please try again, or find one of the ushers.");
    }
    setBusy(false);
  };

  const qrBlock = settings.qrImage ? (
    <div className="text-center mt-3">
      <img
        src={settings.qrImage}
        alt="Payment QR"
        style={{ maxWidth: 260, width: "100%", borderRadius: 12, border: `1px solid ${C.line}`, margin: "0 auto", background: "#fff", padding: 8 }}
      />
      <p className="text-xs mt-2" style={{ color: C.muted }}>
        Scan with your banking app to transfer{num(amount) > 0 ? ` ${RM(amount)}` : ""}. Thank you! 💛
      </p>
    </div>
  ) : (
    <p className="text-sm mt-3" style={{ color: C.gold }}>
      The QR code isn't set up yet — the ushers can help, or you can give cash at the gift box. 💛
    </p>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: C.ivory, color: C.ink, colorScheme: theme }}>
      <GlobalStyle />
      <Ornaments />
      <div className="w-full max-w-md" style={{ position: "relative", zIndex: 1 }}>
        <div className="text-center mb-7">
          <div style={{ color: C.gold, fontSize: 20, letterSpacing: 8 }}>✿&nbsp;❦&nbsp;✿</div>
          <div className="text-xs uppercase mt-3" style={{ color: C.muted, letterSpacing: 5 }}>
            The wedding of
          </div>
          <div style={{ ...serif, fontSize: 40, fontWeight: 700, lineHeight: 1.15, color: C.ink }}>
            {settings.couple || "Our Wedding"}
          </div>
          {dateStr && (
            <div className="flex items-center justify-center gap-3 mt-3">
              <span style={{ width: 44, borderTop: `1px solid ${C.gold}`, display: "inline-block" }} />
              <span style={{ ...serif, fontStyle: "italic", fontSize: 16, color: C.gold }}>{dateStr}</span>
              <span style={{ width: 44, borderTop: `1px solid ${C.gold}`, display: "inline-block" }} />
            </div>
          )}
          <div style={{ ...serif, fontSize: 22, fontWeight: 600, marginTop: 16, color: C.ink }}>
            Guest check-in
          </div>
        </div>

        {!data ? (
          <Card style={cardStyle}>
            <span style={{ color: C.muted }}>Loading the guest book…</span>
          </Card>
        ) : done ? (
          <Card style={cardStyle}>
            <div className="text-center">
              <div style={{ fontSize: 44, lineHeight: 1 }}>🎉</div>
              <div style={{ ...serif, fontSize: 26, fontWeight: 700, marginTop: 10 }}>You're checked in!</div>
            </div>
            <p className="text-sm mt-2 text-center" style={{ color: C.muted }}>
              {sel.name} · {num(pax)} pax{num(babies) > 0 ? ` (${num(babies)} 👶)` : ""}
              {giftIntent === "yes" && num(amount) > 0 ? ` · gift ${RM(amount)} (${method === "qr" ? "QR" : "cash"})` : ""}
            </p>
            <div className="mt-3 p-3" style={{ background: C.goldSoft, border: `1px solid ${C.gold}`, borderRadius: 10 }}>
              <div className="text-sm font-semibold" style={{ color: C.gold }}>
                🎗️ Please collect {num(pax) > 1 ? `your ${num(pax)} wrist bands` : "your wrist band"} from the usher
              </div>
              <div className="text-xs mt-1" style={{ color: C.muted }}>
                Wrist bands are required to enter the wedding hall — one per person.
              </div>
            </div>
            {giftIntent === "yes" && method === "qr" && qrBlock}
            <p className="text-sm mt-3" style={{ color: C.muted }}>Enjoy the celebration! 🥂</p>
            <div className="mt-4">
              <Btn
                onClick={() => {
                  setDone(false);
                  setSel(null);
                  setSearch("");
                  setPax("");
                  setBabies("");
                  setCheckedMembers([]);
                  setGiftIntent(null);
                  setMethod(null);
                  setAmount("");
                  setErr("");
                }}
              >
                ✓ Done
              </Btn>
            </div>
          </Card>
        ) : !sel ? (
          <Card style={cardStyle}>
            <div className="text-center mb-3" style={{ ...serif, fontSize: 20, fontWeight: 600 }}>
              Find your invitation
            </div>
            <input
              style={{ ...inputStyle, borderRadius: 999, padding: "13px 20px", textAlign: "center", fontSize: 15 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type your name…"
              autoFocus
            />
            <div className="grid gap-2 mt-3">
              {matches.map((g) => (
                <button
                  key={g.id}
                  onClick={() => pick(g)}
                  className="text-left p-3"
                  style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 10, cursor: "pointer", color: C.ink }}
                >
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-xs" style={{ color: C.muted }}>
                    {" "}· {g.invitedPax} pax invited{g.group ? ` · ${g.group}` : ""}
                  </span>
                  {!g.name.toLowerCase().includes(q) && membersOf(g).some((m) => m.name.toLowerCase().includes(q)) && (
                    <span className="text-xs" style={{ color: C.gold }}>
                      {" "}· {membersOf(g).find((m) => m.name.toLowerCase().includes(q)).name} is in this party
                    </span>
                  )}
                  {g.checkedInAt && (
                    <span className="text-xs" style={{ color: C.green }}> · already checked in ✓</span>
                  )}
                </button>
              ))}
              {q.length >= 2 && matches.length === 0 && (
                <span className="text-sm" style={{ color: C.muted }}>
                  No invitation found under that name — please check with the ushers.
                </span>
              )}
            </div>
          </Card>
        ) : (
          <Card style={cardStyle}>
            <div className="flex items-center justify-between">
              <div style={{ ...serif, fontSize: 24, fontWeight: 700 }}>{sel.name}</div>
              <Btn kind="ghost" small onClick={() => setSel(null)}>
                Not you?
              </Btn>
            </div>
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              Invited: {sel.invitedPax} pax{sel.checkedInAt ? " · you've checked in before — this will update it" : ""}
            </p>
            {membersOf(sel).length > 0 ? (
              <div className="mt-4">
                <div className="mb-2" style={sectionLabel}>Who's here? — tap names</div>
                <div className="flex flex-wrap gap-2">
                  {membersOf(sel).map((m) => {
                    const on = checkedMembers.includes(m.name);
                    return (
                      <button
                        key={m.name}
                        onClick={() => {
                          const next = on ? checkedMembers.filter((x) => x !== m.name) : [...checkedMembers, m.name];
                          setCheckedMembers(next);
                          setPax(String(next.length || 1));
                          setBabies(String(babyCount(membersOf(sel).filter((x) => next.includes(x.name)))));
                        }}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 999,
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: "pointer",
                          border: `1px solid ${on ? C.green : C.line}`,
                          background: on ? C.greenSoft : C.card,
                          color: on ? C.green : C.muted,
                          textDecoration: on ? "none" : "line-through",
                        }}
                      >
                        {on ? "✓ " : ""}
                        {m.name}
                        {m.type === "baby" ? " 👶" : ""}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs mt-2" style={{ color: C.muted }}>
                  Here now: <b style={{ color: C.green }}>{checkedMembers.length} pax</b>
                  {num(babies) > 0 ? ` · ${num(babies)} 👶` : ""}
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <div className="flex gap-3 flex-wrap items-end">
                  <Field label="How many of you are here today? (everyone, incl. babies)">
                    <input style={{ ...inputStyle, width: 130 }} type="number" min="1" value={pax} onChange={(e) => setPax(e.target.value)} />
                  </Field>
                  <Field label="…of which babies 👶">
                    <input style={{ ...inputStyle, width: 110 }} type="number" min="0" value={babies} onChange={(e) => setBabies(e.target.value)} />
                  </Field>
                </div>
                <p className="text-xs mt-1" style={{ color: C.muted }}>
                  Please count everyone in the total — babies are noted separately so no seat's worth of food is prepared for them.
                </p>
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2" style={sectionLabel}>Would you like to provide the couple with a monetary gift? 💝</div>
              <div className="flex gap-2">
                {[["yes", "Yes"], ["no", "No"]].map(([k, label]) => (
                  <button key={k} onClick={() => setGiftIntent(k)} style={choiceBtn(giftIntent === k)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {giftIntent === "yes" && (
              <div className="mt-4">
                <div className="mb-2" style={sectionLabel}>How would you like to give?</div>
                <div className="flex gap-2">
                  {[["cash", "💵 Cash"], ["qr", "📱 QR transfer"]].map(([k, label]) => (
                    <button key={k} onClick={() => setMethod(k)} style={choiceBtn(method === k)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <Field label="Amount (RM)">
                    <input style={{ ...inputStyle, width: 140 }} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 200" />
                  </Field>
                </div>
                {method === "qr" && qrBlock}
              </div>
            )}

            {err && (
              <div className="text-xs mt-3" style={{ color: C.red }}>
                {err}
              </div>
            )}
            <div className="mt-5">
              <button
                onClick={submit}
                disabled={busy || !num(pax) || giftIntent === null || (giftIntent === "yes" && (!method || !num(amount)))}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  borderRadius: 999,
                  fontSize: 16,
                  fontWeight: 700,
                  border: "1px solid transparent",
                  cursor:
                    busy || !num(pax) || giftIntent === null || (giftIntent === "yes" && (!method || !num(amount)))
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    busy || !num(pax) || giftIntent === null || (giftIntent === "yes" && (!method || !num(amount)))
                      ? 0.5
                      : 1,
                  background: C.gold,
                  color: C.onGold,
                  transition: "opacity .15s",
                }}
              >
                {busy ? "Saving…" : "Check in ✓"}
              </button>
            </div>
          </Card>
        )}

        {!locked && (
          <p className="text-xs text-center mt-4">
            <button
              onClick={onBack}
              style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", textDecoration: "underline" }}
            >
              Planner sign-in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- guest rsvp by link ----------
function GuestRSVP({ onBack, theme, locked }) {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState(null);
  const [coming, setComing] = useState(null); // null | "yes" | "no"
  const [pax, setPax] = useState("");
  const [babies, setBabies] = useState("");
  const [dietary, setDietary] = useState("");
  const [selMembers, setSelMembers] = useState([]);
  const [memberDiets, setMemberDiets] = useState({}); // name -> "non" | "veg"
  const [vegCount, setVegCount] = useState(""); // for invites without named members
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(DATA_KEY(), true);
        setData(r && r.value ? JSON.parse(r.value) : { ...EMPTY });
      } catch (e) {
        setData({ ...EMPTY });
      }
    })();
  }, []);

  const settings = (data && data.settings) || {};
  const guests = (data && data.guests) || [];
  const q = search.trim().toLowerCase();
  const matches =
    q.length >= 2
      ? guests
          .filter(
            (g) => g.name.toLowerCase().includes(q) || membersOf(g).some((m) => m.name.toLowerCase().includes(q))
          )
          .slice(0, 8)
      : [];

  const dateStr = settings.date
    ? new Date(settings.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "(date to be announced)";

  const pick = (g) => {
    setSel(g);
    setComing(g.rsvp === "yes" ? "yes" : g.rsvp === "no" ? "no" : null);
    setPax(String(num(g.confirmedPax || g.invitedPax) || 1));
    setBabies(String(g.confirmedBabies === "" || g.confirmedBabies === undefined ? num(g.invitedBabies) : num(g.confirmedBabies)));
    setDietary(g.dietary || "");
    const names = membersOf(g).map((m) => m.name);
    setSelMembers(
      Array.isArray(g.confirmedMembers) ? g.confirmedMembers.filter((m) => names.includes(m)) : [...names]
    );
    setMemberDiets(Object.fromEntries(membersOf(g).map((m) => [m.name, m.diet || "non"])));
    setVegCount(String(num(g.confirmedVeg) || 0));
    setErr("");
  };

  const choiceBtn = (active, tone) => ({
    flex: "1 1 auto",
    padding: "13px 20px",
    borderRadius: 14,
    fontWeight: 600,
    fontSize: 15,
    cursor: "pointer",
    border: `1.5px solid ${active ? tone : C.line}`,
    background: active ? (tone === C.green ? C.greenSoft : C.redSoft) : C.card,
    color: active ? tone : C.muted,
    transition: "all .15s",
  });

  const cardStyle = {
    borderRadius: 18,
    padding: 24,
    borderTop: `3px solid ${C.gold}`,
    boxShadow: "0 16px 48px rgba(34, 48, 31, 0.12)",
  };

  const sectionLabel = { color: C.gold, letterSpacing: 2, fontSize: 11, fontWeight: 700, textTransform: "uppercase" };

  const submit = async () => {
    if (!sel || !coming) return;
    setBusy(true);
    setErr("");
    try {
      const r = await window.storage.get(DATA_KEY(), true);
      const fresh = r && r.value ? JSON.parse(r.value) : { ...EMPTY };
      fresh.guests = (fresh.guests || []).map((g) =>
        g.id === sel.id
          ? coming === "yes"
            ? {
                ...g,
                rsvp: "yes",
                confirmedPax: num(pax) || 1,
                confirmedBabies: String(num(babies)),
                dietary: dietary.trim(),
                rsvpAt: Date.now(),
                ...(membersOf(sel).length > 0
                  ? {
                      confirmedMembers: selMembers,
                      members: membersOf(g).map((m) => ({ ...m, diet: memberDiets[m.name] || m.diet || "non" })),
                    }
                  : { confirmedVeg: Math.min(num(vegCount), num(pax) || 1) }),
              }
            : { ...g, rsvp: "no", confirmedPax: "", confirmedBabies: "", rsvpAt: Date.now() }
          : g
      );
      await window.storage.set(DATA_KEY(), JSON.stringify(fresh), true);
      setDone(true);
    } catch (e) {
      setErr("Couldn't save your reply — please try again, or message the couple directly.");
    }
    setBusy(false);
  };

  const reset = () => {
    setDone(false);
    setSel(null);
    setSearch("");
    setComing(null);
    setPax("");
    setBabies("");
    setDietary("");
    setErr("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: C.ivory, color: C.ink, colorScheme: theme }}>
      <GlobalStyle />
      <Ornaments />
      <div className="w-full max-w-md" style={{ position: "relative", zIndex: 1 }}>
        <div className="text-center mb-7">
          <div style={{ color: C.gold, fontSize: 20, letterSpacing: 8 }}>✿&nbsp;❦&nbsp;✿</div>
          <div className="text-xs uppercase mt-3" style={{ color: C.muted, letterSpacing: 5 }}>
            The wedding of
          </div>
          <div style={{ ...serif, fontSize: 40, fontWeight: 700, lineHeight: 1.15, color: C.ink }}>
            {settings.couple || "Our Wedding"}
          </div>
          <div className="flex items-center justify-center gap-3 mt-3">
            <span style={{ width: 44, borderTop: `1px solid ${C.gold}`, display: "inline-block" }} />
            <span style={{ ...serif, fontStyle: "italic", fontSize: 16, color: C.gold }}>{dateStr}</span>
            <span style={{ width: 44, borderTop: `1px solid ${C.gold}`, display: "inline-block" }} />
          </div>
          {settings.venueName && (
            <div className="text-sm mt-2" style={{ color: C.muted }}>
              📍 {settings.venueName}
            </div>
          )}
          {(settings.venueMaps || settings.venueWaze) && (
            <div className="flex gap-2 justify-center mt-2 flex-wrap">
              {settings.venueMaps && (
                <a
                  href={settings.venueMaps}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: "5px 14px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: "none",
                    border: `1px solid ${C.line}`,
                    background: C.card,
                    color: C.green,
                  }}
                >
                  🗺️ Google Maps
                </a>
              )}
              {settings.venueWaze && (
                <a
                  href={settings.venueWaze}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: "5px 14px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: "none",
                    border: `1px solid ${C.line}`,
                    background: C.card,
                    color: C.green,
                  }}
                >
                  🚗 Waze
                </a>
              )}
            </div>
          )}
          <div style={{ ...serif, fontSize: 22, fontWeight: 600, marginTop: 16, color: C.ink }}>
            Will you join us?
          </div>
        </div>

        {!data ? (
          <Card style={cardStyle}>
            <span style={{ color: C.muted }}>Loading…</span>
          </Card>
        ) : done ? (
          <Card style={cardStyle}>
            <div className="text-center">
              <div style={{ fontSize: 44, lineHeight: 1 }}>{coming === "yes" ? "🥂" : "💛"}</div>
              <div style={{ ...serif, fontSize: 26, fontWeight: 700, marginTop: 10 }}>
                {coming === "yes" ? "Wonderful — see you there!" : "We'll miss you"}
              </div>
              <p className="text-sm mt-2" style={{ color: C.muted }}>
                {sel.name} · {coming === "yes" ? `${num(pax)} pax confirmed` : "declined with our thanks for letting us know"}
              </p>
              <div className="mt-5">
                <Btn kind="gold" onClick={reset}>✓ Done</Btn>
              </div>
            </div>
          </Card>
        ) : !sel ? (
          <Card style={cardStyle}>
            <div className="text-center mb-3" style={{ ...serif, fontSize: 20, fontWeight: 600 }}>
              Find your invitation
            </div>
            <input
              style={{ ...inputStyle, borderRadius: 999, padding: "13px 20px", textAlign: "center", fontSize: 15 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type your name…"
              autoFocus
            />
            <div className="grid gap-2 mt-3">
              {matches.map((g) => (
                <button
                  key={g.id}
                  onClick={() => pick(g)}
                  className="text-left p-3"
                  style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 10, cursor: "pointer", color: C.ink }}
                >
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-xs" style={{ color: C.muted }}>
                    {" "}· invited with {g.invitedPax} pax{g.group ? ` · ${g.group}` : ""}
                  </span>
                  {!g.name.toLowerCase().includes(q) && membersOf(g).some((m) => m.name.toLowerCase().includes(q)) && (
                    <span className="text-xs" style={{ color: C.gold }}>
                      {" "}· {membersOf(g).find((m) => m.name.toLowerCase().includes(q)).name} is in this party
                    </span>
                  )}
                  {g.rsvp !== "pending" && (
                    <span className="text-xs" style={{ color: g.rsvp === "yes" ? C.green : C.red }}>
                      {" "}· replied: {g.rsvp === "yes" ? "attending" : "declined"} (you can change it)
                    </span>
                  )}
                </button>
              ))}
              {q.length >= 2 && matches.length === 0 && (
                <span className="text-sm" style={{ color: C.muted }}>
                  No invitation found under that name — please check with the couple.
                </span>
              )}
            </div>
          </Card>
        ) : (
          <Card style={cardStyle}>
            <div className="flex items-center justify-between">
              <div style={{ ...serif, fontSize: 24, fontWeight: 700 }}>{sel.name}</div>
              <Btn kind="ghost" small onClick={() => setSel(null)}>
                Not you?
              </Btn>
            </div>
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              You're invited with {sel.invitedPax} pax
            </p>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setComing("yes")} style={choiceBtn(coming === "yes", C.green)}>
                🎉 Joyfully attending
              </button>
              <button onClick={() => setComing("no")} style={choiceBtn(coming === "no", C.red)}>
                Regretfully can't
              </button>
            </div>

            {coming === "yes" && (
              <div className="mt-4 grid gap-3">
                {membersOf(sel).length > 0 ? (
                  <div>
                    <div className="mb-2" style={sectionLabel}>Who's coming? — tap names to toggle</div>
                    <div className="flex flex-wrap gap-2">
                      {membersOf(sel).map((m) => {
                        const on = selMembers.includes(m.name);
                        return (
                          <button
                            key={m.name}
                            onClick={() => {
                              const next = on ? selMembers.filter((x) => x !== m.name) : [...selMembers, m.name];
                              setSelMembers(next);
                              setPax(String(next.length || 1));
                              setBabies(String(babyCount(membersOf(sel).filter((x) => next.includes(x.name)))));
                            }}
                            style={{
                              padding: "6px 14px",
                              borderRadius: 999,
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                              border: `1px solid ${on ? C.green : C.line}`,
                              background: on ? C.greenSoft : C.card,
                              color: on ? C.green : C.muted,
                              textDecoration: on ? "none" : "line-through",
                            }}
                          >
                            {on ? "✓ " : ""}
                            {m.name}
                            {m.type === "baby" ? " 👶" : ""}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs mt-2" style={{ color: C.muted }}>
                      Coming: <b style={{ color: C.green }}>{selMembers.length} pax</b>
                      {num(babies) > 0 ? ` · ${num(babies)} 👶 (babies aren't counted for food)` : ""}
                    </p>
                    {membersOf(sel).filter((m) => selMembers.includes(m.name) && m.type !== "baby").length > 0 && (
                      <div className="mt-4">
                        <div className="mb-2" style={sectionLabel}>Meal preference</div>
                        <div className="grid gap-2 p-3" style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 12 }}>
                          {membersOf(sel)
                            .filter((m) => selMembers.includes(m.name) && m.type !== "baby")
                            .map((m) => (
                              <div key={m.name} className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm" style={{ minWidth: 120 }}>
                                  {m.name}
                                </span>
                                {[["non", "Non-vegetarian"], ["veg", "Vegetarian 🥗"]].map(([k, label]) => {
                                  const on = (memberDiets[m.name] || "non") === k;
                                  return (
                                    <button
                                      key={k}
                                      onClick={() => setMemberDiets({ ...memberDiets, [m.name]: k })}
                                      style={{
                                        padding: "4px 12px",
                                        borderRadius: 999,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        border: `1px solid ${on ? C.green : C.line}`,
                                        background: on ? C.greenSoft : C.card,
                                        color: on ? C.green : C.muted,
                                      }}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex gap-3 flex-wrap items-end">
                      <Field label="How many of you are coming? (everyone, incl. babies)">
                        <input style={{ ...inputStyle, width: 130 }} type="number" min="1" max={num(sel.invitedPax) || undefined} value={pax} onChange={(e) => setPax(e.target.value)} />
                      </Field>
                      <Field label="…of which babies 👶">
                        <input style={{ ...inputStyle, width: 110 }} type="number" min="0" value={babies} onChange={(e) => setBabies(e.target.value)} />
                      </Field>
                      <Field label="…vegetarian meals 🥗">
                        <input style={{ ...inputStyle, width: 110 }} type="number" min="0" value={vegCount} onChange={(e) => setVegCount(e.target.value)} />
                      </Field>
                    </div>
                    <p className="text-xs" style={{ color: C.muted, marginTop: -4 }}>
                      Count everyone in the total — e.g. 3 adults + 1 baby = 4, of which 1 baby. Babies are noted so no
                      seat's worth of food is prepared for them.
                    </p>
                  </>
                )}
                <div>
                  <div className="mb-2" style={sectionLabel}>Notes (optional)</div>
                  <input style={{ ...inputStyle, borderRadius: 12, padding: "11px 14px" }} value={dietary} onChange={(e) => setDietary(e.target.value)} placeholder="Halal, allergies, baby chair, anything we should know…" />
                </div>
              </div>
            )}

            {err && (
              <div className="text-xs mt-3" style={{ color: C.red }}>
                {err}
              </div>
            )}
            <div className="mt-5">
              <button
                onClick={submit}
                disabled={busy || !coming || (coming === "yes" && !num(pax))}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  borderRadius: 999,
                  fontSize: 16,
                  fontWeight: 700,
                  border: "1px solid transparent",
                  cursor: busy || !coming || (coming === "yes" && !num(pax)) ? "not-allowed" : "pointer",
                  opacity: busy || !coming || (coming === "yes" && !num(pax)) ? 0.5 : 1,
                  background: C.gold,
                  color: C.onGold,
                  transition: "opacity .15s",
                }}
              >
                {busy ? "Sending…" : "Send reply 💌"}
              </button>
            </div>
          </Card>
        )}

        {!locked && (
          <p className="text-xs text-center mt-4">
            <button
              onClick={onBack}
              style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", textDecoration: "underline" }}
            >
              Planner sign-in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- main planner ----------
function Planner({ role, onLogout, theme, toggleTheme, wedding }) {
  const roleInfo = ROLES[role];
  const side = roleInfo.side; // null for couple, 'bride'/'groom' for accountants
  const isCouple = !side;

  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("overview");
  const [saveState, setSaveState] = useState("saved");
  const [showCodes, setShowCodes] = useState(false);
  const first = useRef(true);
  const lastRemote = useRef(""); // last state received from (or confirmed in) the shared database

  const normalize = (parsed) => {
    const next = { ...EMPTY, ...parsed, settings: { ...EMPTY.settings, ...(parsed.settings || {}) } };
    if (!next.events || next.events.length === 0) next.events = defaultEvents(next.settings);
    return next;
  };

  // load shared data
  useEffect(() => {
    (async () => {
      let next = { ...EMPTY };
      try {
        const r = await window.storage.get(DATA_KEY(), true);
        if (r && r.value) next = normalize(JSON.parse(r.value));
        else next = normalize(next);
      } catch (e) {
        next = normalize(next);
      }
      lastRemote.current = JSON.stringify(next);
      setData(next);
      setLoaded(true);
    })();
  }, []);

  // live sync: apply changes other people make, as they make them
  useEffect(() => {
    if (!loaded || !window.storage.subscribe) return;
    const unsub = window.storage.subscribe(DATA_KEY(), (r) => {
      if (!r || typeof r.value !== "string") return;
      if (r.client && r.client === window.storage.clientId) return; // our own write echoing back
      try {
        const next = normalize(JSON.parse(r.value));
        lastRemote.current = JSON.stringify(next);
        setData(next);
      } catch (e) {}
    });
    return unsub;
  }, [loaded]);

  // save shared data (debounced)
  useEffect(() => {
    if (!loaded) return;
    if (first.current) {
      first.current = false;
      return;
    }
    if (JSON.stringify(data) === lastRemote.current) return; // change came from the database, not this user
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        await window.storage.set(DATA_KEY(), JSON.stringify(data), true);
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [data, loaded]);

  const up = (patch) => setData((d) => ({ ...d, ...patch }));

  const stats = useMemo(() => computeStats(data, side), [data, side]);

  const daysLeft = useMemo(() => {
    if (!data.settings.date) return null;
    return Math.ceil((new Date(data.settings.date) - new Date()) / 86400000);
  }, [data.settings.date]);

  const tabLabels = {
    overview: "Overview",
    guests: side ? `${cap(side)}'s Guests & RSVP` : "Guests & RSVP",
    catering: "Catering",
    budget: "Budget",
    todo: "✅ To-dos",
    gifts: side ? `${cap(side)}'s Gift Money` : "Gift Money",
    dayof: "🎟️ Day-of",
    data: "💾 Data",
  };
  const tabs = roleInfo.tabs;

  if (!loaded)
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.ivory, color: C.muted }}>
        <GlobalStyle />
        Loading your wedding book…
      </div>
    );

  return (
    <div className="min-h-screen pb-16" style={{ background: C.ivory, color: C.ink, colorScheme: theme }}>
      <GlobalStyle />
      <div className="max-w-5xl mx-auto px-4 pt-8">
        {/* header — invitation card */}
        <div
          className="text-center px-6 py-7 relative"
          style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16 }}
        >
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Pill tone={side === "bride" ? "gold" : side === "groom" ? "green" : "neutral"}>
                {roleInfo.icon} {roleInfo.label}
              </Pill>
              <Pill tone="gold">🔑 {wedding}</Pill>
            </div>
            <div className="flex gap-2">
              <Btn kind="ghost" small onClick={toggleTheme}>
                {theme === "dark" ? "☀️" : "🌙"}
              </Btn>
              {isCouple && (
                <Btn kind="ghost" small onClick={() => setShowCodes((v) => !v)}>
                  Passcodes
                </Btn>
              )}
              <Btn kind="ghost" small onClick={onLogout}>
                Log out
              </Btn>
            </div>
          </div>
          <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.gold }}>
            ❦ &nbsp;The Wedding of&nbsp; ❦
          </div>
          <input
            value={data.settings.couple}
            onChange={(e) => up({ settings: { ...data.settings, couple: e.target.value } })}
            placeholder="Your names here"
            disabled={!isCouple}
            className="text-center w-full"
            style={{
              ...serif,
              fontSize: 32,
              fontWeight: 600,
              border: "none",
              background: "transparent",
              color: C.ink,
              outline: "none",
            }}
          />
          <div className="flex items-center justify-center gap-3 mt-2 flex-wrap">
            {isCouple ? (
              <input
                type="date"
                value={data.settings.date}
                onChange={(e) => up({ settings: { ...data.settings, date: e.target.value } })}
                style={{ ...inputStyle, width: "auto", fontSize: 13 }}
              />
            ) : (
              data.settings.date && (
                <span className="text-sm" style={{ color: C.muted }}>
                  {new Date(data.settings.date).toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              )
            )}
            {daysLeft !== null && (
              <Pill tone={daysLeft >= 0 ? "gold" : "neutral"}>
                {daysLeft > 0 ? `${daysLeft} days to go` : daysLeft === 0 ? "It's today! 🎉" : "Married!"}
              </Pill>
            )}
            <span className="text-xs" style={{ color: saveState === "error" ? C.red : C.muted }}>
              {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save — will retry on next change" : "Saved · shared with your team"}
            </span>
          </div>
        </div>

        {showCodes && isCouple && <PasscodeManager onClose={() => setShowCodes(false)} />}

        <EventBar data={data} up={up} isCouple={isCouple} />

        {/* tabs */}
        <div className="flex gap-2 mt-5 flex-wrap">
          {tabs.map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                border: `1px solid ${tab === k ? C.green : C.line}`,
                background: tab === k ? C.green : C.card,
                color: tab === k ? C.onGreen : C.ink,
                cursor: "pointer",
              }}
            >
              {tabLabels[k]}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {tab === "overview" && <Overview stats={stats} data={data} setTab={setTab} side={side} />}
          {tab === "guests" && <Guests data={data} up={up} side={side} />}
          {tab === "catering" && isCouple && <Catering data={data} up={up} stats={stats} />}
          {tab === "budget" && isCouple && <Budget data={data} up={up} stats={stats} />}
          {tab === "todo" && isCouple && <Todos data={data} up={up} />}
          {tab === "gifts" && <Gifts data={data} up={up} side={side} />}
          {tab === "dayof" && <DayOf data={data} up={up} side={side} />}
          {tab === "data" && isCouple && <DataPanel data={data} up={up} />}
        </div>
      </div>
    </div>
  );
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- events ----------
const EVENT_ICONS = ["💒", "📸", "🌼", "⛪", "🍽️", "🎉", "🫖", "💍", "🎊"];

function eventDateLabel(date) {
  if (!date) return "date TBC";
  const d = new Date(date);
  const days = Math.ceil((d - new Date(new Date().toDateString())) / 86400000);
  const str = d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
  if (days > 0) return `${str} · in ${days}d`;
  if (days === 0) return `${str} · today!`;
  return `${str} · done`;
}

function EventBar({ data, up, isCouple }) {
  const [manage, setManage] = useState(false);
  const [newEv, setNewEv] = useState({ name: "", date: "", icon: "📸" });

  const events = data.events || [];
  const patchEv = (id, p) => up({ events: events.map((e) => (e.id === id ? { ...e, ...p } : e)) });

  const addEv = () => {
    if (!newEv.name.trim()) return;
    up({ events: [...events, { id: "ev-" + uid(), name: newEv.name.trim(), date: newEv.date, icon: newEv.icon }] });
    setNewEv({ name: "", date: "", icon: "🎉" });
  };

  const removeEv = (id) => {
    if (events.length <= 1) return;
    up({
      events: events.filter((e) => e.id !== id),
      // untag the deleted event everywhere
      guests: data.guests.map((g) => (g.events ? { ...g, events: g.events.filter((x) => x !== id) } : g)),
      budget: data.budget.map((b) => (b.eventId === id ? { ...b, eventId: "" } : b)),
      caterers: data.caterers.map((c) => (c.eventId === id ? { ...c, eventId: "" } : c)),
    });
  };

  return (
    <div className="mt-4">
      <div className="flex gap-2 flex-wrap items-center">
        {events.map((e) => (
          <span
            key={e.id}
            className="text-xs font-semibold"
            style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 12px" }}
          >
            {e.icon || "🎉"} {e.name}
            <span style={{ color: C.muted, fontWeight: 500 }}> · {eventDateLabel(e.date)}</span>
          </span>
        ))}
        {isCouple && (
          <Btn kind="ghost" small onClick={() => setManage((v) => !v)}>
            {manage ? "Done" : "＋ Manage events"}
          </Btn>
        )}
      </div>

      {manage && isCouple && (
        <Card className="mt-3">
          <div style={{ ...serif, fontSize: 18, fontWeight: 600 }} className="mb-2">
            Your events
          </div>
          <div className="grid gap-2">
            {events.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 p-2" style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 8 }}>
                <select style={{ ...inputStyle, width: 64, padding: "4px 6px" }} value={e.icon || "🎉"} onChange={(ev) => patchEv(e.id, { icon: ev.target.value })}>
                  {EVENT_ICONS.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
                <input style={{ ...inputStyle, width: 220, padding: "4px 8px" }} value={e.name} onChange={(ev) => patchEv(e.id, { name: ev.target.value })} />
                <input style={{ ...inputStyle, width: 150, padding: "4px 8px" }} type="date" value={e.date || ""} onChange={(ev) => patchEv(e.id, { date: ev.target.value })} />
                {events.length > 1 && (
                  <Btn kind="danger" small onClick={() => removeEv(e.id)}>
                    ✕
                  </Btn>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 p-2" style={{ border: `1px dashed ${C.line}`, borderRadius: 8 }}>
              <select style={{ ...inputStyle, width: 64, padding: "4px 6px" }} value={newEv.icon} onChange={(e) => setNewEv({ ...newEv, icon: e.target.value })}>
                {EVENT_ICONS.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
              <input style={{ ...inputStyle, width: 220, padding: "4px 8px" }} placeholder="e.g. Pre-wedding photoshoot" value={newEv.name} onChange={(e) => setNewEv({ ...newEv, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addEv()} />
              <input style={{ ...inputStyle, width: 150, padding: "4px 8px" }} type="date" value={newEv.date} onChange={(e) => setNewEv({ ...newEv, date: e.target.value })} />
              <Btn small onClick={addEv}>Add event</Btn>
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: C.muted }}>
            Guests are invited to all events unless you untag them on their card. Budget vendors and catering quotes
            can be tagged to a specific event. Deleting an event removes its tags but keeps the guests and vendors.
          </p>
        </Card>
      )}
    </div>
  );
}

function computeStats(data, side) {
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
  const budgeted = data.budget.reduce((s, x) => s + num(x.budgeted), 0);
  const actual = data.budget.reduce((s, x) => s + num(x.actual), 0);
  const paidOut = data.budget.reduce((s, x) => s + num(x.paidAmount !== undefined ? x.paidAmount : x.paid ? x.actual : 0), 0);
  const balanceToPay = Math.max(0, actual - paidOut);
  const depositsToCollect = data.budget.reduce((s, x) => s + (x.depositCollected ? 0 : num(x.deposit)), 0);
  const extras = side ? data.extraGifts.filter((x) => (x.side || "bride") === side) : data.extraGifts;
  const gifts = g.reduce((s, x) => s + num(x.giftAmount), 0) + extras.reduce((s, x) => s + num(x.amount), 0);
  return {
    guestCount: g.length,
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

// ---------- passcode manager (couple only) ----------
function PasscodeManager({ onClose }) {
  const [accounts, setAccounts] = useState(null);
  const [editing, setEditing] = useState(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(ACCT_KEY(), true);
        setAccounts(r && r.value ? JSON.parse(r.value) : {});
      } catch (e) {
        setAccounts({});
      }
    })();
  }, []);

  const save = async (roleKey, newCode) => {
    const next = { ...accounts };
    if (newCode === null) delete next[roleKey];
    else next[roleKey] = scramble(newCode);
    try {
      await window.storage.set(ACCT_KEY(), JSON.stringify(next), true);
      setAccounts(next);
      setEditing(null);
      setCode("");
      setMsg(newCode === null ? `${ROLES[roleKey].label}'s passcode cleared — they'll set a new one at sign-in.` : `${ROLES[roleKey].label}'s passcode updated.`);
    } catch (e) {
      setMsg("Couldn't save. Try again.");
    }
  };

  if (!accounts) return null;

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <div style={{ ...serif, fontSize: 18, fontWeight: 600 }}>Team passcodes</div>
        <Btn kind="ghost" small onClick={onClose}>
          Close
        </Btn>
      </div>
      <div className="grid gap-2">
        {Object.entries(ROLES).map(([k, r]) => (
          <div key={k} className="flex flex-wrap items-center gap-2 p-2" style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 8 }}>
            <span className="text-sm font-medium">
              {r.icon} {r.label}
            </span>
            <Pill tone={accounts[k] ? "green" : "neutral"}>{accounts[k] ? "Passcode set" : "Not set"}</Pill>
            <div className="ml-auto flex items-center gap-2">
              {editing === k ? (
                <>
                  <input style={{ ...inputStyle, width: 160, padding: "4px 8px" }} type="password" placeholder="New passcode" value={code} onChange={(e) => setCode(e.target.value)} />
                  <Btn small onClick={() => code.length >= 4 && save(k, code)} disabled={code.length < 4}>
                    Save
                  </Btn>
                  <Btn kind="ghost" small onClick={() => setEditing(null)}>
                    Cancel
                  </Btn>
                </>
              ) : (
                <>
                  <Btn kind="ghost" small onClick={() => { setEditing(k); setCode(""); }}>
                    Set new
                  </Btn>
                  {accounts[k] && (
                    <Btn kind="danger" small onClick={() => save(k, null)}>
                      Clear
                    </Btn>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {msg && (
        <div className="text-xs mt-2" style={{ color: C.green }}>
          {msg}
        </div>
      )}
    </Card>
  );
}

// ---------- overview ----------
function Overview({ stats, data, setTab, side }) {
  const rsvpRate = stats.guestCount > 0 ? Math.round(((stats.guestCount - stats.pending) / stats.guestCount) * 100) : 0;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label={side ? `${cap(side)}'s invites` : "Invited"}
          value={`${stats.guestCount} invites`}
          sub={stats.invitedBabies > 0 ? `${stats.invitedPax} pax total · ${stats.invitedBabies} 👶` : `${stats.invitedPax} pax total`}
        />
        <Stat
          label="Confirmed pax"
          value={stats.confirmedPax}
          sub={
            stats.confirmedBabies > 0
              ? `${stats.attendingCount} invites · ${stats.confirmedEating} eating, ${stats.confirmedBabies} 👶`
              : `${stats.attendingCount} invites attending`
          }
          tone={C.green}
        />
        <Stat label="Pending replies" value={stats.pending} sub={`${rsvpRate}% have responded`} tone={stats.pending > 0 ? C.gold : C.green} />
        <Stat label="Declined" value={stats.declined} />
      </div>
      {side ? (
        <div className="grid grid-cols-2 gap-3">
          <Stat label={`${cap(side)}'s gift money`} value={RM(stats.gifts)} tone={C.gold} />
          <Stat label="Your job" value="Guests & gifts" sub="Budget and catering are managed by the couple" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Budget planned" value={RM(stats.budgeted)} />
          <Stat
            label="Paid out"
            value={RM(stats.paidOut)}
            tone={stats.actual > stats.budgeted && stats.budgeted > 0 ? C.red : C.ink}
            sub={`of ${RM(stats.actual)} committed${stats.balanceToPay > 0 ? ` · ${RM(stats.balanceToPay)} still to pay` : ""}`}
          />
          <Stat label="Gift money received" value={RM(stats.gifts)} tone={C.gold} />
          <Stat label="Net cost after gifts" value={RM(stats.net)} tone={stats.net > 0 ? C.ink : C.green} sub={stats.net <= 0 ? "Gifts cover your spend 🎉" : "Spend minus gifts"} />
        </div>
      )}
      {stats.guestCount === 0 && (
        <Card>
          <div style={{ ...serif, fontSize: 20, fontWeight: 600 }}>Start {side ? `the ${side}'s` : "your"} guest list</div>
          <p className="text-sm mt-1 mb-3" style={{ color: C.muted }}>
            Everything flows from the guest list — RSVP counts feed the catering numbers, and gifts are recorded against each guest.
          </p>
          <Btn onClick={() => setTab("guests")}>Add the first guest</Btn>
        </Card>
      )}
    </div>
  );
}

// ---------- guests & rsvp ----------
function Guests({ data, up, side }) {
  const [form, setForm] = useState({ name: "", side: side || "bride", group: "", invitedPax: 1, phone: "", members: [{ name: "", type: "adult" }] });
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list");
  const [editId, setEditId] = useState(null);

  // preset categories plus every group path already in use, for the autocomplete dropdown
  const groupOptions = useMemo(() => {
    const set = new Set(GROUP_PRESETS);
    data.guests.forEach((g) => {
      const parts = (g.group || "").split("/").map((p) => p.trim()).filter(Boolean);
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join(" / "));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data.guests]);

  const dupName = form.name.trim() !== "" && data.guests.some((g) => g.name.trim().toLowerCase() === form.name.trim().toLowerCase());
  const formMembers = form.members.map(asMember).filter((m) => m.name.trim());
  const formBabies = babyCount(formMembers);

  const add = () => {
    if (!form.name.trim() || dupName) return;
    const members = form.members.map(asMember).filter((m) => m.name.trim());
    const pax = members.length > 0 ? members.length : num(form.invitedPax) || 1;
    const g = {
      id: uid(),
      name: form.name.trim(),
      side: side || form.side,
      group: form.group.trim(),
      invitedPax: pax,
      invitedBabies: babyCount(members),
      phone: form.phone.trim(),
      members: members.length ? members : undefined,
      rsvp: "pending",
      confirmedPax: "",
      confirmedBabies: "",
      dietary: "",
      giftAmount: "",
      giftMethod: "cash",
      giftNote: "",
    };
    up({ guests: [g, ...data.guests] });
    setForm({ name: "", side: side || form.side, group: form.group, invitedPax: 1, phone: "", members: [{ name: "", type: "adult" }] });
  };

  // planners tick off who from a family is coming; confirmed pax and babies follow
  const toggleMember = (g, name) => {
    const mm = membersOf(g);
    const names = mm.map((x) => x.name);
    const base = Array.isArray(g.confirmedMembers) ? g.confirmedMembers.filter((x) => names.includes(x)) : [...names];
    const next = base.includes(name) ? base.filter((x) => x !== name) : [...base, name];
    patch(g.id, {
      confirmedMembers: next,
      confirmedPax: next.length,
      confirmedBabies: String(babyCount(mm.filter((x) => next.includes(x.name)))),
    });
  };

  // editing a guest's member rows keeps the invite's pax and baby counts in step
  const patchMembers = (g, rows) => {
    const named = rows.map(asMember).filter((m) => m.name.trim());
    patch(g.id, {
      members: rows.length ? rows : undefined,
      ...(named.length ? { invitedPax: named.length, invitedBabies: babyCount(named) } : {}),
    });
  };

  const patch = (id, p) => up({ guests: data.guests.map((g) => (g.id === id ? { ...g, ...p } : g)) });
  const remove = (id) => up({ guests: data.guests.filter((g) => g.id !== id) });

  const pool = side ? data.guests.filter((g) => g.side === side) : data.guests;

  const shown = pool.filter((g) => {
    const f =
      filter === "all" ||
      (filter === "yes" && g.rsvp === "yes") ||
      (filter === "no" && g.rsvp === "no") ||
      (filter === "pending" && g.rsvp === "pending") ||
      (filter === "notInvited" && !g.invitedAt) ||
      (filter === "checkedIn" && !!g.checkedInAt) ||
      (filter === "bride" && g.side === "bride") ||
      (filter === "groom" && g.side === "groom");
    const s =
      !search ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      (g.group || "").toLowerCase().includes(search.toLowerCase());
    return f && s;
  });

  const filters = [
    ["all", "All"],
    ["notInvited", "Not invited"],
    ["pending", "Pending"],
    ["yes", "Attending"],
    ["no", "Declined"],
    ["checkedIn", "🎟️ Checked in"],
    ...(side ? [] : [["bride", "Bride's side"], ["groom", "Groom's side"]]),
  ];

  return (
    <div className="grid gap-4">
      <Card>
        <div style={{ ...serif, fontSize: 20, fontWeight: 600 }} className="mb-3">
          Add a guest {side && <Pill tone={side === "bride" ? "gold" : "green"}>{cap(side)}'s side</Pill>}
        </div>
        <div className="grid md:grid-cols-6 gap-3 items-end">
          <Field label="Family / invite name" className="md:col-span-2">
            <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Gabriel Paul's Family" onKeyDown={(e) => e.key === "Enter" && add()} />
            {dupName && (
              <span className="text-xs" style={{ color: C.red }}>
                Already on the guest list — change the name to avoid a duplicate.
              </span>
            )}
          </Field>
          {!side && (
            <Field label="Side">
              <select style={inputStyle} value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}>
                <option value="bride">Bride</option>
                <option value="groom">Groom</option>
              </select>
            </Field>
          )}
          <Field label="Group / relation" className="md:col-span-2">
            <GroupSelect value={form.group} options={groupOptions} onChange={(v) => setForm({ ...form, group: v })} />
          </Field>
        </div>

        <div className="mt-3 p-3" style={{ background: C.soft, border: `1px dashed ${C.line}`, borderRadius: 10 }}>
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: C.muted }}>
            Family members under this invite
          </div>
          <MemberRows members={form.members} onChange={(rows) => setForm({ ...form, members: rows })} />
          <p className="text-xs mt-2" style={{ color: C.muted }}>
            One box per person, <b>including the family head</b> — e.g. for "Gabriel Paul's Family", add Gabriel Paul
            himself as a member too. Mark each as adult or baby 👶 (babies are excluded from catering). The pax count
            follows these boxes automatically.
          </p>
          {formMembers.length === 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs" style={{ color: C.muted }}>Not naming people? Just set the pax count:</span>
              <input
                style={{ ...inputStyle, width: 80, padding: "4px 8px" }}
                type="number"
                min="1"
                value={form.invitedPax}
                onChange={(e) => setForm({ ...form, invitedPax: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-5 gap-3 items-end mt-3">
          <Field label="Phone (optional)" className="md:col-span-2">
            <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 012-345 6789" />
          </Field>
          <div className="md:col-span-2 pb-2 text-sm" style={{ color: C.muted }}>
            {formMembers.length > 0 && (
              <>
                This invite:{" "}
                <b style={{ color: C.green }}>
                  {formMembers.length} pax{formBabies > 0 ? ` · ${formBabies} 👶` : ""}
                </b>
              </>
            )}
            {!form.name.trim() && (
              <span className="text-xs" style={{ color: C.red }}>
                {formMembers.length > 0 ? " — " : ""}fill in the family / invite name above first
              </span>
            )}
          </div>
          <div>
            <Btn onClick={add} disabled={!form.name.trim() || dupName}>
              Add guest
            </Btn>
          </div>
        </div>
        <p className="text-xs mt-2" style={{ color: C.muted }}>
          Once this family RSVPs, you (or they, via the RSVP link) tick exactly who's coming, name by name.
        </p>
      </Card>

      <InvitePanel data={data} up={up} pool={pool} />

      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex" style={{ border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden" }}>
          {[
            ["list", "📋 List"],
            ["tree", "🌳 Family tree"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              style={{
                padding: "5px 14px",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: view === k ? C.green : C.card,
                color: view === k ? C.onGreen : C.muted,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {filters.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              border: `1px solid ${filter === k ? C.gold : C.line}`,
              background: filter === k ? C.goldSoft : C.card,
              color: filter === k ? C.gold : C.muted,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
        <input style={{ ...inputStyle, width: 200, marginLeft: "auto" }} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {shown.length === 0 && (
        <Card>
          <span style={{ color: C.muted }}>No guests here yet. Add someone above to begin.</span>
        </Card>
      )}

      {view === "tree" && shown.length > 0 && <FamilyTree pool={shown} side={side} coupleName={data.settings.couple} />}

      {view === "list" &&
        shown.map((g) => (
        <Card key={g.id} style={{ padding: 14 }}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold text-base mr-1">{g.name}</div>
            <Pill tone={g.side === "bride" ? "gold" : "green"}>{g.side === "bride" ? "Bride" : "Groom"}</Pill>
            {g.group && <Pill>{g.group}</Pill>}
            <Pill>
              {g.invitedPax} invited{num(g.invitedBabies) > 0 ? ` · ${num(g.invitedBabies)} 👶` : ""}
            </Pill>
            {g.checkedInAt && (
              <Pill tone={num(g.checkedInPax) === num(g.confirmedPax || g.invitedPax) ? "green" : "red"}>
                🎟️ {num(g.checkedInPax)} arrived{num(g.checkedInBabies) > 0 ? ` · ${num(g.checkedInBabies)} 👶` : ""}
                {num(g.checkedInPax) !== num(g.confirmedPax || g.invitedPax) ? ` (expected ${num(g.confirmedPax || g.invitedPax)})` : ""}
              </Pill>
            )}
            {num(g.pledgeAmount) > 0 && (
              <Pill tone="gold">💝 pledged {RM(g.pledgeAmount)} · {g.pledgeMethod === "qr" ? "QR" : "cash"}</Pill>
            )}
            {g.phone && (
              <span className="text-xs" style={{ color: C.muted }}>
                {g.phone}
              </span>
            )}
            {g.invitedAt && <Pill tone="green">📨 Invited {new Date(g.invitedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}</Pill>}
            <div className="ml-auto flex gap-2 items-center">
              {g.phone && (
                <button
                  onClick={() => {
                    const msg = buildInviteMessage(data.settings.inviteTemplate, g, data.settings);
                    const link = waLink(g.phone, msg);
                    if (link) {
                      window.open(link, "_blank");
                      patch(g.id, { invitedAt: g.invitedAt || Date.now() });
                    }
                  }}
                  title={g.invitedAt ? "Send again on WhatsApp" : "Send invitation on WhatsApp"}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: `1px solid ${C.waBtn}`,
                    background: g.invitedAt ? "transparent" : C.waSoft,
                    color: C.waBtn,
                  }}
                >
                  💬 WhatsApp
                </button>
              )}
              {[
                ["pending", "Pending"],
                ["yes", "Attending"],
                ["no", "Declined"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => patch(g.id, { rsvp: k, confirmedPax: k === "yes" ? g.confirmedPax || g.invitedPax : "" })}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: `1px solid ${g.rsvp === k ? (k === "yes" ? C.green : k === "no" ? C.red : C.gold) : C.line}`,
                    background: g.rsvp === k ? (k === "yes" ? C.greenSoft : k === "no" ? C.redSoft : C.goldSoft) : "transparent",
                    color: g.rsvp === k ? (k === "yes" ? C.green : k === "no" ? C.red : C.gold) : C.muted,
                  }}
                >
                  {label}
                </button>
              ))}
              <Btn kind="ghost" small onClick={() => setEditId(editId === g.id ? null : g.id)}>
                {editId === g.id ? "Done" : "✏️ Edit"}
              </Btn>
              <Btn kind="danger" small onClick={() => remove(g.id)}>
                ✕
              </Btn>
            </div>
          </div>
          {membersOf(g).length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mt-2">
              <span className="text-xs mr-1" style={{ color: C.muted }}>
                👨‍👩‍👧
              </span>
              {membersOf(g).map((m) => {
                const known = g.rsvp === "yes" && Array.isArray(g.confirmedMembers);
                const coming = known ? g.confirmedMembers.includes(m.name) : null;
                return (
                  <button
                    key={m.name}
                    onClick={() => g.rsvp === "yes" && toggleMember(g, m.name)}
                    title={g.rsvp === "yes" ? "Tap to toggle whether this person is coming" : "Set RSVP to Attending to tick people off"}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: g.rsvp === "yes" ? "pointer" : "default",
                      border: `1px solid ${coming === true ? C.green : C.line}`,
                      background: coming === true ? C.greenSoft : "transparent",
                      color: coming === true ? C.green : C.muted,
                      textDecoration: coming === false ? "line-through" : "none",
                    }}
                  >
                    {coming === true ? "✓ " : ""}
                    {m.name}
                    {m.type === "baby" ? " 👶" : ""}
                    {m.diet === "veg" ? " 🥗" : ""}
                  </button>
                );
              })}
              {g.rsvp === "yes" && (
                <span className="text-xs ml-1" style={{ color: C.muted }}>
                  tap names to mark who's coming
                </span>
              )}
            </div>
          )}
          {editId === g.id && (
            <div className="flex flex-wrap gap-3 mt-3 items-end p-3" style={{ background: C.soft, border: `1px dashed ${C.gold}`, borderRadius: 8 }}>
              <Field label="Name">
                <input style={{ ...inputStyle, width: 200 }} value={g.name} onChange={(e) => patch(g.id, { name: e.target.value })} />
              </Field>
              {!side && (
                <Field label="Side">
                  <select style={{ ...inputStyle, width: 100 }} value={g.side} onChange={(e) => patch(g.id, { side: e.target.value })}>
                    <option value="bride">Bride</option>
                    <option value="groom">Groom</option>
                  </select>
                </Field>
              )}
              <Field label="Group / relation" className="min-w-72">
                <GroupSelect value={g.group || ""} options={groupOptions} onChange={(v) => patch(g.id, { group: v })} />
              </Field>
              {membersOf(g).length === 0 && (
                <Field label="Invited pax">
                  <input style={{ ...inputStyle, width: 90 }} type="number" min="1" value={g.invitedPax} onChange={(e) => patch(g.id, { invitedPax: e.target.value })} />
                </Field>
              )}
              <Field label="Phone">
                <input style={{ ...inputStyle, width: 150 }} value={g.phone || ""} onChange={(e) => patch(g.id, { phone: e.target.value })} />
              </Field>
              <div className="w-full">
                <div className="text-xs uppercase tracking-wider mb-2" style={{ color: C.muted }}>
                  Family members (adult or baby 👶 — pax follows these boxes)
                </div>
                <MemberRows members={(g.members || []).map(asMember)} onChange={(rows) => patchMembers(g, rows)} />
              </div>
            </div>
          )}
          {(data.events || []).length > 1 && (
            <div className="flex flex-wrap items-center gap-1 mt-2">
              <span className="text-xs mr-1" style={{ color: C.muted }}>
                Invited to:
              </span>
              {(data.events || []).map((ev) => {
                const active = guestInEvent(g, ev.id);
                return (
                  <button
                    key={ev.id}
                    onClick={() => {
                      const all = (data.events || []).map((x) => x.id);
                      let cur = g.events && g.events.length ? [...g.events] : [...all];
                      cur = active ? cur.filter((x) => x !== ev.id) : [...cur, ev.id];
                      if (cur.length === 0) return; // must be invited to at least one event
                      patch(g.id, { events: all.every((x) => cur.includes(x)) ? undefined : cur });
                    }}
                    style={{
                      padding: "2px 9px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: `1px solid ${active ? C.green : C.line}`,
                      background: active ? C.greenSoft : "transparent",
                      color: active ? C.green : C.muted,
                    }}
                  >
                    {ev.icon || "🎉"} {ev.name}
                  </button>
                );
              })}
            </div>
          )}
          {g.rsvp === "yes" && (
            <div className="flex flex-wrap gap-3 mt-3 items-end">
              <Field label="Confirmed pax">
                <input style={{ ...inputStyle, width: 90 }} type="number" min="0" value={g.confirmedPax} onChange={(e) => patch(g.id, { confirmedPax: e.target.value })} />
              </Field>
              <Field label="…of which babies 👶">
                <input
                  style={{ ...inputStyle, width: 90 }}
                  type="number"
                  min="0"
                  placeholder={String(num(g.invitedBabies))}
                  value={g.confirmedBabies === undefined ? "" : g.confirmedBabies}
                  onChange={(e) => patch(g.id, { confirmedBabies: e.target.value })}
                />
              </Field>
              <div className="pb-2 text-xs" style={{ color: C.muted }}>
                ={" "}
                <b style={{ color: C.green }}>
                  {Math.max(
                    0,
                    num(g.confirmedPax || g.invitedPax || 1) -
                      Math.min(
                        g.confirmedBabies === "" || g.confirmedBabies === undefined ? num(g.invitedBabies) : num(g.confirmedBabies),
                        num(g.confirmedPax || g.invitedPax || 1)
                      )
                  )}
                </b>{" "}
                eating pax for catering
              </div>
              <Field label="Notes" className="flex-1 min-w-40">
                <input style={inputStyle} value={g.dietary} onChange={(e) => patch(g.id, { dietary: e.target.value })} placeholder="Halal, allergies, kids' seats…" />
              </Field>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ---------- wedding summary report (print-to-PDF) ----------
function buildSummaryHtml(data) {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const st = computeStats(data, null);
  const guests = data.guests || [];
  const arrived = guests.filter((g) => g.checkedInAt);
  const arrivedPax = arrived.reduce((s, g) => s + num(g.checkedInPax), 0);
  const arrivedBabies = arrived.reduce((s, g) => s + Math.min(num(g.checkedInBabies), num(g.checkedInPax)), 0);
  const vegMeals = guests.filter((g) => g.rsvp === "yes").reduce((s, g) => s + vegOf(g), 0);
  const guestGiftTotal = guests.reduce((s, x) => s + num(x.giftAmount), 0);
  const extraTotal = (data.extraGifts || []).reduce((s, x) => s + num(x.amount), 0);
  const dateStr = data.settings.date
    ? new Date(data.settings.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "(date not set)";

  const paidOf = (b) => num(b.paidAmount !== undefined ? b.paidAmount : b.paid ? b.actual : 0);
  const byCat = {};
  (data.budget || []).forEach((b) => {
    (byCat[b.category] = byCat[b.category] || []).push(b);
  });
  const catRows = Object.entries(byCat)
    .map(([cat, items]) => {
      const bud = items.reduce((s, x) => s + num(x.budgeted), 0);
      const tot = items.reduce((s, x) => s + num(x.actual), 0);
      const paid = items.reduce((s, x) => s + paidOf(x), 0);
      return `<tr><td>${esc(cat)}</td><td class="r">${RM(bud)}</td><td class="r">${RM(tot)}</td><td class="r">${RM(paid)}</td></tr>`;
    })
    .join("");

  const rsvpLabel = (r) => (r === "yes" ? "Attending" : r === "no" ? "Declined" : "Pending");
  const guestRows = guests
    .slice()
    .sort(
      (a, b) =>
        (a.side || "").localeCompare(b.side || "") ||
        (a.group || "").localeCompare(b.group || "") ||
        a.name.localeCompare(b.name)
    )
    .map((g) => {
      const mm = membersOf(g);
      return `<tr>
        <td>${esc(g.name)}${mm.length ? `<div class="sub">${esc(mm.map((m) => m.name + (m.type === "baby" ? " (baby)" : "")).join(", "))}</div>` : ""}</td>
        <td>${g.side === "groom" ? "Groom" : "Bride"}</td>
        <td>${esc(g.group || "")}</td>
        <td class="r">${num(g.invitedPax)}</td>
        <td>${rsvpLabel(g.rsvp)}${g.rsvp === "yes" ? ` (${num(g.confirmedPax || g.invitedPax)} pax)` : ""}</td>
        <td class="r">${g.checkedInAt ? num(g.checkedInPax) : "—"}</td>
        <td class="r">${num(g.giftAmount) > 0 ? RM(g.giftAmount) : "—"}</td>
      </tr>`;
    })
    .join("");

  const stat = (label, value, sub) =>
    `<div class="stat"><div class="lbl">${label}</div><div class="val">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Wedding Summary — ${esc(data.settings.couple || "Our Wedding")}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Jost:wght@400;500;600&display=swap');
  * { box-sizing: border-box; }
  body { font-family: 'Jost', system-ui, sans-serif; color: #22301F; background: #fff; margin: 0; padding: 40px 48px; }
  .serif { font-family: 'Cormorant Garamond', Georgia, serif; }
  header { text-align: center; margin-bottom: 28px; }
  .flourish { color: #A9812F; letter-spacing: 8px; font-size: 18px; }
  .eyebrow { text-transform: uppercase; letter-spacing: 5px; font-size: 11px; color: #7C7466; margin-top: 10px; }
  h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 40px; font-weight: 700; margin: 4px 0 6px; }
  .date { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; color: #A9812F; font-size: 17px; }
  .venue { color: #7C7466; font-size: 13px; margin-top: 4px; }
  h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; font-weight: 700; border-bottom: 2px solid #A9812F; padding-bottom: 4px; margin: 30px 0 12px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .stat { border: 1px solid #E5DFD2; border-radius: 10px; padding: 12px; }
  .stat .lbl { text-transform: uppercase; letter-spacing: 1px; font-size: 10px; color: #7C7466; }
  .stat .val { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; font-weight: 700; color: #2E4A35; }
  .stat .sub, .sub { font-size: 11px; color: #7C7466; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; text-transform: uppercase; letter-spacing: 1px; font-size: 10px; color: #7C7466; border-bottom: 1px solid #A9812F; padding: 6px 8px; }
  td { border-bottom: 1px solid #EFEAE0; padding: 6px 8px; vertical-align: top; }
  td.r, th.r { text-align: right; }
  tr { page-break-inside: avoid; }
  .money { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  footer { margin-top: 36px; text-align: center; color: #A39C8C; font-size: 11px; }
  @media print { body { padding: 10mm 12mm; } .noprint { display: none; } }
  .noprint { text-align: center; margin-bottom: 18px; }
  .noprint button { background: #A9812F; color: #fff; border: none; border-radius: 999px; padding: 10px 26px; font-size: 14px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
  <div class="noprint"><button onclick="window.print()">🖨️ Print / Save as PDF</button></div>
  <header>
    <div class="flourish">✿&nbsp;❦&nbsp;✿</div>
    <div class="eyebrow">Wedding Summary</div>
    <h1>${esc(data.settings.couple || "Our Wedding")}</h1>
    <div class="date">${esc(dateStr)}</div>
    ${data.settings.venueName ? `<div class="venue">📍 ${esc(data.settings.venueName)}</div>` : ""}
  </header>

  <h2>Guests at a glance</h2>
  <div class="stats">
    ${stat("Invitations", st.guestCount, `${st.invitedPax} pax invited`)}
    ${stat("Confirmed", `${st.confirmedPax} pax`, `${st.attendingCount} invites attending · ${st.declined} declined · ${st.pending} pending`)}
    ${stat("Arrived on the day", `${arrivedPax} pax`, `${arrived.length} invites checked in${arrivedBabies > 0 ? ` · ${arrivedBabies} babies` : ""}`)}
    ${stat("Meals", `${st.confirmedEating} eating`, `${st.confirmedBabies} babies excluded${vegMeals > 0 ? ` · ${vegMeals} vegetarian` : ""}`)}
  </div>

  <h2>Money</h2>
  <div class="stats money">
    ${stat("Budget committed", RM(st.actual), `planned ${RM(st.budgeted)} · paid ${RM(st.paidOut)}`)}
    ${stat("Gifts received", RM(st.gifts), `${RM(guestGiftTotal)} from guests · ${RM(extraTotal)} other`)}
    ${stat("Net cost after gifts", RM(st.net), st.net <= 0 ? "gifts covered the spend 🎉" : "spend minus gifts")}
  </div>

  ${catRows ? `<h2>Budget by category</h2>
  <table>
    <thead><tr><th>Category</th><th class="r">Budgeted</th><th class="r">Total</th><th class="r">Paid</th></tr></thead>
    <tbody>${catRows}</tbody>
  </table>` : ""}

  <h2>Guest list</h2>
  <table>
    <thead><tr><th>Invite / members</th><th>Side</th><th>Group</th><th class="r">Invited</th><th>RSVP</th><th class="r">Arrived</th><th class="r">Gift</th></tr></thead>
    <tbody>${guestRows || `<tr><td colspan="7">No guests recorded.</td></tr>`}</tbody>
  </table>

  <footer>Generated ${new Date().toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })} · Wedding Book 💍</footer>
</body>
</html>`;
}

// ---------- printable guest list (per side, for the door / offline backup) ----------
function buildGuestListHtml(data, side) {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const guests = (data.guests || []).filter((g) => (side ? g.side === side : true));
  const title = side === "bride" ? "Bride's Guest List" : side === "groom" ? "Groom's Guest List" : "Guest List";
  const dateStr = data.settings.date
    ? new Date(data.settings.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  const invitedPax = guests.reduce((s, g) => s + num(g.invitedPax || 1), 0);
  const attending = guests.filter((g) => g.rsvp === "yes");
  const confirmedPax = attending.reduce((s, g) => s + num(g.confirmedPax || g.invitedPax || 1), 0);
  const vegTotal = attending.reduce((s, g) => s + vegOf(g), 0);

  const byGroup = {};
  guests.forEach((g) => {
    const k = (g.group || "").trim() || "Ungrouped";
    (byGroup[k] = byGroup[k] || []).push(g);
  });

  let n = 0;
  const rows = Object.entries(byGroup)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group, list]) => {
      const gPax = list.reduce((s, g) => s + num(g.invitedPax || 1), 0);
      const head = `<tr class="grp"><td colspan="8">${esc(group)} — ${list.length} invite${list.length === 1 ? "" : "s"} · ${gPax} pax</td></tr>`;
      const body = list
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((g) => {
          n++;
          const mm = membersOf(g);
          const veg = vegOf(g);
          const rsvp =
            g.rsvp === "yes"
              ? `✔ ${num(g.confirmedPax || g.invitedPax)} pax`
              : g.rsvp === "no"
              ? "✗ Declined"
              : "Pending";
          const arrived = g.checkedInAt ? `✔ ${num(g.checkedInPax)} pax` : `☐ &nbsp;____`;
          return `<tr>
            <td class="r">${n}</td>
            <td><b>${esc(g.name)}</b>${mm.length ? `<div class="sub">${esc(mm.map((m) => m.name + (m.type === "baby" ? " 👶" : "") + (m.diet === "veg" ? " 🥗" : "")).join(", "))}</div>` : ""}</td>
            <td>${esc(g.phone || "")}</td>
            <td class="r">${num(g.invitedPax)}${num(g.invitedBabies) > 0 ? ` <span class="sub">(${num(g.invitedBabies)}👶)</span>` : ""}</td>
            <td>${rsvp}</td>
            <td class="r">${veg > 0 ? `${veg} 🥗` : ""}</td>
            <td class="c">${arrived}</td>
            <td class="write"></td>
          </tr>`;
        })
        .join("");
      return head + body;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${esc(title)} — ${esc(data.settings.couple || "Our Wedding")}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,500&family=Jost:wght@400;500;600&display=swap');
  * { box-sizing: border-box; }
  body { font-family: 'Jost', system-ui, sans-serif; color: #443F3A; background: #fff; margin: 0; padding: 32px 36px; }
  header { text-align: center; margin-bottom: 18px; }
  .flourish { color: #BC9459; letter-spacing: 8px; font-size: 15px; }
  h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; font-weight: 700; margin: 6px 0 2px; }
  .subtitle { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; color: #BC9459; font-size: 15px; }
  .totals { text-align: center; font-size: 12px; color: #9A8E82; margin-top: 6px; }
  .totals b { color: #6B8E7B; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 14px; }
  th { text-align: left; text-transform: uppercase; letter-spacing: 1px; font-size: 9.5px; color: #9A8E82; border-bottom: 1.5px solid #BC9459; padding: 5px 6px; }
  td { border-bottom: 1px solid #F0E8DE; padding: 6px; vertical-align: top; }
  td.r, th.r { text-align: right; }
  td.c, th.c { text-align: center; white-space: nowrap; }
  td.write { min-width: 90px; border-bottom: 1px solid #F0E8DE; }
  .sub { font-size: 10px; color: #9A8E82; }
  tr.grp td { background: #F6EEDF; font-weight: 600; font-size: 11px; color: #8A6F3C; border-bottom: none; padding: 5px 8px; }
  tr { page-break-inside: avoid; }
  footer { margin-top: 24px; text-align: center; color: #B0A698; font-size: 10px; }
  @media print { body { padding: 8mm 9mm; } .noprint { display: none; } }
  .noprint { text-align: center; margin-bottom: 14px; }
  .noprint button { background: #BC9459; color: #fff; border: none; border-radius: 999px; padding: 9px 24px; font-size: 13px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
  <div class="noprint"><button onclick="window.print()">🖨️ Print / Save as PDF</button></div>
  <header>
    <div class="flourish">✿&nbsp;❦&nbsp;✿</div>
    <h1>${esc(data.settings.couple || "Our Wedding")}</h1>
    <div class="subtitle">${esc(title)}${dateStr ? ` · ${esc(dateStr)}` : ""}</div>
    <div class="totals">
      <b>${guests.length}</b> invites · <b>${invitedPax}</b> pax invited · <b>${confirmedPax}</b> pax confirmed${vegTotal > 0 ? ` · <b>${vegTotal}</b> vegetarian` : ""}
    </div>
  </header>
  <table>
    <thead>
      <tr><th class="r">#</th><th>Invite / members</th><th>Phone</th><th class="r">Invited</th><th>RSVP</th><th class="r">Veg</th><th class="c">Arrived</th><th>Notes / gift</th></tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="8">No guests on this side yet.</td></tr>`}</tbody>
  </table>
  <footer>Printed ${new Date().toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} · Wedding Book 💍</footer>
</body>
</html>`;
}

// ---------- data: backup, excel export, guest import ----------
function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function DataPanel({ data, up }) {
  const [msg, setMsg] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(null); // parsed backup awaiting confirmation
  const guestFileRef = useRef(null);
  const backupFileRef = useRef(null);
  const qrFileRef = useRef(null);

  const stamp = new Date().toISOString().slice(0, 10);

  // ---- full backup (json) ----
  const exportBackup = () => {
    downloadBlob(JSON.stringify(data, null, 2), `wedding-backup-${stamp}.json`, "application/json");
    setMsg("Backup downloaded. Keep it somewhere safe — it contains everything.");
  };

  // ---- wedding summary report (opens print-ready; user saves as PDF) ----
  const openSummary = () => {
    const w = window.open("", "_blank");
    if (!w) return setMsg("Your browser blocked the report window — allow pop-ups for this site and try again.");
    w.document.write(buildSummaryHtml(data));
    w.document.close();
  };

  // ---- printable guest list per side (paper backup for the door) ----
  const openGuestList = (side) => {
    const w = window.open("", "_blank");
    if (!w) return setMsg("Your browser blocked the report window — allow pop-ups for this site and try again.");
    w.document.write(buildGuestListHtml(data, side));
    w.document.close();
  };

  // ---- excel workbook ----
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    const guestRows = data.guests.map((g) => ({
      Name: g.name,
      Side: cap(g.side || ""),
      Group: g.group || "",
      "Invited Pax": num(g.invitedPax),
      Babies: num(g.invitedBabies),
      Members: membersOf(g).map((m) => m.name + (m.type === "baby" ? " (baby)" : "") + (m.diet === "veg" ? " (veg)" : "")).join(", "),
      Phone: g.phone || "",
      "Invited To": !g.events || g.events.length === 0 ? "All events" : (data.events || []).filter((e) => g.events.includes(e.id)).map((e) => e.name).join(", "),
      RSVP: g.rsvp === "yes" ? "Attending" : g.rsvp === "no" ? "Declined" : "Pending",
      "Confirmed Pax": g.rsvp === "yes" ? num(g.confirmedPax || g.invitedPax) : "",
      "Confirmed Babies": g.rsvp === "yes" ? (g.confirmedBabies === "" || g.confirmedBabies === undefined ? num(g.invitedBabies) : num(g.confirmedBabies)) : "",
      "Confirmed Members": g.rsvp === "yes" && Array.isArray(g.confirmedMembers) ? g.confirmedMembers.join(", ") : "",
      "Vegetarian Meals": g.rsvp === "yes" ? vegOf(g) || "" : "",
      Dietary: g.dietary || "",
      "Invite Sent": g.invitedAt ? new Date(g.invitedAt).toLocaleDateString("en-MY") : "",
      "Checked In Pax": g.checkedInAt ? num(g.checkedInPax) : "",
      "Checked In Babies": g.checkedInAt ? num(g.checkedInBabies) : "",
      "Checked In At": g.checkedInAt ? new Date(g.checkedInAt).toLocaleString("en-MY") : "",
      "Pledged (RM)": num(g.pledgeAmount) || "",
      "Pledge Method": num(g.pledgeAmount) > 0 ? (g.pledgeMethod === "qr" ? "QR" : "cash") : "",
      "Gift (RM)": num(g.giftAmount) || "",
      "Gift Method": num(g.giftAmount) > 0 ? g.giftMethod || "" : "",
      "Gift Note": g.giftNote || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(guestRows), "Guests");

    const budgetRows = data.budget.map((b) => {
      const paid = num(b.paidAmount !== undefined ? b.paidAmount : b.paid ? b.actual : 0);
      return {
        Category: b.category,
        Event: (data.events || []).find((e) => e.id === b.eventId)?.name || "",
        Vendor: b.item,
        "Contact Person": b.contactName || "",
        "Contact No": b.contactPhone || "",
        "Handled By": b.handledBy || "",
        "Budgeted (RM)": num(b.budgeted),
        "Total (RM)": num(b.actual),
        "Paid (RM)": paid,
        "Balance to Pay (RM)": Math.max(0, num(b.actual) - paid),
        "Balance to Pay By": b.dueDate ? new Date(b.dueDate).toLocaleDateString("en-MY") : "",
        "Deposit to Collect (RM)": num(b.deposit) || "",
        "Deposit Collected": num(b.deposit) > 0 ? (b.depositCollected ? "Yes" : "No") : "",
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(budgetRows), "Budget");

    const extraRows = data.extraGifts.map((x) => ({
      From: x.name,
      Side: cap(x.side || "bride"),
      "Amount (RM)": num(x.amount),
      Method: x.method || "",
      Note: x.note || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(extraRows), "Other Gifts");

    const todoRows = (data.todos || []).map((t) => ({
      Task: t.title,
      Done: t.done ? "Yes" : "No",
      "Due Date": t.due ? new Date(t.due).toLocaleDateString("en-MY") : "",
      "Handled By": t.assignee || "",
    }));
    if (todoRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(todoRows), "To-dos");

    const catererRows = data.caterers.map((c) => ({
      Caterer: c.name,
      Pricing: c.mode === "table" ? "Per table" : "Per head",
      "Unit Price (RM)": num(c.unitPrice),
      "Pax per Table": c.mode === "table" ? num(c.paxPerTable) : "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catererRows), "Caterers");

    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `wedding-book-${stamp}.xlsx`, "");
    setMsg("Excel workbook downloaded — Guests, Budget, Other Gifts and Caterers as separate sheets.");
  };

  // ---- import guests from excel/csv ----
  const importGuests = async (file) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (!rows.length) return setMsg("That file appears to be empty.");

      // loose header matching: find a column by candidate names
      const keys = Object.keys(rows[0]);
      const find = (...cands) => keys.find((k) => cands.some((c) => k.toLowerCase().replace(/[^a-z]/g, "").includes(c)));
      const kName = find("name", "guest");
      if (!kName) return setMsg(`Couldn't find a Name column. Found columns: ${keys.join(", ")}. Please make sure one column is called "Name".`);
      const kSide = find("side");
      const kGroup = find("group", "relation", "family");
      const kPax = find("pax", "persons", "people", "qty");
      const kBaby = find("bab", "infant");
      const kPhone = find("phone", "contact", "whatsapp", "mobile", "tel");
      const kMembers = find("member", "subfamily", "names");

      const existing = new Set(data.guests.map((g) => g.name.trim().toLowerCase()));
      let added = 0,
        skipped = 0;
      const newGuests = [];
      rows.forEach((r) => {
        const name = String(r[kName] || "").trim();
        if (!name) return;
        if (existing.has(name.toLowerCase())) {
          skipped++;
          return;
        }
        const sideRaw = kSide ? String(r[kSide]).toLowerCase() : "";
        const members = kMembers ? parseMembers(String(r[kMembers])).map((n) => ({ name: n, type: "adult" })) : [];
        const pax = Math.max(kPax ? num(r[kPax]) || 1 : 1, members.length);
        newGuests.push({
          id: uid(),
          name,
          side: sideRaw.includes("groom") ? "groom" : "bride",
          group: kGroup ? String(r[kGroup]).trim() : "",
          invitedPax: pax,
          invitedBabies: kBaby ? Math.min(num(r[kBaby]), pax) : 0,
          members: members.length ? members : undefined,
          phone: kPhone ? String(r[kPhone]).trim() : "",
          rsvp: "pending",
          confirmedPax: "",
          confirmedBabies: "",
          dietary: "",
          giftAmount: "",
          giftMethod: "cash",
          giftNote: "",
        });
        existing.add(name.toLowerCase());
        added++;
      });
      up({ guests: [...newGuests, ...data.guests] });
      setMsg(`Imported ${added} guests${skipped ? ` · skipped ${skipped} duplicates (same name)` : ""}. Guests without a Side column default to the bride's side — adjust in list view if needed.`);
    } catch (e) {
      setMsg("Couldn't read that file. Please upload an .xlsx, .xls or .csv file.");
    }
  };

  // ---- restore backup ----
  const readBackup = async (file) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.guests)) return setMsg("That doesn't look like a wedding backup file.");
      setConfirmRestore(parsed);
      setMsg("");
    } catch (e) {
      setMsg("Couldn't read that file — it should be a .json backup exported from this app.");
    }
  };

  // ---- gift QR image (shown to guests at check-in) ----
  const importQr = (file) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 480; // keep the stored image small — it lives inside the shared data
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.length > 300000) dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      if (dataUrl.length > 400000) return setMsg("That image is too heavy — please crop it to just the QR code and try again.");
      up({ settings: { ...data.settings, qrImage: dataUrl } });
      setMsg("QR image saved — guests who pick “QR transfer” at check-in will now see it.");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setMsg("Couldn't read that image — please upload a PNG or JPG.");
    };
    img.src = url;
  };

  const doRestore = () => {
    const p = confirmRestore;
    up({ ...EMPTY, ...p, settings: { ...EMPTY.settings, ...(p.settings || {}) } });
    setConfirmRestore(null);
    setMsg(`Backup restored — ${(p.guests || []).length} guests, ${(p.budget || []).length} budget items, ${(p.extraGifts || []).length} other gifts.`);
  };

  return (
    <div className="grid gap-4">
      <Card>
        <div style={{ ...serif, fontSize: 20, fontWeight: 600 }}>How your data is stored</div>
        <p className="text-sm mt-1" style={{ color: C.muted }}>
          Everything saves automatically to this app's shared storage — that's the live database all four of you work
          from. The tools below give you a physical copy: backups you can keep, an Excel file you can print or send to
          your venue, and a quick way to import a guest list you already have.
        </p>
        <div className="text-sm mt-3 grid gap-1" style={{ wordBreak: "break-all" }}>
          <div>
            <span style={{ color: C.muted }}>👥 Team link (opens your wedding's sign-in): </span>
            <b style={{ color: C.ink }}>{`${location.origin}${location.pathname}?w=${WEDDING}`}</b>
          </div>
          <div>
            <span style={{ color: C.muted }}>💌 RSVP link for guests (locked — they see only the RSVP page): </span>
            <b style={{ color: C.ink }}>{`${location.origin}${location.pathname}?w=${WEDDING}&p=rsvp`}</b>
          </div>
          <div>
            <span style={{ color: C.muted }}>🎟️ Check-in link for the door (locked — kiosk mode for a tablet/laptop): </span>
            <b style={{ color: C.ink }}>{`${location.origin}${location.pathname}?w=${WEDDING}&p=checkin`}</b>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <div style={{ ...serif, fontSize: 18, fontWeight: 600 }}>⬇️ Export</div>
          <p className="text-xs mt-1 mb-3" style={{ color: C.muted }}>
            Download a copy of everything. Do this every so often — especially the week of the wedding.
          </p>
          <div className="flex flex-wrap gap-2">
            <Btn onClick={exportExcel}>Excel workbook (.xlsx)</Btn>
            <Btn kind="gold" onClick={openSummary}>📄 Wedding summary (PDF)</Btn>
            <Btn kind="ghost" onClick={exportBackup}>Full backup (.json)</Btn>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Btn kind="ghost" onClick={() => openGuestList("bride")}>🖨️ Bride's guest list</Btn>
            <Btn kind="ghost" onClick={() => openGuestList("groom")}>🖨️ Groom's guest list</Btn>
            <Btn kind="ghost" onClick={() => openGuestList(null)}>🖨️ Full guest list</Btn>
          </div>
          <p className="text-xs mt-3" style={{ color: C.muted }}>
            The Excel file has separate sheets for Guests (with RSVP + gifts), Budget, Other Gifts, Caterers and
            To-dos. The wedding summary and guest lists open print-ready — pick “Save as PDF” in the print dialog.
            Print the guest lists before the big day as a paper backup for the door: they include members, phone,
            RSVP, veg counts, and blank Arrived/Notes columns to fill in by pen. The .json backup is for restoring
            into this app.
          </p>
        </Card>

        <Card>
          <div style={{ ...serif, fontSize: 18, fontWeight: 600 }}>⬆️ Import guest list</div>
          <p className="text-xs mt-1 mb-3" style={{ color: C.muted }}>
            Already have names in Excel or Google Sheets? Upload the file (.xlsx / .csv) and they'll be added as
            pending guests. Recognised columns: <b>Name</b> (required), Side, Group, Pax, Babies, Phone, Members
            (comma-separated names under that invite).
          </p>
          <input
            ref={guestFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) importGuests(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <Btn onClick={() => guestFileRef.current && guestFileRef.current.click()}>Choose file…</Btn>
          <p className="text-xs mt-3" style={{ color: C.muted }}>
            Duplicate names already in the app are skipped, so it's safe to re-upload an updated file.
          </p>
        </Card>
      </div>

      <Card>
        <div style={{ ...serif, fontSize: 18, fontWeight: 600 }}>♻️ Restore from backup</div>
        <p className="text-xs mt-1 mb-3" style={{ color: C.muted }}>
          Replaces <b>everything currently in the app</b> with the contents of a .json backup. Use with care.
        </p>
        <input
          ref={backupFileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) readBackup(e.target.files[0]);
            e.target.value = "";
          }}
        />
        {!confirmRestore ? (
          <Btn kind="ghost" onClick={() => backupFileRef.current && backupFileRef.current.click()}>
            Choose backup file…
          </Btn>
        ) : (
          <div className="p-3" style={{ background: C.redSoft, border: `1px solid ${C.red}`, borderRadius: 10 }}>
            <div className="text-sm font-semibold" style={{ color: C.red }}>
              Replace current data?
            </div>
            <div className="text-xs mt-1" style={{ color: C.muted }}>
              Backup contains {(confirmRestore.guests || []).length} guests, {(confirmRestore.budget || []).length} budget items,{" "}
              {(confirmRestore.extraGifts || []).length} other gifts. Current data will be overwritten for everyone.
            </div>
            <div className="flex gap-2 mt-2">
              <Btn small onClick={doRestore}>Yes, restore</Btn>
              <Btn kind="ghost" small onClick={() => setConfirmRestore(null)}>Cancel</Btn>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div style={{ ...serif, fontSize: 18, fontWeight: 600 }}>📱 Gift QR code</div>
        <p className="text-xs mt-1 mb-3" style={{ color: C.muted }}>
          Upload your DuitNow / bank transfer QR image. Guests who choose “QR transfer” at check-in will see it and
          can scan it with their banking app to send their gift.
        </p>
        {data.settings.qrImage && (
          <img
            src={data.settings.qrImage}
            alt="Gift QR"
            style={{ maxWidth: 180, borderRadius: 10, border: `1px solid ${C.line}`, background: "#fff", padding: 6 }}
          />
        )}
        <input
          ref={qrFileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) importQr(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <div className="flex gap-2 mt-3">
          <Btn onClick={() => qrFileRef.current && qrFileRef.current.click()}>
            {data.settings.qrImage ? "Replace image…" : "Upload QR image…"}
          </Btn>
          {data.settings.qrImage && (
            <Btn kind="danger" onClick={() => up({ settings: { ...data.settings, qrImage: "" } })}>
              Remove
            </Btn>
          )}
        </div>
      </Card>

      {msg && (
        <Card style={{ borderColor: C.gold }}>
          <span className="text-sm" style={{ color: C.ink }}>{msg}</span>
        </Card>
      )}
    </div>
  );
}

// ---------- whatsapp invitations ----------
function InvitePanel({ data, up, pool }) {
  const [open, setOpen] = useState(false);
  const [queueIdx, setQueueIdx] = useState(0);

  const template = data.settings.inviteTemplate || DEFAULT_TEMPLATE;
  const setTemplate = (t) => up({ settings: { ...data.settings, inviteTemplate: t } });
  const patch = (id, p) => up({ guests: data.guests.map((g) => (g.id === id ? { ...g, ...p } : g)) });

  const withPhone = pool.filter((g) => waNumber(g.phone));
  const noPhone = pool.length - withPhone.length;
  const notInvited = withPhone.filter((g) => !g.invitedAt);
  const previewGuest = withPhone[0] || pool[0] || { name: "Uncle Lim & family", invitedPax: 4 };

  const queue = notInvited;
  const current = queue[Math.min(queueIdx, queue.length - 1)];

  const sendCurrent = () => {
    if (!current) return;
    const msg = buildInviteMessage(template, current, data.settings);
    const link = waLink(current.phone, msg);
    if (link) {
      window.open(link, "_blank");
      patch(current.id, { invitedAt: Date.now() });
      setQueueIdx(0); // list shrinks as guests get marked invited
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div style={{ ...serif, fontSize: 20, fontWeight: 600 }}>💬 WhatsApp invitations</div>
          <div className="text-xs mt-1" style={{ color: C.muted }}>
            {withPhone.length} guests with phone numbers · {notInvited.length} not yet invited
            {noPhone > 0 ? ` · ${noPhone} missing a number` : ""}
          </div>
        </div>
        <Btn kind="ghost" small onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Open"}
        </Btn>
      </div>

      {open && (
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          {/* template editor */}
          <div>
            <div className="grid gap-3 mb-3">
              <Field label="Venue name">
                <input
                  style={inputStyle}
                  value={data.settings.venueName || ""}
                  onChange={(e) => up({ settings: { ...data.settings, venueName: e.target.value } })}
                  placeholder="e.g. Full Gospel Assembly KL"
                />
              </Field>
              <Field label="Google Maps link">
                <input
                  style={inputStyle}
                  value={data.settings.venueMaps || ""}
                  onChange={(e) => up({ settings: { ...data.settings, venueMaps: e.target.value } })}
                  placeholder="https://maps.google.com/…"
                />
              </Field>
              <Field label="Waze link">
                <input
                  style={inputStyle}
                  value={data.settings.venueWaze || ""}
                  onChange={(e) => up({ settings: { ...data.settings, venueWaze: e.target.value } })}
                  placeholder="https://waze.com/…"
                />
              </Field>
            </div>
            <Field label="Message template">
              <textarea
                style={{ ...inputStyle, minHeight: 190, resize: "vertical", fontFamily: "inherit" }}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              />
            </Field>
            <div className="text-xs mt-2" style={{ color: C.muted }}>
              Placeholders: <b>{"{name}"}</b> guest's name · <b>{"{couple}"}</b> your names · <b>{"{date}"}</b> wedding
              date · <b>{"{pax}"}</b> their invited pax · <b>{"{location}"}</b> the venue name with Google Maps and
              Waze links (set above) · <b>{"{rsvp}"}</b> a link where the guest replies directly in the app (their
              answer updates your list automatically). The template is shared, so set it once and both accountants use
              the same wording.
            </div>
            <div className="mt-2">
              <Btn kind="ghost" small onClick={() => setTemplate(DEFAULT_TEMPLATE)}>
                Reset to default
              </Btn>
            </div>
          </div>

          {/* preview + send queue */}
          <div>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>
              Preview — as {previewGuest.name} will receive it
            </div>
            <div
              className="text-sm whitespace-pre-wrap p-3"
              style={{ background: C.waSoft, border: `1px solid ${C.waBorder}`, borderRadius: "12px 12px 12px 2px", color: C.waText }}
            >
              {buildInviteMessage(template, previewGuest, data.settings)}
            </div>

            <div className="mt-4 p-3" style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 10 }}>
              <div className="text-sm font-semibold mb-1">Send one by one</div>
              {queue.length === 0 ? (
                <div className="text-xs" style={{ color: C.muted }}>
                  Everyone with a phone number has been invited 🎉 — use the 💬 button on a guest's card to resend.
                </div>
              ) : (
                <>
                  <div className="text-xs mb-2" style={{ color: C.muted }}>
                    Next up: <b style={{ color: C.ink }}>{current.name}</b> ({current.phone}) · {queue.length} remaining
                  </div>
                  <div className="flex gap-2">
                    <Btn small onClick={sendCurrent}>
                      Open in WhatsApp & mark invited
                    </Btn>
                    <Btn
                      kind="ghost"
                      small
                      onClick={() => setQueueIdx((i) => (i + 1) % queue.length)}
                    >
                      Skip
                    </Btn>
                  </div>
                  <div className="text-xs mt-2" style={{ color: C.muted }}>
                    Each tap opens WhatsApp with the message pre-filled for that guest — you just press send there.
                    WhatsApp doesn't allow apps to send silently in bulk, so it's one confirm-tap per guest.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- family tree ----------
function branchStats(guests) {
  const invites = guests.length;
  const pax = guests.reduce((s, g) => s + num(g.invitedPax || 1), 0);
  const babies = guests.reduce((s, g) => s + Math.min(num(g.invitedBabies), num(g.invitedPax || 1)), 0);
  const attending = guests.filter((g) => g.rsvp === "yes").length;
  return { invites, pax, babies, attending };
}

function rsvpDot(rsvp) {
  const color = rsvp === "yes" ? C.green : rsvp === "no" ? C.red : C.gold;
  const label = rsvp === "yes" ? "Attending" : rsvp === "no" ? "Declined" : "Pending";
  return (
    <span title={label} style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block", flexShrink: 0 }} />
  );
}

// build a nested tree from group paths like "Dad's family / Uncle Ravi's family"
function buildGroupTree(guests) {
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
function collectGuests(node) {
  return Object.values(node.children).reduce((acc, c) => acc.concat(collectGuests(c)), [...node.guests]);
}

function GuestLeaf({ g }) {
  return (
    <div className="flex items-center" style={{ paddingTop: 6 }}>
      <span style={{ width: 12, borderTop: `2px dashed ${C.line}`, flexShrink: 0 }} />
      <div className="flex items-center gap-2 flex-1 flex-wrap" style={{ padding: "4px 8px", borderRadius: 8 }}>
        {rsvpDot(g.rsvp)}
        <span className="text-sm">{g.name}</span>
        <span className="text-xs" style={{ color: C.muted }}>
          {g.invitedPax} pax{num(g.invitedBabies) > 0 ? ` · ${num(g.invitedBabies)} 👶` : ""}
        </span>
        {g.dietary && (
          <span className="text-xs" style={{ color: C.gold }} title={g.dietary}>
            🍽 {g.dietary}
          </span>
        )}
        {membersOf(g).length > 0 && (
          <div className="w-full text-xs" style={{ paddingLeft: 16 }}>
            {membersOf(g).map((m, i) => {
              const known = g.rsvp === "yes" && Array.isArray(g.confirmedMembers);
              const coming = known ? g.confirmedMembers.includes(m.name) : null;
              return (
                <span
                  key={m.name}
                  style={{
                    color: coming === true ? C.green : C.muted,
                    textDecoration: coming === false ? "line-through" : "none",
                  }}
                >
                  {i > 0 ? ", " : "└ "}
                  {m.name}
                  {m.type === "baby" ? " 👶" : ""}
                  {m.diet === "veg" ? " 🥗" : ""}
                  {coming === true ? " ✓" : ""}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Branch({ name, node, path, collapsed, toggle }) {
  const st = branchStats(collectGuests(node));
  const isCollapsed = !!collapsed[path];
  const subBranches = Object.entries(node.children).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="mt-2">
      <div className="flex items-center">
        <span style={{ width: 14, borderTop: `2px solid ${C.line}`, flexShrink: 0 }} />
        <button
          onClick={() => toggle(path)}
          className="flex items-center gap-2 flex-1 text-left p-2"
          style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer" }}
        >
          <span className="text-xs" style={{ color: C.muted }}>
            {isCollapsed ? "▸" : "▾"}
          </span>
          <span className="text-sm font-semibold">{name}</span>
          <span className="text-xs ml-auto" style={{ color: C.muted }}>
            {st.invites} invites · {st.pax} pax{st.babies > 0 ? ` · ${st.babies} 👶` : ""}
          </span>
        </button>
      </div>
      {!isCollapsed && (
        <div style={{ marginLeft: 28, borderLeft: `2px dashed ${C.line}` }}>
          {subBranches.map(([n, child]) => (
            <Branch key={n} name={n} node={child} path={`${path}/${n}`} collapsed={collapsed} toggle={toggle} />
          ))}
          {node.guests.map((g) => (
            <GuestLeaf key={g.id} g={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function FamilyTree({ pool, side, coupleName }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const sides = side ? [side] : ["bride", "groom"];

  return (
    <Card>
      <div style={{ ...serif, fontSize: 20, fontWeight: 600 }}>Family tree</div>
      <p className="text-xs mt-1 mb-3" style={{ color: C.muted }}>
        Grouped by side, then by group/relation. Use / in a guest's group to nest sub-families — e.g.{" "}
        <b>Joan's Family / Father's side / Uncle's family</b> shows each level as its own branch. Change a guest's
        group with ✏️ Edit in list view. ● green = attending, ● amber = pending, ● red = declined.
      </p>

      {/* root */}
      <div className="text-center mb-4">
        <span
          style={{
            ...serif,
            fontSize: 18,
            fontWeight: 700,
            background: C.goldSoft,
            color: C.gold,
            borderRadius: 999,
            padding: "6px 18px",
            border: `1px solid ${C.gold}`,
          }}
        >
          💍 {coupleName || "The Couple"}
        </span>
      </div>

      <div className={sides.length === 2 ? "grid md:grid-cols-2 gap-4" : "grid gap-4"}>
        {sides.map((s) => {
          const sideGuests = pool.filter((g) => g.side === s);
          const tree = buildGroupTree(sideGuests);
          const st = branchStats(sideGuests);
          const tone = s === "bride" ? C.gold : C.green;
          const toneSoft = s === "bride" ? C.goldSoft : C.greenSoft;

          return (
            <div key={s}>
              {/* side node */}
              <div
                className="flex items-center gap-2 p-2"
                style={{ background: toneSoft, border: `1px solid ${tone}`, borderRadius: 10 }}
              >
                <span className="font-semibold" style={{ color: tone }}>
                  {s === "bride" ? "🌸 Bride's side" : "🤵 Groom's side"}
                </span>
                <span className="text-xs ml-auto" style={{ color: C.muted }}>
                  {st.invites} invites · {st.pax} pax{st.babies > 0 ? ` · ${st.babies} 👶` : ""} · {st.attending} attending
                </span>
              </div>

              {/* branches */}
              <div style={{ marginLeft: 14, borderLeft: `2px solid ${C.line}`, paddingLeft: 0 }}>
                {Object.entries(tree.children)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([name, node]) => (
                    <Branch key={name} name={name} node={node} path={`${s}:${name}`} collapsed={collapsed} toggle={toggle} />
                  ))}
                {sideGuests.length === 0 && (
                  <div className="text-xs p-2" style={{ color: C.muted }}>
                    No guests on this side yet.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- catering (couple only) ----------
function Catering({ data, up, stats }) {
  const events = data.events || [];
  const [selEvent, setSelEvent] = useState(events[0] ? events[0].id : "");
  const [form, setForm] = useState({ name: "", mode: "table", unitPrice: "", paxPerTable: 10 });

  // headcount for the selected event only
  const pool = data.guests.filter((g) => guestInEvent(g, selEvent));
  const attending = pool.filter((g) => g.rsvp === "yes");
  const calcEating = (list, useConfirmed) =>
    list.reduce((s, g) => {
      const pax = useConfirmed ? num(g.confirmedPax || g.invitedPax || 1) : num(g.invitedPax || 1);
      const babies = useConfirmed
        ? Math.min(g.confirmedBabies === "" || g.confirmedBabies === undefined ? num(g.invitedBabies) : num(g.confirmedBabies), pax)
        : Math.min(num(g.invitedBabies), pax);
      return s + Math.max(0, pax - babies);
    }, 0);
  const calcBabies = (list, useConfirmed) =>
    list.reduce((s, g) => {
      const pax = useConfirmed ? num(g.confirmedPax || g.invitedPax || 1) : num(g.invitedPax || 1);
      const b = useConfirmed
        ? (g.confirmedBabies === "" || g.confirmedBabies === undefined ? num(g.invitedBabies) : num(g.confirmedBabies))
        : num(g.invitedBabies);
      return s + Math.min(b, pax);
    }, 0);

  const usingConfirmed = attending.length > 0;
  const basePax = usingConfirmed ? calcEating(attending, true) : calcEating(pool, false);
  const babies = usingConfirmed ? calcBabies(attending, true) : calcBabies(pool, false);
  const vegMeals = (usingConfirmed ? attending : pool).reduce((s, g) => s + vegOf(g), 0);
  const buffer = num(data.bufferPct);
  const plannedPax = Math.ceil(basePax * (1 + buffer / 100));
  const selEventObj = events.find((e) => e.id === selEvent);

  const add = () => {
    if (!form.name.trim() || !num(form.unitPrice)) return;
    up({
      caterers: [
        ...data.caterers,
        { id: uid(), eventId: selEvent, name: form.name.trim(), mode: form.mode, unitPrice: num(form.unitPrice), paxPerTable: num(form.paxPerTable) || 10 },
      ],
    });
    setForm({ name: "", mode: form.mode, unitPrice: "", paxPerTable: 10 });
  };
  const remove = (id) => up({ caterers: data.caterers.filter((c) => c.id !== id) });

  const rows = data.caterers
    .filter((c) => !c.eventId || c.eventId === selEvent)
    .map((c) => {
      if (c.mode === "table") {
        const tables = Math.max(1, Math.ceil(plannedPax / (c.paxPerTable || 10)));
        return { ...c, unitsLabel: `${tables} tables × ${RM(c.unitPrice)}`, cost: tables * c.unitPrice, perHead: plannedPax > 0 ? (tables * c.unitPrice) / plannedPax : 0 };
      }
      return { ...c, unitsLabel: `${plannedPax} pax × ${RM(c.unitPrice)}`, cost: plannedPax * c.unitPrice, perHead: c.unitPrice };
    });
  const cheapest = rows.length ? Math.min(...rows.map((r) => r.cost)) : null;

  return (
    <div className="grid gap-4">
      {events.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {events.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelEvent(e.id)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${selEvent === e.id ? C.green : C.line}`,
                background: selEvent === e.id ? C.greenSoft : C.card,
                color: selEvent === e.id ? C.green : C.muted,
              }}
            >
              {e.icon || "🎉"} {e.name}
            </button>
          ))}
        </div>
      )}

      <Card>
        <div style={{ ...serif, fontSize: 20, fontWeight: 600 }}>
          Headcount — {selEventObj ? `${selEventObj.icon || ""} ${selEventObj.name}` : "Catering"}
        </div>
        <p className="text-sm mt-1" style={{ color: C.muted }}>
          {pool.length} invites tagged to this event. Based on {usingConfirmed ? "confirmed RSVPs" : "invited pax (no RSVPs confirmed yet)"}:{" "}
          <b style={{ color: C.ink }}>{basePax} eating pax</b>
          {babies > 0 && (
            <>
              {" "}· <b style={{ color: C.gold }}>{babies} 👶 excluded</b> from food count
            </>
          )}
          {vegMeals > 0 && (
            <>
              {" "}· <b style={{ color: C.green }}>{vegMeals} 🥗 vegetarian</b>
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-4 items-end mt-3">
          <Field label="Buffer multiplier (%)">
            <input style={{ ...inputStyle, width: 110 }} type="number" min="0" value={data.bufferPct} onChange={(e) => up({ bufferPct: e.target.value })} />
          </Field>
          <div className="pb-1">
            <div className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>
              Plan food for
            </div>
            <div style={{ ...serif, fontSize: 28, fontWeight: 700, color: C.green }}>{plannedPax} pax</div>
          </div>
        </div>
        <p className="text-xs mt-2" style={{ color: C.muted }}>
          A 10–15% buffer covers plus-ones, late confirmations and vendors' meals. The number updates automatically as
          RSVPs come in. Tag guests to events on their card in Guests & RSVP.
        </p>
      </Card>

      <Card>
        <div style={{ ...serif, fontSize: 20, fontWeight: 600 }} className="mb-3">
          Compare caterers {selEventObj && events.length > 1 ? `for ${selEventObj.name}` : ""}
        </div>
        <div className="grid md:grid-cols-5 gap-3 items-end">
          <Field label="Caterer / package" className="md:col-span-2">
            <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Restoran Ah Yat – Package B" onKeyDown={(e) => e.key === "Enter" && add()} />
          </Field>
          <Field label="Pricing">
            <select style={inputStyle} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option value="table">Per table</option>
              <option value="head">Per head (buffet)</option>
            </select>
          </Field>
          <Field label={form.mode === "table" ? "Price per table (RM)" : "Price per head (RM)"}>
            <input style={inputStyle} type="number" min="0" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
          </Field>
          {form.mode === "table" ? (
            <Field label="Pax per table">
              <input style={inputStyle} type="number" min="1" value={form.paxPerTable} onChange={(e) => setForm({ ...form, paxPerTable: e.target.value })} />
            </Field>
          ) : (
            <div>
              <Btn onClick={add}>Add</Btn>
            </div>
          )}
        </div>
        {form.mode === "table" && (
          <div className="mt-3">
            <Btn onClick={add}>Add</Btn>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm mt-4" style={{ color: C.muted }}>
            Add a couple of quotes to compare — costs recalculate for {plannedPax} pax automatically.
          </p>
        ) : (
          <div className="mt-4 grid gap-2">
            {rows
              .slice()
              .sort((a, b) => a.cost - b.cost)
              .map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 p-3"
                  style={{
                    border: `1px solid ${r.cost === cheapest ? C.gold : C.line}`,
                    background: r.cost === cheapest ? C.goldSoft : C.soft,
                    borderRadius: 10,
                  }}
                >
                  <div className="font-semibold">{r.name}</div>
                  {r.cost === cheapest && <Pill tone="gold">Best price</Pill>}
                  <span className="text-sm" style={{ color: C.muted }}>
                    {r.unitsLabel}
                  </span>
                  <div className="ml-auto text-right">
                    <div className="font-bold">{RM(r.cost)}</div>
                    <div className="text-xs" style={{ color: C.muted }}>
                      ≈ {RM(r.perHead)} / head
                    </div>
                  </div>
                  <Btn kind="danger" small onClick={() => remove(r.id)}>
                    ✕
                  </Btn>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- budget (couple only) ----------
const BUDGET_CATS = ["Venue & catering", "Attire & beauty", "Photography & video", "Decor & flowers", "Invitations", "Rings & jewellery", "Entertainment", "Dowry / hantaran", "Honeymoon", "Other"];

function Budget({ data, up, stats }) {
  const events = data.events || [];
  const [evFilter, setEvFilter] = useState("all");
  const [form, setForm] = useState({
    category: BUDGET_CATS[0],
    eventId: events[0] ? events[0].id : "",
    item: "",
    contactName: "",
    contactPhone: "",
    budgeted: "",
    actual: "",
    paidAmount: "",
    dueDate: "",
    deposit: "",
    handledBy: "",
  });

  const add = () => {
    if (!form.item.trim()) return;
    up({
      budget: [
        ...data.budget,
        {
          id: uid(),
          category: form.category,
          eventId: form.eventId,
          item: form.item.trim(),
          contactName: form.contactName.trim(),
          contactPhone: form.contactPhone.trim(),
          budgeted: num(form.budgeted),
          actual: num(form.actual),
          paidAmount: num(form.paidAmount),
          dueDate: form.dueDate,
          deposit: num(form.deposit),
          depositCollected: false,
          handledBy: form.handledBy.trim(),
        },
      ],
    });
    setForm({ category: form.category, eventId: form.eventId, item: "", contactName: "", contactPhone: "", budgeted: "", actual: "", paidAmount: "", dueDate: "", deposit: "", handledBy: form.handledBy });
  };

  const patch = (id, p) => up({ budget: data.budget.map((b) => (b.id === id ? { ...b, ...p } : b)) });
  const remove = (id) => up({ budget: data.budget.filter((b) => b.id !== id) });

  // migration: old items used a paid checkbox instead of a paid amount
  const paidOf = (b) => num(b.paidAmount !== undefined ? b.paidAmount : b.paid ? b.actual : 0);
  const balanceOf = (b) => num(b.actual) - paidOf(b);
  const isOverdue = (b) => b.dueDate && balanceOf(b) > 0 && new Date(b.dueDate) < new Date(new Date().toDateString());
  const evName = (id) => {
    const e = events.find((x) => x.id === id);
    return e ? `${e.icon || "🎉"} ${e.name}` : null;
  };

  const visible = data.budget.filter((b) => evFilter === "all" || b.eventId === evFilter || (!b.eventId && evFilter === "untagged"));
  const filteredTotal = visible.reduce((s, x) => s + num(x.actual), 0);
  const filteredPaid = visible.reduce((s, x) => s + paidOf(x), 0);

  const byCat = {};
  visible.forEach((b) => {
    (byCat[b.category] = byCat[b.category] || []).push(b);
  });

  return (
    <div className="grid gap-4">
      {events.length > 1 && (
        <div className="flex gap-2 flex-wrap items-center">
          {[["all", "All events"], ...events.map((e) => [e.id, `${e.icon || "🎉"} ${e.name}`])].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setEvFilter(k)}
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${evFilter === k ? C.green : C.line}`,
                background: evFilter === k ? C.greenSoft : C.card,
                color: evFilter === k ? C.green : C.muted,
              }}
            >
              {label}
            </button>
          ))}
          {evFilter !== "all" && (
            <span className="text-xs ml-auto" style={{ color: C.muted }}>
              This event: {RM(filteredPaid)} paid of {RM(filteredTotal)} · balance {RM(Math.max(0, filteredTotal - filteredPaid))}
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Planned budget" value={RM(stats.budgeted)} />
        <Stat label="Committed (totals)" value={RM(stats.actual)} tone={stats.actual > stats.budgeted && stats.budgeted > 0 ? C.red : C.ink} sub={stats.budgeted > 0 ? `${Math.round((stats.actual / stats.budgeted) * 100)}% of plan` : undefined} />
        <Stat label="Paid out" value={RM(stats.paidOut)} tone={C.green} />
        <Stat label="Balance to pay" value={RM(stats.balanceToPay)} tone={stats.balanceToPay > 0 ? C.gold : C.green} sub={stats.depositsToCollect > 0 ? `+ ${RM(stats.depositsToCollect)} deposits to collect back` : undefined} />
      </div>

      <Card>
        <div style={{ ...serif, fontSize: 20, fontWeight: 600 }} className="mb-3">
          Add a vendor / expense
        </div>
        <div className="grid md:grid-cols-6 gap-3 items-end">
          <Field label="Category">
            <select style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {BUDGET_CATS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          {events.length > 1 && (
            <Field label="Event">
              <select style={inputStyle} value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })}>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.icon || "🎉"} {e.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Vendor / item" className="md:col-span-2">
            <input style={inputStyle} value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="e.g. Canopy + haldi decor + welcome board" onKeyDown={(e) => e.key === "Enter" && add()} />
          </Field>
          <Field label="Budgeted (RM)">
            <input style={inputStyle} type="number" min="0" value={form.budgeted} onChange={(e) => setForm({ ...form, budgeted: e.target.value })} />
          </Field>
          <Field label="Total (RM)">
            <input style={inputStyle} type="number" min="0" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} />
          </Field>
          <Field label="Paid so far (RM)">
            <input style={inputStyle} type="number" min="0" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: e.target.value })} />
          </Field>
        </div>
        <div className="grid md:grid-cols-6 gap-3 items-end mt-3">
          <Field label="Contact person">
            <input style={inputStyle} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="e.g. Meraki / Asha" />
          </Field>
          <Field label="Contact no">
            <input style={inputStyle} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="012-7080865" />
          </Field>
          <Field label="Balance to pay by">
            <input style={inputStyle} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
          <Field label="Deposit to collect (RM)">
            <input style={inputStyle} type="number" min="0" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} />
          </Field>
          <Field label="Handled by">
            <input style={inputStyle} value={form.handledBy} onChange={(e) => setForm({ ...form, handledBy: e.target.value })} placeholder="e.g. Kenneth" />
          </Field>
          <div>
            <Btn onClick={add}>Add</Btn>
          </div>
        </div>
        <p className="text-xs mt-2" style={{ color: C.muted }}>
          Balance to pay is calculated automatically (Total − Paid). "Deposit to collect" is a refundable deposit the
          vendor holds — tick it off once you get the money back after the event.
        </p>
      </Card>

      {Object.keys(byCat).length === 0 && (
        <Card>
          <span style={{ color: C.muted }}>No vendors yet. Common first entries: venue deposit, photographer, bridal package.</span>
        </Card>
      )}

      {Object.entries(byCat).map(([cat, items]) => {
        const catTotal = items.reduce((s, x) => s + num(x.actual), 0);
        const catPaid = items.reduce((s, x) => s + paidOf(x), 0);
        return (
          <Card key={cat} style={{ padding: 14 }}>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <div style={{ ...serif, fontSize: 18, fontWeight: 600 }}>{cat}</div>
              <span className="text-xs ml-auto" style={{ color: C.muted }}>
                {RM(catPaid)} paid of {RM(catTotal)} total
              </span>
            </div>
            <div className="grid gap-2">
              {items.map((b) => {
                const bal = balanceOf(b);
                const settled = num(b.actual) > 0 && bal <= 0;
                const overdue = isOverdue(b);
                return (
                  <div key={b.id} className="p-3" style={{ background: C.soft, border: `1px solid ${overdue ? C.red : C.line}`, borderRadius: 8 }}>
                    {/* line 1: name, contact, handled by, status */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{b.item}</span>
                      {evFilter === "all" && b.eventId && evName(b.eventId) && <Pill tone="green">{evName(b.eventId)}</Pill>}
                      {(b.contactName || b.contactPhone) && (
                        <span className="text-xs" style={{ color: C.muted }}>
                          👤 {b.contactName}{b.contactName && b.contactPhone ? " · " : ""}{b.contactPhone}
                        </span>
                      )}
                      {b.handledBy && <Pill>📋 {b.handledBy}</Pill>}
                      <div className="ml-auto flex items-center gap-2">
                        {settled ? (
                          <Pill tone="green">Settled ✓</Pill>
                        ) : bal > 0 ? (
                          <Pill tone={overdue ? "red" : "gold"}>
                            {overdue ? "⚠️ Overdue: " : "Balance: "}{RM(bal)}
                            {b.dueDate ? ` by ${new Date(b.dueDate).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                          </Pill>
                        ) : null}
                        <Btn kind="danger" small onClick={() => remove(b.id)}>✕</Btn>
                      </div>
                    </div>
                    {/* line 2: money inputs */}
                    <div className="flex flex-wrap items-end gap-3 mt-2">
                      <Field label="Budgeted">
                        <input style={{ ...inputStyle, width: 100, padding: "4px 8px" }} type="number" min="0" value={b.budgeted} onChange={(e) => patch(b.id, { budgeted: e.target.value })} />
                      </Field>
                      <Field label="Total (RM)">
                        <input style={{ ...inputStyle, width: 100, padding: "4px 8px" }} type="number" min="0" value={b.actual} onChange={(e) => patch(b.id, { actual: e.target.value })} />
                      </Field>
                      <Field label="Paid (RM)">
                        <input
                          style={{ ...inputStyle, width: 100, padding: "4px 8px" }}
                          type="number"
                          min="0"
                          value={b.paidAmount !== undefined ? b.paidAmount : paidOf(b)}
                          onChange={(e) => patch(b.id, { paidAmount: e.target.value })}
                        />
                      </Field>
                      <div className="pb-1 text-xs" style={{ color: bal > 0 ? (overdue ? C.red : C.gold) : C.green, fontWeight: 700 }}>
                        = {RM(Math.max(0, bal))} to pay{bal < 0 ? ` (overpaid ${RM(-bal)})` : ""}
                      </div>
                      {!settled && (
                        <Btn kind="ghost" small onClick={() => patch(b.id, { paidAmount: num(b.actual) })}>
                          Mark fully paid
                        </Btn>
                      )}
                      <Field label="Pay by">
                        <input style={{ ...inputStyle, width: 140, padding: "4px 8px" }} type="date" value={b.dueDate || ""} onChange={(e) => patch(b.id, { dueDate: e.target.value })} />
                      </Field>
                      <Field label="Deposit (RM)">
                        <input style={{ ...inputStyle, width: 100, padding: "4px 8px" }} type="number" min="0" value={b.deposit || ""} onChange={(e) => patch(b.id, { deposit: e.target.value })} />
                      </Field>
                      {num(b.deposit) > 0 && (
                        <button
                          onClick={() => patch(b.id, { depositCollected: !b.depositCollected })}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            border: `1px solid ${b.depositCollected ? C.green : C.gold}`,
                            background: b.depositCollected ? C.greenSoft : C.goldSoft,
                            color: b.depositCollected ? C.green : C.gold,
                            marginBottom: 2,
                          }}
                        >
                          {b.depositCollected ? `💰 Deposit collected ✓` : `💰 Collect ${RM(b.deposit)} back`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- to-do / timeline checklist (couple only) ----------
function Todos({ data, up }) {
  const todos = data.todos || [];
  const [form, setForm] = useState({ title: "", due: "", assignee: "" });
  const [filter, setFilter] = useState("open");

  const add = () => {
    if (!form.title.trim()) return;
    up({ todos: [...todos, { id: uid(), title: form.title.trim(), due: form.due, assignee: form.assignee.trim(), done: false, createdAt: Date.now() }] });
    setForm({ title: "", due: "", assignee: form.assignee });
  };
  const patch = (id, p) => up({ todos: todos.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  const remove = (id) => up({ todos: todos.filter((t) => t.id !== id) });

  const today = new Date(new Date().toDateString());
  const isOverdue = (t) => !t.done && t.due && new Date(t.due) < today;
  const doneCount = todos.filter((t) => t.done).length;

  const shown = todos
    .filter((t) => (filter === "open" ? !t.done : filter === "done" ? t.done : true))
    .slice()
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!a.due && !b.due) return (a.createdAt || 0) - (b.createdAt || 0);
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due.localeCompare(b.due);
    });

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Tasks" value={todos.length} />
        <Stat label="Done" value={doneCount} tone={C.green} sub={todos.length ? `${Math.round((doneCount / todos.length) * 100)}% complete` : undefined} />
        <Stat label="Overdue" value={todos.filter(isOverdue).length} tone={todos.some(isOverdue) ? C.red : C.green} />
      </div>

      <Card>
        <div style={{ ...serif, fontSize: 20, fontWeight: 600 }} className="mb-3">
          Add a task
        </div>
        <div className="grid md:grid-cols-5 gap-3 items-end">
          <Field label="Task" className="md:col-span-2">
            <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Book the photographer" onKeyDown={(e) => e.key === "Enter" && add()} />
          </Field>
          <Field label="Due date">
            <input style={inputStyle} type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </Field>
          <Field label="Handled by">
            <input style={inputStyle} value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} placeholder="e.g. Aaron" />
          </Field>
          <div>
            <Btn onClick={add}>Add task</Btn>
          </div>
        </div>
      </Card>

      <div className="flex gap-2 flex-wrap">
        {[["open", "Open"], ["done", "Done"], ["all", "All"]].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              border: `1px solid ${filter === k ? C.gold : C.line}`,
              background: filter === k ? C.goldSoft : C.card,
              color: filter === k ? C.gold : C.muted,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card>
          <span style={{ color: C.muted }}>
            {todos.length === 0 ? "No tasks yet. Common first ones: book venue, confirm caterer, order invitations." : "Nothing here with this filter."}
          </span>
        </Card>
      ) : (
        <Card style={{ padding: 14 }}>
          <div className="grid gap-2">
            {shown.map((t) => {
              const overdue = isOverdue(t);
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-2 p-2" style={{ background: t.done ? C.greenSoft : C.soft, border: `1px solid ${overdue ? C.red : C.line}`, borderRadius: 8 }}>
                  <input type="checkbox" checked={!!t.done} onChange={(e) => patch(t.id, { done: e.target.checked })} style={{ width: 18, height: 18, accentColor: C.green, cursor: "pointer" }} />
                  <span className="text-sm font-medium" style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? C.muted : C.ink }}>
                    {t.title}
                  </span>
                  {t.assignee && <Pill>📋 {t.assignee}</Pill>}
                  {t.due && (
                    <Pill tone={t.done ? "neutral" : overdue ? "red" : "gold"}>
                      {overdue ? "⚠️ " : "📅 "}
                      {new Date(t.due).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
                    </Pill>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <input style={{ ...inputStyle, width: 130, padding: "3px 8px", fontSize: 12 }} type="date" value={t.due || ""} onChange={(e) => patch(t.id, { due: e.target.value })} />
                    <Btn kind="danger" small onClick={() => remove(t.id)}>
                      ✕
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------- day-of: live arrivals dashboard ----------
function DayOf({ data, up, side }) {
  const pool = side ? data.guests.filter((g) => g.side === side) : data.guests;
  const patch = (id, p) => up({ guests: data.guests.map((g) => (g.id === id ? { ...g, ...p } : g)) });

  const arrived = pool.filter((g) => g.checkedInAt).slice().sort((a, b) => (b.checkedInAt || 0) - (a.checkedInAt || 0));
  const awaited = pool.filter((g) => g.rsvp === "yes" && !g.checkedInAt);
  const arrivedPax = arrived.reduce((s, g) => s + num(g.checkedInPax), 0);
  const arrivedBabies = arrived.reduce((s, g) => s + Math.min(num(g.checkedInBabies), num(g.checkedInPax)), 0);
  const expectedPax = pool.filter((g) => g.rsvp === "yes").reduce((s, g) => s + num(g.confirmedPax || g.invitedPax || 1), 0);
  const pledgeCash = pool.reduce((s, g) => s + (g.pledgeMethod !== "qr" ? num(g.pledgeAmount) : 0), 0);
  const pledgeQr = pool.reduce((s, g) => s + (g.pledgeMethod === "qr" ? num(g.pledgeAmount) : 0), 0);

  const timeOf = (ts) => new Date(ts).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label="Arrived"
          value={`${arrivedPax} pax`}
          sub={`${arrived.length} invites checked in${arrivedBabies > 0 ? ` · ${arrivedBabies} 👶 · ${arrivedPax - arrivedBabies} eating` : ""}`}
          tone={C.green}
        />
        <Stat
          label="Expected"
          value={`${expectedPax} pax`}
          sub={expectedPax > 0 ? `${Math.min(100, Math.round((arrivedPax / expectedPax) * 100))}% arrived` : "no confirmed RSVPs"}
        />
        <Stat label="Still awaited" value={awaited.length} sub="confirmed but not here yet" tone={awaited.length > 0 ? C.gold : C.green} />
        <Stat label="Gift pledges" value={RM(pledgeCash + pledgeQr)} sub={`${RM(pledgeCash)} cash · ${RM(pledgeQr)} QR`} tone={C.gold} />
      </div>

      <Card>
        <div style={{ ...serif, fontSize: 20, fontWeight: 600 }}>🎟️ Arrivals {side && <Pill tone={side === "bride" ? "gold" : "green"}>{cap(side)}'s side</Pill>}</div>
        <p className="text-xs mt-1 mb-3" style={{ color: C.muted }}>
          Updates live as guests check in at the door. Red pax counts don't match the RSVP — worth a quick look.
        </p>
        {arrived.length === 0 ? (
          <span className="text-sm" style={{ color: C.muted }}>
            No one has checked in yet. Guests check in from the app's front screen — or set up a tablet at the entrance.
          </span>
        ) : (
          <div className="grid gap-2">
            {arrived.map((g) => {
              const expected = num(g.confirmedPax || g.invitedPax || 1);
              const match = num(g.checkedInPax) === expected;
              return (
                <div key={g.id} className="flex flex-wrap items-center gap-2 p-2" style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 8 }}>
                  <span className="text-xs" style={{ color: C.muted }}>
                    {timeOf(g.checkedInAt)}
                  </span>
                  <span className="text-sm font-medium">{g.name}</span>
                  {!side && <Pill tone={g.side === "bride" ? "gold" : "green"}>{cap(g.side)}</Pill>}
                  <Pill tone={match ? "green" : "red"}>
                    {num(g.checkedInPax)} pax{num(g.checkedInBabies) > 0 ? ` · ${num(g.checkedInBabies)} 👶` : ""}{!match ? ` (expected ${expected})` : ""}
                  </Pill>
                  {num(g.pledgeAmount) > 0 && (
                    <Pill tone="gold">💝 {RM(g.pledgeAmount)} · {g.pledgeMethod === "qr" ? "QR" : "cash"}</Pill>
                  )}
                  {Array.isArray(g.checkedInMembers) && g.checkedInMembers.length > 0 && (
                    <span className="text-xs" style={{ color: C.muted }}>
                      {g.checkedInMembers.join(", ")}
                    </span>
                  )}
                  <div className="ml-auto">
                    <Btn kind="danger" small onClick={() => patch(g.id, { checkedInAt: null, checkedInPax: null, checkedInBabies: null, checkedInMembers: null })}>
                      Undo check-in
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <div style={{ ...serif, fontSize: 18, fontWeight: 600 }} className="mb-2">
          Confirmed but not arrived ({awaited.length})
        </div>
        {awaited.length === 0 ? (
          <span className="text-sm" style={{ color: C.muted }}>Everyone who confirmed is here 🎉</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {awaited.map((g) => (
              <Pill key={g.id}>
                {g.name} · {num(g.confirmedPax || g.invitedPax || 1)} pax
              </Pill>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- gifts ----------
function Gifts({ data, up, side }) {
  const [extra, setExtra] = useState({ name: "", amount: "", method: "cash", note: "", side: side || "bride" });

  const pool = side ? data.guests.filter((g) => g.side === side) : data.guests;
  const patch = (id, p) => up({ guests: data.guests.map((g) => (g.id === id ? { ...g, ...p } : g)) });

  const extras = side ? data.extraGifts.filter((x) => (x.side || "bride") === side) : data.extraGifts;
  const givers = pool.filter((g) => num(g.giftAmount) > 0);
  const totalGuest = givers.reduce((s, g) => s + num(g.giftAmount), 0);
  const totalExtra = extras.reduce((s, x) => s + num(x.amount), 0);
  const total = totalGuest + totalExtra;
  const count = givers.length + extras.length;

  const addExtra = () => {
    if (!extra.name.trim() || !num(extra.amount)) return;
    up({ extraGifts: [...data.extraGifts, { id: uid(), ...extra, side: side || extra.side, amount: num(extra.amount) }] });
    setExtra({ name: "", amount: "", method: "cash", note: "", side: side || extra.side });
  };
  const removeExtra = (id) => up({ extraGifts: data.extraGifts.filter((x) => x.id !== id) });

  const methods = ["cash", "bank transfer", "e-wallet", "cheque", "other"];

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label={side ? `${cap(side)}'s total` : "Total received"} value={RM(total)} tone={C.gold} />
        <Stat label="Gifts recorded" value={count} />
        <Stat label="Average gift" value={count ? RM(total / count) : RM(0)} />
      </div>

      <Card>
        <div style={{ ...serif, fontSize: 20, fontWeight: 600 }}>
          Record gifts {side && <Pill tone={side === "bride" ? "gold" : "green"}>{cap(side)}'s side</Pill>}
        </div>
        <p className="text-sm mt-1 mb-3" style={{ color: C.muted }}>
          Type the amount next to each guest as you open the angpow — handy for writing thank-you notes later.
        </p>
        {pool.length === 0 ? (
          <span className="text-sm" style={{ color: C.muted }}>The guest list is empty — add guests first, then log gifts here.</span>
        ) : (
          <div className="grid gap-2">
            {pool.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center gap-2 p-2" style={{ background: num(g.giftAmount) > 0 ? C.goldSoft : C.soft, border: `1px solid ${C.line}`, borderRadius: 8 }}>
                <span className="text-sm font-medium">{g.name}</span>
                {!side && <Pill tone={g.side === "bride" ? "gold" : "green"}>{cap(g.side)}</Pill>}
                {g.rsvp === "yes" && <Pill tone="green">Attending</Pill>}
                {num(g.pledgeAmount) > 0 && (
                  <Pill tone="gold">pledged {RM(g.pledgeAmount)} ({g.pledgeMethod === "qr" ? "QR" : "cash"})</Pill>
                )}
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  <span className="text-xs" style={{ color: C.muted }}>RM</span>
                  <input style={{ ...inputStyle, width: 110, padding: "4px 8px" }} type="number" min="0" placeholder="0.00" value={g.giftAmount} onChange={(e) => patch(g.id, { giftAmount: e.target.value })} />
                  <select style={{ ...inputStyle, width: 130, padding: "4px 8px" }} value={g.giftMethod || "cash"} onChange={(e) => patch(g.id, { giftMethod: e.target.value })}>
                    {methods.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                  <input style={{ ...inputStyle, width: 150, padding: "4px 8px" }} placeholder="Note" value={g.giftNote || ""} onChange={(e) => patch(g.id, { giftNote: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div style={{ ...serif, fontSize: 20, fontWeight: 600 }} className="mb-3">
          Gifts from people not on the list
        </div>
        <div className="grid md:grid-cols-6 gap-3 items-end">
          <Field label="From" className="md:col-span-2">
            <input style={inputStyle} value={extra.name} onChange={(e) => setExtra({ ...extra, name: e.target.value })} placeholder="e.g. Dad's business partner" onKeyDown={(e) => e.key === "Enter" && addExtra()} />
          </Field>
          {!side && (
            <Field label="Side">
              <select style={inputStyle} value={extra.side} onChange={(e) => setExtra({ ...extra, side: e.target.value })}>
                <option value="bride">Bride</option>
                <option value="groom">Groom</option>
              </select>
            </Field>
          )}
          <Field label="Amount (RM)">
            <input style={inputStyle} type="number" min="0" value={extra.amount} onChange={(e) => setExtra({ ...extra, amount: e.target.value })} />
          </Field>
          <Field label="Method">
            <select style={inputStyle} value={extra.method} onChange={(e) => setExtra({ ...extra, method: e.target.value })}>
              {methods.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <div>
            <Btn kind="gold" onClick={addExtra}>Add gift</Btn>
          </div>
        </div>
        {extras.length > 0 && (
          <div className="grid gap-2 mt-4">
            {extras.map((x) => (
              <div key={x.id} className="flex items-center gap-3 p-2" style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 8 }}>
                <span className="text-sm font-medium">{x.name}</span>
                <Pill>{x.method}</Pill>
                {!side && <Pill tone={(x.side || "bride") === "bride" ? "gold" : "green"}>{cap(x.side || "bride")}</Pill>}
                <span className="ml-auto font-semibold">{RM(x.amount)}</span>
                <Btn kind="danger" small onClick={() => removeExtra(x.id)}>✕</Btn>
              </div>
            ))}
          </div>
        )}
        <div className="text-xs mt-3" style={{ color: C.muted }}>
          Guest-list gifts: {RM(totalGuest)} · Other gifts: {RM(totalExtra)}
        </div>
      </Card>
    </div>
  );
}
