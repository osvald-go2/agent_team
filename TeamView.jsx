// Right-side Team view: Kanban / Canvas / Roster — with task CRUD

const TASK_FIELDS_FACTORY = (agents) => [
  { name: "title", kind: "text", label: "Title" },
  { name: "agent", kind: "select", label: "Assigned agent", options: agents.map(a => ({ value: a.id, label: a.name })) },
  { name: "status", kind: "select", label: "Status", options: ["queued", "running", "awaiting", "done"] },
  { name: "priority", kind: "select", label: "Priority", options: ["P1", "P2", "P3"] },
  { name: "due", kind: "text", label: "Due", placeholder: "e.g. 10:30" },
  { name: "activity", kind: "textarea", label: "Current activity", rows: 2, placeholder: "What the agent is doing right now" },
];

function Kanban({ tasks, agents, onSelectAgent, onSelectTask, store }) {
  const cols = [
    { id: "queued", label: "Queued", color: "var(--ink-4)" },
    { id: "running", label: "In progress", color: "var(--accent)" },
    { id: "awaiting", label: "Awaiting approval", color: "var(--warn)" },
    { id: "done", label: "Done", color: "var(--ok)" },
  ];
  const getAgent = id => agents.find(a => a.id === id);
  const crud = useCrud("tasks", store);
  const fields = TASK_FIELDS_FACTORY(agents);

  const seedFor = (status) => ({ title: "", agent: agents[0]?.id, status, priority: "P2", due: "—", activity: "" });

  return (
    <div className="kanban">
      {cols.map(col => {
        const items = tasks.filter(t => t.status === col.id);
        return (
          <div className="kcol" key={col.id}>
            <div className="kcol-head">
              <span className="dot" style={{ background: col.color }} />
              <span>{col.label}</span>
              <span className="n">{items.length}</span>
              <button className="ibtn" style={{ marginLeft: "auto" }} onClick={() => crud.openNew(seedFor(col.id))} title="Add task">
                <Icon name="plus" size={12} />
              </button>
            </div>
            <div className="kcol-body">
              {items.map(t => {
                const a = getAgent(t.agent);
                return (
                  <div className="kcard" key={t.id} onClick={() => onSelectTask(t.id)} title={t.title + " — " + (a?.name || "")}>
                    <div className="kcard-top">
                      <div className="t" title={t.title}>{t.title}</div>
                      <RowMenu
                        onView={() => onSelectTask(t.id)}
                        onEdit={() => crud.openEdit(t)}
                        onDuplicate={() => crud.duplicate(t)}
                        onDelete={() => crud.askDelete(t)}
                      />
                    </div>
                    {t.activity && (
                      <div className={"kcard-activity s-" + t.status} title={t.activity}>
                        {t.status === "running" && <span className="spinner-sm" />}
                        {t.status === "done" && <Icon name="check" size={10} />}
                        {t.status === "awaiting" && <Icon name="alert" size={10} />}
                        {t.status === "queued" && <Icon name="clock" size={10} />}
                        <span>{t.activity}</span>
                      </div>
                    )}
                    <div className="meta">
                      <Icon name="clock" size={11} style={{ color: "var(--ink-4)" }} />
                      <span className="mono" style={{ fontSize: 10.5 }}>{t.due}</span>
                      {a && (
                        <span className="agent-pill" title={a.name} onClick={e => { e.stopPropagation(); onSelectAgent(a.id); }}>
                          <span className="agent-ico" style={{ background: a.color }}>
                            <Icon name={a.icon} size={9} />
                          </span>
                          <span className="agent-pill-name">{a.name}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <button className="add-task-btn" onClick={() => crud.openNew(seedFor(col.id))}>
                <Icon name="plus" size={11} /> Add task
              </button>
            </div>
          </div>
        );
      })}

      <EntityDrawer
        open={!!crud.drawer}
        mode={crud.drawer?.mode}
        title={crud.drawer?.mode === "new" ? "New task" : (crud.drawer?.value?.title || "Task")}
        subtitle={crud.drawer?.value?.agent ? getAgent(crud.drawer.value.agent)?.name : null}
        fields={fields}
        value={crud.drawer?.value}
        onClose={crud.close}
        onSave={crud.save}
        onDelete={crud.drawer?.mode !== "new" ? () => crud.askDelete(crud.drawer.value) : null}
        onModeChange={crud.drawer?.mode === "view" ? () => crud.openEdit(crud.drawer.value) : null}
      />
      <ConfirmDialog
        open={!!crud.confirm}
        title={`Delete "${crud.confirm?.name}"?`}
        body="This task will be removed from the board."
        onConfirm={crud.confirmDelete}
        onCancel={() => crud.setConfirm(null)}
      />
    </div>
  );
}

function Canvas({ agents, topologies, onSelectAgent, selectedId }) {
  const wrapRef = React.useRef(null);
  const [size, setSize] = React.useState({ w: 800, h: 600 });
  const [topoId, setTopoId] = React.useState("orchestrator");
  const [positions, setPositions] = React.useState(() => {
    // clone initial positions per topology
    const out = {};
    Object.keys(topologies).forEach(k => {
      out[k] = {};
      Object.entries(topologies[k].nodes).forEach(([id, p]) => { out[k][id] = { x: p.x, y: p.y }; });
    });
    return out;
  });
  const dragRef = React.useRef(null);

  React.useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (wrapRef.current) {
        const r = wrapRef.current.getBoundingClientRect();
        setSize({ w: r.width, h: r.height });
      }
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const topo = topologies[topoId];
  const pos = positions[topoId];
  const CARD_W = 168;
  const CARD_H = 64;

  const toXY = (id) => {
    const p = pos[id];
    if (!p) return { x: 100, y: 100 };
    return { x: (p.x / 100) * size.w, y: (p.y / 100) * size.h };
  };

  const activeEdge = (from, to) => {
    const fromA = agents.find(a => a.id === from);
    const toA = agents.find(a => a.id === to);
    return fromA?.status === "done" && (toA?.status === "running" || toA?.status === "awaiting");
  };

  // Orthogonal step path between two cards, routed by topology shape.
  // shape: "tree" | "pipeline" | "fan"
  const edgePath = (fromId, toId) => {
    const a = toXY(fromId), b = toXY(toId);
    const shape = topo.shape;
    if (shape === "pipeline") {
      // Horizontal; exit right, enter left
      const x1 = a.x + CARD_W / 2, y1 = a.y;
      const x2 = b.x - CARD_W / 2, y2 = b.y;
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    if (shape === "tree") {
      // Vertical cascade: exit bottom, enter top, with midline elbow
      const x1 = a.x, y1 = a.y + CARD_H / 2;
      const x2 = b.x, y2 = b.y - CARD_H / 2;
      const midY = y1 + (y2 - y1) * 0.5;
      const r = 8;
      if (Math.abs(x1 - x2) < 2) return `M ${x1} ${y1} L ${x2} ${y2}`;
      const dir = x2 > x1 ? 1 : -1;
      return `M ${x1} ${y1}
              L ${x1} ${midY - r}
              Q ${x1} ${midY} ${x1 + dir * r} ${midY}
              L ${x2 - dir * r} ${midY}
              Q ${x2} ${midY} ${x2} ${midY + r}
              L ${x2} ${y2}`;
    }
    // fan shape: horizontal with vertical elbows
    const x1 = a.x + CARD_W / 2, y1 = a.y;
    const x2 = b.x - CARD_W / 2, y2 = b.y;
    const midX = x1 + (x2 - x1) * 0.5;
    const r = 8;
    if (Math.abs(y1 - y2) < 2) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const dir = y2 > y1 ? 1 : -1;
    return `M ${x1} ${y1}
            L ${midX - r} ${y1}
            Q ${midX} ${y1} ${midX} ${y1 + dir * r}
            L ${midX} ${y2 - dir * r}
            Q ${midX} ${y2} ${midX + r} ${y2}
            L ${x2} ${y2}`;
  };

  // Drag handling
  const onPointerDown = (e, id) => {
    if (e.target.closest("[data-no-drag]")) return;
    e.preventDefault();
    const node = e.currentTarget;
    node.setPointerCapture?.(e.pointerId);
    const rect = wrapRef.current.getBoundingClientRect();
    const { x, y } = toXY(id);
    dragRef.current = {
      id,
      offsetX: e.clientX - (rect.left + x),
      offsetY: e.clientY - (rect.top + y),
      moved: false,
      node,
    };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left - d.offsetX;
    const py = e.clientY - rect.top - d.offsetY;
    const nx = Math.max(CARD_W / 2 + 6, Math.min(rect.width - CARD_W / 2 - 6, px));
    const ny = Math.max(CARD_H / 2 + 6, Math.min(rect.height - CARD_H / 2 - 6, py));
    d.moved = true;
    setPositions(prev => ({
      ...prev,
      [topoId]: { ...prev[topoId], [d.id]: { x: (nx / rect.width) * 100, y: (ny / rect.height) * 100 } },
    }));
  };
  const onPointerUp = (e, id) => {
    const d = dragRef.current;
    if (d && !d.moved) onSelectAgent(id);
    dragRef.current = null;
  };

  const resetLayout = () => {
    const out = {};
    Object.entries(topo.nodes).forEach(([id, p]) => { out[id] = { x: p.x, y: p.y }; });
    setPositions(prev => ({ ...prev, [topoId]: out }));
  };

  const topoList = [
    { id: "orchestrator", label: "Orchestrator", icon: "layers" },
    { id: "sequential",   label: "Pipeline",     icon: "arrow" },
    { id: "parallel",     label: "Parallel",     icon: "grid" },
  ];

  // Filter agents to those present in the active topology
  const activeAgents = agents.filter(a => topo.nodes[a.id]);

  const statusLabel = { running: "running", done: "done", queued: "queued", awaiting: "awaiting" };

  return (
    <div className="canvas-wrap" ref={wrapRef} onPointerMove={onPointerMove}>
      <div className="canvas-bg" />

      {/* Topology switcher */}
      <div className="topo-bar">
        <div className="topo-switch">
          {topoList.map(t => (
            <button key={t.id} className={"topo-btn " + (topoId === t.id ? "active" : "")} onClick={() => setTopoId(t.id)}>
              <Icon name={t.icon} size={11} /> {t.label}
            </button>
          ))}
        </div>
        <div className="topo-meta">
          <span className="topo-title">{topo.name}</span>
          <span className="topo-sub mono">{topo.subtitle}</span>
        </div>
        <div className="topo-tools">
          <button className="btn-ghost" onClick={resetLayout} title="Reset layout">
            <Icon name="target" size={11} /> Reset
          </button>
        </div>
      </div>

      {/* Edges */}
      <svg className="canvas-svg" width={size.w} height={size.h}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
          <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>
        {topo.edges.map(([f, t], i) => {
          if (!pos[f] || !pos[t]) return null;
          const path = edgePath(f, t);
          const active = activeEdge(f, t);
          return (
            <g key={i}>
              <path className={"canvas-edge " + (active ? "active" : "")} d={path}
                markerEnd={active ? "url(#arrow-active)" : "url(#arrow)"} />
              {active && (
                <circle className="edge-dot" r="3">
                  <animateMotion dur="2.6s" repeatCount="indefinite" path={path} />
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      {/* Nodes — compact "kanban-style" cards */}
      {activeAgents.map(a => {
        if (!pos[a.id]) return null;
        const { x, y } = toXY(a.id);
        const role = topo.nodes[a.id].role;
        return (
          <div
            key={a.id}
            className={"canvas-node canvas-card " + (selectedId === a.id ? "selected" : "") + " s-" + a.status}
            style={{ left: x, top: y, width: CARD_W, height: CARD_H }}
            onPointerDown={(e) => onPointerDown(e, a.id)}
            onPointerUp={(e) => onPointerUp(e, a.id)}
          >
            <div className="cc-top">
              <span className="ag-ico" style={{ background: a.color }}><Icon name={a.icon} size={11} /></span>
              <div className="cc-titles">
                <div className="cc-name" title={a.name}>{a.name}</div>
                <div className="cc-role mono">{role}</div>
              </div>
            </div>
            <div className="cc-bottom">
              <span className={"badge s-" + a.status}>
                <span className="status-dot" /> {statusLabel[a.status] || a.status}
              </span>
              {a.status === "running" && <span className="spinner-sm" data-no-drag />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ———————————————————————————————————————————
// Roster — flat tiled display of every task as a live "thread" card.
// Each card shows task title, assigned agent, recent message log, composer input
// and a terminate control. Cards are grouped by status (running / awaiting /
// queued / done) into collapsible sections, sorted by latest activity.
// ———————————————————————————————————————————
function Roster({ agents, tasks, threads, onSelectAgent, store }) {
  const tasksCrud = useCrud("tasks", store);
  const getAgent = id => agents.find(a => a.id === id);

  // Per-task ephemeral state (messages appended in UI, input draft).
  // Seed message log from agentThreads + task.activity so every card has content.
  const seedMessages = React.useCallback((task) => {
    const base = (threads && threads[task.agent]) || [];
    // Take the last ~3 agent/tool messages as the "thread" summary for this task.
    const trimmed = base.slice(-3).map((m, i) => ({
      id: `${task.id}-seed-${i}`,
      role: m.role === "agent" ? "agent" : (m.role === "tool" ? "tool" : "system"),
      tool: m.tool,
      text: m.text,
      ts: minutesAgo(3 * (base.length - i)),
    }));
    if (task.activity) {
      trimmed.push({
        id: `${task.id}-now`,
        role: task.status === "done" ? "agent" : "status",
        text: task.activity,
        ts: minutesAgo(0),
      });
    }
    return trimmed;
  }, [threads]);

  const [threadState, setThreadState] = React.useState(() => {
    const init = {};
    tasks.forEach(t => { init[t.id] = { messages: seedMessages(t), draft: "", collapsed: false }; });
    return init;
  });

  // If task list changes (CRUD), ensure we have state for each task.
  React.useEffect(() => {
    setThreadState(prev => {
      const next = { ...prev };
      tasks.forEach(t => { if (!next[t.id]) next[t.id] = { messages: seedMessages(t), draft: "", collapsed: false }; });
      // Drop state for deleted tasks
      Object.keys(next).forEach(k => { if (!tasks.find(t => t.id === k)) delete next[k]; });
      return next;
    });
  }, [tasks, seedMessages]);

  const updateThread = (taskId, patch) => {
    setThreadState(prev => ({ ...prev, [taskId]: { ...prev[taskId], ...patch } }));
  };

  const sendMessage = (task) => {
    const state = threadState[task.id];
    const text = (state?.draft || "").trim();
    if (!text) return;
    const userMsg = { id: `${task.id}-u-${Date.now()}`, role: "user", text, ts: minutesAgo(0) };
    updateThread(task.id, {
      messages: [...(state.messages || []), userMsg],
      draft: "",
    });
    // Fake agent echo so the UI feels alive
    setTimeout(() => {
      setThreadState(prev => {
        const cur = prev[task.id];
        if (!cur) return prev;
        const reply = {
          id: `${task.id}-a-${Date.now()}`,
          role: "agent",
          text: `Got it — incorporating your input into "${task.title}".`,
          ts: minutesAgo(0),
        };
        return { ...prev, [task.id]: { ...cur, messages: [...cur.messages, reply] } };
      });
    }, 600);
  };

  const terminate = (task) => {
    // Mark task done/cancelled via store
    if (store?.update) store.update("tasks", task.id, { status: "done", activity: "Terminated by user" });
    const note = { id: `${task.id}-term-${Date.now()}`, role: "system", text: "Task terminated by user.", ts: minutesAgo(0) };
    updateThread(task.id, { messages: [...(threadState[task.id]?.messages || []), note] });
  };

  // Group-level collapse state, persisted in-memory.
  const [groupCollapsed, setGroupCollapsed] = React.useState({ done: true });

  const GROUPS = [
    { id: "running",  label: "In progress",        color: "var(--accent)" },
    { id: "awaiting", label: "Awaiting approval",  color: "var(--warn)" },
    { id: "queued",   label: "Queued",             color: "var(--ink-4)" },
    { id: "done",     label: "Done",               color: "var(--ok)" },
  ];

  // Latest-activity ordering key per task
  const latestTsKey = (taskId) => {
    const msgs = threadState[taskId]?.messages || [];
    const last = msgs[msgs.length - 1];
    return last ? (last._order ?? msgs.length) : 0;
  };
  // Stable: use message count + latest message string as proxy for "recency"
  const sortByLatest = (a, b) => {
    const ma = threadState[a.id]?.messages || [];
    const mb = threadState[b.id]?.messages || [];
    // Tasks with a user-sent or terminated message bubble to the top.
    const keyA = ma.length * 10 + (ma[ma.length - 1]?.role === "user" ? 5 : 0);
    const keyB = mb.length * 10 + (mb[mb.length - 1]?.role === "user" ? 5 : 0);
    return keyB - keyA;
  };

  return (
    <div className="roster-threads">
      {GROUPS.map(g => {
        const items = tasks.filter(t => t.status === g.id).sort(sortByLatest);
        if (items.length === 0) return null;
        const collapsed = !!groupCollapsed[g.id];
        return (
          <div className={"thread-group " + (collapsed ? "collapsed" : "")} key={g.id}>
            <button
              className="thread-group-head"
              onClick={() => setGroupCollapsed(s => ({ ...s, [g.id]: !s[g.id] }))}
            >
              <Icon name="arrow" size={10} className="chev" />
              <span className="dot" style={{ background: g.color }} />
              <span className="label">{g.label}</span>
              <span className="n">{items.length}</span>
            </button>
            {!collapsed && (
              <div className="thread-grid">
                {items.map(task => {
                  const a = getAgent(task.agent);
                  const state = threadState[task.id] || { messages: [], draft: "" };
                  return (
                    <ThreadCard
                      key={task.id}
                      task={task}
                      agent={a}
                      messages={state.messages}
                      draft={state.draft}
                      onDraft={(v) => updateThread(task.id, { draft: v })}
                      onSend={() => sendMessage(task)}
                      onTerminate={() => terminate(task)}
                      onOpenAgent={() => a && onSelectAgent(a.id)}
                      onEditTask={() => tasksCrud.openEdit(task)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <EntityDrawer
        open={!!tasksCrud.drawer}
        mode={tasksCrud.drawer?.mode}
        title={tasksCrud.drawer?.mode === "new" ? "New task" : (tasksCrud.drawer?.value?.title || "Task")}
        subtitle={tasksCrud.drawer?.value?.agent ? getAgent(tasksCrud.drawer.value.agent)?.name : null}
        fields={TASK_FIELDS_FACTORY(agents)}
        value={tasksCrud.drawer?.value}
        onClose={tasksCrud.close}
        onSave={tasksCrud.save}
        onDelete={tasksCrud.drawer?.mode !== "new" ? () => tasksCrud.askDelete(tasksCrud.drawer.value) : null}
      />
      <ConfirmDialog
        open={!!tasksCrud.confirm}
        title={`Delete "${tasksCrud.confirm?.name}"?`}
        onConfirm={tasksCrud.confirmDelete}
        onCancel={() => tasksCrud.setConfirm(null)}
      />
    </div>
  );
}

// Small helper: format a "minutes ago" timestamp label without real clocks.
function minutesAgo(n) {
  if (n === 0) return "just now";
  if (n < 60) return `${n}m ago`;
  return `${Math.floor(n / 60)}h ago`;
}

function ThreadCard({ task, agent, messages, draft, onDraft, onSend, onTerminate, onOpenAgent, onEditTask }) {
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const statusMeta = {
    running:  { label: "running",  icon: null,      spin: true  },
    awaiting: { label: "awaiting", icon: "alert",   spin: false },
    queued:   { label: "queued",   icon: "clock",   spin: false },
    done:     { label: "done",     icon: "check",   spin: false },
  }[task.status] || { label: task.status };

  const terminable = task.status === "running" || task.status === "awaiting" || task.status === "queued";

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className={"thread-card s-" + task.status}>
      {/* Header */}
      <div className="tc-head">
        <div className="tc-title-wrap">
          <div className="tc-title" title={task.title}>{task.title}</div>
          <div className="tc-sub">
            {agent ? (
              <button className="tc-agent-pill" onClick={onOpenAgent} title={`Open ${agent.name}`}>
                <span className="ag-ico" style={{ background: agent.color }}>
                  <Icon name={agent.icon} size={9} />
                </span>
                <span className="nm">{agent.name}</span>
                <span className="role">{agent.role}</span>
              </button>
            ) : <span className="tc-agent-pill ghost">unassigned</span>}
            <span className={"tc-status s-" + task.status}>
              {statusMeta.spin && <span className="spinner-sm" />}
              {statusMeta.icon && <Icon name={statusMeta.icon} size={9} />}
              <span>{statusMeta.label}</span>
            </span>
            <span className="tc-due mono" title="Due">
              <Icon name="clock" size={9} /> {task.due}
            </span>
          </div>
        </div>
        <div className="tc-actions">
          <button className="ibtn" title="Edit task" onClick={onEditTask}>
            <Icon name="pen" size={11} />
          </button>
          {terminable && (
            <button className="ibtn danger" title="Terminate task" onClick={onTerminate}>
              <Icon name="x" size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Message log */}
      <div className="tc-log" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="tc-empty">No activity yet.</div>
        ) : messages.map(m => (
          <div key={m.id} className={"tc-msg r-" + m.role}>
            <div className="tc-msg-meta">
              <span className="who">
                {m.role === "user" ? "You" :
                 m.role === "agent" ? (agent?.name || "Agent") :
                 m.role === "tool" ? (m.tool || "tool") :
                 m.role === "status" ? "Status" : "System"}
              </span>
              <span className="ts mono">{m.ts}</span>
            </div>
            <div className="tc-msg-body">{m.text}</div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="tc-composer">
        <textarea
          placeholder={task.status === "done" ? "Task finished — reply to re-open…" : "Send a message to this thread…"}
          rows={1}
          value={draft}
          onChange={e => onDraft(e.target.value)}
          onKeyDown={onKey}
        />
        <button
          className="tc-send"
          onClick={onSend}
          disabled={!draft.trim()}
          title="Send (Enter)"
        >
          <Icon name="arrow" size={12} />
        </button>
      </div>
    </div>
  );
}

function TeamView({ view, setView, agents, tasks, edges, nodePos, topologies,
                   onSelectAgent, onSelectTask, selectedId, onCollapse, store }) {
  return (
    <div className="right">
      <div className="right-header">
        <button className="collapse-btn" onClick={onCollapse} title="Collapse panel">
          <Icon name="arrow" size={13} style={{ transform: "scaleX(-1)" }} />
        </button>
        <div className="view-switch">
          <button className={view === "kanban" ? "active" : ""} onClick={() => setView("kanban")}>
            <Icon name="board" size={12} /> Kanban
          </button>
          <button className={view === "canvas" ? "active" : ""} onClick={() => setView("canvas")}>
            <Icon name="canvas" size={12} /> Graph
          </button>
          <button className={view === "roster" ? "active" : ""} onClick={() => setView("roster")}>
            <Icon name="grid" size={12} /> Roster
          </button>
        </div>
        <span className="muted small" style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11 }}>
          {agents.length} agents · {tasks.length} tasks
        </span>
      </div>
      <div className="right-body">
        {view === "kanban" && <Kanban tasks={tasks} agents={agents}
          onSelectAgent={onSelectAgent} onSelectTask={onSelectTask} store={store} />}
        {view === "canvas" && <Canvas agents={agents} topologies={topologies} onSelectAgent={onSelectAgent} selectedId={selectedId} />}
        {view === "roster" && <Roster agents={agents} tasks={tasks} threads={window.AppData?.agentThreads?.["sess-lighthouse-01"] || {}} onSelectAgent={onSelectAgent} store={store} />}
      </div>
    </div>
  );
}

Object.assign(window, { TeamView });
