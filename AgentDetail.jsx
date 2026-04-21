// AgentDetail — Config (YAML/JSON) + Preview (read-only card).

function AgentDetail({ agentId, store, goBack, goToEntity }) {
  const agent = store.state.agents.find(a => a.id === agentId);
  const [tab, setTab] = React.useState("config");

  if (!agent) {
    return (
      <div className="detail-empty">
        <div>Agent not found.</div>
        <button className="btn-primary-accent" onClick={goBack}>Back to list</button>
      </div>
    );
  }

  const tabs = [
    { id: "config", label: "Config", icon: "doc" },
    { id: "preview", label: "Preview", icon: "eye" },
  ];

  return (
    <DetailShell
      crumbs={[{ label: "Library" }, { label: "Agents" }, { label: agent.name || "Untitled agent" }]}
      onBack={goBack}
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}
      savedAt={undefined}
    >
      {tab === "config" && <AgentConfigTab agent={agent} store={store} />}
      {tab === "preview" && <AgentPreviewTab agent={agent} store={store} goToEntity={goToEntity} />}
    </DetailShell>
  );
}

/* ——— Config tab (YAML/JSON editor) ——— */
function AgentConfigTab({ agent, store }) {
  const [format, setFormat] = React.useState("yaml");
  const [text, setText] = React.useState(() => serializeAgent(agent, "yaml"));
  const [err, setErr] = React.useState(null);
  const [savedAt, setSavedAt] = React.useState(Date.now());
  const [justCopied, setJustCopied] = React.useState(false);
  const timer = React.useRef(null);
  const skipPersist = React.useRef(true); // skip the first save for initial mount / agent swap
  const agentIdRef = React.useRef(agent.id);

  // Re-serialize when agent changes identity.
  React.useEffect(() => {
    setText(serializeAgent(agent, format));
    setErr(null);
    skipPersist.current = true;
    agentIdRef.current = agent.id;
  }, [agent.id]);

  // Debounced parse + persist.
  React.useEffect(() => {
    if (skipPersist.current) { skipPersist.current = false; return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const parsed = parseAgentText(text, format);
        const merged = applyParsed(agent, parsed);
        store.update("agents", agent.id, merged);
        setErr(null);
        setSavedAt(Date.now());
      } catch (e) {
        setErr(e.message || String(e));
      }
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [text]);

  const switchFormat = (f) => {
    if (f === format) return;
    try {
      const parsed = parseAgentText(text, format);
      setText(serializeObj(parsed, f));
      setErr(null);
    } catch {
      setText(serializeAgent(agent, f));
    }
    skipPersist.current = true;
    setFormat(f);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch {}
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 1200);
  };

  return (
    <div className="config-pane">
      <div className="config-toolbar">
        <SegControl value={format} onChange={switchFormat}
          options={[{ value: "yaml", label: "YAML" }, { value: "json", label: "JSON" }]} />
        <span style={{ flex: 1 }} />
        <SavedIndicator savedAt={savedAt} />
        <button className="btn-ghost" onClick={copy}>
          <Icon name={justCopied ? "check" : "copy"} size={11} />{" "}
          {justCopied ? "Copied" : "Copy"}
        </button>
      </div>
      {err && <div className="config-error"><Icon name="alert" size={11} /> {err}</div>}
      <div className="config-editor">
        <CodeEditor value={text} onChange={setText} language={format} />
      </div>
    </div>
  );
}

