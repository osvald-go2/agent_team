# Environment — Design Spec

**Date:** 2026-04-19
**Status:** Draft — brainstorming approved
**Scope:** Atelier (agent_team) prototype
**Depends on:** `2026-04-19-projects-sessions-design.md` (Projects & Sessions)

---

## 1. Problem

The projects-sessions spec introduces Projects and Sessions but leaves agents
without any notion of where they run. Real multi-agent work crosses local
filesystems and external services:

- A reporting feature may need a Java backend (`github.com/acme/reporting-java`)
  and a Go backend (`github.com/acme/reporting-go`). The orchestrator should
  route "write a SQL template" to a Claude running in the Java repo, and
  "write an aggregation pipeline" to a Claude running in the Go repo.
- The same feature may need to publish endpoints to an API gateway using
  tenant/credential config that should NOT be copy-pasted into every agent
  prompt.
- Other agents — a requirements analyst, a researcher — produce Lark links or
  docs and need no filesystem at all.
- Agents produce intermediate artifacts (generated SQL, parsed API specs,
  downloaded schemas) that should go into a predictable, isolated scratch
  directory instead of polluting the code repos.
- Projects are shared via Git (project metadata lives in the repo); Alice's
  local path `/Users/alice/work/reporting-java` is meaningless on Bob's
  machine.

This spec adds **Environment** — a Project-level bundle of roots, configs, and
derived scratch directories — designed to be created conversationally by the
orchestrator and resolved per-machine.

## 2. Goals

1. Each Project owns one Environment: `{ roots, configs }`. All sessions in a
   project share it (switching session does not switch env).
2. **Roots** declare code repositories and (optionally) the agent that runs
   inside them. Root-binding is per-agent **optional** — non-filesystem
   agents (analyst, researcher) stay unbound.
3. **Configs** group named credential/parameter sets (e.g. `gateway-prod`).
   Secret values use placeholders that resolve from per-machine storage.
4. **Collaboration-safe:** project data contains only repo URLs and logical
   identifiers; absolute local paths and secret values live only in
   `localStorage`. A teammate who pulls the project sees unresolved roots
   with a `Locate…` action.
5. **Scratch** directories are auto-provisioned per
   `(project, session, agent, run)` via a fixed naming convention. Users do
   not configure scratch for each agent; they can optionally change the base
   directory on their machine.
6. **Conversational creation** is the primary path. The orchestrator proposes
   agents + roots + configs as an `EnvProposalCard` (analogous to the
   existing `TeamProposalCard`). The Environment panel is a read-mostly
   status surface, with inline edits as an escape hatch.
7. **Lazy configuration:** the orchestrator only asks for info when a task
   needs it (e.g. gateway credentials are requested at publish time, not at
   project creation).

## 3. Non-goals

- Real filesystem I/O, `git clone`, or CLI integration. Prototype models the
  data and UI only; no process is launched in a root.
- Scratch cleanup / retention policies — directories grow indefinitely in
  the prototype. (See §8.)
- Secret encryption — `at.secrets` is stored in `localStorage` in plaintext.
  (See §8.)
- Multi-machine sync of `at.pathMap` / `at.secrets` — these are explicitly
  per-machine.
- Native folder pickers — prototype uses `<input type="text">` only.
- Session-level environment overrides — all sessions in a project share one
  env.

## 4. User-facing behavior

### 4.1 Conversational creation (primary path)

When a new project is created (from Dashboard), the first user message is
forwarded to the orchestrator, which may respond with an `EnvProposalCard`
proposing agents + roots + configs:

```
┌─ Environment proposal ─────────────────────────┐
│ Agents                                         │
│   🤖 req-analyst   (new, no root)              │
│   🤖 java-dev      (new, bound to Java root)   │
│   🤖 go-dev        (new, bound to Go root)     │
│   🤖 gateway-pub   (new, uses gateway-prod)    │
│                                                │
│ Roots                                          │
│   Java repo   — repo URL pending               │
│   Go repo     — repo URL pending               │
│                                                │
│ Configs                                        │
│   gateway-prod — tenant / user / pass pending  │
│                                                │
│                      [Apply]  [Adjust]         │
└────────────────────────────────────────────────┘
```

