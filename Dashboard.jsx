// Dashboard — All Projects landing page.
// Two-column: NewProjectForm (left) + RecentProjects + QuickstartRow (right).

const QUICKSTART_PRESETS = [
  { id: "qs-prd",     name: "PRD → Technical Design",   icon: "doc-code", defaultTemplateId: "tpl-prd2tech", description: "Parse a PRD and produce the full technical design." },
  { id: "qs-bugfix",  name: "Bug Root Cause & Fix",     icon: "alert",    defaultTemplateId: "tpl-bugfix",   description: "Reproduce, root-cause, patch, and post-mortem." },
  { id: "qs-compete", name: "Competitor Matrix",        icon: "grid",     defaultTemplateId: "tpl-research", description: "Collect and compare competitors on key dimensions." },
  { id: "qs-launch",  name: "Launch Readiness",         icon: "rocket",   defaultTemplateId: "tpl-launch",   description: "GTM checklist, risk review, launch comms." },
];

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

Object.assign(window, { Dashboard, NewProjectForm, QUICKSTART_PRESETS });
