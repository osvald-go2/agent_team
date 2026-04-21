// Dashboard — Image 8 style landing.
// Layout: left sidebar (brand + NewProjectForm + foot chips) | right main (tabs + search + grid).

const QUICKSTART_PRESETS = [
  { id: "qs-prd",     name: "PRD → Technical Design",   icon: "doc-code", defaultTemplateId: "tpl-prd2tech", description: "Parse a PRD and produce the full technical design.",
    prompt: "Parse the attached PRD and produce a full technical design, with bounded contexts, API contracts, data model, and a risk review. Flag open questions before running." },
  { id: "qs-bugfix",  name: "Bug Root Cause & Fix",     icon: "alert",    defaultTemplateId: "tpl-bugfix",   description: "Reproduce, root-cause, patch, and post-mortem.",
    prompt: "Triage the latest P1 bug. Reproduce locally, root-cause, propose a patch, and write a post-mortem with prevention steps." },
  { id: "qs-compete", name: "Competitor Matrix",        icon: "grid",     defaultTemplateId: "tpl-research", description: "Collect and compare competitors on key dimensions.",
    prompt: "Research the top 5 competitors in our space. Compare on pricing, coverage, SLAs, DX and compliance. Produce a briefing doc with citations." },
  { id: "qs-launch",  name: "Launch Readiness",         icon: "rocket",   defaultTemplateId: "tpl-launch",   description: "GTM checklist, risk review, launch comms.",
    prompt: "Run a launch-readiness review for the next release. Cover security, reliability, cost, and GTM comms. Produce a go/no-go with a mitigations checklist." },
];

// Solid oklch tints, not gradients (needed for color-mix).
const PROJECT_SWATCHES = [
  "oklch(0.75 0.12 40)",
  "oklch(0.68 0.13 260)",
  "oklch(0.72 0.13 150)",
  "oklch(0.7 0.14 340)",
  "oklch(0.72 0.1 85)",
  "oklch(0.68 0.12 220)",
];

function swatchFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PROJECT_SWATCHES[h % PROJECT_SWATCHES.length];
}

function DashboardSidebarBrand() {
  return (
    <div className="ds-sidebar-brand">
      <div className="ds-sidebar-logo"><Icon name="layers" size={16} /></div>
      <div className="ds-sidebar-brand-text">
        <div className="ds-sidebar-brand-row">
          <span className="ds-sidebar-brand-name">Atelier</span>
          <span className="ds-sidebar-brand-chip">Research Preview</span>
        </div>
        <div className="ds-sidebar-brand-sub">by Agent Team</div>
      </div>
    </div>
  );
}

function DashboardFootChips({ onExit, canExit }) {
  return (
    <div className="ds-foot-chips">
      <span className="ds-chip"><Icon name="user" size={11} /> Olivia's Organization</span>
      <span className="ds-chip"><Icon name="book" size={11} /> Docs</span>
      <span className="ds-chip"><Icon name="user" size={11} /> olivia</span>
      {canExit && (
        <button className="ds-chip ds-chip-btn" onClick={onExit} title="Back to workspace">
          <Icon name="x" size={11} /> Exit
        </button>
      )}
    </div>
  );
}

