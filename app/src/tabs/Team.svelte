<script>
  // 🎭 wedding-day team: organizational hierarchy of roles, grouped by category.
  // categories and roles are fully editable — add, rename, assign, delete.
  import { C } from "../stores/theme.svelte.js";
  import { wd, up } from "../stores/wedding.svelte.js";
  import { defaultTeam } from "../lib/constants.js";
  import { uid } from "../lib/utils.js";
  import { buildTeamHtml } from "../lib/exports.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Field from "../components/Field.svelte";
  import Pill from "../components/Pill.svelte";
  import Stat from "../components/Stat.svelte";

  let newCat = $state("");
  let newRole = $state({}); // categoryId -> title being typed
  let confirmDeleteCat = $state(null);

  const team = $derived(wd.data.team || []);
  const allRoles = $derived(team.flatMap((c) => c.roles));
  const filled = $derived(allRoles.filter((r) => (r.person || "").trim()).length);

  const setTeam = (next) => up({ team: next });
  const patchCat = (id, p) => setTeam(team.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const patchRole = (catId, roleId, p) =>
    setTeam(team.map((c) => (c.id === catId ? { ...c, roles: c.roles.map((r) => (r.id === roleId ? { ...r, ...p } : r)) } : c)));

  function addCategory() {
    if (!newCat.trim()) return;
    setTeam([...team, { id: "tc-" + uid(), name: newCat.trim(), roles: [] }]);
    newCat = "";
  }
  function removeCategory(id) {
    setTeam(team.filter((c) => c.id !== id));
    confirmDeleteCat = null;
  }
  function addRole(cat) {
    const title = (newRole[cat.id] || "").trim();
    if (!title) return;
    patchCat(cat.id, { roles: [...cat.roles, { id: "tr-" + uid(), title, person: "", phone: "" }] });
    newRole = { ...newRole, [cat.id]: "" };
  }
  const removeRole = (cat, roleId) => patchCat(cat.id, { roles: cat.roles.filter((r) => r.id !== roleId) });

  // move a category up/down in the hierarchy
  function moveCat(id, dir) {
    const i = team.findIndex((c) => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= team.length) return;
    const next = [...team];
    [next[i], next[j]] = [next[j], next[i]];
    setTeam(next);
  }

  // open a print-ready sheet (roster call-sheet, or one card per person)
  function printTeam(mode) {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildTeamHtml($state.snapshot(wd.data), mode));
    w.document.close();
  }
</script>