**Apply** materializes the agents/roots/configs. The orchestrator then
asks for missing pieces in follow-up messages, one at a time
("Java repo URL?", "Local path? (optional)"). Pieces that are not needed
yet (e.g. gateway credentials for a pre-publish project) are deferred —
the orchestrator requests them when the first task that needs them is
dispatched.

**Adjust** returns the proposal to draft: user can delete items, add items,
or rename via chat.

### 4.2 Environment panel (status + inline edit)

Lives in the chat-page right column as a tab alongside kanban/canvas/roster
(existing `rightView` state gains `"env"`). It is **read-mostly**:

```
╭─ Environment ───────────────────────────────── + Add root ─╮
│                                                            │
│  ┌─ Java repo  [java] ────────────────────────── ⋯ ───┐    │
│  │  repo:  github.com/acme/reporting-java             │    │
│  │  agent: 🤖 java-dev                                │    │
│  │  local: /Users/alice/work/reporting-java ✓         │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ┌─ Go repo  [go] ────────────────────────────── ⋯ ───┐    │
│  │  repo:  github.com/acme/reporting-go               │    │
│  │  agent: 🤖 go-dev                                  │    │
│  │  local: 🔗 Not located on this machine [Locate…]   │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ╭─ Configs ────────────────────────── + Add group ─╮      │
│  │  gateway-prod   tenant ✓ · user ✓ · pass ✓       │      │
│  │  gateway-stage  tenant ✓ · user ⚠ · pass ⚠       │      │
│  ╰──────────────────────────────────────────────────╯      │
│                                                            │
│  ╭─ Scratch ───────────────────────── [Change base…] ─╮    │
│  │  Base:    ~/.atelier                               │    │
│  │  Project: ~/.atelier/reporting-ab12/   [Open]      │    │
│  ╰────────────────────────────────────────────────────╯    │
╰────────────────────────────────────────────────────────────╯
```

- `⋯` menu on a root/config card opens **inline edit** (one field at a time:
  Rename, Change agent, Change repo URL, Change local path, Remove).
- `+ Add root` does **not** open a modal. It focuses the chat composer and
  prefills `Add a root: `, handing control back to the orchestrator.
- Badges: `✓` located / filled · `🔗` unresolved path · `⚠` missing secret.

### 4.3 Locate flow (first-time open by a collaborator)

When a project loads and `env.roots` contains entries whose `id` is not in
`at.pathMap`, an `InlineNotice` appears in the chat thread:

> 🔗 This project has 2 roots not located on this machine. **[Locate all]**

`[Locate all]` opens a compact list; each row shows `{label, repo.url}` as
read-only and asks for a path in one text input. Submitting writes to
`at.pathMap`. A root can also be located from its card via `[Locate…]` one
at a time.

If a root's `repo.url` is present and a matching remote is auto-detected in
a future CLI integration, the `at.pathMap` entry is written without user
input. Detection is out of scope for this spec (see §8).

### 4.4 Run log surfacing

Every agent run block (in chat + kanban) gains a small scratch line:

```
🤖 java-dev  ·  ran SQL template task  ·  3.2s
   scratch: …/runs/ef56/   [Open]  [Copy path]
```

`[Open]` is a no-op placeholder in the prototype (would be
`open file://…` or `revealInFinder()` later). `[Copy path]` copies the
resolved absolute path to the clipboard.

### 4.5 Dispatch guards

When the orchestrator attempts to dispatch a task to a root-bound agent:

- If the root has no local path in `at.pathMap` → dispatch is blocked;
  the agent card shows a disabled state with tooltip "Root not located on
  this machine". The chat shows an `InlineNotice` with a `Locate…` action.
- If the task requires a config that has unresolved `${secret:…}` fields
  → dispatch is blocked; chat shows "Missing secret: gateway-prod.pass
  [Fill…]".

Fallback dispatch to a different agent is not attempted automatically
(avoids silent misrouting). Resolving the block lets the user retry.

## 5. Data & state

### 5.1 Project env (shared, in `data.js` / `window.AppData`)

`projects[i]` gains an `env` field:

