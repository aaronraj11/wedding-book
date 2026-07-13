<script>
  // to-do / timeline checklist (couple only) — port of legacy Todos
  import { C } from "../stores/theme.svelte.js";
  import { wd, up } from "../stores/wedding.svelte.js";
  import { uid, RM, pushTrash } from "../lib/utils.js";
  import Btn from "../components/Btn.svelte";
  import Card from "../components/Card.svelte";
  import Field from "../components/Field.svelte";
  import Pill from "../components/Pill.svelte";
  import Stat from "../components/Stat.svelte";

  const todos = $derived(wd.data.todos || []);
  let form = $state({ title: "", due: "", assignee: "" });
  let filter = $state("open");

  function add() {
    if (!form.title.trim()) return;
    up({ todos: [...todos, { id: uid(), title: form.title.trim(), due: form.due, assignee: form.assignee.trim(), done: false, createdAt: Date.now() }] });
    form = { title: "", due: "", assignee: form.assignee };
  }
  const patch = (id, p) => up({ todos: todos.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  function remove(id) {
    const t = todos.find((x) => x.id === id);
    up({ todos: todos.filter((x) => x.id !== id), trash: pushTrash(wd.data, "todo", t) });
  }

  const today = new Date(new Date().toDateString());
  const isOverdue = (t) => !t.done && t.due && new Date(t.due) < today;
  const doneCount = $derived(todos.filter((t) => t.done).length);

  const shown = $derived(
    todos
      .filter((t) => (filter === "open" ? !t.done : filter === "done" ? t.done : true))
      .slice()
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (!a.due && !b.due) return (a.createdAt || 0) - (b.createdAt || 0);
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.localeCompare(b.due);
      })
  );
</script>

<div class="grid gap-4">
  <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
    <Stat label="Tasks" value={todos.length} />
    <Stat label="Done" value={doneCount} tone={C.green} sub={todos.length ? `${Math.round((doneCount / todos.length) * 100)}% complete` : undefined} />
    <Stat label="Overdue" value={todos.filter(isOverdue).length} tone={todos.some(isOverdue) ? C.red : C.green} />
  </div>

  <Card>
    <div class="mb-3 wb-serif" style="font-size:20px;font-weight:600">Add a task</div>
    <div class="grid md:grid-cols-5 gap-3 items-end">
      <Field label="Task" className="md:col-span-2">
        <input class="wb-input" bind:value={form.title} placeholder="e.g. Book the photographer" onkeydown={(e) => e.key === "Enter" && add()} />
      </Field>
      <Field label="Due date">
        <input class="wb-input" type="date" bind:value={form.due} />
      </Field>
      <Field label="Handled by">
        <input class="wb-input" bind:value={form.assignee} placeholder="e.g. Aaron" />
      </Field>
      <div>
        <Btn onclick={add}>Add task</Btn>
      </div>
    </div>
  </Card>

  <div class="flex gap-2 flex-wrap">
    {#each [["open", "Open"], ["done", "Done"], ["all", "All"]] as [k, label] (k)}
      <button
        onclick={() => (filter = k)}
        style="padding:5px 12px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid {filter === k ? C.gold : C.line};background:{filter === k ? C.goldSoft : C.card};color:{filter === k ? C.gold : C.muted}"
      >
        {label}
      </button>
    {/each}
  </div>

  {#if shown.length === 0}
    <Card>
      <span style="color:{C.muted}">
        {todos.length === 0 ? "No tasks yet. Common first ones: book venue, confirm caterer, order invitations." : "Nothing here with this filter."}
      </span>
    </Card>
  {:else}
    <Card style="padding:14px">
      <div class="grid gap-2">
        {#each shown as t (t.id)}
          {@const overdue = isOverdue(t)}
          <div class="flex flex-wrap items-center gap-2 p-2" style="background:{t.done ? C.greenSoft : C.soft};border:1px solid {overdue ? C.red : C.line};border-radius:8px">
            <input
              type="checkbox"
              checked={!!t.done}
              onchange={(e) => patch(t.id, { done: e.target.checked })}
              style="width:18px;height:18px;accent-color:{C.green};cursor:pointer"
            />
            <span class="text-sm font-medium" style="text-decoration:{t.done ? 'line-through' : 'none'};color:{t.done ? C.muted : C.ink}">
              {t.title}
            </span>
            {#if t.assignee}<Pill>📋 {t.assignee}</Pill>{/if}
            {#if t.due}
              <Pill tone={t.done ? "neutral" : overdue ? "red" : "gold"}>
                {overdue ? "⚠️ " : "📅 "}{new Date(t.due).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
              </Pill>
            {/if}
            <div class="ml-auto flex items-center gap-2">
              <input class="wb-input" style="width:130px;padding:3px 8px;font-size:12px" type="date" value={t.due || ""} onchange={(e) => patch(t.id, { due: e.target.value })} />
              <Btn kind="danger" small onclick={() => remove(t.id)}>✕</Btn>
            </div>
          </div>
        {/each}
      </div>
    </Card>
  {/if}
</div>
