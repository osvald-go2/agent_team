// Sidebar — global navigation
const NAV = [
  { section: "WORKSPACE", items: [
    { id: "chat", label: "Main Session", icon: "chat", live: true },
    { id: "approvals", label: "Approvals", icon: "flag", count: 4 },
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

function Sidebar({ page, setPage }) {
  return (
    <aside className="sidebar">
      {NAV.map(sec => (
        <div className="section" key={sec.section}>
          <div className="section-label">{sec.section}</div>
          {sec.items.map(it => (
            <div
              key={it.id}
              className={"nav-item " + (page === it.id ? "active" : "")}
              onClick={() => setPage(it.id)}
            >
              <Icon name={it.icon} size={15} />
              <span>{it.label}</span>
              {it.live && <span className="live" />}
              {it.count != null && <span className="count">{it.count}</span>}
            </div>
          ))}
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

function Topbar({ page, sessionName }) {
  const crumbMap = {
    chat: ["Sessions", sessionName],
    approvals: ["Workspace", "Approvals"],
    history: ["Workspace", "History"],
    agents: ["Library", "Agents"],
    skills: ["Library", "Skills"],
    knowledge: ["Library", "Knowledge bases"],
    templates: ["Library", "Team templates"],
    settings: ["Account", "Settings"],
  };
  const crumb = crumbMap[page] || [];
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" />
        <span>Atelier</span>
      </div>
      <div className="crumb">
        {crumb.map((c, i) => (
          <React.Fragment key={i}>
            <span className={i === crumb.length - 1 ? "current" : ""}>{c}</span>
            {i < crumb.length - 1 && <span className="sep">/</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="spacer" />
      {page === "chat" && (
        <>
          <span className="run-state"><span className="dot" /> team.running · 6 agents</span>
          <button className="ghost-btn"><Icon name="history" size={13} /> Run log</button>
          <button className="ghost-btn"><Icon name="download" size={13} /> Export</button>
          <button className="primary-btn"><Icon name="plus" size={13} /> New session</button>
        </>
      )}
      {page !== "chat" && (
        <>
          <button className="ghost-btn"><Icon name="search" size={13} /> Search</button>
          <button className="primary-btn"><Icon name="plus" size={13} /> New</button>
        </>
      )}
    </header>
  );
}

Object.assign(window, { Sidebar, Topbar });
