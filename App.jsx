// Tweaks panel — in-design controls exposed via the Tweaks toggle

function Tweaks({ settings, setSettings }) {
  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));
  return (
    <div className="tweaks-panel">
      <div className="tweaks-head">
        <Icon name="sliders" size={14} />
        <span>Tweaks</span>
        <span className="muted mono" style={{ fontSize: 10.5, marginLeft: "auto" }}>live</span>
      </div>
      <div className="tweaks-body">
        <div className="tweaks-row">
          <label>Theme</label>
          <div className="seg-group">
            {["light", "warm", "dark"].map(t => (
              <button key={t} className={settings.theme === t ? "active" : ""} onClick={() => set("theme", t)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="tweaks-row">
          <label>Density</label>
          <div className="seg-group">
            {["compact", "default", "comfy"].map(d => (
              <button key={d} className={settings.density === d ? "active" : ""} onClick={() => set("density", d)}>{d}</button>
            ))}
          </div>
        </div>
        <div className="tweaks-row">
          <label>Right view default</label>
          <div className="seg-group">
            {["kanban", "canvas", "roster"].map(v => (
              <button key={v} className={settings.rightView === v ? "active" : ""} onClick={() => set("rightView", v)}>{v}</button>
            ))}
          </div>
        </div>
        <div className="tweaks-row">
          <label>Agent avatar style</label>
          <div className="seg-group">
            {["icon", "mono", "colorful"].map(v => (
              <button key={v} className={settings.avatar === v ? "active" : ""} onClick={() => set("avatar", v)}>{v}</button>
            ))}
          </div>
        </div>
        <div className="tweaks-row">
          <label>Show live edge flow</label>
          <div className="seg-group">
            {["on", "off"].map(v => (
              <button key={v} className={settings.edgeFlow === v ? "active" : ""} onClick={() => set("edgeFlow", v)}>{v}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ——— App ——— */

function App() {
  const D = window.AppData;
  const store = useEntityStore();
  const [page, setPage] = React.useState(() => localStorage.getItem("at.page") || "chat");
  // Detail routing: { kind: 'agent' | 'skill' | 'kb' | 'template', id }
  const [detail, setDetail] = React.useState(null);
  const goToEntity = (kind, id) => {
    const pageMap = { agent: "agents", skill: "skills", kb: "knowledge", template: "templates" };
    setPage(pageMap[kind]);
    setDetail({ kind, id });
  };
  const backToList = () => setDetail(null);
  const [rightView, setRightView] = React.useState(() => localStorage.getItem("at.right") || "kanban");

  // Resolve a valid (projectId, sessionId) pair from candidates, falling back through the spec's 3-tier rules.
  const resolveProjectSession = (candProj, candSess) => {
    const sessions = store.state.sessions;
    const projects = store.state.projects;
    // tier 1: candidate session still exists
    const s1 = sessions.find(x => x.id === candSess);
    if (s1) return { projectId: s1.projectId, sessionId: s1.id };
    // tier 2: candidate project's most-recent session
    const projSess = sessions.find(x => x.projectId === candProj);
    if (projSess) return { projectId: candProj, sessionId: projSess.id };
    // tier 3: first project's most-recent session
    const anyProj = projects[0];
    if (anyProj) {
      const anySess = sessions.find(x => x.projectId === anyProj.id);
      if (anySess) return { projectId: anyProj.id, sessionId: anySess.id };
    }
    return { projectId: null, sessionId: null };
  };

  const [{ currentProjectId, currentSessionId }, setCurrent] = React.useState(() => {
    const candProj = localStorage.getItem("at.projectId");
    const candSess = localStorage.getItem("at.sessionId");
    // Resolver can't run here (store state not ready in useState initializer); use rough restore,
    // then the effect below corrects stale ids.
    return { currentProjectId: candProj, currentSessionId: candSess };
  });

  React.useEffect(() => {
    const { projectId, sessionId } = resolveProjectSession(currentProjectId, currentSessionId);
    if (projectId !== currentProjectId || sessionId !== currentSessionId) {
      setCurrent({ currentProjectId: projectId, currentSessionId: sessionId });
    }
    // eslint-disable-next-line — intentional: run once after store seeds; stable in prototype
  }, [store.state.projects, store.state.sessions]);

  React.useEffect(() => {
    if (currentProjectId) localStorage.setItem("at.projectId", currentProjectId);
    else localStorage.removeItem("at.projectId");
  }, [currentProjectId]);
  React.useEffect(() => {
    if (currentSessionId) localStorage.setItem("at.sessionId", currentSessionId);
    else localStorage.removeItem("at.sessionId");
  }, [currentSessionId]);

  const switchSession = (sessionId) => {
    const sess = store.state.sessions.find(x => x.id === sessionId);
    if (!sess) return;
    setCurrent({ currentProjectId: sess.projectId, currentSessionId: sess.id });
    setSelectedAgentId(null);
    setSelectedTaskId(null);
    setPage("chat");
  };

  const switchProject = (projectId) => {
    const sess = store.state.sessions.find(x => x.projectId === projectId);
    if (!sess) {
      setCurrent({ currentProjectId: projectId, currentSessionId: null });
      setSelectedAgentId(null);
      setSelectedTaskId(null);
      setPage("chat");
      return;
    }
    switchSession(sess.id);
  };

  const [selectedAgentId, setSelectedAgentId] = React.useState(null);
  const [selectedTaskId, setSelectedTaskId] = React.useState(null);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [rightW, setRightW] = React.useState(() => {
    const v = parseInt(localStorage.getItem("at.rightW"), 10);
    return Number.isFinite(v) ? v : 640;
  });
  const [rightCollapsed, setRightCollapsed] = React.useState(() => localStorage.getItem("at.rightCollapsed") === "1");
  const [dragging, setDragging] = React.useState(false);
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "light",
    "density": "default",
    "rightView": "kanban",
    "avatar": "icon",
    "edgeFlow": "on"
  }/*EDITMODE-END*/;
  const [settings, setSettings] = React.useState(() => ({
    ...TWEAK_DEFAULTS,
    theme: localStorage.getItem("at.theme") || TWEAK_DEFAULTS.theme,
  }));

  React.useEffect(() => { localStorage.setItem("at.page", page); }, [page]);
  // Clear detail when page tab changes (unless setPage was triggered by goToEntity)
  React.useEffect(() => {
    const allowed = { agents: "agent", skills: "skill", knowledge: "kb", templates: "template" };
    if (detail && allowed[page] !== detail.kind) setDetail(null);
  }, [page]);
  React.useEffect(() => { localStorage.setItem("at.right", rightView); }, [rightView]);
  React.useEffect(() => { localStorage.setItem("at.rightW", String(rightW)); }, [rightW]);
  React.useEffect(() => { localStorage.setItem("at.rightCollapsed", rightCollapsed ? "1" : "0"); }, [rightCollapsed]);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme === "light" ? "" : settings.theme);
  }, [settings.theme]);
  React.useEffect(() => { localStorage.setItem("at.theme", settings.theme); }, [settings.theme]);

  // Drag resizer
  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const vw = window.innerWidth;
      const next = Math.min(900, Math.max(360, vw - e.clientX));
      setRightW(next);
    };
    const onUp = () => setDragging(false);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  React.useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === "__activate_edit_mode") setTweaksOpen(true);
      if (e.data?.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  React.useEffect(() => { setRightView(settings.rightView); }, [settings.rightView]);

  const persistSettings = (next) => {
    setSettings(next);
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: next }, "*");
  };

  const slice = sliceBySession(D, store, currentSessionId);
  const selectedAgent = selectedAgentId ? store.state.agents.find(a => a.id === selectedAgentId) : null;
  const selectedThread = (selectedAgentId && currentSessionId)
    ? (D.agentThreads[currentSessionId]?.[selectedAgentId] || [])
    : [];
  const selectedTasks = selectedAgentId ? slice.tasks.filter(t => t.agent === selectedAgentId) : [];
  const selectedTask = selectedTaskId ? store.state.tasks.find(t => t.id === selectedTaskId) : null;
  const selectedTaskAgent = selectedTask ? store.state.agents.find(a => a.id === selectedTask.agent) : null;
  const closeTaskDrawer = React.useCallback(() => setSelectedTaskId(null), []);

  const densityClass = "app-density-" + settings.density;
  const appClass = "app " + (settings.density !== "default" ? densityClass : "") + (page === "chat" && rightCollapsed ? " right-collapsed" : "");
  const appStyle = page === "chat" && !rightCollapsed ? { "--right-w": rightW + "px" } : undefined;

  return (
    <div className={appClass} style={appStyle} data-screen-label={"App/" + page}>
      <Topbar
        page={page}
        projectName={(store.state.projects.find(p => p.id === currentProjectId) || {}).name}
        sessionName={(store.state.sessions.find(s => s.id === currentSessionId) || {}).name}
        projects={store.state.projects}
        sessions={store.state.sessions}
        currentProjectId={currentProjectId}
        onHome={() => { setPage("dashboard"); setCurrent({ currentProjectId: null, currentSessionId: null }); }}
        onSwitchProject={switchProject}
        onSwitchSession={switchSession}
        onNewProject={() => { setPage("dashboard"); }}
        onNewSession={() => { if (currentProjectId) { const id = store.createSession(currentProjectId, {}); switchSession(id); } }}
      />
      <Sidebar page={page} setPage={setPage} />

      {page === "chat" && (
        <>
          <main className="main" data-screen-label="01 Main Chat">
            <ChatArea
              onSelectAgent={setSelectedAgentId}
              conversation={slice.conversation}
              agents={D.agents}
              templates={D.templates}
            />
          </main>
          {!rightCollapsed && (
            <>
              <div
                className={"resizer " + (dragging ? "dragging" : "")}
                onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
                onDoubleClick={() => setRightW(640)}
                title="Drag to resize · double-click to reset"
              >
                <div className="grip"><Icon name="dots" size={12} style={{ transform: "rotate(90deg)" }} /></div>
              </div>
              <TeamView
                view={rightView}
                setView={setRightView}
                agents={store.state.agents}
                tasks={slice.tasks}
                edges={slice.edges}
                nodePos={slice.nodePos}
                topologies={D.topologies}
                onSelectAgent={setSelectedAgentId}
                onSelectTask={setSelectedTaskId}
                selectedId={selectedAgentId}
                onCollapse={() => setRightCollapsed(true)}
                store={store}
                currentSessionId={currentSessionId}
              />
            </>
          )}
          {rightCollapsed && (
            <aside className="right-collapsed-rail">
              <button title="Expand team panel" onClick={() => setRightCollapsed(false)}>
                <Icon name="arrow" size={13} style={{ transform: "scaleX(-1)" }} />
              </button>
              <div className="divider" />
              <button title="Kanban" onClick={() => { setRightView("kanban"); setRightCollapsed(false); }}>
                <Icon name="board" size={13} />
              </button>
              <button title="Graph" onClick={() => { setRightView("canvas"); setRightCollapsed(false); }}>
                <Icon name="canvas" size={13} />
              </button>
              <button title="Roster" onClick={() => { setRightView("roster"); setRightCollapsed(false); }}>
                <Icon name="grid" size={13} />
              </button>
            </aside>
          )}
        </>
      )}

      {page !== "chat" && (
        <main
          className="main"
          style={{ gridColumn: "2 / -1", borderRight: "none", overflow: "auto" }}
          data-screen-label={"Page/" + page}
        >
          {page === "dashboard" && (
            <Dashboard
              store={store}
              onOpenProject={(id) => switchProject(id)}
              onOpenSession={switchSession}
              onQuickstart={(preset) => {
                const { projectId, sessionId } = store.createProject({
                  name: preset.name,
                  description: preset.description,
                  defaultTemplateId: preset.defaultTemplateId,
                  icon: preset.icon,
                });
                switchSession(sessionId);
              }}
            />
          )}
          {page === "agents" && (detail?.kind === "agent"
            ? <AgentDetail agentId={detail.id} store={store} goBack={backToList} goToEntity={goToEntity} />
            : <AgentsPage store={store} onOpen={(id) => setDetail({ kind: "agent", id })} />)}
          {page === "skills" && (detail?.kind === "skill"
            ? <SkillDetail skillId={detail.id} store={store} goBack={backToList} />
            : <SkillsPage store={store} onOpen={(id) => setDetail({ kind: "skill", id })} />)}
          {page === "knowledge" && (detail?.kind === "kb"
            ? <KBDetail kbId={detail.id} store={store} goBack={backToList} />
            : <KnowledgePage store={store} onOpen={(id) => setDetail({ kind: "kb", id })} />)}
          {page === "templates" && (detail?.kind === "template"
            ? <TemplateDetail templateId={detail.id} store={store} goBack={backToList} goToEntity={goToEntity} />
            : <TemplatesPage store={store} onOpen={(id) => setDetail({ kind: "template", id })} />)}
          {page === "sessions" && <HistoryPage store={store} />}
          {page === "history" && <HistoryPage store={store} />}
          {page === "approvals" && <ApprovalsPage store={store} agents={store.state.agents} />}
          {page === "settings" && (
            <div className="page-wrap">
              <div className="page-head"><div><h2>Settings</h2><div className="sub">Workspace-wide configuration.</div></div></div>
              <div className="grid-card" style={{ maxWidth: 520 }}>
                <div className="tweaks-row">
                  <label>Theme</label>
                  <div className="seg-group">
                    {["light", "warm", "dark"].map(t => (
                      <button
                        key={t}
                        className={settings.theme === t ? "active" : ""}
                        onClick={() => persistSettings({ ...settings, theme: t })}
                      >{t}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {selectedAgent && (
        <AgentDrawer
          agent={selectedAgent}
          thread={selectedThread}
          tasks={selectedTasks}
          onClose={() => setSelectedAgentId(null)}
        />
      )}
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          store={store}
          agent={selectedTaskAgent}
          onClose={closeTaskDrawer}
          onSelectAgent={setSelectedAgentId}
        />
      )}

      {tweaksOpen && <Tweaks settings={settings} setSettings={persistSettings} />}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
