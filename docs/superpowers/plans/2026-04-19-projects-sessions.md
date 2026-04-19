# Projects & Sessions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce Project and Session entities so Atelier can group multiple sessions per requirement category, plus a Dashboard landing page with Quickstart presets, plus Claude-style chat message polish. See `docs/superpowers/specs/2026-04-19-projects-sessions-design.md`.

**Architecture:** Flat data + `sessionId` filter (path A from brainstorming). `window.AppData` gains `projects[]` and `sessions[]`; every per-session record (`conversation`, `tasks`, `edges`, `approvals`) gains a `sessionId` field; `nodePos` and `agentThreads` get a `sessionId` outer key. `App.jsx` holds `currentProjectId` / `currentSessionId` state; a `sliceBySession` selector derives per-session data and threads it to existing components. Business cards in `Chat.jsx` are preserved; only the text-message body and Composer are restyled.

**Tech Stack:** Static no-build React 18 + `@babel/standalone` (transpiled in-browser). No bundler, no test runner, no linter, no TypeScript.

**Verification discipline — read before starting:**
- This codebase has **no automated tests**. Every "verify" step is a manual browser check.
- After every edit to `data.js` or `styles.css`, bump the `?v=` query string in `index.html` (current: `data.js?v=4`, `styles.css?v=24`) so the browser reloads fresh content. After every edit to a `.jsx` file, a plain hard-reload (Cmd+Shift+R / Ctrl+Shift+R) is enough because `.jsx` URLs are not cache-busted.
- Serve the directory with `python3 -m http.server 8000` from `/Users/lion268li/repos/toutiao/app/agent_team/` and open `http://localhost:8000/` in a browser. Keep the server running across all tasks.
- Open DevTools Console on load — any syntax error surfaces there. A blank white page almost always means a JSX parse error.
- Every task ends with a commit. Commit messages follow the repo's existing imperative style (see recent `git log`).

---

## File Map

**New files:**
- `Dashboard.jsx` — top-level All Projects page with `NewProjectForm`, `RecentProjects`, `QuickstartRow`. Attaches `Dashboard` + `QUICKSTART_PRESETS` to `window`.

**Modified files:**
- `data.js` — add `projects`, `sessions`; add `sessionId` to `conversation/tasks/edges/approvals`; restructure `nodePos` and `agentThreads`; drop `history`.
- `CrudUI.jsx` — replace `history` seed with `projects/sessions/conversation`; add `sliceBySession` selector; add `createProject / createSession / archive* / rename* / deleteProject / deleteSession` helpers on the store.
- `Shell.jsx` — rename sidebar `History` item to `Sessions`; rewrite `Topbar` crumb with 🏠 icon + two popovers (new `CrumbPopover` inside this file); accept `projectName` / `sessionName` props instead of hard-coded `"Lighthouse"`.
- `App.jsx` — add `currentProjectId / currentSessionId` state (with localStorage + stale-id fallback); compute `slice = sliceBySession(...)` per render; thread slice fields into `ChatArea` / `TeamView` / `AgentDrawer`; add `page="dashboard"` branch; adjust session-switch reset rules.
- `Chat.jsx` — rewrite `MessageBubble` with borderless labeled layout + chip support; add `InlineNotice`; redesign `Composer` icon strip + `Send` button; business cards untouched.
- `TeamView.jsx` — change `Roster threads={window.AppData?.agentThreads || {}}` to consume the already-scoped `threads` map from a new prop.
- `TaskDrawer.jsx` — change `ChatTab` line 201 lookup from `agentThreads[task.agent]` to `agentThreads[task.sessionId]?.[task.agent]`.
- `Pages.jsx` — remove `HistoryPage` component and its `window` export.
- `index.html` — add `<script type="text/babel" src="Dashboard.jsx">` between `Pages.jsx` and `DetailShell.jsx`; bump `data.js` and `styles.css` versions on every data/CSS change.
- `styles.css` — add styles for labeled messages, chips, `InlineNotice`, `CrumbPopover`, Dashboard layout, Quickstart row, recent-project cards, composer icon strip.

---

## Chunk 1: Data model refactor (invariant: app still renders Lighthouse correctly)

The goal of this chunk is to reshape the data so every per-session record carries a `sessionId`, without changing any user-visible behavior. After every task in this chunk, hard-reload and confirm the chat area + kanban look identical to what they did before you started.

### Task 1: Add `projects` and `sessions` collections to `data.js`

**Files:**
- Modify: `data.js` (end of the IIFE, before `return`)
- Modify: `index.html` (bump `data.js?v=4` → `data.js?v=5`)

- [ ] **Step 1: Read `data.js` end-to-end so you know what fields already exist on `history`.**

The existing `history` array (around line 394) has: `{ id, name, when, status, agents, turns, duration }`. You will keep this shape on `sessions` and add a few fields.

- [ ] **Step 2: Add `projects` and `sessions` arrays before `return`.**

Insert just above the `return { agents, skills, ... }` line:

```js
const projects = [
  {
    id: "proj-lighthouse",
    name: "Lighthouse",
    description: "Core PRD → Technical Design workstream.",
    icon: "cube",
    color: "oklch(0.75 0.12 40)",
    defaultTemplateId: "tpl-prd2tech",
    status: "active",
    created: "2026-04-10",
    lastActive: "Now",
  },
  {
    id: "proj-ai-report",
    name: "AI Report Templates",
    description: "AI-assisted reporting template library.",
    icon: "doc-code",
    color: "oklch(0.72 0.13 230)",
    defaultTemplateId: "tpl-data",
    status: "active",
    created: "2026-04-12",
    lastActive: "Yesterday",
  },
  {
    id: "proj-pricing",
    name: "Pricing v2 GTM",
    description: "Pricing redesign go-to-market plan.",
    icon: "grid",
    color: "oklch(0.72 0.13 150)",
    defaultTemplateId: "tpl-launch",
    status: "active",
    created: "2026-04-05",
    lastActive: "2d ago",
  },
  {
    id: "proj-outage",
    name: "P0 Outage Reviews",
    description: "Post-mortem and RCA workstream.",
    icon: "alert",
    color: "oklch(0.68 0.15 25)",
    defaultTemplateId: "tpl-bugfix",
    status: "active",
    created: "2026-03-28",
    lastActive: "1w ago",
  },
];

const sessions = [
  // proj-lighthouse — the currently running session keeps the old name/id pattern
  { id: "sess-lighthouse-01", projectId: "proj-lighthouse", name: "Lighthouse — PRD to Tech Design", status: "running", agents: 6, turns: 14, duration: "12m", when: "Now",       createdBy: "Lin Chen" },
  { id: "sess-lighthouse-02", projectId: "proj-lighthouse", name: "Mobile auth refactor review",     status: "idle",    agents: 4, turns: 11, duration: "41m", when: "2d ago",   createdBy: "Lin Chen" },

  // proj-ai-report
  { id: "sess-ai-01", projectId: "proj-ai-report", name: "Q1 earnings report draft", status: "idle",     agents: 3, turns: 9, duration: "28m", when: "Yesterday", createdBy: "Lin Chen" },
  { id: "sess-ai-02", projectId: "proj-ai-report", name: "Weekly status digest",     status: "archived", agents: 3, turns: 7, duration: "21m", when: "1w ago",    createdBy: "Lin Chen" },

  // proj-pricing
  { id: "sess-pricing-01", projectId: "proj-pricing", name: "Pricing v2 — GTM Launch plan", status: "idle",     agents: 4, turns: 22, duration: "1h 04m", when: "Yesterday", createdBy: "Lin Chen" },
  { id: "sess-pricing-02", projectId: "proj-pricing", name: "Competitor matrix Q2",         status: "idle",     agents: 5, turns: 18, duration: "52m",    when: "3d ago",    createdBy: "Lin Chen" },
  { id: "sess-pricing-03", projectId: "proj-pricing", name: "Checkout perf audit",          status: "idle",     agents: 4, turns: 16, duration: "36m",    when: "1w ago",    createdBy: "Lin Chen" },

  // proj-outage
  { id: "sess-outage-01", projectId: "proj-outage", name: "P0 Outage — RCA draft", status: "idle",     agents: 3, turns: 9, duration: "28m", when: "Yesterday", createdBy: "Lin Chen" },
  { id: "sess-outage-02", projectId: "proj-outage", name: "Data model — Billing v3", status: "archived", agents: 3, turns: 4, duration: "8m",  when: "5d ago",    createdBy: "Lin Chen" },
];
```

- [ ] **Step 3: Export them from the IIFE.**

Change the final `return` line to include `projects` and `sessions`:

```js
return { agents, skills, knowledge, templates, projects, sessions, conversation, tasks, edges, nodePos, topologies, agentThreads, approvals, history };
```

(Do **not** drop `history` yet — later tasks still read it. It gets removed in Task 5.)

- [ ] **Step 4: Bump cache version in `index.html`.**

Change `<script src="data.js?v=4"></script>` to `?v=5`.

- [ ] **Step 5: Hard-reload and verify no regression.**

Open `http://localhost:8000/`. Expected: app loads, chat shows the Lighthouse conversation, kanban shows tasks. DevTools Console should be clean. Nothing visually changed — you only added data.

- [ ] **Step 6: Commit.**

```bash
git add data.js index.html
git commit -m "data: add projects and sessions collections (no consumers yet)"
```

---

### Task 2: Add `sessionId` to `conversation` / `tasks` / `edges` / `approvals`

All existing records become part of `sess-lighthouse-01`. This is the mapping that preserves current behavior: after this task, the app still shows the same Lighthouse session, just now with every record stamped.

