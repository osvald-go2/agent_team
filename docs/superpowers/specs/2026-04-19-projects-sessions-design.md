# Projects & Sessions — Design Spec

**Date:** 2026-04-19
**Status:** Draft — brainstorming approved
**Scope:** Atelier (agent_team) prototype

---

## 1. Problem

Atelier today exposes a single hard-coded session (`Lighthouse`). All
conversation, tasks, kanban cards, edges, node positions, and approvals live
at the top level of `window.AppData` with no notion of grouping. Users need
to work on multiple requirement categories (e.g. "AI report templates",
"Lighthouse PRD"), each containing multiple sessions (one per sub-requirement).
There is also no onboarding surface — a returning user lands directly in a
live session with no way to pick or start a project.

This spec introduces two new entities — **Project** and **Session** — plus a
Dashboard landing page and chat-area visual polish.

## 2. Goals

1. Group sessions under projects; multiple projects and sessions coexist.
2. Users can create, switch between, archive projects and sessions.
3. Each session owns its own conversation, tasks, edges, node positions,
   approvals. Switching session re-renders chat + kanban + canvas with the
   new session's data.
4. A Dashboard page acts as the app landing surface, with recent-project
   cards, a New Project form, and a Quickstart preset row for zero-friction
   session creation.
5. Chat area adopts a Claude.ai-style message layout (labeled bubbles, chips,
   refined composer) while keeping existing business cards (TeamProposalCard,
   ApprovalCard) intact.

## 3. Non-goals

- Persistence beyond in-memory state (prototype stays memory-only; only UI
  preferences go to localStorage, matching existing `CLAUDE.md` policy).
- Multi-user, permissions, sharing.
- Session fork / clone (historical sessions stay live-editable; no fork flow).
- Real behavior behind new composer icons (⚙ / 📎 / 🎤 / Import are visual
  placeholders only).
- Progress bar in chat header (kanban/canvas already visualize agent
  progress; no redundant chat-level progress indicator).

## 4. User-facing behavior

### 4.1 Landing & navigation

- **First load:** lands on Dashboard (`page="dashboard"`,
  `currentProjectId=null`).
- **Returning load:** restores `at.projectId` / `at.sessionId` from
  localStorage, lands on `page="chat"`.
- **Sidebar WORKSPACE** (in `Shell.jsx`):
  - `Main Session` — live dot, click opens the most-recent session (resolved
    via `at.sessionId`, or newest session overall if none stored).
  - `Sessions` — renamed from `History`; count = non-archived sessions in
    current project.
  - `Approvals` — count = pending approvals in current project.
- **Topbar breadcrumb** (`Shell.jsx` `Topbar`):
  `Atelier  /  🏠 [ProjectName ▾]  /  [SessionName ▾]`
  - 🏠 icon → returns to Dashboard (`page="dashboard"`,
    `currentProjectId=null`).
  - `ProjectName ▾` → popover listing all projects + `+ New project`.
  - `SessionName ▾` → popover listing sessions in current project + `+ New
    session`.
- **Right-side action buttons** (`chat` page): `Run log`, `Export`, `New
  session` (now scoped to current project) — unchanged placement.

### 4.2 Dashboard page (All Projects)

Two-column layout, left 420px fixed, right flex:

- **Left — `NewProjectForm`:** tabs `Blank` / `From Quickstart` / `From
  template`. Quickstart tab shows the 4 preset scenarios (radio cards) that
  prefill name/description/defaultTemplateId. Submit → creates project + one
  seed session → navigates to `chat`.
- **Right — `RecentProjects`:** tabs `Recent` / `All` / `Archived` (skip
  `Mine` for prototype; only one user). Cards show folder icon tinted with
  `project.color`, name, `{N} sessions · {when}`. Click card → navigate to
  that project's most-recent session. Empty state guides user to left form
  or Quickstart row.
- **Right lower — Quickstart row:** 4 horizontal compact preset cards.
  Click → one-shot create project + seed session + navigate to chat.

### 4.3 Session switching

- User clicks `SessionName ▾` → popover → clicks target session →
  `setCurrentSessionId(id)` + ensures `page="chat"`.
- Chat, Kanban, Canvas, Approvals all re-read from the new session's slice
  (see §5.4).
- Switching project auto-selects that project's most-recent session; if none
  exist, stays on `chat` and renders an empty-session placeholder inviting
  user to create the first session.
- All sessions remain live-editable regardless of `status`; there is no
  read-only mode in this spec.

### 4.4 Chat area visuals

