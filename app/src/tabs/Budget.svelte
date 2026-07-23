<script>
  // budget tab (couple only) — port of legacy Budget
  import { C } from "../stores/theme.svelte.js";
  import { wd, up } from "../stores/wedding.svelte.js";
  import { BUDGET_CATS } from "../lib/constants.js";
  import { uid, num, RM, pushTrash } from "../lib/utils.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Field from "../components/Field.svelte";
  import Pill from "../components/Pill.svelte";
  import Stat from "../components/Stat.svelte";
  import GroupSelect from "../components/GroupSelect.svelte";

  let { stats } = $props();

  // preset categories plus any custom ones already in use, for the picker dropdown
  const categoryOptions = $derived(
    [...new Set([...BUDGET_CATS, ...(wd.data.budget || []).map((b) => b.category).filter(Boolean)])].sort((a, b) =>
      a.localeCompare(b)
    )
  );

  const events = $derived(wd.data.events || []);
  let evFilter = $state("all");
  let form = $state({
    category: BUDGET_CATS[0],
    eventId: "",
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
  $effect(() => {
    if (!form.eventId && events[0]) form.eventId = events[0].id;
  });

  function add() {
    if (!form.item.trim()) return;
    up({
      budget: [
        ...wd.data.budget,
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
    form = { category: form.category, eventId: form.eventId, item: "", contactName: "", contactPhone: "", budgeted: "", actual: "", paidAmount: "", dueDate: "", deposit: "", handledBy: form.handledBy };
  }

  const patch = (id, p) => up({ budget: wd.data.budget.map((b) => (b.id === id ? { ...b, ...p } : b)) });
  function remove(id) {
    const b = wd.data.budget.find((x) => x.id === id);
    up({ budget: wd.data.budget.filter((x) => x.id !== id), trash: pushTrash(wd.data, "budget", b) });
  }

  // migration: old items used a paid checkbox instead of a paid amount
  const paidOf = (b) => num(b.paidAmount !== undefined ? b.paidAmount : b.paid ? b.actual : 0);
  const balanceOf = (b) => num(b.actual) - paidOf(b);
  const isOverdue = (b) => b.dueDate && balanceOf(b) > 0 && new Date(b.dueDate) < new Date(new Date().toDateString());
  const evName = (id) => {
    const e = events.find((x) => x.id === id);
    return e ? `${e.icon || "🎉"} ${e.name}` : null;
  };

  const visible = $derived(wd.data.budget.filter((b) => evFilter === "all" || b.eventId === evFilter || (!b.eventId && evFilter === "untagged")));
  const filteredTotal = $derived(visible.reduce((s, x) => s + num(x.actual), 0));
  const filteredPaid = $derived(visible.reduce((s, x) => s + paidOf(x), 0));

  const byCat = $derived.by(() => {
    const map = {};
    visible.forEach((b) => {
      (map[b.category] = map[b.category] || []).push(b);
    });
    return map;
  });

  // ---- estimate vs actual (how much more to spend) ----
  // planned target falls back to the sum of line budgets when no overall total is set
  const plannedTarget = $derived(num(wd.data.budgetTarget) || stats.budgeted);
  const leftVsPlan = $derived(plannedTarget - stats.actual); // + = still within plan, − = over
  const estVariance = $derived(stats.budgeted - stats.actual); // + = under estimates, − = over

  // per-category: estimated (Σ budgeted) vs actual (Σ committed), across all events
  const catEstimate = $derived.by(() => {
    const map = {};
    (wd.data.budget || []).forEach((b) => {
      const m = (map[b.category] = map[b.category] || { budgeted: 0, actual: 0 });
      m.budgeted += num(b.budgeted);
      m.actual += num(b.actual);
    });
    return Object.entries(map)
      .map(([cat, v]) => ({ cat, budgeted: v.budgeted, actual: v.actual, diff: v.budgeted - v.actual }))
      .sort((a, b) => a.cat.localeCompare(b.cat));
  });
</script>

<div class="grid gap-4">
  {#if events.length > 1}
    <div class="flex gap-2 flex-wrap items-center">
      {#each [["all", "All events"], ...events.map((e) => [e.id, `${e.icon || "🎉"} ${e.name}`])] as [k, label] (k)}
        <button
          onclick={() => (evFilter = k)}
          style="padding:5px 12px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid {evFilter === k ? C.green : C.line};background:{evFilter === k ? C.greenSoft : C.card};color:{evFilter === k ? C.green : C.muted}"
        >
          {label}
        </button>
      {/each}
      {#if evFilter !== "all"}
        <span class="text-xs ml-auto" style="color:{C.muted}">
          This event: {RM(filteredPaid)} paid of {RM(filteredTotal)} · balance {RM(Math.max(0, filteredTotal - filteredPaid))}
        </span>
      {/if}
    </div>
  {/if}
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <Card style="padding:16px">
      <div class="text-xs uppercase tracking-wider mb-1" style="color:{C.muted}">Planned budget</div>
      <div class="flex items-center gap-1">
        <span class="text-sm" style="color:{C.muted}">RM</span>
        <input
          class="wb-input"
          style="font-size:18px;font-weight:600;padding:4px 8px"
          type="number"
          min="0"
          value={wd.data.budgetTarget || ""}
          oninput={(e) => up({ budgetTarget: e.target.value })}
          placeholder="set your total"
        />
      </div>
      <div class="text-xs mt-1" style="color:{C.muted}">{RM(stats.budgeted)} allocated across vendors</div>
    </Card>
    <Stat
      label="Committed (totals)"
      value={RM(stats.actual)}
      tone={stats.actual > (stats.budgetTarget || stats.budgeted) && (stats.budgetTarget || stats.budgeted) > 0 ? C.red : C.ink}
      sub={(stats.budgetTarget || stats.budgeted) > 0
        ? `${Math.round((stats.actual / (stats.budgetTarget || stats.budgeted)) * 100)}% of plan`
        : undefined}
    />
    <Stat label="Paid out" value={RM(stats.paidOut)} tone={C.green} />
    <Stat
      label="Balance to pay"
      value={RM(stats.balanceToPay)}
      tone={stats.balanceToPay > 0 ? C.gold : C.green}
      sub={stats.depositsToCollect > 0 ? `+ ${RM(stats.depositsToCollect)} deposits to collect back` : undefined}
    />
  </div>

  {#if (wd.data.budget || []).length > 0}
    <Card>
      <div class="wb-serif" style="font-size:20px;font-weight:600">📊 Estimate vs. actual</div>
      <p class="text-xs mt-1 mb-3" style="color:{C.muted}">
        How your real costs compare to what you planned — so you can see roughly how much is still left to spend.
      </p>

      <!-- headline: how much of the planned budget is left -->
      <div class="p-3 mb-3" style="background:{leftVsPlan >= 0 ? C.greenSoft : C.redSoft};border:1px solid {leftVsPlan >= 0 ? C.green : C.red};border-radius:12px">
        <div class="text-xs uppercase tracking-wider" style="color:{C.muted}">
          {leftVsPlan >= 0 ? "Left of your planned budget" : "Over your planned budget"}
        </div>
        <div class="wb-serif" style="font-size:30px;font-weight:700;color:{leftVsPlan >= 0 ? C.green : C.red}">
          {RM(Math.abs(leftVsPlan))}
        </div>
        <div class="text-xs mt-1" style="color:{C.muted}">
          Planned {RM(plannedTarget)} − committed {RM(stats.actual)}{num(wd.data.budgetTarget) ? "" : " (no overall total set — using the sum of your line budgets)"}
        </div>
      </div>

      <!-- estimated (line budgets) vs actual committed -->
      <div class="grid grid-cols-3 gap-3 mb-3">
        <div>
          <div class="text-xs uppercase tracking-wider" style="color:{C.muted}">Estimated</div>
          <div class="text-lg" style="font-weight:600;color:{C.ink}">{RM(stats.budgeted)}</div>
          <div class="text-xs" style="color:{C.muted}">sum of line budgets</div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-wider" style="color:{C.muted}">Actual cost</div>
          <div class="text-lg" style="font-weight:600;color:{C.ink}">{RM(stats.actual)}</div>
          <div class="text-xs" style="color:{C.muted}">committed totals</div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-wider" style="color:{C.muted}">Difference</div>
          <div class="text-lg" style="font-weight:600;color:{estVariance >= 0 ? C.green : C.red}">{RM(Math.abs(estVariance))}</div>
          <div class="text-xs" style="color:{C.muted}">{estVariance >= 0 ? "under estimate" : "over estimate"}</div>
        </div>
      </div>

      <!-- per-category breakdown -->
      {#if catEstimate.length > 0}
        <div style="border-top:1px solid {C.line}">
          <div class="grid gap-1 mt-2" style="font-size:13px">
            <div class="flex items-center gap-2 text-xs uppercase tracking-wider" style="color:{C.muted}">
              <span style="flex:1">Category</span>
              <span style="width:90px;text-align:right">Estimated</span>
              <span style="width:90px;text-align:right">Actual</span>
              <span style="width:90px;text-align:right">Difference</span>
            </div>
            {#each catEstimate as c (c.cat)}
              <div class="flex items-center gap-2 py-1" style="border-top:1px solid {C.line}">
                <span style="flex:1;color:{C.ink}">{c.cat}</span>
                <span style="width:90px;text-align:right;color:{C.muted}">{RM(c.budgeted)}</span>
                <span style="width:90px;text-align:right;color:{C.ink}">{RM(c.actual)}</span>
                <span style="width:90px;text-align:right;font-weight:600;color:{c.diff >= 0 ? C.green : C.red}">
                  {c.diff >= 0 ? "" : "−"}{RM(Math.abs(c.diff))}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </Card>
  {/if}

  <Card>
    <div class="mb-3 wb-serif" style="font-size:20px;font-weight:600">Add a vendor / expense</div>
    <div class="grid md:grid-cols-6 gap-3 items-end">
      <Field label="Category">
        <GroupSelect
          value={form.category}
          options={categoryOptions}
          onChange={(v) => (form.category = v)}
          placeholder="Your own category, e.g. Marquee & tent"
          allowNone={false}
        />
      </Field>
      {#if events.length > 1}
        <Field label="Event">
          <select class="wb-input" bind:value={form.eventId}>
            {#each events as e (e.id)}
              <option value={e.id}>{e.icon || "🎉"} {e.name}</option>
            {/each}
          </select>
        </Field>
      {/if}
      <Field label="Vendor / item" className="md:col-span-2">
        <input class="wb-input" bind:value={form.item} placeholder="e.g. Canopy + haldi decor + welcome board" onkeydown={(e) => e.key === "Enter" && add()} />
      </Field>
      <Field label="Budgeted (RM)">
        <input class="wb-input" type="number" min="0" bind:value={form.budgeted} />
      </Field>
      <Field label="Total (RM)">
        <input class="wb-input" type="number" min="0" bind:value={form.actual} />
      </Field>
      <Field label="Paid so far (RM)">
        <input class="wb-input" type="number" min="0" bind:value={form.paidAmount} />
      </Field>
    </div>
    <div class="grid md:grid-cols-6 gap-3 items-end mt-3">
      <Field label="Contact person">
        <input class="wb-input" bind:value={form.contactName} placeholder="e.g. Meraki / Asha" />
      </Field>
      <Field label="Contact no">
        <input class="wb-input" bind:value={form.contactPhone} placeholder="012-7080865" />
      </Field>
      <Field label="Balance to pay by">
        <input class="wb-input" type="date" bind:value={form.dueDate} />
      </Field>
      <Field label="Deposit to collect (RM)">
        <input class="wb-input" type="number" min="0" bind:value={form.deposit} />
      </Field>
      <Field label="Handled by">
        <input class="wb-input" bind:value={form.handledBy} placeholder="e.g. Kenneth" />
      </Field>
      <div>
        <Btn onclick={add}>Add</Btn>
      </div>
    </div>
    <p class="text-xs mt-2" style="color:{C.muted}">
      Balance to pay is calculated automatically (Total − Paid). "Deposit to collect" is a refundable deposit the
      vendor holds — tick it off once you get the money back after the event.
    </p>
  </Card>

  {#if Object.keys(byCat).length === 0}
    <Card>
      <span style="color:{C.muted}">No vendors yet. Common first entries: venue deposit, photographer, bridal package.</span>
    </Card>
  {/if}

  {#each Object.entries(byCat) as [cat, items] (cat)}
    {@const catTotal = items.reduce((s, x) => s + num(x.actual), 0)}
    {@const catPaid = items.reduce((s, x) => s + paidOf(x), 0)}
    <Card style="padding:14px">
      <div class="flex items-center gap-3 mb-2 flex-wrap">
        <div class="wb-serif" style="font-size:18px;font-weight:600">{cat}</div>
        <span class="text-xs ml-auto" style="color:{C.muted}">{RM(catPaid)} paid of {RM(catTotal)} total</span>
      </div>
      <div class="grid gap-2">
        {#each items as b (b.id)}
          {@const bal = balanceOf(b)}
          {@const settled = num(b.actual) > 0 && bal <= 0}
          {@const overdue = isOverdue(b)}
          <div class="p-3" style="background:{C.soft};border:1px solid {overdue ? C.red : C.line};border-radius:8px">
            <!-- line 1: name, contact, handled by, status -->
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold">{b.item}</span>
              {#if evFilter === "all" && b.eventId && evName(b.eventId)}
                <Pill tone="green">{evName(b.eventId)}</Pill>
              {/if}
              {#if b.contactName || b.contactPhone}
                <span class="text-xs" style="color:{C.muted}">
                  👤 {b.contactName}{b.contactName && b.contactPhone ? " · " : ""}{b.contactPhone}
                </span>
              {/if}
              {#if b.handledBy}<Pill>📋 {b.handledBy}</Pill>{/if}
              <div class="ml-auto flex items-center gap-2">
                {#if settled}
                  <Pill tone="green">Settled ✓</Pill>
                {:else if bal > 0}
                  <Pill tone={overdue ? "red" : "gold"}>
                    {overdue ? "⚠️ Overdue: " : "Balance: "}{RM(bal)}{b.dueDate
                      ? ` by ${new Date(b.dueDate).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}`
                      : ""}
                  </Pill>
                {/if}
                <Btn kind="danger" small onclick={() => remove(b.id)}>✕</Btn>
              </div>
            </div>
            <!-- line 2: money inputs -->
            <div class="flex flex-wrap items-end gap-3 mt-2">
              <Field label="Budgeted">
                <input class="wb-input" style="width:100px;padding:4px 8px" type="number" min="0" value={b.budgeted} oninput={(e) => patch(b.id, { budgeted: e.target.value })} />
              </Field>
              <Field label="Total (RM)">
                <input class="wb-input" style="width:100px;padding:4px 8px" type="number" min="0" value={b.actual} oninput={(e) => patch(b.id, { actual: e.target.value })} />
              </Field>
              <Field label="Paid (RM)">
                <input
                  class="wb-input"
                  style="width:100px;padding:4px 8px"
                  type="number"
                  min="0"
                  value={b.paidAmount !== undefined ? b.paidAmount : paidOf(b)}
                  oninput={(e) => patch(b.id, { paidAmount: e.target.value })}
                />
              </Field>
              <div class="pb-1 text-xs" style="color:{bal > 0 ? (overdue ? C.red : C.gold) : C.green};font-weight:700">
                = {RM(Math.max(0, bal))} to pay{bal < 0 ? ` (overpaid ${RM(-bal)})` : ""}
              </div>
              {#if !settled}
                <Btn kind="ghost" small onclick={() => patch(b.id, { paidAmount: num(b.actual) })}>Mark fully paid</Btn>
              {/if}
              <Field label="Pay by">
                <input class="wb-input" style="width:140px;padding:4px 8px" type="date" value={b.dueDate || ""} onchange={(e) => patch(b.id, { dueDate: e.target.value })} />
              </Field>
              <Field label="Deposit (RM)">
                <input class="wb-input" style="width:100px;padding:4px 8px" type="number" min="0" value={b.deposit || ""} oninput={(e) => patch(b.id, { deposit: e.target.value })} />
              </Field>
              {#if num(b.deposit) > 0}
                <button
                  onclick={() => patch(b.id, { depositCollected: !b.depositCollected })}
                  style="padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid {b.depositCollected ? C.green : C.gold};background:{b.depositCollected ? C.greenSoft : C.goldSoft};color:{b.depositCollected ? C.green : C.gold};margin-bottom:2px"
                >
                  {b.depositCollected ? "💰 Deposit collected ✓" : `💰 Collect ${RM(b.deposit)} back`}
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </Card>
  {/each}
</div>