**Files:**
- Modify: `data.js` (arrays `conversation`, `tasks`, `edges`, `approvals`)
- Modify: `index.html` (bump `data.js?v=5` → `?v=6`)

- [ ] **Step 1: Add `sessionId: "sess-lighthouse-01"` to every object in each of the four arrays.**

Open each array and add the field. For any record whose text references an older session (e.g. the `history`-like approval on a different theme), still stamp `sess-lighthouse-01` — correctness of thematic attribution is not a goal of this task; only uniform coverage.

For `approvals`, this includes all 6 items. For `edges`, all rows. For `conversation`, every message. For `tasks`, every row in the kanban.

Use search+replace carefully: a regex like `^\s*\{ id: "` in each array can help you visit each record.

- [ ] **Step 2: Bump cache version in `index.html`.**

`data.js?v=5` → `?v=6`.

- [ ] **Step 3: Hard-reload and verify no regression.**

Chat still renders, kanban still shows the same tasks, approvals still count 4 in the sidebar. Console clean.

- [ ] **Step 4: Commit.**

```bash
git add data.js index.html
git commit -m "data: tag conversation/tasks/edges/approvals with sessionId"
```

---

### Task 3: Restructure `nodePos` and `agentThreads` to be keyed by `sessionId`

**Files:**
- Modify: `data.js`
- Modify: `index.html` (bump `data.js?v=6` → `?v=7`)

- [ ] **Step 1: Find `nodePos` (around the topologies/edges area) and wrap the existing object as the value under `sess-lighthouse-01`.**

Before:

```js
const nodePos = {
  "prd-analyst": { x: 80, y: 100 },
  // ...
};
```

After:

```js
const nodePos = {
  "sess-lighthouse-01": {
    "prd-analyst": { x: 80, y: 100 },
    // ...
  },
};
```

- [ ] **Step 2: Find `agentThreads` and wrap the existing object the same way.**

Before:

```js
const agentThreads = {
  "prd-analyst": [ /* messages */ ],
  "domain-architect": [ /* messages */ ],
};
```

After:

```js
const agentThreads = {
  "sess-lighthouse-01": {
    "prd-analyst": [ /* messages */ ],
    "domain-architect": [ /* messages */ ],
  },
};
```

- [ ] **Step 3: Bump cache version in `index.html`.**

`data.js?v=6` → `?v=7`.

- [ ] **Step 4: Hard-reload. This will visibly break `TeamView` Roster and `TaskDrawer` Chat tab — expected.**

Open canvas/roster view in the right panel → agent cards will render but message seeds may be empty. Open any task in the kanban → TaskDrawer's Chat tab will be empty / missing historical messages. This is intentional; the next tasks fix the consumers.

Do NOT commit yet if the console has unhandled errors. If it does (e.g. `Cannot read properties of undefined`), fix the consumers **in this same commit** — but ideally the pre-existing `|| []` / `|| {}` fallbacks in consumers mean the app degrades gracefully without throwing. Check `TaskDrawer.jsx:201` (`(window.AppData?.agentThreads?.[task.agent]) || []`) — this returns `[]` for the new shape, which is fine (empty thread, no throw). Check `TeamView.jsx:642` (`window.AppData?.agentThreads || {}`) — returns the full outer map, Roster then does `threads[task.agent]` which is undefined → `base.slice` would throw. See Step 5.

- [ ] **Step 5: If Step 4 surfaced a throw in Roster, temporarily guard at `TeamView.jsx:343`:**

```js
const base = (threads && threads[task.agent]) || [];
```

is the existing line — it already handles the missing key case. If it still throws, inspect the error. Most likely the app degrades silently to empty seeds — acceptable for this commit.

- [ ] **Step 6: Commit.**

```bash
git add data.js index.html
git commit -m "data: nest nodePos and agentThreads under sessionId"
```

---

### Task 4: Update consumers of `agentThreads` and `nodePos` to scope by session

After this task, the app renders exactly as it did before Task 3.

**Files:**
- Modify: `App.jsx:148` (the `selectedThread` line)
- Modify: `TeamView.jsx:642` (the `Roster threads=...` line)
- Modify: `TaskDrawer.jsx:201` (the `ChatTab` historical lookup)
- Modify: any direct read of `D.nodePos` in `TeamView.jsx` / `Canvas` — search for `nodePos` to locate

- [ ] **Step 1: Fix `App.jsx:148`.**

Before:

```js
const selectedThread = selectedAgentId ? (D.agentThreads[selectedAgentId] || []) : [];
```

After (still this task — we're using the current hard-coded Lighthouse session id because currentSessionId state doesn't exist yet; Chunk 2 will generalize):

```js
const LIGHTHOUSE_SESSION_ID = "sess-lighthouse-01"; // TEMP until Chunk 2 introduces currentSessionId
const selectedThread = selectedAgentId ? (D.agentThreads[LIGHTHOUSE_SESSION_ID]?.[selectedAgentId] || []) : [];
```

- [ ] **Step 2: Fix `TeamView.jsx:642`.**

Before:

```jsx
{view === "roster" && <Roster agents={agents} tasks={tasks} threads={window.AppData?.agentThreads || {}} onSelectAgent={onSelectAgent} store={store} />}
```

After:

```jsx
{view === "roster" && <Roster agents={agents} tasks={tasks} threads={window.AppData?.agentThreads?.["sess-lighthouse-01"] || {}} onSelectAgent={onSelectAgent} store={store} />}
```

The `"sess-lighthouse-01"` literal is temporary — Chunk 2 replaces it with a `currentSessionId` prop.

- [ ] **Step 3: Fix `TaskDrawer.jsx:201`.**

Before:

```js
const historical = (window.AppData?.agentThreads?.[task.agent]) || [];
```

After:

```js
const historical = (window.AppData?.agentThreads?.[task.sessionId]?.[task.agent]) || [];
```

Every `task` now has `sessionId` (Task 2), so this resolves correctly.

- [ ] **Step 4: Search for any other `nodePos` / `agentThreads` reads.**

Run:
```bash
grep -rn "agentThreads\|nodePos" *.jsx
```
Fix anything you missed. Likely locations: `TeamView.jsx` `Canvas` reads `nodePos` for layout — change `D.nodePos["prd-analyst"]` style reads to `D.nodePos["sess-lighthouse-01"]?.["prd-analyst"]`, or equivalent. Leave literal `"sess-lighthouse-01"` for now.

- [ ] **Step 5: Hard-reload and verify parity with pre-Task-3 behavior.**

- Chat panel: Lighthouse messages render
- Kanban: tasks render as before
- Canvas: agent nodes positioned as before
- Roster: agent cards with seeded thread text render
- Click a task → TaskDrawer Chat tab shows historical messages
- Click an agent in canvas → AgentDrawer shows thread

Console clean.

- [ ] **Step 6: Commit.**

```bash
git add App.jsx TeamView.jsx TaskDrawer.jsx
git commit -m "refactor: scope agentThreads and nodePos reads to sess-lighthouse-01 (temp)"
```

---

### Task 5: Replace `history` seed in `useEntityStore` with `projects` / `sessions` / `conversation`

`CrudUI.jsx` currently seeds `history: [...D.history]`. That mapping disappears and is replaced with the new per-session entities. `conversation` also moves into the store so new sessions can append messages.

**Files:**
- Modify: `CrudUI.jsx` (`useEntityStore` around line 10)

- [ ] **Step 1: Replace the initial state object (keep `history` alongside, temporarily).**

Before:

```js
const [state, setState] = React.useState(() => ({
  agents: [...D.agents],
  skills: [...D.skills],
  knowledge: [...D.knowledge],
  templates: [...D.templates],
  history: [...D.history],
  approvals: [...D.approvals],
  tasks: [...D.tasks],
}));
```

After:

```js
const [state, setState] = React.useState(() => ({
  agents:       [...D.agents],
  skills:       [...D.skills],
  knowledge:    [...D.knowledge],
  templates:    [...D.templates],
  projects:     [...D.projects],
  sessions:     [...D.sessions],
  approvals:    [...D.approvals],
  tasks:        [...D.tasks],
  conversation: [...D.conversation],
  history:      [...D.history],   // TEMP — retained until Task 14 deletes HistoryPage and the history array
}));
```

**Why keep `history` for now:** `Pages.jsx:454` does `store.state.history` and `useCrud("history", store)`. If you drop the slice now, clicking Sessions in the sidebar (which Task 9 routes to `HistoryPage` as a stopgap) throws. Task 14 removes both `HistoryPage` and this temporary line atomically.

- [ ] **Step 2: Verify no OTHER consumer reads `store.state.history` or calls `useCrud("history", ...)`.**

```bash
grep -rn 'state\.history\|useCrud("history"' *.jsx
```

Expected exactly two hits: `Pages.jsx:454` and `Pages.jsx:455`. If the grep returns more, list them — any new consumer needs the same stopgap treatment until Task 14.

- [ ] **Step 3: Hard-reload and verify.**

- Sidebar click "History" → page renders (using sessions data now).
- No console errors.
- Every other page (Agents, Skills, KB, Templates, Approvals, Main Session) unaffected.

- [ ] **Step 4: Commit.**

```bash
git add CrudUI.jsx Pages.jsx
git commit -m "refactor: move projects/sessions/conversation into entity store; history → sessions"
```

---

### Task 6: Add `sliceBySession` selector to `CrudUI.jsx`

**Files:**
- Modify: `CrudUI.jsx` (append before the `Object.assign(window, ...)` at file end)

- [ ] **Step 1: Append the selector.**

