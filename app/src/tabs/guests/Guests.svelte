<script>
  // guests & rsvp tab — port of legacy Guests
  import { C } from "../../stores/theme.svelte.js";
  import { wd, up } from "../../stores/wedding.svelte.js";
  import { app } from "../../stores/session.svelte.js";
  import { GROUP_PRESETS } from "../../lib/constants.js";
  import { uid, num, RM, cap, pushTrash } from "../../lib/utils.js";
  import { asMember, membersOf, babyCount, guestInEvent, findNameClashes } from "../../lib/guests.js";
  import { buildInviteMessage, waLink } from "../../lib/whatsapp.js";
  import Btn from "../../components/Btn.svelte";
  import Card from "../../components/Card.svelte";
  import Field from "../../components/Field.svelte";
  import Pill from "../../components/Pill.svelte";
  import MemberRows from "../../components/MemberRows.svelte";
  import GroupSelect from "../../components/GroupSelect.svelte";
  import InvitePanel from "./InvitePanel.svelte";
  import FamilyTree from "./FamilyTree.svelte";

  let { side } = $props();

  let form = $state({ name: "", side: "bride", group: "", invitedPax: 1, phone: "", members: [{ name: "", type: "adult" }] });
  $effect(() => {
    if (side) form.side = side;
  });
  let filter = $state("all");
  let search = $state("");
  let view = $state("list");
  let editId = $state(null);
  let confirmDelete = $state(null); // guest id awaiting delete confirmation
  let manageGroups = $state(false);
  let groupEdit = $state(null); // group path being changed/deleted
  let groupTarget = $state("");
  let guestMove = $state(null); // single guest id being moved to another group
  let guestMoveTarget = $state("");

  // preset categories plus every group path already in use, for the autocomplete dropdown
  const groupOptions = $derived.by(() => {
    const set = new Set(GROUP_PRESETS);
    wd.data.guests.forEach((g) => {
      const parts = (g.group || "").split("/").map((p) => p.trim()).filter(Boolean);
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join(" / "));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  const dupName = $derived(
    form.name.trim() !== "" && wd.data.guests.some((g) => g.name.trim().toLowerCase() === form.name.trim().toLowerCase())
  );

  // every exact group path in use, with the guests inside it
  const groupsInUse = $derived.by(() => {
    const map = {};
    wd.data.guests.forEach((g) => {
      const k = (g.group || "").trim();
      if (!k) return;
      (map[k] = map[k] || []).push(g);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  });

  function reassignGroup(from, to) {
    up({ guests: wd.data.guests.map((g) => (((g.group || "").trim() === from) ? { ...g, group: to } : g)) });
    groupEdit = null;
    groupTarget = "";
  }

  const formMembers = $derived(form.members.map(asMember).filter((m) => m.name.trim()));
  const formBabies = $derived(babyCount(formMembers));

  function add() {
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
    up({ guests: [g, ...wd.data.guests] });
    form = { name: "", side: side || form.side, group: form.group, invitedPax: 1, phone: "", members: [{ name: "", type: "adult" }] };
  }

  // planners tick off who from a family is coming; confirmed pax and babies follow
  function toggleMember(g, name) {
    const mm = membersOf(g);
    const names = mm.map((x) => x.name);
    const base = Array.isArray(g.confirmedMembers) ? g.confirmedMembers.filter((x) => names.includes(x)) : [...names];
    const next = base.includes(name) ? base.filter((x) => x !== name) : [...base, name];
    patch(g.id, {
      confirmedMembers: next,
      confirmedPax: next.length,
      confirmedBabies: String(babyCount(mm.filter((x) => next.includes(x.name)))),
    });
  }

  // editing a guest's member rows keeps the invite's pax and baby counts in step
  function patchMembers(g, rows) {
    const named = rows.map(asMember).filter((m) => m.name.trim());
    patch(g.id, {
      members: rows.length ? rows : undefined,
      ...(named.length ? { invitedPax: named.length, invitedBabies: babyCount(named) } : {}),
    });
  }

  const patch = (id, p) => up({ guests: wd.data.guests.map((g) => (g.id === id ? { ...g, ...p } : g)) });

  function remove(id) {
    const g = wd.data.guests.find((x) => x.id === id);
    up({ guests: wd.data.guests.filter((x) => x.id !== id), trash: pushTrash(wd.data, "guest", g) });
  }

  function sendWhatsApp(g) {
    const msg = buildInviteMessage(wd.data.settings.inviteTemplate, g, wd.data.settings, app.wedding);
    const link = waLink(g.phone, msg);
    if (link) {
      window.open(link, "_blank");
      patch(g.id, { invitedAt: g.invitedAt || Date.now() });
    }
  }

  function toggleEventTag(g, evId, active) {
    const all = (wd.data.events || []).map((x) => x.id);
    let cur = g.events && g.events.length ? [...g.events] : [...all];
    cur = active ? cur.filter((x) => x !== evId) : [...cur, evId];
    if (cur.length === 0) return; // must be invited to at least one event
    patch(g.id, { events: all.every((x) => cur.includes(x)) ? undefined : cur });
  }

  const pool = $derived(side ? wd.data.guests.filter((g) => g.side === side) : wd.data.guests);

  const shown = $derived(
    pool.filter((g) => {
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
    })
  );

  const filters = $derived([
    ["all", "All"],
    ["notInvited", "Not invited"],
    ["pending", "Pending"],
    ["yes", "Attending"],
    ["no", "Declined"],
    ["checkedIn", "🎟️ Checked in"],
    ...(side ? [] : [["bride", "Bride's side"], ["groom", "Groom's side"]]),
  ]);

  const clashes = $derived(findNameClashes(pool));

  // eating pax preview for a confirmed guest (shown in the RSVP row)
  const eatingOf = (g) =>
    Math.max(
      0,
      num(g.confirmedPax || g.invitedPax || 1) -
        Math.min(
          g.confirmedBabies === "" || g.confirmedBabies === undefined ? num(g.invitedBabies) : num(g.confirmedBabies),
          num(g.confirmedPax || g.invitedPax || 1)
        )
    );
</script>

<div class="grid gap-4">
  <Card>
    <div class="mb-3 wb-serif" style="font-size:20px;font-weight:600">
      Add a guest
      {#if side}
        <Pill tone={side === "bride" ? "gold" : "green"}>{cap(side)}'s side</Pill>
      {/if}
    </div>
    <div class="grid md:grid-cols-6 gap-3 items-end">
      <Field label="Family / invite name" className="md:col-span-2">
        <input
          class="wb-input"
          bind:value={form.name}
          placeholder="e.g. Gabriel Paul's Family"
          onkeydown={(e) => e.key === "Enter" && add()}
        />
        {#if dupName}
          <span class="text-xs" style="color:{C.red}">Already on the guest list — change the name to avoid a duplicate.</span>
        {/if}
      </Field>
      {#if !side}
        <Field label="Side">
          <select class="wb-input" bind:value={form.side}>
            <option value="bride">Bride</option>
            <option value="groom">Groom</option>
          </select>
        </Field>
      {/if}
      <Field label="Group / relation" className="md:col-span-2">
        <GroupSelect value={form.group} options={groupOptions} onChange={(v) => (form.group = v)} />
      </Field>
    </div>

    <div class="mt-3 p-3" style="background:{C.soft};border:1px dashed {C.line};border-radius:10px">
      <div class="text-xs uppercase tracking-wider mb-2" style="color:{C.muted}">Family members under this invite</div>
      <MemberRows members={form.members} onChange={(rows) => (form.members = rows)} />
      <p class="text-xs mt-2" style="color:{C.muted}">
        One box per person, <b>including the family head</b> — e.g. for "Gabriel Paul's Family", add Gabriel Paul
        himself as a member too. Mark each as adult or baby 👶 (babies are excluded from catering). The pax count
        follows these boxes automatically.
      </p>
      {#if formMembers.length === 0}
        <div class="flex items-center gap-2 mt-2">
          <span class="text-xs" style="color:{C.muted}">Not naming people? Just set the pax count:</span>
          <input class="wb-input" style="width:80px;padding:4px 8px" type="number" min="1" bind:value={form.invitedPax} />
        </div>
      {/if}
    </div>

    <div class="grid md:grid-cols-5 gap-3 items-end mt-3">
      <Field label="Phone (optional)" className="md:col-span-2">
        <input class="wb-input" bind:value={form.phone} placeholder="e.g. 012-345 6789" />
      </Field>
      <div class="md:col-span-2 pb-2 text-sm" style="color:{C.muted}">
        {#if formMembers.length > 0}
          This invite: <b style="color:{C.green}">{formMembers.length} pax{formBabies > 0 ? ` · ${formBabies} 👶` : ""}</b>
        {/if}
        {#if !form.name.trim()}
          <span class="text-xs" style="color:{C.red}">{formMembers.length > 0 ? " — " : ""}fill in the family / invite name above first</span>
        {/if}
      </div>
      <div>
        <Btn onclick={add} disabled={!form.name.trim() || dupName}>Add guest</Btn>
      </div>
    </div>
    <p class="text-xs mt-2" style="color:{C.muted}">
      Once this family RSVPs, you (or they, via the RSVP link) tick exactly who's coming, name by name.
    </p>
  </Card>

  <InvitePanel {pool} />

  {#if clashes.inviteDupes.length || clashes.withinDupes.length || clashes.acrossDupes.length}
    <Card style="border-color:{C.gold}">
      <div class="wb-serif" style="font-size:18px;font-weight:600">⚠️ Duplicate name check</div>
      {#if clashes.inviteDupes.length > 0}
        <p class="text-sm mt-2">
          <b style="color:{C.red}">Two invites share the same name:</b>
          {clashes.inviteDupes.join(", ")}. Guests searching at RSVP/check-in may pick the wrong one — rename one of
          them (✏️ Edit), e.g. add the branch: "Uncle Lim — Dad's side".
        </p>
      {/if}
      {#if clashes.withinDupes.length > 0}
        <p class="text-sm mt-2">
          <b style="color:{C.red}">Same name twice inside one family:</b>
          {clashes.withinDupes.map((d) => `${d.name} (in ${d.invite})`).join(", ")}. Name-ticking at RSVP and check-in
          can't tell them apart — make each member unique, e.g. "Adam" and "Adam Jr".
        </p>
      {/if}
      {#if clashes.acrossDupes.length > 0}
        <p class="text-sm mt-2" style="color:{C.muted}">
          <b style="color:{C.gold}">Same member name in different invites:</b>
          {clashes.acrossDupes.map((d) => `${d.name} (${d.invites.join(" & ")})`).join("; ")}. This works — the search
          shows which family each result belongs to — but if they're different people, adding a surname avoids mix-ups
          at the door.
        </p>
      {/if}
    </Card>
  {/if}

  <div class="flex gap-2 flex-wrap items-center">
    <div class="flex" style="border:1px solid {C.line};border-radius:999px;overflow:hidden">
      {#each [["list", "📋 List"], ["tree", "🌳 Family tree"]] as [k, label] (k)}
        <button
          onclick={() => (view = k)}
          style="padding:5px 14px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:{view === k ? C.green : C.card};color:{view === k ? C.onGreen : C.muted}"
        >
          {label}
        </button>
      {/each}
    </div>
    <button
      onclick={() => (manageGroups = !manageGroups)}
      style="padding:5px 12px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid {manageGroups ? C.green : C.line};background:{manageGroups ? C.greenSoft : C.card};color:{manageGroups ? C.green : C.muted};cursor:pointer"
    >
      🏷️ Groups
    </button>
    {#each filters as [k, label] (k)}
      <button
        onclick={() => (filter = k)}
        style="padding:5px 12px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid {filter === k ? C.gold : C.line};background:{filter === k ? C.goldSoft : C.card};color:{filter === k ? C.gold : C.muted};cursor:pointer"
      >
        {label}
      </button>
    {/each}
    <input class="wb-input" style="width:200px;margin-left:auto" placeholder="Search…" bind:value={search} />
  </div>

  {#if manageGroups}
    <Card>
      <div class="mb-2 wb-serif" style="font-size:18px;font-weight:600">🏷️ Groups in use</div>
      {#if groupsInUse.length === 0}
        <span class="text-sm" style="color:{C.muted}">No groups assigned yet.</span>
      {:else}
        <div class="grid gap-2">
          {#each groupsInUse as [name, list] (name)}
            <div class="p-2" style="background:{C.soft};border:1px solid {C.line};border-radius:8px">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-semibold">{name}</span>
                <Pill>
                  {list.length} invite{list.length === 1 ? "" : "s"} · {list.reduce((s, g) => s + num(g.invitedPax || 1), 0)} pax
                </Pill>
                <div class="ml-auto">
                  {#if groupEdit === name}
                    <Btn kind="ghost" small onclick={() => (groupEdit = null)}>Cancel</Btn>
                  {:else}
                    <Btn
                      kind="ghost"
                      small
                      onclick={() => {
                        groupEdit = name;
                        groupTarget = "";
                      }}
                    >
                      Change / delete…
                    </Btn>
                  {/if}
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-1 mt-2">
                <span class="text-xs mr-1" style="color:{C.muted}">Affected — tap a name to move just that invite:</span>
                {#each list as g (g.id)}
                  <button
                    onclick={() => {
                      guestMove = guestMove === g.id ? null : g.id;
                      guestMoveTarget = "";
                    }}
                    style="padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid {guestMove === g.id ? C.gold : C.line};background:{guestMove === g.id ? C.goldSoft : 'transparent'};color:{guestMove === g.id ? C.gold : C.muted}"
                  >
                    {g.name}
                  </button>
                {/each}
              </div>
              {#if list.some((g) => g.id === guestMove)}
                <div class="mt-2 p-3" style="background:{C.card};border:1px dashed {C.gold};border-radius:8px">
                  <div class="text-xs mb-2" style="color:{C.muted}">
                    Move <b style="color:{C.ink}">{(list.find((g) => g.id === guestMove) || {}).name}</b> to:
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <div style="min-width:260px;flex:1">
                      <GroupSelect value={guestMoveTarget} options={groupOptions.filter((o) => o !== name)} onChange={(v) => (guestMoveTarget = v)} />
                    </div>
                    <Btn
                      small
                      onclick={() => {
                        patch(guestMove, { group: guestMoveTarget });
                        guestMove = null;
                        guestMoveTarget = "";
                      }}
                    >
                      {guestMoveTarget ? `Move to "${guestMoveTarget}"` : "Remove from group"}
                    </Btn>
                  </div>
                </div>
              {/if}
              {#if groupEdit === name}
                <div class="mt-2 p-3" style="background:{C.card};border:1px dashed {C.gold};border-radius:8px">
                  <div class="text-xs mb-2" style="color:{C.muted}">
                    Move these {list.length} invite{list.length === 1 ? "" : "s"} to another group — or to none — and
                    "{name}" disappears from the list:
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <div style="min-width:260px;flex:1">
                      <GroupSelect value={groupTarget} options={groupOptions.filter((o) => o !== name)} onChange={(v) => (groupTarget = v)} />
                    </div>
                    <Btn small onclick={() => reassignGroup(name, groupTarget)}>
                      {groupTarget ? `Move to "${groupTarget}"` : "Remove group (ungrouped)"}
                    </Btn>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
      <p class="text-xs mt-2" style="color:{C.muted}">
        Nested paths are separate entries — changing "Friends" doesn't touch "Friends / Mom's friends". Guests keep
        everything else (RSVP, members, gifts); only their group label changes.
      </p>
    </Card>
  {/if}

  {#if shown.length === 0}
    <Card>
      <span style="color:{C.muted}">No guests here yet. Add someone above to begin.</span>
    </Card>
  {/if}

  {#if view === "tree" && shown.length > 0}
    <FamilyTree pool={shown} {side} coupleName={wd.data.settings.couple} />
  {/if}

  {#if view === "list"}
    {#each shown as g (g.id)}
      <Card style="padding:14px">
        <div class="flex flex-wrap items-center gap-2">
          <div class="font-semibold text-base mr-1">{g.name}</div>
          <Pill tone={g.side === "bride" ? "gold" : "green"}>{g.side === "bride" ? "Bride" : "Groom"}</Pill>
          {#if g.group}<Pill>{g.group}</Pill>{/if}
          <Pill>
            {g.invitedPax} invited{num(g.invitedBabies) > 0 ? ` · ${num(g.invitedBabies)} 👶` : ""}
          </Pill>
          {#if g.checkedInAt}
            <Pill tone={num(g.checkedInPax) === num(g.confirmedPax || g.invitedPax) ? "green" : "red"}>
              🎟️ {num(g.checkedInPax)} arrived{num(g.checkedInBabies) > 0 ? ` · ${num(g.checkedInBabies)} 👶` : ""}{num(g.checkedInPax) !== num(g.confirmedPax || g.invitedPax) ? ` (expected ${num(g.confirmedPax || g.invitedPax)})` : ""}
            </Pill>
          {/if}
          {#if num(g.pledgeAmount) > 0}
            <Pill tone="gold">💝 pledged {RM(g.pledgeAmount)} · {g.pledgeMethod === "qr" ? "QR" : "cash"}</Pill>
          {/if}
          {#if g.phone}
            <span class="text-xs" style="color:{C.muted}">{g.phone}</span>
          {/if}
          {#if g.invitedAt}
            <Pill tone="green">📨 Invited {new Date(g.invitedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}</Pill>
          {/if}
          <div class="ml-auto flex gap-2 items-center">
            {#if g.phone}
              <button
                onclick={() => sendWhatsApp(g)}
                title={g.invitedAt ? "Send again on WhatsApp" : "Send invitation on WhatsApp"}
                style="padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid {C.waBtn};background:{g.invitedAt ? 'transparent' : C.waSoft};color:{C.waBtn}"
              >
                💬 WhatsApp
              </button>
            {/if}
            {#each [["pending", "Pending"], ["yes", "Attending"], ["no", "Declined"]] as [k, label] (k)}
              <button
                onclick={() => patch(g.id, { rsvp: k, confirmedPax: k === "yes" ? g.confirmedPax || g.invitedPax : "" })}
                style="padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid {g.rsvp === k ? (k === 'yes' ? C.green : k === 'no' ? C.red : C.gold) : C.line};background:{g.rsvp === k ? (k === 'yes' ? C.greenSoft : k === 'no' ? C.redSoft : C.goldSoft) : 'transparent'};color:{g.rsvp === k ? (k === 'yes' ? C.green : k === 'no' ? C.red : C.gold) : C.muted}"
              >
                {label}
              </button>
            {/each}
            <Btn kind="ghost" small onclick={() => (editId = editId === g.id ? null : g.id)}>
              {editId === g.id ? "Done" : "✏️ Edit"}
            </Btn>
            <Btn kind="danger" small onclick={() => (confirmDelete = confirmDelete === g.id ? null : g.id)}>✕</Btn>
          </div>
        </div>

        {#if confirmDelete === g.id}
          <div class="p-3 mt-2" style="background:{C.redSoft};border:1px solid {C.red};border-radius:10px">
            <div class="text-sm font-semibold" style="color:{C.red}">Delete "{g.name}"?</div>
            <div class="text-xs mt-1" style="color:{C.muted}">
              This removes their RSVP, check-in and gift records for everyone on the team. It cannot be undone.
            </div>
            <div class="flex gap-2 mt-2">
              <Btn
                small
                onclick={() => {
                  remove(g.id);
                  confirmDelete = null;
                }}
              >
                Yes, delete guest
              </Btn>
              <Btn kind="ghost" small onclick={() => (confirmDelete = null)}>Cancel</Btn>
            </div>
          </div>
        {/if}

        {#if membersOf(g).length > 0}
          <div class="flex flex-wrap items-center gap-1 mt-2">
            <span class="text-xs mr-1" style="color:{C.muted}">👨‍👩‍👧</span>
            {#each membersOf(g) as m (m.name)}
              {@const known = g.rsvp === "yes" && Array.isArray(g.confirmedMembers)}
              {@const coming = known ? g.confirmedMembers.includes(m.name) : null}
              <button
                onclick={() => g.rsvp === "yes" && toggleMember(g, m.name)}
                title={g.rsvp === "yes" ? "Tap to toggle whether this person is coming" : "Set RSVP to Attending to tick people off"}
                style="padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;cursor:{g.rsvp === 'yes' ? 'pointer' : 'default'};border:1px solid {coming === true ? C.green : C.line};background:{coming === true ? C.greenSoft : 'transparent'};color:{coming === true ? C.green : C.muted};text-decoration:{coming === false ? 'line-through' : 'none'}"
              >
                {coming === true ? "✓ " : ""}{m.name}{m.type === "baby" ? " 👶" : ""}{m.diet === "veg" ? " 🥗" : ""}
              </button>
            {/each}
            {#if g.rsvp === "yes"}
              <span class="text-xs ml-1" style="color:{C.muted}">tap names to mark who's coming</span>
            {/if}
          </div>
        {/if}

        {#if editId === g.id}
          <div class="flex flex-wrap gap-3 mt-3 items-end p-3" style="background:{C.soft};border:1px dashed {C.gold};border-radius:8px">
            <Field label="Name">
              <input class="wb-input" style="width:200px" value={g.name} oninput={(e) => patch(g.id, { name: e.target.value })} />
              {#if wd.data.guests.some((x) => x.id !== g.id && x.name.trim().toLowerCase() === g.name.trim().toLowerCase())}
                <span class="text-xs" style="color:{C.red}">Another invite already has this name</span>
              {/if}
            </Field>
            {#if !side}
              <Field label="Side">
                <select class="wb-input" style="width:100px" value={g.side} onchange={(e) => patch(g.id, { side: e.target.value })}>
                  <option value="bride">Bride</option>
                  <option value="groom">Groom</option>
                </select>
              </Field>
            {/if}
            <Field label="Group / relation" className="min-w-72">
              <GroupSelect value={g.group || ""} options={groupOptions} onChange={(v) => patch(g.id, { group: v })} />
            </Field>
            {#if membersOf(g).length === 0}
              <Field label="Invited pax">
                <input class="wb-input" style="width:90px" type="number" min="1" value={g.invitedPax} oninput={(e) => patch(g.id, { invitedPax: e.target.value })} />
              </Field>
            {/if}
            <Field label="Phone">
              <input class="wb-input" style="width:150px" value={g.phone || ""} oninput={(e) => patch(g.id, { phone: e.target.value })} />
            </Field>
            <div class="pb-1">
              <Btn kind="ghost" small onclick={() => patch(g.id, { invitedAt: g.invitedAt ? null : Date.now() })}>
                {g.invitedAt ? "📨 Clear “invited” status" : "📨 Mark as invited"}
              </Btn>
            </div>
            <div class="w-full">
              <div class="text-xs uppercase tracking-wider mb-2" style="color:{C.muted}">
                Family members (adult or baby 👶 — pax follows these boxes)
              </div>
              <MemberRows members={(g.members || []).map(asMember)} onChange={(rows) => patchMembers(g, rows)} />
            </div>
          </div>
        {/if}

        {#if (wd.data.events || []).length > 1}
          <div class="flex flex-wrap items-center gap-1 mt-2">
            <span class="text-xs mr-1" style="color:{C.muted}">Invited to:</span>
            {#each wd.data.events || [] as ev (ev.id)}
              {@const active = guestInEvent(g, ev.id)}
              <button
                onclick={() => toggleEventTag(g, ev.id, active)}
                style="padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid {active ? C.green : C.line};background:{active ? C.greenSoft : 'transparent'};color:{active ? C.green : C.muted}"
              >
                {ev.icon || "🎉"} {ev.name}
              </button>
            {/each}
          </div>
        {/if}

        {#if g.rsvp === "yes"}
          <div class="flex flex-wrap gap-3 mt-3 items-end">
            <Field label="Confirmed pax">
              <input class="wb-input" style="width:90px" type="number" min="0" value={g.confirmedPax} oninput={(e) => patch(g.id, { confirmedPax: e.target.value })} />
            </Field>
            <Field label="…of which babies 👶">
              <input
                class="wb-input"
                style="width:90px"
                type="number"
                min="0"
                placeholder={String(num(g.invitedBabies))}
                value={g.confirmedBabies === undefined ? "" : g.confirmedBabies}
                oninput={(e) => patch(g.id, { confirmedBabies: e.target.value })}
              />
            </Field>
            <div class="pb-2 text-xs" style="color:{C.muted}">
              = <b style="color:{C.green}">{eatingOf(g)}</b> eating pax for catering
            </div>
            <Field label="Notes" className="flex-1 min-w-40">
              <input class="wb-input" value={g.dietary} oninput={(e) => patch(g.id, { dietary: e.target.value })} placeholder="Halal, allergies, kids' seats…" />
            </Field>
          </div>
        {/if}
      </Card>
    {/each}
  {/if}
</div>
