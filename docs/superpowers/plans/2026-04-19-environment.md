# Environment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Project-level Environment (`{ roots, configs }` + derived scratch paths) so the orchestrator can dispatch filesystem-aware agents to specific repos, with collaboration-safe per-machine path/secret resolution. See `docs/superpowers/specs/2026-04-19-environment-design.md`.

**Architecture:** `window.AppData.projects[i]` gains an `env` field containing `roots` (optional `agentId` binding + git URL) and `configs` (named credential groups with `${secret:…}` placeholders). Absolute local paths and secret values live in `localStorage` only (`at.pathMap`, `at.secrets`, `at.scratchBase`) so project data is safe to share via Git. A new `Environment.jsx` renders a right-column panel (read-mostly + inline edits); a new `EnvProposalCard` in `Chat.jsx` is the primary creation surface. Pure helpers in `CrudUI.jsx` centralize routing/guards. Scratch paths are a pure function — the prototype never writes to disk.

**Tech Stack:** Static no-build React 18 + `@babel/standalone` (transpiled in-browser). No bundler, no test runner, no linter, no TypeScript.

**Prerequisites:**
- The Projects & Sessions plan (`docs/superpowers/plans/2026-04-19-projects-sessions.md`) must be executed first — this plan assumes `window.AppData.projects[]`, `window.AppData.sessions[]`, `currentProjectId` / `currentSessionId` state in `App.jsx`, and a right-column `rightView` switcher in `TeamView.jsx` all exist. If any of those are missing, stop and finish the projects-sessions plan first.
- If working in an isolated git worktree (recommended for execution), create it before starting. Otherwise the plan is safe to execute on `main` because every task commits before moving on.

**Verification discipline — read before starting:**
- This codebase has **no automated tests.** Every "verify" step is a manual browser check.
- After every edit to `data.js` or `styles.css`, bump the `?v=` query string in `index.html` (currently `data.js?v=8`, `styles.css?v=24`; both will likely have advanced by the time you reach those edits — bump whatever the current values are). After every edit to a `.jsx` file, a plain hard-reload (Cmd+Shift+R / Ctrl+Shift+R) is enough because `.jsx` URLs are not cache-busted.
- Serve the directory with `python3 -m http.server 8000` from `/Users/lion268li/repos/toutiao/app/agent_team/` and open `http://localhost:8000/`. Keep the server running across all tasks.
- Open DevTools Console on load — any syntax error surfaces there. A blank white page almost always means a JSX parse error.
- Every task ends with a commit. Commit messages follow the repo's existing imperative style (see recent `git log`).

---

## File Map

**New files:**
- `Environment.jsx` — `EnvironmentPanel` (right-column tab), `RootCard`, `ConfigCard`, `ScratchCard`, `LocateModal`, `InlineEditPopover`. Attaches all to `window`.

**Modified files:**
- `data.js` — add `env: { roots, configs }` to every project; seed `proj-lighthouse` with one unbound docs root, `proj-ai-report` with the full reporting example (two code roots + gateway config + one agent bound per root).
- `CrudUI.jsx` — add pure helpers (`slug`, `id6`, `resolveScratchPath`, `isRootLocated`, `missingSecrets`, `resolveConfigFields`, `canDispatch`), a local-storage-backed hook (`useLocalEnvState` managing `at.pathMap` / `at.secrets` / `at.scratchBase`), and env mutation helpers on `useEntityStore` (`addRoot` / `updateRoot` / `removeRoot` / `addConfig` / `updateConfig` / `removeConfig`).
- `App.jsx` — seed and thread `useLocalEnvState`; compute the active project + slice once; add `"env"` to the `rightView` enum; pass env + local state + selectors down; wire dispatch-guard short-circuit into the chat send path.
- `TeamView.jsx` — add `"env"` case to the right-column view switcher; mount `EnvironmentPanel`; add an Env tab to the tab strip.
- `Chat.jsx` — add `EnvProposalCard` (modeled on `TeamProposalCard`); extend `MessageRenderer` to dispatch `proposal.kind === "env"` to it; add `InlineNotice` variants for `locate-roots` and `missing-secret`.
- `AgentDrawer.jsx` — show the agent's bound root in the drawer header; show `scratch: …/runs/{uuid6}/` with `[Open]` and `[Copy path]` affordances on each run block.
- `TaskDrawer.jsx` — same scratch line treatment in the Chat tab's run blocks.
- `index.html` — add `<script type="text/babel" src="Environment.jsx">` between `Chat.jsx` and `TeamView.jsx` (so TeamView can reference `window.EnvironmentPanel`); bump `data.js` and `styles.css` versions on every data/CSS change.
- `styles.css` — styles for env panel, root/config/scratch cards, badges (`✓` / `🔗` / `⚠`), locate modal, inline-edit popover, proposal card, scratch line.

---

## Chunk 1: Data seed (invariant — app still renders)

Goal: project data grows a well-formed `env` field on every project; one project seeds an unresolved root so later tasks have something to exercise. No UI changes yet.

### Task 1: Add `env` to every project in `data.js`

**Files:**
- Modify: `data.js` (the `projects` array)
- Modify: `index.html` (bump `data.js?v=N` → `?v=N+1`)

- [ ] **Step 1: Read the current `projects` array in `data.js`.**

Locate the 4 projects (`proj-lighthouse`, `proj-ai-report`, `proj-pricing`, `proj-outage`). Every project object needs a new `env` field. Most projects get an empty env; `proj-lighthouse` gets a minimal unbound root; `proj-ai-report` gets the full example.

- [ ] **Step 2: Add `env: { roots: [], configs: [] }` to `proj-pricing` and `proj-outage`.**

Insert just before the closing `}` of each project:

```js
env: { roots: [], configs: [] },
```

- [ ] **Step 3: Add a minimal unbound docs root to `proj-lighthouse`.**

Replace `proj-lighthouse`'s existing `}` with:

```js
env: {
  roots: [
    {
      id: "root-lh-docs",
      label: "Docs & specs",
      kind: "other",
      repo: { type: "git", url: "github.com/acme/lighthouse-docs", branch: "main" },
      agentId: null,
    },
  ],
  configs: [],
},
```

- [ ] **Step 4: Add the full reporting env to `proj-ai-report`.**

```js
env: {
  roots: [
    {
      id: "root-rep-java",
      label: "Java backend",
      kind: "java",
      repo: { type: "git", url: "github.com/acme/reporting-java", branch: "main" },
      agentId: "ag-bespoke-backend",
    },
    {
      id: "root-rep-go",
      label: "Go backend",
      kind: "go",
      repo: { type: "git", url: "github.com/acme/reporting-go", branch: "main" },
      agentId: "ag-integrator",
    },
  ],
  configs: [
    {
      id: "cfg-gateway-prod",
      name: "gateway-prod",
      fields: {
        tenant: "acme-prod",
        user:   "${secret:gateway-prod.user}",
        pass:   "${secret:gateway-prod.pass}",
      },
    },
  ],
},
```

If `ag-bespoke-backend` / `ag-integrator` don't exist in `agents`, pick any two existing agent ids from the seed — the plan only needs *some* real ids so later rendering doesn't show "unknown agent". Verify by grepping for `id: "ag-` in `data.js`.

- [ ] **Step 5: Bump `index.html` cache version for `data.js`.**

Find `<script src="data.js?v=N"></script>` and increment `N`.

- [ ] **Step 6: Hard-reload and verify no regression.**

Open `http://localhost:8000/`. Expected: Console clean, app renders as before — no UI consumer reads `env` yet, so nothing visual should change. Open DevTools and run `window.AppData.projects.find(p => p.id === "proj-ai-report").env.roots.length` → should print `2`.

- [ ] **Step 7: Commit.**

```bash
git add data.js index.html
git commit -m "data: add env (roots + configs) to projects, seed reporting example"
```

---

## Chunk 2: Pure helpers in `CrudUI.jsx`

Goal: string/selector helpers that every consumer can import from `window`. No UI wiring yet; each helper is a pure function verifiable in the Console.

### Task 2: Add `slug`, `id6`, `resolveScratchPath`

**Files:**
- Modify: `CrudUI.jsx` (append below `useEntityStore`, before the bottom `Object.assign(window, {...})`)

- [ ] **Step 1: Locate the `Object.assign(window, {...})` line at the bottom of `CrudUI.jsx`.**

That's the export site. All helpers from this task get added above it.

- [ ] **Step 2: Add the three helpers.**

```js
function slug(name) {
  return String(name || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "untitled";
}

function id6(id) {
  // Strip the first "-" prefix (e.g., "proj-ab12cd" -> "ab12cd"), then take up to 6 chars.
  const s = String(id || "").split("-").slice(1).join("-");
  return (s || String(id || "")).slice(0, 6);
}

function resolveScratchPath({ base, project, session, agent, runId }) {
  const parts = [base || "~/.atelier"];
  if (project) parts.push(`${slug(project.name)}-${id6(project.id)}`);
  if (session) parts.push(`${slug(session.name)}-${id6(session.id)}`);
  if (agent)   parts.push(slug(agent.name));
  if (runId)   parts.push("runs", runId);
  return parts.join("/");
}

function newRunId() {
  return Math.random().toString(36).slice(2, 8);
}
```

- [ ] **Step 3: Add them to the window export.**

Extend the `Object.assign(window, {...})` with `slug, id6, resolveScratchPath, newRunId`.

- [ ] **Step 4: Hard-reload and verify in Console.**

```
slug("AI Report Templates")        → "ai-report-templates"
id6("proj-ab12cd34")               → "ab12cd"
resolveScratchPath({
  base: "~/.atelier",
  project: { id: "proj-ab12cd", name: "AI Report" },
  session: { id: "sess-ef56gh", name: "Sprint 1" },
  agent: { name: "java-dev" },
  runId: "xy9z3a",
})
→ "~/.atelier/ai-report-ab12cd/sprint-1-ef56gh/java-dev/runs/xy9z3a"
```

