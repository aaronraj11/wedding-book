<script>
  // day-of: live arrivals dashboard — port of legacy DayOf
  import { C } from "../stores/theme.svelte.js";
  import { wd, up } from "../stores/wedding.svelte.js";
  import { num, RM, cap } from "../lib/utils.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Pill from "../components/Pill.svelte";
  import Stat from "../components/Stat.svelte";

  let { side } = $props();

  const pool = $derived(side ? wd.data.guests.filter((g) => g.side === side) : wd.data.guests);
  const patch = (id, p) => up({ guests: wd.data.guests.map((g) => (g.id === id ? { ...g, ...p } : g)) });

  const arrived = $derived(pool.filter((g) => g.checkedInAt).slice().sort((a, b) => (b.checkedInAt || 0) - (a.checkedInAt || 0)));
  const awaited = $derived(pool.filter((g) => g.rsvp === "yes" && !g.checkedInAt));
  const arrivedPax = $derived(arrived.reduce((s, g) => s + num(g.checkedInPax), 0));
  const arrivedBabies = $derived(arrived.reduce((s, g) => s + Math.min(num(g.checkedInBabies), num(g.checkedInPax)), 0));
  const expectedPax = $derived(pool.filter((g) => g.rsvp === "yes").reduce((s, g) => s + num(g.confirmedPax || g.invitedPax || 1), 0));
  const pledgeCash = $derived(pool.reduce((s, g) => s + (g.pledgeMethod !== "qr" ? num(g.pledgeAmount) : 0), 0));
  const pledgeQr = $derived(pool.reduce((s, g) => s + (g.pledgeMethod === "qr" ? num(g.pledgeAmount) : 0), 0));

  const timeOf = (ts) => new Date(ts).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
</script>

<div class="grid gap-4">
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
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
    <div class="wb-serif" style="font-size:20px;font-weight:600">
      🎟️ Arrivals
      {#if side}
        <Pill tone={side === "bride" ? "gold" : "green"}>{cap(side)}'s side</Pill>
      {/if}
    </div>
    <p class="text-xs mt-1 mb-3" style="color:{C.muted}">
      Updates live as guests check in at the door. Red pax counts don't match the RSVP — worth a quick look.
    </p>
    {#if arrived.length === 0}
      <span class="text-sm" style="color:{C.muted}">
        No one has checked in yet. Guests check in from the app's front screen — or set up a tablet at the entrance.
      </span>
    {:else}
      <div class="grid gap-2">
        {#each arrived as g (g.id)}
          {@const expected = num(g.confirmedPax || g.invitedPax || 1)}
          {@const match = num(g.checkedInPax) === expected}
          <div class="flex flex-wrap items-center gap-2 p-2" style="background:{C.soft};border:1px solid {C.line};border-radius:8px">
            <span class="text-xs" style="color:{C.muted}">{timeOf(g.checkedInAt)}</span>
            <span class="text-sm font-medium">{g.name}</span>
            {#if !side}<Pill tone={g.side === "bride" ? "gold" : "green"}>{cap(g.side)}</Pill>{/if}
            <Pill tone={match ? "green" : "red"}>
              {num(g.checkedInPax)} pax{num(g.checkedInBabies) > 0 ? ` · ${num(g.checkedInBabies)} 👶` : ""}{!match ? ` (expected ${expected})` : ""}
            </Pill>
            {#if num(g.pledgeAmount) > 0}
              <Pill tone="gold">💝 {RM(g.pledgeAmount)} · {g.pledgeMethod === "qr" ? "QR" : "cash"}</Pill>
            {/if}
            {#if Array.isArray(g.checkedInMembers) && g.checkedInMembers.length > 0}
              <span class="text-xs" style="color:{C.muted}">{g.checkedInMembers.join(", ")}</span>
            {/if}
            <div class="ml-auto">
              <Btn kind="danger" small onclick={() => patch(g.id, { checkedInAt: null, checkedInPax: null, checkedInBabies: null, checkedInMembers: null })}>
                Undo check-in
              </Btn>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <Card>
    <div class="mb-2 wb-serif" style="font-size:18px;font-weight:600">Confirmed but not arrived ({awaited.length})</div>
    {#if awaited.length === 0}
      <span class="text-sm" style="color:{C.muted}">Everyone who confirmed is here 🎉</span>
    {:else}
      <div class="flex flex-wrap gap-2">
        {#each awaited as g (g.id)}
          <Pill>{g.name} · {num(g.confirmedPax || g.invitedPax || 1)} pax</Pill>
        {/each}
      </div>
    {/if}
  </Card>
</div>
