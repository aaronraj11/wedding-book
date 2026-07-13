<script>
  // WhatsApp invitations: template editor + preview + one-by-one send queue
  import { C } from "../../stores/theme.svelte.js";
  import { wd, up } from "../../stores/wedding.svelte.js";
  import { app } from "../../stores/session.svelte.js";
  import { DEFAULT_TEMPLATE } from "../../lib/constants.js";
  import { buildInviteMessage, waLink, waNumber } from "../../lib/whatsapp.js";
  import Btn from "../../components/Btn.svelte";
  import Card from "../../components/Card.svelte";
  import Field from "../../components/Field.svelte";

  let { pool } = $props();

  let open = $state(false);
  let queueIdx = $state(0);

  const template = $derived(wd.data.settings.inviteTemplate || DEFAULT_TEMPLATE);
  const setTemplate = (t) => up({ settings: { ...wd.data.settings, inviteTemplate: t } });
  const patch = (id, p) => up({ guests: wd.data.guests.map((g) => (g.id === id ? { ...g, ...p } : g)) });

  const withPhone = $derived(pool.filter((g) => waNumber(g.phone)));
  const noPhone = $derived(pool.length - withPhone.length);
  const notInvited = $derived(withPhone.filter((g) => !g.invitedAt));
  const previewGuest = $derived(withPhone[0] || pool[0] || { name: "Uncle Lim & family", invitedPax: 4 });

  const queue = $derived(notInvited);
  const current = $derived(queue[Math.min(queueIdx, queue.length - 1)]);

  function sendCurrent() {
    if (!current) return;
    const msg = buildInviteMessage(template, current, wd.data.settings, app.wedding);
    const link = waLink(current.phone, msg);
    if (link) {
      window.open(link, "_blank");
      patch(current.id, { invitedAt: Date.now() });
      queueIdx = 0; // list shrinks as guests get marked invited
    }
  }
</script>

<Card>
  <div class="flex items-center justify-between flex-wrap gap-2">
    <div>
      <div class="wb-serif" style="font-size:20px;font-weight:600">💬 WhatsApp invitations</div>
      <div class="text-xs mt-1" style="color:{C.muted}">
        {withPhone.length} guests with phone numbers · {notInvited.length} not yet invited{noPhone > 0
          ? ` · ${noPhone} missing a number`
          : ""}
      </div>
    </div>
    <Btn kind="ghost" small onclick={() => (open = !open)}>{open ? "Hide" : "Open"}</Btn>
  </div>

  {#if open}
    <div class="mt-4 grid md:grid-cols-2 gap-4">
      <!-- template editor -->
      <div>
        <div class="grid gap-3 mb-3">
          <Field label="Venue name">
            <input
              class="wb-input"
              value={wd.data.settings.venueName || ""}
              oninput={(e) => up({ settings: { ...wd.data.settings, venueName: e.target.value } })}
              placeholder="e.g. Full Gospel Assembly KL"
            />
          </Field>
          <Field label="Google Maps link">
            <input
              class="wb-input"
              value={wd.data.settings.venueMaps || ""}
              oninput={(e) => up({ settings: { ...wd.data.settings, venueMaps: e.target.value } })}
              placeholder="https://maps.google.com/…"
            />
          </Field>
          <Field label="Waze link">
            <input
              class="wb-input"
              value={wd.data.settings.venueWaze || ""}
              oninput={(e) => up({ settings: { ...wd.data.settings, venueWaze: e.target.value } })}
              placeholder="https://waze.com/…"
            />
          </Field>
        </div>
        <Field label="Message template">
          <textarea
            class="wb-input"
            style="min-height:190px;resize:vertical;font-family:inherit"
            value={template}
            oninput={(e) => setTemplate(e.target.value)}
          ></textarea>
        </Field>
        <div class="text-xs mt-2" style="color:{C.muted}">
          Placeholders: <b>{"{name}"}</b> guest's name · <b>{"{couple}"}</b> your names · <b>{"{date}"}</b> wedding date
          · <b>{"{pax}"}</b> their invited pax · <b>{"{location}"}</b> the venue name with Google Maps and Waze links
          (set above) · <b>{"{rsvp}"}</b> a link where the guest replies directly in the app (their answer updates your
          list automatically). The template is shared, so set it once and both accountants use the same wording.
        </div>
        <div class="mt-2">
          <Btn kind="ghost" small onclick={() => setTemplate(DEFAULT_TEMPLATE)}>Reset to default</Btn>
        </div>
      </div>

      <!-- preview + send queue -->
      <div>
        <div class="text-xs uppercase tracking-wider mb-1" style="color:{C.muted}">
          Preview — as {previewGuest.name} will receive it
        </div>
        <div
          class="text-sm whitespace-pre-wrap p-3"
          style="background:{C.waSoft};border:1px solid {C.waBorder};border-radius:12px 12px 12px 2px;color:{C.waText}"
        >
          {buildInviteMessage(template, previewGuest, wd.data.settings, app.wedding)}
        </div>

        <div class="mt-4 p-3" style="background:{C.soft};border:1px solid {C.line};border-radius:10px">
          <div class="text-sm font-semibold mb-1">Send one by one</div>
          {#if queue.length === 0}
            <div class="text-xs" style="color:{C.muted}">
              Everyone with a phone number has been invited 🎉 — use the 💬 button on a guest's card to resend.
            </div>
          {:else}
            <div class="text-xs mb-2" style="color:{C.muted}">
              Next up: <b style="color:{C.ink}">{current.name}</b> ({current.phone}) · {queue.length} remaining
            </div>
            <div class="flex gap-2">
              <Btn small onclick={sendCurrent}>Open in WhatsApp & mark invited</Btn>
              <Btn kind="ghost" small onclick={() => (queueIdx = (queueIdx + 1) % queue.length)}>Skip</Btn>
            </div>
            <div class="text-xs mt-2" style="color:{C.muted}">
              Each tap opens WhatsApp with the message pre-filled for that guest — you just press send there. WhatsApp
              doesn't allow apps to send silently in bulk, so it's one confirm-tap per guest.
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</Card>
