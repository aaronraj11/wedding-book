<script>
  // guest rsvp by link (?p=rsvp) — port of legacy GuestRSVP
  import { C } from "../stores/theme.svelte.js";
  import { app } from "../stores/session.svelte.js";
  import { storage } from "../lib/storage.js";
  import { DATA_KEY, EMPTY } from "../lib/constants.js";
  import { num } from "../lib/utils.js";
  import { membersOf, babyCount } from "../lib/guests.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Field from "../components/Field.svelte";
  import Ornaments from "../components/Ornaments.svelte";

  let { onBack, locked } = $props();

  let data = $state(null);
  let search = $state("");
  let sel = $state(null);
  let coming = $state(null); // null | "yes" | "no"
  let pax = $state("");
  let babies = $state("");
  let dietary = $state("");
  let selMembers = $state([]);
  let memberDiets = $state({}); // name -> "non" | "veg"
  let vegCount = $state(""); // for invites without named members
  let busy = $state(false);
  let done = $state(false);
  let err = $state("");

  $effect(() => {
    (async () => {
      try {
        const r = await storage.get(DATA_KEY(app.wedding), true);
        data = r && r.value ? JSON.parse(r.value) : { ...EMPTY };
      } catch (e) {
        data = { ...EMPTY };
      }
    })();
  });

  const settings = $derived((data && data.settings) || {});
  const guests = $derived((data && data.guests) || []);
  const q = $derived(search.trim().toLowerCase());
  const matches = $derived(
    q.length >= 2
      ? guests
          .filter((g) => g.name.toLowerCase().includes(q) || membersOf(g).some((m) => m.name.toLowerCase().includes(q)))
          .slice(0, 8)
      : []
  );

  const dateStr = $derived(
    settings.date
      ? new Date(settings.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "(date to be announced)"
  );

  function pick(g) {
    sel = g;
    coming = g.rsvp === "yes" ? "yes" : g.rsvp === "no" ? "no" : null;
    pax = String(num(g.confirmedPax || g.invitedPax) || 1);
    babies = String(g.confirmedBabies === "" || g.confirmedBabies === undefined ? num(g.invitedBabies) : num(g.confirmedBabies));
    dietary = g.dietary || "";
    const names = membersOf(g).map((m) => m.name);
    selMembers = Array.isArray(g.confirmedMembers) ? g.confirmedMembers.filter((m) => names.includes(m)) : [...names];
    memberDiets = Object.fromEntries(membersOf(g).map((m) => [m.name, m.diet || "non"]));
    vegCount = String(num(g.confirmedVeg) || 0);
    err = "";
  }

  function toggleSelMember(m, on) {
    const next = on ? selMembers.filter((x) => x !== m.name) : [...selMembers, m.name];
    selMembers = next;
    pax = String(next.length || 1);
    babies = String(babyCount(membersOf(sel).filter((x) => next.includes(x.name))));
  }

  async function submit() {
    if (!sel || !coming) return;
    busy = true;
    err = "";
    try {
      // re-read the latest shared data so we don't overwrite other people's edits
      const r = await storage.get(DATA_KEY(app.wedding), true);
      const fresh = r && r.value ? JSON.parse(r.value) : { ...EMPTY };
      fresh.guests = (fresh.guests || []).map((g) =>
        g.id === sel.id
          ? coming === "yes"
            ? {
                ...g,
                rsvp: "yes",
                confirmedPax: num(pax) || 1,
                confirmedBabies: String(num(babies)),
                dietary: dietary.trim(),
                rsvpAt: Date.now(),
                ...(membersOf(sel).length > 0
                  ? {
                      confirmedMembers: $state.snapshot(selMembers),
                      members: membersOf(g).map((m) => ({ ...m, diet: memberDiets[m.name] || m.diet || "non" })),
                    }
                  : { confirmedVeg: Math.min(num(vegCount), num(pax) || 1) }),
              }
            : { ...g, rsvp: "no", confirmedPax: "", confirmedBabies: "", rsvpAt: Date.now() }
          : g
      );
      await storage.set(DATA_KEY(app.wedding), JSON.stringify(fresh), true);
      done = true;
    } catch (e) {
      err = "Couldn't save your reply — please try again, or message the couple directly.";
    }
    busy = false;
  }

  function reset() {
    done = false;
    sel = null;
    search = "";
    coming = null;
    pax = "";
    babies = "";
    dietary = "";
    err = "";
  }

  const cardStyle = "border-radius:18px;padding:24px;box-shadow:0 16px 48px rgba(34,48,31,.12)";
  const submitDisabled = $derived(busy || !coming || (coming === "yes" && !num(pax)));
</script>

{#snippet choiceButton(active, tone, toneSoft, label, action)}
  <button
    onclick={action}
    style="flex:1 1 auto;padding:13px 20px;border-radius:14px;font-weight:600;font-size:15px;cursor:pointer;border:1.5px solid {active ? tone : C.line};background:{active ? toneSoft : C.card};color:{active ? tone : C.muted};transition:all .15s"
  >
    {label}
  </button>
{/snippet}

<div class="min-h-screen flex items-center justify-center px-4 py-10" style="background:{C.ivory};color:{C.ink}">
  <Ornaments />
  <div class="w-full max-w-md" style="position:relative;z-index:1">
    <div class="text-center mb-7">
      <div style="color:{C.gold};font-size:20px;letter-spacing:8px">✿&nbsp;❦&nbsp;✿</div>
      <div class="text-xs uppercase mt-3" style="color:{C.muted};letter-spacing:5px">The wedding of</div>
      <div class="wb-serif" style="font-size:40px;font-weight:700;line-height:1.15;color:{C.ink}">
        {settings.couple || "Our Wedding"}
      </div>
      <div class="flex items-center justify-center gap-3 mt-3">
        <span style="width:44px;border-top:1px solid {C.gold};display:inline-block"></span>
        <span class="wb-serif" style="font-style:italic;font-size:16px;color:{C.gold}">{dateStr}</span>
        <span style="width:44px;border-top:1px solid {C.gold};display:inline-block"></span>
      </div>
      {#if settings.venueName}
        <div class="text-sm mt-2" style="color:{C.muted}">📍 {settings.venueName}</div>
      {/if}
      {#if settings.venueMaps || settings.venueWaze}
        <div class="flex gap-2 justify-center mt-2 flex-wrap">
          {#if settings.venueMaps}
            <a
              href={settings.venueMaps}
              target="_blank"
              rel="noreferrer"
              style="padding:5px 14px;border-radius:999px;font-size:12px;font-weight:600;text-decoration:none;border:1px solid {C.line};background:{C.card};color:{C.green}"
            >
              🗺️ Google Maps
            </a>
          {/if}
          {#if settings.venueWaze}
            <a
              href={settings.venueWaze}
              target="_blank"
              rel="noreferrer"
              style="padding:5px 14px;border-radius:999px;font-size:12px;font-weight:600;text-decoration:none;border:1px solid {C.line};background:{C.card};color:{C.green}"
            >
              🚗 Waze
            </a>
          {/if}
        </div>
      {/if}
      <div class="wb-serif" style="font-size:22px;font-weight:600;margin-top:16px;color:{C.ink}">Will you join us?</div>
    </div>

    {#if !data}
      <Card style="{cardStyle};border-top:3px solid {C.gold}">
        <span style="color:{C.muted}">Loading…</span>
      </Card>
    {:else if done}
      <Card style="{cardStyle};border-top:3px solid {C.gold}">
        <div class="text-center">
          <div style="font-size:44px;line-height:1">{coming === "yes" ? "🥂" : "💛"}</div>
          <div class="wb-serif" style="font-size:26px;font-weight:700;margin-top:10px">
            {coming === "yes" ? "Wonderful — see you there!" : "We'll miss you"}
          </div>
          <p class="text-sm mt-2" style="color:{C.muted}">
            {sel.name} · {coming === "yes" ? `${num(pax)} pax confirmed` : "declined with our thanks for letting us know"}
          </p>
          <div class="mt-5">
            <Btn kind="gold" onclick={reset}>✓ Done</Btn>
          </div>
        </div>
      </Card>
    {:else if !sel}
      <Card style="{cardStyle};border-top:3px solid {C.gold}">
        <div class="text-center mb-3 wb-serif" style="font-size:20px;font-weight:600">Find your invitation</div>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="wb-input"
          style="border-radius:999px;padding:13px 20px;text-align:center;font-size:15px"
          bind:value={search}
          placeholder="Type your name…"
          autofocus
        />
        <div class="grid gap-2 mt-3">
          {#each matches as g (g.id)}
            <button
              onclick={() => pick(g)}
              class="text-left p-3"
              style="background:{C.soft};border:1px solid {C.line};border-radius:10px;cursor:pointer;color:{C.ink}"
            >
              <span class="font-semibold">{g.name}</span>
              <span class="text-xs" style="color:{C.muted}"> · invited with {g.invitedPax} pax{g.group ? ` · ${g.group}` : ""}</span>
              {#if !g.name.toLowerCase().includes(q) && membersOf(g).some((m) => m.name.toLowerCase().includes(q))}
                <span class="text-xs" style="color:{C.gold}"> · {membersOf(g).find((m) => m.name.toLowerCase().includes(q)).name} is in this party</span>
              {/if}
              {#if g.rsvp !== "pending"}
                <span class="text-xs" style="color:{g.rsvp === 'yes' ? C.green : C.red}">
                  · replied: {g.rsvp === "yes" ? "attending" : "declined"} (you can change it)
                </span>
              {/if}
            </button>
          {/each}
          {#if q.length >= 2 && matches.length === 0}
            <span class="text-sm" style="color:{C.muted}">No invitation found under that name — please check with the couple.</span>
          {/if}
        </div>
      </Card>
    {:else}
      <Card style="{cardStyle};border-top:3px solid {C.gold}">
        <div class="flex items-center justify-between">
          <div class="wb-serif" style="font-size:24px;font-weight:700">{sel.name}</div>
          <Btn kind="ghost" small onclick={() => (sel = null)}>Not you?</Btn>
        </div>
        <p class="text-xs mt-1" style="color:{C.muted}">You're invited with {sel.invitedPax} pax</p>

        <div class="flex gap-2 mt-4">
          {@render choiceButton(coming === "yes", C.green, C.greenSoft, "🎉 Joyfully attending", () => (coming = "yes"))}
          {@render choiceButton(coming === "no", C.red, C.redSoft, "Regretfully can't", () => (coming = "no"))}
        </div>

        {#if coming === "yes"}
          <div class="mt-4 grid gap-3">
            {#if membersOf(sel).length > 0}
              <div>
                <div class="mb-2" style="color:{C.gold};letter-spacing:2px;font-size:11px;font-weight:700;text-transform:uppercase">
                  Who's coming? — tap names to toggle
                </div>
                <div class="flex flex-wrap gap-2">
                  <!-- keyed by index: real data can contain duplicate member names -->
                  {#each membersOf(sel) as m, i (i)}
                    {@const on = selMembers.includes(m.name)}
                    <button
                      onclick={() => toggleSelMember(m, on)}
                      style="padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid {on ? C.green : C.line};background:{on ? C.greenSoft : C.card};color:{on ? C.green : C.muted};text-decoration:{on ? 'none' : 'line-through'}"
                    >
                      {on ? "✓ " : ""}{m.name}{m.type === "baby" ? " 👶" : ""}
                    </button>
                  {/each}
                </div>
                <p class="text-xs mt-2" style="color:{C.muted}">
                  Coming: <b style="color:{C.green}">{selMembers.length} pax</b>{num(babies) > 0 ? ` · ${num(babies)} 👶 (babies aren't counted for food)` : ""}
                </p>
                {#if membersOf(sel).filter((m) => selMembers.includes(m.name) && m.type !== "baby").length > 0}
                  <div class="mt-4">
                    <div class="mb-2" style="color:{C.gold};letter-spacing:2px;font-size:11px;font-weight:700;text-transform:uppercase">
                      Meal preference
                    </div>
                    <div class="grid gap-2 p-3" style="background:{C.soft};border:1px solid {C.line};border-radius:12px">
                      {#each membersOf(sel).filter((m) => selMembers.includes(m.name) && m.type !== "baby") as m, i (i)}
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm" style="min-width:120px">{m.name}</span>
                          {#each [["non", "Non-vegetarian"], ["veg", "Vegetarian 🥗"]] as [k, label] (k)}
                            {@const on = (memberDiets[m.name] || "non") === k}
                            <button
                              onclick={() => (memberDiets = { ...memberDiets, [m.name]: k })}
                              style="padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid {on ? C.green : C.line};background:{on ? C.greenSoft : C.card};color:{on ? C.green : C.muted}"
                            >
                              {label}
                            </button>
                          {/each}
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="flex gap-3 flex-wrap items-end">
                <Field label="How many of you are coming? (everyone, incl. babies)">
                  <input class="wb-input" style="width:130px" type="number" min="1" max={num(sel.invitedPax) || undefined} bind:value={pax} />
                </Field>
                <Field label="…of which babies 👶">
                  <input class="wb-input" style="width:110px" type="number" min="0" bind:value={babies} />
                </Field>
                <Field label="…vegetarian meals 🥗">
                  <input class="wb-input" style="width:110px" type="number" min="0" bind:value={vegCount} />
                </Field>
              </div>
              <p class="text-xs" style="color:{C.muted};margin-top:-4px">
                Count everyone in the total — e.g. 3 adults + 1 baby = 4, of which 1 baby. Babies are noted so no seat's
                worth of food is prepared for them.
              </p>
            {/if}
            <div>
              <div class="mb-2" style="color:{C.gold};letter-spacing:2px;font-size:11px;font-weight:700;text-transform:uppercase">
                Notes (optional)
              </div>
              <input
                class="wb-input"
                style="border-radius:12px;padding:11px 14px"
                bind:value={dietary}
                placeholder="Halal, allergies, baby chair, anything we should know…"
              />
            </div>
          </div>
        {/if}

        {#if err}
          <div class="text-xs mt-3" style="color:{C.red}">{err}</div>
        {/if}
        <div class="mt-5">
          <button
            onclick={submit}
            disabled={submitDisabled}
            style="width:100%;padding:14px 16px;border-radius:999px;font-size:16px;font-weight:700;border:1px solid transparent;cursor:{submitDisabled ? 'not-allowed' : 'pointer'};opacity:{submitDisabled ? 0.5 : 1};background:{C.gold};color:{C.onGold};transition:opacity .15s"
          >
            {busy ? "Sending…" : "Send reply 💌"}
          </button>
        </div>
      </Card>
    {/if}

    {#if !locked}
      <p class="text-xs text-center mt-4">
        <button onclick={onBack} style="background:none;border:none;color:{C.muted};cursor:pointer;text-decoration:underline">
          Planner sign-in
        </button>
      </p>
    {/if}
  </div>
</div>