- [ ] **Step 5: Commit.**

```bash
git add CrudUI.jsx
git commit -m "env: add slug/id6/resolveScratchPath/newRunId helpers"
```

---

### Task 3: Add selectors (`isRootLocated`, `missingSecrets`, `resolveConfigFields`, `canDispatch`)

**Files:**
- Modify: `CrudUI.jsx` (same spot as Task 2)

- [ ] **Step 1: Add the selectors above the window export.**

```js
function isRootLocated(root, pathMap) {
  if (!root) return false;
  return Boolean(pathMap && pathMap[root.id]);
}

const SECRET_RE = /^\$\{secret:([^.}]+)\.([^}]+)\}$/;

// Returns the list of "{configName}.{fieldName}" keys whose placeholder is unresolved.
function missingSecrets(config, secrets) {
  if (!config || !config.fields) return [];
  const missing = [];
  Object.entries(config.fields).forEach(([fieldName, value]) => {
    const m = typeof value === "string" ? value.match(SECRET_RE) : null;
    if (!m) return;
    const [, cfgName, fName] = m;
    const key = `${cfgName}.${fName}`;
    if (!secrets || !secrets[key]) missing.push(key);
  });
  return missing;
}

// Returns a field map with placeholders substituted; unresolved fields map to `undefined`.
function resolveConfigFields(config, secrets) {
  const out = {};
  if (!config || !config.fields) return out;
  Object.entries(config.fields).forEach(([fieldName, value]) => {
    const m = typeof value === "string" ? value.match(SECRET_RE) : null;
    if (!m) { out[fieldName] = value; return; }
    const key = `${m[1]}.${m[2]}`;
    out[fieldName] = secrets ? secrets[key] : undefined;
  });
  return out;
}

// Returns { ok, reason } — ok=false blocks dispatch with a human-readable reason.
function canDispatch(agent, project, pathMap, secrets, { requiredConfigName } = {}) {
  if (!agent || !project) return { ok: false, reason: "Missing agent or project" };
  const env = project.env || { roots: [], configs: [] };
  const boundRoot = env.roots.find(r => r.agentId === agent.id);
  if (boundRoot && !isRootLocated(boundRoot, pathMap)) {
    return { ok: false, reason: `Root "${boundRoot.label}" is not located on this machine` };
  }
  if (requiredConfigName) {
    const cfg = env.configs.find(c => c.name === requiredConfigName);
    if (!cfg) return { ok: false, reason: `Config "${requiredConfigName}" not found in project` };
    const miss = missingSecrets(cfg, secrets);
    if (miss.length) return { ok: false, reason: `Missing secret: ${miss[0]}` };
  }
  return { ok: true };
}
```

- [ ] **Step 2: Extend the window export.**

Add `isRootLocated, missingSecrets, resolveConfigFields, canDispatch` to `Object.assign(window, {...})`.

- [ ] **Step 3: Hard-reload and verify in Console.**

```
const p = window.AppData.projects.find(x => x.id === "proj-ai-report");
missingSecrets(p.env.configs[0], {})
  → ["gateway-prod.user", "gateway-prod.pass"]
missingSecrets(p.env.configs[0], {"gateway-prod.user": "u", "gateway-prod.pass": "p"})
  → []
isRootLocated(p.env.roots[0], {})
  → false

// Exact dispatch check — use the agent id your Task 1 Step 4 bound to Java root
// (default "ag-bespoke-backend"; substitute whichever id you actually used):
const javaAgent = window.AppData.agents.find(a => a.id === "ag-bespoke-backend");
canDispatch(javaAgent, p, {}, {})
  → { ok: false, reason: 'Root "Java backend" is not located on this machine' }
canDispatch(javaAgent, p, { "root-rep-java": "/tmp/x" }, {})
  → { ok: true }

// Unbound agent (no root binding in any project):
const unboundAgent = window.AppData.agents.find(a => !window.AppData.projects.some(pr => (pr.env?.roots || []).some(r => r.agentId === a.id)));
canDispatch(unboundAgent, p, {}, {})
  → { ok: true }
```

- [ ] **Step 4: Commit.**

```bash
git add CrudUI.jsx
git commit -m "env: add selectors (isRootLocated, missingSecrets, resolveConfigFields, canDispatch)"
```

---

### Task 4: Add `useLocalEnvState` hook for `at.pathMap` / `at.secrets` / `at.scratchBase`

**Files:**
- Modify: `CrudUI.jsx` (a new hook alongside `useEntityStore`)

- [ ] **Step 1: Add the hook just below `useEntityStore`.**

```js
/* ——— Local env state (localStorage-backed, per-machine only) ——— */
function useLocalEnvState() {
  const readJson = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k) || "null") ?? fallback; }
    catch { return fallback; }
  };
  const [pathMap, setPathMap]         = React.useState(() => readJson("at.pathMap", {}));
  const [secrets, setSecrets]         = React.useState(() => readJson("at.secrets", {}));
  const [scratchBase, setScratchBase] = React.useState(() => localStorage.getItem("at.scratchBase") || "~/.atelier");

  React.useEffect(() => { localStorage.setItem("at.pathMap", JSON.stringify(pathMap)); }, [pathMap]);
  React.useEffect(() => { localStorage.setItem("at.secrets", JSON.stringify(secrets)); }, [secrets]);
  React.useEffect(() => { localStorage.setItem("at.scratchBase", scratchBase || "~/.atelier"); }, [scratchBase]);

  const setPath      = (rootId, absolutePath) => setPathMap(m => ({ ...m, [rootId]: absolutePath }));
  const clearPath    = (rootId)               => setPathMap(m => { const n = { ...m }; delete n[rootId]; return n; });
  const setSecret    = (cfgName, fieldName, v) => setSecrets(s => ({ ...s, [`${cfgName}.${fieldName}`]: v }));
  const clearSecret  = (cfgName, fieldName)    => setSecrets(s => { const n = { ...s }; delete n[`${cfgName}.${fieldName}`]; return n; });
  const renameConfig = (oldName, newName) => setSecrets(s => {
    const next = {};
    Object.entries(s).forEach(([k, v]) => {
      if (k.startsWith(oldName + ".")) next[newName + k.slice(oldName.length)] = v;
      else next[k] = v;
    });
    return next;
  });
  const setBase      = (p) => setScratchBase((p || "").trim() || "~/.atelier");

  return { pathMap, secrets, scratchBase, setPath, clearPath, setSecret, clearSecret, renameConfig, setBase };
}
```

- [ ] **Step 2: Export it.**

Add `useLocalEnvState` to the bottom `Object.assign(window, {...})`.

- [ ] **Step 3: Hard-reload, verify no console errors.**

The hook isn't mounted yet (Task 7 will mount it in `App.jsx`), so visually nothing changes.

- [ ] **Step 4: Commit.**

```bash
git add CrudUI.jsx
git commit -m "env: add useLocalEnvState hook (pathMap/secrets/scratchBase in localStorage)"
```

---

## Chunk 3: Store mutations for env

Goal: `useEntityStore` grows env mutation helpers that go through `updateProject`. Uniqueness guard on `agentId` lives here.

### Task 5: Add `addRoot`, `updateRoot`, `removeRoot`

**Files:**
- Modify: `CrudUI.jsx` (inside `useEntityStore`, near the existing `createProject` etc.)

- [ ] **Step 1: Inside `useEntityStore`, below `createProject`, add root helpers.**

```js
const addRoot = React.useCallback((projectId, { label, kind, repoUrl, branch, agentId }) => {
  let error = null;
  setState(s => {
    const p = s.projects.find(x => x.id === projectId);
    if (!p) { error = "Project not found"; return s; }
    const env = p.env || { roots: [], configs: [] };
    if (agentId && env.roots.some(r => r.agentId === agentId)) {
      error = `Agent already bound to "${env.roots.find(r => r.agentId === agentId).label}"`;
      return s;
    }
    const root = {
      id: `root-${Date.now().toString(36)}`,
      label: label || "New root",
      kind: kind || "other",
      repo: repoUrl ? { type: "git", url: repoUrl, branch: branch || "main" } : null,
      agentId: agentId || null,
    };
    return { ...s, projects: s.projects.map(x => x.id === projectId ? { ...x, env: { ...env, roots: [...env.roots, root] } } : x) };
  });
  return error;
}, []);

const updateRoot = React.useCallback((projectId, rootId, patch) => {
  let error = null;
  setState(s => {
    const p = s.projects.find(x => x.id === projectId);
    if (!p) { error = "Project not found"; return s; }
    const env = p.env || { roots: [], configs: [] };
    if ("agentId" in patch && patch.agentId && env.roots.some(r => r.agentId === patch.agentId && r.id !== rootId)) {
      error = `Agent already bound to "${env.roots.find(r => r.agentId === patch.agentId).label}"`;
      return s;
    }
    return {
      ...s,
      projects: s.projects.map(x => x.id !== projectId ? x : {
        ...x,
        env: { ...env, roots: env.roots.map(r => r.id === rootId ? { ...r, ...patch } : r) },
      }),
    };
  });
  return error;
}, []);

const removeRoot = React.useCallback((projectId, rootId) => {
  setState(s => {
    const p = s.projects.find(x => x.id === projectId);
    if (!p) return s;
    const env = p.env || { roots: [], configs: [] };
    return {
      ...s,
      projects: s.projects.map(x => x.id !== projectId ? x : {
        ...x,
        env: { ...env, roots: env.roots.filter(r => r.id !== rootId) },
      }),
    };
  });
}, []);
```

- [ ] **Step 2: Return them from `useEntityStore`.**

Find the `return { state, create, update, remove, duplicate, ... }` line inside `useEntityStore` and append `addRoot, updateRoot, removeRoot`.

- [ ] **Step 3: Hard-reload and verify in Console.**

Open DevTools Console and use the React DevTools, or (simpler) add a one-time log at the top of `App.jsx`:

