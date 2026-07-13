<script>
  import { C } from "../stores/theme.svelte.js";

  let { children, onclick, kind = "primary", small = false, type = "button", disabled = false } = $props();

  const kinds = $derived({
    primary: `background:${C.green};color:${C.onGreen};`,
    gold: `background:${C.gold};color:${C.onGold};`,
    ghost: `background:transparent;color:${C.green};border:1px solid ${C.line};`,
    danger: `background:transparent;color:${C.red};border:1px solid ${C.line};`,
  });
</script>

<button
  {type}
  {onclick}
  {disabled}
  style="border-radius:8px;padding:{small ? '5px 10px' : '9px 16px'};font-size:{small ? 12 : 14}px;font-weight:600;cursor:{disabled ? 'not-allowed' : 'pointer'};opacity:{disabled ? 0.5 : 1};border:1px solid transparent;transition:opacity .15s;{kinds[kind]}"
>
  {@render children?.()}
</button>