/* ——— Preview tab (read-only card) ——— */
function AgentPreviewTab({ agent, store, goToEntity }) {
  const skillsLib = store.state.skills;
  const kbLib = store.state.knowledge;
  const mountedSkills = (agent.skills || []).map(n =>
    skillsLib.find(s => s.name === n || s.id === n) || { id: n, name: n, category: "—", missing: true }
  );
  const mountedKB = (agent.knowledge || []).map(id =>
    kbLib.find(k => k.id === id) || { id, name: id, missing: true }
  );
  const p = agent.params || {};

  return (
    <div className="preview-pane">
      <section className="preview-card hero">
        <div className="hero-avatar" style={{ background: agent.color }}>
          <Icon name={agent.icon || "user"} size={28} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="preview-title">{agent.name || "Untitled agent"}</div>
          {agent.role && <div className="preview-sub muted">{agent.role}</div>}
          {agent.desc && <div className="preview-desc">{agent.desc}</div>}
        </div>
        <div className="preview-model-col">
          <span className="chip mono">{agent.model || "—"}</span>
          {agent.status && <span className={"status-pill " + agent.status}>{agent.status}</span>}
        </div>
      </section>

      {agent.systemPrompt && (
        <section className="preview-card">
          <h4>System prompt</h4>
          <pre className="preview-prompt">{agent.systemPrompt}</pre>
        </section>
      )}

      {Object.keys(p).length > 0 && (
        <section className="preview-card">
          <h4>Parameters</h4>
          <table className="preview-params">
            <tbody>
              {Object.entries(p).map(([k, v]) => (
                <tr key={k}>
                  <td className="mono muted">{k}</td>
                  <td className="mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {mountedSkills.length > 0 && (
        <section className="preview-card">
          <h4>Skills <span className="muted small">· {mountedSkills.length}</span></h4>
          <div className="preview-chips">
            {mountedSkills.map(s => (
              <button key={s.id}
                className={"preview-chip " + (s.missing ? "missing" : "")}
                onClick={() => !s.missing && goToEntity && goToEntity("skill", s.id)}
                title={s.desc || ""}>
                <Icon name={s.icon || "bolt"} size={11} />
                <span className="mono">{s.name}</span>
                {s.category && <span className="chip-tag">{s.category}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {mountedKB.length > 0 && (
        <section className="preview-card">
          <h4>Knowledge <span className="muted small">· {mountedKB.length}</span></h4>
          <div className="preview-chips">
            {mountedKB.map(k => (
              <button key={k.id}
                className={"preview-chip " + (k.missing ? "missing" : "")}
                onClick={() => !k.missing && goToEntity && goToEntity("kb", k.id)}>
                <Icon name="book" size={11} />
                <span>{k.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {Array.isArray(agent.tools) && agent.tools.length > 0 && (
        <section className="preview-card">
          <h4>Tools</h4>
          <div className="preview-chips">
            {agent.tools.map((t, i) => (
              <span key={i} className="preview-chip static">
                <Icon name="cube" size={11} />
                <span className="mono">{t.type || String(t)}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ——— YAML/JSON ↔ agent object ——— */
function serializeAgent(agent, fmt) {
  return serializeObj(pickAgentFields(agent), fmt);
}

function serializeObj(obj, fmt) {
  if (fmt === "json") return JSON.stringify(obj, null, 2);
  if (!window.jsyaml) return JSON.stringify(obj, null, 2);
  return window.jsyaml.dump(obj, { lineWidth: 100, noRefs: true, sortKeys: false });
}

function parseAgentText(text, fmt) {
  if (!text || !text.trim()) return {};
  if (fmt === "json") return JSON.parse(text);
  if (!window.jsyaml) throw new Error("js-yaml not loaded");
  const parsed = window.jsyaml.load(text);
  if (parsed == null || typeof parsed !== "object") {
    throw new Error("Top-level value must be a mapping.");
  }
  return parsed;
}

function pickAgentFields(a) {
  if (!a) return {};
  const out = {
    name: a.name || "",
    model: a.model || "",
    description: a.desc || "",
  };
  if (a.systemPrompt) out.system = a.systemPrompt;
  if (Array.isArray(a.tools) && a.tools.length) out.tools = a.tools;
  if (Array.isArray(a.skills) && a.skills.length) out.skills = a.skills;
  if (Array.isArray(a.knowledge) && a.knowledge.length) out.knowledge = a.knowledge;
  if (a.params && Object.keys(a.params).length) out.params = a.params;

  const meta = {};
  if (a.role) meta.role = a.role;
  if (a.status) meta.status = a.status;
  if (Array.isArray(a.tags) && a.tags.length) meta.tags = a.tags;
  if (Array.isArray(a.guards) && a.guards.length) meta.guards = a.guards;
  if (Object.keys(meta).length) out.metadata = meta;
  return out;
}

function applyParsed(agent, parsed) {
  const out = { ...agent };
  if ("name" in parsed) out.name = parsed.name ?? "";
  if ("model" in parsed) out.model = parsed.model ?? "";
  if ("description" in parsed) out.desc = parsed.description ?? "";
  if ("system" in parsed) out.systemPrompt = parsed.system ?? "";
  if ("tools" in parsed) out.tools = parsed.tools;
  if ("skills" in parsed) out.skills = parsed.skills || [];
  if ("knowledge" in parsed) out.knowledge = parsed.knowledge || [];
  if ("params" in parsed) out.params = parsed.params || {};
  const m = parsed.metadata || {};
  if ("role" in m) out.role = m.role;
  if ("status" in m) out.status = m.status;
  if ("tags" in m) out.tags = m.tags || [];
  if ("guards" in m) out.guards = m.guards || [];
  return out;
}

/* ——— Reusable CodeEditor (overlay of hljs <pre> + transparent textarea) ——— */
function CodeEditor({ value, onChange, language, readOnly, minRows }) {
  const preRef = React.useRef(null);
  const html = React.useMemo(() => highlightHtml(value || "", language), [value, language]);
  // Trailing newline ensures the highlighted block matches textarea's extra line,
  // keeping caret aligned when user presses Enter at end.
  const display = html + (value && value.endsWith("\n") ? "\n" : " ");

  const onScroll = (e) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.target.scrollTop;
      preRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  if (readOnly) {
    return (
      <div className="code-edt">
        <pre ref={preRef} className="code-edt-pre">
          <code className={"hljs language-" + (language || "plaintext")}
            dangerouslySetInnerHTML={{ __html: display }} />
        </pre>
      </div>
    );
  }

  return (
    <div className="code-edt">
      <pre ref={preRef} className="code-edt-pre" aria-hidden="true">
        <code className={"hljs language-" + (language || "plaintext")}
          dangerouslySetInnerHTML={{ __html: display }} />
      </pre>
      <textarea
        className="code-edt-ta mono"
        value={value || ""}
        onChange={e => onChange && onChange(e.target.value)}
        onScroll={onScroll}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        rows={minRows}
      />
    </div>
  );
}

function highlightHtml(text, language) {
  if (!window.hljs) return escapeHtml(text);
  try {
    if (language && window.hljs.getLanguage && window.hljs.getLanguage(language)) {
      return window.hljs.highlight(text, { language, ignoreIllegals: true }).value;
    }
    return window.hljs.highlightAuto(text).value;
  } catch {
    return escapeHtml(text);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

/* ——— Markdown view (marked + hljs on code blocks) ——— */
function MarkdownView({ source }) {
  const ref = React.useRef(null);
  const html = React.useMemo(() => {
    if (!window.marked) return "<pre>" + escapeHtml(source || "") + "</pre>";
    try {
      window.marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
      return window.marked.parse(source || "");
    } catch {
      return "<pre>" + escapeHtml(source || "") + "</pre>";
    }
  }, [source]);

  React.useEffect(() => {
    if (!ref.current || !window.hljs) return;
    ref.current.querySelectorAll("pre code").forEach(el => {
      try { window.hljs.highlightElement(el); } catch {}
    });
  }, [html]);

  return <div ref={ref} className="md-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ——— Shared tag editor (kept for TemplateDetail compatibility) ——— */
function TagEditor({ value, onChange, placeholder }) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    if (!value.includes(t)) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className="tag-editor">
      {value.map((t, i) => (
        <span key={i} className="tag-chip">
          {t}
          <button onClick={() => onChange(value.filter((_, j) => j !== i))}><Icon name="x" size={9} /></button>
        </span>
      ))}
      <input value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={add} placeholder={placeholder || "Add…"} />
    </div>
  );
}

Object.assign(window, { AgentDetail, CodeEditor, MarkdownView, TagEditor, escapeHtml });
