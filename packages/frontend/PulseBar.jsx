// Activity Pulse — sticky pill at top of chat-thread.
// Internal popovers (status / approvals) live in this file by design.

function PulseStatusPopover({ kind, tasks, agents, onPickTask, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const titleMap = { running: "Running tasks", awaiting: "Awaiting input", queued: "Queued tasks" };
  const filtered = (tasks || []).filter(t => t.status === kind);

  return (
    <div className="pulse-pop" ref={ref} role="dialog" aria-label={titleMap[kind]}>
      <div className="pulse-pop-head">
        <Icon name={kind === "awaiting" ? "flag" : kind === "running" ? "spark" : "layers"} size={13} />
        <div className="pulse-pop-title">{titleMap[kind]}</div>
        <button className="pulse-pop-close" onClick={onClose} aria-label="Close"><Icon name="x" size={12} /></button>
      </div>
      {filtered.length === 0 ? (
        <div className="pulse-pop-empty">
          <Icon name="info" size={16} />
          <span>No {kind} tasks right now.</span>
        </div>
      ) : (
        <ul className="pulse-pop-list">
          {filtered.map(t => {
            const ag = (agents || []).find(a => a.id === t.agent);
            return (
              <li
                key={t.id}
                className="pulse-pop-row"
                tabIndex={0}
                onClick={() => { onPickTask && onPickTask(t.id); onClose(); }}
                onKeyDown={(e) => { if (e.key === "Enter") { onPickTask && onPickTask(t.id); onClose(); } }}
              >
                {ag && <AgentBadge agent={ag} size={18} />}
                <div className="pulse-pop-row-main">
                  <div className="pulse-pop-row-title">{t.title}</div>
                  <div className="pulse-pop-row-meta">
                    <span>{ag?.name || "—"}</span>
                    <span className="mono">{t.due || ""}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PulseApprovalsPopover({ approvals, agents, onPickApproval, onDecide, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const pending = (approvals || []).filter(a => (a.status || "pending") === "pending");

  return (
    <div className="pulse-pop" ref={ref} role="dialog" aria-label="Pending approvals">
      <div className="pulse-pop-head">
        <Icon name="bell" size={13} />
        <div className="pulse-pop-title">Pending approvals</div>
        <button className="pulse-pop-close" onClick={onClose} aria-label="Close"><Icon name="x" size={12} /></button>
      </div>
      {pending.length === 0 ? (
        <div className="pulse-pop-empty">
          <Icon name="check" size={16} />
          <span>You're all caught up.</span>
        </div>
      ) : (
        <ul className="pulse-pop-list">
          {pending.map(a => {
            const ag = (agents || []).find(x => x.id === a.from);
            return (
              <li key={a.id} className="pulse-pop-row" tabIndex={0}>
                {ag && <AgentBadge agent={ag} size={18} />}
                <div className="pulse-pop-row-main">
                  <div className="pulse-pop-row-title">{a.title}</div>
                  <div className="pulse-pop-row-meta">
                    <span>{ag?.name || a.from}</span>
                    <span className="mono">{a.age || ""}</span>
                  </div>
                </div>
                <div className="pulse-pop-actions" style={{ padding: 0 }}>
                  <button
                    className="btn-ghost"
                    onClick={() => { onPickApproval && onPickApproval(a.id); onClose(); }}
                    title="Jump to approval card"
                  >
                    <Icon name="eye" size={11} /> View
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PulseBar({
  tasks,
  agentThreads,
  approvals,
  agents,
  currentSessionId,
  onSelectAgent,
  onFocusTask,
  onFocusApproval,
}) {
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem("at.chat.pulse.collapsed") === "1"; } catch { return false; }
  });
  React.useEffect(() => {
    try { localStorage.setItem("at.chat.pulse.collapsed", collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);

  const [openPop, setOpenPop] = React.useState(null); // 'running' | 'awaiting' | 'queued' | 'bell' | null
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [hovering, setHovering] = React.useState(false);
  const [shaking, setShaking] = React.useState(false);
  const prevPendingRef = React.useRef(0);

  const safeTasks = tasks || [];
  const total = safeTasks.length;
  const done = safeTasks.filter(t => t.status === "done").length;
  const running = safeTasks.filter(t => t.status === "running").length;
  const awaiting = safeTasks.filter(t => t.status === "awaiting").length;
  const queued = safeTasks.filter(t => t.status === "queued").length;
  const blocked = safeTasks.filter(t => t.status === "blocked").length;

  const pendingApprovals = (approvals || []).filter(a => (a.status || "pending") === "pending");
  const unread = pendingApprovals.length;

  // Bell shake — fire when unread goes 0→>0, plus a periodic gentle shake every 12s while there's something pending.
  React.useEffect(() => {
    const prev = prevPendingRef.current;
    if (prev === 0 && unread > 0) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 600);
      prevPendingRef.current = unread;
      return () => clearTimeout(t);
    }
    prevPendingRef.current = unread;
  }, [unread]);
  React.useEffect(() => {
    if (unread === 0) return;
    const id = setInterval(() => {
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
    }, 12000);
    return () => clearInterval(id);
  }, [unread]);

  // Activity carousel from agentThreads[currentSessionId]: latest tool/agent message per agent, sorted, capped at 6.
  const activityItems = React.useMemo(() => {
    const bucket = (agentThreads && currentSessionId) ? agentThreads[currentSessionId] : null;
    if (!bucket) return [];
    const items = [];
    Object.keys(bucket).forEach(agId => {
      const thread = bucket[agId] || [];
      const last = [...thread].reverse().find(m => m.role === "tool" || m.role === "agent");
      if (last) items.push({ agentId: agId, role: last.role, text: last.text, tool: last.tool, ts: last.ts || 0 });
    });
    items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return items.slice(0, 6);
  }, [agentThreads, currentSessionId]);

  React.useEffect(() => {
    if (activityItems.length <= 1 || hovering) return;
    const id = setInterval(() => setActiveIndex(i => (i + 1) % activityItems.length), 4000);
    return () => clearInterval(id);
  }, [activityItems.length, hovering]);
  React.useEffect(() => {
    if (activeIndex >= activityItems.length) setActiveIndex(0);
  }, [activityItems.length, activeIndex]);

  // Progress ring math — circumference for r=7 ≈ 43.98.
  const C = 44;
  const ratio = total > 0 ? done / total : 0;
  const offset = C * (1 - ratio);
  const ringState = total > 0 && done === total ? "all-done" : (blocked > 0 ? "warn" : "default");

  // Determine compact/narrow classes (CSS @container handles main breakpoints, but keep classes for fallback).
  const barClass = "pulse-bar";

  if (collapsed) {
    return (
      <button
        type="button"
        className="pulse-bar-pill"
        onClick={() => setCollapsed(false)}
        aria-label="Expand activity pulse"
      >
        <span className="pulse-bar-pill-bell" data-has-unread={unread > 0} />
        <span><b style={{ color: "var(--ink)", fontWeight: 600 }}>{done}</b><span style={{ color: "var(--ink-3)" }}>/{total}</span></span>
        <Icon name="chevron-down" size={11} style={{ transform: "rotate(180deg)" }} />
      </button>
    );
  }

  const current = activityItems[activeIndex];
  const currentAgent = current ? (agents || []).find(a => a.id === current.agentId) : null;
  if (total === 0 && unread === 0 && activityItems.length === 0) return null;

  return (
    <div className={barClass} data-collapsed="false" role="region" aria-label="Activity pulse">
      <button
        type="button"
        className="pulse-bar-progress"
        data-state={ringState}
        title={`${done} of ${total} tasks done`}
        onClick={() => setOpenPop(p => p === "running" ? null : "running")}
        aria-haspopup="dialog"
      >
        <svg className="pulse-ring" width="18" height="18" viewBox="0 0 18 18">
          <circle className="pulse-ring-track" cx="9" cy="9" r="7" />
          <circle
            className="pulse-ring-fill"
            cx="9" cy="9" r="7"
            style={{ "--ring-c": C, "--ring-off": offset }}
          />
        </svg>
        <span className="pulse-ring-label">{done}/{total}</span>
      </button>

      <span className="pulse-bar-sep" />

      <button
        type="button"
        className="pulse-bar-chip"
        onClick={() => setOpenPop(p => p === "running" ? null : "running")}
        aria-haspopup="dialog"
        style={{ position: "relative", background: "transparent", border: 0, cursor: "pointer", color: "inherit" }}
      >
        <span className="status-dot s-running" /> <span className="pulse-bar-chip-n">{running}</span> <span className="pulse-bar-chip-l">running</span>
        {openPop === "running" && (
          <PulseStatusPopover
            kind="running"
            tasks={safeTasks}
            agents={agents}
            onPickTask={onFocusTask}
            onClose={() => setOpenPop(null)}
          />
        )}
      </button>
      <button
        type="button"
        className="pulse-bar-chip"
        onClick={() => setOpenPop(p => p === "awaiting" ? null : "awaiting")}
        aria-haspopup="dialog"
        style={{ position: "relative", background: "transparent", border: 0, cursor: "pointer", color: "inherit" }}
      >
        <span className="status-dot s-awaiting" /> <span className="pulse-bar-chip-n">{awaiting}</span> <span className="pulse-bar-chip-l">awaiting</span>
        {openPop === "awaiting" && (
          <PulseStatusPopover
            kind="awaiting"
            tasks={safeTasks}
            agents={agents}
            onPickTask={onFocusTask}
            onClose={() => setOpenPop(null)}
          />
        )}
      </button>
      <button
        type="button"
        className="pulse-bar-chip"
        onClick={() => setOpenPop(p => p === "queued" ? null : "queued")}
        aria-haspopup="dialog"
        style={{ position: "relative", background: "transparent", border: 0, cursor: "pointer", color: "inherit" }}
      >
        <span className="status-dot s-queued" /> <span className="pulse-bar-chip-n">{queued}</span> <span className="pulse-bar-chip-l">queued</span>
        {openPop === "queued" && (
          <PulseStatusPopover
            kind="queued"
            tasks={safeTasks}
            agents={agents}
            onPickTask={onFocusTask}
            onClose={() => setOpenPop(null)}
          />
        )}
      </button>

      <span className="pulse-bar-sep" />

      <button
        type="button"
        className="pulse-bar-activity"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={() => current && onSelectAgent && onSelectAgent(current.agentId)}
        aria-label="Latest agent activity"
      >
        <span className="pulse-bar-activity-ico">
          {currentAgent ? <AgentBadge agent={currentAgent} size={14} /> : <Icon name="spark" size={12} />}
        </span>
        <span className="pulse-bar-activity-track" aria-live="polite">
          {current ? (
            <span key={activeIndex} className="pulse-bar-activity-text is-current">
              <b>{currentAgent?.name || current.agentId}</b>
              {current.tool ? <span className="mono">{current.tool}</span> : null}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{current.text || ""}</span>
            </span>
          ) : (
            <span className="pulse-bar-activity-text"><span style={{ color: "var(--ink-4)" }}>No recent activity</span></span>
          )}
        </span>
      </button>

      <button
        type="button"
        className={"pulse-bar-bell" + (shaking ? " is-shaking" : "")}
        data-unread={unread}
        onClick={() => setOpenPop(p => p === "bell" ? null : "bell")}
        aria-label={unread ? `${unread} pending approvals` : "No pending approvals"}
        aria-haspopup="dialog"
        style={{ position: "relative" }}
      >
        <Icon name="bell" size={13} />
        <span className="pulse-bar-bell-badge">{unread}</span>
        {openPop === "bell" && (
          <PulseApprovalsPopover
            approvals={approvals || []}
            agents={agents}
            onPickApproval={onFocusApproval}
            onClose={() => setOpenPop(null)}
          />
        )}
      </button>

      <button
        type="button"
        className="pulse-bar-collapse"
        onClick={() => setCollapsed(true)}
        aria-label="Collapse activity pulse"
      >
        <Icon name="chevron-down" size={12} />
      </button>
    </div>
  );
}

Object.assign(window, { PulseBar });
