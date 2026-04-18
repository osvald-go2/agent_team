# Kanban Task Drawer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Kanban card click's generic `EntityDrawer` with a purpose-built right-side `TaskDrawer` that has two tabs — Task (metadata + sub-step checklist) and Chat (tool-grouped log + rich composer).

**Architecture:** New `TaskDrawer.jsx` sibling to `AgentDrawer.jsx`, mounted from `App.jsx` via a new `selectedTaskId` state threaded through `TeamView → Kanban`. Data change: add a `todos: [{id, text, status}]` array to each task in `data.js`. Chat tab reads `AppData.agentThreads[task.agent]` and appends drawer-local messages. No new build tooling, no test runner, no store changes — mutations go through the existing `useEntityStore.update` shallow-merge.

**Tech Stack:** In-browser React 18 via CDN UMD + `@babel/standalone`. JSX files attached to `window`, loaded in order by `index.html`. Styling via plain CSS in `styles.css` keyed off `data-theme`.

**Source of truth:** `docs/superpowers/specs/2026-04-18-kanban-task-drawer-design.md`

**Repo-specific gotchas (from `CLAUDE.md`):**
- No `import/export` — each `.jsx` ends with `Object.assign(window, { Foo })` or `window.Foo = Foo`
- Script order in `index.html` is load-bearing — new files must slot in before any consumer
- Bump `?v=` query strings on `styles.css` / `data.js` when edited (cache busting)
- `_check/` reference screenshots and `uploads/` are **not** referenced from code — leave them alone
- Do NOT remove or rename `/*EDITMODE-BEGIN*/ ... /*EDITMODE-END*/` markers or the `postMessage` types in `App.jsx`
- No test runner, no lint, no typecheck — verification is **manual in a browser** after each task

**Serve locally:** `python3 -m http.server 8000` then hit `http://localhost:8000` and hard-reload (Cmd+Shift+R) after each edit.

---

## Chunk 1: Foundation

### Task 1: Add `todos` to every task in `data.js`

**Files:**
- Modify: `data.js:186-199` (the 12-task seed)
- Modify: `index.html:14` (`data.js?v=2` → `?v=3`)

**Why first:** TaskDrawer renders from `task.todos`; the component needs the field present to render anything meaningful. Pure data change is also the safest isolated commit.

- [ ] **Step 1: Add `todos` array to each of the 12 tasks**

Each todo is `{ id: "<taskId>-<n>", text: "<step>", status: "done" | "doing" | "todo" }`. Distribution rules from the spec:

- `done` task → all todos `done`
- `running` task → leading `done`, exactly one `doing`, trailing `todo`
- `awaiting` task → one todo in `doing` state whose text references the pending decision
- `queued` task → all todos `todo`

Use 3–6 todos per task. Concrete content for each:

```js
// t1 — done
todos: [
  { id: "t1-1", text: "Load PRD document",            status: "done" },
  { id: "t1-2", text: "Segment into user stories",    status: "done" },
  { id: "t1-3", text: "Tag stories by capability",    status: "done" },
  { id: "t1-4", text: "Emit requirements.json",       status: "done" },
],
// t2 — done
todos: [
  { id: "t2-1", text: "Sweep PRD for NFR terms",      status: "done" },
  { id: "t2-2", text: "Extract latency / SLO claims", status: "done" },
  { id: "t2-3", text: "Flag conflicts between NFRs",  status: "done" },
],
// t3 — running
todos: [
  { id: "t3-1", text: "Extract entities from PRD",    status: "done" },
  { id: "t3-2", text: "Identify aggregate roots",     status: "done" },
  { id: "t3-3", text: "Draft payments context",       status: "done" },
  { id: "t3-4", text: "Draft ledger context",         status: "done" },
  { id: "t3-5", text: "Sketch integration seams",     status: "doing" },
  { id: "t3-6", text: "Review with data-modeler",     status: "todo" },
],
// t4 — awaiting
todos: [
  { id: "t4-1", text: "Enumerate integration options",                  status: "done" },
  { id: "t4-2", text: "Compare sync vs async tradeoffs",                status: "done" },
  { id: "t4-3", text: "Awaiting your decision on sync vs async",        status: "doing" },
  { id: "t4-4", text: "Write ADR once decision is recorded",            status: "todo" },
],
// t5 — awaiting
todos: [
  { id: "t5-1", text: "Draft candidate partition keys",                 status: "done" },
  { id: "t5-2", text: "Awaiting confirmation on partition key choice",  status: "doing" },
  { id: "t5-3", text: "Lock schema v0",                                 status: "todo" },
],
// t6 — running
todos: [
  { id: "t6-1", text: "Gather ledger access patterns",    status: "done" },
  { id: "t6-2", text: "Compare range vs hash partitioning", status: "doing" },
  { id: "t6-3", text: "Recommend partition strategy",     status: "todo" },
],
// t7 — queued
todos: [
  { id: "t7-1", text: "Outline payments endpoints",       status: "todo" },
  { id: "t7-2", text: "Define request/response schemas",  status: "todo" },
  { id: "t7-3", text: "Draft OpenAPI spec",               status: "todo" },
],
// t8 — queued
todos: [
  { id: "t8-1", text: "List webhook events",              status: "todo" },
  { id: "t8-2", text: "Design retry / signing policy",    status: "todo" },
  { id: "t8-3", text: "Write contract doc",               status: "todo" },
],
// t9 — queued
todos: [
  { id: "t9-1", text: "Enumerate payment trust boundaries", status: "todo" },
  { id: "t9-2", text: "Identify STRIDE threats",            status: "todo" },
  { id: "t9-3", text: "Propose mitigations",                status: "todo" },
],
// t10 — queued
todos: [
  { id: "t10-1", text: "Estimate steady-state QPS",       status: "todo" },
  { id: "t10-2", text: "Derive SLO budgets",              status: "todo" },
  { id: "t10-3", text: "Draft cost model",                status: "todo" },
],
// t11 — queued
todos: [
  { id: "t11-1", text: "Assemble context + architecture sections", status: "todo" },
  { id: "t11-2", text: "Integrate ADRs and diagrams",              status: "todo" },
  { id: "t11-3", text: "Add risk & migration appendices",          status: "todo" },
],
// t12 — queued
todos: [
  { id: "t12-1", text: "Export context-map diagram",   status: "todo" },
  { id: "t12-2", text: "Export sequence diagrams",     status: "todo" },
  { id: "t12-3", text: "Bundle diagrams for doc",      status: "todo" },
],
```