Preserves `Chat.jsx` business cards (TeamProposalCard, ApprovalCard, tool
output blocks) unchanged. Refactors the **message body** only:

- `MessageBubble` replaced with borderless row: bold `You` / `Claude` /
  `{AgentName}` label, body paragraph at `line-height: 1.65`, 22px spacing.
- Optional `msg-chips` row below body for tag-style meta
  (e.g. `Hi-fi design`).
- New `InlineNotice` component: thin tinted bar with small icon + optional
  action (used for things like "Team ready, click to run →").
- Composer redesigned: left icon strip (⚙ / 📎 / 🎤 / Import — all no-op
  handlers) + right primary `▷ Send` button. Single-line prompt with
  multi-line expansion.

## 5. Data & state

### 5.1 New collections in `data.js`

```js
projects: [
  { id, name, description, icon, color,
    defaultTemplateId, status, created, lastActive }
]

sessions: [
  { id, projectId, name, status,
    agents, turns, duration, when, createdBy }
]
```

`status` values:
- Project: `active | archived`
- Session: `draft | running | idle | archived` (no read-only behavior tied
  to these — purely informational badges)

### 5.2 Existing collections — add `sessionId`

Every record in the following gets a `sessionId` field:
`conversation`, `tasks`, `edges`, `approvals`, `agentThreads` (restructured
to `agentThreads[sessionId][agentId]`).

`nodePos` restructured from `{agentId: pos}` to
`{[sessionId]: {[agentId]: pos}}`.

**Not scoped to session** (stay flat, shared across projects): `agents`,
`skills`, `knowledge`, `templates`. These are library-level assets.

### 5.3 Quickstart presets (static constant)

Lives in `Dashboard.jsx` as a module-level constant (not in AppData):

```js
const QUICKSTART_PRESETS = [
  { id: "qs-prd",     name: "PRD → 技术方案",    icon: "doc-code", defaultTemplateId: "tpl-prd2tech",  description: "..." },
  { id: "qs-rca",     name: "事故 RCA 复盘",     icon: "alert",    defaultTemplateId: "tpl-rca",        description: "..." },
  { id: "qs-compete", name: "竞品分析 Matrix",   icon: "grid",     defaultTemplateId: "tpl-research",   description: "..." },
  { id: "qs-launch",  name: "功能 Launch Plan",  icon: "rocket",   defaultTemplateId: "tpl-gtm",        description: "..." },
];
```

### 5.4 App state (`App.jsx`)

New state alongside existing:
```
page:              "dashboard" | "chat" | "sessions" | "approvals" | "agents" | "skills" | "knowledge" | "templates" | "settings"
currentProjectId:  string | null    // null only when on dashboard
currentSessionId:  string | null    // null allowed when current project has zero sessions
```

New localStorage keys: `at.projectId`, `at.sessionId`. Existing keys
(`at.page`, `at.right`, `at.rightW`, `at.rightCollapsed`, `at.theme`)
unchanged.

### 5.5 Selector

A pure helper in `CrudUI.jsx`:
```js
function sliceBySession(D, store, sessionId) {
  return {
    conversation: D.conversation.filter(m => m.sessionId === sessionId),
    tasks:        store.state.tasks.filter(t => t.sessionId === sessionId),
    edges:        D.edges.filter(e => e.sessionId === sessionId),
    nodePos:      D.nodePos[sessionId] || {},
    approvals:    store.state.approvals.filter(a => a.sessionId === sessionId),
  };
}
```
`App.jsx` computes this once per render and passes the slice fields to
`ChatArea`, `TeamView`, `AgentDrawer` — existing prop signatures are
preserved, data source is narrowed.

### 5.6 Store additions (`useEntityStore`)

Seed `projects` and `sessions` from `window.AppData`. Beyond standard CRUD,
add helpers with side-effects:

- `createProject({ name, description, defaultTemplateId, icon, color })` →
  inserts project, auto-creates one empty session (with a single system
  greeting conversation message seeded), returns `{ projectId, sessionId }`.
- `createSession(projectId, { name })` → inserts session with empty
  conversation/tasks/edges and empty `nodePos[sessionId]`, returns
  `sessionId`.
- `archiveProject(id)` / `archiveSession(id)` → flips status.
- `renameProject(id, name)` / `renameSession(id, name)`.
- `deleteProject(id)` → cascades: deletes sessions in project, plus
  conversation/tasks/edges/approvals rows with those session ids, plus
  `nodePos[sessionId]` entries.