```js
{
  id: "proj-reporting",
  name: "报表需求",
  // ... existing fields from projects-sessions spec ...
  env: {
    roots: [
      {
        id: "root-java",
        label: "Java repo",
        kind: "java",                // "java" | "go" | "node" | "python" | "config" | "other"
        repo: { type: "git", url: "github.com/acme/reporting-java", branch: "main" },
        agentId: "java-dev"          // optional — null for unbound roots
      },
      {
        id: "root-go",
        label: "Go repo",
        kind: "go",
        repo: { type: "git", url: "github.com/acme/reporting-go", branch: "main" },
        agentId: "go-dev"
      }
    ],
    configs: [
      {
        id: "cfg-gateway-prod",
        name: "gateway-prod",
        fields: {
          tenant: "acme-prod",
          user:   "${secret:gateway-prod.user}",
          pass:   "${secret:gateway-prod.pass}"
        }
      }
    ]
  }
}
```

**Shape rules:**

- `roots[i].agentId` is optional. Missing/`null` means "root exists in the
  project but no agent is bound" (orchestrator will not dispatch there
  until bound).
- A given `agentId` may appear on **at most one** root in a project
  (enforced on write; prevents ambiguous routing). It can appear on zero
  roots (free agent).
- `kind` is a free-ish enum for display + orchestrator heuristics; unknown
  values fall back to a generic folder icon.
- `repo.url` is the **canonical identifier** for collaboration — it is
  matched against `.git/config` remotes (future CLI integration) to
  auto-resolve paths.
- Secret placeholder format is exactly `${secret:<configName>.<fieldName>}`
  (matched by regex `/^\$\{secret:([^.}]+)\.([^}]+)\}$/`). Non-secret
  string values are stored literally.

### 5.2 Local-only state (`localStorage`, not synced)

New keys, per-machine:

```
at.pathMap      = { [rootId]: absoluteLocalPath }
at.secrets      = { [`${configName}.${fieldName}`]: stringValue }
at.scratchBase  = "~/.atelier"    // default; user-editable
```

All three are plain JSON objects stringified into single keys
(`JSON.parse(localStorage.getItem("at.pathMap") || "{}")`). No migration
required on first load (missing keys default to `{}` / default string).

### 5.3 Scratch path (derived, not stored)

Pure function, lives in `CrudUI.jsx` alongside `sliceBySession`:

```js
// slug: lowercase, [a-z0-9-]+, max 24 chars from the entity name
// id6:  first 6 chars of the entity id after the first '-' (e.g. "proj-ab12cd" -> "ab12cd")
function resolveScratchPath({ base, project, session, agent, runId }) {
  const parts = [base, `${slug(project.name)}-${id6(project.id)}`];
  if (session) parts.push(`${slug(session.name)}-${id6(session.id)}`);
  if (agent)   parts.push(slug(agent.name));
  if (runId)   parts.push("runs", runId);
  return parts.join("/");
}
```

Layout this produces (all levels auto-created when first written; prototype
only surfaces the strings):

```
{base}/
└─ {project-slug}-{projId6}/
   ├─ _project/                       ← shared across sessions (convention)
   └─ {session-slug}-{sessId6}/
      ├─ _session/                    ← shared across agents in session (convention)
      └─ {agent-slug}/
         ├─ _sticky/                  ← long-lived agent cache (convention)
         └─ runs/
            └─ {uuid6}/               ← per-run scratch
```

`_project`, `_session`, `_sticky` are **naming conventions** surfaced in
docs/tooltips; no code enforces them. `uuid6` is a 6-char base36 id
generated at run start (prototype: `Math.random().toString(36).slice(2,8)`).

### 5.4 Store additions (`useEntityStore`)

Operate on the project entity's `env` field. All mutations go through
`updateProject(id, patch)` so cascade/cleanup stays centralized.

- `addRoot(projectId, { label, kind, repoUrl, branch?, agentId? })` →
  inserts a root with a generated `id`.
- `updateRoot(projectId, rootId, patch)` → partial update; if `agentId`
  changes, verifies uniqueness (see §5.1 shape rules).
- `removeRoot(projectId, rootId)` → removes root + deletes
  `at.pathMap[rootId]` from localStorage.
- `addConfig(projectId, { name, fields })` → inserts config group.
- `updateConfig(projectId, configId, patch)` → partial update (rename
  triggers secret-key migration in `at.secrets`).
- `removeConfig(projectId, configId)` → removes config + deletes all
  `at.secrets["{name}.*"]` entries.
