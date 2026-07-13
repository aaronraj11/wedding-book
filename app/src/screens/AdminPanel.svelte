<script>
  // master control — port of legacy AdminPanel.
  // credentials are stored as scramble() hashes, never as plain text
  import { C, theme, toggleTheme } from "../stores/theme.svelte.js";
  import { storage } from "../lib/storage.js";
  import { DATA_KEY, ACCT_KEY, META_KEY } from "../lib/constants.js";
  import { scramble, num, RM, downloadBlob } from "../lib/utils.js";
  import { computeStats } from "../lib/stats.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Field from "../components/Field.svelte";
  import Pill from "../components/Pill.svelte";

  let { onExit, onEnter } = $props();

  const ADMIN_USER_HASH = "h1tn8uad";
  const ADMIN_PASS_HASH = "hum8c2x";

  let authed = $state(false);
  let user = $state("");
  let pass = $state("");
  let err = $state("");
  let list = $state(null);
  let detail = $state({}); // code -> { loading | data | error, lastActive }
  let confirmDelete = $state(null); // code awaiting confirmation
  let busyDelete = $state(false);

  function loginAdmin() {
    if (scramble(user.trim()) === ADMIN_USER_HASH && scramble(pass) === ADMIN_PASS_HASH) {
      authed = true;
      err = "";
    } else {
      err = "Wrong username or password.";
    }
  }

  $effect(() => {
    if (!authed) return;
    (async () => {
      try {
        const r = await storage.get("registry", true);
        const l = r && r.value ? JSON.parse(r.value) : [];
        list = l.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      } catch (e) {
        list = [];
      }
    })();
  });

  async function loadDetail(code) {
    detail = { ...detail, [code]: { loading: true } };
    try {
      const r = await storage.get(DATA_KEY(code), true);
      let lastActive = null;
      try {
        lastActive = await storage.getUpdatedAt(DATA_KEY(code));
      } catch (e) {}
      detail = { ...detail, [code]: { data: r && r.value ? JSON.parse(r.value) : null, lastActive } };
    } catch (e) {
      detail = { ...detail, [code]: { error: true } };
    }
  }

  async function saveRegistry(next) {
    await storage.set("registry", JSON.stringify(next), true);
    list = next.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async function setArchived(code, archived) {
    try {
      await saveRegistry($state.snapshot(list).map((x) => (x.code === code ? { ...x, archived } : x)));
    } catch (e) {}
  }

  async function doDelete(code) {
    busyDelete = true;
    try {
      // the ONLY place allowed to delete a wedding's data doc — hence the explicit flag
      await storage.delete(DATA_KEY(code), true, { iKnowThisDestroysAWedding: true });
      await storage.delete(ACCT_KEY(code), true);
      await storage.delete(META_KEY(code), true);
      await saveRegistry($state.snapshot(list).filter((x) => x.code !== code));
      detail = { ...detail, [code]: undefined };
      confirmDelete = null;
    } catch (e) {}
    busyDelete = false;
  }

  async function exportWedding(code) {
    try {
      const r = await storage.get(DATA_KEY(code), true);
      if (r && r.value) downloadBlob(r.value, `wedding-${code}-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    } catch (e) {}
  }
</script>

<div class="min-h-screen px-4 py-10" style="background:{C.ivory};color:{C.ink}">
  <div class="w-full max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-4">
      <div class="wb-serif" style="font-size:28px;font-weight:600">🛡️ Master control</div>
      <div class="flex gap-2">
        <Btn kind="ghost" small onclick={toggleTheme}>{theme.mode === "dark" ? "☀️" : "🌙"}</Btn>
        <Btn kind="ghost" small onclick={onExit}>Exit</Btn>
      </div>
    </div>

    {#if !authed}
      <Card className="max-w-md mx-auto">
        <div class="text-sm font-semibold mb-2">Admin sign-in</div>
        <Field label="Username" className="mb-2">
          <input class="wb-input" bind:value={user} autocomplete="off" />
        </Field>
        <Field label="Password">
          <input class="wb-input" type="password" bind:value={pass} onkeydown={(e) => e.key === "Enter" && loginAdmin()} />
        </Field>
        {#if err}
          <div class="text-xs mt-2" style="color:{C.red}">{err}</div>
        {/if}
        <div class="mt-3">
          <Btn onclick={loginAdmin}>Sign in</Btn>
        </div>
      </Card>
    {:else if !list}
      <Card>
        <span style="color:{C.muted}">Loading weddings…</span>
      </Card>
    {:else}
      <div class="grid gap-3">
        <Card style="padding:14px">
          <span class="text-sm" style="color:{C.muted}">
            {list.length} wedding{list.length === 1 ? "" : "s"} registered on your app.
          </span>
        </Card>
        {#each list.slice().sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0)) as w (w.code)}
          {@const d = detail[w.code]}
          {@const stats = d && d.data ? computeStats(d.data, null) : null}
          <Card style="padding:14px;opacity:{w.archived ? 0.6 : 1}">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold">{w.couple || "(unnamed couple)"}</span>
              <Pill tone="gold">🔑 {w.code}</Pill>
              {#if w.archived}<Pill>📦 Archived</Pill>{/if}
              {#if w.createdAt}
                <span class="text-xs" style="color:{C.muted}">
                  registered {new Date(w.createdAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              {/if}
              <div class="ml-auto flex gap-2 flex-wrap">
                {#if !d}
                  <Btn kind="ghost" small onclick={() => loadDetail(w.code)}>View details</Btn>
                {/if}
                <Btn kind="ghost" small onclick={() => exportWedding(w.code)}>⬇ Backup</Btn>
                <Btn kind="ghost" small onclick={() => setArchived(w.code, !w.archived)}>
                  {w.archived ? "Unarchive" : "📦 Archive"}
                </Btn>
                <Btn kind="danger" small onclick={() => (confirmDelete = w.code)}>Delete</Btn>
                <Btn small onclick={() => onEnter(w.code)}>Open with full access</Btn>
              </div>
            </div>
            {#if confirmDelete === w.code}
              <div class="p-3 mt-2" style="background:{C.redSoft};border:1px solid {C.red};border-radius:10px">
                <div class="text-sm font-semibold" style="color:{C.red}">
                  Permanently delete "{w.couple || w.code}"?
                </div>
                <div class="text-xs mt-1" style="color:{C.muted}">
                  This erases the wedding's guests, budget, gifts, and passcodes for everyone. Download a backup first
                  if in doubt. This cannot be undone.
                </div>
                <div class="flex gap-2 mt-2">
                  <Btn small onclick={() => doDelete(w.code)} disabled={busyDelete}>
                    {busyDelete ? "Deleting…" : "Yes, delete forever"}
                  </Btn>
                  <Btn kind="ghost" small onclick={() => (confirmDelete = null)}>Cancel</Btn>
                </div>
              </div>
            {/if}
            {#if d && d.loading}
              <div class="text-xs mt-2" style="color:{C.muted}">Loading…</div>
            {/if}
            {#if d && d.error}
              <div class="text-xs mt-2" style="color:{C.red}">Couldn't load this wedding's data.</div>
            {/if}
            {#if stats && d.data}
              <div class="flex flex-wrap gap-4 mt-3 text-sm">
                <span>📅 <b>{d.data.settings.date || "no date set"}</b></span>
                <span>👥 <b>{stats.guestCount}</b> invites · <b>{stats.invitedPax}</b> pax</span>
                <span>✅ <b>{stats.confirmedPax}</b> confirmed · {stats.pending} pending</span>
                <span>💰 budget <b>{RM(stats.actual)}</b> ({RM(stats.paidOut)} paid)</span>
                <span>💝 gifts <b>{RM(stats.gifts)}</b></span>
                {#if d.lastActive}
                  <span>
                    🕐 last activity
                    <b>{new Date(d.lastActive).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</b>
                  </span>
                {/if}
              </div>
            {/if}
          </Card>
        {/each}
      </div>
    {/if}
  </div>
</div>