```js
window.__store = store;   // TEMP — remove after verification
```

Then in Console:

```
window.__store.addRoot("proj-pricing", { label: "Test", kind: "other", repoUrl: "g.com/t/r" })
  → null (no error)
window.AppData.projects.find(p => p.id === "proj-pricing")   // still flat
// The store state is what UI reads; check store.state instead:
window.__store.state.projects.find(p => p.id === "proj-pricing").env.roots
  → [{id:"root-…", label:"Test", …}]
window.__store.addRoot("proj-pricing", { agentId: "ag-whatever", label: "A" })
window.__store.addRoot("proj-pricing", { agentId: "ag-whatever", label: "B" })
  → second call returns "Agent already bound to \"A\""
```

Remove the `window.__store` line before committing.

- [ ] **Step 4: Commit.**

```bash
git add CrudUI.jsx
git commit -m "env: add addRoot/updateRoot/removeRoot helpers with agentId uniqueness check"
```

---

### Task 6: Add `addConfig`, `updateConfig`, `removeConfig`

**Files:**
- Modify: `CrudUI.jsx` (inside `useEntityStore`, next to root helpers from Task 5)

- [ ] **Step 1: Add config helpers below the root helpers.**

```js
const addConfig = React.useCallback((projectId, { name, fields }) => {
  setState(s => {
    const p = s.projects.find(x => x.id === projectId);
    if (!p) return s;
    const env = p.env || { roots: [], configs: [] };
    const config = {
      id: `cfg-${Date.now().toString(36)}`,
      name: name || "new-config",
      fields: fields || {},
    };
    return { ...s, projects: s.projects.map(x => x.id === projectId ? { ...x, env: { ...env, configs: [...env.configs, config] } } : x) };
  });
}, []);

const updateConfig = React.useCallback((projectId, configId, patch) => {
  setState(s => {
    const p = s.projects.find(x => x.id === projectId);
    if (!p) return s;
    const env = p.env || { roots: [], configs: [] };
    return {
      ...s,
      projects: s.projects.map(x => x.id !== projectId ? x : {
        ...x,
        env: { ...env, configs: env.configs.map(c => c.id === configId ? { ...c, ...patch } : c) },
      }),
    };
  });
}, []);

const removeConfig = React.useCallback((projectId, configId) => {
  setState(s => {
    const p = s.projects.find(x => x.id === projectId);
    if (!p) return s;
    const env = p.env || { roots: [], configs: [] };
    return {
      ...s,
      projects: s.projects.map(x => x.id !== projectId ? x : {
        ...x,
        env: { ...env, configs: env.configs.filter(c => c.id !== configId) },
      }),
    };
  });
}, []);
```

- [ ] **Step 2: Return them from `useEntityStore`.**

Append `addConfig, updateConfig, removeConfig` to the store's return value.

- [ ] **Step 3: Hard-reload; smoke-check (no Console errors).**

- [ ] **Step 4: Commit.**

```bash
git add CrudUI.jsx
git commit -m "env: add addConfig/updateConfig/removeConfig helpers"
```

Note: Renaming a config group also needs to rename the associated secret keys in `at.secrets`. That is handled by calling both `store.updateConfig(...)` and `localEnv.renameConfig(oldName, newName)` from the UI consumer (Task 14). Keeping them separate preserves the "store mutates project data; localEnv mutates localStorage" boundary.

---

## Chunk 4: Environment panel — read-only rendering

Goal: `Environment.jsx` exists, loads from `index.html`, and `TeamView.jsx` mounts it when `rightView === "env"`. Read-only first; interactions arrive in later chunks.

### Task 7: Create `Environment.jsx` skeleton and load it

**Files:**
- Create: `Environment.jsx`
- Modify: `index.html`

- [ ] **Step 1: Create `Environment.jsx` with a stub panel.**

```jsx
// Environment panel — right-column tab showing a project's roots, configs, and scratch info.

function EnvironmentPanel({ project, localEnv, store, agents, onAddRootViaChat }) {
  if (!project) {
    return (
      <div className="env-empty">
        <div className="muted">No project selected.</div>
      </div>
    );
  }
  const env = project.env || { roots: [], configs: [] };
  return (
    <div className="env-panel">
      <div className="env-section">
        <div className="env-section-head">
          <span>Roots</span>
          <button className="env-add-btn" onClick={() => onAddRootViaChat && onAddRootViaChat()}>+ Add root</button>
        </div>
        {env.roots.length === 0
          ? <div className="env-empty-row muted">No roots yet. Click + Add root to ask the orchestrator.</div>
          : env.roots.map(root => <RootCard key={root.id} root={root} project={project} localEnv={localEnv} store={store} agents={agents} />)}
      </div>

      <div className="env-section">
        <div className="env-section-head">
          <span>Configs</span>
          <button className="env-add-btn">+ Add group</button>
        </div>
        {env.configs.length === 0
          ? <div className="env-empty-row muted">No configs yet.</div>
          : env.configs.map(cfg => <ConfigCard key={cfg.id} config={cfg} project={project} localEnv={localEnv} store={store} />)}
      </div>

      <ScratchCard project={project} localEnv={localEnv} />
    </div>
  );
}

function RootCard({ root, project, localEnv, store, agents }) {
  const located = window.isRootLocated(root, localEnv.pathMap);
  const boundAgent = root.agentId ? (agents || []).find(a => a.id === root.agentId) : null;
  return (
    <div className={`env-card env-card--root ${located ? "is-located" : "is-unlocated"}`}>
      <div className="env-card-head">
        <span className="env-card-title">{root.label}</span>
        <span className={`env-kind env-kind--${root.kind || "other"}`}>{root.kind || "other"}</span>
      </div>
      <div className="env-card-row"><span className="env-card-label">repo</span>  <span>{root.repo?.url || "—"}</span></div>
      <div className="env-card-row"><span className="env-card-label">agent</span> <span>{boundAgent ? `🤖 ${boundAgent.name}` : <em className="muted">unbound</em>}</span></div>
      <div className="env-card-row">
        <span className="env-card-label">local</span>
        <span>
          {located
            ? <><span className="env-badge env-badge--ok">✓</span> <code>{localEnv.pathMap[root.id]}</code></>
            : <><span className="env-badge env-badge--warn">🔗</span> Not located on this machine</>}
        </span>
      </div>
    </div>
  );
}

function ConfigCard({ config, project, localEnv }) {
  const missing = window.missingSecrets(config, localEnv.secrets);
  return (
    <div className={`env-card env-card--config ${missing.length ? "is-missing" : "is-complete"}`}>
      <div className="env-card-head">
        <span className="env-card-title">{config.name}</span>
        <span className="muted">{Object.keys(config.fields || {}).length} fields</span>
      </div>
      <div className="env-card-fields">
        {Object.entries(config.fields || {}).map(([k, v]) => {
          const m = typeof v === "string" && v.match(/^\$\{secret:([^.}]+)\.([^}]+)\}$/);
          const isSecret = Boolean(m);
          const secretKey = m ? `${m[1]}.${m[2]}` : null;
          const has = isSecret ? Boolean(localEnv.secrets[secretKey]) : true;
          return (
            <span key={k} className={`env-field ${has ? "has-value" : "is-missing"}`}>
              {k} {has ? "✓" : "⚠"}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ScratchCard({ project, localEnv }) {
  const projectPath = window.resolveScratchPath({ base: localEnv.scratchBase, project });
  return (
    <div className="env-section">
      <div className="env-section-head">
        <span>Scratch</span>
        <button className="env-add-btn">Change base…</button>
      </div>
      <div className="env-card env-card--scratch">
        <div className="env-card-row"><span className="env-card-label">base</span>    <code>{localEnv.scratchBase}</code></div>
        <div className="env-card-row"><span className="env-card-label">project</span> <code>{projectPath}/</code></div>
      </div>
    </div>
  );
}

Object.assign(window, { EnvironmentPanel, RootCard, ConfigCard, ScratchCard });
```

- [ ] **Step 2: Load `Environment.jsx` in `index.html`.**

Insert between the `Chat.jsx` and `TeamView.jsx` script tags:

```html
<script type="text/babel" src="Environment.jsx"></script>
```

Order must be: `... Chat.jsx → Environment.jsx → TeamView.jsx → ...`. TeamView will call `window.EnvironmentPanel`.

- [ ] **Step 3: Hard-reload; confirm Console clean.**

The panel isn't mounted yet — nothing visible changes. Verify in Console:

```
typeof window.EnvironmentPanel   → "function"
typeof window.RootCard           → "function"
```

- [ ] **Step 4: Commit.**

```bash
git add Environment.jsx index.html
git commit -m "env: add Environment.jsx panel skeleton (EnvironmentPanel/RootCard/ConfigCard/ScratchCard)"
```

---

### Task 8: Seed `useLocalEnvState` in `App.jsx` and thread down

**Files:**
- Modify: `App.jsx`

- [ ] **Step 1: Mount the hook near the top of `App()`.**

Find the line that calls `useEntityStore()` and add, right below it:

```js
const localEnv = window.useLocalEnvState();
```

- [ ] **Step 2: Resolve the active project once, per render.**

Below `const localEnv = …`, add:

```js
const currentProject = store.state.projects.find(p => p.id === currentProjectId) || null;
```

If this variable already exists under another name in your codebase (e.g., from projects-sessions work), reuse it instead of creating a duplicate.

- [ ] **Step 3: Pass `localEnv`, `currentProject`, `store`, `agents` into `TeamView`.**

Find the `<TeamView ... />` invocation. Add:

```jsx
<TeamView
  ...existing props...
  project={currentProject}
  localEnv={localEnv}
  store={store}
  agents={store.state.agents}
  onAddRootViaChat={() => {
    // Focus composer with prefilled text. Implementation lands in a follow-up pass;
    // for now, no-op keeps the button harmless.
  }}
/>
```

