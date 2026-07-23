// ---------- printable reports (ported verbatim from wedding-planner.jsx) ----------
import { num, RM } from "./utils.js";
import { membersOf, vegOf } from "./guests.js";
import { computeStats } from "./stats.js";

// wedding summary report (print-to-PDF)
export function buildSummaryHtml(data) {
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
  // estimate vs actual: planned target falls back to the sum of line budgets
  const plannedTarget = num(data.budgetTarget) || st.budgeted;
  const leftVsPlan = plannedTarget - st.actual; // + = within plan, − = over
  // budget breakdown counts confirmed items only (shortlisted are still-deciding candidates)
  const confirmedBudget = (data.budget || []).filter((b) => b.status !== "shortlisted");
  const shortlistedCount = (data.budget || []).length - confirmedBudget.length;
  const byCat = {};
  confirmedBudget.forEach((b) => {
    (byCat[b.category] = byCat[b.category] || []).push(b);
  });
  const catRows = Object.entries(byCat)
    .map(([cat, items]) => {
      const bud = items.reduce((s, x) => s + num(x.budgeted), 0);
      const tot = items.reduce((s, x) => s + num(x.actual), 0);
      const paid = items.reduce((s, x) => s + paidOf(x), 0);
      const diff = bud - tot;
      return `<tr><td>${esc(cat)}</td><td class="r">${RM(bud)}</td><td class="r">${RM(tot)}</td><td class="r">${RM(paid)}</td><td class="r ${diff >= 0 ? "ok" : "bad"}">${diff >= 0 ? "" : "−"}${RM(Math.abs(diff))}</td></tr>`;
    })
    .join("");

  // wedding-day team (🎭 Team tab) — one row per role, grouped by category
  const teamRows = (data.team || [])
    .flatMap((c) =>
      c.roles.map(
        (r, i) => `<tr>
          <td>${i === 0 ? `<b>${esc(c.name)}</b>` : ""}</td>
          <td>${esc(r.title)}</td>
          <td>${(r.person || "").trim() ? esc(r.person) : `<span class="sub">—</span>`}</td>
          <td>${esc(r.phone || "")}</td>
          <td>${esc(r.task || "")}</td>
        </tr>`
      )
    )
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
  .ok { color: #2E7D4F; }
  .bad { color: #B3402A; }
  td.ok, td.bad { font-weight: 600; }
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
  <div class="stats">
    ${stat("Budget committed", RM(st.actual), `estimated ${RM(st.budgeted)} · paid ${RM(st.paidOut)}`)}
    ${stat(
      leftVsPlan >= 0 ? "Left of planned budget" : "Over planned budget",
      `<span class="${leftVsPlan >= 0 ? "ok" : "bad"}">${RM(Math.abs(leftVsPlan))}</span>`,
      `planned ${RM(plannedTarget)} − committed ${RM(st.actual)}`
    )}
    ${stat("Gifts received", RM(st.gifts), `${RM(guestGiftTotal)} from guests · ${RM(extraTotal)} other`)}
    ${stat("Net cost after gifts", RM(st.net), st.net <= 0 ? "gifts covered the spend 🎉" : "spend minus gifts")}
  </div>

  ${catRows ? `<h2>Budget by category — estimate vs. actual</h2>
  <table>
    <thead><tr><th>Category</th><th class="r">Budgeted</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Difference</th></tr></thead>
    <tbody>${catRows}</tbody>
  </table>` : ""}

  ${teamRows ? `<h2>Wedding-day team</h2>
  <table>
    <thead><tr><th>Team</th><th>Role</th><th>Person</th><th>Phone</th><th>Task / duties</th></tr></thead>
    <tbody>${teamRows}</tbody>
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

// printable guest list (per side, for the door / offline backup)
export function buildGuestListHtml(data, side) {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const guests = (data.guests || []).filter((g) => (side ? g.side === side : true));
  const title = side === "bride" ? "Bride's Guest List" : side === "groom" ? "Groom's Guest List" : "Guest List";
  const dateStr = data.settings.date
    ? new Date(data.settings.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  const invitedPax = guests.reduce((s, g) => s + num(g.invitedPax || 1), 0);
  const attending = guests.filter((g) => g.rsvp === "yes");
  const confirmedPax = attending.reduce((s, g) => s + num(g.confirmedPax || g.invitedPax || 1), 0);

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
          const rsvp =
            g.rsvp === "yes"
              ? `✔ ${num(g.confirmedPax || g.invitedPax)} pax`
              : g.rsvp === "no"
              ? "✗ Declined"
              : "Pending";
          return `<tr>
            <td class="r">${n}</td>
            <td><b>${esc(g.name)}</b>${mm.length ? `<div class="sub">${esc(mm.map((m) => m.name + (m.type === "baby" ? " 👶" : "")).join(", "))}</div>` : ""}</td>
            <td>${esc(g.phone || "")}</td>
            <td class="r">${num(g.invitedPax)}${num(g.invitedBabies) > 0 ? ` <span class="sub">(${num(g.invitedBabies)}👶)</span>` : ""}</td>
            <td>${rsvp}</td>
            <td class="c">${g.checkedInAt ? "✔" : `<span class="tick">☐</span>`}</td>
            <td class="c">${g.checkedInAt ? `${num(g.checkedInPax)} pax` : `<div class="wbox"></div>`}</td>
            <td><div class="wbox wide"></div></td>
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
  .tick { font-size: 15px; color: #9A8E82; }
  .wbox { height: 20px; min-width: 52px; border: 1px solid #E2D7C8; border-radius: 4px; background: #FDFBF8; }
  .wbox.wide { min-width: 110px; }
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
      <b>${guests.length}</b> invites · <b>${invitedPax}</b> pax invited · <b>${confirmedPax}</b> pax confirmed
    </div>
  </header>
  <table>
    <thead>
      <tr><th class="r">#</th><th>Invite / members</th><th>Phone</th><th class="r">Invited</th><th>RSVP</th><th class="c">Arrived ✓</th><th class="c">Pax arrived</th><th>Notes / gift</th></tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="8">No guests on this side yet.</td></tr>`}</tbody>
  </table>
  <footer>Printed ${new Date().toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} · Wedding Book 💍</footer>
</body>
</html>`;
}

// ---------- team sheet: roster (call-sheet) or individual cards (handouts) ----------
export function buildTeamHtml(data, mode) {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const team = data.team || [];
  const dateStr = data.settings.date
    ? new Date(data.settings.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";
  const allRoles = team.flatMap((c) => c.roles.map((r) => ({ ...r, category: c.name })));
  const assigned = allRoles.filter((r) => (r.person || "").trim());

  const head = `
  <div class="noprint"><button onclick="window.print()">🖨️ Print / Save as PDF</button></div>
  <header>
    <div class="flourish">✿&nbsp;❦&nbsp;✿</div>
    <h1>${esc(data.settings.couple || "Our Wedding")}</h1>
    <div class="subtitle">Wedding-Day Team${dateStr ? ` · ${esc(dateStr)}` : ""}</div>
    <div class="totals"><b>${allRoles.length}</b> roles · <b>${assigned.length}</b> assigned across <b>${team.length}</b> teams</div>
  </header>`;

  let body;
  if (mode === "cards") {
    // one card per assigned role — cut along the lines and hand to each person
    const cards = assigned
      .map(
        (r) => `<div class="card">
          <div class="crole">${esc(r.title)}</div>
          <div class="cname">${esc(r.person)}</div>
          <div class="cmeta">${esc(r.category)}${r.phone ? ` · ${esc(r.phone)}` : ""}</div>
          ${r.task && r.task.trim() ? `<div class="ctask">${esc(r.task)}</div>` : `<div class="ctask muted">—</div>`}
          <div class="cfoot">${esc(data.settings.couple || "")}${dateStr ? ` · ${esc(dateStr)}` : ""}</div>
        </div>`
      )
      .join("");
    body = assigned.length
      ? `<div class="cards">${cards}</div>`
      : `<p class="empty">No roles have a person assigned yet — fill in names on the Team tab first.</p>`;
  } else {
    // roster: grouped by team/category
    body = team
      .map((c) => {
        const rows = c.roles
          .map(
            (r) => `<tr>
              <td>${esc(r.title)}</td>
              <td>${(r.person || "").trim() ? `<b>${esc(r.person)}</b>` : `<span class="wbox"></span>`}</td>
              <td>${esc(r.phone || "")}</td>
              <td>${esc(r.task || "")}</td>
            </tr>`
          )
          .join("");
        return `<h2>${esc(c.name)} <span class="cnt">${c.roles.filter((r) => (r.person || "").trim()).length}/${c.roles.length}</span></h2>
        <table>
          <thead><tr><th>Role</th><th>Person</th><th>Phone</th><th>Task / duties</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="4">No roles in this team.</td></tr>`}</tbody>
        </table>`;
      })
      .join("");
    if (!team.length) body = `<p class="empty">No team set up yet — add roles on the Team tab first.</p>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Team ${mode === "cards" ? "Cards" : "Roster"} — ${esc(data.settings.couple || "Our Wedding")}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,500&family=Jost:wght@400;500;600&display=swap');
  * { box-sizing: border-box; }
  body { font-family: 'Jost', system-ui, sans-serif; color: #443F3A; background: #fff; margin: 0; padding: 32px 36px; }
  header { text-align: center; margin-bottom: 18px; }
  .flourish { color: #BC9459; letter-spacing: 8px; font-size: 15px; }
  h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; font-weight: 700; margin: 6px 0 2px; }
  .subtitle { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; color: #BC9459; font-size: 15px; }
  .totals { font-size: 12px; color: #9A8E82; margin-top: 6px; }
  .totals b { color: #6B8E7B; }
  h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; font-weight: 700; color: #6B8E7B; border-bottom: 1.5px solid #BC9459; padding-bottom: 3px; margin: 22px 0 8px; }
  h2 .cnt { font-family: 'Jost', sans-serif; font-size: 11px; color: #9A8E82; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; text-transform: uppercase; letter-spacing: 1px; font-size: 9.5px; color: #9A8E82; padding: 5px 6px; border-bottom: 1px solid #EFE7DB; }
  td { border-bottom: 1px solid #F3EDE4; padding: 6px; vertical-align: top; }
  .wbox { display: inline-block; height: 14px; min-width: 90px; border-bottom: 1px solid #D8CBB8; }
  tr, .card { page-break-inside: avoid; }
  .empty { color: #9A8E82; font-size: 13px; }
  /* cards */
  .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .card { border: 1.5px dashed #D8CBB8; border-radius: 12px; padding: 16px 18px; min-height: 150px; display: flex; flex-direction: column; }
  .crole { text-transform: uppercase; letter-spacing: 2px; font-size: 10px; color: #BC9459; font-weight: 600; }
  .cname { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; font-weight: 700; color: #443F3A; margin: 2px 0; }
  .cmeta { font-size: 11px; color: #9A8E82; }
  .ctask { font-size: 12.5px; color: #443F3A; margin-top: 10px; flex: 1; white-space: pre-wrap; }
  .ctask.muted { color: #C4B8A6; }
  .cfoot { font-size: 9.5px; color: #B0A698; text-align: right; margin-top: 8px; }
  footer { margin-top: 24px; text-align: center; color: #B0A698; font-size: 10px; }
  @media print { body { padding: 8mm 9mm; } .noprint { display: none; } }
  .noprint { text-align: center; margin-bottom: 14px; }
  .noprint button { background: #BC9459; color: #fff; border: none; border-radius: 999px; padding: 9px 24px; font-size: 13px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
  ${head}
  ${body}
  <footer>Printed ${new Date().toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} · Wedding Book 💍</footer>
</body>
</html>`;
}