```js
/* ——— sliceBySession —————————————————————————————————————————
 * Derive a per-session view of all per-session collections.
 * Chunk 1 installs it; Chunk 2 wires consumers.
 */
function sliceBySession(D, store, sessionId) {
  if (!sessionId) {
    return { conversation: [], tasks: [], edges: [], nodePos: {}, approvals: [] };
  }
  return {
    conversation: store.state.conversation.filter(m => m.sessionId === sessionId),
    tasks:        store.state.tasks.filter(t => t.sessionId === sessionId),
    edges:        D.edges.filter(e => e.sessionId === sessionId),
    nodePos:      D.nodePos[sessionId] || {},
    approvals:    store.state.approvals.filter(a => a.sessionId === sessionId),
  };
}
```

- [ ] **Step 2: Export it on `window`.**

Find the existing `Object.assign(window, { useEntityStore, ... })` line and add `sliceBySession`:

```js
Object.assign(window, { useEntityStore, useCrud, Drawer, ConfirmDialog, RowMenu, sliceBySession });
```

- [ ] **Step 3: Hard-reload and confirm no regression.**

Nothing consumes `sliceBySession` yet — this is a pure addition. App should render exactly as before.

- [ ] **Step 4: Commit.**

```bash
git add CrudUI.jsx
git commit -m "feat: add sliceBySession selector (unused)"
```

---

### Task 7: Add store helpers for project/session CRUD with cascades

**Files:**
- Modify: `CrudUI.jsx` (inside `useEntityStore`, after existing `create/update/remove/duplicate`)

- [ ] **Step 1: Implement the helpers.**

Insert just before the `return` of `useEntityStore`:

```js
const createProject = React.useCallback(({ name, description, defaultTemplateId, icon, color }) => {
  const projectId = `proj-${Date.now().toString(36)}`;
  const sessionId = `sess-${Date.now().toString(36)}`;
  const now = "Now";
  setState(s => ({
    ...s,
    projects: [
      {
        id: projectId,
        name: name || "Untitled project",
        description: description || "",
        icon: icon || "cube",
        color: color || "oklch(0.72 0.13 80)",
        defaultTemplateId: defaultTemplateId || null,
        status: "active",
        created: now,
        lastActive: now,
      },
      ...s.projects,
    ],
    sessions: [
      {
        id: sessionId,
        projectId,
        name: `${name || "Untitled"} · Session 1`,
        status: "draft",
        agents: 0, turns: 0, duration: "0m", when: now,
        createdBy: "Lin Chen",
      },
      ...s.sessions,
    ],
    conversation: [
      { id: `msg-${sessionId}-0`, sessionId, role: "system", text: "Team ready — describe what you want to work on." },
      ...s.conversation,
    ],
  }));
  return { projectId, sessionId };
}, []);

const createSession = React.useCallback((projectId, { name } = {}) => {
  const sessionId = `sess-${Date.now().toString(36)}`;
  const now = "Now";
  setState(s => ({
    ...s,
    sessions: [
      {
        id: sessionId,
        projectId,
        name: name || "New session",
        status: "draft",
        agents: 0, turns: 0, duration: "0m", when: now,
        createdBy: "Lin Chen",
      },
      ...s.sessions,
    ],
    conversation: [
      { id: `msg-${sessionId}-0`, sessionId, role: "system", text: "Team ready — describe what you want to work on." },
      ...s.conversation,
    ],
  }));
  return sessionId;
}, []);

const archiveProject = React.useCallback((id) => {
  setState(s => ({ ...s, projects: s.projects.map(p => p.id === id ? { ...p, status: "archived" } : p) }));
}, []);

const archiveSession = React.useCallback((id) => {
  setState(s => ({ ...s, sessions: s.sessions.map(x => x.id === id ? { ...x, status: "archived" } : x) }));
}, []);

const renameProject = React.useCallback((id, name) => {
  setState(s => ({ ...s, projects: s.projects.map(p => p.id === id ? { ...p, name } : p) }));
}, []);

const renameSession = React.useCallback((id, name) => {
  setState(s => ({ ...s, sessions: s.sessions.map(x => x.id === id ? { ...x, name } : x) }));
}, []);

const deleteSession = React.useCallback((id) => {
  setState(s => ({
    ...s,
    sessions:     s.sessions.filter(x => x.id !== id),
    conversation: s.conversation.filter(m => m.sessionId !== id),
    tasks:        s.tasks.filter(t => t.sessionId !== id),
    approvals:    s.approvals.filter(a => a.sessionId !== id),
  }));
  // Note: D.edges, D.nodePos, D.agentThreads are read-only (live on window.AppData, not store).
  // Mutating them is out of scope for this prototype; stale entries are acceptable.
}, []);

const deleteProject = React.useCallback((id) => {
  setState(s => {
    const doomedSessionIds = s.sessions.filter(x => x.projectId === id).map(x => x.id);
    const doomed = new Set(doomedSessionIds);
    return {
      ...s,
      projects:     s.projects.filter(p => p.id !== id),
      sessions:     s.sessions.filter(x => x.projectId !== id),
      conversation: s.conversation.filter(m => !doomed.has(m.sessionId)),
      tasks:        s.tasks.filter(t => !doomed.has(t.sessionId)),
      approvals:    s.approvals.filter(a => !doomed.has(a.sessionId)),
    };
  });
}, []);
```

- [ ] **Step 2: Expose them in the `return` of `useEntityStore`.**

Find the existing `return { state, create, update, remove, duplicate }` and extend:

```js
return {
  state, create, update, remove, duplicate,
  createProject, createSession,
  archiveProject, archiveSession,
  renameProject, renameSession,
  deleteProject, deleteSession,
};
```

- [ ] **Step 3: Hard-reload and confirm no regression.**

Nothing calls these yet. App should render as before.

- [ ] **Step 4: Commit.**

```bash
git add CrudUI.jsx
git commit -m "feat: add createProject/createSession/archive/rename/delete store helpers"
```

---

## Chunk 1b: Add missing icon paths

`icons.jsx` currently has these: `scan, layers, plug, database, shield, pen, chat, board, graph, canvas, compass, bolt, book, hammer, history, check, x, dots, plus, arrow, send, play, pause, search, settings, user, paperclip, spark, doc, folder, filter, clock, flag, alert, branch, target, sliders, grid, sparkle, cube, eye, download, edit, copy, trash`.

Later chunks reference these new icons: `home`, `chevron-down`, `mic`, `upload`, `rocket`, `doc-code`, `info`. Missing ones render as empty SVGs (no throw, no visible icon — silent break). Add them up-front.

### Task 7b: Add seven icon paths

**Files:**
- Modify: `icons.jsx` (the `ICON_PATHS` object)

- [ ] **Step 1: Append the seven entries inside `ICON_PATHS`, before the closing `};`.**

```js
  home:         ["M3 11l9-7 9 7", "M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"],
  "chevron-down": ["M6 9l6 6 6-6"],
  mic:          ["M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z", "M5 11a7 7 0 0 0 14 0", "M12 18v3", "M9 21h6"],
  upload:       ["M12 20V8", "M6 12l6-6 6 6", "M4 4h16"],
  rocket:       ["M5 15a4 4 0 0 0 4 4c0-2 .5-4 2-5l5-5c3-3 4-8 4-8s-5 1-8 4l-5 5c-1 1.5-2 3-2 5z", "M9 15l-4 4", "M13 11a1 1 0 1 0 2 0 1 1 0 0 0-2 0z"],
  "doc-code":   ["M6 2h8l6 6v14H6z", "M14 2v6h6", "M10 13l-2 2 2 2", "M14 13l2 2-2 2"],
  info:         ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v5", "M12 8h.01"],
```

Note: keys containing hyphens must be quoted (`"chevron-down"`, `"doc-code"`).

- [ ] **Step 2: Hard-reload and verify.**

The app will not yet consume these icons. Open the React DevTools component tree or just `<Icon name="home" size={16} />` by editing any visible component temporarily to confirm the SVG renders. Revert the experiment.

A lighter check: `grep -n "home:\|chevron-down\|mic:\|upload:\|rocket:\|doc-code\|info:" icons.jsx` — all seven should hit.

- [ ] **Step 3: Commit.**

```bash
git add icons.jsx
git commit -m "icons: add home, chevron-down, mic, upload, rocket, doc-code, info"
```

---

## Chunk 2: Session switching state & navigation

At the end of this chunk the user can switch projects and sessions via the Topbar crumb popovers, data slicing works, and the Sidebar WORKSPACE is renamed.

### Task 8: Add `currentProjectId` / `currentSessionId` state with localStorage + stale-id fallback

**Files:**
- Modify: `App.jsx` (state declarations, effects, and render use of slice)

- [ ] **Step 1: Add state + resolver.**

Inside `App()`, right after the `const [rightView, setRightView] = ...` line, add:

