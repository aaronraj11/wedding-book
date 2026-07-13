<script>
  import { C } from "../stores/theme.svelte.js";
  import Donut from "./Donut.svelte";

  let { title, slices } = $props();

  const total = $derived(slices.reduce((s, x) => s + x.value, 0));
  const visible = $derived(slices.filter((s) => s.value > 0));
</script>

<div class="p-3" style="background:{C.soft};border:1px solid {C.line};border-radius:12px">
  <div class="text-xs uppercase tracking-wider mb-2 text-center" style="color:{C.muted}">{title}</div>
  {#if total === 0}
    <div class="text-xs text-center py-6" style="color:{C.muted}">No guests here yet.</div>
  {:else}
    <div class="flex justify-center">
      <Donut slices={visible} />
    </div>
    <div class="grid gap-1 mt-3">
      {#each visible as s (s.label)}
        <div class="flex items-center gap-2 text-xs">
          <span style="width:10px;height:10px;border-radius:3px;background:{s.color};display:inline-block;flex-shrink:0"></span>
          <span style="color:{C.ink}">{s.label}</span>
          <span class="ml-auto" style="color:{C.muted};white-space:nowrap">{s.value} · {Math.round((s.value / total) * 100)}%</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
