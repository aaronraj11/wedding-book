<script>
  import { C } from "../stores/theme.svelte.js";

  let { children, className = "", style = "" } = $props();
</script>

<div class={className} style="background:{C.card};border:1px solid {C.line};border-radius:14px;padding:18px;{style}">
  {@render children?.()}
</div>