```js
// Resolve a valid (projectId, sessionId) pair from candidates, falling back through the spec's 3-tier rules.
const resolveProjectSession = (candProj, candSess) => {
  const D = window.AppData;
  const sessions = store.state.sessions;
  const projects = store.state.projects;
  // tier 1: candidate session still exists
  const s1 = sessions.find(x => x.id === candSess);
  if (s1) return { projectId: s1.projectId, sessionId: s1.id };
  // tier 2: candidate project's most-recent session
  const projSess = sessions.find(x => x.projectId === candProj);
  if (projSess) return { projectId: candProj, sessionId: projSess.id };
  // tier 3: first project's most-recent session
  const anyProj = projects[0];
  if (anyProj) {
    const anySess = sessions.find(x => x.projectId === anyProj.id);
    if (anySess) return { projectId: anyProj.id, sessionId: anySess.id };
  }
  return { projectId: null, sessionId: null };
};

const [{ currentProjectId, currentSessionId }, setCurrent] = React.useState(() => {
  const candProj = localStorage.getItem("at.projectId");
  const candSess = localStorage.getItem("at.sessionId");
  // Resolver can't run here (store state not ready in useState initializer); use rough restore,
  // then the effect below corrects stale ids.
  return { currentProjectId: candProj, currentSessionId: candSess };
});

React.useEffect(() => {
  const { projectId, sessionId } = resolveProjectSession(currentProjectId, currentSessionId);
  if (projectId !== currentProjectId || sessionId !== currentSessionId) {
    setCurrent({ currentProjectId: projectId, currentSessionId: sessionId });
  }
  // eslint-disable-next-line — intentional: run once after store seeds; stable in prototype
}, [store.state.projects, store.state.sessions]);

React.useEffect(() => {
  if (currentProjectId) localStorage.setItem("at.projectId", currentProjectId);
  else localStorage.removeItem("at.projectId");
}, [currentProjectId]);
React.useEffect(() => {
  if (currentSessionId) localStorage.setItem("at.sessionId", currentSessionId);
  else localStorage.removeItem("at.sessionId");
}, [currentSessionId]);

const switchSession = (sessionId) => {
  const sess = store.state.sessions.find(x => x.id === sessionId);
  if (!sess) return;
  setCurrent({ currentProjectId: sess.projectId, currentSessionId: sess.id });
  setSelectedAgentId(null);
  setSelectedTaskId(null);
  setPage("chat");
};

const switchProject = (projectId) => {
  const sess = store.state.sessions.find(x => x.projectId === projectId);
  if (!sess) {
    setCurrent({ currentProjectId: projectId, currentSessionId: null });
    setSelectedAgentId(null);
    setSelectedTaskId(null);
    setPage("chat");
    return;
  }
  switchSession(sess.id);
};
```

- [ ] **Step 1b: Remove every `"sess-lighthouse-01"` literal introduced as a stopgap in Chunk 1 Task 4.**

Run:
```bash
grep -rn 'sess-lighthouse-01' *.jsx
```

Every hit should be replaced with the in-scope `currentSessionId` value. Specifically:
- `App.jsx` — delete the `const LIGHTHOUSE_SESSION_ID = ...` line and use `currentSessionId` directly in the `selectedThread` computation (Step 2 below supersedes it entirely).
- `TeamView.jsx:642` — replace the literal with the new `currentSessionId` prop (wired in Step 3 below).
- `Canvas` reads of `D.nodePos["sess-lighthouse-01"]?.[...]` — replace with `nodePos[...]` where `nodePos` is already the slice value (from `slice.nodePos` threaded in Step 2 below).

After this step no source file should contain the string `sess-lighthouse-01` (except `data.js` where the seed literal lives, which is correct).

- [ ] **Step 2: Compute slice and thread it into consumers.**

Just before the `return` of `App`, add:

```js
const slice = sliceBySession(D, store, currentSessionId);
```

Replace the `<ChatArea conversation={D.conversation} agents={D.agents} templates={D.templates} ... />` prop with `conversation={slice.conversation}`.

Replace `<TeamView ... tasks={store.state.tasks} edges={D.edges} nodePos={D.nodePos} ... />` with `tasks={slice.tasks} edges={slice.edges} nodePos={slice.nodePos}`.

Replace `selectedTasks` (around line 149) with `slice.tasks.filter(t => t.agent === selectedAgentId)`.

Replace `selectedThread` computation (line 148) with:

```js
const selectedThread = (selectedAgentId && currentSessionId)
  ? (D.agentThreads[currentSessionId]?.[selectedAgentId] || [])
  : [];
```

Remove the temporary `LIGHTHOUSE_SESSION_ID` constant you added in Chunk 1 Task 4.

- [ ] **Step 3: Fix `TeamView.jsx`.**

Replace the Roster threads prop (line 642) now that `currentSessionId` is available. Add a `currentSessionId` prop on `TeamView`:

In `App.jsx`, add `currentSessionId={currentSessionId}` to the `<TeamView>` call.

In `TeamView.jsx`, accept the new prop and use it:

```jsx
function TeamView({ view, setView, agents, tasks, edges, nodePos, topologies, onSelectAgent, onSelectTask, selectedId, onCollapse, store, currentSessionId }) {
  // ...
  {view === "roster" && <Roster agents={agents} tasks={tasks} threads={window.AppData?.agentThreads?.[currentSessionId] || {}} onSelectAgent={onSelectAgent} store={store} />}
}
```

- [ ] **Step 4: Hard-reload and verify.**

- First load with stale/no localStorage: app lands in `chat` with Lighthouse session restored.
- Refresh repeatedly: same session stays selected.
- Open DevTools → Application → LocalStorage: `at.projectId = proj-lighthouse`, `at.sessionId = sess-lighthouse-01`.
- Manually set `at.sessionId = "bogus"` in DevTools, refresh → app recovers to Lighthouse (tier-2 fallback).
- Console clean.

- [ ] **Step 5: Commit.**

```bash
git add App.jsx TeamView.jsx
git commit -m "feat: currentProjectId/currentSessionId state with resolver + switch fns"
```

---

### Task 9: Rename sidebar `History` to `Sessions`, keep `Main Session`

**Files:**
- Modify: `Shell.jsx` (`NAV` constant only — `crumbMap` is entirely rewritten in Task 10, so don't touch it here)

- [ ] **Step 1: Update the `NAV` constant.**

Change the WORKSPACE section:

```js
{ section: "WORKSPACE", items: [
  { id: "chat", label: "Main Session", icon: "chat", live: true },
  { id: "approvals", label: "Approvals", icon: "flag", count: 4 },
  { id: "sessions", label: "Sessions", icon: "history" },
]},
```

(The `count` will be computed dynamically in Task 18; leave static/empty for now.)

- [ ] **Step 2: Update `App.jsx` routing so `page === "sessions"` renders something.**

Temporarily route it to the existing `HistoryPage` (which already reads from `store.state.sessions` after Task 5's rename). We'll swap in a proper `SessionsPage` in Task 14 per §8 Q1 (recommendation: a dedicated page).

In the `page !== "chat"` switch in `App.jsx`:
```jsx
{page === "sessions" && <HistoryPage store={store} />}
```
Keep the old `page === "history"` line for now (safety — it still matches stale localStorage).

- [ ] **Step 3: Hard-reload and verify.**

Sidebar shows `Main Session / Approvals / Sessions` under WORKSPACE. Clicking `Sessions` opens the list (formerly History). Everything else unchanged.

- [ ] **Step 4: Commit.**

```bash
git add Shell.jsx App.jsx
git commit -m "nav: rename sidebar History to Sessions"
```

---

### Task 10: Rewrite Topbar crumb with 🏠 icon and popover dropdowns

**Files:**
- Modify: `Shell.jsx` (`Topbar` + add `CrumbPopover`)

- [ ] **Step 1: Add `CrumbPopover` component at the top of `Shell.jsx`.**

```jsx
function CrumbPopover({ label, items, onPick, onNew, newLabel }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <span className="crumb-pop" ref={ref}>
      <button className="crumb-trigger" onClick={() => setOpen(o => !o)}>
        {label} <Icon name="chevron-down" size={11} />
      </button>
      {open && (
        <div className="crumb-menu">
          {items.map(it => (
            <div key={it.id} className="crumb-item" onClick={() => { onPick(it.id); setOpen(false); }}>
              <span className="crumb-item-name">{it.name}</span>
              {it.meta && <span className="crumb-item-meta">{it.meta}</span>}
            </div>
          ))}
          {onNew && (
            <div className="crumb-item crumb-new" onClick={() => { onNew(); setOpen(false); }}>
              <Icon name="plus" size={12} /> {newLabel || "New"}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Rewrite the `Topbar` signature and crumb.**

Replace the existing `Topbar` function with:

```jsx
function Topbar({ page, projectName, sessionName, projects, sessions, currentProjectId, onHome, onSwitchProject, onSwitchSession, onNewProject, onNewSession }) {
  const showCrumb = page === "chat" && projectName && sessionName;
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" />
        <span>Atelier</span>
      </div>
      <div className="crumb">
        {showCrumb ? (
          <>
            <button className="crumb-home" onClick={onHome} title="All projects"><Icon name="home" size={13} /></button>
            <CrumbPopover
              label={projectName}
              items={projects.map(p => ({ id: p.id, name: p.name, meta: p.lastActive }))}
              onPick={onSwitchProject}
              onNew={onNewProject}
              newLabel="New project"
            />
            <span className="sep">/</span>
            <CrumbPopover
              label={sessionName}
              items={(sessions || []).filter(s => s.projectId === currentProjectId).map(s => ({ id: s.id, name: s.name, meta: s.when }))}
              onPick={onSwitchSession}
              onNew={onNewSession}
              newLabel="New session"
            />
          </>
        ) : (
          <span className="current">{page === "dashboard" ? "All projects" : page}</span>
        )}
      </div>
      <div className="spacer" />
      {page === "chat" && (
        <>
          <span className="run-state"><span className="dot" /> team.running</span>
          <button className="ghost-btn"><Icon name="history" size={13} /> Run log</button>
          <button className="ghost-btn"><Icon name="download" size={13} /> Export</button>
          <button className="primary-btn" onClick={onNewSession}><Icon name="plus" size={13} /> New session</button>
        </>
      )}
      {page !== "chat" && page !== "dashboard" && (
        <>
          <button className="ghost-btn"><Icon name="search" size={13} /> Search</button>
          <button className="primary-btn"><Icon name="plus" size={13} /> New</button>
        </>
      )}
    </header>
  );
}
```

- [ ] **Step 3: Confirm `icons.jsx` has `home` and `chevron-down`.**

These were added in Task 7b (Chunk 1b). Sanity check:
```bash
grep -E '^  (home):|"chevron-down":' icons.jsx
```
Expect 2 hits. If missing, stop and revisit Task 7b.

- [ ] **Step 4: Wire `App.jsx` to pass the new props.**

In the `<Topbar ... />` render, compute and pass:

```jsx
const currProj = store.state.projects.find(p => p.id === currentProjectId) || null;
const currSess = store.state.sessions.find(s => s.id === currentSessionId) || null;

<Topbar
  page={page}
  projectName={currProj?.name}
  sessionName={currSess?.name}
  projects={store.state.projects}
  sessions={store.state.sessions}
  currentProjectId={currentProjectId}
  onHome={() => { setPage("dashboard"); setCurrent({ currentProjectId: null, currentSessionId: null }); }}
  onSwitchProject={switchProject}
  onSwitchSession={switchSession}
  onNewProject={() => { setPage("dashboard"); }}
  onNewSession={() => { if (currentProjectId) { const id = store.createSession(currentProjectId, {}); switchSession(id); } }}
/>
```

- [ ] **Step 5: Add popover styles.**

Append to `styles.css`:

```css
.crumb-home { background: transparent; border: 0; padding: 2px 6px; border-radius: 6px; cursor: pointer; color: var(--text-2); }
.crumb-home:hover { background: var(--bg-2); color: var(--text-1); }
.crumb-pop { position: relative; display: inline-flex; }
.crumb-trigger { background: transparent; border: 0; padding: 4px 8px; border-radius: 6px; cursor: pointer; font: inherit; color: var(--text-1); display: inline-flex; gap: 4px; align-items: center; }
.crumb-trigger:hover { background: var(--bg-2); }
.crumb-menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 50; min-width: 240px; background: var(--bg-1); border: 1px solid var(--border-1); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); padding: 4px; }
.crumb-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; gap: 12px; }
.crumb-item:hover { background: var(--bg-2); }
.crumb-item-meta { color: var(--text-3); font-family: var(--font-mono); font-size: 11px; }
.crumb-new { color: var(--accent-1); border-top: 1px solid var(--border-1); margin-top: 2px; padding-top: 10px; }
```

Bump `styles.css?v=24` → `?v=25` in `index.html`.

- [ ] **Step 6: Hard-reload and verify.**

- Crumb reads `Atelier  /  🏠 Lighthouse ▾  /  Lighthouse — PRD to Tech Design ▾`.
- Click 🏠 → page switches to dashboard (blank — filled in Chunk 3).
- Click project dropdown → lists 4 projects + `+ New project`.
- Click another project (e.g. AI Report Templates) → chat panel re-renders, kanban re-renders with that project's first session's data (likely empty — that's fine).
- Click session dropdown → lists sessions of current project.
- Click a different session → chat + kanban swap.

- [ ] **Step 7: Commit.**

```bash
git add Shell.jsx App.jsx styles.css index.html icons.jsx
git commit -m "nav: topbar crumb with home icon and project/session popovers"
```

---

## Chunk 3: Dashboard page

### Task 11: Create `Dashboard.jsx` skeleton and wire into `index.html`

**Files:**
- Create: `Dashboard.jsx`
- Modify: `index.html` (add `<script>` entry before `DetailShell.jsx`)
- Modify: `App.jsx` (add `page === "dashboard"` render branch)

- [ ] **Step 1: Create the file with a skeleton.**

```jsx
// Dashboard — All Projects landing page.
// Two-column: NewProjectForm (left) + RecentProjects + QuickstartRow (right).