- [ ] **Step 2: Bump `data.js?v=2` → `data.js?v=3` in `index.html`**

- [ ] **Step 3: Verify in browser**

Hard-reload. Open devtools console:

```js
window.AppData.tasks.map(t => [t.id, t.todos?.length, t.todos?.map(x => x.status)])
```

Expected: every task has a `todos` array matching the distribution above.

- [ ] **Step 4: Commit**

```bash
git add data.js index.html
git commit -m "data: add todos sub-steps to kanban tasks"
```

---

### Task 2: Create `TaskDrawer.jsx` shell (empty tabs, close wiring)

**Files:**
- Create: `TaskDrawer.jsx`
- Modify: `index.html:23-24` (insert line after `AgentDrawer.jsx`)

**Why:** Stand up the shell first so we can see the drawer open/close before adding content. This isolates layout bugs from content bugs.

- [ ] **Step 1: Create `TaskDrawer.jsx` with drawer shell**

```jsx
// Task drawer — per-task detail. Two tabs: Task (checklist) | Chat (thread + composer).
// Sibling to AgentDrawer.jsx; reuses drawer-* CSS and adds task-drawer-head + .drawer.wide.

function TaskDrawer({ task, store, agents, onClose, onSelectAgent }) {
  const [tab, setTab] = React.useState("task");

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!task) return null;
  const agent = agents.find(a => a.id === task.agent);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer wide">
        <div className="drawer-header task-drawer-head">
          <div className="tdh-title-wrap">
            <div className="tdh-title" title={task.title}>{task.title}</div>
            <div className="tdh-sub">
              {agent && (
                <button
                  className="tc-agent-pill"
                  onClick={() => onSelectAgent(agent.id)}
                  title={`Open ${agent.name}`}
                >
                  <span className="ag-ico" style={{ background: agent.color }}>
                    <Icon name={agent.icon} size={9} />
                  </span>
                  <span className="nm">{agent.name}</span>
                  <span className="role">{agent.role}</span>
                </button>
              )}
              <span className={"tc-status s-" + task.status}>
                {task.status === "running" && <span className="spinner-sm" />}
                {task.status === "awaiting" && <Icon name="alert" size={9} />}
                {task.status === "queued" && <Icon name="clock" size={9} />}
                {task.status === "done" && <Icon name="check" size={9} />}
                <span>{task.status}</span>
              </span>
              <span className="tc-due mono" title="Due">
                <Icon name="clock" size={9} /> {task.due}
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="drawer-tabs">
          <button className={tab === "task" ? "active" : ""} onClick={() => setTab("task")}>
            <Icon name="board" size={11} /> Task
          </button>
          <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
            <Icon name="chat" size={11} /> Chat
          </button>
        </div>

        <div className="drawer-body">
          {tab === "task" && <div className="muted small">Task tab (coming)</div>}
          {tab === "chat" && <div className="muted small">Chat tab (coming)</div>}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { TaskDrawer });
```

- [ ] **Step 2: Register in `index.html`** — insert the new script tag **after** `AgentDrawer.jsx` and **before** `Pages.jsx`:

```html
<script type="text/babel" src="AgentDrawer.jsx"></script>
<script type="text/babel" src="TaskDrawer.jsx"></script>
<script type="text/babel" src="Pages.jsx"></script>
```

- [ ] **Step 3: Verify file loads cleanly**

Hard-reload. Devtools console:

```js
typeof window.TaskDrawer
```

Expected: `"function"`. No parse errors in console.

The component isn't mounted yet; actual rendering verification comes in Task 3.

- [ ] **Step 4: Commit**

```bash
git add TaskDrawer.jsx index.html
git commit -m "task-drawer: add shell component (header, tabs, close, ESC)"
```

---

### Task 3: Wire `selectedTaskId` in `App.jsx`, thread `onSelectTask` through `TeamView` → `Kanban`

**Files:**
- Modify: `App.jsx` — anchor edits by nearby source, not line number (file drifts):
  - State: immediately after `const [selectedAgentId, setSelectedAgentId] = React.useState(null);`
  - Derived value: immediately after `const selectedTasks = selectedAgentId ? ...`
  - Mount: immediately after the `{selectedAgent && <AgentDrawer ... />}` block
  - Prop: inside the existing `<TeamView ... />` element
