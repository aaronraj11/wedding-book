<script>
  // tiny svg donut chart — port of legacy Donut
  import { C } from "../stores/theme.svelte.js";

  let { slices, size = 150, stroke = 26, centerLabel, centerSub } = $props();

  const total = $derived(slices.reduce((s, x) => s + x.value, 0));
  const r = $derived((size - stroke) / 2);
  const cx = $derived(size / 2);
  const circ = $derived(2 * Math.PI * r);

  // precompute each slice's dash geometry (legacy used a running accumulator in render)
  const parts = $derived.by(() => {
    let acc = 0;
    return slices.map((s) => {
      const dash = total > 0 ? (s.value / total) * circ : 0;
      const off = -acc * circ;
      if (total > 0) acc += s.value / total;
      return { ...s, dash, off };
    });
  });
</script>

<svg width={size} height={size} style="flex-shrink:0">
  <circle cx={cx} cy={cx} r={r} fill="none" stroke={C.neutral} stroke-width={stroke} />
  <g transform="rotate(-90 {cx} {cx})">
    {#if total > 0}
      {#each parts as s, i (i)}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={s.color}
          stroke-width={stroke}
          stroke-dasharray="{s.dash} {circ - s.dash}"
          stroke-dashoffset={s.off}
        />
      {/each}
    {/if}
  </g>
  <text x={cx} y={cx - 1} text-anchor="middle" class="wb-serif" style="font-size:22px;font-weight:700;fill:{C.ink}">
    {centerLabel !== undefined ? centerLabel : total}
  </text>
  <text x={cx} y={cx + 16} text-anchor="middle" style="font-size:10px;fill:{C.muted}">
    {centerSub || "pax"}
  </text>
</svg>
