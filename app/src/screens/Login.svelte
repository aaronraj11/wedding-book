<script>
  // role passcode login — port of legacy Login
  import { C, theme, toggleTheme } from "../stores/theme.svelte.js";
  import { storage } from "../lib/storage.js";
  import { ACCT_KEY, ROLES } from "../lib/constants.js";
  import { scramble } from "../lib/utils.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Pill from "../components/Pill.svelte";

  let { onLogin, onSwitch, wedding } = $props();

  let accounts = $state(null); // {role: scrambledCode}
  let picked = $state(null);
  let code = $state("");
  let code2 = $state("");
  let err = $state("");
  let busy = $state(false);

  $effect(() => {
    (async () => {
      try {
        const r = await storage.get(ACCT_KEY(wedding), true);
        accounts = r && r.value ? JSON.parse(r.value) : {};
      } catch (e) {
        accounts = {};
      }
    })();
  });

  const isNew = $derived(picked && accounts && !accounts[picked]);

  async function submit() {
    err = "";
    if (!code.trim()) return (err = "Enter a passcode.");
    if (isNew) {
      if (code.length < 4) return (err = "Use at least 4 characters.");
      if (code !== code2) return (err = "Passcodes don't match.");
      busy = true;
      const next = { ...accounts, [picked]: scramble(code) };
      try {
        await storage.set(ACCT_KEY(wedding), JSON.stringify(next), true);
        accounts = next;
        onLogin(picked);
      } catch (e) {
        err = "Couldn't save the passcode. Try again.";
      }
      busy = false;
    } else {
      if (scramble(code) === accounts[picked]) onLogin(picked);
      else err = "Wrong passcode for this role.";
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center px-4 py-10" style="background:{C.ivory};color:{C.ink}">
  <div class="w-full max-w-md">
    <div class="flex justify-end mb-2">
      <Btn kind="ghost" small onclick={toggleTheme}>{theme.mode === "dark" ? "☀️ Light" : "🌙 Dark"}</Btn>
    </div>
    <div class="text-center mb-6">
      <div class="text-xs uppercase tracking-widest mb-1" style="color:{C.gold}">❦ &nbsp;Wedding Book&nbsp; ❦</div>
      <div class="wb-serif" style="font-size:32px;font-weight:600">Who's signing in?</div>
      <p class="text-sm mt-1" style="color:{C.muted}">
        The couple sees everything. Accountants manage their side's guest list and gift money.
      </p>
      <div class="flex items-center justify-center gap-2 mt-3 flex-wrap">
        <Pill tone="gold">🔑 {wedding}</Pill>
        <Btn kind="ghost" small onclick={onSwitch}>Switch wedding</Btn>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 mb-4">
      {#each Object.entries(ROLES) as [k, r] (k)}
        <button
          onclick={() => {
            picked = k;
            code = "";
            code2 = "";
            err = "";
          }}
          style="background:{picked === k ? C.greenSoft : C.card};border:1px solid {picked === k ? C.green : C.line};border-radius:12px;padding:16px 10px;cursor:pointer;text-align:center"
        >
          <div style="font-size:26px">{r.icon}</div>
          <div class="text-sm font-semibold mt-1" style="color:{C.ink}">{r.label}</div>
          {#if accounts && !accounts[k]}
            <div class="text-xs mt-1" style="color:{C.gold}">first sign-in</div>
          {/if}
        </button>
      {/each}
    </div>

    {#if picked && accounts}
      <Card>
        <div class="text-sm font-semibold mb-2">
          {isNew ? `Create a passcode for ${ROLES[picked].label}` : `Passcode for ${ROLES[picked].label}`}
        </div>
        <input
          class="wb-input"
          type="password"
          bind:value={code}
          placeholder={isNew ? "Choose a passcode (min. 4 characters)" : "Enter passcode"}
          onkeydown={(e) => e.key === "Enter" && !isNew && submit()}
        />
        {#if isNew}
          <input
            class="wb-input"
            style="margin-top:8px"
            type="password"
            bind:value={code2}
            placeholder="Repeat passcode"
            onkeydown={(e) => e.key === "Enter" && submit()}
          />
        {/if}
        {#if err}
          <div class="text-xs mt-2" style="color:{C.red}">{err}</div>
        {/if}
        <div class="mt-3">
          <Btn onclick={submit} disabled={busy}>{isNew ? "Set passcode & enter" : "Sign in"}</Btn>
        </div>
      </Card>
    {/if}

    <p class="text-xs text-center mt-4" style="color:{C.muted}">
      Wedding data is shared between everyone who signs in to this app. Passcodes are a light lock to keep roles tidy —
      don't reuse a password you use elsewhere.
    </p>
  </div>
</div>