- `deleteSession(id)` → same cascade, minus project.

Standard `create/update/remove/duplicate` for `projects` and `sessions` are
not exposed through the generic `useCrud` drawer because these need the
cascade logic above.

## 6. File-level changes

| File | Change |
|---|---|
| `data.js` | Add `projects`, `sessions`. Add `sessionId` to every `conversation`/`tasks`/`edges`/`approvals` record. Restructure `nodePos` and `agentThreads`. Convert the existing 7-row `history` array into sessions distributed across 3-4 mock projects; `Lighthouse` becomes the first session of `proj-lighthouse`. Drop `history` export. |
| `Shell.jsx` | Rewrite `Sidebar` WORKSPACE section (rename History→Sessions, keep Main Session). Rewrite `Topbar` crumb with 🏠 icon + two popover dropdowns (new `<CrumbPopover>` component in this file). |
| `App.jsx` | Add `currentProjectId` / `currentSessionId` state + localStorage effects. Add `page="dashboard"` branch. Compute slice via `sliceBySession`; thread slice fields into `ChatArea` / `TeamView`. Adjust existing effects that referenced global `D.conversation` etc. |
| `CrudUI.jsx` | Seed new entities; implement project/session helpers with cascades; export `sliceBySession`. |
| `Dashboard.jsx` *(new)* | `Dashboard` component + `NewProjectForm` + `RecentProjects` + `QuickstartRow`. Constant `QUICKSTART_PRESETS`. Attach to `window`. |
| `Chat.jsx` | Replace `MessageBubble` implementation with borderless label+body rows and chip support. Add `InlineNotice`. Redesign `Composer` icon strip + Send button. Business cards unchanged. |
| `styles.css` | Styles for new message layout, chips, InlineNotice, crumb popover, Dashboard two-column layout, Quickstart row, recent-project cards. Bump `?v=` in `index.html`. |
| `index.html` | Add `<script type="text/babel" src="Dashboard.jsx">` between `Pages.jsx` and `DetailShell.jsx` (Dashboard is a top-level page like Pages; must load before `App.jsx`). Bump `?v=` on `data.js` and `styles.css`. |
| `Pages.jsx` | Remove `HistoryPage` (replaced by dashboard + session popover; decision: drop the standalone page — the sidebar `Sessions` item instead opens the project's session popover OR a minimal per-project sessions list view; see §8 open question). |

## 7. Architecture notes

- Flat data + sessionId filter (path A from brainstorming) chosen over
  nested data to minimize churn in `useEntityStore` and keep existing prop
  signatures.
- Session switch is a single `setCurrentSessionId` state update; React
  re-renders consumers automatically via the new slice computation in
  `App.jsx`.
- Project switch composes: `setCurrentProjectId` + auto-select
  `currentSessionId` to that project's most-recent session.
- Business cards retain their own card styles; message body changes are
  scoped to text messages only.

## 8. Open questions

1. **Sidebar `Sessions` item behavior** — when clicked, does it:
   (a) open the session popover (same as Topbar's SessionName ▾), or
   (b) navigate to a dedicated `SessionsPage` (list view, analogous to the
       old `HistoryPage` but scoped to current project)?
   Recommendation: (b) for consistency with other sidebar items (they all
   open a page). Confirm before implementation plan.

2. **Dashboard navigation when current project is null** — sidebar items
   like `Approvals` / `Sessions` whose count depends on project: hide the
   count, or show aggregate across all projects? Recommendation: hide
   (nothing is "current"); Main Session still works via `at.sessionId`
   fallback.

## 9. Acceptance criteria

1. Fresh load with no localStorage → Dashboard renders with 3-4 mock
   projects and 4 Quickstart preset cards.
2. Click `Lighthouse` card → navigates to chat, restores pre-existing
   conversation and kanban data exactly as before (no regression).
3. Topbar `SessionName ▾` popover lists sessions of current project;
   clicking a different session swaps chat + kanban content with no other
   navigation.
4. Topbar `ProjectName ▾` popover lists all projects; switching selects
   that project's most-recent session automatically.
5. Click a Quickstart card → new project + session created, breadcrumb
   shows new names, chat area shows empty state with only seeded system
   message.
6. Click 🏠 → returns to Dashboard.
7. Sidebar `Approvals` count reflects only current project's pending count.
8. Message bodies render in Claude-style labeled format; business cards
   (TeamProposalCard, ApprovalCard) unchanged; Composer shows ⚙/📎/🎤/Import
   + Send.
9. Refresh preserves current project and session via localStorage.
