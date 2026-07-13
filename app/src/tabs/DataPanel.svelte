<script>
  // data tools: backup, excel export/import, share links, QR upload, trash — port of legacy DataPanel.
  // xlsx is loaded on demand so kiosk/planner visitors don't download SheetJS.
  import { C } from "../stores/theme.svelte.js";
  import { wd, up } from "../stores/wedding.svelte.js";
  import { app } from "../stores/session.svelte.js";
  import { EMPTY } from "../lib/constants.js";
  import { uid, num, RM, cap, downloadBlob, trashFresh, TRASH_DAYS } from "../lib/utils.js";
  import { membersOf, vegOf, parseMembers } from "../lib/guests.js";
  import { buildSummaryHtml, buildGuestListHtml } from "../lib/exports.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Pill from "../components/Pill.svelte";

  let msg = $state("");
  let confirmRestore = $state(null); // parsed backup awaiting confirmation
  let guestFileEl = $state(null);
  let backupFileEl = $state(null);
  let qrFileEl = $state(null);
  let qrTarget = "qrImageBride";

  const stamp = new Date().toISOString().slice(0, 10);
  const data = $derived(wd.data);

  const shareLinks = $derived([
    ["👥 Team link (opens your wedding's sign-in):", `${location.origin}${location.pathname}?w=${app.wedding}`],
    ["💌 RSVP link for guests (locked — they see only the RSVP page):", `${location.origin}${location.pathname}?w=${app.wedding}&p=rsvp`],
    ["🎟️ Check-in link for the door (locked — kiosk mode for a tablet/laptop):", `${location.origin}${location.pathname}?w=${app.wedding}&p=checkin`],
  ]);

  // ---- full backup (json) ----
  function exportBackup() {
    downloadBlob(JSON.stringify($state.snapshot(data), null, 2), `wedding-backup-${stamp}.json`, "application/json");
    msg = "Backup downloaded. Keep it somewhere safe — it contains everything.";
  }

  // ---- wedding summary report (opens print-ready; user saves as PDF) ----
  function openSummary() {
    const w = window.open("", "_blank");
    if (!w) return (msg = "Your browser blocked the report window — allow pop-ups for this site and try again.");
    w.document.write(buildSummaryHtml($state.snapshot(data)));
    w.document.close();
  }

  // ---- printable guest list per side (paper backup for the door) ----
  function openGuestList(side) {
    const w = window.open("", "_blank");
    if (!w) return (msg = "Your browser blocked the report window — allow pop-ups for this site and try again.");
    w.document.write(buildGuestListHtml($state.snapshot(data), side));
    w.document.close();
  }

  // ---- excel workbook ----
  async function exportExcel() {
    const XLSX = await import("xlsx");
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
    msg = "Excel workbook downloaded — Guests, Budget, Other Gifts and Caterers as separate sheets.";
  }

  // ---- import guests from excel/csv ----
  async function importGuests(file) {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (!rows.length) return (msg = "That file appears to be empty.");

      // loose header matching: find a column by candidate names
      const keys = Object.keys(rows[0]);
      const find = (...cands) => keys.find((k) => cands.some((c) => k.toLowerCase().replace(/[^a-z]/g, "").includes(c)));
      const kName = find("name", "guest");
      if (!kName) return (msg = `Couldn't find a Name column. Found columns: ${keys.join(", ")}. Please make sure one column is called "Name".`);
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
      msg = `Imported ${added} guests${skipped ? ` · skipped ${skipped} duplicates (same name)` : ""}. Guests without a Side column default to the bride's side — adjust in list view if needed.`;
    } catch (e) {
      msg = "Couldn't read that file. Please upload an .xlsx, .xls or .csv file.";
    }
  }

  // ---- restore backup ----
  async function readBackup(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.guests)) return (msg = "That doesn't look like a wedding backup file.");
      confirmRestore = parsed;
      msg = "";
    } catch (e) {
      msg = "Couldn't read that file — it should be a .json backup exported from this app.";
    }
  }

  function doRestore() {
    const p = confirmRestore;
    up({ ...EMPTY, ...p, settings: { ...EMPTY.settings, ...(p.settings || {}) } });
    confirmRestore = null;
    msg = `Backup restored — ${(p.guests || []).length} guests, ${(p.budget || []).length} budget items, ${(p.extraGifts || []).length} other gifts.`;
  }

  // ---- gift QR images, one per side (shown to guests at check-in) ----
  function importQr(file, key) {
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
      if (dataUrl.length > 400000) return (msg = "That image is too heavy — please crop it to just the QR code and try again.");
      up({ settings: { ...data.settings, [key]: dataUrl } });
      msg = `${key === "qrImageBride" ? "Bride's" : "Groom's"} QR saved — guests checking in under ${key === "qrImageBride" ? "the bride" : "the groom"} will see it.`;
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      msg = "Couldn't read that image — please upload a PNG or JPG.";
    };
    img.src = url;
  }

  // ---- recently deleted (30-day trash) ----
  const TRASH_KEYS = { guest: "guests", budget: "budget", todo: "todos", caterer: "caterers", extraGift: "extraGifts" };
  const TRASH_LABELS = { guest: "👤 Guest", budget: "💰 Vendor", todo: "✅ Task", caterer: "🍽 Caterer", extraGift: "💝 Gift" };
  const trashName = (t) =>
    t.kind === "budget" ? `${t.item.item}${t.item.category ? ` (${t.item.category})` : ""}` : t.kind === "todo" ? t.item.title : t.item.name;

  function restoreTrash(t) {
    const key = TRASH_KEYS[t.kind];
    if (!key || !t.item) return;
    up({ [key]: [$state.snapshot(t).item, ...(data[key] || [])], trash: (data.trash || []).filter((x) => x.id !== t.id) });
    msg = `Restored ${trashName(t)}.`;
  }
  const purgeTrash = (t) => up({ trash: (data.trash || []).filter((x) => x.id !== t.id) });

  const freshTrash = $derived((data.trash || []).filter(trashFresh));

  function copyLink(e, url) {
    navigator.clipboard && navigator.clipboard.writeText(url);
    const el = e.target;
    el.textContent = "✓ Copied";
    setTimeout(() => (el.textContent = "Copy"), 1500);
  }
