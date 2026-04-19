function CrumbPopover({ label, items, onPick, onNew, newLabel }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <span className="crumb-pop" ref={ref}>
      <button className="crumb-trigger" onClick={() => setOpen(o => !o)}>
        {label} <Icon name="chevron-down" size={11} />
      </button>
      {open && (
        <div className="crumb-menu">
          {items.map(it => (
            <div key={it.id} className="crumb-item" onClick={() => { onPick(it.id); setOpen(false); }}>
              <span className="crumb-item-name">{it.name}</span>
              {it.meta && <span className="crumb-item-meta">{it.meta}</span>}
            </div>
          ))}
          {onNew && (
            <div className="crumb-item crumb-new" onClick={() => { onNew(); setOpen(false); }}>
              <Icon name="plus" size={12} /> {newLabel || "New"}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

// Sidebar — global navigation
const NAV = [
  { section: "WORKSPACE", items: [
    { id: "chat", label: "Main Session", icon: "chat", live: true },
    { id: "approvals", label: "Approvals", icon: "flag" },
    { id: "sessions", label: "Sessions", icon: "history" },
  ]},
  { section: "LIBRARY", items: [
    { id: "agents", label: "Agents", icon: "user", count: 18 },
    { id: "skills", label: "Skills", icon: "bolt", count: 64 },
    { id: "knowledge", label: "Knowledge", icon: "book", count: 12 },
    { id: "templates", label: "Team Templates", icon: "cube", count: 9 },
  ]},
  { section: "ACCOUNT", items: [
    { id: "settings", label: "Settings", icon: "settings" },
  ]},
];

function Sidebar({ page, setPage, counts }) {
  return (
    <aside className="sidebar">
      {NAV.map(sec => (
        <div className="section" key={sec.section}>
          <div className="section-label">{sec.section}</div>
          {sec.items.map(it => {
            const n = counts?.[it.id] ?? it.count;
            return (
              <div
                key={it.id}
                className={"nav-item " + (page === it.id ? "active" : "")}
                onClick={() => setPage(it.id)}
              >
                <Icon name={it.icon} size={15} />
                <span>{it.label}</span>
                {it.live && <span className="live" />}
                {n != null ? <span className="count">{n}</span> : null}
              </div>
            );
          })}
        </div>
      ))}
      <div className="sidebar-footer">
        <div className="avatar">LC</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>Lin Chen</div>
          <div className="muted small" style={{ fontFamily: "var(--font-mono)" }}>Pro · 14d</div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ page, projectName, sessionName, projects, sessions, currentProjectId, onHome, onSwitchProject, onSwitchSession, onNewProject, onNewSession }) {
  const showCrumb = page === "chat" && projectName && sessionName;
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" />
        <span>Atelier</span>
      </div>
      <div className="crumb">
        {showCrumb ? (
          <>
            <button className="crumb-home" onClick={onHome} title="All projects"><Icon name="home" size={13} /></button>
            <CrumbPopover
              label={projectName}
              items={projects.map(p => ({ id: p.id, name: p.name, meta: p.lastActive }))}
              onPick={onSwitchProject}
              onNew={onNewProject}
              newLabel="New project"
            />
            <span className="sep">/</span>
            <CrumbPopover
              label={sessionName}
              items={(sessions || []).filter(s => s.projectId === currentProjectId).map(s => ({ id: s.id, name: s.name, meta: s.when }))}
              onPick={onSwitchSession}
              onNew={onNewSession}
              newLabel="New session"
            />
          </>
        ) : (
          <span className="current">{page === "dashboard" ? "All projects" : page}</span>
        )}
      </div>
      <div className="spacer" />
      {page === "chat" && (
        <>
          <span className="run-state"><span className="dot" /> team.running</span>
          <button className="ghost-btn"><Icon name="history" size={13} /> Run log</button>
          <button className="ghost-btn"><Icon name="download" size={13} /> Export</button>
          <button className="primary-btn" onClick={onNewSession}><Icon name="plus" size={13} /> New session</button>
        </>
      )}
      {page !== "chat" && page !== "dashboard" && (
        <>
          <button className="ghost-btn"><Icon name="search" size={13} /> Search</button>
          <button className="primary-btn"><Icon name="plus" size={13} /> New</button>
        </>
      )}
    </header>
  );
}

Object.assign(window, { Sidebar, Topbar, CrumbPopover });