const QUICKSTART_PRESETS = [
  { id: "qs-prd",     name: "PRD → Technical Design",   icon: "doc-code", defaultTemplateId: "tpl-prd2tech", description: "Parse a PRD and produce the full technical design." },
  { id: "qs-bugfix",  name: "Bug Root Cause & Fix",     icon: "alert",    defaultTemplateId: "tpl-bugfix",   description: "Reproduce, root-cause, patch, and post-mortem." },
  { id: "qs-compete", name: "Competitor Matrix",        icon: "grid",     defaultTemplateId: "tpl-research", description: "Collect and compare competitors on key dimensions." },
  { id: "qs-launch",  name: "Launch Readiness",         icon: "rocket",   defaultTemplateId: "tpl-launch",   description: "GTM checklist, risk review, launch comms." },
];

function Dashboard({ store, onOpenProject, onQuickstart }) {
  return (
    <div className="dashboard">
      <div className="dashboard-left">
        <div className="ds-card">Placeholder: NewProjectForm</div>
      </div>
      <div className="dashboard-right">
        <div className="ds-card">Placeholder: RecentProjects</div>
        <div className="ds-card">Placeholder: QuickstartRow</div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, QUICKSTART_PRESETS });
```

- [ ] **Step 2: Add script tag to `index.html`.**

After `<script type="text/babel" src="Pages.jsx"></script>`, insert:

```html
<script type="text/babel" src="Dashboard.jsx"></script>
```

Before `<script type="text/babel" src="DetailShell.jsx"></script>`. Don't bump any `?v=` because `.jsx` files aren't cache-busted in this repo.

- [ ] **Step 3: Add dashboard route to `App.jsx`.**

In the `page !== "chat"` branch, add:

```jsx
{page === "dashboard" && (
  <Dashboard
    store={store}
    onOpenProject={(id) => switchProject(id)}
    onQuickstart={(preset) => {
      const { projectId, sessionId } = store.createProject({
        name: preset.name,
        description: preset.description,
        defaultTemplateId: preset.defaultTemplateId,
        icon: preset.icon,
      });
      switchSession(sessionId);
    }}
  />
)}
```

Also adjust the `page !== "chat"` guard so dashboard renders as full-width main (no right panel).

- [ ] **Step 4: Add minimal dashboard styles to `styles.css`.**

```css
.dashboard { display: grid; grid-template-columns: 420px 1fr; gap: 24px; padding: 24px; overflow: auto; }
.dashboard-left, .dashboard-right { display: flex; flex-direction: column; gap: 16px; }
.ds-card { background: var(--bg-1); border: 1px solid var(--border-1); border-radius: 12px; padding: 20px; }
```

Bump `styles.css?v=25` → `?v=26`.

- [ ] **Step 5: Hard-reload and verify.**

Click 🏠 in the crumb → dashboard page shows with 3 placeholder cards. Console clean.

- [ ] **Step 6: Commit.**

```bash
git add Dashboard.jsx index.html App.jsx styles.css
git commit -m "feat: Dashboard page skeleton wired to home icon"
```

---

### Task 12: Implement `NewProjectForm` with Blank / Quickstart / Template tabs

**Files:**
- Modify: `Dashboard.jsx`
- Modify: `styles.css`

- [ ] **Step 1: Replace the NewProjectForm placeholder.**

```jsx
function NewProjectForm({ store, templates, onCreated }) {
  const [tab, setTab] = React.useState("blank"); // blank | quickstart | template
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [presetId, setPresetId] = React.useState("");

  const applyPreset = (p) => {
    setPresetId(p.id);
    setName(p.name);
    setDescription(p.description || "");
    setTemplateId(p.defaultTemplateId);
  };

  const submit = () => {
    if (!name.trim()) return;
    const { projectId, sessionId } = store.createProject({
      name: name.trim(),
      description,
      defaultTemplateId: templateId || null,
    });
    setName(""); setDescription(""); setTemplateId(""); setPresetId("");
    onCreated(projectId, sessionId);
  };

  return (
    <div className="ds-card np-form">
      <div className="np-tabs">
        {[["blank","Blank"], ["quickstart","From Quickstart"], ["template","From template"]].map(([k, l]) => (
          <button key={k} className={"np-tab " + (tab === k ? "active" : "")} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "quickstart" && (
        <div className="np-presets">
          {QUICKSTART_PRESETS.map(p => (
            <label key={p.id} className={"np-preset " + (presetId === p.id ? "active" : "")}>
              <input type="radio" name="preset" checked={presetId === p.id} onChange={() => applyPreset(p)} />
              <span className="np-preset-icon"><Icon name={p.icon} size={14} /></span>
              <span className="np-preset-text">
                <span className="np-preset-name">{p.name}</span>
                <span className="np-preset-desc">{p.description}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="np-field">
        <label>Project name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. AI Report Templates" />
      </div>

      {tab === "template" && (
        <div className="np-field">
          <label>Team template</label>
          <select value={templateId} onChange={e => setTemplateId(e.target.value)}>
            <option value="">(none)</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      <div className="np-field">
        <label>Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
      </div>

      <button className="primary-btn np-submit" disabled={!name.trim()} onClick={submit}>
        <Icon name="plus" size={13} /> Create
      </button>
      <div className="np-foot muted small">Anyone in your organization with the link can see your project by default.</div>
    </div>
  );
}
```

- [ ] **Step 2: Add styles.**

```css
.np-form { display: flex; flex-direction: column; gap: 12px; }
.np-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border-1); padding-bottom: 8px; }
.np-tab { background: transparent; border: 0; padding: 6px 10px; border-radius: 6px; font: inherit; font-size: 13px; color: var(--text-2); cursor: pointer; }
.np-tab.active { background: var(--bg-2); color: var(--text-1); font-weight: 500; }
.np-presets { display: flex; flex-direction: column; gap: 6px; }
.np-preset { display: flex; align-items: flex-start; gap: 10px; padding: 10px; border: 1px solid var(--border-1); border-radius: 8px; cursor: pointer; }
.np-preset.active { border-color: var(--accent-1); background: var(--accent-1-bg, rgba(224,133,88,0.06)); }
.np-preset input { margin-top: 2px; }
.np-preset-icon { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: var(--bg-2); }
.np-preset-text { display: flex; flex-direction: column; gap: 2px; }
.np-preset-name { font-size: 13px; font-weight: 500; }
.np-preset-desc { font-size: 11.5px; color: var(--text-3); }
.np-field { display: flex; flex-direction: column; gap: 4px; }
.np-field label { font-size: 11.5px; color: var(--text-3); }
.np-field input, .np-field textarea, .np-field select { padding: 8px 10px; border: 1px solid var(--border-1); border-radius: 8px; font: inherit; font-size: 13px; background: var(--bg-1); color: var(--text-1); }
.np-submit { justify-content: center; }
.np-foot { margin-top: 4px; }
```

Bump `styles.css?v=26` → `?v=27`.

- [ ] **Step 3: Wire into `Dashboard`.**

```jsx
function Dashboard({ store, onOpenProject, onQuickstart, onOpenSession }) {
  return (
    <div className="dashboard">
      <div className="dashboard-left">
        <NewProjectForm
          store={store}
          templates={store.state.templates}
          onCreated={(projectId, sessionId) => onOpenSession(sessionId)}
        />
      </div>
      <div className="dashboard-right">
        <div className="ds-card">Placeholder: RecentProjects</div>
        <div className="ds-card">Placeholder: QuickstartRow</div>
      </div>
    </div>
  );
}
```

In `App.jsx`, pass `onOpenSession={switchSession}` to `Dashboard`.

- [ ] **Step 4: Hard-reload and verify.**

- Dashboard shows NewProjectForm with three tabs.
- Type a name and click Create on the `Blank` tab → navigates to a new chat session (empty, with system greeting).
- Switch to `From Quickstart` tab → 4 preset cards. Click one → fields prefill. Click Create → new project/session created with the preset name.
- Switch to `From template` tab → template dropdown appears.

- [ ] **Step 5: Commit.**

```bash
git add Dashboard.jsx styles.css index.html
git commit -m "feat: NewProjectForm with blank/quickstart/template tabs"
```

---

### Task 13: Implement `RecentProjects` and `QuickstartRow`

**Files:**
- Modify: `Dashboard.jsx`
- Modify: `styles.css`

- [ ] **Step 1: Add `RecentProjects` component.**

```jsx
function RecentProjects({ projects, sessionsByProject, onOpen }) {
  const [tab, setTab] = React.useState("recent"); // recent | all | archived
  const list = React.useMemo(() => {
    const active = projects.filter(p => p.status !== "archived");
    if (tab === "archived") return projects.filter(p => p.status === "archived");
    if (tab === "all") return active;
    return active.slice(0, 8);
  }, [tab, projects]);
  return (
    <div className="ds-card rp">
      <div className="rp-tabs">
        {[["recent","Recent"], ["all","All"], ["archived","Archived"]].map(([k,l]) => (
          <button key={k} className={"rp-tab " + (tab===k ? "active" : "")} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="rp-empty muted">No projects yet. Create one on the left or pick a Quickstart below.</div>
      ) : (
        <div className="rp-grid">
          {list.map(p => (
            <div key={p.id} className="rp-card" onClick={() => onOpen(p.id)}>
              <div className="rp-folder" style={{ background: p.color }}>
                <Icon name={p.icon || "cube"} size={22} />
              </div>
              <div className="rp-meta">
                <div className="rp-name">{p.name}</div>
                <div className="rp-sub muted small">{(sessionsByProject[p.id] || []).length} sessions · {p.lastActive}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add `QuickstartRow` component.**

```jsx
function QuickstartRow({ onPick }) {
  return (
    <div className="ds-card qs">
      <div className="qs-title"><Icon name="spark" size={14} /> Quickstart</div>
      <div className="qs-row">
        {QUICKSTART_PRESETS.map(p => (
          <button key={p.id} className="qs-card" onClick={() => onPick(p)}>
            <div className="qs-card-icon"><Icon name={p.icon} size={18} /></div>
            <div className="qs-card-name">{p.name}</div>
            <div className="qs-card-desc muted small">{p.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `Dashboard` composition.**

```jsx
function Dashboard({ store, onOpenProject, onQuickstart, onOpenSession }) {
  const sessionsByProject = React.useMemo(() => {
    const m = {};
    for (const s of store.state.sessions) {
      (m[s.projectId] = m[s.projectId] || []).push(s);
    }
    return m;
  }, [store.state.sessions]);

  return (
    <div className="dashboard">
      <div className="dashboard-left">
        <NewProjectForm
          store={store}
          templates={store.state.templates}
          onCreated={(projectId, sessionId) => onOpenSession(sessionId)}
        />
      </div>
      <div className="dashboard-right">
        <RecentProjects
          projects={store.state.projects}
          sessionsByProject={sessionsByProject}
          onOpen={onOpenProject}
        />
        <QuickstartRow onPick={onQuickstart} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add styles.**

```css
.rp-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.rp-tab { background: transparent; border: 0; padding: 6px 10px; border-radius: 6px; font: inherit; font-size: 13px; color: var(--text-2); cursor: pointer; }
.rp-tab.active { background: var(--bg-2); color: var(--text-1); font-weight: 500; }
.rp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
.rp-card { cursor: pointer; border: 1px solid var(--border-1); border-radius: 10px; overflow: hidden; transition: border-color 0.15s; display: flex; flex-direction: column; }
.rp-card:hover { border-color: var(--accent-1); }
.rp-folder { aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; color: white; opacity: 0.85; }
.rp-meta { padding: 10px 12px; }
.rp-name { font-size: 13px; font-weight: 500; }
.rp-empty { padding: 24px 8px; text-align: center; }

.qs-title { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: var(--text-2); margin-bottom: 10px; }
.qs-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.qs-card { text-align: left; background: var(--bg-1); border: 1px solid var(--border-1); border-radius: 10px; padding: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; font: inherit; }
.qs-card:hover { border-color: var(--accent-1); }
.qs-card-icon { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: var(--bg-2); }
.qs-card-name { font-size: 13px; font-weight: 500; }
.qs-card-desc { font-size: 11.5px; }
```

Bump `styles.css?v=27` → `?v=28`.

- [ ] **Step 5: Hard-reload and verify.**

- Dashboard shows NewProjectForm + RecentProjects with 4 cards + Quickstart with 4 cards.
- Click a recent-project card → navigates to its most-recent session.
- Click a Quickstart card → creates project+session with preset name, navigates to new chat.
- Tabs Recent/All/Archived filter. Archived shows any project with `status === "archived"` (none yet; seed an archived one in Step 6 if you want to verify).

- [ ] **Step 6 (optional): Seed one archived project for visual QA.**

In `data.js`, change `proj-outage` status to `"archived"`, reload, verify it moves to Archived tab. Revert before commit if you want all 4 active.

- [ ] **Step 7: Commit.**

```bash
git add Dashboard.jsx styles.css index.html
git commit -m "feat: RecentProjects card grid + QuickstartRow on dashboard"
```

---

### Task 14: Remove `HistoryPage` and add a proper `SessionsPage`

Resolve §8 Q1 with recommendation (b): a dedicated list page.

**Files:**
- Modify: `Pages.jsx`
- Modify: `App.jsx`

- [ ] **Step 0: Also drop `history: [...D.history]` from the `useEntityStore` seed in `CrudUI.jsx` as part of this task's commit** (the temporary line added in Task 5 Step 1). After Task 14, `store.state.history` must not exist.

- [ ] **Step 0b: Drop the `const history = [...]` declaration from `data.js` IIFE** (not just the `return` entry) so the array itself doesn't linger as dead data. Bump `data.js?v=7` → `?v=8`.

- [ ] **Step 1: Add `SessionsPage` in `Pages.jsx`.**

A minimal list scoped to current project:

```jsx
function SessionsPage({ store, currentProjectId, onOpenSession }) {
  const sessions = store.state.sessions.filter(s => !currentProjectId || s.projectId === currentProjectId);
  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <h2>Sessions</h2>
          <div className="sub">{currentProjectId ? "In current project" : "All sessions"}</div>
        </div>
      </div>
      <div className="grid-card">
        <table className="simple-table">
          <thead><tr><th>Name</th><th>Status</th><th>Agents</th><th>Turns</th><th>Duration</th><th>When</th></tr></thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id} onClick={() => onOpenSession(s.id)} style={{ cursor: "pointer" }}>
                <td>{s.name}</td>
                <td><span className={"status-pill s-" + s.status}>{s.status}</span></td>
                <td>{s.agents}</td>
                <td>{s.turns}</td>
                <td>{s.duration}</td>
                <td className="muted mono small">{s.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Also **delete** the old `HistoryPage` component and its entry in the `Object.assign(window, ...)` at file end. Add `SessionsPage` there instead.

- [ ] **Step 2: Remove history route and add sessions route in `App.jsx`.**

Delete the `{page === "history" && <HistoryPage ... />}` line. Replace with:

```jsx
{page === "sessions" && (
  <SessionsPage
    store={store}
    currentProjectId={currentProjectId}
    onOpenSession={switchSession}
  />
)}
```

Also remove the `history: ["Workspace", "History"]` entry from `crumbMap` in `Shell.jsx`.

- [ ] **Step 3: Drop `history` from the `return` of `data.js`'s IIFE.**

The `const history = [...]` declaration was already removed in Step 0b. Also delete `history` from the final `return { agents, ..., history }` line so the exported object no longer carries it. The cache bump from Step 0b (`?v=7` → `?v=8`) covers this edit too — do NOT bump again.

- [ ] **Step 4: Hard-reload and verify.**

- Sidebar Sessions item → renders SessionsPage with current project's sessions in a table.
- Click a row → navigates to that session's chat.
- No references to `history` remain (`grep -n "history\|History" *.jsx data.js` — only occurrences should be historical comments / icon name `"history"`).

- [ ] **Step 5: Commit.**

```bash
git add Pages.jsx App.jsx Shell.jsx data.js index.html
git commit -m "refactor: replace HistoryPage with SessionsPage scoped to current project"
```

---

## Chunk 4: Chat area polish

### Task 15: Restyle `Message` text branch to Claude-style (business cards untouched)

**Files:**
- Modify: `Chat.jsx` (function `Message` at line 102; **do not rename** — callers use `<Message />`)

Important: the actual component is `Message(msg, agents, onSelectAgent, onDecide)`. Its first lines look like:

```js
function Message({ msg, agents, onSelectAgent, onDecide }) {
  if (msg.kind === "team-proposal") { /* returns a business card */ }
  if (msg.kind === "approval")      { /* returns a business card */ }
  const agent = msg.agent ? agents.find(a => a.id === msg.agent) : null;
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  // ... renders the text bubble
}
```

Only the **text bubble** (the branch after the two `msg.kind` early returns) changes. The two `if (msg.kind === ...)` early returns stay exactly as they are — those are the business cards the spec says to preserve.

- [ ] **Step 1: Read the current `Message` implementation end-to-end** (lines 102 through the function's closing `}`). Note every prop it reads off `msg` (`agent`, `role`, `text`, plus any others).

- [ ] **Step 2: Rewrite only the text-bubble branch.**

Keep the two `if (msg.kind === ...)` returns at the top intact. Replace the rest of the function body with:

```jsx
  const agent = msg.agent ? agents.find(a => a.id === msg.agent) : null;
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  const roleClass = isUser ? "msg-user" : isSystem ? "msg-system" : "msg-team";

  const label = isUser
    ? <span className="msg-label">You</span>
    : agent
      ? <span className="msg-label">
          <AgentBadge agent={agent} size={18} />
          <span>{agent.name}</span>
          <span className="msg-role">{agent.role}</span>
        </span>
      : <span className="msg-label">Team</span>;

  return (
    <div className={"msg " + roleClass}>
      {label}
      {msg.text && <div className="msg-body">{msg.text}</div>}
      {msg.chips && msg.chips.length > 0 && (
        <div className="msg-chips">
          {msg.chips.map((c, i) => <span key={i} className="chip">{c}</span>)}
        </div>
      )}
    </div>
  );
```

Do NOT introduce a `msg.block` slot — it's fictional. If the current `Message` branch renders any additional sub-elements (tool output, inline chips, `onSelectAgent` interactions), preserve them inside this new layout — adapt, don't drop.

- [ ] **Step 3: Add styles.**

Append to `styles.css`:

```css
.msg { display: flex; flex-direction: column; gap: 6px; margin-bottom: 22px; }
.msg-label { font-size: 13px; font-weight: 600; color: var(--text-1); display: inline-flex; align-items: center; gap: 8px; }
.msg-role { font-family: var(--font-mono); font-size: 11px; color: var(--text-3); font-weight: 400; }
.msg-body { font-size: 14px; line-height: 1.65; color: var(--text-1); white-space: pre-wrap; }
.msg-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.chip { font-size: 11.5px; padding: 3px 8px; border-radius: 999px; background: var(--bg-2); color: var(--text-2); border: 1px solid var(--border-1); }
```

Bump `styles.css?v=28` → `?v=29` in `index.html`.

- [ ] **Step 4: Hard-reload and verify.**

- Chat panel renders Lighthouse messages in Claude-style (no card border, bold label, body paragraph).
- Agent messages show the agent icon + name + role.
- Business cards (TeamProposalCard etc.) still render with their original card styling.

- [ ] **Step 5: Commit.**

```bash
git add Chat.jsx styles.css index.html
git commit -m "chat: Claude-style labeled message layout (cards preserved)"
```

---

### Task 16: Add `InlineNotice` component

**Files:**
- Modify: `Chat.jsx`
- Modify: `styles.css`

- [ ] **Step 1: Append `InlineNotice` to `Chat.jsx`.**

```jsx
function InlineNotice({ icon = "info", children, action, onAction }) {
  return (
    <div className="inline-notice">
      <Icon name={icon} size={13} />
      <span className="in-text">{children}</span>
      {action && <button className="in-action" onClick={onAction}>{action} →</button>}
    </div>
  );
}
```

Export on `window` so demo / seed messages can wrap it in a `block`.

- [ ] **Step 2: Style.**

```css
.inline-notice { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; background: var(--accent-1-bg, rgba(224,133,88,0.08)); border: 1px solid var(--border-1); color: var(--text-2); font-size: 12.5px; }
.in-text { flex: 1; }
.in-action { background: transparent; border: 0; color: var(--accent-1); cursor: pointer; font: inherit; font-weight: 500; }
```

Bump `styles.css?v=29` → `?v=30` in `index.html`.

- [ ] **Step 3: Seed one example.**

In `data.js` `conversation`, add a system message using `InlineNotice` by setting `block: { type: "notice", icon: "spark", text: "Team ready — click to run →" }`. Or simpler: skip the seed and treat `InlineNotice` as a future hook the author can invoke. For this plan, **skip the seed** (avoid coupling data.js to component output shape).

- [ ] **Step 4: Commit.**

```bash
git add Chat.jsx styles.css index.html
git commit -m "chat: add InlineNotice component"
```

---

### Task 16b: Wire `handleSend` to append messages to `store.state.conversation`

Currently `Chat.jsx` `handleSend` (around line 356) just toggles the welcome state — it does not persist the user's message. After Chunk 1, `conversation` is a store-owned slice, and new sessions seeded by Quickstart expect users to be able to send messages that survive session switches. Make `handleSend` an append-to-store.

**Files:**
- Modify: `Chat.jsx` (`ChatArea` signature + `handleSend`)
- Modify: `App.jsx` (pass `store` and `currentSessionId` into `ChatArea`)

- [ ] **Step 1: Thread `store` and `currentSessionId` into `ChatArea`.**

In `App.jsx`, the `<ChatArea ... />` call already accepts several props. Add:

```jsx
<ChatArea
  onSelectAgent={setSelectedAgentId}
  conversation={slice.conversation}
  agents={store.state.agents}
  templates={store.state.templates}
  store={store}
  currentSessionId={currentSessionId}
/>
```

- [ ] **Step 2: Update `ChatArea`'s signature and `handleSend`.**

```jsx
function ChatArea({ onSelectAgent, conversation, agents, templates, store, currentSessionId }) {
  // ... existing state
  const handleSend = (text) => {
    if (!text?.trim() || !currentSessionId || !store) return;
    const id = `msg-${currentSessionId}-${Date.now().toString(36)}`;
    store.create("conversation", { id, sessionId: currentSessionId, role: "user", text: text.trim() });
    goFull();
  };
  // ... rest unchanged
}
```

`store.create("conversation", item)` exists (it's the generic entity-store `create` from `useEntityStore`). `conversation` is now a slice in `store.state` (Task 5), so `create` works without any extra helper.

- [ ] **Step 3: Hard-reload and verify.**

- Open Lighthouse session, type "hello world" in the composer, hit Send.
- A new "You" bubble appears at the bottom of the chat with the text.
- Switch to another session via the crumb popover, then switch back.
- The "hello world" message should still be there (persisted in `store.state.conversation`).

- [ ] **Step 4: Commit.**

```bash
git add Chat.jsx App.jsx
git commit -m "chat: wire handleSend to persist user messages in store conversation"
```

---

### Task 17: Redesign `Composer` with ⚙/📎/🎤/Import icon strip + Send button

**Files:**
- Modify: `Chat.jsx` (the existing `Composer` / input area at the bottom of `ChatArea`)
- Modify: `styles.css`

- [ ] **Step 1: Read the existing `Composer` signature first.**

It is exported from `Chat.jsx` as a `React.forwardRef` that accepts `{ empty, onSend, value, onChange }` (see line 405 in `ChatArea`: `<Composer ref={composerRef} empty={isEmpty} onSend={handleSend} value={draft} onChange={setDraft} />`). The `onSend` prop is what Task 16b wires through — it **must** be preserved or persistence breaks.

- [ ] **Step 2: Replace the Composer markup while preserving the prop contract.**

```jsx
const Composer = React.forwardRef(function Composer({ empty, onSend, value, onChange, placeholder = "Describe what you want to create..." }, ref) {
  // Preserve any imperative handle the old Composer exposed (e.g. setValue). If the old
  // code used useImperativeHandle(ref, () => ({ setValue })), keep that block verbatim.
  const send = () => {
    if (!value?.trim()) return;
    onSend?.(value);
    onChange?.("");
  };
  return (
    <div className="composer">
      <textarea
        className="composer-input"
        value={value || ""}
        onChange={e => onChange?.(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={placeholder}
        rows={1}
      />
      <div className="composer-bar">
        <button className="cmp-icon" title="Settings" onClick={() => {}}><Icon name="sliders" size={13} /></button>
        <button className="cmp-icon" title="Attach"   onClick={() => {}}><Icon name="paperclip" size={13} /></button>
        <button className="cmp-icon" title="Voice"    onClick={() => {}}><Icon name="mic" size={13} /></button>
        <button className="cmp-icon cmp-import"       onClick={() => {}}><Icon name="upload" size={12} /> Import</button>
        <div className="cmp-spacer" />
        <button className="primary-btn cmp-send" disabled={!value?.trim()} onClick={send}>
          <Icon name="send" size={12} /> Send
        </button>
      </div>
    </div>
  );
});
```

Key points: the new Composer reads/writes `value`/`onChange` from the parent (which is `ChatArea`'s `draft` state); clicking Send calls `onSend(value)` (which goes to `handleSend` → `store.create("conversation", ...)` from Task 16b); after send, `onChange("")` clears the draft. Do NOT introduce a local `const [text, setText]` — that would shadow the parent's draft and break Task 16b.

If the old Composer also called `useImperativeHandle(ref, () => ({ setValue }))` (see `Chat.jsx` around line 351 where `composerRef.current?.setValue(text)` is used), preserve that imperative handle — add it back inside the new forwardRef body.

- [ ] **Step 3: Confirm `icons.jsx` has `paperclip`, `mic`, `upload`, `send`, `sliders`.**

These should all exist after Task 7b (Chunk 1b) and the base icon set. Sanity check:
```bash
grep -E '^  (paperclip|send|sliders):|"(mic|upload)":' icons.jsx
```
Expect 5 hits. If any are missing, stop and revisit Task 7b.

- [ ] **Step 4: Add styles.**

```css
.composer { border: 1px solid var(--border-1); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: var(--bg-1); }
.composer-input { border: 0; outline: none; resize: none; font: inherit; font-size: 14px; line-height: 1.55; color: var(--text-1); background: transparent; min-height: 24px; }
.composer-bar { display: flex; align-items: center; gap: 4px; }
.cmp-icon { background: transparent; border: 0; padding: 6px; border-radius: 6px; cursor: pointer; color: var(--text-2); display: inline-flex; align-items: center; gap: 4px; font: inherit; font-size: 12.5px; }
.cmp-icon:hover { background: var(--bg-2); color: var(--text-1); }
.cmp-import { padding: 6px 10px; }
.cmp-spacer { flex: 1; }
.cmp-send { padding: 7px 14px; }
.cmp-send[disabled] { opacity: 0.5; cursor: not-allowed; }
```

Bump `styles.css?v=30` → `?v=31` in `index.html`.

- [ ] **Step 5: Hard-reload and verify.**

- Chat bottom shows single-line composer with 4 icon buttons (⚙/📎/🎤) + Import text button on the left, Send on the right.
- Typing text enables Send.
- Pressing Enter (no Shift) sends; Shift+Enter inserts a newline.
- The ⚙/📎/🎤/Import buttons are visual only (onClick is `() => {}`); clicking them produces no console errors.
- After Send, the draft textarea clears and the new message appears as a "You" bubble (this proves Task 16b's wiring survived Task 17's Composer rewrite).
- Switch sessions via crumb popover and back — the sent message persists.

- [ ] **Step 6: Commit.**

```bash
git add Chat.jsx styles.css icons.jsx index.html
git commit -m "chat: Claude-style composer with icon strip and Send button"
```

---

## Chunk 5: Polish — approvals scoping and acceptance walkthrough

### Task 18: Scope sidebar Approvals count to current project

**Files:**
- Modify: `Shell.jsx` (`Sidebar` — make count dynamic)
- Modify: `App.jsx` (pass counts into `Sidebar`)

- [ ] **Step 1: Compute counts in `App.jsx` and pass them down.**

```jsx
const approvalsCount = currentProjectId
  ? store.state.approvals.filter(a => {
      const s = store.state.sessions.find(x => x.id === a.sessionId);
      return s && s.projectId === currentProjectId && (a.status === "pending" || !a.status);
    }).length
  : null;
const sessionsCount = currentProjectId
  ? store.state.sessions.filter(s => s.projectId === currentProjectId && s.status !== "archived").length
  : null;

<Sidebar page={page} setPage={setPage} counts={{ approvals: approvalsCount, sessions: sessionsCount }} />
```

- [ ] **Step 2: Update `Sidebar` to accept `counts`.**

Replace `{it.count != null && ...}` with:

```jsx
{(() => {
  const n = counts?.[it.id] ?? it.count;
  return n != null ? <span className="count">{n}</span> : null;
})()}
```

Remove the static `count: 4` from the Approvals nav item in `NAV`.

- [ ] **Step 3: Hard-reload and verify.**

- On dashboard (no current project): Approvals and Sessions items show no count.
- Switch to project Lighthouse: Approvals shows pending count (depends on seed; at least 0).
- Switch to another project: count updates.

- [ ] **Step 4: Commit.**

```bash
git add App.jsx Shell.jsx
git commit -m "nav: scope sidebar approvals/sessions counts to current project"
```

---

### Task 19: Acceptance-criteria walkthrough

Work through every item in §9 of the spec. Fix anything that doesn't pass.

**Files:** none, unless you find bugs.

Use the **pre-refactor baseline numbers** for regression detection. Before starting Chunk 1, the Lighthouse session had these observable counts — verify them all still match at the end:

- `conversation` messages in Lighthouse: count the records with `role:` fields in `data.js` — call this **M_conv**. Record this number before starting Chunk 1 and re-check at Task 19.
- `tasks` kanban rows in Lighthouse: count the records in the `tasks` array in `data.js` — call this **N_tasks**. (At time of writing, baseline appears to be roughly 7 tasks spread across kanban columns — re-count on your checkout.)
- `approvals` pending in sidebar badge: count of approval records with `status !== "approved"` — baseline is typically **4** (matches the static `count: 4` in `Shell.jsx` `NAV`).
- `edges` rendered in canvas: count of `edges` records.

Tip: open `data.js` and run `grep -c 'role:' data.js` and similar before Chunk 1; write the numbers in a scratch note.

Now walk through:

- [ ] **Clear localStorage (DevTools → Application → Local Storage → Clear)** and reload. Expected: lands on Dashboard with 4 mock projects (Lighthouse, AI Report Templates, Pricing v2 GTM, P0 Outage Reviews) and 4 Quickstart cards.

- [ ] **Click the `Lighthouse` card** → chat loads with M_conv conversation messages, kanban shows N_tasks tasks, canvas shows the edges count from baseline. Numbers must match the pre-refactor baseline exactly. Any discrepancy is a regression — fix before proceeding.

- [ ] **Topbar session popover** → lists 2 sessions in `proj-lighthouse`. Click `Mobile auth refactor review` → chat + kanban swap to that session (which has no seeded content beyond the sessions metadata, so chat is empty / kanban is empty — that's expected since only `sess-lighthouse-01` was tagged in Task 2).

- [ ] **Topbar project popover** → lists all 4 projects. Switching auto-selects that project's most-recent session.

- [ ] **Click a Quickstart card (e.g. `Competitor Matrix`)** → new project + session created, breadcrumb shows the new names, chat shows exactly one seeded system greeting (the `Team ready — describe what you want to work on.` from `createProject`).

- [ ] **Click 🏠** → returns to Dashboard. The newly-created project now appears in the Recent cards.

- [ ] **Sidebar Approvals count** → on Lighthouse, shows **4** (baseline). Switch to AI Report Templates — count drops to 0. Switch back — count returns to 4.

- [ ] **Message body** → in Lighthouse, labeled Claude-style (no bubble borders, bold "You" / agent name + role). **Business cards** (TeamProposalCard, ApprovalCard) still intact with their own card styling. **Composer** shows ⚙ / 📎 / 🎤 / Import + Send.

- [ ] **Send persistence** → type "regression test 1" in composer, hit Send. It appears as a "You" bubble. Switch to another session, switch back. The message is still there (covered by Task 16b).

- [ ] **Composer draft persistence** → type "unsent draft" in composer, do NOT send. Switch sessions via the crumb popover. Switch back. Expected: draft is lost (this is acceptable per spec ambiguity; the spec lists it as "persists" but this prototype unmounts ChatArea's state on session change). **If you want draft to persist**, lift `draft` state into `App.jsx` keyed by `sessionId` — optional follow-up, not a blocker.

- [ ] **Refresh** → session and project restored from `at.projectId` / `at.sessionId` in localStorage.

- [ ] **Set `at.sessionId = "bogus"` in DevTools and refresh** → app recovers via tier-2 fallback to Lighthouse's newest session.

- [ ] **Clear `at.projectId` and `at.sessionId` entirely and refresh** → app recovers via tier-3 fallback (first project's newest session, i.e. `proj-lighthouse` / `sess-lighthouse-01`).

- [ ] **Console check** → DevTools console should be clean across the entire walkthrough. Any red error is a regression.

- [ ] **Grep check for stale references**:
```bash
grep -rn 'sess-lighthouse-01' *.jsx        # expect 0 hits
grep -rn 'state\.history\|useCrud("history"' *.jsx   # expect 0 hits
grep -rn 'HistoryPage' *.jsx                # expect 0 hits
```
All three must return nothing. If any returns hits, that's a Chunk 1–4 cleanup miss.

- [ ] Fix any failure found and commit each fix separately with a descriptive message.

- [ ] **Final commit when all green.**

```bash
git commit --allow-empty -m "chore: acceptance walkthrough complete for projects & sessions"
```

---

## Done.

At this point:

- 4 mock projects with 2–3 sessions each live in `data.js`.
- Dashboard is the landing surface; crumb navigates projects/sessions.
- Session switch re-renders chat + kanban + canvas + approvals.
- Chat messages adopt Claude-style labeling; business cards preserved.
- Composer matches the reference design.
- Nothing persists across reload except UI preferences (by design).

If you hit a blocker, surface the offending task + the exact observation (what you saw vs what the plan expected) rather than inventing a workaround.