- Modify: `TeamView.jsx` — anchor by selector:
  - `Kanban` signature: the `function Kanban(...)` line
  - Card `onClick`: the `<div className="kcard" ... onClick={() => crud.openView(t)}` line
  - RowMenu's `onView` prop on that same card
  - `TeamView` signature: the `function TeamView(...)` line
  - The `{view === "kanban" && <Kanban .../>}` render line

**Why:** Open the drawer from kanban clicks. Keeps shell mount isolated from any internal drawer content.

- [ ] **Step 1: Add state + derived value in `App.jsx`**

Insert a new line just after `const [selectedAgentId, setSelectedAgentId] = React.useState(null);`:

```js
const [selectedTaskId, setSelectedTaskId] = React.useState(null);
```

Insert a derived value immediately after the `const selectedTasks = ...` line:

```js
const selectedTask = selectedTaskId ? store.state.tasks.find(t => t.id === selectedTaskId) : null;
```

- [ ] **Step 2: Pass `onSelectTask` through `TeamView`**

Inside the existing `<TeamView ... />` element, add the prop:

```jsx
<TeamView
  view={rightView}
  setView={setRightView}
  agents={store.state.agents}
  tasks={store.state.tasks}
  edges={D.edges}
  nodePos={D.nodePos}
  topologies={D.topologies}
  onSelectAgent={setSelectedAgentId}
  onSelectTask={setSelectedTaskId}   // new
  selectedId={selectedAgentId}
  onCollapse={() => setRightCollapsed(true)}
  store={store}
/>
```

- [ ] **Step 3: Mount `TaskDrawer` alongside `AgentDrawer`**

Insert immediately after the `{selectedAgent && <AgentDrawer .../>}` block:

```jsx
{selectedTask && (
  <TaskDrawer
    task={selectedTask}
    store={store}
    agents={store.state.agents}
    onClose={() => setSelectedTaskId(null)}
    onSelectAgent={setSelectedAgentId}
  />
)}
```

- [ ] **Step 4: Accept + pass `onSelectTask` in `TeamView.jsx`**

Change the `function TeamView(...)` signature:

```js
function TeamView({ view, setView, agents, tasks, edges, nodePos, topologies,
                   onSelectAgent, onSelectTask, selectedId, onCollapse, store }) {
```

Change the Kanban render line (`{view === "kanban" && <Kanban .../>}`):

```jsx
{view === "kanban" && <Kanban tasks={tasks} agents={agents}
  onSelectAgent={onSelectAgent} onSelectTask={onSelectTask} store={store} />}
```

- [ ] **Step 5: Accept + use `onSelectTask` in `Kanban`**

Change the `function Kanban(...)` signature:

```js
function Kanban({ tasks, agents, onSelectAgent, onSelectTask, store }) {
```

Change the `.kcard` `onClick` — from:

```jsx
<div className="kcard" key={t.id} onClick={() => crud.openView(t)} title={...}>
```

to:

```jsx
<div className="kcard" key={t.id} onClick={() => onSelectTask(t.id)} title={...}>
```

Change the RowMenu's `onView` prop on the same card — from:

```jsx
onView={() => crud.openView(t)}
```

to:

```jsx
onView={() => onSelectTask(t.id)}
```

**Leave `onEdit / onDuplicate / onDelete` on `crud` untouched.**

- [ ] **Step 6: Verify in browser**

Hard-reload.

1. Default page is `chat` with Kanban on right. Click a Kanban card (e.g. "Draft bounded contexts"). Expect: backdrop darkens + right drawer slides in with the task title, status pill, due, agent pill; two tabs "Task" / "Chat"; tab bodies show placeholder muted text.
2. Click the backdrop → drawer closes.
3. Open drawer again → press `Esc` → drawer closes.
4. Open drawer again → click the × in header → drawer closes.
5. Open drawer, click another kanban card → content swaps to the new task (no close/reopen flicker).
6. Click the ⋯ menu on a kanban card → Edit → the **old** `EntityDrawer` opens (regression check: edit path preserved).

- [ ] **Step 7: Commit**

```bash
git add App.jsx TeamView.jsx
git commit -m "task-drawer: open on kanban card click, close via backdrop/esc/x"
```

---

## Chunk 2: Task tab

### Task 4: Render the checklist (read-only)

**Files:**
- Modify: `TaskDrawer.jsx` (add a `TaskTab` sub-component and swap the placeholder)

**Why:** Display-first. Validates data-model ↔ rendering before adding mutation.

- [ ] **Step 1: Add `TaskTab` component in `TaskDrawer.jsx`** (before `Object.assign`):

