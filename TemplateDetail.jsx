// TemplateDetail — Overview / Composition / Prompts / Runs

function TemplateDetail({ templateId, store, goBack, goToEntity }) {
  const tpl = store.state.templates.find(t => t.id === templateId);
  const [tab, setTab] = React.useState("overview");

  if (!tpl) {
    return (
      <div className="detail-empty">
        <div>Template not found.</div>
        <button className="btn-primary-accent" onClick={goBack}>Back</button>
      </div>
    );
  }

  const [draft, setDraft, savedAt] = useAutosave(
    withTplDefaults(tpl, store),
    (d) => store.update("templates", tpl.id, d)
  );
  React.useEffect(() => { setDraft(withTplDefaults(tpl, store)); }, [templateId]);
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const members = draft.members || [];

  const tabs = [
    { id: "overview", label: "Overview", icon: "doc" },
    { id: "composition", label: "Composition", icon: "graph", count: members.length },
    { id: "prompts", label: "Prompts & inputs", icon: "chat" },
    { id: "runs", label: "Runs", icon: "history", count: draft.runs || 0 },
  ];

  return (
    <DetailShell
      crumbs={[{ label: "Library" }, { label: "Templates" }, { label: draft.name || "Untitled template" }]}
      onBack={goBack}
      tabs={tabs} activeTab={tab} onTab={setTab} savedAt={savedAt}
      headerRight={<button className="btn-primary-accent"><Icon name="play" size={11} /> Start run</button>}
    >
      <div className="tpl-hero">
        <div className="hero-ico-sq tpl"><Icon name="cube" size={22} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input className="hero-title" value={draft.name || ""}
            onChange={e => set("name", e.target.value)} placeholder="Template name" />
          <input className="hero-sub" value={draft.desc || ""}
            onChange={e => set("desc", e.target.value)} placeholder="Short description" />
        </div>
        <div className="hero-stats">
          <div><span className="num">{members.length}</span><span>agents</span></div>
          <div><span className="num">{draft.runs || 0}</span><span>runs</span></div>
          <div><span className="num">{draft.rating || "—"}</span><span>rating</span></div>
        </div>
      </div>

      {tab === "overview" && <TplOverview draft={draft} set={set} />}
      {tab === "composition" && <TplComposition draft={draft} set={set} store={store} goToEntity={goToEntity} />}
      {tab === "prompts" && <TplPrompts draft={draft} set={set} />}
      {tab === "runs" && <TplRuns draft={draft} />}
    </DetailShell>
  );
}

function withTplDefaults(tpl, store) {
  // members: [{ agentId, role, deps: [agentIds] }]
  const defaults = {
    members: tpl.members || [],
    inputs: tpl.inputs || [
      { name: "input", type: "string", label: "User request", required: true, placeholder: "What do you need?" },
    ],
    initialPrompt: tpl.initialPrompt || "Run {{name}} for the request: {{input}}",
    intentKeywords: tpl.intentKeywords || [],
    runHistory: tpl.runHistory || [
      { id: "r1", user: "alex", date: Date.now() - 86400000 * 1, duration: "4m 22s", status: "success", rating: 5 },
      { id: "r2", user: "priya", date: Date.now() - 86400000 * 3, duration: "6m 10s", status: "success", rating: 4 },
      { id: "r3", user: "sam", date: Date.now() - 86400000 * 5, duration: "—", status: "failed", rating: null },
    ],
    ...tpl,
  };
  // Seed members if empty using store.agents (pick first N based on declared agents count)
  if (defaults.members.length === 0 && store && store.state.agents.length) {
    const n = Math.min(tpl.agents || 3, store.state.agents.length);
    defaults.members = store.state.agents.slice(0, n).map((a, i) => ({
      agentId: a.id,
      role: a.role || "Member",
      deps: i === 0 ? [] : [store.state.agents[i - 1].id],
    }));
  }
  return defaults;
}

