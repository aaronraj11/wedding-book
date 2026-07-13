<script>
  // soft abstract backdrop for the guest-facing pages: blurred pastel washes,
  // faint interlocked rings, and a floral motif — all behind the content
  import { C } from "../stores/theme.svelte.js";

  const blobBase = "position:fixed;border-radius:50%;filter:blur(70px);pointer-events:none;z-index:0;";
</script>

<div style="{blobBase}width:360px;height:360px;top:-100px;left:-120px;background:{C.goldSoft};opacity:.8"></div>
<div style="{blobBase}width:320px;height:320px;bottom:-80px;right:-100px;background:{C.greenSoft};opacity:.8"></div>
<div style="{blobBase}width:240px;height:240px;top:38%;right:-130px;background:{C.redSoft};opacity:.7"></div>
<div style="{blobBase}width:200px;height:200px;bottom:30%;left:-120px;background:{C.goldSoft};opacity:.55"></div>

<svg width="230" height="150" viewBox="0 0 230 150" style="position:fixed;top:20px;right:26px;opacity:.16;pointer-events:none;z-index:0">
  <circle cx="90" cy="75" r="54" fill="none" stroke={C.gold} stroke-width="2.5" />
  <circle cx="140" cy="75" r="54" fill="none" stroke={C.gold} stroke-width="2.5" />
  <path d="M140 21 l7 -10 M140 21 l-7 -10 M140 21 l0 -13" stroke={C.gold} stroke-width="2" fill="none" />
</svg>

<svg width="170" height="170" viewBox="0 0 100 100" style="position:fixed;bottom:18px;left:20px;opacity:.14;pointer-events:none;z-index:0">
  {#each [0, 72, 144, 216, 288] as a (a)}
    <ellipse cx="50" cy="30" rx="11" ry="20" fill="none" stroke={C.gold} stroke-width="2" transform="rotate({a} 50 50)" />
  {/each}
  <circle cx="50" cy="50" r="6" fill="none" stroke={C.gold} stroke-width="2" />
</svg>
