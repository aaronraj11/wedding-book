<script>
  // gift money tab — port of legacy Gifts
  import { C } from "../stores/theme.svelte.js";
  import { wd, up } from "../stores/wedding.svelte.js";
  import { uid, num, RM, cap, pushTrash } from "../lib/utils.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Field from "../components/Field.svelte";
  import Pill from "../components/Pill.svelte";
  import Stat from "../components/Stat.svelte";

  let { side } = $props();

  let extra = $state({ name: "", amount: "", method: "cash", note: "", side: "bride" });
  $effect(() => {
    if (side) extra.side = side;
  });

  const pool = $derived(side ? wd.data.guests.filter((g) => g.side === side) : wd.data.guests);
  const patch = (id, p) => up({ guests: wd.data.guests.map((g) => (g.id === id ? { ...g, ...p } : g)) });

  const extras = $derived(side ? wd.data.extraGifts.filter((x) => (x.side || "bride") === side) : wd.data.extraGifts);
  const givers = $derived(pool.filter((g) => num(g.giftAmount) > 0));
  const totalGuest = $derived(givers.reduce((s, g) => s + num(g.giftAmount), 0));
  const totalExtra = $derived(extras.reduce((s, x) => s + num(x.amount), 0));
  const total = $derived(totalGuest + totalExtra);
  const count = $derived(givers.length + extras.length);

  function addExtra() {
    if (!extra.name.trim() || !num(extra.amount)) return;
    up({ extraGifts: [...wd.data.extraGifts, { id: uid(), ...$state.snapshot(extra), side: side || extra.side, amount: num(extra.amount) }] });
    extra = { name: "", amount: "", method: "cash", note: "", side: side || extra.side };
  }
  function removeExtra(id) {
    const x = wd.data.extraGifts.find((e) => e.id === id);
    up({ extraGifts: wd.data.extraGifts.filter((e) => e.id !== id), trash: pushTrash(wd.data, "extraGift", x) });
  }

  const methods = ["cash", "bank transfer", "e-wallet", "cheque", "other"];
</script>

<div class="grid gap-4">
  <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
    <Stat label={side ? `${cap(side)}'s total` : "Total received"} value={RM(total)} tone={C.gold} />
    <Stat label="Gifts recorded" value={count} />
    <Stat label="Average gift" value={count ? RM(total / count) : RM(0)} />
  </div>

  <Card>
    <div class="wb-serif" style="font-size:20px;font-weight:600">
      Record gifts
      {#if side}
        <Pill tone={side === "bride" ? "gold" : "green"}>{cap(side)}'s side</Pill>
      {/if}
    </div>
    <p class="text-sm mt-1 mb-3" style="color:{C.muted}">
      Type the amount next to each guest as you open the angpow — handy for writing thank-you notes later.
    </p>
    {#if pool.length === 0}
      <span class="text-sm" style="color:{C.muted}">The guest list is empty — add guests first, then log gifts here.</span>
    {:else}
      <div class="grid gap-2">
        {#each pool as g (g.id)}
          <div class="flex flex-wrap items-center gap-2 p-2" style="background:{num(g.giftAmount) > 0 ? C.goldSoft : C.soft};border:1px solid {C.line};border-radius:8px">
            <span class="text-sm font-medium">{g.name}</span>
            {#if !side}<Pill tone={g.side === "bride" ? "gold" : "green"}>{cap(g.side)}</Pill>{/if}
            {#if g.rsvp === "yes"}<Pill tone="green">Attending</Pill>{/if}
            {#if num(g.pledgeAmount) > 0}
              <Pill tone="gold">pledged {RM(g.pledgeAmount)} ({g.pledgeMethod === "qr" ? "QR" : "cash"})</Pill>
            {/if}
            <div class="ml-auto flex items-center gap-2 flex-wrap">
              <span class="text-xs" style="color:{C.muted}">RM</span>
              <input class="wb-input" style="width:110px;padding:4px 8px" type="number" min="0" placeholder="0.00" value={g.giftAmount} oninput={(e) => patch(g.id, { giftAmount: e.target.value })} />
              <select class="wb-input" style="width:130px;padding:4px 8px" value={g.giftMethod || "cash"} onchange={(e) => patch(g.id, { giftMethod: e.target.value })}>
                {#each methods as m (m)}
                  <option>{m}</option>
                {/each}
              </select>
              <input class="wb-input" style="width:150px;padding:4px 8px" placeholder="Note" value={g.giftNote || ""} oninput={(e) => patch(g.id, { giftNote: e.target.value })} />
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <Card>
    <div class="mb-3 wb-serif" style="font-size:20px;font-weight:600">Gifts from people not on the list</div>
    <div class="grid md:grid-cols-6 gap-3 items-end">
      <Field label="From" className="md:col-span-2">
        <input class="wb-input" bind:value={extra.name} placeholder="e.g. Dad's business partner" onkeydown={(e) => e.key === "Enter" && addExtra()} />
      </Field>
      {#if !side}
        <Field label="Side">
          <select class="wb-input" bind:value={extra.side}>
            <option value="bride">Bride</option>
            <option value="groom">Groom</option>
          </select>
        </Field>
      {/if}
      <Field label="Amount (RM)">
        <input class="wb-input" type="number" min="0" bind:value={extra.amount} />
      </Field>
      <Field label="Method">
        <select class="wb-input" bind:value={extra.method}>
          {#each methods as m (m)}
            <option>{m}</option>
          {/each}
        </select>
      </Field>
      <div>
        <Btn kind="gold" onclick={addExtra}>Add gift</Btn>
      </div>
    </div>
    {#if extras.length > 0}
      <div class="grid gap-2 mt-4">
        {#each extras as x (x.id)}
          <div class="flex items-center gap-3 p-2" style="background:{C.soft};border:1px solid {C.line};border-radius:8px">
            <span class="text-sm font-medium">{x.name}</span>
            <Pill>{x.method}</Pill>
            {#if !side}<Pill tone={(x.side || "bride") === "bride" ? "gold" : "green"}>{cap(x.side || "bride")}</Pill>{/if}
            <span class="ml-auto font-semibold">{RM(x.amount)}</span>
            <Btn kind="danger" small onclick={() => removeExtra(x.id)}>✕</Btn>
          </div>
        {/each}
      </div>
    {/if}
    <div class="text-xs mt-3" style="color:{C.muted}">
      Guest-list gifts: {RM(totalGuest)} · Other gifts: {RM(totalExtra)}
    </div>
  </Card>
</div>
