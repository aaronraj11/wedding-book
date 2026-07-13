<script>
  // one row per family member: name box + adult/baby selector, with add/remove
  import Btn from "./Btn.svelte";

  let { members, onChange } = $props();

  const set = (i, p) => onChange(members.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const removeRow = (i) => onChange(members.filter((_, j) => j !== i));
</script>

<div class="grid gap-2">
  {#each members as m, i (i)}
    <div class="flex gap-2 items-center flex-wrap">
      <input
        class="wb-input"
        style="width:220px"
        value={m.name}
        placeholder={`Member ${i + 1} — name`}
        oninput={(e) => set(i, { name: e.target.value })}
      />
      <select class="wb-input" style="width:110px" value={m.type || "adult"} onchange={(e) => set(i, { type: e.target.value })}>
        <option value="adult">Adult</option>
        <option value="baby">Baby 👶</option>
      </select>
      {#if (m.type || "adult") !== "baby"}
        <select class="wb-input" style="width:140px" value={m.diet || "non"} onchange={(e) => set(i, { diet: e.target.value })}>
          <option value="non">Non-vegetarian</option>
          <option value="veg">Vegetarian 🥗</option>
        </select>
      {/if}
      <Btn kind="danger" small onclick={() => removeRow(i)}>✕</Btn>
    </div>
  {/each}
  <div>
    <Btn kind="ghost" small onclick={() => onChange([...members, { name: "", type: "adult" }])}>＋ Add member</Btn>
  </div>
</div>
