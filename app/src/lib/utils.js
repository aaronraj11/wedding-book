// ---------- generic helpers (ported verbatim from wedding-planner.jsx) ----------

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

export const RM = (n) =>
  new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", minimumFractionDigits: 2 }).format(
    Number(n) || 0
  );

export const num = (v) => (v === "" || v === null || isNaN(Number(v)) ? 0 : Number(v));

// lightweight scramble so passcodes aren't stored as plain text (not real security)
export const scramble = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return "h" + h.toString(36);
};

export function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function eventDateLabel(date) {
  if (!date) return "date TBC";
  const d = new Date(date);
  const days = Math.ceil((d - new Date(new Date().toDateString())) / 86400000);
  const str = d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
  if (days > 0) return `${str} · in ${days}d`;
  if (days === 0) return `${str} · today!`;
  return `${str} · done`;
}

// deleted things rest in the trash for 30 days before purging
export const TRASH_DAYS = 30;
export const trashFresh = (t) => t && t.deletedAt && Date.now() - t.deletedAt < TRASH_DAYS * 86400000;
export const pushTrash = (data, kind, item) => [
  { id: "t-" + uid(), kind, item, deletedAt: Date.now() },
  ...(data.trash || []).filter(trashFresh),
];

export function downloadBlob(content, filename, type) {
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

export const serif = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