- [ ] **Step 4: Hard-reload; confirm Console clean and no visual regression.**

The new props are not yet consumed by TeamView. App still renders identically.

- [ ] **Step 5: Commit.**

```bash
git add App.jsx
git commit -m "env: mount useLocalEnvState in App and thread project/localEnv into TeamView"
```

---

### Task 9: Add `"env"` to `TeamView`'s right-column switcher

**Files:**
- Modify: `TeamView.jsx`

- [ ] **Step 1: Find the view switcher.**

`TeamView.jsx` has a tab strip that toggles between `kanban | canvas | roster` (driven by `rightView` prop / callback). Locate it.

- [ ] **Step 2: Add an `Env` tab.**

In the tab strip JSX, append:

```jsx
<button
  className={`tv-tab ${rightView === "env" ? "is-active" : ""}`}
  onClick={() => setRightView("env")}
>
  Env
</button>
```

- [ ] **Step 3: Add the `"env"` case to the panel body switch.**

Below the existing `kanban | canvas | roster` branches:

```jsx
{rightView === "env" && (
  <window.EnvironmentPanel
    project={project}
    localEnv={localEnv}
    store={store}
    agents={agents}
    onAddRootViaChat={onAddRootViaChat}
  />
)}
```

- [ ] **Step 4: Ensure the new props are destructured from `TeamView`'s signature.**

Change `function TeamView({ ... })` to include `project, localEnv, store, agents, onAddRootViaChat` alongside the existing props.

- [ ] **Step 5: Hard-reload and verify visually.**

- Right panel tab strip now shows a new `Env` tab at the end.
- Click `Env` → panel shows `Roots`, `Configs`, `Scratch` sections.
- On `proj-ai-report`, expect: 2 root cards (java + go, both `🔗 Not located on this machine`), 1 config card (`gateway-prod` with 3 fields, user/pass badges show `⚠`), and a scratch card with a derived path like `~/.atelier/ai-report-templates-…/`.
- On `proj-lighthouse`, expect: 1 root card (Docs & specs, `🔗 Not located`, agent = unbound), 0 configs.
- On `proj-pricing` and `proj-outage`, expect empty roots/configs sections with their muted empty-state lines.

- [ ] **Step 6: Verify `rightView` persists via `at.right`.**

Click `Env` → hard-reload → tab stays on `Env`. (`at.right` is an existing `localStorage` key from projects-sessions; adding `"env"` as a value requires no new code.)

- [ ] **Step 7: Commit.**

```bash
git add TeamView.jsx
git commit -m "env: add Env tab to right-column switcher, mount EnvironmentPanel"
```

---

## Chunk 5: Locate flow

Goal: user can resolve a root's local path. On fresh `localStorage`, an `InlineNotice` in the chat thread offers `Locate all`; individual `Locate…` buttons live on each unresolved root card.

### Task 10: Add `LocateModal` and `Locate…` action on `RootCard`

**Files:**
- Modify: `Environment.jsx`

- [ ] **Step 1: Add a `LocateModal` component.**

Above `Object.assign(window, {...})`:

```jsx
function LocateModal({ root, onSave, onCancel }) {
  const [value, setValue] = React.useState("");
  if (!root) return null;
  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal env-locate-modal" onClick={e => e.stopPropagation()}>
        <h3>Locate on this machine</h3>
        <div className="env-card-row"><span className="env-card-label">label</span> <span>{root.label}</span></div>
        <div className="env-card-row"><span className="env-card-label">repo</span>  <span>{root.repo?.url || "—"}</span></div>
        <label className="env-locate-field">
          <div>Path on this machine</div>
          <input
            type="text"
            value={value}
            autoFocus
            placeholder="/Users/you/work/repo"
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && value.trim()) onSave(value.trim()); }}
          />
        </label>
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={!value.trim()} onClick={() => onSave(value.trim())}>Save</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LocateModal });   // add alongside existing exports
```

Merge the `LocateModal` export into the existing `Object.assign(window, {...})` line at the bottom — don't add a second `Object.assign`.

- [ ] **Step 2: Wire `[Locate…]` into `RootCard`.**

Modify `RootCard` to manage modal state and render the button:

