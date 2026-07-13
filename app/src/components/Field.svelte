<script>
  import { C } from "../stores/theme.svelte.js";

  let { label, children, className = "" } = $props();
</script>

<label class="flex flex-col gap-1 {className}">
  <span class="text-xs uppercase tracking-wider" style="color:{C.muted}">{label}</span>
  {@render children?.()}
</label>