/* ——— Overview ——— */
function TplOverview({ draft, set }) {
  return (
    <>
      <Section title="Description">
        <textarea className="big-textarea" rows={5}
          value={draft.longDesc || draft.desc || ""}
          onChange={e => set("longDesc", e.target.value)}
          placeholder="What outcome does this template produce? When should it be used?" />
      </Section>

      <Section title="Tags">
        <TagEditor value={draft.tags || []} onChange={v => set("tags", v)} />
      </Section>

      <Section title="Intent matcher" sub="Keywords or phrases that suggest this template for a user's request.">
        <TagEditor value={draft.intentKeywords} onChange={v => set("intentKeywords", v)}
          placeholder="e.g. PRD, technical design" />
        <div className="hint-box" style={{ marginTop: 10 }}>
          <Icon name="info" size={12} />
          The router uses these to auto-suggest this template in the main chat.
        </div>
      </Section>

      <Section title="Visibility">
        <SegControl value={draft.visibility || "workspace"} onChange={v => set("visibility", v)}
          options={[{ value: "private", label: "Private" }, { value: "workspace", label: "Workspace" }, { value: "org", label: "Organization" }, { value: "public", label: "Public" }]} />
      </Section>
    </>
  );
}

/* ——— Composition (DAG editor) ——— */
function TplComposition({ draft, set, store, goToEntity }) {
  const agents = store.state.agents;
  const members = draft.members || [];
  const [picker, setPicker] = React.useState(false);

  const nonMembers = agents.filter(a => !members.some(m => m.agentId === a.id));

  const addMember = (id) => {
    set("members", [...members, { agentId: id, role: agents.find(a => a.id === id)?.role || "Member", deps: [] }]);
    setPicker(false);
  };
  const removeMember = (id) => {
    set("members", members
      .filter(m => m.agentId !== id)
      .map(m => ({ ...m, deps: (m.deps || []).filter(d => d !== id) }))
    );
  };
  const toggleDep = (childId, parentId) => {
    set("members", members.map(m => {
      if (m.agentId !== childId) return m;
      const deps = m.deps || [];
      return { ...m, deps: deps.includes(parentId) ? deps.filter(d => d !== parentId) : [...deps, parentId] };
    }));
  };

  // Compute simple column layout based on dependency depth.
  const depthOf = {};
  const resolve = (id, stack = new Set()) => {
    if (depthOf[id] != null) return depthOf[id];
    if (stack.has(id)) return 0;
    stack.add(id);
    const m = members.find(x => x.agentId === id);
    const d = (m?.deps || []).length === 0
      ? 0
      : 1 + Math.max(...m.deps.map(p => resolve(p, stack)));
    depthOf[id] = d;
    return d;
  };
  members.forEach(m => resolve(m.agentId));
  const columns = {};
  members.forEach(m => {
    const d = depthOf[m.agentId] || 0;
    (columns[d] = columns[d] || []).push(m);
  });
  const columnArr = Object.keys(columns).sort((a, b) => a - b).map(k => columns[k]);

  return (
    <>
      <Section
        title={`Members · ${members.length}`}
        sub="Add agents and declare dependencies. Column = pipeline stage."
        right={
          <button className="btn-primary-accent" onClick={() => setPicker(true)}>
            <Icon name="plus" size={11} /> Add agent
          </button>
        }
      >
        {members.length === 0 ? (
          <div className="empty-inline" style={{ padding: 30 }}>No agents yet.</div>
        ) : (
          <div className="dag-canvas">
            {columnArr.map((col, ci) => (
              <div key={ci} className="dag-col">
                <div className="dag-col-label">Stage {ci + 1}</div>
                {col.map(m => {
                  const a = agents.find(x => x.id === m.agentId);
                  if (!a) return null;
                  return (
                    <div key={m.agentId} className="dag-node">
                      <div className="dn-head">
                        <div className="dn-avatar" style={{ background: a.color }}>
                          <Icon name={a.icon} size={13} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="dn-name">{a.name}</div>
                          <input className="dn-role" value={m.role}
                            onChange={e => set("members", members.map(x => x.agentId === m.agentId ? { ...x, role: e.target.value } : x))} />
                        </div>
                        <button className="ibtn" title="Open agent" onClick={() => goToEntity && goToEntity("agent", a.id)}>
                          <Icon name="arrow" size={11} />
                        </button>
                        <button className="ibtn danger" onClick={() => removeMember(m.agentId)}>
                          <Icon name="x" size={11} />
                        </button>
                      </div>
                      <div className="dn-deps">
                        <span className="muted small">Depends on:</span>
                        {members.filter(x => x.agentId !== m.agentId).length === 0
                          ? <span className="muted small" style={{ marginLeft: 6 }}>—</span>
                          : members.filter(x => x.agentId !== m.agentId).map(other => {
                              const o = agents.find(a => a.id === other.agentId);
                              if (!o) return null;
                              const on = (m.deps || []).includes(other.agentId);
                              return (
                                <button key={other.agentId}
                                  className={"dep-chip " + (on ? "on" : "")}
                                  onClick={() => toggleDep(m.agentId, other.agentId)}>
                                  <span className="dot" style={{ background: o.color }} />
                                  {o.name}
                                </button>
                              );
                            })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Section>

      {picker && (
        <div className="modal-backdrop" onClick={() => setPicker(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-head">
              <h3>Add agent</h3>
              <button className="ibtn" onClick={() => setPicker(false)}><Icon name="x" size={12} /></button>
            </div>
            <div className="modal-body">
              {nonMembers.length === 0 && <div className="empty-inline">All agents added.</div>}
              {nonMembers.map(a => (
                <button key={a.id} className="avail-row" onClick={() => addMember(a.id)}>
                  <span className="agent-avatar sm" style={{ background: a.color }}>
                    <Icon name={a.icon} size={11} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                    <div className="muted small clamp-1">{a.role}</div>
                  </div>
                  <Icon name="plus" size={12} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ——— Prompts & inputs ——— */
function TplPrompts({ draft, set }) {
  const inputs = draft.inputs || [];
  const addInput = () => set("inputs", [...inputs, { name: `field${inputs.length + 1}`, type: "string", label: "", required: false }]);
  const updInput = (i, patch) => set("inputs", inputs.map((x, j) => j === i ? { ...x, ...patch } : x));
  const rmInput = (i) => set("inputs", inputs.filter((_, j) => j !== i));
  const types = ["string", "text", "number", "boolean", "select", "file"];
  return (
    <>
      <Section title="Input parameters" sub="Collected from the user before the team runs.">
        <div className="inputs-list">
          {inputs.map((inp, i) => (
            <div key={i} className="input-row">
              <input className="mono" value={inp.name} onChange={e => updInput(i, { name: e.target.value.replace(/\s/g, "_") })} placeholder="snake_case" />
              <select value={inp.type} onChange={e => updInput(i, { type: e.target.value })}>
                {types.map(t => <option key={t}>{t}</option>)}
              </select>
              <input value={inp.label || ""} onChange={e => updInput(i, { label: e.target.value })} placeholder="Label shown to user" />
              <label className="req-check">
                <input type="checkbox" checked={!!inp.required} onChange={e => updInput(i, { required: e.target.checked })} />
                <span className="muted small">required</span>
              </label>
              <button className="ibtn danger" onClick={() => rmInput(i)}><Icon name="x" size={11} /></button>
            </div>
          ))}
          <button className="schema-add" onClick={addInput}><Icon name="plus" size={11} /> Add input</button>
        </div>
      </Section>

      <Section title="Initial prompt" sub="Sent to the first agent. Use {{inputName}} for substitution.">
        <div className="prompt-editor">
          <div className="prompt-gutter">
            {(draft.initialPrompt || "").split("\n").map((_, i) => <div key={i} className="ln">{i + 1}</div>)}
          </div>
          <textarea className="prompt-code" value={draft.initialPrompt}
            onChange={e => set("initialPrompt", e.target.value)} spellCheck={false} />
        </div>
        <div className="prompt-foot">
          <span className="muted small">Available variables:</span>
          {inputs.map(inp => (
            <span key={inp.name} className="var-pill">{"{{" + inp.name + "}}"}</span>
          ))}
        </div>
      </Section>
    </>
  );
}

/* ——— Runs history ——— */
function TplRuns({ draft }) {
  const runs = draft.runHistory || [];
  return (
    <Section title={`Run history · ${runs.length}`}>
      <div className="runs-table">
        <div className="rt-head">
          <span>Status</span>
          <span>User</span>
          <span>Date</span>
          <span>Duration</span>
          <span>Rating</span>
          <span />
        </div>
        {runs.map(r => (
          <div key={r.id} className="rt-row">
            <span className={"status-pill " + r.status}>{r.status}</span>
            <span className="mono small">{r.user}</span>
            <span className="muted small">{new Date(r.date).toLocaleString()}</span>
            <span className="mono small">{r.duration}</span>
            <span>{r.rating ? "★".repeat(r.rating) : "—"}</span>
            <button className="ibtn"><Icon name="arrow" size={11} /></button>
          </div>
        ))}
      </div>
    </Section>
  );
}

Object.assign(window, { TemplateDetail });
