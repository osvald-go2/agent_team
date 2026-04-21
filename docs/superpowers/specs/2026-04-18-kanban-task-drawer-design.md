# Kanban Task Drawer — Design

**Date:** 2026-04-18
**Status:** Draft — awaiting user review

## Context

The Atelier prototype is a static, no-build React app (`index.html` + `.jsx` files transpiled in-browser). Its right panel has three views (Kanban / Graph / Roster). Today, clicking a Kanban card opens the generic `EntityDrawer` (from `CrudUI.jsx`) in view mode — fields-only, no conversation affordance, no notion of sub-steps.

We want to replace that click with a purpose-built **Task detail drawer** that mirrors how `AgentDrawer` is opened from the Graph view: a right slide-over with a tabbed body. The drawer has two tabs:

1. **Task** — task metadata header + a TODO-style sub-step checklist
2. **Chat** — an agent-grouped conversation log plus a rich composer with a working Send button

The Graph view's `AgentDrawer` (triggered from `onSelectAgent`) is the reference pattern: backdrop + drawer + header + tabs + scrollable body.

## Goals

- Replace `crud.openView(t)` on Kanban card click with a richer detail drawer
- Preserve existing edit / duplicate / delete paths via the card's `RowMenu`
- Add a mockable per-task TODO data model suitable for design iteration
- Render a Chat tab that matches the visual style of the reference screenshot: collapsible tool-call group blocks + a four-icon composer
- Keep the change scoped: no store refactor, no new build tooling, Roster / Canvas / AgentDrawer untouched

## Non-goals

- Real backend wiring or persistence (mutations stay in-memory; reload resets state — matches the rest of the prototype)
- Sharing chat state between the new drawer and Roster's `ThreadCard`
- File upload, voice, or "Import" composer affordances beyond visual stubs
- Keyboard shortcuts beyond Enter-to-send (and Shift+Enter newline)

## UX flow

### Trigger & presentation

- `onClick` on a Kanban card sets a new `selectedTaskId` in `App.jsx`
- The card's `RowMenu` (⋯) is unchanged — Edit / Duplicate / Delete still open the existing `EntityDrawer` via `useCrud`
- A `TaskDrawer` component renders when `selectedTaskId != null`, mirroring `AgentDrawer`: full-height right slide-over, ~560px wide (AgentDrawer is ~460px; the Chat tab needs more horizontal room for tool-group blocks)
- Reuses existing CSS: `drawer-backdrop`, `drawer`, `drawer-header` (or a sibling variant), `drawer-tabs`, `drawer-body`

### Close & switching

- Click backdrop / press ESC / click × closes the drawer (clears `selectedTaskId`)
- Clicking another Kanban card while open replaces content (no transition)
- If `selectedAgentId` is also set, the Task drawer layers above `AgentDrawer` (higher `z-index`); opening Task does not clear agent selection
- Clicking the agent pill inside the Task tab sets `selectedAgentId` **without** clearing `selectedTaskId` — `AgentDrawer` then layers above `TaskDrawer`. Closing `AgentDrawer` leaves `TaskDrawer` still open underneath

### Scope of state

- `selectedTaskId` lives on `App.jsx` alongside `selectedAgentId` so any future trigger (Roster, Canvas) can open the same drawer
- Existing `onSelectAgent` plumbing through `TeamView → Kanban` is duplicated for `onSelectTask`

## Data model

### `data.js` — add `todos` to each task

Shape:

```js
{ id: "t3", title: "Draft bounded contexts", agent: "domain-architect",
  status: "running", due: "10:10", priority: "P1",
  activity: "Drafting context map · 4/6 contexts",
  todos: [
    { id: "t3-1", text: "Extract entities from PRD", status: "done" },
    { id: "t3-2", text: "Identify aggregate roots", status: "done" },
    { id: "t3-3", text: "Draft payments context", status: "done" },
    { id: "t3-4", text: "Draft ledger context", status: "done" },
    { id: "t3-5", text: "Sketch integration seams", status: "doing" },
    { id: "t3-6", text: "Review with data-modeler", status: "todo" },
  ],
}
```

- Each todo has `{ id, text, status }` only — no priority, no due
- `status` is a three-value enum: `done | doing | todo`
- Mock distribution across the 12 seed tasks:
  - `done` task → all todos `done`
  - `running` task → leading `done`, one `doing`, trailing `todo`
  - `awaiting` task → has a `doing` whose text references the pending decision
  - `queued` task → all `todo`

### `CrudUI.jsx` / store

- No changes to `useEntityStore` — shallow-merge `update` handles the new field as-is
- Toggling a todo calls `store.update("tasks", taskId, { todos: newArray })`

