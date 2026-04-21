// Agent drawer — per-agent conversation, tasks, artifacts, settings

function AgentDrawer({ agent, thread, tasks, onClose }) {
  const [tab, setTab] = React.useState("thread");
  const [draft, setDraft] = React.useState("");

  if (!agent) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <span className="ag-ico" style={{ background: agent.color }}>
            <Icon name={agent.icon} size={16} />
          </span>
          <div>
            <div className="name">{agent.name}</div>
            <div className="role">{agent.role} · <span style={{ color: "var(--ink-3)" }}>{agent.model}</span></div>
          </div>
          <span className={"badge s-" + agent.status} style={{ marginLeft: 10 }}>
            <span className="status-dot" /> {agent.status} · {agent.progress}%
          </span>
          <button className="close-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>

        <div className="drawer-tabs">
          <button className={tab === "thread" ? "active" : ""} onClick={() => setTab("thread")}>
            <Icon name="chat" size={11} /> Thread
          </button>
          <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>
            <Icon name="board" size={11} /> Tasks ({tasks.length})
          </button>
          <button className={tab === "artifacts" ? "active" : ""} onClick={() => setTab("artifacts")}>
            <Icon name="doc" size={11} /> Artifacts
          </button>
          <button className={tab === "config" ? "active" : ""} onClick={() => setTab("config")}>
            <Icon name="settings" size={11} /> Config
          </button>
        </div>

        <div className="drawer-body" key={tab + "-" + agent.id}>
          <div className="tab-content">
          {tab === "thread" && (
            <>
              <div className="small muted" style={{ marginBottom: 10 }}>
                {agent.desc}
              </div>
              <div className="thread">
                {thread.map((t, i) => (
                  <div key={i} className={"t-row " + t.role}>
                    <div className="tag">
                      {t.role === "tool" ? t.tool : t.role === "agent" ? "agent" : "system"}
                    </div>
                    <div className="t">{t.text}</div>
                  </div>
                ))}
              </div>
              <div className="mini-composer">
                <textarea
                  placeholder={`Send a direct instruction to ${agent.name}…`}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                />
                <div className="row">
                  <button className="tool-btn" style={{ padding: "4px 8px", fontSize: 11, color: "var(--ink-3)" }}>
                    <Icon name="branch" size={11} /> Steer
                  </button>
                  <button className="tool-btn" style={{ padding: "4px 8px", fontSize: 11, color: "var(--ink-3)" }}>
                    <Icon name="pause" size={11} /> Pause
                  </button>
                  <button className="send" style={{ height: 26, padding: "0 10px", background: agent.color, color: "white", border: "none", borderRadius: 6, fontSize: 11.5, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Icon name="send" size={11} /> Send
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === "tasks" && (
            <TaskTodoList tasks={tasks} />
          )}

          {tab === "artifacts" && (
            <div className="artifact-list">
              <div className="artifact">
                <span className="icon"><Icon name="doc" size={14} /></span>
                <div>
                  <div className="n">requirements.structured.json</div>
                  <div className="m">produced · 09:43 · 24 stories, 11 NFRs</div>
                </div>
                <div className="actions">
                  <button className="tool-btn" style={{ padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 5, fontSize: 11 }}><Icon name="eye" size={11} /></button>
                  <button className="tool-btn" style={{ padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 5, fontSize: 11 }}><Icon name="download" size={11} /></button>
                </div>
              </div>
              <div className="artifact">
                <span className="icon"><Icon name="doc" size={14} /></span>
                <div>
                  <div className="n">conflicts.md</div>
                  <div className="m">produced · 09:44 · 3 flagged</div>
                </div>
                <div className="actions">
                  <button className="tool-btn" style={{ padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 5, fontSize: 11 }}><Icon name="eye" size={11} /></button>
                </div>
              </div>
              <div className="artifact">
                <span className="icon"><Icon name="folder" size={14} /></span>
                <div>
                  <div className="n">intermediate/</div>
                  <div className="m">12 files · 3.1 MB</div>
                </div>
                <div className="actions">
                  <button className="tool-btn" style={{ padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 5, fontSize: 11 }}><Icon name="folder" size={11} /></button>
                </div>
              </div>
            </div>
          )}

          {tab === "config" && (
            <div className="stack">
              <div>
                <div className="small muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10.5, marginBottom: 6 }}>Model</div>
                <div className="mono" style={{ padding: 8, background: "var(--bg-sunken)", borderRadius: 6 }}>{agent.model}</div>
              </div>
              <div>
                <div className="small muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10.5, marginBottom: 6 }}>Skills ({agent.skills.length})</div>
                <div className="row-wrap">
                  {agent.skills.map(s => <span key={s} className="chip mono" style={{ fontSize: 11 }}>{s}</span>)}
                </div>
              </div>
              <div>
                <div className="small muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10.5, marginBottom: 6 }}>Knowledge bases</div>
                <div className="row-wrap">
                  {agent.knowledge.map(k => <span key={k} className="chip"><Icon name="book" size={11} /> {k}</span>)}
                </div>
              </div>
              <div>
                <div className="small muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10.5, marginBottom: 6 }}>Autonomy</div>
                <div className="row-wrap">
                  <span className="chip">auto-approve: low-risk</span>
                  <span className="chip">max turns: 12</span>
                  <span className="chip">tool timeout: 30s</span>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </>
  );
}

window.AgentDrawer = AgentDrawer;

function TaskTodoList({ tasks }) {
  const order = { running: 0, awaiting: 1, queued: 2, done: 3 };
  const sorted = [...tasks].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  const doneCount = tasks.filter(t => t.status === "done").length;
  const runningCount = tasks.filter(t => t.status === "running").length;
  const awaitingCount = tasks.filter(t => t.status === "awaiting").length;
  const openCount = tasks.length - doneCount;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  return (
    <div className="todo-list">
      <div className="todo-summary">
        <div className="todo-summary-line">
          <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{tasks.length} tasks</span>
          <span className="muted small">
            (<b style={{ color: "var(--ok)" }}>{doneCount}</b> done,{" "}
            {runningCount > 0 && <><b style={{ color: "var(--accent)" }}>{runningCount}</b> in progress, </>}
            {awaitingCount > 0 && <><b style={{ color: "var(--warn)" }}>{awaitingCount}</b> awaiting, </>}
            <b style={{ color: "var(--ink-2)" }}>{openCount}</b> open)
          </span>
          <span className="mono small muted" style={{ marginLeft: "auto" }}>{pct}%</span>
        </div>
        <div className="todo-progress"><div className="todo-progress-fill" style={{ width: pct + "%" }} /></div>
      </div>
      <ul className="todo-items">
        {sorted.map((t, i) => (
          <li key={t.id} className={"todo-row s-" + t.status}>
            <span className="todo-check" data-status={t.status}>
              {t.status === "done" && <Icon name="check" size={11} />}
              {t.status === "running" && <span className="spinner" />}
              {t.status === "awaiting" && <Icon name="alert" size={11} />}
              {t.status === "queued" && <span className="square" />}
            </span>
            <span className="todo-num mono">Task {i + 1}:</span>
            <span className="todo-title">{t.title}</span>
            <span className={"prio " + t.priority} style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "1px 5px", borderRadius: 3, border: "1px solid var(--line)", color: t.priority === "P1" ? "var(--danger)" : t.priority === "P2" ? "var(--warn)" : "var(--ink-3)" }}>{t.priority}</span>
            <span className="mono small muted">{t.due}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
