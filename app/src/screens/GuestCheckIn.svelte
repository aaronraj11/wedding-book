<script>
  // guest check-in kiosk (?p=checkin) — port of legacy GuestCheckIn
  import { C } from "../stores/theme.svelte.js";
  import { app } from "../stores/session.svelte.js";
  import { storage } from "../lib/storage.js";
  import { DATA_KEY, EMPTY } from "../lib/constants.js";
  import { num, RM } from "../lib/utils.js";
  import { membersOf, babyCount } from "../lib/guests.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Field from "../components/Field.svelte";
  import Ornaments from "../components/Ornaments.svelte";

  let { onBack, locked } = $props();

  let data = $state(null);
  let search = $state("");
  let sel = $state(null);
  let pax = $state("");
  let babies = $state("");
  let checkedMembers = $state([]);
  let side = $state(null); // "bride" | "groom" — asked first to narrow the search
  let giftIntent = $state(null); // null | "yes" | "no"
  let method = $state(null); // "cash" | "qr"
  let amount = $state("");
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
          .filter(
            (g) =>
              (!side || g.side === side) &&
              (g.name.toLowerCase().includes(q) || membersOf(g).some((m) => m.name.toLowerCase().includes(q)))
          )
          .slice(0, 8)
      : []
  );

  const dateStr = $derived(
    settings.date
      ? new Date(settings.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : ""
  );

  function pick(g) {
    sel = g;
    pax = String(num(g.confirmedPax || g.invitedPax) || 1);
    babies = String(g.confirmedBabies === "" || g.confirmedBabies === undefined ? num(g.invitedBabies) : num(g.confirmedBabies));
    const mm = membersOf(g);
    const names = mm.map((m) => m.name);
    const start = g.rsvp === "yes" && Array.isArray(g.confirmedMembers) ? g.confirmedMembers.filter((x) => names.includes(x)) : [...names];
    checkedMembers = start;
    if (names.length) {
      pax = String(start.length || 1);
      babies = String(babyCount(mm.filter((x) => start.includes(x.name))));
    }
    giftIntent = null;
    method = null;
    amount = "";
    err = "";
  }

  function toggleChecked(m, on) {
    const next = on ? checkedMembers.filter((x) => x !== m.name) : [...checkedMembers, m.name];
    checkedMembers = next;
    pax = String(next.length || 1);
    babies = String(babyCount(membersOf(sel).filter((x) => next.includes(x.name))));
  }

  async function submit() {
    if (!sel) return;
    busy = true;
    err = "";
    try {
      // re-read the latest shared data so we don't overwrite other people's edits
      const r = await storage.get(DATA_KEY(app.wedding), true);
      const fresh = r && r.value ? JSON.parse(r.value) : { ...EMPTY };
      fresh.guests = (fresh.guests || []).map((g) =>
        g.id === sel.id
          ? {
              ...g,
              checkedInAt: Date.now(),
              checkedInPax: num(pax) || 1,
              checkedInBabies: Math.min(num(babies), num(pax) || 1),
              ...(membersOf(sel).length > 0 ? { checkedInMembers: $state.snapshot(checkedMembers) } : {}),
              pledgeAmount: giftIntent === "yes" ? num(amount) : 0,
              pledgeMethod: giftIntent === "yes" ? method || "cash" : "",
            }
          : g
      );
      await storage.set(DATA_KEY(app.wedding), JSON.stringify(fresh), true);
      done = true;
    } catch (e) {
      err = "Couldn't save your check-in — please try again, or find one of the ushers.";
    }
    busy = false;
  }

  function reset() {
    done = false;
    sel = null;
    search = "";
    pax = "";
    babies = "";
    checkedMembers = [];
    giftIntent = null;
    method = null;
    amount = "";
    err = "";
    side = null;
  }

  // each side has their own QR; the shared one from before acts as a fallback
  const sideQr = $derived(side === "groom" ? settings.qrImageGroom || settings.qrImage : settings.qrImageBride || settings.qrImage);

  const cardStyle = "border-radius:18px;padding:24px;box-shadow:0 16px 48px rgba(34,48,31,.12)";
  const submitDisabled = $derived(busy || !num(pax) || giftIntent === null || (giftIntent === "yes" && (!method || !num(amount))));
</script>

{#snippet choiceButton(active, label, action)}
  <button
    onclick={action}
    style="flex:1 1 auto;padding:12px 20px;border-radius:14px;font-weight:600;font-size:15px;cursor:pointer;border:1.5px solid {active ? C.green : C.line};background:{active ? C.greenSoft : C.card};color:{active ? C.green : C.muted};transition:all .15s"
  >
    {label}
  </button>
{/snippet}

{#snippet qrBlock()}
  {#if sideQr}
    <div class="text-center mt-3">
      <img
        src={sideQr}
        alt="Payment QR"
        style="max-width:260px;width:100%;border-radius:12px;border:1px solid {C.line};margin:0 auto;background:#fff;padding:8px"
      />
      <p class="text-xs mt-2" style="color:{C.muted}">
        Scan with your banking app to transfer{num(amount) > 0 ? ` ${RM(amount)}` : ""} to the {side === "groom" ? "groom" : "bride"}. Thank you! 💛
      </p>
    </div>
  {:else}
    <p class="text-sm mt-3" style="color:{C.gold}">
      The QR code isn't set up yet — the ushers can help, or you can give cash at the gift box. 💛
    </p>
  {/if}
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
      {#if dateStr}
        <div class="flex items-center justify-center gap-3 mt-3">
          <span style="width:44px;border-top:1px solid {C.gold};display:inline-block"></span>
          <span class="wb-serif" style="font-style:italic;font-size:16px;color:{C.gold}">{dateStr}</span>
          <span style="width:44px;border-top:1px solid {C.gold};display:inline-block"></span>
        </div>
      {/if}
      <div class="wb-serif" style="font-size:22px;font-weight:600;margin-top:16px;color:{C.ink}">Guest check-in</div>
    </div>

    {#if !data}
      <Card style="{cardStyle};border-top:3px solid {C.gold}">
        <span style="color:{C.muted}">Loading the guest book…</span>
      </Card>
    {:else if done}
      <Card style="{cardStyle};border-top:3px solid {C.gold}">
        <div class="text-center">
          <div style="font-size:44px;line-height:1">🎉</div>
          <div class="wb-serif" style="font-size:26px;font-weight:700;margin-top:10px">You're checked in!</div>
        </div>
        <p class="text-sm mt-2 text-center" style="color:{C.muted}">
          {sel.name} · {num(pax)} pax{num(babies) > 0 ? ` (${num(babies)} 👶)` : ""}{giftIntent === "yes" && num(amount) > 0
            ? ` · gift ${RM(amount)} (${method === "qr" ? "QR" : "cash"})`
            : ""}
        </p>
        <div class="mt-3 p-3" style="background:{C.goldSoft};border:1px solid {C.gold};border-radius:10px">
          <div class="text-sm font-semibold" style="color:{C.gold}">
            🎗️ Please collect {num(pax) > 1 ? `your ${num(pax)} wrist bands` : "your wrist band"} from the usher
          </div>
          <div class="text-xs mt-1" style="color:{C.muted}">
            Wrist bands are required to enter the wedding hall — one per person.
          </div>
        </div>
        {#if giftIntent === "yes" && method === "qr"}
          {@render qrBlock()}
        {/if}
        <p class="text-sm mt-3" style="color:{C.muted}">Enjoy the celebration! 🥂</p>
        <div class="mt-4">
          <Btn onclick={reset}>✓ Done</Btn>
        </div>
      </Card>
    {:else if !side}
      <Card style="{cardStyle};border-top:3px solid {C.gold}">
        <div class="text-center mb-4 wb-serif" style="font-size:20px;font-weight:600">Whose guest are you?</div>
        <div class="flex gap-3">
          <button
            onclick={() => (side = "bride")}
            style="flex:1;padding:18px 10px;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;border:1.5px solid {C.gold};background:{C.goldSoft};color:{C.gold}"
          >
            🌸 Bride's guest
          </button>
          <button
            onclick={() => (side = "groom")}
            style="flex:1;padding:18px 10px;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;border:1.5px solid {C.green};background:{C.greenSoft};color:{C.green}"
          >
            🤵 Groom's guest
          </button>
        </div>
        <p class="text-xs text-center mt-3" style="color:{C.muted}">
          Not sure? Pick the side that invited you — the ushers can help.
        </p>
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
              <span class="text-xs" style="color:{C.muted}"> · {g.invitedPax} pax invited{g.group ? ` · ${g.group}` : ""}</span>
              {#if !g.name.toLowerCase().includes(q) && membersOf(g).some((m) => m.name.toLowerCase().includes(q))}
                <span class="text-xs" style="color:{C.gold}"> · {membersOf(g).find((m) => m.name.toLowerCase().includes(q)).name} is in this party</span>
              {/if}
              {#if g.checkedInAt}
                <span class="text-xs" style="color:{C.green}"> · already checked in ✓</span>
              {/if}
            </button>
          {/each}
          {#if q.length >= 2 && matches.length === 0}
            <span class="text-sm" style="color:{C.muted}">
              No invitation found under that name on this side — try switching side below, or ask the ushers.
            </span>
          {/if}
        </div>
        <p class="text-xs text-center mt-3" style="color:{C.muted}">
          Searching {side === "bride" ? "the bride's" : "the groom's"} guests ·
          <button
            onclick={() => {
              side = null;
              search = "";
            }}
            style="background:none;border:none;color:{C.gold};cursor:pointer;text-decoration:underline;font-size:12px;padding:0"
          >
            switch side
          </button>
        </p>
      </Card>
    {:else}
      <Card style="{cardStyle};border-top:3px solid {C.gold}">
        <div class="flex items-center justify-between">
          <div class="wb-serif" style="font-size:24px;font-weight:700">{sel.name}</div>
          <Btn kind="ghost" small onclick={() => (sel = null)}>Not you?</Btn>
        </div>
        <p class="text-xs mt-1" style="color:{C.muted}">
          Invited: {sel.invitedPax} pax{sel.checkedInAt ? " · you've checked in before — this will update it" : ""}
        </p>
        {#if membersOf(sel).length > 0}
          <div class="mt-4">
            <div class="mb-2" style="color:{C.gold};letter-spacing:2px;font-size:11px;font-weight:700;text-transform:uppercase">
              Who's here? — tap names
            </div>
            <div class="flex flex-wrap gap-2">
              {#each membersOf(sel) as m (m.name)}
                {@const on = checkedMembers.includes(m.name)}
                <button
                  onclick={() => toggleChecked(m, on)}
                  style="padding:8px 16px;border-radius:999px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid {on ? C.green : C.line};background:{on ? C.greenSoft : C.card};color:{on ? C.green : C.muted};text-decoration:{on ? 'none' : 'line-through'}"
                >
                  {on ? "✓ " : ""}{m.name}{m.type === "baby" ? " 👶" : ""}
                </button>
              {/each}
            </div>
            <p class="text-xs mt-2" style="color:{C.muted}">
              Here now: <b style="color:{C.green}">{checkedMembers.length} pax</b>{num(babies) > 0 ? ` · ${num(babies)} 👶` : ""}
            </p>
          </div>
        {:else}
          <div class="mt-4">
            <div class="flex gap-3 flex-wrap items-end">
              <Field label="How many of you are here today? (everyone, incl. babies)">
                <input class="wb-input" style="width:130px" type="number" min="1" bind:value={pax} />
              </Field>
              <Field label="…of which babies 👶">
                <input class="wb-input" style="width:110px" type="number" min="0" bind:value={babies} />
              </Field>
            </div>
            <p class="text-xs mt-1" style="color:{C.muted}">
              Please count everyone in the total — babies are noted separately so no seat's worth of food is prepared for them.
            </p>
          </div>
        {/if}

        <div class="mt-4">
          <div class="mb-2" style="color:{C.gold};letter-spacing:2px;font-size:11px;font-weight:700;text-transform:uppercase">
            Would you like to provide the couple with a monetary gift? 💝
          </div>
          <div class="flex gap-2">
            {@render choiceButton(giftIntent === "yes", "Yes", () => (giftIntent = "yes"))}
            {@render choiceButton(giftIntent === "no", "No", () => (giftIntent = "no"))}
          </div>
        </div>

        {#if giftIntent === "yes"}
          <div class="mt-4">
            <div class="mb-2" style="color:{C.gold};letter-spacing:2px;font-size:11px;font-weight:700;text-transform:uppercase">
              How would you like to give?
            </div>
            <div class="flex gap-2">
              {@render choiceButton(method === "cash", "💵 Cash", () => (method = "cash"))}
              {@render choiceButton(method === "qr", "📱 QR transfer", () => (method = "qr"))}
            </div>
            <div class="mt-3">
              <Field label="Amount (RM)">
                <input class="wb-input" style="width:140px" type="number" min="0" bind:value={amount} placeholder="e.g. 200" />
              </Field>
            </div>
            {#if method === "qr"}
              {@render qrBlock()}
            {/if}
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
            {busy ? "Saving…" : "Check in ✓"}
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
