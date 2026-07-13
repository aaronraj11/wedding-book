<script>
  // main authenticated shell — port of legacy Planner (header + events + tabs)
  import { C, theme, toggleTheme } from "../stores/theme.svelte.js";
  import { wd, startWedding, stopWedding, up } from "../stores/wedding.svelte.js";
  import { ROLES } from "../lib/constants.js";
  import { cap } from "../lib/utils.js";
  import { computeStats } from "../lib/stats.js";
  import Btn from "../components/Btn.svelte";
  import Pill from "../components/Pill.svelte";
  import Card from "../components/Card.svelte";
  import EventBar from "../tabs/EventBar.svelte";
  import Overview from "../tabs/Overview.svelte";
  import Guests from "../tabs/guests/Guests.svelte";
  import Catering from "../tabs/Catering.svelte";
  import Budget from "../tabs/Budget.svelte";
  import Todos from "../tabs/Todos.svelte";
  import Gifts from "../tabs/Gifts.svelte";
  import DayOf from "../tabs/DayOf.svelte";
  import DataPanel from "../tabs/DataPanel.svelte";
  import PasscodeManager from "../tabs/PasscodeManager.svelte";

  let { role, onLogout, wedding } = $props();

  const roleInfo = $derived(ROLES[role]);
  const side = $derived(roleInfo.side); // null for couple, 'bride'/'groom' for accountants
  const isCouple = $derived(!side);

  let tab = $state("overview");
  let showCodes = $state(false);

  $effect(() => {
    startWedding(wedding);
    return () => stopWedding();
  });

  const stats = $derived(wd.loaded ? computeStats(wd.data, side) : null);

  const daysLeft = $derived.by(() => {
    if (!wd.loaded || !wd.data.settings.date) return null;
    return Math.ceil((new Date(wd.data.settings.date) - new Date()) / 86400000);
  });

  const tabLabels = $derived({
    overview: "Overview",
    guests: side ? `${cap(side)}'s Guests & RSVP` : "Guests & RSVP",
    catering: "Catering",
    budget: "Budget",
    todo: "✅ To-dos",
    gifts: side ? `${cap(side)}'s Gift Money` : "Gift Money",
    dayof: "🎟️ Day-of",
    data: "💾 Data",
  });
  const tabs = $derived(roleInfo.tabs);
</script>

{#if !wd.loaded}
  <div class="min-h-screen flex items-center justify-center" style="background:{C.ivory};color:{C.muted}">
    Loading your wedding book…
  </div>
{:else}
  <div class="min-h-screen pb-16" style="background:{C.ivory};color:{C.ink}">
    <div class="max-w-5xl mx-auto px-4 pt-8">
      <!-- header — invitation card -->
      <div class="text-center px-6 py-7 relative" style="background:{C.card};border:1px solid {C.line};border-radius:16px">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div class="flex items-center gap-2 flex-wrap">
            <Pill tone={side === "bride" ? "gold" : side === "groom" ? "green" : "neutral"}>
              {roleInfo.icon} {roleInfo.label}
            </Pill>
            <Pill tone="gold">🔑 {wedding}</Pill>
          </div>
          <div class="flex gap-2">
            <Btn kind="ghost" small onclick={toggleTheme}>{theme.mode === "dark" ? "☀️" : "🌙"}</Btn>
            {#if isCouple}
              <Btn kind="ghost" small onclick={() => (showCodes = !showCodes)}>Passcodes</Btn>
            {/if}
            <Btn kind="ghost" small onclick={onLogout}>Log out</Btn>
          </div>
        </div>
        <div class="text-xs uppercase tracking-widest mb-2" style="color:{C.gold}">❦ &nbsp;The Wedding of&nbsp; ❦</div>
        <input
          value={wd.data.settings.couple}
          oninput={(e) => up({ settings: { ...wd.data.settings, couple: e.target.value } })}
          placeholder="Your names here"
          disabled={!isCouple}
          class="text-center w-full wb-serif"
          style="font-size:32px;font-weight:600;border:none;background:transparent;color:{C.ink};outline:none"
        />
        <div class="flex items-center justify-center gap-3 mt-2 flex-wrap">
          {#if isCouple}
            <input
              type="date"
              value={wd.data.settings.date}
              onchange={(e) => up({ settings: { ...wd.data.settings, date: e.target.value } })}
              class="wb-input"
              style="width:auto;font-size:13px"
            />
          {:else if wd.data.settings.date}
            <span class="text-sm" style="color:{C.muted}">
              {new Date(wd.data.settings.date).toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          {/if}
          {#if daysLeft !== null}
            <Pill tone={daysLeft >= 0 ? "gold" : "neutral"}>
              {daysLeft > 0 ? `${daysLeft} days to go` : daysLeft === 0 ? "It's today! 🎉" : "Married!"}
            </Pill>
          {/if}
          <span class="text-xs" style="color:{wd.saveState === 'error' ? C.red : C.muted}">
            {wd.saveState === "saving"
              ? "Saving…"
              : wd.saveState === "error"
                ? "Couldn't save — will retry on next change"
                : "Saved · shared with your team"}
          </span>
        </div>
      </div>

      {#if showCodes && isCouple}
        <PasscodeManager onClose={() => (showCodes = false)} />
      {/if}

      <EventBar {isCouple} />

      <!-- tabs -->
      <div class="flex gap-2 mt-5 flex-wrap">
        {#each tabs as k (k)}
          <button
            onclick={() => (tab = k)}
            style="padding:8px 16px;border-radius:10px;font-size:14px;font-weight:600;border:1px solid {tab === k ? C.green : C.line};background:{tab === k ? C.green : C.card};color:{tab === k ? C.onGreen : C.ink};cursor:pointer"
          >
            {tabLabels[k]}
          </button>
        {/each}
      </div>

      <div class="mt-5">
        {#if tab === "overview"}
          <Overview {stats} setTab={(k) => (tab = k)} {side} />
        {:else if tab === "guests"}
          <Guests {side} />
        {:else if tab === "catering" && isCouple}
          <Catering />
        {:else if tab === "budget" && isCouple}
          <Budget {stats} />
        {:else if tab === "todo" && isCouple}
          <Todos />
        {:else if tab === "gifts"}
          <Gifts {side} />
        {:else if tab === "dayof"}
          <DayOf {side} />
        {:else if tab === "data" && isCouple}
          <DataPanel />
        {/if}
      </div>
    </div>
  </div>
{/if}
