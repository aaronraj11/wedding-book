<script>
  // overview tab — port of legacy Overview
  import { C } from "../stores/theme.svelte.js";
  import { wd } from "../stores/wedding.svelte.js";
  import { CHART_COLORS } from "../lib/constants.js";
  import { RM, num, cap } from "../lib/utils.js";
  import Stat from "../components/Stat.svelte";
  import Card from "../components/Card.svelte";
  import ChartBlock from "../components/ChartBlock.svelte";
  import Btn from "../components/Btn.svelte";

  let { stats, setTab, side } = $props();

  const rsvpRate = $derived(
    stats.guestCount > 0 ? Math.round(((stats.guestCount - stats.pending) / stats.guestCount) * 100) : 0
  );

  const paxOf = (g) => num(g.invitedPax || 1);
  const bridePax = $derived(wd.data.guests.filter((g) => g.side === "bride").reduce((s, g) => s + paxOf(g), 0));
  const groomPax = $derived(wd.data.guests.filter((g) => g.side === "groom").reduce((s, g) => s + paxOf(g), 0));

  function groupSlices(sideKey) {
    const map = {};
    wd.data.guests
      .filter((g) => g.side === sideKey)
      .forEach((g) => {
        const k = (g.group || "").trim() || "Ungrouped";
        map[k] = (map[k] || 0) + paxOf(g);
      });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 7);
    const rest = entries.slice(7).reduce((s, [, v]) => s + v, 0);
    const slices = top.map(([label, value], i) => ({ label, value, color: CHART_COLORS[i % CHART_COLORS.length] }));
    if (rest > 0) slices.push({ label: "Other", value: rest, color: "#9A8E82" });
    return slices;
  }
</script>

<div class="grid gap-4">
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <Stat
      label={side ? `${cap(side)}'s invites` : "Invited"}
      value={`${stats.guestCount} invites`}
      sub={stats.invitedBabies > 0
        ? `${stats.invitedPax} pax total · ${stats.invitedBabies} 👶`
        : `${stats.invitedPax} pax total`}
    />
    <Stat
      label="Confirmed pax"
      value={stats.confirmedPax}
      sub={stats.confirmedBabies > 0
        ? `${stats.attendingCount} invites · ${stats.confirmedEating} eating, ${stats.confirmedBabies} 👶`
        : `${stats.attendingCount} invites attending`}
      tone={C.green}
    />
    <Stat label="Pending replies" value={stats.pending} sub={`${rsvpRate}% have responded`} tone={stats.pending > 0 ? C.gold : C.green} />
    <Stat label="Declined" value={stats.declined} />
  </div>

  {#if side}
    <div class="grid grid-cols-2 gap-3">
      <Stat label={`${cap(side)}'s gift money`} value={RM(stats.gifts)} tone={C.gold} />
      <Stat label="Your job" value="Guests & gifts" sub="Budget and catering are managed by the couple" />
    </div>
  {:else}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat
        label="Budget planned"
        value={RM(stats.budgetTarget || stats.budgeted)}
        sub={stats.budgetTarget > 0 && stats.budgeted > 0 ? `${RM(stats.budgeted)} allocated` : undefined}
      />
      <Stat
        label="Paid out"
        value={RM(stats.paidOut)}
        tone={stats.actual > (stats.budgetTarget || stats.budgeted) && (stats.budgetTarget || stats.budgeted) > 0 ? C.red : C.ink}
        sub={`of ${RM(stats.actual)} committed${stats.balanceToPay > 0 ? ` · ${RM(stats.balanceToPay)} still to pay` : ""}`}
      />
      <Stat label="Gift money received" value={RM(stats.gifts)} tone={C.gold} />
      <Stat
        label="Net cost after gifts"
        value={RM(stats.net)}
        tone={stats.net > 0 ? C.ink : C.green}
        sub={stats.net <= 0 ? "Gifts cover your spend 🎉" : "Spend minus gifts"}
      />
    </div>
  {/if}

  {#if stats.guestCount > 0}
    <Card>
      <div class="wb-serif" style="font-size:20px;font-weight:600">📊 Guest distribution</div>
      <p class="text-xs mt-1 mb-3" style="color:{C.muted}">
        Counted in invited pax (babies included). The side charts break each guest list down by group / relation — tune
        groups with the 🏷️ Groups panel in Guests & RSVP.
      </p>
      <div class={side ? "grid gap-4" : "grid md:grid-cols-3 gap-4"}>
        {#if !side}
          <ChartBlock
            title="Bride vs Groom"
            slices={[
              { label: "Bride's side", value: bridePax, color: "#BC9459" },
              { label: "Groom's side", value: groomPax, color: "#6B8E7B" },
            ]}
          />
        {/if}
        {#if !side || side === "bride"}
          <ChartBlock title="Bride's side — by group" slices={groupSlices("bride")} />
        {/if}
        {#if !side || side === "groom"}
          <ChartBlock title="Groom's side — by group" slices={groupSlices("groom")} />
        {/if}
      </div>
    </Card>
  {/if}

  {#if stats.guestCount === 0}
    <Card>
      <div class="wb-serif" style="font-size:20px;font-weight:600">Start {side ? `the ${side}'s` : "your"} guest list</div>
      <p class="text-sm mt-1 mb-3" style="color:{C.muted}">
        Everything flows from the guest list — RSVP counts feed the catering numbers, and gifts are recorded against
        each guest.
      </p>
      <Btn onclick={() => setTab("guests")}>Add the first guest</Btn>
    </Card>
  {/if}
</div>
