<script>
  // catering tab (couple only) — port of legacy Catering
  import { C } from "../stores/theme.svelte.js";
  import { wd, up } from "../stores/wedding.svelte.js";
  import { uid, num, RM, pushTrash } from "../lib/utils.js";
  import { guestInEvent, vegOf } from "../lib/guests.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Field from "../components/Field.svelte";
  import Pill from "../components/Pill.svelte";

  const events = $derived(wd.data.events || []);
  let selEvent = $state("");
  $effect(() => {
    if (!selEvent && events[0]) selEvent = events[0].id;
  });
  let form = $state({ name: "", mode: "table", unitPrice: "", paxPerTable: 10 });

  // headcount for the selected event only
  const pool = $derived(wd.data.guests.filter((g) => guestInEvent(g, selEvent)));
  const attending = $derived(pool.filter((g) => g.rsvp === "yes"));

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

  const usingConfirmed = $derived(attending.length > 0);
  const basePax = $derived(usingConfirmed ? calcEating(attending, true) : calcEating(pool, false));
  const babies = $derived(usingConfirmed ? calcBabies(attending, true) : calcBabies(pool, false));
  const vegMeals = $derived((usingConfirmed ? attending : pool).reduce((s, g) => s + vegOf(g), 0));
  const buffer = $derived(num(wd.data.bufferPct));
  const plannedPax = $derived(Math.ceil(basePax * (1 + buffer / 100)));
  const selEventObj = $derived(events.find((e) => e.id === selEvent));

  function add() {
    if (!form.name.trim() || !num(form.unitPrice)) return;
    up({
      caterers: [
        ...wd.data.caterers,
        { id: uid(), eventId: selEvent, name: form.name.trim(), mode: form.mode, unitPrice: num(form.unitPrice), paxPerTable: num(form.paxPerTable) || 10 },
      ],
    });
    form = { name: "", mode: form.mode, unitPrice: "", paxPerTable: 10 };
  }
  function remove(id) {
    const c = wd.data.caterers.find((x) => x.id === id);
    up({ caterers: wd.data.caterers.filter((x) => x.id !== id), trash: pushTrash(wd.data, "caterer", c) });
  }

  const rows = $derived(
    wd.data.caterers
      .filter((c) => !c.eventId || c.eventId === selEvent)
      .map((c) => {
        if (c.mode === "table") {
          const tables = Math.max(1, Math.ceil(plannedPax / (c.paxPerTable || 10)));
          return { ...c, unitsLabel: `${tables} tables × ${RM(c.unitPrice)}`, cost: tables * c.unitPrice, perHead: plannedPax > 0 ? (tables * c.unitPrice) / plannedPax : 0 };
        }
        return { ...c, unitsLabel: `${plannedPax} pax × ${RM(c.unitPrice)}`, cost: plannedPax * c.unitPrice, perHead: c.unitPrice };
      })
  );
  const cheapest = $derived(rows.length ? Math.min(...rows.map((r) => r.cost)) : null);
</script>

<div class="grid gap-4">
  {#if events.length > 1}
    <div class="flex gap-2 flex-wrap">
      {#each events as e (e.id)}
        <button
          onclick={() => (selEvent = e.id)}
          style="padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid {selEvent === e.id ? C.green : C.line};background:{selEvent === e.id ? C.greenSoft : C.card};color:{selEvent === e.id ? C.green : C.muted}"
        >
          {e.icon || "🎉"} {e.name}
        </button>
      {/each}
    </div>
  {/if}

  <Card>
    <div class="wb-serif" style="font-size:20px;font-weight:600">
      Headcount — {selEventObj ? `${selEventObj.icon || ""} ${selEventObj.name}` : "Catering"}
    </div>
    <p class="text-sm mt-1" style="color:{C.muted}">
      {pool.length} invites tagged to this event. Based on {usingConfirmed ? "confirmed RSVPs" : "invited pax (no RSVPs confirmed yet)"}:
      <b style="color:{C.ink}">{basePax} eating pax</b>
      {#if babies > 0}
        · <b style="color:{C.gold}">{babies} 👶 excluded</b> from food count
      {/if}
      {#if vegMeals > 0}
        · <b style="color:{C.green}">{vegMeals} 🥗 vegetarian</b>
      {/if}
    </p>
    <div class="flex flex-wrap gap-4 items-end mt-3">
      <Field label="Buffer multiplier (%)">
        <input class="wb-input" style="width:110px" type="number" min="0" value={wd.data.bufferPct} oninput={(e) => up({ bufferPct: e.target.value })} />
      </Field>
      <div class="pb-1">
        <div class="text-xs uppercase tracking-wider" style="color:{C.muted}">Plan food for</div>
        <div class="wb-serif" style="font-size:28px;font-weight:700;color:{C.green}">{plannedPax} pax</div>
      </div>
    </div>
    <p class="text-xs mt-2" style="color:{C.muted}">
      A 10–15% buffer covers plus-ones, late confirmations and vendors' meals. The number updates automatically as
      RSVPs come in. Tag guests to events on their card in Guests & RSVP.
    </p>
  </Card>

  <Card>
    <div class="mb-3 wb-serif" style="font-size:20px;font-weight:600">
      Compare caterers {selEventObj && events.length > 1 ? `for ${selEventObj.name}` : ""}
    </div>
    <div class="grid md:grid-cols-5 gap-3 items-end">
      <Field label="Caterer / package" className="md:col-span-2">
        <input class="wb-input" bind:value={form.name} placeholder="e.g. Restoran Ah Yat – Package B" onkeydown={(e) => e.key === "Enter" && add()} />
      </Field>
      <Field label="Pricing">
        <select class="wb-input" bind:value={form.mode}>
          <option value="table">Per table</option>
          <option value="head">Per head (buffet)</option>
        </select>
      </Field>
      <Field label={form.mode === "table" ? "Price per table (RM)" : "Price per head (RM)"}>
        <input class="wb-input" type="number" min="0" bind:value={form.unitPrice} />
      </Field>
      {#if form.mode === "table"}
        <Field label="Pax per table">
          <input class="wb-input" type="number" min="1" bind:value={form.paxPerTable} />
        </Field>
      {:else}
        <div>
          <Btn onclick={add}>Add</Btn>
        </div>
      {/if}
    </div>
    {#if form.mode === "table"}
      <div class="mt-3">
        <Btn onclick={add}>Add</Btn>
      </div>
    {/if}

    {#if rows.length === 0}
      <p class="text-sm mt-4" style="color:{C.muted}">
        Add a couple of quotes to compare — costs recalculate for {plannedPax} pax automatically.
      </p>
    {:else}
      <div class="mt-4 grid gap-2">
        {#each rows.slice().sort((a, b) => a.cost - b.cost) as r (r.id)}
          <div
            class="flex flex-wrap items-center gap-3 p-3"
            style="border:1px solid {r.cost === cheapest ? C.gold : C.line};background:{r.cost === cheapest ? C.goldSoft : C.soft};border-radius:10px"
          >
            <div class="font-semibold">{r.name}</div>
            {#if r.cost === cheapest}<Pill tone="gold">Best price</Pill>{/if}
            <span class="text-sm" style="color:{C.muted}">{r.unitsLabel}</span>
            <div class="ml-auto text-right">
              <div class="font-bold">{RM(r.cost)}</div>
              <div class="text-xs" style="color:{C.muted}">≈ {RM(r.perHead)} / head</div>
            </div>
            <Btn kind="danger" small onclick={() => remove(r.id)}>✕</Btn>
          </div>
        {/each}
      </div>
    {/if}
  </Card>
</div>
