<script>
  import { C } from "../../stores/theme.svelte.js";
  import { branchStats, buildGroupTree } from "../../lib/stats.js";
  import Card from "../../components/Card.svelte";
  import Branch from "./Branch.svelte";

  let { pool, side, coupleName } = $props();

  let collapsed = $state({});
  const toggle = (key) => (collapsed[key] = !collapsed[key]);

  const sides = $derived(side ? [side] : ["bride", "groom"]);
  const total = $derived(branchStats(pool));
</script>

<Card>
  <div class="wb-serif" style="font-size:20px;font-weight:600">Family tree</div>
  <p class="text-xs mt-1 mb-3" style="color:{C.muted}">
    Grouped by side, then by group/relation. Use / in a guest's group to nest sub-families — e.g.
    <b>Joan's Family / Father's side / Uncle's family</b> shows each level as its own branch. Change a guest's group
    with ✏️ Edit in list view. ● green = attending, ● amber = pending, ● red = declined.
  </p>

  <!-- root -->
  <div class="text-center mb-4">
    <span class="wb-serif" style="font-size:18px;font-weight:700;background:{C.goldSoft};color:{C.gold};border-radius:999px;padding:6px 18px;border:1px solid {C.gold}">
      💍 {coupleName || "The Couple"}
    </span>
    <div class="text-sm mt-3" style="color:{C.muted}">
      Combined total: <b style="color:{C.green}">{total.pax} pax</b> · {total.invites} invites{total.babies > 0
        ? ` · ${total.babies} 👶`
        : ""} · {total.attending} attending
    </div>
  </div>

  <div class={sides.length === 2 ? "grid md:grid-cols-2 gap-4" : "grid gap-4"}>
    {#each sides as s (s)}
      {@const sideGuests = pool.filter((g) => g.side === s)}
      {@const tree = buildGroupTree(sideGuests)}
      {@const st = branchStats(sideGuests)}
      {@const tone = s === "bride" ? C.gold : C.green}
      {@const toneSoft = s === "bride" ? C.goldSoft : C.greenSoft}
      <div>
        <!-- side node -->
        <div class="flex items-center gap-2 p-2" style="background:{toneSoft};border:1px solid {tone};border-radius:10px">
          <span class="font-semibold" style="color:{tone}">{s === "bride" ? "🌸 Bride's side" : "🤵 Groom's side"}</span>
          <span class="text-xs ml-auto" style="color:{C.muted}">
            {st.invites} invites · {st.pax} pax{st.babies > 0 ? ` · ${st.babies} 👶` : ""} · {st.attending} attending
          </span>
        </div>

        <!-- branches -->
        <div style="margin-left:14px;border-left:2px solid {C.line};padding-left:0">
          {#each Object.entries(tree.children).sort((a, b) => a[0].localeCompare(b[0])) as [name, node] (name)}
            <Branch {name} {node} path={`${s}:${name}`} {collapsed} {toggle} />
          {/each}
          {#if sideGuests.length === 0}
            <div class="text-xs p-2" style="color:{C.muted}">No guests on this side yet.</div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</Card>
