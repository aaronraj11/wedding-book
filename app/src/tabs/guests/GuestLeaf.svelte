<script>
  import { C } from "../../stores/theme.svelte.js";
  import { num } from "../../lib/utils.js";
  import { membersOf } from "../../lib/guests.js";
  import { rsvpDotInfo } from "../../lib/stats.js";

  let { g } = $props();

  const dot = $derived(rsvpDotInfo(g.rsvp));
  const members = $derived(membersOf(g));
</script>

<div class="flex items-center" style="padding-top:6px">
  <span style="width:12px;border-top:2px dashed {C.line};flex-shrink:0"></span>
  <div class="flex items-center gap-2 flex-1 flex-wrap" style="padding:4px 8px;border-radius:8px">
    <span title={dot.label} style="width:8px;height:8px;border-radius:999px;background:{C[dot.colorKey]};display:inline-block;flex-shrink:0"></span>
    <span class="text-sm">{g.name}</span>
    <span class="text-xs" style="color:{C.muted}">
      {g.invitedPax} pax{num(g.invitedBabies) > 0 ? ` · ${num(g.invitedBabies)} 👶` : ""}
    </span>
    {#if g.dietary}
      <span class="text-xs" style="color:{C.gold}" title={g.dietary}>🍽 {g.dietary}</span>
    {/if}
    {#if members.length > 0}
      <div class="w-full text-xs" style="padding-left:16px">
        <!-- keyed by index: real data can contain duplicate member names -->
        {#each members as m, i (i)}
          {@const known = g.rsvp === "yes" && Array.isArray(g.confirmedMembers)}
          {@const coming = known ? g.confirmedMembers.includes(m.name) : null}
          <span style="color:{coming === true ? C.green : C.muted};text-decoration:{coming === false ? 'line-through' : 'none'}">
            {i > 0 ? ", " : "└ "}{m.name}{m.type === "baby" ? " 👶" : ""}{m.diet === "veg" ? " 🥗" : ""}{coming === true ? " ✓" : ""}
          </span>
        {/each}
      </div>
    {/if}
  </div>
</div>
