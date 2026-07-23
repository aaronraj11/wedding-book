<script>
  // styled picker: preset + existing options in a normal select, with an
  // "Other" escape hatch for typing a custom value. Reused for guest groups
  // and budget categories, so the labels are configurable.
  let {
    value,
    options,
    onChange,
    placeholder = "Your own tag, e.g. Pastors from FGA (use / to nest)",
    noneLabel = "— no group —",
    allowNone = true,
  } = $props();

  // intentionally captures the INITIAL value only (legacy useState(() => …) semantics);
  // showCustom below re-derives against the live props
  // svelte-ignore state_referenced_locally
  let custom = $state(value !== "" && !options.includes(value));
  const showCustom = $derived(custom || (value !== "" && !options.includes(value)));
</script>

<div class="flex gap-2 items-center flex-wrap" style="width:100%">
  <select
    class="wb-input"
    style="width:{showCustom ? '150px' : '100%'};min-width:130px;flex:{showCustom ? '0 0 auto' : '1'}"
    value={showCustom ? "__other__" : value}
    onchange={(e) => {
      if (e.target.value === "__other__") {
        custom = true;
        onChange("");
      } else {
        custom = false;
        onChange(e.target.value);
      }
    }}
  >
    {#if allowNone}<option value="">{noneLabel}</option>{/if}
    {#each options as o (o)}
      <option value={o}>{o}</option>
    {/each}
    <option value="__other__">✏️ Other — type my own…</option>
  </select>
  {#if showCustom}
    <input
      class="wb-input"
      style="flex:1;min-width:150px"
      {value}
      {placeholder}
      oninput={(e) => onChange(e.target.value)}
    />
  {/if}
</div>