```jsx
function TaskTab({ task, agent }) {
  const todos = task.todos || [];
  return (
    <div className="task-tab">
      {task.activity && (
        <div className="task-tab-activity">{task.activity}</div>
      )}
      <ul className="todo-items task-tab-todos">
        {todos.map(td => (
          <li key={td.id} className={"todo-row s-" + td.status}>
            <span className="todo-check" data-status={td.status}>
              {td.status === "done"  && <Icon name="check" size={11} />}
              {td.status === "doing" && <span className="spinner" />}
              {td.status === "todo"  && <span className="square" />}
            </span>
            <span className="todo-title">{td.text}</span>
            {td.status === "doing" && <span className="todo-tag">doing</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Swap the Task placeholder**

In the `<div className="drawer-body">` section, replace:

```jsx
{tab === "task" && <div className="muted small">Task tab (coming)</div>}
```

with:

```jsx
{tab === "task" && <TaskTab task={task} agent={agent} />}
```

- [ ] **Step 3: Verify**

Hard-reload. Open each status of kanban card:

- `done` (t1 "Parse PRD v1.3") → 4 rows, all struck-through, all with check icon
- `running` (t3 "Draft bounded contexts") → 4 done + 1 doing (spinner + highlight) + 1 todo (empty square)
- `awaiting` (t4) → includes one doing row whose text mentions "Awaiting your decision"
- `queued` (t7) → 3 todo rows, all empty squares

The `task.activity` line appears above the list on all tasks. No progress bar. No priority badge.

- [ ] **Step 4: Commit**

```bash
git add TaskDrawer.jsx
git commit -m "task-drawer: render read-only todo checklist in Task tab"
```

---

### Task 5: Checklist mutations — cycle, delete, add-step

**Files:**
- Modify: `TaskDrawer.jsx` (extend `TaskTab`)

- [ ] **Step 1: Add mutation helpers inside `TaskTab`**

Replace the `TaskTab` function body with:

```jsx
function TaskTab({ task, store }) {
  const todos = task.todos || [];
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const writeTodos = (next) => store.update("tasks", task.id, { todos: next });

  const cycle = (id) => {
    const order = { todo: "doing", doing: "done", done: "todo" };
    writeTodos(todos.map(td => td.id === id ? { ...td, status: order[td.status] } : td));
  };

  const remove = (id) => writeTodos(todos.filter(td => td.id !== id));

  const commitAdd = () => {
    const text = draft.trim();
    if (!text) { setAdding(false); return; }
    const id = `${task.id}-${Date.now().toString(36)}`;
    writeTodos([...todos, { id, text, status: "todo" }]);
    setDraft("");
    setAdding(false);
  };

  const onAddKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitAdd(); }
    if (e.key === "Escape") { e.preventDefault(); setAdding(false); setDraft(""); }
  };

  return (
    <div className="task-tab">
      {task.activity && <div className="task-tab-activity">{task.activity}</div>}

      <ul className="todo-items task-tab-todos">
        {todos.map(td => (
          <li key={td.id} className={"todo-row s-" + td.status}>
            <button
              className="todo-check-btn"
              onClick={() => cycle(td.id)}
              title={`Cycle status (${td.status})`}
            >
              <span className="todo-check" data-status={td.status}>
                {td.status === "done"  && <Icon name="check" size={11} />}
                {td.status === "doing" && <span className="spinner" />}
                {td.status === "todo"  && <span className="square" />}
              </span>
            </button>
            <span className="todo-title">{td.text}</span>
            {td.status === "doing" && <span className="todo-tag">doing</span>}
            <button
              className="todo-del"
              title="Remove step"
              onClick={() => remove(td.id)}
            >
              <Icon name="x" size={10} />
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="todo-add-row">
          <textarea
            autoFocus
            rows={1}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onAddKey}
            onBlur={commitAdd}
            placeholder="New step…"
          />
        </div>
      ) : (
        <button className="todo-add-btn" onClick={() => setAdding(true)}>
          <Icon name="plus" size={11} /> Add step
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the `<TaskTab />` call site** to pass `store` instead of `agent`:

```jsx
{tab === "task" && <TaskTab task={task} store={store} />}
```

- [ ] **Step 3: Verify**

Hard-reload. On a running task (t3):

1. Click the spinner on "Sketch integration seams" → it becomes done (check). Click again → becomes todo (square). Click again → back to doing.
2. Hover "Review with data-modeler" → × appears on the right. Click × → row disappears.
3. Click `+ Add step` → textarea appears, type "Verify edge cases", press Enter → new todo row appended with empty square.
4. Click `+ Add step` again → type "abc" → press Esc → input disappears, no row added.
5. Close the drawer → reopen the same card → all changes persist **until browser reload** (expected: store is in-memory).

- [ ] **Step 4: Commit**

```bash
git add TaskDrawer.jsx
git commit -m "task-drawer: add todo cycle/delete/add-step mutations"
```

---

### Task 6: Task tab CSS (s-doing, s-todo, drawer.wide, task-drawer-head, add/delete affordances)

**Files:**
- Modify: `styles.css` (anchor by selector — see steps below)
- Modify: `index.html` — bump `styles.css?v=17` → `?v=18`

- [ ] **Step 1: Append to `styles.css`**

Add a single new line immediately after the existing `.drawer { ... }` rule (the one with `width: 520px`):

```css
.drawer.wide { width: 560px; }
```

Add the following block at the end of the existing `.todo-row.s-queued { ... }` group (search the file for `.todo-row.s-queued` and append after the final rule in that cluster). The block is labelled clearly so it doesn't conflict with `AgentDrawer`'s `TaskTodoList`:

```css
/* ——— TaskDrawer: Task tab ——— */
.task-drawer-head { align-items: flex-start; }
.task-drawer-head .tdh-title-wrap { flex: 1; min-width: 0; }
.task-drawer-head .tdh-title {
  font-size: 14px; font-weight: 600; color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.task-drawer-head .tdh-sub {
  display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap;
}

.task-tab { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; }
.task-tab-activity {
  font-style: italic; color: var(--ink-3); font-size: 12.5px;
  padding: 8px 10px; background: var(--bg-sunken); border-radius: 6px;
}
.task-tab-todos { list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 4px; }

/* Sub-step status variants — reuse .s-done from the agent-task system intentionally. */
.task-tab-todos .todo-row.s-doing {
  background: color-mix(in oklch, var(--accent) 6%, transparent);
}
.task-tab-todos .todo-row.s-doing .todo-title { color: var(--ink); font-weight: 500; }
.task-tab-todos .todo-row.s-todo .todo-title { color: var(--ink-2); }

.task-tab-todos .todo-row .todo-check[data-status="doing"] {
  border-color: var(--accent); background: var(--accent-soft);
}
.task-tab-todos .todo-row .todo-check[data-status="todo"] {
  border-color: var(--line-strong);
}
.task-tab-todos .todo-row .todo-check[data-status="todo"] .square {
  display: none;
}

.task-tab-todos .todo-check-btn {
  background: none; border: none; padding: 0; cursor: pointer; display: grid; place-items: center;
}

.task-tab-todos .todo-tag {
  font-family: var(--font-mono); font-size: 10px; color: var(--accent);
  padding: 1px 5px; border-radius: 3px;
  background: color-mix(in oklch, var(--accent) 12%, transparent);
}

.task-tab-todos .todo-del {
  margin-left: auto; background: none; border: none; padding: 2px;
  color: var(--ink-4); cursor: pointer; opacity: 0;
  display: grid; place-items: center; border-radius: 4px;
}
.task-tab-todos .todo-row:hover .todo-del { opacity: 1; }
.task-tab-todos .todo-del:hover { color: var(--danger); background: var(--bg-sunken); }

.todo-add-btn {
  align-self: flex-start; background: none; border: 1px dashed var(--line-strong);
  border-radius: 6px; padding: 6px 10px; color: var(--ink-3); font-size: 12px;
  display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
}
.todo-add-btn:hover { color: var(--ink); border-color: var(--accent); }
.todo-add-row textarea {
  width: 100%; min-height: 32px; padding: 8px 10px; font-size: 12.5px;
  border: 1px solid var(--accent); border-radius: 6px;
  background: var(--panel); color: var(--ink); resize: none; font-family: inherit;
}
```

- [ ] **Step 2: Bump `styles.css?v=17` → `?v=18` in `index.html`** (change the `href="styles.css?v=N"` attribute — search for `styles.css?v=`)

- [ ] **Step 3: Verify**

Hard-reload. Open a running task.

- Drawer is noticeably wider than `AgentDrawer` (560 vs 520px).
- Activity line has muted italic text on a lighter background.
- `doing` row has a subtle blue tint + spinner + "doing" tag.
- `done` rows are struck through with ok-colored check.
- `todo` rows have an empty outlined circle (no inner square).
- Hover any row → × appears on the right, red on hover.
- `+ Add step` button shows as a dashed-border pill.
- Open `AgentDrawer` (via agent pill) — its tabs still look correct (regression check that shared `.s-done` didn't bleed).

- [ ] **Step 4: Commit**

```bash
git add styles.css index.html
git commit -m "task-drawer: style task tab (wide drawer, doing/todo states, add/delete)"
```

---

## Chunk 3: Chat tab

### Task 7: Pure aggregator — group consecutive tool messages

**Files:**
- Modify: `TaskDrawer.jsx` (add a helper function above `TaskDrawer`)

**Why:** Isolate the transformation logic from React rendering — easier to reason about.

- [ ] **Step 1: Add `buildChatItems` helper above `TaskDrawer`**

```jsx
// Tool name → human label. Unknown tools fall through to the verbatim name.
const TOOL_LABEL = {
  "search": "Searching",
  "filesystem.read": "Reading",
  "filesystem.write": "Editing",
  "exec": "Running",
  "http.get": "Fetching",
};

// Walk a message stream and fold consecutive tool messages into single blocks.
// Output items: { kind: 'tools' | 'agent' | 'user' | 'system', ... }
function buildChatItems(messages) {
  const items = [];
  let bucket = null;

  const flush = () => {
    if (!bucket) return;
    const counts = new Map();
    for (const m of bucket.messages) counts.set(m.tool, (counts.get(m.tool) || 0) + 1);
    const header = [...counts.entries()].map(([tool, n]) => {
      const label = TOOL_LABEL[tool] || tool;
      return n > 1 ? `${label} ×${n}` : label;
    }).join(", ");
    items.push({ kind: "tools", id: bucket.id, header, messages: bucket.messages });
    bucket = null;
  };

  messages.forEach((m, i) => {
    if (m.role === "tool") {
      if (!bucket) bucket = { id: `tools-${i}`, messages: [] };
      bucket.messages.push(m);
    } else if (m.role === "agent") {
      flush();
      items.push({ kind: "agent", id: m.id || `a-${i}`, text: m.text, ts: m.ts });
    } else if (m.role === "user") {
      flush();
      items.push({ kind: "user", id: m.id || `u-${i}`, text: m.text, ts: m.ts });
    } else {
      flush();
      items.push({ kind: "system", id: m.id || `s-${i}`, text: m.text, ts: m.ts });
    }
  });
  flush();
  return items;
}
```

- [ ] **Step 2: Verify**

No visual change yet; verify via devtools console after reloading:

```js
// At this stage `buildChatItems` is defined inside TaskDrawer.jsx closure.
// Smoke-test by opening the drawer and inspecting the stream data we will feed it.
window.AppData.agentThreads["domain-architect"]
```

Expected: array of `{ role, tool?, text }` — confirms the data shape the aggregator assumes.

- [ ] **Step 3: Commit**

```bash
git add TaskDrawer.jsx
git commit -m "task-drawer: add buildChatItems aggregator for tool-message folding"
```

---

### Task 8: Render `ChatTab` — blocks, paragraphs, user bubbles, system lines, auto-scroll

**Files:**
- Modify: `TaskDrawer.jsx` (add `ChatTab` + `ChatToolBlock`, swap placeholder)

- [ ] **Step 1: Add `ChatToolBlock` and `ChatTab` components**

```jsx
function ChatToolBlock({ item }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={"chat-toolblock " + (open ? "open" : "")}>
      <button className="chat-toolblock-head" onClick={() => setOpen(v => !v)}>
        <Icon name="bolt" size={11} />
        <span className="chat-tb-label">{item.header}</span>
        <Icon name="arrow" size={10} className="chev" />
      </button>
      {open && (
        <div className="chat-toolblock-body">
          {item.messages.map((m, i) => (
            <div key={i} className="chat-tb-line mono">{m.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatTab({ task, agent, localMsgs }) {
  const historical = (window.AppData?.agentThreads?.[task.agent]) || [];
  const merged = [...historical, ...localMsgs];
  const items = buildChatItems(merged);
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items.length]);

  return (
    <div className="chat-tab" ref={scrollRef}>
      {items.length === 0 && <div className="muted small">No activity yet.</div>}
      {items.map(item => {
        if (item.kind === "tools")  return <ChatToolBlock key={item.id} item={item} />;
        if (item.kind === "agent")  return <div key={item.id} className="chat-paragraph">{item.text}</div>;
        if (item.kind === "user")   return <div key={item.id} className="chat-bubble r-user">{item.text}</div>;
        if (item.kind === "system") return <div key={item.id} className="chat-system">{item.text}</div>;
        return null;
      })}
    </div>
  );
}
```

Icon names used here (`bolt`, `arrow`) are both confirmed present in `icons.jsx`. If you're working off a different branch and need to re-verify, use the Grep tool with pattern `^[[:space:]]+(bolt|arrow):` against `icons.jsx`.

- [ ] **Step 2: Swap the Chat placeholder + add local messages state to `TaskDrawer`**

Inside `TaskDrawer`, add a state line near the top:

```jsx
const [localMsgs, setLocalMsgs] = React.useState([]);
// Reset local messages when task changes
React.useEffect(() => { setLocalMsgs([]); }, [task.id]);
```

Replace:

```jsx
{tab === "chat" && <div className="muted small">Chat tab (coming)</div>}
```

with:

```jsx
{tab === "chat" && <ChatTab task={task} agent={agent} localMsgs={localMsgs} />}
```

- [ ] **Step 3: Verify**

Hard-reload. Open any task with history (e.g. a task whose agent is `domain-architect` or `prd-analyst`). Switch to the Chat tab.

- See tool-group blocks (collapsed by default, "⚡ Searching ×2, Reading" or similar).
- Click a block → expands inline, showing mono-font lines of the raw tool `text`.
- Agent paragraphs render as plain text blocks (no bubble).
- If the thread has no tool/user messages yet, the block won't render — that's expected.
- No console errors.

- [ ] **Step 4: Commit**

```bash
git add TaskDrawer.jsx
git commit -m "task-drawer: render grouped tool blocks + paragraphs in Chat tab"
```

---

### Task 9: Composer — textarea, four decorative icons, working Send with fake agent echo

**Files:**
- Modify: `TaskDrawer.jsx` (add `Composer` component, mount inside `ChatTab`'s parent, wire Send)

- [ ] **Step 1: Add `Composer` component**

```jsx
function Composer({ task, agent, draft, setDraft, onSend }) {
  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };
  const placeholder = task.status === "done"
    ? "Task complete — send a note for the record…"
    : `Send a message to ${agent?.name || "this task"}…`;
  return (
    <div className="chat-composer-rich">
      <textarea
        rows={2}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
      />
      <div className="chat-composer-tools">
        <button className="ctt-btn" title="Settings" onClick={() => console.log("settings")}>
          <Icon name="settings" size={12} />
        </button>
        <button className="ctt-btn" title="Attach" onClick={() => console.log("attach")}>
          <Icon name="paperclip" size={12} />
        </button>
        <button className="ctt-btn" title="Voice" onClick={() => console.log("voice")}>
          <Icon name="spark" size={12} />
        </button>
        <button className="ctt-btn ctt-text" title="Import" onClick={() => console.log("import")}>
          Import
        </button>
        <button
          className="ctt-send"
          onClick={onSend}
          disabled={!draft.trim()}
          title="Send (Enter)"
        >
          <Icon name="arrow" size={11} /> Send
        </button>
      </div>
    </div>
  );
}
```

Icon names used in this composer — `settings`, `paperclip`, `spark`, `arrow` — are all confirmed present in `icons.jsx`. `spark` stands in for "voice" since no `waveform`/`mic`/`zap`/`flash` icon exists in this set. If you want an alternative, `sparkle` is also available; otherwise add a new geometric path to `icons.jsx` in a small separate commit before Task 9 and note the substitution in the commit message.

- [ ] **Step 2: Wire Send from `TaskDrawer`**

In `TaskDrawer`, add:

```jsx
const [draft, setDraft] = React.useState("");
React.useEffect(() => { setDraft(""); }, [task.id]);

const sendMessage = () => {
  const text = draft.trim();
  if (!text) return;
  const now = Date.now().toString(36);
  const userMsg = { id: `${task.id}-u-${now}`, role: "user", text, ts: "just now" };
  setLocalMsgs(prev => [...prev, userMsg]);
  setDraft("");
  setTimeout(() => {
    const replyId = `${task.id}-a-${Date.now().toString(36)}`;
    setLocalMsgs(prev => [...prev, {
      id: replyId, role: "agent",
      text: `Got it — incorporating your input into "${task.title}".`,
      ts: "just now",
    }]);
  }, 600);
};
```

Render the composer **only on the Chat tab**, inside `drawer-body` but as a sibling of `ChatTab`:

```jsx
{tab === "chat" && (
  <>
    <ChatTab task={task} agent={agent} localMsgs={localMsgs} />
    <Composer task={task} agent={agent} draft={draft} setDraft={setDraft} onSend={sendMessage} />
  </>
)}
```

This requires a small CSS tweak: the Chat tab needs to scroll inside a flex child and the composer needs to be flex: none — handled in Task 10.

- [ ] **Step 3: Verify**

Hard-reload. Open any task, switch to Chat.

1. Composer visible at the bottom, textarea has status-aware placeholder.
2. Type "ping" and press Enter → right-aligned user bubble appears at the end of the log, textarea clears, ~600ms later an agent paragraph "Got it — incorporating your input into …" appears.
3. Send button is disabled when textarea is empty or whitespace.
4. Shift+Enter adds a newline, doesn't send.
5. Click gear / paperclip / mic / Import → devtools console logs the action; no other effect.
6. Switch to Task tab and back → the localMsgs still visible.
7. Close drawer, reopen same card → localMsgs cleared (expected: drawer-local state).

- [ ] **Step 4: Commit**

```bash
git add TaskDrawer.jsx
git commit -m "task-drawer: add rich composer with fake Send echo"
```

---

### Task 10: Chat tab CSS (blocks, paragraphs, bubbles, system lines, composer)

**Files:**
- Modify: `styles.css` (append new block)
- Modify: `index.html:10` (bump `?v=18` → `?v=19`)

- [ ] **Step 1: Append to `styles.css`**

```css
/* ——— TaskDrawer: Chat tab ——— */
.drawer-body { display: flex; flex-direction: column; min-height: 0; }
.chat-tab {
  flex: 1; min-height: 0; overflow: auto;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 12px;
}
.chat-tab .chat-paragraph {
  font-size: 13px; color: var(--ink); line-height: 1.55; white-space: pre-wrap;
}
.chat-tab .chat-bubble.r-user {
  align-self: flex-end; max-width: 80%;
  background: var(--bg-sunken); border: 1px solid var(--line);
  padding: 8px 12px; border-radius: 12px; font-size: 13px; color: var(--ink);
}
.chat-tab .chat-system {
  align-self: center; font-size: 11.5px; color: var(--ink-3); font-style: italic;
}

.chat-toolblock {
  border: 1px solid var(--line); border-radius: 10px;
  background: var(--bg-sunken); overflow: hidden;
}
.chat-toolblock-head {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: none; border: none; cursor: pointer;
  color: var(--ink-2); font-size: 12.5px; text-align: left;
}
.chat-toolblock-head .chev {
  margin-left: auto; transform: rotate(90deg); transition: transform 0.15s;
  color: var(--ink-4);
}
.chat-toolblock.open .chat-toolblock-head .chev { transform: rotate(-90deg); }
.chat-toolblock-head:hover { background: color-mix(in oklch, var(--ink) 3%, transparent); }
.chat-tb-label { font-weight: 500; color: var(--ink); }
.chat-toolblock-body {
  padding: 4px 12px 10px 32px; display: flex; flex-direction: column; gap: 4px;
  border-top: 1px dashed var(--line);
}
.chat-tb-line {
  font-size: 11.5px; color: var(--ink-3);
  white-space: pre-wrap; word-break: break-word; line-height: 1.45;
}

.chat-composer-rich {
  flex: none; border-top: 1px solid var(--line);
  padding: 10px 12px 12px; background: var(--panel);
  display: flex; flex-direction: column; gap: 8px;
}
.chat-composer-rich textarea {
  width: 100%; resize: none; min-height: 44px; max-height: 140px;
  padding: 8px 10px; font-size: 13px; font-family: inherit; color: var(--ink);
  background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
}
.chat-composer-rich textarea:focus { border-color: var(--accent); outline: none; }
.chat-composer-tools { display: flex; align-items: center; gap: 6px; }
.ctt-btn, .ctt-text {
  width: 28px; height: 28px; display: grid; place-items: center;
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px;
  color: var(--ink-3); cursor: pointer;
}
.ctt-btn:hover, .ctt-text:hover { color: var(--ink); border-color: var(--line-strong); }
.ctt-text { width: auto; padding: 0 10px; font-size: 11.5px; font-weight: 500; }
.ctt-send {
  margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
  padding: 0 14px; height: 28px; border-radius: 8px; border: none;
  background: var(--accent); color: white; font-size: 12px; font-weight: 500; cursor: pointer;
}
.ctt-send:disabled { background: color-mix(in oklch, var(--accent) 35%, var(--panel)); cursor: not-allowed; }
```

- [ ] **Step 2: Bump `styles.css?v=18` → `?v=19`**

- [ ] **Step 3: Verify**

Hard-reload. Open a task with tool history (e.g. t3). Chat tab:

- Drawer body is split: scrollable chat region on top, composer pinned at bottom.
- Scroll behaviour: initially scrolled to the bottom (newest). Scroll up to see older blocks.
- Tool block header shows lightning + label + right chevron. Click → expands smoothly; body has dashed top border and indented mono lines.
- User bubble is right-aligned with a soft gray background.
- Composer matches the reference screenshot: textarea on top, 4 small square-ish buttons + "Import" pill + right-aligned pink/accent Send button with ▷.
- Send disabled-state is visibly dimmer.

- [ ] **Step 4: Commit**

```bash
git add styles.css index.html
git commit -m "task-drawer: style chat tab (tool blocks, bubbles, composer)"
```

---

## Chunk 4: Polish & final verification

### Task 11: AgentDrawer layering + regression sweep

**Files:**
- None expected — this is a verification-only task unless a bug surfaces.

- [ ] **Step 1: Verify agent pill opens AgentDrawer without closing TaskDrawer**

1. Open a kanban card → `TaskDrawer` visible.
2. Click the agent pill in the header → `AgentDrawer` opens **on top** (higher z-index) showing that agent's Thread / Tasks / etc.
3. Close `AgentDrawer` (× or backdrop) → `TaskDrawer` still visible beneath (state preserved).
4. Close `TaskDrawer` → everything clears.

If `AgentDrawer` appears behind `TaskDrawer` or the pill click closes the task drawer, fix z-index on `.drawer.wide` (add `z-index: 52` vs `.drawer`'s `51`) and/or confirm the pill handler passes only `setSelectedAgentId`, not a closer.

- [ ] **Step 2: Regression sweep of sibling components**

1. Graph view: click a canvas node → `AgentDrawer` still opens normally.
2. Roster view: task cards still render, composer still sends local echo, terminate still works.
3. Kanban RowMenu (⋯) → Edit / Duplicate / Delete still open the generic `EntityDrawer`.
4. `AgentDrawer`'s Task tab (the original `TaskTodoList`) still renders correctly — verifies shared `.s-done` didn't bleed.

- [ ] **Step 3: Commit only if fixes were required**

```bash
# Only if z-index or other fix was needed:
git add <files>
git commit -m "task-drawer: layer above AgentDrawer / fix <specific issue>"
```

---

### Task 12: End-to-end spec verification checklist

Run the full checklist from `docs/superpowers/specs/2026-04-18-kanban-task-drawer-design.md` §"Testing / verification". Each item is already listed as a verification step in earlier tasks; this is a final consolidated run-through after everything's merged.

- [ ] 1. `python3 -m http.server 8000` → open `http://localhost:8000` → Chat page loads, Kanban populated
- [ ] 2. Click a `done` card → all todos checked, Chat shows grouped blocks, composer reachable
- [ ] 3. Click a `running` card → mixed todo states render correctly
- [ ] 4. Cycle a todo through `todo → doing → done → todo`
- [ ] 5. Delete a todo via hover ×
- [ ] 6. Add a step via `+ Add step` → Enter commits, Esc cancels
- [ ] 7. Expand / collapse a tool block
- [ ] 8. Send a message → user bubble + 600ms agent echo → scroll follows
- [ ] 9. ESC / backdrop / × all close the drawer
- [ ] 10. Re-open same task → local composer messages gone, todo mutations persist (until full reload)
- [ ] 11. Agent pill opens `AgentDrawer` above; closing it leaves `TaskDrawer` visible
- [ ] 12. Kanban RowMenu → Edit opens the original `EntityDrawer`

If any fails, fix in a focused commit before declaring done.

- [ ] **Final commit** (only if any fix landed during verification):

```bash
git add <files>
git commit -m "task-drawer: address verification findings"
```

---

## Summary

File inventory after all chunks:

| File | Change |
|------|--------|
| `data.js` | `todos` added to 12 tasks |
| `TaskDrawer.jsx` | **new** — shell, Task tab, Chat tab, composer, aggregator |
| `index.html` | register `TaskDrawer.jsx`, bump `data.js?v=3`, `styles.css?v=19` |
| `App.jsx` | add `selectedTaskId` state, mount `TaskDrawer`, thread `onSelectTask` |
| `TeamView.jsx` | accept + pass `onSelectTask`; Kanban card click + RowMenu.onView route through it |
| `styles.css` | `.drawer.wide`, task-tab styles, chat-toolblock, chat bubbles, composer |

Explicit non-changes: `AgentDrawer.jsx`, `Roster` / `ThreadCard` / `Canvas`, `CrudUI.jsx`, `Pages.jsx`, `Chat.jsx`.
