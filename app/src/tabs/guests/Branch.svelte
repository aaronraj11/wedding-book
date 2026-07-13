<script>
  import Branch from "./Branch.svelte";
  import GuestLeaf from "./GuestLeaf.svelte";
  import { C } from "../../stores/theme.svelte.js";
  import { branchStats, collectGuests } from "../../lib/stats.js";

  let { name, node, path, collapsed, toggle } = $props();

  const st = $derived(branchStats(collectGuests(node)));
  const isCollapsed = $derived(!!collapsed[path]);
  const subBranches = $derived(Object.entries(node.children).sort((a, b) => a[0].localeCompare(b[0])));
</script>

<div class="mt-2">
  <div class="flex items-center">
    <span style="width:14px;border-top:2px solid {C.line};flex-shrink:0"></span>
    <button
      onclick={() => toggle(path)}
      class="flex items-center gap-2 flex-1 text-left p-2"
      style="background:{C.soft};border:1px solid {C.line};border-radius:8px;cursor:pointer"
    >
      <span class="text-xs" style="color:{C.muted}">{isCollapsed ? "▸" : "▾"}</span>
      <span class="text-sm font-semibold" style="color:{C.ink}">{name}</span>
      <span class="text-xs ml-auto" style="color:{C.muted}">
        {st.invites} invites · {st.pax} pax{st.babies > 0 ? ` · ${st.babies} 👶` : ""}
      </span>
    </button>
  </div>
  {#if !isCollapsed}
    <div style="margin-left:28px;border-left:2px dashed {C.line}">
      {#each subBranches as [n, child] (n)}
        <Branch name={n} node={child} path={`${path}/${n}`} {collapsed} {toggle} />
      {/each}
      {#each node.guests as g (g.id)}
        <GuestLeaf {g} />
      {/each}
    </div>
  {/if}
</div>
