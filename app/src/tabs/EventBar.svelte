<script>
  // event add/edit strip — port of legacy EventBar
  import { C } from "../stores/theme.svelte.js";
  import { wd, up } from "../stores/wedding.svelte.js";
  import { EVENT_ICONS } from "../lib/constants.js";
  import { uid, eventDateLabel } from "../lib/utils.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";

  let { isCouple } = $props();

  let manage = $state(false);
  let newEv = $state({ name: "", date: "", icon: "📸" });

  const events = $derived(wd.data.events || []);
  const patchEv = (id, p) => up({ events: events.map((e) => (e.id === id ? { ...e, ...p } : e)) });

  function addEv() {
    if (!newEv.name.trim()) return;
    up({ events: [...events, { id: "ev-" + uid(), name: newEv.name.trim(), date: newEv.date, icon: newEv.icon }] });
    newEv = { name: "", date: "", icon: "🎉" };
  }

  function removeEv(id) {
    if (events.length <= 1) return;
    up({
      events: events.filter((e) => e.id !== id),
      // untag the deleted event everywhere
      guests: wd.data.guests.map((g) => (g.events ? { ...g, events: g.events.filter((x) => x !== id) } : g)),
      budget: wd.data.budget.map((b) => (b.eventId === id ? { ...b, eventId: "" } : b)),
      caterers: wd.data.caterers.map((c) => (c.eventId === id ? { ...c, eventId: "" } : c)),
    });
  }
</script>

<div class="mt-4">
  <div class="flex gap-2 flex-wrap items-center">
    {#each events as e (e.id)}
      <span class="text-xs font-semibold" style="background:{C.card};border:1px solid {C.line};border-radius:999px;padding:6px 12px">
        {e.icon || "🎉"} {e.name}
        <span style="color:{C.muted};font-weight:500"> · {eventDateLabel(e.date)}</span>
      </span>
    {/each}
    {#if isCouple}
      <Btn kind="ghost" small onclick={() => (manage = !manage)}>{manage ? "Done" : "＋ Manage events"}</Btn>
    {/if}
  </div>

  {#if manage && isCouple}
    <Card className="mt-3">
      <div class="mb-2 wb-serif" style="font-size:18px;font-weight:600">Your events</div>
      <div class="grid gap-2">
        {#each events as e (e.id)}
          <div class="flex flex-wrap items-center gap-2 p-2" style="background:{C.soft};border:1px solid {C.line};border-radius:8px">
            <select class="wb-input" style="width:64px;padding:4px 6px" value={e.icon || "🎉"} onchange={(ev) => patchEv(e.id, { icon: ev.target.value })}>
              {#each EVENT_ICONS as i (i)}
                <option>{i}</option>
              {/each}
            </select>
            <input class="wb-input" style="width:220px;padding:4px 8px" value={e.name} oninput={(ev) => patchEv(e.id, { name: ev.target.value })} />
            <input class="wb-input" style="width:150px;padding:4px 8px" type="date" value={e.date || ""} onchange={(ev) => patchEv(e.id, { date: ev.target.value })} />
            {#if events.length > 1}
              <Btn kind="danger" small onclick={() => removeEv(e.id)}>✕</Btn>
            {/if}
          </div>
        {/each}
        <div class="flex flex-wrap items-center gap-2 p-2" style="border:1px dashed {C.line};border-radius:8px">
          <select class="wb-input" style="width:64px;padding:4px 6px" bind:value={newEv.icon}>
            {#each EVENT_ICONS as i (i)}
              <option>{i}</option>
            {/each}
          </select>
          <input
            class="wb-input"
            style="width:220px;padding:4px 8px"
            placeholder="e.g. Pre-wedding photoshoot"
            bind:value={newEv.name}
            onkeydown={(e) => e.key === "Enter" && addEv()}
          />
          <input class="wb-input" style="width:150px;padding:4px 8px" type="date" bind:value={newEv.date} />
          <Btn small onclick={addEv}>Add event</Btn>
        </div>
      </div>
      <p class="text-xs mt-2" style="color:{C.muted}">
        Guests are invited to all events unless you untag them on their card. Budget vendors and catering quotes can be
        tagged to a specific event. Deleting an event removes its tags but keeps the guests and vendors.
      </p>
    </Card>
  {/if}
</div>