function NewProjectForm({ store, templates, onCreated }) {
  const [tab, setTab] = React.useState("blank"); // blank | template
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");

  const submit = () => {
    if (!name.trim()) return;
    const { projectId, sessionId } = store.createProject({
      name: name.trim(),
      description,
      defaultTemplateId: templateId || null,
    });
    setName(""); setDescription(""); setTemplateId("");
    onCreated(projectId, sessionId);
  };

  return (
    <div className="np-form">
      <div className="np-tabs">
        {[["blank","Blank"], ["template","From template"]].map(([k, l]) => (
          <button key={k} className={"np-tab " + (tab === k ? "active" : "")} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="np-head">
        <div className="np-title">New project</div>
        <div className="np-sub">A project groups related sessions and canvases.</div>
      </div>

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
        <label>Description <span className="muted small">(optional)</span></label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What is this project for?" />
      </div>

      <button className="np-submit" disabled={!name.trim()} onClick={submit}>
        <Icon name="plus" size={12} /> Create project
      </button>
      <div className="np-foot">Anyone in your organization with the link can view this project.</div>
    </div>
  );
}

function FolderGlyph() {
  return (
    <svg className="rp-folder-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        className="fg-shape"
        d="M5 4h3a2 2 0 0 1 1.4.6L11 7h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
      />
      <path className="fg-line" d="M3.5 10.5h17" />
    </svg>
  );
}

function ProjectCard({ project, sessionCount, onOpen }) {
  const tint = project.color || swatchFor(project.id);
  return (
    <button className="rp-card" onClick={() => onOpen(project.id)} style={{ "--tint": tint }}>
      <div className="rp-folder">
        <FolderGlyph />
      </div>
      <div className="rp-meta">
        <div className="rp-name">{project.name}</div>
        <div className="rp-sub">{sessionCount} {sessionCount === 1 ? "session" : "sessions"} · {project.lastActive || "just now"}</div>
      </div>
    </button>
  );
}

function QuickstartCard({ preset, onPick }) {
  return (
    <button className="rp-card qs-card" onClick={() => onPick(preset)} style={{ "--tint": "oklch(0.7 0.1 35)" }}>
      <div className="rp-folder">
        <FolderGlyph />
      </div>
      <div className="rp-meta">
        <div className="rp-name">{preset.name}</div>
        <div className="rp-sub">{preset.description}</div>
      </div>
    </button>
  );
}

// Reusable Quick Start strip — same visual language as Chat.jsx WelcomeHero prompts.
function QuickStartStrip({ presets, title, sub, onPick }) {
  const list = presets || [];
  if (!list.length) return null;
  return (
    <section className="qs-strip welcome-section">
      <div className="welcome-section-head">
        <div className="lbl">{title || "Quick start"}</div>
        {sub && <span className="muted mono small">{sub}</span>}
      </div>
      <div className="welcome-prompts">
        {list.map(p => (
          <button key={p.id} className="welcome-prompt" onClick={() => onPick && onPick(p)}>
            <span className="pmt-ico"><Icon name={p.icon} size={14} /></span>
            <span className="pmt-body">
              <span className="pmt-title">{p.name}</span>
              <span className="pmt-desc">{p.description}</span>
              <span className="pmt-foot">
                <span className="pmt-tag mono">{p.defaultTemplateId || "quickstart"}</span>
                <span className="pmt-arrow"><Icon name="arrow" size={12} /></span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function DashboardMain({ projects, sessionsByProject, onOpenProject, onQuickstart }) {
  const [tab, setTab] = React.useState("recent"); // recent | all | archived
  const [query, setQuery] = React.useState("");

  const list = React.useMemo(() => {
    const active = projects.filter(p => p.status !== "archived");
    let base;
    if (tab === "archived") base = projects.filter(p => p.status === "archived");
    else if (tab === "all") base = active;
    else base = active.slice(0, 12);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(p => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
  }, [tab, projects, query]);

  return (
    <main className="ds-main">
      <QuickStartStrip
        presets={QUICKSTART_PRESETS}
        title="Quick start"
        sub="Spin up a ready-made team in one click"
        onPick={onQuickstart}
      />
      <div className="ds-main-head">
        <div className="ds-main-tabs">
          {[["recent","Recent"], ["all","All"], ["archived","Archived"]].map(([k,l]) => (
            <button key={k} className={"ds-main-tab " + (tab===k ? "active" : "")} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div className="ds-main-search">
          <Icon name="search" size={13} />
          <input placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rp-empty">Nothing here yet.</div>
      ) : (
        <div className="rp-grid">
          {list.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              sessionCount={(sessionsByProject[p.id] || []).length}
              onOpen={onOpenProject}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function Dashboard({ store, recentSession, onExit, onOpenProject, onQuickstart, onOpenSession }) {
  const sessionsByProject = React.useMemo(() => {
    const m = {};
    for (const s of store.state.sessions) {
      (m[s.projectId] = m[s.projectId] || []).push(s);
    }
    return m;
  }, [store.state.sessions]);

  return (
    <div className="dashboard-full">
      <aside className="ds-sidebar">
        <DashboardSidebarBrand />
        <NewProjectForm
          store={store}
          templates={store.state.templates}
          onCreated={(projectId, sessionId) => onOpenSession(sessionId, projectId)}
        />
        <div className="ds-sidebar-spacer" />
        <DashboardFootChips onExit={onExit} canExit={!!recentSession} />
      </aside>
      <DashboardMain
        projects={store.state.projects}
        sessionsByProject={sessionsByProject}
        onOpenProject={onOpenProject}
        onQuickstart={onQuickstart}
      />
    </div>
  );
}

Object.assign(window, { Dashboard, NewProjectForm, DashboardMain, ProjectCard, QuickstartCard, QuickStartStrip, QUICKSTART_PRESETS });