### Chat messages

- Historical source: read-only `window.AppData.agentThreads[task.agent]`
- New messages: drawer-local state array, appended on Send, discarded on unmount
- **Not** shared with Roster's `threadState` — Roster stays task-scoped & summary-style; this drawer is richer but ephemeral

## Task tab layout

```
┌─────────────────────────────────────────────┐
│  [agent ico] domain-architect · Orchestrator│  ← agent pill (click → AgentDrawer)
│  ● running   due 10:10                      │  ← status badge + due
├─────────────────────────────────────────────┤
│  Drafting context map · 4/6 contexts        │  ← activity, italic muted
├─────────────────────────────────────────────┤
│  ✓ Extract entities from PRD                │
│  ✓ Identify aggregate roots                 │
│  ✓ Draft payments context                   │
│  ✓ Draft ledger context                     │
│  ◐ Sketch integration seams       doing     │  ← spinner + subtle highlight row
│  ○ Review with data-modeler                 │
│  [+ Add step]                               │  ← inline add (Enter to commit)
└─────────────────────────────────────────────┘
```

- **No progress bar**, **no priority badge** (per user decision)
- Reuses `todo-list` / `todo-items` / `todo-row` CSS; adds `.s-doing` / `.s-todo` variants. `.s-done` is shared between the existing agent-task status system (used by `AgentDrawer`'s `TaskTodoList`) and the new sub-step system — the check icon render is compatible, so sharing is intentional. `.s-running` / `.s-awaiting` / `.s-queued` are unaffected because sub-steps never take those values
- Clicking a checkbox cycles state: `todo → doing → done → todo` (clicking a `done` todo cycles it back to `todo` — no implicit bulk reset)
- Hovering a row reveals a right-aligned × to delete that step
- `[+ Add step]` expands into a textarea; Enter commits a new `{id, text, status:"todo"}` to `todos`. New todo ids use `` `${task.id}-${Date.now().toString(36)}` `` (same `Date.now().toString(36)` pattern `useEntityStore` uses for `create`)

## Chat tab layout

### Aggregation rule

Walk the message stream in order:

```
if role === "agent"  → flush current tool bucket, emit agent paragraph
if role === "tool"   → append to current tool bucket
if role === "user"   → flush bucket, emit user bubble
if role === "system" → flush bucket, emit centered system line
at end               → flush bucket
```

A "bucket" is a run of consecutive tool messages; on flush it becomes a single collapsible block whose header summarises the bucket by counting each distinct `tool` name.

### Tool → human-readable mapping

| `tool` value         | Label       |
|----------------------|-------------|
| `search`             | Searching   |
| `filesystem.read`    | Reading     |
| `filesystem.write`   | Editing     |
| `exec`               | Running     |
| `http.get`           | Fetching    |
| *(unknown)*          | *verbatim*  |

Header composition: join counted labels with `, `. Counts of 1 omit the `×N`. Examples:
- `[filesystem.read]` → `Reading`
- `[search, search]` → `Searching ×2`
- `[search, search, filesystem.read]` → `Searching ×2, Reading`

### Visual

```
┌─────────────────────────────────────────┐
│ ⚡  Searching ×2, Reading            ⌵  │   ← collapsed (default)
└─────────────────────────────────────────┘

Expanded: same header with ⌃, followed by one line per
tool call showing the underlying message `text` in the
mono font, allowed to wrap (no truncation) so outputs
like "doc.parse(pdf) → 312 blocks, 27 tables" stay
readable.
```

- Rounded pill header, subtle gray background, left lightning icon, right chevron
- Default state: collapsed
- Agent paragraphs render as plain text blocks (no bubble, no role tag) — matches the reference screenshot
- User messages render as right-aligned light bubbles
- System messages render as centered muted single lines
- Auto-scroll to bottom on mount and when messages change (reuse Roster's `scrollRef` pattern)
- Vertical rhythm: 12–14px between sibling paragraphs/blocks, 8px between a block header and its following paragraph

## Composer

### Layout

```
┌──────────────────────────────────────────────┐
│ Describe what you want to create...          │
│                                              │
│                                              │
│ [⚙] [📎] [||||] [Import]        [▷ Send]     │
└──────────────────────────────────────────────┘
```

- `textarea` — auto-grows between 2 and 6 rows
- Placeholder is status-dependent:
  - `done` task → *"Task complete — send a note for the record…"*
  - others → *"Send a message to {agent.name}…"*
- Left cluster: gear / paperclip / mic waveform / "Import" text button — all purely visual (click → `console.log`, no functionality)
- Right: Send button with `▷` icon, `disabled` when `draft.trim() === ""`
- Enter sends; Shift+Enter inserts a newline

### Send behaviour

Mirrors Roster's `ThreadCard`:

1. Append `{ id: ``${task.id}-u-${Date.now().toString(36)}``, role: "user", text, ts: "just now" }` to drawer-local messages
2. After 600ms, append `{ id: ``${task.id}-a-${Date.now().toString(36)}``, role: "agent", text: `Got it — incorporating your input into "${task.title}".`, ts: "just now" }`
3. Clear the draft, auto-scroll to bottom

Placeholder for `done` tasks reads *"Task complete — send a note for the record…"* (the earlier "reply to re-open" phrasing is dropped — status changes are explicitly out of scope).

Not done: changing `task.status`, writing into `agentThreads`, any real upload/voice/import wiring.

## Integration points

### New file

- `TaskDrawer.jsx` — sibling to `AgentDrawer.jsx`, responsible for header + tabs + `TaskTab` + `ChatTab` + composer

### `index.html` script order

Insert between `AgentDrawer.jsx` and `Pages.jsx`, matching the enforced load order in `CLAUDE.md`:

```html
<script type="text/babel" src="AgentDrawer.jsx"></script>
<script type="text/babel" src="TaskDrawer.jsx"></script>   <!-- new -->
<script type="text/babel" src="Pages.jsx"></script>
```

Bump the `?v=` query strings on `styles.css` and `data.js` to defeat CDN/browser caches.

### `App.jsx`

- `const [selectedTaskId, setSelectedTaskId] = React.useState(null);`
- `const selectedTask = selectedTaskId ? store.state.tasks.find(t => t.id === selectedTaskId) : null;`
- Pass `onSelectTask={setSelectedTaskId}` into `TeamView` (parallel to `onSelectAgent`)
- Render near the existing `AgentDrawer` conditional:

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

### `TeamView.jsx`

- `TeamView` accepts `onSelectTask`, passes it to `<Kanban>`
- Inside `Kanban`:
  - Signature gains `onSelectTask`
  - `.kcard` `onClick` changes from `() => crud.openView(t)` to `() => onSelectTask(t.id)`
  - `RowMenu`'s `onView` also switches to `onSelectTask(t.id)` (Edit / Duplicate / Delete still go through `crud`)
- `Canvas` and `Roster` unchanged

### `data.js`

- Add `todos: [...]` to each of the 12 seed tasks
- No other structural changes; the returned object from the IIFE is unchanged shape-wise

### `styles.css` — new selectors

- `.task-drawer-head` — header variant with agent pill + status badge + due (distinct from `.drawer-header` which assumes agent context)
- `.todo-row.s-doing`, `.todo-row.s-todo` — sub-step status variants (spinner-sm for doing, empty circle for todo)
- `.todo-add` — inline `+ Add step` control + expanded textarea state
- `.chat-toolblock`, `.chat-toolblock-head`, `.chat-toolblock-body`, `.chat-toolblock.collapsed` — collapsible tool group
- `.chat-paragraph` — agent plain-text paragraph
- `.chat-bubble.r-user` — user bubble (right-aligned)
- `.chat-system` — centered muted line
- `.chat-composer-rich` — composer with four left icons + right Send
- `.drawer.wide` — modifier that overrides `width` on top of the existing `.drawer` definition. `TaskDrawer` uses `<div className="drawer wide">...`; `AgentDrawer` is unchanged

No existing selectors are renamed or removed.

## Testing / verification

Being a no-build prototype with no test runner, verification is manual in a browser:

1. Serve with `python3 -m http.server 8000`
2. Open the Chat page (default), confirm Kanban cards show existing data
3. Click a `done` card → drawer opens with all todos checked, Chat tab shows grouped tool blocks, composer disabled text still allows Send
4. Click a `running` card → mixed todo states, progress reflects in checklist
5. Click a todo checkbox → state cycles, persisted through closing/reopening (until reload)
6. Click the × on a todo row → row removed
7. `+ Add step` → Enter commits a new todo
8. Expand a tool block → body reveals underlying tool message texts
9. Send a message → user bubble appears, 600ms later agent echo appears, composer clears, log scrolls
10. ESC / backdrop / × closes drawer
11. Re-open same task → local composer messages are gone (expected — drawer-local state)
12. Open an agent via the agent pill → `AgentDrawer` opens above; close it → `TaskDrawer` still visible
13. RowMenu Edit on a kanban card → old `EntityDrawer` still opens (path preserved)

## Open questions deferred to implementation

- Exact width (~560px) to be tuned visually against the kanban column widths
- Tool icon for unknown tools — fall back to a generic chip style
- Whether todo deletion needs a confirmation (leaning no — it's an in-memory prototype)