```jsx
function RootCard({ root, project, localEnv, store, agents }) {
  const [locating, setLocating] = React.useState(false);
  const located = window.isRootLocated(root, localEnv.pathMap);
  const boundAgent = root.agentId ? (agents || []).find(a => a.id === root.agentId) : null;
  return (
    <>
      <div className={`env-card env-card--root ${located ? "is-located" : "is-unlocated"}`}>
        <div className="env-card-head">
          <span className="env-card-title">{root.label}</span>
          <span className={`env-kind env-kind--${root.kind || "other"}`}>{root.kind || "other"}</span>
        </div>
        <div className="env-card-row"><span className="env-card-label">repo</span>  <span>{root.repo?.url || "—"}</span></div>
        <div className="env-card-row"><span className="env-card-label">agent</span> <span>{boundAgent ? `🤖 ${boundAgent.name}` : <em className="muted">unbound</em>}</span></div>
        <div className="env-card-row">
          <span className="env-card-label">local</span>
          <span>
            {located
              ? <><span className="env-badge env-badge--ok">✓</span> <code>{localEnv.pathMap[root.id]}</code></>
              : <>
                  <span className="env-badge env-badge--warn">🔗</span> Not located
                  <button className="env-inline-btn" onClick={() => setLocating(true)}>Locate…</button>
                </>}
          </span>
        </div>
      </div>
      {locating && (
        <window.LocateModal
          root={root}
          onCancel={() => setLocating(false)}
          onSave={(p) => { localEnv.setPath(root.id, p); setLocating(false); }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Hard-reload and verify.**

- On `proj-ai-report`, each unlocated root card shows `Locate…`.
- Click `Locate…` on Java root → modal opens with label/repo pre-filled.
- Type `/Users/test/java-repo` → Save → modal closes, card shows `✓ /Users/test/java-repo`.
- Refresh page → path persists via `at.pathMap`.
- In Console: `JSON.parse(localStorage.getItem("at.pathMap"))` → `{"root-rep-java":"/Users/test/java-repo"}`.

- [ ] **Step 4: Commit.**

```bash
git add Environment.jsx
git commit -m "env: LocateModal + per-root Locate… action writes at.pathMap"
```

---

### Task 11: Add top-of-thread `InlineNotice` for unresolved roots

**Files:**
- Modify: `Chat.jsx` (add `InlineNotice` if not already added by projects-sessions; or extend its variants)
- Modify: `App.jsx` (surface the notice above the message list)

- [ ] **Step 1: Verify `InlineNotice` exists in `Chat.jsx`.**

Projects-sessions §4.4 promises an `InlineNotice` component. Grep for it in `Chat.jsx`. If it doesn't exist yet, add a minimal version:

```jsx
function InlineNotice({ tone = "info", icon = "🔗", text, action, onAction }) {
  return (
    <div className={`inline-notice inline-notice--${tone}`}>
      <span className="inline-notice-icon">{icon}</span>
      <span className="inline-notice-text">{text}</span>
      {action && <button className="inline-notice-btn" onClick={onAction}>{action}</button>}
    </div>
  );
}
Object.assign(window, { InlineNotice });
```

- [ ] **Step 2: Compute unresolved roots in `App.jsx`.**

Below `const currentProject = …`:

```js
const unresolvedRoots = (currentProject?.env?.roots || []).filter(r => !localEnv.pathMap[r.id]);
```

- [ ] **Step 3: Render the notice above the chat message list.**

Find where `<ChatArea ... />` or its message list mounts. Just above it, add:

```jsx
{currentProject && unresolvedRoots.length > 0 && (
  <window.InlineNotice
    tone="warn"
    icon="🔗"
    text={`This project has ${unresolvedRoots.length} root${unresolvedRoots.length > 1 ? "s" : ""} not located on this machine.`}
    action="Locate all"
    onAction={() => { setRightView("env"); /* Env tab is where the user can Locate each */ }}
  />
)}
```

If `setRightView` is not directly accessible in this scope, pass it from wherever it's defined; in current `App.jsx` it lives in the same scope as `rightView`.

- [ ] **Step 4: Hard-reload and verify.**

- On `proj-ai-report` with clean `localStorage` → notice appears above the chat: "This project has 2 roots not located on this machine. [Locate all]".
- Click `Locate all` → right panel switches to Env tab.
- Locate both roots via the cards → notice disappears.
- Refresh → with paths in `at.pathMap`, notice is gone; clearing `localStorage.clear()` and reloading brings it back.

- [ ] **Step 5: Commit.**

```bash
git add Chat.jsx App.jsx
git commit -m "env: InlineNotice above chat thread for unresolved roots with Locate all action"
```

---

## Chunk 6: Inline edits via `⋯` menu

Goal: existing roots/configs can be edited without the orchestrator — change agent, change path, rename config, remove. Each is a one-field inline popover anchored to the card.

### Task 12: Add `InlineEditPopover` and `⋯` menu on `RootCard`

**Files:**
- Modify: `Environment.jsx`

- [ ] **Step 1: Add `InlineEditPopover` component.**

A generic popover that renders whatever children are passed:

```jsx
function InlineEditPopover({ anchorRef, open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="inline-edit-scrim" onClick={onClose}>
      <div className="inline-edit-popover" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
Object.assign(window, { InlineEditPopover });
```

(Merge into existing `Object.assign(window, {...})` line.)

- [ ] **Step 2: Add a `⋯` button to `RootCard` with a menu.**

Replace the `env-card-head` block with a version that includes the menu. State: `menuOpen`, `editing` (one of `null | "rename" | "agent" | "repo" | "path"`).

```jsx
function RootCard({ root, project, localEnv, store, agents }) {
  const [locating, setLocating] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editing,  setEditing]  = React.useState(null);   // null | "rename" | "agent" | "repo" | "path"
  const [error,    setError]    = React.useState(null);
  const located = window.isRootLocated(root, localEnv.pathMap);
  const boundAgent = root.agentId ? (agents || []).find(a => a.id === root.agentId) : null;

  const closeAll = () => { setMenuOpen(false); setEditing(null); setError(null); };

  return (
    <>
      <div className={`env-card env-card--root ${located ? "is-located" : "is-unlocated"}`}>
        <div className="env-card-head">
          <span className="env-card-title">{root.label}</span>
          <span className={`env-kind env-kind--${root.kind || "other"}`}>{root.kind || "other"}</span>
          <button className="env-card-more" onClick={() => setMenuOpen(v => !v)}>⋯</button>
        </div>
        {/* ...existing repo/agent/local rows unchanged... */}
      </div>

      <window.InlineEditPopover open={menuOpen} onClose={closeAll}>
        <button onClick={() => { setMenuOpen(false); setEditing("rename"); }}>Rename</button>
        <button onClick={() => { setMenuOpen(false); setEditing("agent");  }}>Change agent</button>
        <button onClick={() => { setMenuOpen(false); setEditing("repo");   }}>Change repo URL</button>
        <button onClick={() => { setMenuOpen(false); setEditing("path");   }}>
          {located ? "Change local path" : "Locate…"}
        </button>
        <button className="danger" onClick={() => { setMenuOpen(false); store.removeRoot(project.id, root.id); localEnv.clearPath(root.id); }}>
          Remove
        </button>
      </window.InlineEditPopover>

      <window.InlineEditPopover open={editing === "rename"} onClose={closeAll}>
        <EditLabel root={root} onSave={(label) => { store.updateRoot(project.id, root.id, { label }); closeAll(); }} onCancel={closeAll} />
      </window.InlineEditPopover>

      <window.InlineEditPopover open={editing === "agent"} onClose={closeAll}>
        <EditAgent root={root} agents={agents} onSave={(agentId) => {
          const err = store.updateRoot(project.id, root.id, { agentId: agentId || null });
          if (err) setError(err); else closeAll();
        }} onCancel={closeAll} error={error} />
      </window.InlineEditPopover>

      <window.InlineEditPopover open={editing === "repo"} onClose={closeAll}>
        <EditRepo root={root} onSave={(url) => {
          store.updateRoot(project.id, root.id, { repo: { ...(root.repo || { type: "git", branch: "main" }), url } });
          closeAll();
        }} onCancel={closeAll} />
      </window.InlineEditPopover>

      {editing === "path" && (
        <window.LocateModal
          root={root}
          onCancel={closeAll}
          onSave={(p) => { localEnv.setPath(root.id, p); closeAll(); }}
        />
      )}
    </>
  );
}

function EditLabel({ root, onSave, onCancel }) {
  const [v, setV] = React.useState(root.label);
  return (
    <div className="inline-edit-body">
      <input type="text" value={v} autoFocus onChange={e => setV(e.target.value)}
             onKeyDown={e => e.key === "Enter" && onSave(v)} />
      <div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary" onClick={() => onSave(v)}>Save</button></div>
    </div>
  );
}

function EditAgent({ root, agents, onSave, onCancel, error }) {
  const [v, setV] = React.useState(root.agentId || "");
  return (
    <div className="inline-edit-body">
      <select value={v} onChange={e => setV(e.target.value)}>
        <option value="">— unbound —</option>
        {(agents || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      {error && <div className="inline-edit-error">{error}</div>}
      <div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary" onClick={() => onSave(v)}>Save</button></div>
    </div>
  );
}

function EditRepo({ root, onSave, onCancel }) {
  const [v, setV] = React.useState(root.repo?.url || "");
  return (
    <div className="inline-edit-body">
      <input type="text" value={v} autoFocus onChange={e => setV(e.target.value)}
             onKeyDown={e => e.key === "Enter" && onSave(v)} placeholder="github.com/acme/repo" />
      <div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary" onClick={() => onSave(v)}>Save</button></div>
    </div>
  );
}
```

Export `EditLabel`, `EditAgent`, `EditRepo` via the bottom `Object.assign(window, {...})` to keep everything on `window` for consistency.

- [ ] **Step 2: Hard-reload and verify all five menu actions.**

On a root card:
1. Click `⋯` → menu opens.
2. `Rename` → popover with text input → type new name → Save → card updates. Reload to confirm (project data persists within session).
3. `Change agent` → select another agent → Save. Pick an agent already bound to another root → inline error renders below the select.
4. `Change repo URL` → edit → Save → card updates.
5. `Change local path` (or `Locate…` if unresolved) → existing `LocateModal` flow.
6. `Remove` → card disappears, `at.pathMap` entry is cleared (Console: `JSON.parse(localStorage.getItem("at.pathMap"))`).

- [ ] **Step 3: Commit.**

```bash
git add Environment.jsx
git commit -m "env: inline-edit popover (rename / change agent / change repo / remove) on RootCard"
```

---

### Task 13: `⋯` menu on `ConfigCard` — rename + edit fields + remove

**Files:**
- Modify: `Environment.jsx`

- [ ] **Step 1: Add menu state + actions to `ConfigCard`.**

```jsx
function ConfigCard({ config, project, localEnv, store }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editing,  setEditing]  = React.useState(null);   // null | "rename" | { field: string }
  const missing = window.missingSecrets(config, localEnv.secrets);
  const closeAll = () => { setMenuOpen(false); setEditing(null); };

  return (
    <>
      <div className={`env-card env-card--config ${missing.length ? "is-missing" : "is-complete"}`}>
        <div className="env-card-head">
          <span className="env-card-title">{config.name}</span>
          <span className="muted">{Object.keys(config.fields || {}).length} fields</span>
          <button className="env-card-more" onClick={() => setMenuOpen(v => !v)}>⋯</button>
        </div>
        <div className="env-card-fields">
          {Object.entries(config.fields || {}).map(([k, v]) => {
            const m = typeof v === "string" && v.match(/^\$\{secret:([^.}]+)\.([^}]+)\}$/);
            const isSecret = Boolean(m);
            const secretKey = m ? `${m[1]}.${m[2]}` : null;
            const has = isSecret ? Boolean(localEnv.secrets[secretKey]) : true;
            return (
              <button key={k} className={`env-field ${has ? "has-value" : "is-missing"}`} onClick={() => setEditing({ field: k })}>
                {k} {has ? "✓" : "⚠"}
              </button>
            );
          })}
        </div>
      </div>

      <window.InlineEditPopover open={menuOpen} onClose={closeAll}>
        <button onClick={() => { setMenuOpen(false); setEditing("rename"); }}>Rename group</button>
        <button className="danger" onClick={() => {
          setMenuOpen(false);
          store.removeConfig(project.id, config.id);
          // Clear all secrets keyed under this config name. Field names may contain dots,
          // so split only on the first '.' (String.split(".", 2) DROPS trailing parts in JS).
          const prefix = config.name + ".";
          Object.keys(localEnv.secrets).forEach(k => {
            if (k.startsWith(prefix)) localEnv.clearSecret(config.name, k.slice(prefix.length));
          });
        }}>Remove</button>
      </window.InlineEditPopover>

      <window.InlineEditPopover open={editing === "rename"} onClose={closeAll}>
        <EditConfigName
          config={config}
          onSave={(newName) => {
            store.updateConfig(project.id, config.id, { name: newName });
            localEnv.renameConfig(config.name, newName);
            // Rewrite placeholders inside fields that referenced the old name
            const patchedFields = {};
            Object.entries(config.fields || {}).forEach(([k, v]) => {
              if (typeof v === "string") patchedFields[k] = v.replace(new RegExp(`\\$\\{secret:${config.name}\\.`, "g"), `\${secret:${newName}.`);
              else patchedFields[k] = v;
            });
            store.updateConfig(project.id, config.id, { fields: patchedFields });
            closeAll();
          }}
          onCancel={closeAll}
        />
      </window.InlineEditPopover>

      {editing && typeof editing === "object" && editing.field && (
        <window.InlineEditPopover open={true} onClose={closeAll}>
          <EditConfigField
            config={config}
            fieldName={editing.field}
            currentValue={config.fields[editing.field]}
            currentSecret={localEnv.secrets[`${config.name}.${editing.field}`]}
            onSave={(raw) => {
              const v = config.fields[editing.field];
              const m = typeof v === "string" && v.match(/^\$\{secret:([^.}]+)\.([^}]+)\}$/);
              if (m) localEnv.setSecret(m[1], m[2], raw);
              else store.updateConfig(project.id, config.id, { fields: { ...config.fields, [editing.field]: raw } });
              closeAll();
            }}
            onCancel={closeAll}
          />
        </window.InlineEditPopover>
      )}
    </>
  );
}

function EditConfigName({ config, onSave, onCancel }) {
  const [v, setV] = React.useState(config.name);
  return (
    <div className="inline-edit-body">
      <input type="text" value={v} autoFocus onChange={e => setV(e.target.value)}
             onKeyDown={e => e.key === "Enter" && onSave(v)} />
      <div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary" onClick={() => onSave(v)}>Save</button></div>
    </div>
  );
}

