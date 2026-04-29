# AGENTS.md

Behavioral guidelines (primary) + project-specific context (auxiliary) for Codex working in this repo.

---

# Part 1 — Behavioral Guidelines (Primary)

Reduce common LLM coding mistakes. These take precedence over instinct.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Part 2 — Project Context (Auxiliary)

Project-specific facts. Always read these before touching code, but the guidelines in Part 1 govern *how* you work.

## What this is

Atelier — a **design prototype** of a multi-agent workspace UI ("Agent Team Platform"). The frontend lives in `packages/frontend/` and is a static, no-build React app: `packages/frontend/index.html` loads React 18 and `@babel/standalone` from UMD CDNs and every `.jsx` file is served as `type="text/babel"` and transpiled in the browser. There is no frontend bundler or frontend package file. The optional backend lives in `packages/backend/`.

## Running it

Just open `packages/frontend/index.html` in a browser, or serve the frontend directory statically:

```sh
cd packages/frontend
python3 -m http.server 8000   # then visit http://localhost:8000
```

Hard-reload after edits — `styles.css` and `data.js` are cache-busted with `?v=` query strings in `packages/frontend/index.html`; bump them if a CDN/browser cache pins an old version.

There are no frontend lint, typecheck, test, or build commands — don't invent any. Backend checks live under `packages/backend/`.

## Script load order (important)

`packages/frontend/index.html` loads scripts in a specific order that must be preserved when adding new files. Each `.jsx` assigns its exports to `window` (e.g. `Object.assign(window, { Sidebar, Topbar })`) and later files read them as globals. The order is:

`data.js` → `icons.jsx` → `CrudUI.jsx` → `Shell.jsx` → `Chat.jsx` → `TeamView.jsx` → `AgentDrawer.jsx` → `Pages.jsx` → `DetailShell.jsx` → `AgentDetail.jsx` → `SkillDetail.jsx` → `KBDetail.jsx` → `TemplateDetail.jsx` → `App.jsx`

New components go before the first file that uses them; `App.jsx` is always last (it calls `ReactDOM.createRoot(...).render(<App />)`).

## Architecture

**Single global data source.** `data.js` builds `window.AppData` — an IIFE returning `{ agents, skills, knowledge, templates, history, approvals, tasks, conversation, edges, nodePos, topologies, agentThreads, ... }`. All mock data lives here; components read it as `const D = window.AppData`.

**In-memory CRUD store.** `CrudUI.jsx` exports `useEntityStore()` which seeds React state from `window.AppData` once, then exposes `create / update / remove / duplicate` keyed by entity name (`agents | skills | knowledge | templates | history | approvals | tasks`). `App.jsx` holds a single store instance and threads it down to every management page and detail view. Mutations do **not** persist — they live in React state until reload.

**Two top-level view modes in `App.jsx`:**
- `page === "chat"` renders a 3-column layout: `Sidebar | ChatArea (main) | TeamView (right)` with a draggable resizer and collapsible right panel. `TeamView` swaps between `kanban | canvas | roster` views.
- `page !== "chat"` renders full-width management pages from `Pages.jsx` (`AgentsPage`, `SkillsPage`, `KnowledgePage`, `TemplatesPage`, `HistoryPage`, `ApprovalsPage`). Each page uses schemas defined at the top of `Pages.jsx` (`AGENT_FIELDS`, `SKILL_FIELDS`, ...) + `useCrud` to wire the generic drawer/confirm/row-menu primitives from `CrudUI.jsx`.

**Detail routing.** `App.jsx` keeps `detail = { kind, id } | null` state alongside `page`. When `detail` is set and matches the current page, a `<AgentDetail | SkillDetail | KBDetail | TemplateDetail>` renders instead of the list. `goToEntity(kind, id)` flips both `page` and `detail` so cross-entity links (e.g. from a template to an agent) work. Changing pages via the sidebar auto-clears `detail`.

**Persistence.** Only UI preferences are persisted, via `localStorage`: `at.page`, `at.right` (right-view mode), `at.rightW` (right panel width), `at.rightCollapsed`. Entity edits are lost on reload by design.

## Theming and the Tweaks panel

`App.jsx` defines a `Tweaks` component and a `TWEAK_DEFAULTS` object wrapped in `/*EDITMODE-BEGIN*/ ... /*EDITMODE-END*/` sentinels. This is the contract for an external "edit mode" host (parent iframe):

- `window.parent.postMessage({ type: "__edit_mode_available" }, "*")` is posted on mount.
- Incoming messages `__activate_edit_mode` / `__deactivate_edit_mode` toggle the Tweaks panel.
- `__edit_mode_set_keys` is posted outward whenever settings change.

**Do not remove or rename the `EDITMODE-BEGIN/END` markers or the `postMessage` types** — the external host parses them. Theme is applied via `document.documentElement.setAttribute("data-theme", ...)` and the stylesheet in `styles.css` keys off `data-theme`.

## Conventions

- JSX in `.jsx` files only, no imports/exports — attach to `window` at the bottom (`Object.assign(window, { Foo, Bar })`) so later scripts can read them.
- No TypeScript, no JSX build tooling — keep syntax to what `@babel/standalone` transpiles out of the box.
- Icons come from `icons.jsx` via `<Icon name="..." size={...} />`; names are enumerated in that file — prefer adding to it over inlining SVGs.
- `_check/` holds reference screenshots (design checkpoints). `uploads/` holds pasted images. Neither is loaded by the app — don't reference them from code.
