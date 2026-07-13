<script>
  import { C } from "../stores/theme.svelte.js";
  import Card from "./Card.svelte";

  let { label, value, sub, tone } = $props();
</script>

<Card style="padding:16px">
  <div class="text-xs uppercase tracking-wider mb-1" style="color:{C.muted}">{label}</div>
  <div class="text-2xl wb-serif" style="color:{tone || C.ink};font-weight:600">{value}</div>
  {#if sub}
    <div class="text-xs mt-1" style="color:{C.muted}">{sub}</div>
  {/if}
</Card>