function EditConfigField({ config, fieldName, currentValue, currentSecret, onSave, onCancel }) {
  const isSecret = typeof currentValue === "string" && /^\$\{secret:/.test(currentValue);
  const [v, setV] = React.useState(isSecret ? (currentSecret || "") : (currentValue || ""));
  return (
    <div className="inline-edit-body">
      <div className="muted">{config.name}.{fieldName} {isSecret && <em>(secret — stored on this machine only)</em>}</div>
      <input type={isSecret ? "password" : "text"} value={v} autoFocus onChange={e => setV(e.target.value)}
             onKeyDown={e => e.key === "Enter" && onSave(v)} />
      <div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary" onClick={() => onSave(v)}>Save</button></div>
    </div>
  );
}
```

Export `EditConfigName`, `EditConfigField` via the `Object.assign` line.

- [ ] **Step 2: Hard-reload and verify.**

On `proj-ai-report`'s `gateway-prod` card:
1. Click `⋯` → Rename group → type `gateway-production` → Save. Fields still visible; internally the secret keys migrated (Console: `JSON.parse(localStorage.getItem("at.secrets"))` shows the renamed prefix).
2. Click the `user ⚠` chip → password-style input → type `alice` → Save. Chip turns `user ✓`.
3. Click `pass ⚠` → type `s3cret` → Save. Card-level class flips from `is-missing` to `is-complete`.
4. Click `⋯` → Remove → card disappears. All `gateway-production.*` keys are purged from `at.secrets`.

- [ ] **Step 3: Commit.**

```bash
git add Environment.jsx
git commit -m "env: inline-edit popover on ConfigCard — rename group, fill secrets, remove"
```

---

### Task 14: `Change base…` for scratch + `+ Add root` focuses chat composer

**Files:**
- Modify: `Environment.jsx`
- Modify: `App.jsx`
- Modify: `Chat.jsx` (expose composer-ref for programmatic focus)

- [ ] **Step 1: Wire `Change base…` in `ScratchCard`.**

Update `ScratchCard` to open an inline popover:

```jsx
function ScratchCard({ project, localEnv }) {
  const [editing, setEditing] = React.useState(false);
  const projectPath = window.resolveScratchPath({ base: localEnv.scratchBase, project });
  return (
    <div className="env-section">
      <div className="env-section-head">
        <span>Scratch</span>
        <button className="env-add-btn" onClick={() => setEditing(true)}>Change base…</button>
      </div>
      <div className="env-card env-card--scratch">
        <div className="env-card-row"><span className="env-card-label">base</span>    <code>{localEnv.scratchBase}</code></div>
        <div className="env-card-row"><span className="env-card-label">project</span> <code>{projectPath}/</code></div>
      </div>
      <window.InlineEditPopover open={editing} onClose={() => setEditing(false)}>
        <EditScratchBase localEnv={localEnv} onSave={(p) => { localEnv.setBase(p); setEditing(false); }} onCancel={() => setEditing(false)} />
      </window.InlineEditPopover>
    </div>
  );
}

function EditScratchBase({ localEnv, onSave, onCancel }) {
  const [v, setV] = React.useState(localEnv.scratchBase);
  return (
    <div className="inline-edit-body">
      <input type="text" value={v} autoFocus onChange={e => setV(e.target.value)}
             onKeyDown={e => e.key === "Enter" && onSave(v)} placeholder="~/.atelier" />
      <div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary" onClick={() => onSave(v)}>Save</button></div>
    </div>
  );
}
```

Export `EditScratchBase` via the `Object.assign` line.

- [ ] **Step 2: Make `+ Add root` focus the chat composer with a prefilled message.**

In `App.jsx`, replace the stub `onAddRootViaChat` from Task 8 with:

```jsx
const composerRef = React.useRef(null);
...
onAddRootViaChat={() => {
  setPage("chat");
  setRightView("env");
  if (composerRef.current) {
    composerRef.current.setValue("Add a root: ");
    composerRef.current.focus();
  }
}}
```

Then pass `composerRef` through to `<ChatArea ... composerRef={composerRef} />`.

- [ ] **Step 3: Expose `setValue` + `focus` on the composer.**

In `Chat.jsx`, find the `Composer` component. Use `React.forwardRef` and `React.useImperativeHandle` so the parent ref exposes `{ setValue, focus }`:

```jsx
const Composer = React.forwardRef(function Composer({ ...existing props... }, ref) {
  const [value, setValue] = React.useState("");
  const inputRef = React.useRef(null);
  React.useImperativeHandle(ref, () => ({
    setValue: (v) => setValue(v),
    focus:    () => inputRef.current?.focus(),
  }));
  // ...existing JSX, bind inputRef to the <textarea> / <input> and value to state...
});
```

If `Composer` already manages its internal value state differently, adapt the ref to match — the contract that matters is `{ setValue, focus }`.

Make sure `ChatArea` forwards the `composerRef` down into `<Composer ref={composerRef} ... />`.

- [ ] **Step 4: Hard-reload and verify.**

- On the Env panel, click `+ Add root` → chat page is selected → right panel switches to `Env` tab (user sees their current env) → composer has `Add a root: ` prefilled and is focused, ready to type.
- On `ScratchCard`, click `Change base…` → popover with current base → change to `/tmp/atelier` → Save → both `base` and `project` rows update immediately. `JSON.parse(localStorage.getItem("at.scratchBase"))` is not right — it's a plain string: `localStorage.getItem("at.scratchBase")` → `"/tmp/atelier"`.

- [ ] **Step 5: Commit.**

```bash
git add Environment.jsx App.jsx Chat.jsx
git commit -m "env: Change base… inline edit + add-root focuses chat composer with prefix"
```

---

## Chunk 7: Dispatch guards

Goal: when the orchestrator would dispatch a task to a root-bound agent whose root is unlocated, or reference a config whose secret is missing, an `InlineNotice` appears inline in the chat and the dispatch short-circuits.

**Scope clarification:** this prototype has no real dispatch mechanism — the orchestrator is simulated by seeded messages. This chunk introduces two **prototype-only** optional fields on conversation messages: `msg.dispatchTo` (an `agentId`) and `msg.requiredConfigName` (a config group name). Only messages carrying these fields are guarded. Other send paths (clicking kanban task cards, drawer-originated sends, plain chat replies) are intentionally not guarded in this plan — they can be retrofitted in a follow-up once a real dispatch pipeline exists.

### Task 15: Short-circuit send when `canDispatch` fails

**Files:**
- Modify: `App.jsx` (chat send handler) or `Chat.jsx` (wherever outbound messages are finalized)

- [ ] **Step 1: Locate the send handler.**

Grep `Chat.jsx` and `App.jsx` for the function that appends a user message to `store.state.conversation` (likely named `onSend`, `handleSend`, or similar). In projects-sessions, outbound messages are append-only on `store.state.conversation`.

- [ ] **Step 2: Before appending, run `canDispatch` for each agent the message targets.**

This prototype does not have a structured dispatch mechanism — the orchestrator decides per-turn, and there is no authoritative "this message dispatches to agent X" marker on user input. For the prototype, apply the guard at the **orchestrator response** layer by examining recently appended assistant messages that reference an `agentId`.

Simpler alternative, which is what this step implements: **guard at the message level for messages that include an explicit `dispatchTo` field**. Extend the conversation append function:

```js
function appendMessage(msg) {
  if (msg.dispatchTo) {
    const agent = store.state.agents.find(a => a.id === msg.dispatchTo);
    const result = window.canDispatch(agent, currentProject, localEnv.pathMap, localEnv.secrets, { requiredConfigName: msg.requiredConfigName });
    if (!result.ok) {
      store.create("conversation", {
        id: `m-${Date.now()}`,
        sessionId: currentSessionId,
        role: "system",
        noticeKind: result.reason.startsWith("Missing secret") ? "missing-secret" : "locate-roots",
        noticeText: result.reason,
      });
      return;   // don't dispatch
    }
  }
  store.create("conversation", msg);
}
```

If the existing send function lives inside `ChatArea`, place this wrapper there; otherwise in `App.jsx` next to the other `store.create("conversation", …)` call sites.

- [ ] **Step 3: Render notice-kind system messages in `Chat.jsx`.**

In the message renderer, add a branch:

```jsx
if (msg.role === "system" && msg.noticeKind) {
  return (
    <window.InlineNotice
      tone="warn"
      icon={msg.noticeKind === "missing-secret" ? "⚠" : "🔗"}
      text={msg.noticeText}
      action={msg.noticeKind === "missing-secret" ? "Fill…" : "Locate…"}
      onAction={() => setRightView("env")}
    />
  );
}
```

- [ ] **Step 4: Seed one guarded message to verify.**

Temporarily, in `data.js`'s `conversation` array, add one message in the Lighthouse session that triggers the guard. Use the `proj-lighthouse` docs root (unbound, so dispatch targeting its implied agent isn't meaningful) — instead, use `proj-ai-report`: seed a message into `sess-ai-01` that dispatches to the java-bound agent:

```js
{ id: "m-guard-demo", sessionId: "sess-ai-01", role: "user", text: "Generate SQL for the daily revenue rollup", dispatchTo: "ag-bespoke-backend" },
```

Bump `data.js?v=`. Switch to `proj-ai-report` → `sess-ai-01`; without locating the Java root, the next dispatch attempt triggers the guard notice. Remove this seed after verifying — it's for a one-time check only.

Actually, easier: drive the guard from Console rather than seeding:

```
window.__store.create("conversation", { id: "m-test", sessionId: currentSessionId, role: "user", text: "go", dispatchTo: "ag-bespoke-backend" })
```

(If you re-added `window.__store = store` briefly to verify; remove after.)

- [ ] **Step 5: Verify.**

- Switch to `proj-ai-report` with java root unlocated → trigger a dispatch (via whatever UI path is natural; or direct Console as above) → a notice appears inline in the chat: `🔗 Root "Java backend" is not located on this machine. [Locate…]`.
- Click `Locate…` → switches to Env tab. Resolve the root. Re-dispatch → message is appended normally (no notice).
- With a config-backed agent: seed a dispatch with `requiredConfigName: "gateway-prod"`; without filling secrets, notice reads `⚠ Missing secret: gateway-prod.user [Fill…]`.

- [ ] **Step 6: Commit.**

```bash
git add App.jsx Chat.jsx
git commit -m "env: dispatch guard — short-circuit send and render InlineNotice when root/secret missing"
```

---

## Chunk 8: Orchestrator `EnvProposalCard`

Goal: an `EnvProposalCard` renders in chat (like `TeamProposalCard`) offering to create agents + roots + configs in one click.

### Task 16: Add `EnvProposalCard` component in `Chat.jsx`

**Files:**
- Modify: `Chat.jsx`

- [ ] **Step 1: Find `TeamProposalCard` (around line 12).**

Below it, add a sibling component:

```jsx
function EnvProposalCard({ msg, project, store, localEnv, agents, onApply }) {
  const proposal = msg.proposal || { agents: [], roots: [], configs: [] };
  const [applied, setApplied] = React.useState(Boolean(msg.applied));

  const apply = () => {
    // Create any proposed agents (assume they come with { id, name, role } minimum)
    (proposal.agents || []).forEach(a => {
      if (!store.state.agents.find(x => x.id === a.id)) store.create("agents", a);
    });
    // Create roots
    (proposal.roots || []).forEach(r => {
      const err = store.addRoot(project.id, { label: r.label, kind: r.kind, repoUrl: r.repoUrl, branch: r.branch, agentId: r.agentId });
      if (err) console.warn("addRoot:", err);
    });
    // Create configs
    (proposal.configs || []).forEach(c => store.addConfig(project.id, { name: c.name, fields: c.fields }));
    setApplied(true);
    onApply && onApply();
  };

  return (
    <div className={`proposal-card proposal-card--env ${applied ? "is-applied" : ""}`}>
      <div className="proposal-card-head">Environment proposal {applied && <span className="proposal-card-applied">Applied</span>}</div>
      {proposal.agents?.length > 0 && (
        <div className="proposal-card-section">
          <div className="proposal-card-section-head">Agents</div>
          {proposal.agents.map(a => <div key={a.id} className="proposal-card-row">🤖 {a.name}</div>)}
        </div>
      )}
      {proposal.roots?.length > 0 && (
        <div className="proposal-card-section">
          <div className="proposal-card-section-head">Roots</div>
          {proposal.roots.map((r, i) => <div key={i} className="proposal-card-row">{r.label} <span className="muted">({r.kind})</span> {r.repoUrl ? <code>{r.repoUrl}</code> : <em className="muted">— URL pending</em>}</div>)}
        </div>
      )}
      {proposal.configs?.length > 0 && (
        <div className="proposal-card-section">
          <div className="proposal-card-section-head">Configs</div>
          {proposal.configs.map((c, i) => <div key={i} className="proposal-card-row">{c.name} <span className="muted">{Object.keys(c.fields || {}).length} fields</span></div>)}
        </div>
      )}
      {!applied && (
        <div className="proposal-card-actions">
          <button className="primary" onClick={apply}>Apply</button>
          <button onClick={() => alert("Adjust flow: send a chat message to the orchestrator")}>Adjust</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Dispatch `proposal.kind === "env"` in `MessageRenderer`.**

Find the branch that dispatches `TeamProposalCard`:

```jsx
if (msg.proposal) {
  if (msg.proposal.kind === "team") return <TeamProposalCard ... />;
  if (msg.proposal.kind === "env")  return <EnvProposalCard msg={msg} project={project} store={store} localEnv={localEnv} agents={agents} />;
}
```

Ensure `project`, `store`, `localEnv`, `agents` are threaded into `MessageRenderer` via `ChatArea`'s props.

- [ ] **Step 3: Export.**

Extend the file's bottom `Object.assign(window, {...})` to include `EnvProposalCard`.

- [ ] **Step 4: Seed one demo proposal in `data.js`.**

In the `conversation` array, add one assistant message in the `proj-ai-report` → `sess-ai-01` (or wherever is convenient) with a proposal payload:

```js
{
  id: "m-env-proposal-demo",
  sessionId: "sess-ai-01",
  role: "assistant",
  text: "I put together a proposed environment — review and apply if it looks right.",
  proposal: {
    kind: "env",
    agents: [],   // In the seed, reuse existing agents by id only (don't synthesize new ones)
    roots: [
      { label: "Reporting API (sandbox)", kind: "node", repoUrl: "github.com/acme/reporting-api-sandbox" },
    ],
    configs: [
      { name: "gateway-stage", fields: { tenant: "acme-stage", user: "${secret:gateway-stage.user}", pass: "${secret:gateway-stage.pass}" } },
    ],
  },
},
```

Bump `data.js?v=`.

- [ ] **Step 5: Verify.**

- Switch to `proj-ai-report` / `sess-ai-01` → the seeded message renders as an `EnvProposalCard` showing `Roots: Reporting API (sandbox)` and `Configs: gateway-stage`.
- Click `Apply` → card flips to `Applied`. Switch to Env tab → the new root and config appear on `proj-ai-report`.
- Refresh → the card still shows `Applied`. Achieved by persisting applied state into the conversation store: update the `apply` function above to also call `store.update("conversation", msg.id, { applied: true })` alongside `setApplied(true)`. Initialize `const [applied, setApplied] = React.useState(Boolean(msg.applied))` so the rendered state reads from the persisted flag on reload.

- [ ] **Step 6: Commit.**

```bash
git add Chat.jsx data.js index.html
git commit -m "env: EnvProposalCard — Apply creates roots/configs from a chat message"
```

---

## Chunk 9: Run log scratch surfacing

Goal: every agent-run block in `AgentDrawer` / `TaskDrawer` chat tab shows a `scratch: …/runs/{uuid6}/` line with `[Open]` (no-op) and `[Copy path]`.

### Task 17: Add scratch line to `AgentDrawer` run blocks + bound-root in header

**Files:**
- Modify: `AgentDrawer.jsx`

- [ ] **Step 1: In `AgentDrawer`, find the header and the run-block renderer.**

The header typically shows the agent name + role/avatar. Below that row, render the bound-root info:

```jsx
{(() => {
  const boundRoot = (project?.env?.roots || []).find(r => r.agentId === agent.id);
  if (!boundRoot) return null;
  const local = localEnv?.pathMap?.[boundRoot.id];
  return (
    <div className="agent-drawer-root">
      <span className="muted">Root:</span>
      <span>{boundRoot.label}</span>
      {local
        ? <code className="agent-drawer-path">{local}</code>
        : <><span className="env-badge env-badge--warn">🔗</span> <em className="muted">Not located</em></>}
    </div>
  );
})()}
```

Accept `project` and `localEnv` as props on `AgentDrawer` if they aren't already passed; thread them from `App.jsx`.

- [ ] **Step 2: Generate a stable `runId` per run block.**

Derive `runId` deterministically from the thread message id so that the displayed suffix matches the `Copy path` output across re-renders:

```js
const runId = String(msg.id || "").slice(-6).padStart(6, "0");
```

If a thread message genuinely has no `id`, fix the seed data in `data.js` to add one — do **not** fall back to `window.newRunId()` inside render, because that regenerates on every re-render and would break AC8 ("scratch line matches `resolveScratchPath(...)`") and AC9 (base change reflects immediately in *the same* path).

- [ ] **Step 3: Render the scratch line below each run's body.**

```jsx
{(() => {
  const base = localEnv?.scratchBase || "~/.atelier";
  const scratch = window.resolveScratchPath({
    base,
    project,
    session: { id: currentSessionId, name: (store.state.sessions.find(s => s.id === currentSessionId) || {}).name },
    agent,
    runId,
  });
  return (
    <div className="run-scratch">
      <span className="muted">scratch:</span>
      <code>…/{scratch.split("/").slice(-2).join("/")}/</code>
      <button className="run-scratch-btn" disabled title="Not wired in prototype">Open</button>
      <button className="run-scratch-btn" onClick={() => navigator.clipboard.writeText(scratch)}>Copy path</button>
    </div>
  );
})()}
```

The `…/<agent>/runs/<uuid>/` visual shortening keeps the line compact; `Copy path` copies the full resolved path.

- [ ] **Step 4: Thread required props.**

`AgentDrawer` needs `project`, `localEnv`, `store`, `currentSessionId`, `agents` to produce this. Pass from `App.jsx` where the drawer is rendered.

- [ ] **Step 5: Hard-reload and verify.**

- Open `proj-ai-report` / `sess-ai-01` → click the Java-bound agent → drawer shows `Root: Java backend` with `🔗 Not located`. Locate the root → refresh drawer → path appears in the header.
- Each run block in the drawer's run list shows `scratch: …/java-dev/runs/<6chars>/` with `[Open]` (disabled) and `[Copy path]`.
- Click `Copy path` → clipboard contains e.g. `~/.atelier/ai-report-templates-<id6>/q1-earnings-report-draft-<id6>/java-dev/runs/<runid>/`.

- [ ] **Step 6: Commit.**

```bash
git add AgentDrawer.jsx App.jsx
git commit -m "env: AgentDrawer — show bound root in header and scratch path per run"
```

---

### Task 18: Add scratch line to `TaskDrawer` chat tab

**Files:**
- Modify: `TaskDrawer.jsx`

- [ ] **Step 1: Find the `ChatTab` component and its per-run renderer.**

Near the existing `agentThreads` lookup (currently at roughly `TaskDrawer.jsx:201` per the projects-sessions plan's reference).

- [ ] **Step 2: Reuse the same scratch snippet from Task 17.**

Thread the same props (`project`, `localEnv`, `store`, `currentSessionId`, `agents`) into `TaskDrawer`; render the same `<div className="run-scratch">…</div>` block below each run body.

- [ ] **Step 3: Hard-reload and verify.**

- Open a task on the kanban → Chat tab → each run in the thread shows its scratch line.
- Copy path → clipboard has the task-agent-qualified scratch path (the task's `agent` field selects which agent slug is used).

- [ ] **Step 4: Commit.**

```bash
git add TaskDrawer.jsx App.jsx
git commit -m "env: TaskDrawer chat tab — scratch path per run block"
```

---

## Chunk 10: Styles + index.html cache bump

Goal: one CSS diff covers every new visual affordance added by this plan.

### Task 19: Add styles for env panel + cards + modals + notices + proposal + scratch line

**Files:**
- Modify: `styles.css`
- Modify: `index.html` (bump `styles.css?v=N` → `?v=N+1`)

- [ ] **Step 1: Append a new section to `styles.css`.**

Use existing naming conventions (kebab-case class names, `oklch(…)` colors where the existing CSS already uses them). A minimal starter set:

```css
/* ——— Environment panel ——— */
.env-panel { padding: 16px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.env-section { display: flex; flex-direction: column; gap: 8px; }
.env-section-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; color: var(--fg-muted, oklch(0.55 0.02 270)); text-transform: uppercase; letter-spacing: 0.04em; }
.env-add-btn { font-size: 12px; padding: 2px 8px; border: 1px solid var(--border, oklch(0.9 0.01 270)); border-radius: 4px; background: transparent; cursor: pointer; }
.env-empty-row { font-size: 13px; padding: 8px 12px; border: 1px dashed var(--border, oklch(0.9 0.01 270)); border-radius: 6px; }

.env-card { border: 1px solid var(--border, oklch(0.9 0.01 270)); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; background: var(--surface, #fff); }
.env-card.is-unlocated, .env-card.is-missing { border-color: oklch(0.85 0.08 60); background: oklch(0.98 0.02 80); }
.env-card-head { display: flex; align-items: center; gap: 8px; }
.env-card-title { font-weight: 600; }
.env-card-more { margin-left: auto; background: transparent; border: none; cursor: pointer; padding: 2px 6px; font-size: 16px; color: var(--fg-muted); }
.env-kind { font-size: 11px; padding: 1px 6px; border-radius: 999px; background: oklch(0.95 0.02 250); color: oklch(0.35 0.05 250); }
.env-kind--java { background: oklch(0.93 0.05 30); color: oklch(0.35 0.1 30); }
.env-kind--go   { background: oklch(0.93 0.05 190); color: oklch(0.35 0.1 190); }
.env-kind--node { background: oklch(0.93 0.05 140); color: oklch(0.35 0.1 140); }
.env-card-row { display: flex; gap: 8px; align-items: baseline; font-size: 13px; }
.env-card-label { width: 56px; color: var(--fg-muted); }
.env-card-fields { display: flex; flex-wrap: wrap; gap: 6px; }
.env-field { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid transparent; background: oklch(0.96 0.01 270); cursor: pointer; }
.env-field.is-missing { background: oklch(0.95 0.06 60); color: oklch(0.35 0.1 50); }
.env-field.has-value { color: oklch(0.35 0.05 150); }
.env-badge { display: inline-block; font-size: 11px; }
.env-badge--ok   { color: oklch(0.5 0.12 150); }
.env-badge--warn { color: oklch(0.55 0.15 60); }
.env-inline-btn { margin-left: 8px; font-size: 12px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border); background: transparent; cursor: pointer; }

/* Locate modal + inline edit popover */
.modal-scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center; z-index: 40; }
.modal.env-locate-modal { background: #fff; padding: 20px; border-radius: 10px; width: 480px; display: flex; flex-direction: column; gap: 12px; }
.env-locate-field { display: flex; flex-direction: column; gap: 4px; }
.env-locate-field input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-family: var(--font-mono, JetBrains Mono, monospace); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.modal-actions .primary { background: var(--accent, oklch(0.6 0.17 250)); color: #fff; }

.inline-edit-scrim { position: fixed; inset: 0; z-index: 45; }
.inline-edit-popover { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px; min-width: 280px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); display: flex; flex-direction: column; gap: 8px; }
.inline-edit-popover button { text-align: left; padding: 6px 10px; border: none; background: transparent; cursor: pointer; border-radius: 4px; }
.inline-edit-popover button:hover { background: oklch(0.96 0.01 270); }
.inline-edit-popover button.danger { color: oklch(0.5 0.18 25); }
.inline-edit-body { display: flex; flex-direction: column; gap: 8px; }
.inline-edit-body input, .inline-edit-body select { padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; }
.inline-edit-error { font-size: 12px; color: oklch(0.5 0.18 25); }

/* Inline notice */
.inline-notice { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 6px; font-size: 13px; margin: 8px 16px; }
.inline-notice--warn { background: oklch(0.96 0.04 60); color: oklch(0.35 0.1 50); border: 1px solid oklch(0.85 0.08 60); }
.inline-notice--info { background: oklch(0.96 0.03 250); color: oklch(0.3 0.08 250); border: 1px solid oklch(0.88 0.05 250); }
.inline-notice-btn { margin-left: auto; font-size: 12px; padding: 2px 8px; border-radius: 4px; border: 1px solid currentColor; background: transparent; color: inherit; cursor: pointer; }

/* EnvProposalCard */
.proposal-card--env { border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: #fff; display: flex; flex-direction: column; gap: 10px; max-width: 640px; }
.proposal-card-head { font-weight: 600; display: flex; align-items: center; gap: 8px; }
.proposal-card-applied { font-size: 11px; padding: 2px 6px; border-radius: 999px; background: oklch(0.92 0.05 150); color: oklch(0.35 0.1 150); }
.proposal-card-section { display: flex; flex-direction: column; gap: 4px; }
.proposal-card-section-head { font-size: 12px; font-weight: 600; color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.proposal-card-row { font-size: 13px; display: flex; gap: 6px; align-items: baseline; }
.proposal-card-actions { display: flex; gap: 8px; justify-content: flex-end; }
.proposal-card-actions .primary { background: var(--accent, oklch(0.6 0.17 250)); color: #fff; padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; }

/* Agent drawer root + run scratch line */
.agent-drawer-root { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 6px 12px; background: oklch(0.98 0.01 270); border-bottom: 1px solid var(--border); }
.agent-drawer-path { font-family: var(--font-mono, monospace); font-size: 11px; }
.run-scratch { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--fg-muted); padding: 4px 0; }
.run-scratch code { font-family: var(--font-mono, monospace); }
.run-scratch-btn { font-size: 11px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--border); background: transparent; cursor: pointer; }
.run-scratch-btn:disabled { opacity: 0.5; cursor: not-allowed; }
```

If the existing stylesheet uses a design system (CSS variables for colors, an existing radius scale, etc.), prefer those tokens over the literal `oklch(…)` values above.

- [ ] **Step 2: Bump `styles.css?v=N` → `?v=N+1` in `index.html`.**

- [ ] **Step 3: Hard-reload and walk through all screens.**

Expected:
- Env panel is visually coherent with the rest of the app (font, density, borders).
- Unlocated root cards have a subtly tinted border/background.
- Locate modal and inline edit popovers render centered, above a scrim.
- Inline notices in chat thread pop without dominating the layout.
- Env proposal cards sit alongside existing `TeamProposalCard` without obvious style regressions.
- Run scratch lines render in small caps, tucked under each run body.

- [ ] **Step 4: Commit.**

```bash
git add styles.css index.html
git commit -m "env: styles for panel, cards, locate modal, inline popovers, notices, proposal, scratch line"
```

---

## Chunk 11: Acceptance walkthrough

Goal: walk the spec's §9 acceptance criteria end-to-end. Any failure becomes a follow-up task.

### Task 20: Run every acceptance criterion

**Files:** none (verification only). Fix issues in-place; each fix gets its own commit.

Start from a clean `localStorage` (`localStorage.clear()` in Console, hard-reload).

- [ ] **AC1: Fresh load → `proj-ai-report` shows 2 root cards + 1 config card in the Env tab.**

Expected: Env tab renders `Java backend`, `Go backend`, `gateway-prod`. Pass/Fail ▢

- [ ] **AC2: On fresh `localStorage`, at least one root shows `🔗 Not located`, and chat shows an `InlineNotice`.**

Pass/Fail ▢

- [ ] **AC3: `Locate…` on a root accepts a path, writes `at.pathMap`, clears the badge, removes the notice when all are located.**

Pass/Fail ▢

- [ ] **AC4: Dispatching a task to a bound agent whose root is unlocated shows a blocking `InlineNotice`; dispatch resumes after `Locate…`.**

Drive via Console as in Task 15 Step 4. Pass/Fail ▢

- [ ] **AC5: Dispatching with an unresolved secret shows `Missing secret`; `Fill…` writes to `at.secrets` and unblocks.**

Pass/Fail ▢

- [ ] **AC6: First message in a new project renders an `EnvProposalCard`; `Apply` materializes into `project.env`.**

Note: this prototype seeds one proposal (Task 16 Step 4) rather than generating one on the fly. For AC6 the walkthrough verifies the seeded proposal renders + Apply works. Real "first-message auto-proposal" is in §8 Open Question #4 of the spec and is out of scope. Pass/Fail ▢

- [ ] **AC7: `⋯ → Change agent` updates `agentId`; binding the same agent to a second root shows an inline error.**

Pass/Fail ▢

- [ ] **AC8: Each run block shows `scratch: …/runs/{uuid6}/` matching `resolveScratchPath(...)`.**

Compare `Copy path`'s clipboard content to a manually computed `resolveScratchPath(...)` for the same inputs. Pass/Fail ▢

- [ ] **AC9: Changing `at.scratchBase` via `Change base…` immediately reflects in all run-block scratch lines.**

Pass/Fail ▢

- [ ] **AC10: Reload preserves `at.pathMap`, `at.secrets`, `at.scratchBase`; `project.env` unchanged.**

Pass/Fail ▢

- [ ] **Step N+1: If every AC passed, commit a single marker commit.**

```bash
git commit --allow-empty -m "env: acceptance walkthrough complete (AC1-AC10)"
```

If any AC failed, fix in a focused commit before the marker commit. Keep the fix narrow to the failing AC.

---

## Out of scope (deferred — see spec §8)

- Scratch cleanup / retention UI (`Clean old runs` action) — defer until a real CLI integration exists.
- Repo URL normalization (`https://` vs `git@` vs bare) — defer to CLI integration.
- Auto-propose on first message — prompt-engineering concern, not a data-model concern.
- Secret encryption — prototype stays plaintext.
