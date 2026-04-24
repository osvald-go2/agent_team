// Management pages — full CRUD wired through useEntityStore + EntityDrawer.
// Each page exposes: list/table + search + Create / View / Edit / Duplicate / Delete.

/* ——— Shared schemas ——— */

const AGENT_FIELDS = [
  { name: "name", kind: "text", label: "Name", placeholder: "e.g. PRD Analyst" },
  { name: "role", kind: "text", label: "Role", placeholder: "e.g. Requirements synthesizer" },
  { name: "provider", kind: "select", label: "Provider",
    options: () => (window.AppData.providers || []) },
  { name: "model", kind: "select", label: "Model",
    options: (ctx) => ((window.AppData.modelsByProvider || {})[ctx?.provider] || []) },
  { name: "status", kind: "select", label: "Status", options: ["queued", "running", "awaiting", "done", "paused"] },
  { name: "desc", kind: "textarea", label: "Description", rows: 3, placeholder: "What this agent is responsible for…" },
  { name: "icon", kind: "icon", label: "Icon" },
  { name: "color", kind: "color", label: "Color" },
  { name: "skills", kind: "chips", label: "Skills",
    options: () => (window.AppData.skills || []).map(s => ({ value: s.name, label: s.name })) },
  { name: "knowledge", kind: "chips", label: "Knowledge bases",
    options: () => (window.AppData.knowledge || []).map(k => ({ value: k.id, label: k.name })) },
];

const SKILL_FIELDS = [
  { name: "name", kind: "text", label: "Name (identifier)", placeholder: "e.g. api.design.openapi" },
  { name: "category", kind: "select", label: "Category", options: ["research", "code", "design", "data", "ops", "communication"] },
  { name: "kind", kind: "select", label: "Kind", options: ["built-in", "custom"] },
  { name: "desc", kind: "textarea", label: "Description", rows: 3 },
  { name: "calls", kind: "number", label: "Calls (7d)" },
];

const KB_FIELDS = [
  { name: "name", kind: "text", label: "Name" },
  { name: "items", kind: "number", label: "Items" },
  { name: "size", kind: "text", label: "Size", placeholder: "e.g. 12.4 MB" },
  { name: "updated", kind: "text", label: "Last updated", placeholder: "2h ago" },
  { name: "tags", kind: "tags", label: "Tags", placeholder: "+ tag" },
];

const TEMPLATE_FIELDS = [
  { name: "name", kind: "text", label: "Name" },
  { name: "desc", kind: "textarea", label: "Description", rows: 3 },
  { name: "agents", kind: "number", label: "Agent count" },
  { name: "runs", kind: "number", label: "Runs" },
  { name: "tags", kind: "tags", label: "Tags" },
];

const SESSION_FIELDS = [
  { name: "name", kind: "text", label: "Session name" },
  { name: "status", kind: "select", label: "Status", options: ["running", "awaiting", "done", "paused"] },
  { name: "agents", kind: "number", label: "Agents" },
  { name: "turns", kind: "number", label: "Turns" },
  { name: "duration", kind: "text", label: "Duration" },
  { name: "when", kind: "text", label: "When" },
];

const APPROVAL_FIELDS = [
  { name: "title", kind: "text", label: "Title" },
  { name: "priority", kind: "select", label: "Priority", options: ["P1", "P2", "P3"] },
  { name: "status", kind: "select", label: "Status", options: ["pending", "approved", "rejected"] },
  { name: "from", kind: "select", label: "From agent", options: (ctx) => (window.AppData.agents).map(a => ({ value: a.id, label: a.name })) },
  { name: "age", kind: "text", label: "Age" },
];

/* ——— useCrud hook: glues store + drawer + confirm ——— */
function useCrud(key, store) {
  const [drawer, setDrawer] = React.useState(null); // { mode, value }
  const [confirm, setConfirm] = React.useState(null); // { id, name }

  const openNew = (seed = {}) => setDrawer({ mode: "new", value: seed });
  const openView = (item) => setDrawer({ mode: "view", value: item });
  const openEdit = (item) => setDrawer({ mode: "edit", value: item });
  const close = () => setDrawer(null);

  const save = (draft) => {
    if (!drawer) return;
    if (drawer.mode === "new") store.create(key, draft);
    else store.update(key, drawer.value.id, draft);
    close();
  };

  const askDelete = (item) => setConfirm({ id: item.id, name: item.name || item.title || item.id });
  const confirmDelete = () => {
    if (confirm) store.remove(key, confirm.id);
    setConfirm(null);
    if (drawer && confirm && drawer.value?.id === confirm.id) close();
  };

  const duplicate = (item) => store.duplicate(key, item.id);

  return { drawer, confirm, openNew, openView, openEdit, close, save, askDelete, confirmDelete, setConfirm, duplicate };
}

