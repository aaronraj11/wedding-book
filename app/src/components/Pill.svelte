<script>
  import { C } from "../stores/theme.svelte.js";

  let { children, tone = "neutral" } = $props();

  const tones = $derived({
    neutral: `background:${C.neutral};color:${C.muted};`,
    green: `background:${C.greenSoft};color:${C.green};`,
    gold: `background:${C.goldSoft};color:${C.gold};`,
    red: `background:${C.redSoft};color:${C.red};`,
  });
</script>

<span class="text-xs font-semibold" style="{tones[tone]}border-radius:999px;padding:3px 10px;white-space:nowrap;">
  {@render children?.()}
</span>