- `setPath(rootId, absolutePath)` → writes `at.pathMap[rootId]`.
- `clearPath(rootId)` → deletes the entry.
- `setSecret(configName, fieldName, value)` → writes
  `at.secrets["{configName}.{fieldName}"]`.
- `clearSecret(configName, fieldName)` → deletes the entry.

Pure selectors (no side effects), also exported:

- `isRootLocated(root, pathMap) → boolean`
- `missingSecrets(config, secrets) → string[]`   // list of `name.field` still unresolved
- `resolveConfigFields(config, secrets) → object` // substitutes `${secret:…}` placeholders; `undefined` for missing
- `canDispatch(agent, project, pathMap, secrets) → { ok: boolean, reason?: string }`
- `resolveScratchPath({...})` (from §5.3)

### 5.5 Seed data in `data.js`

Seed `env` on one or two of the mock projects so the panel renders with
content on fresh load. `proj-lighthouse` gets a single "Docs root" with
`agentId: null` (to exercise the unbound case). A second mock project
gets the full reporting example: two code roots + one config + one bound
agent per root. At most one project starts with a `🔗 Not located` root
(to exercise the collaborator-pull flow on fresh load with empty
`at.pathMap`).

## 6. File-level changes

| File | Change |
|---|---|
| `data.js` | Add `env: { roots: [], configs: [] }` to every project in the `projects` seed. Populate two projects (`proj-lighthouse` minimal, `proj-reporting` full) per §5.5. |
| `CrudUI.jsx` | Add `addRoot` / `updateRoot` / `removeRoot` / `addConfig` / `updateConfig` / `removeConfig` / `setPath` / `clearPath` / `setSecret` / `clearSecret` helpers to `useEntityStore`. Export pure selectors `isRootLocated`, `missingSecrets`, `resolveConfigFields`, `canDispatch`, `resolveScratchPath`, plus `slug` / `id6` helpers. Seed in-memory state for `at.pathMap` / `at.secrets` / `at.scratchBase` from `localStorage` once at mount; flush on each mutation. |
| `Environment.jsx` *(new)* | Export `EnvironmentPanel` (the right-column tab view), `RootCard`, `ConfigCard`, `ScratchCard`, `LocateModal`, `InlineEditPopover`. Attach to `window`. |
| `Chat.jsx` | Add `EnvProposalCard` (modeled after `TeamProposalCard`) — renders the agent/root/config proposal and surfaces `Apply` / `Adjust` actions. Extend `MessageRenderer` to dispatch `proposal.kind === "env"` to it. Add `InlineNotice` variants for `locate-roots` and `missing-secret` (these reuse the notice component already introduced in projects-sessions §4.4). |
| `App.jsx` | Extend `rightView` enum with `"env"` and persist via existing `at.right` key. Thread the active project's `env`, plus the selectors from `CrudUI.jsx`, into `ChatArea` / `TeamView` / `AgentDrawer`. When dispatching to an agent, call `canDispatch(...)` and short-circuit to an `InlineNotice` on failure. |
| `TeamView.jsx` | Add an `"env"` case to the view switcher; mount `EnvironmentPanel`. Update the right-column tab strip to include an Environment tab. |
| `AgentDrawer.jsx` | Show the agent's bound root (if any) in the header. In the run history / chat tab, show a `scratch: …/runs/{uuid6}/` line per run with `[Open]` (no-op) and `[Copy path]` affordances. |
| `TaskDrawer.jsx` | Same scratch-line treatment in the Chat tab per run. |
| `Shell.jsx` | No structural change. The Env tab is in the right-column switcher (TeamView), not the sidebar. |
| `styles.css` | Styles for env panel, root/config/scratch cards, badges (`✓` / `🔗` / `⚠`), locate modal, inline-edit popover, proposal card, scratch line in run log. |
| `index.html` | Add `<script type="text/babel" src="Environment.jsx">` after `TeamView.jsx` and before `AgentDrawer.jsx` (Environment is consumed by TeamView; AgentDrawer uses the selectors but the component itself is mounted via TeamView). Bump `?v=` on `data.js` and `styles.css`. |

## 7. Architecture notes