/* ——— Agents ——— */
function AgentsPage({ store, onOpen }) {
  const list = store.state.agents;
  const [q, setQ] = React.useState("");
  const filtered = list.filter(a => !q || (a.name + a.role + a.desc).toLowerCase().includes(q.toLowerCase()));
  const crud = useCrud("agents", store);

  const seed = { name: "", role: "", provider: "Claude", model: "claude-sonnet-4-6", status: "queued", desc: "", icon: "user", color: "#6366f1", skills: [], knowledge: [] };

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <h2>Agents</h2>
          <div className="sub">Reusable roles with skills, knowledge and autonomy policies.</div>
        </div>
        <div className="spacer" />
        <button className="btn-primary" onClick={() => {
          const id = `ag-${Date.now().toString(36)}`;
          store.create("agents", { ...seed, id, name: "Untitled agent" });
          onOpen && onOpen(id);
        }}><Icon name="plus" size={12} /> New agent</button>
      </div>
      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={13} />
          <input placeholder="Search agents…" value={q} onChange={e => setQ(e.target.value)} />
          <span className="kbd">⌘K</span>
        </div>
        <button className="filter-pill active">All · {filtered.length}</button>
      </div>
      <div className="grid-cards">
        {filtered.map(a => (
          <div key={a.id} className="grid-card clickable" onClick={() => onOpen ? onOpen(a.id) : crud.openView(a)}>
            <div className="row">
              <span className="ag-ico" style={{ background: a.color, width: 30, height: 30, borderRadius: 7, color: "white", display: "grid", placeItems: "center" }}>
                <Icon name={a.icon} size={14} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3>{a.name}</h3>
                <div className="muted mono" style={{ fontSize: 10.5 }}>{a.role} · {a.model}</div>
              </div>
              <RowMenu
                onView={() => onOpen ? onOpen(a.id) : crud.openView(a)}
                onEdit={() => onOpen ? onOpen(a.id) : crud.openEdit(a)}
                onDuplicate={() => crud.duplicate(a)}
                onDelete={() => crud.askDelete(a)}
              />
            </div>
            <div className="sub clamp-2">{a.desc}</div>
            <div className="row-wrap">
              {(a.skills || []).slice(0, 4).map(s => <span key={s} className="skill-chip" style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "2px 6px", background: "var(--bg-sunken)", borderRadius: 4, color: "var(--ink-2)" }}>{s}</span>)}
              {(a.skills || []).length > 4 && <span className="muted small">+{a.skills.length - 4}</span>}
            </div>
            <div className="metric-row">
              <span><Icon name="book" size={11} /> <span className="val">{(a.knowledge || []).length}</span> KB</span>
              <span><Icon name="bolt" size={11} /> <span className="val">{(a.skills || []).length}</span> skills</span>
              <span className={"badge s-" + (a.status || "queued")}><span className="status-dot" /> {a.status || "queued"}</span>
            </div>
          </div>
        ))}
        <div className="grid-card new-card" onClick={() => {
          const id = `ag-${Date.now().toString(36)}`;
          store.create("agents", { ...seed, id, name: "Untitled agent" });
          onOpen && onOpen(id);
        }}>
          <Icon name="plus" size={22} />
          <div style={{ fontSize: 12 }}>New agent</div>
          <div className="small muted">Start from blank or clone an existing one</div>
        </div>
      </div>

      <EntityDrawer
        open={!!crud.drawer}
        mode={crud.drawer?.mode}
        title={crud.drawer?.mode === "new" ? "New agent" : (crud.drawer?.value?.name || "Agent")}
        subtitle={crud.drawer?.value?.role}
        fields={AGENT_FIELDS}
        value={crud.drawer?.value}
        onClose={crud.close}
        onSave={crud.save}
        onDelete={crud.drawer?.mode !== "new" ? () => crud.askDelete(crud.drawer.value) : null}
        onModeChange={crud.drawer?.mode === "view" ? (m) => setDrawerMode(crud, m) : null}
      />
      <ConfirmDialog
        open={!!crud.confirm}
        title={`Delete ${crud.confirm?.name}?`}
        body="This agent will be removed from the workspace. In-flight tasks will be orphaned."
        onConfirm={crud.confirmDelete}
        onCancel={() => crud.setConfirm(null)}
      />
    </div>
  );
}

