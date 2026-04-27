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

  const switchSession = (sessionId, projectIdHint) => {
    if (!sessionId) return;
    const sess = store.state.sessions.find(x => x.id === sessionId);
    const projectId = sess ? sess.projectId : projectIdHint;
    if (!projectId) return;
    setCurrent({ currentProjectId: projectId, currentSessionId: sessionId });
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
  // Pulse focus state — short-lived highlight markers cleared after the anchor animation.
  const [focusedTaskId, setFocusedTaskId] = React.useState(null);
  const [focusedApprovalId, setFocusedApprovalId] = React.useState(null);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  // Guided session flow — owned here so both ChatArea and the right column can read it.
  // phase: "idle" | "clarify" | "building" | "confirm" | "done"
  const [guided, setGuided] = React.useState({ phase: "idle", clarify: null });
  // Reset whenever the active session changes — flow is per-session and ephemeral.
  React.useEffect(() => {
    setGuided({ phase: "idle", clarify: null });
  }, [currentSessionId]);
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

  // ——— Guided flow handlers ———
  const appendMsg = React.useCallback((extra) => {
    if (!currentSessionId) return;
    const id = `msg-${currentSessionId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    store.append("conversation", { id, sessionId: currentSessionId, ...extra });
  }, [currentSessionId, store]);

  const startGuided = React.useCallback((text) => {
    if (!currentSessionId) return;
    appendMsg({ role: "user", text });
    appendMsg({
      role: "assistant",
      agent: "prd-analyst",
      text: "已经解析了你的需求 —— 在右侧回答几个问题，我们就把团队装配起来。",
    });
    setGuided({ phase: "clarify", clarify: null });
  }, [currentSessionId, appendMsg]);

  // Quick-start a session from a preset: create session (in current or a fallback project),
  // seed the guided-flow messages directly by sessionId (closure-free), then switch and enter clarify.
  // setTimeout defers the guided-phase flip past the per-session reset effect on line ~148.
  const quickStartSession = React.useCallback((preset) => {
    if (!preset) return;
    let projectId = currentProjectId;
    if (!projectId) {
      const active = store.state.projects.find(p => p.status !== "archived");
      if (active) {
        projectId = active.id;
      } else {
        const created = store.createProject({
          name: preset.name,
          description: preset.description,
          defaultTemplateId: preset.defaultTemplateId,
          icon: preset.icon,
        });
        projectId = created.projectId;
      }
    }
    const sessionId = store.createSession(projectId, { name: preset.name });
    const mk = (extra) => {
      const id = `msg-${sessionId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      store.append("conversation", { id, sessionId, ...extra });
    };
    mk({ role: "user", text: preset.prompt || preset.description });
    mk({
      role: "assistant",
      agent: "prd-analyst",
      text: "已经解析了你的需求 —— 在右侧回答几个问题，我们就把团队装配起来。",
    });
    switchSession(sessionId, projectId);
    setTimeout(() => setGuided({ phase: "clarify", clarify: null }), 0);
  }, [currentProjectId, store]);

  const summarizeAnswers = (answers) => {
    if (!answers) return "（已跳过澄清）";
    const Q = D.clarifyQuestions;
    const parts = [];
    Q.forEach(q => {
      const v = answers[q.id];
      if (!v) return;
      if (q.kind === "select") {
        const o = q.options.find(x => x.id === v);
        if (o) parts.push(`${q.prompt.replace(/[？?]$/, "")}: ${o.label}`);
      } else if (q.kind === "text" && String(v).trim()) {
        parts.push(`备注: ${String(v).trim()}`);
      }
    });
    return parts.length ? parts.join(" · ") : "（未填写）";
  };

  const startBuildingPhase = React.useCallback(() => {
    appendMsg({
      role: "assistant",
      agent: "prd-analyst",
      text: "收到。正在为这次需求实时组建智能体团队…",
    });
    appendMsg({
      role: "assistant",
      agent: "prd-analyst",
      kind: "agent-build",
      agents: D.guidedAgentScript,
      completed: false,
    });
    setGuided(g => ({ ...g, phase: "building" }));
  }, [appendMsg, D.guidedAgentScript]);

  const submitClarify = React.useCallback((answers) => {
    appendMsg({ role: "user", text: summarizeAnswers(answers) });
    setGuided(g => ({ ...g, clarify: answers }));
    startBuildingPhase();
  }, [appendMsg, startBuildingPhase, D.clarifyQuestions]);

  const skipClarify = React.useCallback(() => {
    appendMsg({ role: "user", text: "（跳过了澄清问题，请按默认装配）" });
    startBuildingPhase();
  }, [appendMsg, startBuildingPhase]);

  // Called by AgentBuildCard.onComplete when the typewriter reaches the end.
  // Idempotent: marks the build msg as completed and appends the confirm card at most once.
  const finishBuilding = React.useCallback((buildMsgId) => {
    if (!buildMsgId) return;
    const buildMsg = store.state.conversation.find(m => m.id === buildMsgId);
    if (buildMsg?.completed) return;
    store.update("conversation", buildMsgId, { completed: true });
    // Guard against a double-append if a confirm-team for this session already exists.
    const hasConfirm = store.state.conversation.some(
      m => m.sessionId === currentSessionId && m.kind === "confirm-team"
    );
    if (!hasConfirm) {
      appendMsg({
        role: "system",
        kind: "confirm-team",
        agents: D.guidedAgentScript,
      });
    }
    setGuided(g => ({ ...g, phase: "confirm" }));
  }, [appendMsg, store, currentSessionId, D.guidedAgentScript]);

  const confirmTeam = React.useCallback((yes, msgId) => {
    if (msgId) store.update("conversation", msgId, { decision: yes ? "yes" : "no" });
    if (yes) {
      D.guidedAgentScript.forEach(a => {
        if (!store.state.agents.find(x => x.id === a.id)) {
          store.create("agents", {
            ...a,
            status: "queued",
            progress: 0,
            knowledge: a.knowledge || [],
          });
        }
      });
      const stamp = Date.now().toString(36);
      D.guidedAgentScript.forEach((a, i) => {
        store.create("tasks", {
          id: `ta-${stamp}-${i}`,
          sessionId: currentSessionId,
          title: `${a.name} — initial pass`,
          agent: a.id,
          status: "queued",
          priority: "P2",
          due: "Today",
          activity: "Queued · waiting for upstream input",
          todos: [],
        });
      });
      appendMsg({
        role: "assistant",
        agent: "prd-analyst",
        text: `已分配 ${D.guidedAgentScript.length} 条任务，右侧切换到看板查看进度。`,
      });
      setRightView("kanban");
      setRightCollapsed(false);
    } else {
      appendMsg({
        role: "assistant",
        agent: "prd-analyst",
        text: "好的，先不下发。需要时随时再说。",
      });
    }
    setGuided({ phase: "done", clarify: null });
  }, [appendMsg, store, currentSessionId, D.guidedAgentScript]);

  // ——— Activity Pulse handlers ———
  const handleApprovalDecide = React.useCallback((optionId, approvalId) => {
    if (!approvalId) return;
    store.update("approvals", approvalId, {
      status: "approved",
      chosen: optionId,
      decidedAt: Date.now(),
    });
  }, [store]);

  const handleFocusTask = React.useCallback((taskId) => {
    if (!taskId) return;
    setFocusedTaskId(taskId);
    setSelectedTaskId(taskId);
    setTimeout(() => setFocusedTaskId(null), 250);
  }, []);

  const handleFocusApproval = React.useCallback((approvalId) => {
    if (!approvalId) return;
    setFocusedApprovalId(approvalId);
    // Defer so the highlight class is on when scroll happens.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-approval-id="${approvalId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const handleAnchorClear = React.useCallback(() => setFocusedApprovalId(null), []);

  // Pulse watcher: diff task statuses on every store update; append a kind:"pulse" message
  // when a task transitions, merging into the most-recent same-task pulse within 5 minutes.
  const prevTaskStatusRef = React.useRef(null);
  React.useEffect(() => {
    const tasksList = store.state.tasks;
    const snapshot = Object.create(null);
    tasksList.forEach(t => { snapshot[t.id] = t.status; });

    const prev = prevTaskStatusRef.current;
    if (prev === null) {
      prevTaskStatusRef.current = snapshot;
      return;
    }

    const changes = [];
    tasksList.forEach(t => {
      if (prev[t.id] !== undefined && prev[t.id] !== t.status) {
        changes.push(t);
      }
    });
    prevTaskStatusRef.current = snapshot;
    if (changes.length === 0) return;

    const FIVE_MIN = 5 * 60 * 1000;
    const STATUS_TO_PULSE = {
      done: "task-done",
      running: "task-started",
      blocked: "task-blocked",
      awaiting: "task-awaiting",
    };

    changes.forEach(task => {
      const pulseKind = STATUS_TO_PULSE[task.status];
      if (!pulseKind) return;
      const sid = task.sessionId;
      const now = Date.now();
      // Look for the most-recent pulse for the same task in same session within 5 min.
      const recent = [...store.state.conversation]
        .reverse()
        .find(m => m.kind === "pulse" && m.taskId === task.id && m.sessionId === sid);
      if (recent && recent._tsAbs && (now - recent._tsAbs) < FIVE_MIN) {
        store.update("conversation", recent.id, {
          mergedCount: (recent.mergedCount || 1) + 1,
          latestPulseKind: pulseKind,
          _tsAbs: now,
          ts: new Date(now).toTimeString().slice(0, 5),
        });
      } else {
        const id = `pulse-${sid}-${task.id}-${now.toString(36)}`;
        store.append("conversation", {
          id,
          sessionId: sid,
          role: "system",
          kind: "pulse",
          pulseKind,
          latestPulseKind: pulseKind,
          taskId: task.id,
          taskTitle: task.title,
          agent: task.agent,
          ts: new Date(now).toTimeString().slice(0, 5),
          _tsAbs: now,
          mergedCount: 1,
        });
      }
    });
  }, [store.state.tasks]); // eslint-disable-line — store reads are intentional

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

  // Dashboard is full-bleed: render outside the app grid (no Sidebar, no Topbar).
  if (page === "dashboard") {
    const recentSess = store.state.sessions.find(s => s.projectId === currentProjectId)
      || store.state.sessions[0];
    return (
      <div className={"dashboard-page " + (settings.density !== "default" ? densityClass : "")}>
        <Dashboard
          store={store}
          recentSession={recentSess}
          onExit={() => { if (recentSess) switchSession(recentSess.id, recentSess.projectId); }}
          onOpenProject={(id) => switchProject(id)}
          onOpenSession={(sid, pid) => switchSession(sid, pid)}
          onQuickstart={(preset) => {
            const { projectId, sessionId } = store.createProject({
              name: preset.name,
              description: preset.description,
              defaultTemplateId: preset.defaultTemplateId,
              icon: preset.icon,
            });
            switchSession(sessionId, projectId);
          }}
        />
        {tweaksOpen && <Tweaks settings={settings} setSettings={persistSettings} />}
      </div>
    );
  }

  const approvalsCount = currentProjectId
    ? store.state.approvals.filter(a => {
        const s = store.state.sessions.find(x => x.id === a.sessionId);
        return s && s.projectId === currentProjectId && (a.status === "pending" || !a.status);
      }).length
    : null;
  const sessionsCount = currentProjectId
    ? store.state.sessions.filter(s => s.projectId === currentProjectId && s.status !== "archived").length
    : null;

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
      <Sidebar page={page} setPage={setPage} counts={{ approvals: approvalsCount, sessions: sessionsCount }} />

      {page === "chat" && (
        <>
          <main className="main" data-screen-label="01 Main Chat">
            <ChatArea
              onSelectAgent={setSelectedAgentId}
              conversation={slice.conversation}
              agents={D.agents}
              templates={D.templates}
              store={store}
              currentSessionId={currentSessionId}
              onStartGuided={startGuided}
              onConfirmTeam={confirmTeam}
              onBuildComplete={finishBuilding}
              guidedPhase={guided.phase}
              tasks={slice.tasks}
              approvals={slice.approvals}
              onApprovalDecide={handleApprovalDecide}
              onFocusTask={handleFocusTask}
              onFocusApproval={handleFocusApproval}
              focusedApprovalId={focusedApprovalId}
              onAnchorClear={handleAnchorClear}
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
              {guided.phase === "clarify" ? (
                <ClarifyPanel
                  questions={D.clarifyQuestions}
                  onSubmit={submitClarify}
                  onSkip={skipClarify}
                />
              ) : (
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
              )}
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
          {page === "sessions" && (
            <SessionsPage
              store={store}
              currentProjectId={currentProjectId}
              onOpenSession={switchSession}
              onQuickStart={quickStartSession}
            />
          )}
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
      <ToastHost />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