- **Single source of truth per axis.** Project data (repo URLs, agent
  bindings, config structure) is project-scoped and lives in
  `window.AppData.projects[i].env`. Per-machine resolution (absolute paths,
  secret values, scratch base) is local and lives only in `localStorage`.
  No field lives in both places.
- **Routing is a query, not a stored decision.** "java-dev runs in java
  root" is derived by scanning `env.roots` for the matching `agentId`.
  There is no separate bindings table. This mirrors the projects-sessions
  choice of flat arrays + filter over nested objects.
- **Orchestrator is a UI.** `EnvProposalCard` is the conversational
  equivalent of a settings form. Actions dispatched from the card call the
  same `addRoot`/`addConfig`/etc. helpers that the panel's inline edits
  do — there is one codepath for state mutation, two surfaces for
  triggering it.
- **Lazy prompts stay in the chat.** "Missing gateway-prod.pass" surfaces
  as an `InlineNotice` in the message stream at dispatch time, not a modal
  that steals focus. The user can defer, reply with the secret inline, or
  fill via the panel — all three land in `at.secrets` through the same
  `setSecret` call.
- **Scratch is convention, not contract.** The prototype does not mkdir or
  write to disk. Agents surface the would-be path; a future CLI integration
  is expected to honor the layout from §5.3. Keeping the resolver pure
  (takes names, returns a string) means it can be tested and reused by
  both UI rendering and CLI tooling without duplication.

## 8. Open questions

1. **Scratch cleanup UX.** Prototype intentionally does nothing. For the
   first CLI integration, the minimal policy is "keep the N most recent
   runs per agent; keep `_sticky` and `_session` and `_project` forever".
   Should the panel surface a "Clean old runs" action in this spec, or
   defer to CLI-integration work? Recommendation: defer — it has no
   meaningful behavior in a no-fs prototype.

2. **Repo URL matching strictness.** `github.com/acme/repo` vs
   `https://github.com/acme/repo.git` vs `git@github.com:acme/repo.git`
   should all match the same logical repo. A normalizer lives naturally
   in the CLI integration step, not here. This spec stores whatever the
   user types and does exact string comparison; fuzzy matching is
   deferred.

3. **Secret placeholder scope.** `${secret:…}` is only supported inside
   `config.fields.*` values. Not in `root.repo.url`, not in agent
   prompts. Confirm this boundary — widening it later is additive.

4. **Empty-env first-run.** If a project has `env: { roots: [], configs: [] }`
   and the user sends a first message that implies env setup, should the
   orchestrator auto-propose, or wait for an explicit "set up the
   project" prompt? Recommendation: auto-propose when a message mentions
   a git URL, a repo name, or credentials. Behavior beyond that is a
   prompt-engineering concern, not a data model one — out of scope.

## 9. Acceptance criteria

1. Fresh load → Dashboard → click `proj-reporting` → chat page renders
   with an Environment tab in the right column showing two root cards
   (java + go) and one config card (gateway-prod).
2. On fresh `localStorage`, at least one root card shows `🔗 Not located`
   and the chat thread shows an `InlineNotice` offering `Locate all`.
3. `Locate…` on a root card accepts a path, writes to `at.pathMap`,
   clears the badge, and removes the notice when the last unresolved
   root is fixed.
4. Dispatching a task to a bound agent whose root is unlocated shows
   a blocking `InlineNotice`; dispatch resumes after `Locate…`.
5. Dispatching a task that references an unresolved secret surfaces a
   `Missing secret` notice; filling via `[Fill…]` writes to
   `at.secrets` and unblocks the run.
6. Creating a new project via the Dashboard "Blank" flow and sending a
   first message renders an `EnvProposalCard` with at least one agent
   proposal; clicking `Apply` materializes the agents/roots/configs
   into `project.env`.
7. A root's `⋯ → Change agent` menu updates `root.agentId`; attempting
   to bind the same agent to a second root in the same project is
   blocked with an inline error.
8. Each run block in chat shows a `scratch: …/runs/{uuid6}/` line whose
   value matches `resolveScratchPath(...)` for that run.
9. Changing `at.scratchBase` via `[Change base…]` immediately reflects
   in all run-block scratch lines (derived, not cached).
10. Reload preserves `at.pathMap`, `at.secrets`, `at.scratchBase`; shared
    `project.env` content is unchanged.