</script>

<div class="grid gap-4">
  <Card>
    <div class="wb-serif" style="font-size:20px;font-weight:600">How your data is stored</div>
    <p class="text-sm mt-1" style="color:{C.muted}">
      Everything saves automatically to this app's shared storage — that's the live database all four of you work from.
      The tools below give you a physical copy: backups you can keep, an Excel file you can print or send to your
      venue, and a quick way to import a guest list you already have.
    </p>
    <div class="text-sm mt-3 grid gap-2" style="word-break:break-all">
      {#each shareLinks as [label, url] (url)}
        <div class="flex flex-wrap items-center gap-2">
          <span style="color:{C.muted}">{label}</span>
          <a href={url} target="_blank" rel="noreferrer" style="color:{C.green};font-weight:600;text-decoration:underline">{url}</a>
          <button
            onclick={(e) => copyLink(e, url)}
            style="padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid {C.line};background:{C.card};color:{C.muted}"
          >
            Copy
          </button>
        </div>
      {/each}
    </div>
  </Card>

  <div class="grid md:grid-cols-2 gap-4">
    <Card>
      <div class="wb-serif" style="font-size:18px;font-weight:600">⬇️ Export</div>
      <p class="text-xs mt-1 mb-3" style="color:{C.muted}">
        Download a copy of everything. Do this every so often — especially the week of the wedding.
      </p>
      <div class="flex flex-wrap gap-2">
        <Btn onclick={exportExcel}>Excel workbook (.xlsx)</Btn>
        <Btn kind="gold" onclick={openSummary}>📄 Wedding summary (PDF)</Btn>
        <Btn kind="ghost" onclick={exportBackup}>Full backup (.json)</Btn>
      </div>
      <div class="flex flex-wrap gap-2 mt-2">
        <Btn kind="ghost" onclick={() => openGuestList("bride")}>🖨️ Bride's guest list</Btn>
        <Btn kind="ghost" onclick={() => openGuestList("groom")}>🖨️ Groom's guest list</Btn>
        <Btn kind="ghost" onclick={() => openGuestList(null)}>🖨️ Full guest list</Btn>
      </div>
      <p class="text-xs mt-3" style="color:{C.muted}">
        The Excel file has separate sheets for Guests (with RSVP + gifts), Budget, Other Gifts, Caterers and To-dos.
        The wedding summary and guest lists open print-ready — pick “Save as PDF” in the print dialog. Print the guest
        lists before the big day as a paper backup for the door: they include members, phone, RSVP, veg counts, and
        blank Arrived/Notes columns to fill in by pen. The .json backup is for restoring into this app.
      </p>
    </Card>

    <Card>
      <div class="wb-serif" style="font-size:18px;font-weight:600">⬆️ Import guest list</div>
      <p class="text-xs mt-1 mb-3" style="color:{C.muted}">
        Already have names in Excel or Google Sheets? Upload the file (.xlsx / .csv) and they'll be added as pending
        guests. Recognised columns: <b>Name</b> (required), Side, Group, Pax, Babies, Phone, Members (comma-separated
        names under that invite).
      </p>
      <input
        bind:this={guestFileEl}
        type="file"
        accept=".xlsx,.xls,.csv"
        style="display:none"
        onchange={(e) => {
          if (e.target.files && e.target.files[0]) importGuests(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <Btn onclick={() => guestFileEl && guestFileEl.click()}>Choose file…</Btn>
      <p class="text-xs mt-3" style="color:{C.muted}">
        Duplicate names already in the app are skipped, so it's safe to re-upload an updated file.
      </p>
    </Card>
  </div>

  <Card>
    <div class="wb-serif" style="font-size:18px;font-weight:600">♻️ Restore from backup</div>
    <p class="text-xs mt-1 mb-3" style="color:{C.muted}">
      Replaces <b>everything currently in the app</b> with the contents of a .json backup. Use with care.
    </p>
    <input
      bind:this={backupFileEl}
      type="file"
      accept=".json,application/json"
      style="display:none"
      onchange={(e) => {
        if (e.target.files && e.target.files[0]) readBackup(e.target.files[0]);
        e.target.value = "";
      }}
    />
    {#if !confirmRestore}
      <Btn kind="ghost" onclick={() => backupFileEl && backupFileEl.click()}>Choose backup file…</Btn>
    {:else}
      <div class="p-3" style="background:{C.redSoft};border:1px solid {C.red};border-radius:10px">
        <div class="text-sm font-semibold" style="color:{C.red}">Replace current data?</div>
        <div class="text-xs mt-1" style="color:{C.muted}">
          Backup contains {(confirmRestore.guests || []).length} guests, {(confirmRestore.budget || []).length} budget items,
          {(confirmRestore.extraGifts || []).length} other gifts. Current data will be overwritten for everyone.
        </div>
        <div class="flex gap-2 mt-2">
          <Btn small onclick={doRestore}>Yes, restore</Btn>
          <Btn kind="ghost" small onclick={() => (confirmRestore = null)}>Cancel</Btn>
        </div>
      </div>
    {/if}
  </Card>

  <Card>
    <div class="wb-serif" style="font-size:18px;font-weight:600">📱 Gift QR codes</div>
    <p class="text-xs mt-1 mb-3" style="color:{C.muted}">
      Each side uploads their own DuitNow / bank QR. At check-in, guests first pick whose guest they are — the bride's
      guests see her QR, the groom's guests see his.
    </p>
    <input
      bind:this={qrFileEl}
      type="file"
      accept="image/*"
      style="display:none"
      onchange={(e) => {
        if (e.target.files && e.target.files[0]) importQr(e.target.files[0], qrTarget);
        e.target.value = "";
      }}
    />
    <div class="grid md:grid-cols-2 gap-4">
      {#each [["qrImageBride", "🌸 Bride's QR"], ["qrImageGroom", "🤵 Groom's QR"]] as [key, label] (key)}
        <div class="p-3" style="background:{C.soft};border:1px solid {C.line};border-radius:10px">
          <div class="text-sm font-semibold mb-2">{label}</div>
          {#if data.settings[key]}
            <img src={data.settings[key]} alt={label} style="max-width:160px;border-radius:10px;border:1px solid {C.line};background:#fff;padding:6px" />
          {:else if data.settings.qrImage}
            <p class="text-xs" style="color:{C.muted}">
              Currently using the shared QR uploaded earlier — upload one here to replace it for this side.
            </p>
          {:else}
            <p class="text-xs" style="color:{C.muted}">Not uploaded yet.</p>
          {/if}
          <div class="flex gap-2 mt-2">
            <Btn
              small
              onclick={() => {
                qrTarget = key;
                if (qrFileEl) qrFileEl.click();
              }}
            >
              {data.settings[key] ? "Replace…" : "Upload…"}
            </Btn>
            {#if data.settings[key]}
              <Btn kind="danger" small onclick={() => up({ settings: { ...data.settings, [key]: "" } })}>Remove</Btn>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    {#if data.settings.qrImage}
      <div class="flex items-center gap-2 mt-3 flex-wrap">
        <span class="text-xs" style="color:{C.muted}">
          Shared fallback QR (from before) — used wherever a side hasn't uploaded its own:
        </span>
        <img src={data.settings.qrImage} alt="Shared QR" style="max-width:70px;border-radius:6px;border:1px solid {C.line};background:#fff;padding:3px" />
        <Btn kind="danger" small onclick={() => up({ settings: { ...data.settings, qrImage: "" } })}>Remove shared QR</Btn>
      </div>
    {/if}
  </Card>

  <Card>
    <div class="wb-serif" style="font-size:18px;font-weight:600">🗑️ Recently deleted</div>
    <p class="text-xs mt-1 mb-3" style="color:{C.muted}">
      Deleted guests, vendors, tasks, caterers and gifts rest here for {TRASH_DAYS} days before disappearing for good —
      restore anything with one click.
    </p>
    {#if freshTrash.length === 0}
      <span class="text-sm" style="color:{C.muted}">Nothing in the trash. 🎉</span>
    {:else}
      <div class="grid gap-2">
        {#each freshTrash as t (t.id)}
          <div class="flex flex-wrap items-center gap-2 p-2" style="background:{C.soft};border:1px solid {C.line};border-radius:8px">
            <Pill>{TRASH_LABELS[t.kind] || t.kind}</Pill>
            <span class="text-sm font-medium">{trashName(t)}</span>
            <span class="text-xs" style="color:{C.muted}">
              deleted {new Date(t.deletedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })} · purges in
              {Math.max(1, Math.ceil(TRASH_DAYS - (Date.now() - t.deletedAt) / 86400000))}d
            </span>
            <div class="ml-auto flex gap-2">
              <Btn small onclick={() => restoreTrash(t)}>↩ Restore</Btn>
              <Btn kind="danger" small onclick={() => purgeTrash(t)}>Delete forever</Btn>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  {#if msg}
    <Card style="border-color:{C.gold}">
      <span class="text-sm" style="color:{C.ink}">{msg}</span>
    </Card>
  {/if}
</div>