function setDrawerMode(crud, mode) {
  crud.openEdit(crud.drawer.value);
}

/* ——— Skills ——— */
function SkillsPage({ store, onOpen }) {
  const list = store.state.skills;
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState("all");
  const cats = [...new Set(list.map(s => s.category))];
  const filtered = list.filter(s =>
    (cat === "all" || s.category === cat) &&
    (!q || (s.name + s.desc).toLowerCase().includes(q.toLowerCase()))
  );
  const crud = useCrud("skills", store);

  const seed = { name: "", category: "ops", kind: "custom", desc: "", calls: 0 };

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <h2>Skills</h2>
          <div className="sub">Tools and capabilities agents can invoke. Built-in or custom (HTTP / MCP).</div>
        </div>
        <div className="spacer" />
        <button className="btn-primary" onClick={() => {
          const id = `sk-${Date.now().toString(36)}`;
          store.create("skills", { ...seed, id, name: "new_skill" });
          onOpen && onOpen(id);
        }}><Icon name="plus" size={12} /> New skill</button>
      </div>
      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={13} />
          <input placeholder="Search skills…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button className={"filter-pill " + (cat === "all" ? "active" : "")} onClick={() => setCat("all")}>All · {list.length}</button>
        {cats.map(c => (
          <button key={c} className={"filter-pill " + (cat === c ? "active" : "")} onClick={() => setCat(c)}>
            {c} · {list.filter(s => s.category === c).length}
          </button>
        ))}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: "24%" }}>Skill</th>
            <th style={{ width: "10%" }}>Category</th>
            <th style={{ width: "8%" }}>Kind</th>
            <th>Description</th>
            <th style={{ width: "10%", textAlign: "right" }}>Calls · 7d</th>
            <th style={{ width: "6%" }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(s => (
            <tr key={s.id} onClick={() => onOpen ? onOpen(s.id) : crud.openView(s)} style={{ cursor: "pointer" }}>
              <td className="mono" style={{ color: "var(--ink)" }}>{s.name}</td>
              <td><span className="chip" style={{ fontSize: 11 }}>{s.category}</span></td>
              <td>
                <span className={"badge " + (s.kind === "custom" ? "s-awaiting" : "s-running")}>
                  {s.kind}
                </span>
              </td>
              <td className="muted clamp-1">{s.desc}</td>
              <td className="mono" style={{ textAlign: "right" }}>{(s.calls || 0).toLocaleString()}</td>
              <td>
                <RowMenu
                  onView={() => onOpen ? onOpen(s.id) : crud.openView(s)}
                  onEdit={() => onOpen ? onOpen(s.id) : crud.openEdit(s)}
                  onDuplicate={() => crud.duplicate(s)}
                  onDelete={() => crud.askDelete(s)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <EntityDrawer
        open={!!crud.drawer}
        mode={crud.drawer?.mode}
        title={crud.drawer?.mode === "new" ? "New skill" : (crud.drawer?.value?.name || "Skill")}
        subtitle={crud.drawer?.value?.category}
        fields={SKILL_FIELDS}
        value={crud.drawer?.value}
        onClose={crud.close}
        onSave={crud.save}
        onDelete={crud.drawer?.mode !== "new" ? () => crud.askDelete(crud.drawer.value) : null}
        onModeChange={crud.drawer?.mode === "view" ? () => setDrawerMode(crud) : null}
      />
      <ConfirmDialog
        open={!!crud.confirm}
        title={`Delete ${crud.confirm?.name}?`}
        body="This skill will be removed from the library."
        onConfirm={crud.confirmDelete}
        onCancel={() => crud.setConfirm(null)}
      />
    </div>
  );
}

/* ——— Knowledge ——— */
function KnowledgePage({ store, onOpen }) {
  const list = store.state.knowledge;
  const [q, setQ] = React.useState("");
  const filtered = list.filter(k => !q || (k.name + (k.tags || []).join(" ")).toLowerCase().includes(q.toLowerCase()));
  const crud = useCrud("knowledge", store);

  const seed = { name: "", items: 0, size: "0 MB", updated: "just now", tags: [] };

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <h2>Knowledge bases</h2>
          <div className="sub">Indexed document stores agents can retrieve from.</div>
        </div>
        <div className="spacer" />
        <button className="btn-primary" onClick={() => {
          const id = `kb-${Date.now().toString(36)}`;
          store.create("knowledge", { ...seed, id, name: "Untitled KB" });
          onOpen && onOpen(id);
        }}><Icon name="plus" size={12} /> New KB</button>
      </div>
      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={13} />
          <input placeholder="Search knowledge…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button className="filter-pill active">All · {filtered.length}</button>
      </div>
      <div className="grid-cards">
        {filtered.map(k => (
          <div key={k.id} className="grid-card clickable" onClick={() => onOpen ? onOpen(k.id) : crud.openView(k)}>
            <div className="row">
              <span className="ag-ico" style={{ background: "var(--bg-sunken)", color: "var(--ink-2)", width: 30, height: 30, borderRadius: 7, display: "grid", placeItems: "center", border: "1px solid var(--line)" }}>
                <Icon name="book" size={14} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3>{k.name}</h3>
                <div className="muted mono" style={{ fontSize: 10.5 }}>{k.id}</div>
              </div>
              <RowMenu
                onView={() => onOpen ? onOpen(k.id) : crud.openView(k)}
                onEdit={() => onOpen ? onOpen(k.id) : crud.openEdit(k)}
                onDuplicate={() => crud.duplicate(k)}
                onDelete={() => crud.askDelete(k)}
              />
            </div>
            <div className="row-wrap">
              {(k.tags || []).map(t => <span key={t} className="chip" style={{ fontSize: 11 }}>#{t}</span>)}
            </div>
            <div className="metric-row">
              <span><Icon name="doc" size={11} /> <span className="val">{k.items}</span> items</span>
              <span><Icon name="cube" size={11} /> <span className="val">{k.size}</span></span>
              <span><Icon name="clock" size={11} /> <span className="val">{k.updated}</span></span>
            </div>
          </div>
        ))}
        <div className="grid-card new-card" onClick={() => {
          const id = `kb-${Date.now().toString(36)}`;
          store.create("knowledge", { ...seed, id, name: "Untitled KB" });
          onOpen && onOpen(id);
        }}>
          <Icon name="plus" size={22} />
          <div style={{ fontSize: 12 }}>New knowledge base</div>
        </div>
      </div>

      <EntityDrawer
        open={!!crud.drawer}
        mode={crud.drawer?.mode}
        title={crud.drawer?.mode === "new" ? "New knowledge base" : (crud.drawer?.value?.name || "KB")}
        fields={KB_FIELDS}
        value={crud.drawer?.value}
        onClose={crud.close}
        onSave={crud.save}
        onDelete={crud.drawer?.mode !== "new" ? () => crud.askDelete(crud.drawer.value) : null}
        onModeChange={crud.drawer?.mode === "view" ? () => setDrawerMode(crud) : null}
      />
      <ConfirmDialog
        open={!!crud.confirm}
        title={`Delete ${crud.confirm?.name}?`}
        body="The knowledge base will be removed; indexed documents stay in storage."
        onConfirm={crud.confirmDelete}
        onCancel={() => crud.setConfirm(null)}
      />
    </div>
  );
}

/* ——— Templates ——— */
function TemplatesPage({ store, onOpen }) {
  const list = store.state.templates;
  const crud = useCrud("templates", store);
  const seed = { name: "", desc: "", agents: 3, runs: 0, tags: [] };

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <h2>Team templates</h2>
          <div className="sub">Saved team configurations that can be instantiated from a single prompt.</div>
        </div>
        <div className="spacer" />
        <button className="btn-primary" onClick={() => {
          const id = `tpl-${Date.now().toString(36)}`;
          store.create("templates", { ...seed, id, name: "Untitled template" });
          onOpen && onOpen(id);
        }}><Icon name="plus" size={12} /> New template</button>
      </div>
      <div className="grid-cards">
        {list.map(t => (
          <div key={t.id} className="grid-card clickable" onClick={() => onOpen ? onOpen(t.id) : crud.openView(t)}>
            <div className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3>{t.name}</h3>
              </div>
              <RowMenu
                onView={() => onOpen ? onOpen(t.id) : crud.openView(t)}
                onEdit={() => onOpen ? onOpen(t.id) : crud.openEdit(t)}
                onDuplicate={() => crud.duplicate(t)}
                onDelete={() => crud.askDelete(t)}
              />
            </div>
            <div className="sub clamp-2">{t.desc}</div>
            <div className="row-wrap">
              {(t.tags || []).map(tag => <span key={tag} className="chip" style={{ fontSize: 11 }}>#{tag}</span>)}
            </div>
            <div className="metric-row">
              <span><Icon name="user" size={11} /> <span className="val">{t.agents}</span> agents</span>
              <span><Icon name="history" size={11} /> <span className="val">{t.runs}</span> runs</span>
              <span style={{ marginLeft: "auto" }}><Icon name="play" size={11} /> Run</span>
            </div>
          </div>
        ))}
        <div className="grid-card new-card" onClick={() => {
          const id = `tpl-${Date.now().toString(36)}`;
          store.create("templates", { ...seed, id, name: "Untitled template" });
          onOpen && onOpen(id);
        }}>
          <Icon name="plus" size={22} />
          <div style={{ fontSize: 12 }}>New template</div>
        </div>
      </div>

      <EntityDrawer
        open={!!crud.drawer}
        mode={crud.drawer?.mode}
        title={crud.drawer?.mode === "new" ? "New template" : (crud.drawer?.value?.name || "Template")}
        fields={TEMPLATE_FIELDS}
        value={crud.drawer?.value}
        onClose={crud.close}
        onSave={crud.save}
        onDelete={crud.drawer?.mode !== "new" ? () => crud.askDelete(crud.drawer.value) : null}
        onModeChange={crud.drawer?.mode === "view" ? () => setDrawerMode(crud) : null}
      />
      <ConfirmDialog
        open={!!crud.confirm}
        title={`Delete ${crud.confirm?.name}?`}
        onConfirm={crud.confirmDelete}
        onCancel={() => crud.setConfirm(null)}
      />
    </div>
  );
}

/* ——— Sessions ——— */
function SessionsPage({ store, currentProjectId, onOpenSession, onQuickStart }) {
  const all = store.state.sessions.filter(s => !currentProjectId || s.projectId === currentProjectId);
  const [filter, setFilter] = React.useState("all");
  const statuses = ["running", "idle", "archived"];
  const shown = all.filter(s => filter === "all" || s.status === filter);
  const crud = useCrud("sessions", store);
  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <h2>Sessions</h2>
          <div className="sub">{currentProjectId ? "In current project" : "All sessions"}</div>
        </div>
      </div>
      {onQuickStart && (
        <QuickStartStrip
          presets={window.QUICKSTART_PRESETS}
          title="Quick start a session"
          sub={currentProjectId ? "Kick off a new session in this project" : "Start from a template"}
          onPick={onQuickStart}
        />
      )}
      <div className="toolbar">
        <button className={"filter-pill " + (filter === "all" ? "active" : "")} onClick={() => setFilter("all")}>All · {all.length}</button>
        {statuses.map(st => (
          <button key={st} className={"filter-pill " + (filter === st ? "active" : "")} onClick={() => setFilter(st)}>
            {st} · {all.filter(s => s.status === st).length}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="empty-state">
          {all.length === 0
            ? "No sessions yet — pick a Quick start above to create your first one."
            : `No ${filter} sessions.`}
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "32%" }}>Session</th>
              <th style={{ width: "10%" }}>Status</th>
              <th style={{ width: "8%", textAlign: "right" }}>Agents</th>
              <th style={{ width: "8%", textAlign: "right" }}>Turns</th>
              <th style={{ width: "10%", textAlign: "right" }}>Duration</th>
              <th style={{ width: "14%" }}>When</th>
              <th style={{ width: "6%" }}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(s => (
              <tr key={s.id} onClick={() => onOpenSession(s.id)} style={{ cursor: "pointer" }}>
                <td>{s.name}</td>
                <td><span className={"badge " + (s.status === "running" ? "s-running" : "")}>{s.status}</span></td>
                <td className="mono" style={{ textAlign: "right" }}>{s.agents}</td>
                <td className="mono" style={{ textAlign: "right" }}>{s.turns}</td>
                <td className="mono" style={{ textAlign: "right" }}>{s.duration}</td>
                <td className="muted mono">{s.when}</td>
                <td onClick={e => e.stopPropagation()}>
                  <RowMenu
                    onView={() => onOpenSession(s.id)}
                    onDuplicate={() => crud.duplicate(s)}
                    onDelete={() => crud.askDelete(s)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ConfirmDialog
        open={!!crud.confirm}
        title={`Delete ${crud.confirm?.name}?`}
        body="This session will be removed from the workspace."
        onConfirm={crud.confirmDelete}
        onCancel={() => crud.setConfirm(null)}
      />
    </div>
  );
}

/* ——— Approvals ——— */
function ApprovalsPage({ store, agents }) {
  const list = store.state.approvals;
  const [filter, setFilter] = React.useState("pending");
  const shown = list.filter(a => a.status === filter);
  const crud = useCrud("approvals", store);
  const seed = { title: "", priority: "P2", status: "pending", from: agents[0]?.id, age: "just now" };

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <h2>Approvals</h2>
          <div className="sub">Decisions and tool-use requests requiring your sign-off.</div>
        </div>
        <div className="spacer" />
        <button className="btn-primary" onClick={() => crud.openNew(seed)}><Icon name="plus" size={12} /> New approval</button>
      </div>
      <div className="toolbar">
        {["pending", "approved", "rejected"].map(f => (
          <button key={f} className={"filter-pill " + (filter === f ? "active" : "")} onClick={() => setFilter(f)}>
            {f} · {list.filter(a => a.status === f).length}
          </button>
        ))}
      </div>
      {shown.length === 0 && <div className="empty-state">No {filter} approvals.</div>}
      {shown.map(a => {
        const fromA = agents.find(ag => ag.id === a.from);
        return (
          <div key={a.id} className="ap-row clickable" onClick={() => crud.openView(a)}>
            <span className={"pri " + a.priority}>{a.priority}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="title">{a.title}</div>
              <div className="from row" style={{ marginTop: 3 }}>
                {fromA && (
                  <span className="ag-ico" style={{ background: fromA.color, width: 14, height: 14, borderRadius: 3 }}>
                    <Icon name={fromA.icon} size={9} />
                  </span>
                )}
                <span>from <b style={{ color: "var(--ink-2)" }}>{fromA?.name || "unknown"}</b></span>
              </div>
            </div>
            <span className="age">{a.age}</span>
            {a.status === "pending" ? (
              <>
                <button className="btn-ghost" onClick={e => { e.stopPropagation(); }}><Icon name="chat" size={11} /> Discuss</button>
                <button className="btn-ghost danger" onClick={e => { e.stopPropagation(); store.update("approvals", a.id, { status: "rejected" }); }}><Icon name="x" size={11} /> Reject</button>
                <button className="btn-primary" style={{ height: 26 }} onClick={e => { e.stopPropagation(); store.update("approvals", a.id, { status: "approved" }); }}><Icon name="check" size={11} /> Approve</button>
              </>
            ) : (
              <span className={"badge s-" + (a.status === "approved" ? "done" : "awaiting")}>
                <Icon name={a.status === "approved" ? "check" : "x"} size={10} /> {a.status}
              </span>
            )}
            <RowMenu
              onView={() => crud.openView(a)}
              onEdit={() => crud.openEdit(a)}
              onDelete={() => crud.askDelete(a)}
            />
          </div>
        );
      })}

      <EntityDrawer
        open={!!crud.drawer}
        mode={crud.drawer?.mode}
        title={crud.drawer?.mode === "new" ? "New approval request" : (crud.drawer?.value?.title || "Approval")}
        fields={APPROVAL_FIELDS}
        value={crud.drawer?.value}
        onClose={crud.close}
        onSave={crud.save}
        onDelete={crud.drawer?.mode !== "new" ? () => crud.askDelete(crud.drawer.value) : null}
        onModeChange={crud.drawer?.mode === "view" ? () => setDrawerMode(crud) : null}
      />
      <ConfirmDialog
        open={!!crud.confirm}
        title={`Delete "${crud.confirm?.name}"?`}
        onConfirm={crud.confirmDelete}
        onCancel={() => crud.setConfirm(null)}
      />
    </div>
  );
}

Object.assign(window, { AgentsPage, SkillsPage, KnowledgePage, TemplatesPage, SessionsPage, ApprovalsPage, useCrud, AGENT_FIELDS });
