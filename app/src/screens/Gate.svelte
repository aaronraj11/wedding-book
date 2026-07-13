<script>
  // open/create a wedding by code — port of legacy WeddingGate
  import { C, theme, toggleTheme } from "../stores/theme.svelte.js";
  import { storage } from "../lib/storage.js";
  import { META_KEY, DATA_KEY, EMPTY, defaultEvents } from "../lib/constants.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Field from "../components/Field.svelte";

  let { onOpen, onAdmin } = $props();

  let mode = $state("open"); // open | create
  let code = $state("");
  let couple = $state("");
  let err = $state("");
  let busy = $state(false);

  const norm = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

  async function open() {
    err = "";
    const c = norm(code);
    if (!c) return (err = "Enter your wedding code.");
    busy = true;
    try {
      const r = await storage.get(META_KEY(c), true);
      if (!r || !r.value) {
        err = "No wedding found with that code — check the spelling, or create a new one.";
      } else {
        onOpen(c);
      }
    } catch (e) {
      err = "Couldn't reach the database — check your connection and try again.";
    }
    busy = false;
  }

  async function create() {
    err = "";
    const c = norm(code);
    if (!couple.trim()) return (err = "Enter your names first.");
    if (c.length < 4) return (err = "Choose a wedding code of at least 4 characters — letters, numbers and dashes.");
    busy = true;
    try {
      const r = await storage.get(META_KEY(c), true);
      if (r && r.value) {
        err = "That wedding code is already taken — pick another.";
        busy = false;
        return;
      }
      await storage.set(META_KEY(c), JSON.stringify({ couple: couple.trim(), createdAt: Date.now() }), true);
      const seed = { ...EMPTY, settings: { ...EMPTY.settings, couple: couple.trim() } };
      seed.events = defaultEvents(seed.settings);
      await storage.set(DATA_KEY(c), JSON.stringify(seed), true);
      // record the new wedding in the app-wide registry (used by master control)
      try {
        const reg = await storage.get("registry", true);
        const list = reg && reg.value ? JSON.parse(reg.value) : [];
        if (!list.some((x) => x.code === c)) list.push({ code: c, couple: couple.trim(), createdAt: Date.now() });
        await storage.set("registry", JSON.stringify(list), true);
      } catch (e) {}
      onOpen(c);
    } catch (e) {
      err = "Couldn't create the wedding — try again.";
    }
    busy = false;
  }
</script>

<div class="min-h-screen flex items-center justify-center px-4 py-10" style="background:{C.ivory};color:{C.ink}">
  <div class="w-full max-w-md">
    <div class="flex justify-end mb-2">
      <Btn kind="ghost" small onclick={toggleTheme}>{theme.mode === "dark" ? "☀️ Light" : "🌙 Dark"}</Btn>
    </div>
    <div class="text-center mb-6">
      <div class="text-xs uppercase tracking-widest mb-1" style="color:{C.gold}">❦ &nbsp;Wedding Book&nbsp; ❦</div>
      <div class="wb-serif" style="font-size:32px;font-weight:600">Your wedding, your book</div>
      <p class="text-sm mt-1" style="color:{C.muted}">
        Every couple gets their own private space. Open yours with your wedding code, or start a new one.
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3 mb-4">
      {#each [["open", "🔑 I have a code"], ["create", "✨ New wedding"]] as [k, label] (k)}
        <button
          onclick={() => {
            mode = k;
            err = "";
          }}
          style="background:{mode === k ? C.greenSoft : C.card};border:1px solid {mode === k ? C.green : C.line};border-radius:12px;padding:14px 10px;cursor:pointer;font-weight:600;color:{mode === k ? C.green : C.ink}"
        >
          {label}
        </button>
      {/each}
    </div>

    <Card>
      {#if mode === "create"}
        <div class="mb-3">
          <Field label="Your names">
            <input class="wb-input" bind:value={couple} placeholder="e.g. Aaron & Joan" />
          </Field>
        </div>
      {/if}
      <Field label={mode === "create" ? "Choose a wedding code" : "Wedding code"}>
        <input
          class="wb-input"
          bind:value={code}
          placeholder={mode === "create" ? "e.g. aaron-joan-2026" : "the code the couple shared with you"}
          onkeydown={(e) => e.key === "Enter" && (mode === "create" ? create() : open())}
        />
      </Field>
      {#if mode === "create"}
        <p class="text-xs mt-2" style="color:{C.muted}">
          The code is how you and your team find your wedding — like a room name. Letters, numbers and dashes only.
          Share it only with people who should see your planning data.
        </p>
      {/if}
      {#if err}
        <div class="text-xs mt-2" style="color:{C.red}">{err}</div>
      {/if}
      <div class="mt-3">
        <Btn onclick={mode === "create" ? create : open} disabled={busy}>
          {busy ? "Checking…" : mode === "create" ? "Create wedding" : "Open wedding"}
        </Btn>
      </div>
    </Card>

    <p class="text-xs text-center mt-4">
      <button onclick={onAdmin} style="background:none;border:none;color:{C.muted};cursor:pointer;text-decoration:underline">
        Admin
      </button>
    </p>
  </div>
</div>