<div class="grid gap-4">
  <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
    <Stat label="Roles" value={allRoles.length} sub={`across ${team.length} categories`} />
    <Stat label="Assigned" value={filled} tone={C.green} sub={allRoles.length ? `${Math.round((filled / allRoles.length) * 100)}% filled` : undefined} />
    <Stat label="Still needed" value={allRoles.length - filled} tone={allRoles.length - filled > 0 ? C.gold : C.green} />
  </div>

  {#if allRoles.length > 0}
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs" style="color:{C.muted}">🖨️ Print handouts:</span>
      <Btn kind="ghost" small onclick={() => printTeam("roster")}>Team roster (call sheet)</Btn>
      <Btn kind="ghost" small onclick={() => printTeam("cards")} disabled={filled === 0}>Individual cards ({filled})</Btn>
    </div>
  {/if}

  {#if team.length === 0}
    <Card>
      <div class="wb-serif" style="font-size:20px;font-weight:600">Build your wedding-day team</div>
      <p class="text-sm mt-1 mb-3" style="color:{C.muted}">
        Who's doing what on the big day — bridal party, worship team, coordinators, AV crew. Start from the full
        template (you can rename or delete anything) or build your own from scratch below.
      </p>
      <Btn onclick={() => setTeam(defaultTeam())}>✨ Load the starter template</Btn>
    </Card>
  {/if}

  {#each team as cat, ci (cat.id)}
    <Card style="padding:14px">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <input
          class="wb-serif wb-inline-edit"
          title="Click to rename this category"
          style="font-size:18px;font-weight:600;min-width:200px;flex:1"
          value={cat.name}
          oninput={(e) => patchCat(cat.id, { name: e.target.value })}
        />
        <Pill tone={cat.roles.every((r) => (r.person || "").trim()) && cat.roles.length ? "green" : "neutral"}>
          {cat.roles.filter((r) => (r.person || "").trim()).length}/{cat.roles.length} assigned
        </Pill>
        <div class="flex gap-1">
          <Btn kind="ghost" small onclick={() => moveCat(cat.id, -1)} disabled={ci === 0}>↑</Btn>
          <Btn kind="ghost" small onclick={() => moveCat(cat.id, 1)} disabled={ci === team.length - 1}>↓</Btn>
          <Btn kind="danger" small onclick={() => (confirmDeleteCat = confirmDeleteCat === cat.id ? null : cat.id)}>✕</Btn>
        </div>
      </div>

      {#if confirmDeleteCat === cat.id}
        <div class="p-3 mb-2" style="background:{C.redSoft};border:1px solid {C.red};border-radius:10px">
          <span class="text-sm font-semibold" style="color:{C.red}">Delete "{cat.name}" and its {cat.roles.length} roles?</span>
          <div class="flex gap-2 mt-2">
            <Btn small onclick={() => removeCategory(cat.id)}>Yes, delete</Btn>
            <Btn kind="ghost" small onclick={() => (confirmDeleteCat = null)}>Cancel</Btn>
          </div>
        </div>
      {/if}

      <div class="grid gap-2">
        {#each cat.roles as r (r.id)}
          <div class="p-2" style="background:{(r.person || '').trim() ? C.greenSoft : C.soft};border:1px solid {C.line};border-radius:8px">
            <div class="flex flex-wrap items-center gap-2">
              <input
                class="text-sm font-semibold wb-inline-edit"
                title="Click to rename this role"
                style="width:200px"
                value={r.title}
                oninput={(e) => patchRole(cat.id, r.id, { title: e.target.value })}
              />
              <input
                class="wb-input"
                style="width:190px;padding:4px 8px"
                placeholder="Who's doing it?"
                value={r.person || ""}
                oninput={(e) => patchRole(cat.id, r.id, { person: e.target.value })}
              />
              <input
                class="wb-input"
                style="width:150px;padding:4px 8px"
                placeholder="Phone (optional)"
                value={r.phone || ""}
                oninput={(e) => patchRole(cat.id, r.id, { phone: e.target.value })}
              />
              {#if (r.person || "").trim()}<span class="text-xs" style="color:{C.green}">✓</span>{/if}
              <div class="ml-auto">
                <Btn kind="danger" small onclick={() => removeRole(cat, r.id)}>✕</Btn>
              </div>
            </div>
            <input
              class="wb-input"
              style="width:100%;padding:4px 8px;margin-top:6px;font-size:13px"
              placeholder="Task / duties (optional) — what this person does on the day"
              value={r.task || ""}
              oninput={(e) => patchRole(cat.id, r.id, { task: e.target.value })}
            />
          </div>
        {/each}
        <div class="flex flex-wrap items-center gap-2">
          <input
            class="wb-input"
            style="width:250px;padding:5px 10px"
            placeholder="Add a role, e.g. Cake table"
            value={newRole[cat.id] || ""}
            oninput={(e) => (newRole = { ...newRole, [cat.id]: e.target.value })}
            onkeydown={(e) => e.key === "Enter" && addRole(cat)}
          />
          <Btn kind="ghost" small onclick={() => addRole(cat)}>＋ Add role</Btn>
        </div>
      </div>
    </Card>
  {/each}

  <Card>
    <div class="flex flex-wrap items-end gap-3">
      <Field label="New category" className="flex-1 min-w-60">
        <input class="wb-input" placeholder="e.g. 🚗 Transport & logistics" bind:value={newCat} onkeydown={(e) => e.key === "Enter" && addCategory()} />
      </Field>
      <Btn onclick={addCategory}>Add category</Btn>
    </div>
    <p class="text-xs mt-2" style="color:{C.muted}">
      Categories are the branches of your team tree — reorder with ↑↓. Role and category names are editable in place;
      a role turns green once someone's name is on it.
    </p>
  </Card>
</div>
