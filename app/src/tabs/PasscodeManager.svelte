<script>
  // couple manages role passcodes — port of legacy PasscodeManager
  import { C } from "../stores/theme.svelte.js";
  import { app } from "../stores/session.svelte.js";
  import { storage } from "../lib/storage.js";
  import { ACCT_KEY, ROLES } from "../lib/constants.js";
  import { scramble } from "../lib/utils.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Pill from "../components/Pill.svelte";

  let { onClose } = $props();

  let accounts = $state(null);
  let editing = $state(null);
  let code = $state("");
  let msg = $state("");

  $effect(() => {
    (async () => {
      try {
        const r = await storage.get(ACCT_KEY(app.wedding), true);
        accounts = r && r.value ? JSON.parse(r.value) : {};
      } catch (e) {
        accounts = {};
      }
    })();
  });

  async function save(roleKey, newCode) {
    const next = { ...accounts };
    if (newCode === null) delete next[roleKey];
    else next[roleKey] = scramble(newCode);
    try {
      await storage.set(ACCT_KEY(app.wedding), JSON.stringify(next), true);
      accounts = next;
      editing = null;
      code = "";
      msg = newCode === null ? `${ROLES[roleKey].label}'s passcode cleared — they'll set a new one at sign-in.` : `${ROLES[roleKey].label}'s passcode updated.`;
    } catch (e) {
      msg = "Couldn't save. Try again.";
    }
  }
</script>

{#if accounts}
  <Card className="mt-4">
    <div class="flex items-center justify-between mb-2">
      <div class="wb-serif" style="font-size:18px;font-weight:600">Team passcodes</div>
      <Btn kind="ghost" small onclick={onClose}>Close</Btn>
    </div>
    <div class="grid gap-2">
      {#each Object.entries(ROLES) as [k, r] (k)}
        <div class="flex flex-wrap items-center gap-2 p-2" style="background:{C.soft};border:1px solid {C.line};border-radius:8px">
          <span class="text-sm font-medium">{r.icon} {r.label}</span>
          <Pill tone={accounts[k] ? "green" : "neutral"}>{accounts[k] ? "Passcode set" : "Not set"}</Pill>
          <div class="ml-auto flex items-center gap-2">
            {#if editing === k}
              <input class="wb-input" style="width:160px;padding:4px 8px" type="password" placeholder="New passcode" bind:value={code} />
              <Btn small onclick={() => code.length >= 4 && save(k, code)} disabled={code.length < 4}>Save</Btn>
              <Btn kind="ghost" small onclick={() => (editing = null)}>Cancel</Btn>
            {:else}
              <Btn
                kind="ghost"
                small
                onclick={() => {
                  editing = k;
                  code = "";
                }}
              >
                Set new
              </Btn>
              {#if accounts[k]}
                <Btn kind="danger" small onclick={() => save(k, null)}>Clear</Btn>
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    </div>
    {#if msg}
      <div class="text-xs mt-2" style="color:{C.green}">{msg}</div>
    {/if}
  </Card>
{/if}
