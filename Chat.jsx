// Main chat area — user conversation with the Team

function useTypewriter(text, enabled, onDone) {
  const [chars, setChars] = React.useState(enabled ? 0 : (text || "").length);
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  React.useEffect(() => {
    if (!enabled || !text) {
      setChars((text || "").length);
      return;
    }
    setChars(0);
    const total = text.length;
    const perChar = Math.max(9, Math.min(22, 2800 / total));
    let i = 0;
    let timer;
    const tick = () => {
      i += 1;
      if (i >= total) {
        setChars(total);
        onDoneRef.current && onDoneRef.current();
        return;
      }
      setChars(i);
      timer = setTimeout(tick, perChar);
    };
    timer = setTimeout(tick, perChar);
    return () => clearTimeout(timer);
  }, [text, enabled]);

  return Math.min(chars, (text || "").length);
}

function AgentBadge({ agent, size = 22 }) {
  if (!agent) return null;
  return (
    <span className="ag-ico" style={{ background: agent.color, width: size, height: size }}>
      <Icon name={agent.icon} size={Math.round(size * 0.6)} />
    </span>
  );
}

function TeamProposalCard({ msg, agents, onRun }) {
  const proposalAgents = (msg.agents && msg.agents.length)
    ? msg.agents
    : agents.filter(a => a.id !== "codex-default").slice(0, msg.agentCount || 6);
  return (
    <div className="card team-proposal">
      <div className="card-head">
        <Icon name="spark" size={14} />
        <div className="title">Proposed Team · PRD → Technical Design</div>
        <span className="muted small" style={{ marginLeft: "auto" }}>matched by intent</span>
      </div>
      <div className="card-body">
        <div className="muted small" style={{ marginBottom: 10 }}>
          Intent detected: <b>doc-to-design</b>. Assembling a 6-agent team based on template{" "}
          <code className="mono">tpl-prd2tech</code>.
        </div>
        <div className="agents-strip">
          {proposalAgents.map(a => (
            <div className="mini-agent" key={a.id}>
              <AgentBadge agent={a} size={20} />
              <span>{a.name}</span>
              <span className="muted mono small">{a.role}</span>
            </div>
          ))}
          <div className="mini-agent ghost">
            <Icon name="plus" size={13} />
            <span>Add agent</span>
          </div>
        </div>
      </div>
      <div className="card-foot">
        <button className="btn-ghost">
          <Icon name="sliders" size={13} /> Edit team
        </button>
        <button className="btn-primary-accent" onClick={onRun}>
          <Icon name="play" size={13} /> Run team
        </button>
      </div>
    </div>
  );
}

function ApprovalCard({ msg, agents, onDecide, isAnchored, onAnchorClear }) {
  const fromAgent = agents.find(a => a.id === msg.from);
  const [chosen, setChosen] = React.useState(null);
  const [decided, setDecided] = React.useState(false);
  const pick = (id) => {
    setChosen(id); setDecided(true);
    // 保留旧签名的同时把 approvalId 透传给上层（App 通过 msg.approvalId 找回 approvals）。
    onDecide?.(id, msg.approvalId);
  };
  React.useEffect(() => {
    if (!isAnchored) return;
    const t = setTimeout(() => onAnchorClear && onAnchorClear(), 600);
    return () => clearTimeout(t);
  }, [isAnchored, onAnchorClear]);
  const cls = "card approval-card"
    + (decided ? " is-decided" : "")
    + (isAnchored ? " is-anchored" : "");
  const anchorAttr = msg.approvalId ? { "data-approval-id": msg.approvalId } : {};
  return (
    <div className={cls} {...anchorAttr}>
      <div className="card-head">
        <div className="title">
          <Icon name="flag" size={13} style={{ color: "var(--warn)" }} />
          {msg.title}
        </div>
        <span className="badge s-awaiting" style={{ marginLeft: "auto" }}>
          <span className="status-dot" /> {decided ? "decided" : "awaiting you"}
        </span>
      </div>
      <div className="card-body">
        <div className="row" style={{ marginBottom: 8 }}>
          <AgentBadge agent={fromAgent} size={18} />
          <span className="small"><b>{fromAgent?.name}</b> <span className="muted">requested a decision · 1m ago</span></span>
        </div>
        <div className="small" style={{ color: "var(--ink-2)" }}>{msg.body}</div>
        <div className="options">
          {msg.options.map((o, i) => (
            <button
              key={o.id}
              className={"opt " + (o.id === msg.recommended ? "recommended" : "") + (chosen === o.id ? " selected" : "")}
              onClick={() => pick(o.id)}
            >
              <span className="num">{chosen === o.id ? <Icon name="check" size={11} /> : i + 1}</span>
              <div className="body">
                <div className="l">{o.label}</div>
                <div className="h">{o.hint}</div>
              </div>
              {o.id === msg.recommended && <span className="rec-tag">Recommended</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="card-foot">
        <span className="muted small mono" style={{ marginRight: "auto" }}>
          pause:off · auto-approve:low-risk
        </span>
        <button className="btn-ghost">
          <Icon name="chat" size={13} /> Ask clarifying
        </button>
      </div>
    </div>
  );
}

function normalizeMessageContent(text) {
  const raw = String(text || "").trim();
  if (!raw) return { kind: "text", text: "" };

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      const message = parsed?.error?.message || parsed?.message || parsed?.error;
      if (parsed?.type === "error" || message) {
        return {
          kind: "error",
          title: "Codex CLI request failed",
          text: String(message || "The Codex CLI returned an error."),
        };
      }
    } catch (err) {
      // Partial streaming JSON should continue to render as plain text.
    }
  }

  const hasCodexDiagnostics =
    /\bWARN\s+codex_/i.test(raw) ||
    /codex_analytics|codex_core::plugins::manager/i.test(raw) ||
    /challenge-error-text|Cloudflare|<html>|<\/html>|<script/i.test(raw);

  if (hasCodexDiagnostics) {
    const firstWarning = raw.split("\n").find(line => /\bWARN\b|codex_|Cloudflare|challenge-error-text/i.test(line)) || raw.split("\n")[0];
    return {
      kind: "warning",
      title: "Codex CLI diagnostics hidden",
      text: firstWarning.replace(/\s+/g, " ").slice(0, 180) + (firstWarning.length > 180 ? "..." : ""),
    };
  }

  return { kind: "text", text };
}

function sanitizeMarkdownHtml(html) {
  if (!html || !window.DOMParser) return html || "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach(node => node.remove());
  doc.body.querySelectorAll("*").forEach(node => {
    Array.from(node.attributes).forEach(attr => {
      const name = attr.name.toLowerCase();
      const value = attr.value || "";
      if (name.startsWith("on")) node.removeAttribute(attr.name);
      if ((name === "href" || name === "src") && /^\s*javascript:/i.test(value)) node.removeAttribute(attr.name);
    });
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noreferrer");
    }
  });
  return doc.body.innerHTML;
}

function markdownToHtml(text) {
  const source = String(text || "");
  if (!window.marked?.parse) {
    const escaped = source
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(/\n/g, "<br>");
  }
  const html = window.marked.parse(source, { gfm: true, breaks: true });
  return sanitizeMarkdownHtml(html);
}

function MarkdownBody({ text, streaming }) {
  const ref = React.useRef(null);
  const html = React.useMemo(() => markdownToHtml(text), [text]);

  React.useEffect(() => {
    if (!ref.current || !window.hljs?.highlightElement) return;
    ref.current.querySelectorAll("pre code").forEach(block => window.hljs.highlightElement(block));
  }, [html]);

  return (
    <div
      ref={ref}
      className={"msg-body markdown-body" + (streaming ? " is-streaming" : "")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function MessageContent({ content, streaming }) {
  if (content.kind === "error" || content.kind === "warning") {
    return (
      <div className="msg-notice">
        <span className="msg-notice-icon">
          <Icon name={content.kind === "error" ? "alert" : "info"} size={15} />
        </span>
        <span className="msg-notice-copy">
          <span className="msg-notice-title">{content.title}</span>
          <span className="msg-notice-text">{content.text}</span>
        </span>
      </div>
    );
  }

  return <MarkdownBody text={content.text} streaming={streaming} />;
}

function MessageProcess({ msg, agent, onSelectAgent }) {
  if (!agent) return null;
  const tools = (msg.tools || msg.toolCalls || msg.steps || []).map(item =>
    typeof item === "string" ? item : (item.tool || item.name || item.kind || item.type)
  ).filter(Boolean);
  const skillNames = msg.skills || agent.skills || [];
  const fallbackTools = tools.length ? [] : skillNames.filter(name => /\.exec$/.test(name)).slice(0, 1);
  const skills = skillNames.filter(name => !tools.includes(name) && !fallbackTools.includes(name)).slice(0, 3);
  const items = [
    ...tools.slice(0, 2).map(name => ({ kind: "tool", name })),
    ...fallbackTools.map(name => ({ kind: "tool", name })),
    ...skills.slice(0, tools.length ? 1 : 2).map(name => ({ kind: "skill", name })),
  ];
  if (!items.length) return null;

  return (
    <div className="msg-process">
      <span className="msg-process-label">calls</span>
      {items.map((item, index) => (
        <span className={"msg-process-item " + item.kind} key={`${item.kind}-${item.name}-${index}`}>
          <Icon name={item.kind === "tool" ? "terminal" : "bolt"} size={11} />
          <span>{item.kind}</span>
          <code>{item.name}</code>
        </span>
      ))}
      <button className="msg-process-link" onClick={() => onSelectAgent(agent.id)}>
        <Icon name="eye" size={11} /> thread
      </button>
    </div>
  );
}

function Message({ msg, agents, onSelectAgent, onDecide, onConfirmTeam, onStreamingDone, onBuildComplete, onFocusTask, focusedApprovalId, onAnchorClear }) {
  const streaming = !!msg.streaming;
  const revealedChars = useTypewriter(msg.text || "", streaming, React.useCallback(() => {
    onStreamingDone && onStreamingDone(msg.id);
  }, [msg.id, onStreamingDone]));

  if (msg.kind === "pulse" && window.PulseCard) {
    return <window.PulseCard msg={msg} agents={agents} onSelectAgent={onSelectAgent} onFocusTask={onFocusTask} />;
  }
  if (msg.kind === "team-proposal") {
    return <TeamProposalCard msg={msg} agents={agents} />;
  }
  if (msg.kind === "approval") {
    return (
      <ApprovalCard
        msg={msg}
        agents={agents}
        onDecide={onDecide}
        isAnchored={focusedApprovalId && msg.approvalId === focusedApprovalId}
        onAnchorClear={onAnchorClear}
      />
    );
  }
  if (msg.kind === "agent-build" && window.AgentBuildCard) {
    return (
      <window.AgentBuildCard
        msg={msg}
        onComplete={() => onBuildComplete?.(msg.id)}
      />
    );
  }
  if (msg.kind === "confirm-team" && window.ConfirmTeamCard) {
    return (
      <window.ConfirmTeamCard
        msg={msg}
        onYes={() => onConfirmTeam?.(true, msg.id)}
        onNo={() => onConfirmTeam?.(false, msg.id)}
      />
    );
  }

  const agent = msg.agent ? agents.find(a => a.id === msg.agent) : null;

  if (msg.kind === "typing") {
    return (
      <div className="msg msg-team">
        <div className="msg-card">
          {agent
            ? <span className="msg-label">
                <AgentBadge agent={agent} size={18} />
                <span>{agent.name}</span>
                <span className="msg-role">typing...</span>
              </span>
            : <span className="msg-label">Team</span>}
          <div className="msg-body">
            <div className="msg-typing"><span className="td" /><span className="td" /><span className="td" /></div>
          </div>
        </div>
      </div>
    );
  }

  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  const roleClass = isUser ? "msg-user" : isSystem ? "msg-system" : "msg-team";

  const label = isUser
    ? <span className="msg-label">You</span>
    : agent
      ? <span className="msg-label">
          <AgentBadge agent={agent} size={18} />
          <span>{agent.name}</span>
          <span className="msg-role">{agent.role}</span>
        </span>
      : <span className="msg-label">Team</span>;

  const displayText = streaming ? (msg.text || "").slice(0, revealedChars) : msg.text;
  const content = normalizeMessageContent(displayText);
  const noticeClass = content.kind !== "text" ? " msg-" + content.kind : "";

  return (
    <div className={"msg " + roleClass + noticeClass}>
      <div className="msg-card">
        {label}
        {msg.text ? (
          <MessageContent content={content} streaming={streaming} />
        ) : streaming ? (
          <div className="msg-body is-streaming muted">Connecting to Codex CLI...</div>
        ) : null}
        {msg.attachments && (
          <div className="msg-chips">
            {msg.attachments.map((a, i) => (
              <span className="chip" key={i}><Icon name="paperclip" size={11} /> {a.name} <span className="muted mono">{a.size}</span></span>
            ))}
          </div>
        )}
        {msg.artifacts && (
          <div className="msg-chips">
            {msg.artifacts.map((a, i) => (
              <span className="chip mono interactive" key={i} onClick={() => agent && onSelectAgent(agent.id)}>
                <Icon name="doc" size={11} /> {a.name}
              </span>
            ))}
          </div>
        )}
        {msg.chips && msg.chips.length > 0 && (
          <div className="msg-chips">
            {msg.chips.map((c, i) => <span key={i} className="chip">{c}</span>)}
          </div>
        )}
        {agent && <MessageProcess msg={msg} agent={agent} onSelectAgent={onSelectAgent} />}
      </div>
    </div>
  );
}

const Composer = React.forwardRef(function Composer({ empty, onSend, value, onChange, placeholder = "Describe what you want to create...", disabled = false, modelOptions = [], model, onModelChange }, ref) {
  const taRef = React.useRef(null);
  const [sending, setSending] = React.useState(false);
  React.useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    setValue: (v) => { onChange?.(v); setTimeout(() => taRef.current?.focus(), 0); },
  }));
  React.useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    const padY = parseFloat(getComputedStyle(ta).paddingTop) + parseFloat(getComputedStyle(ta).paddingBottom);
    const minH = lh * 2 + padY;
    const maxH = lh * 10 + padY;
    ta.style.height = "auto";
    const next = Math.max(minH, Math.min(ta.scrollHeight, maxH));
    ta.style.height = next + "px";
    ta.style.overflowY = ta.scrollHeight > maxH ? "auto" : "hidden";
  }, [value]);
  const send = () => {
    if (disabled || sending || !value?.trim()) return;
    const payload = value;
    setSending(true);
    setTimeout(() => {
      onSend?.(payload);
      onChange?.("");
      setSending(false);
    }, 320);
  };
  const busy = disabled || sending;
  return (
    <div className="composer-dock">
      <div className={"composer " + (busy ? "is-disabled" : "")}>
        <textarea
          ref={taRef}
          className="composer-input"
          value={value || ""}
          onChange={e => onChange?.(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={placeholder}
          rows={2}
          disabled={busy}
        />
        <div className="composer-bar">
          <button className="cmp-icon" title="Settings" onClick={() => {}} disabled={busy}><Icon name="sliders" size={13} /></button>
          <button className="cmp-icon" title="Attach"   onClick={() => {}} disabled={busy}><Icon name="paperclip" size={13} /></button>
          <button className="cmp-icon" title="Voice"    onClick={() => {}} disabled={busy}><Icon name="mic" size={13} /></button>
          <button className="cmp-icon cmp-import"       onClick={() => {}} disabled={busy}><Icon name="upload" size={12} /> Import</button>
          {modelOptions.length > 0 && (
            <label className="cmp-model" title="Model for this turn">
              <Icon name="terminal" size={12} />
              <select value={model || modelOptions[0]} onChange={e => onModelChange?.(e.target.value)} disabled={busy}>
                {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
          <div className="cmp-spacer" />
          <button className="btn-primary-accent cmp-send" disabled={busy || !value?.trim()} onClick={send}>
            {sending
              ? <><span className="spinner-sm" /> Sending</>
              : <><Icon name="send" size={12} /> Send</>}
          </button>
        </div>
      </div>
    </div>
  );
});

/* ——— Welcome / Empty state ——— */

const SUGGESTED_PROMPTS = [
  {
    icon: "scan",
    quick: "PRD to design",
    title: "Turn a PRD into a technical design",
    prompt: "Parse the attached PRD and produce a full technical design, with bounded contexts, API contracts, data model, and a risk review. Flag open questions before running.",
  },
  {
    icon: "shield",
    quick: "Launch review",
    title: "Review a service for launch readiness",
    prompt: "Run a launch-readiness review on the Payments service. Cover security, reliability, cost, and compliance. Produce a go/no-go with a mitigations checklist.",
  },
  {
    icon: "compass",
    quick: "Research brief",
    title: "Market & competitor research",
    prompt: "Research the top 5 competitors in the payment orchestration space. Compare on pricing, coverage, SLAs, DX and compliance. Produce a briefing doc with citations.",
  },
  {
    icon: "bolt",
    quick: "Bug triage",
    title: "Triage and fix a bug",
    prompt: "Triage bug LIG-482: intermittent duplicate charges under retry. Reproduce locally, root-cause, propose a patch and write a post-mortem.",
  },
];

function WelcomeHero({ onStart, onPickTemplate, templates, composer }) {
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="welcome">
      <section className="welcome-dialog">
        <div className="welcome-hero">
          <div className="welcome-mark">
            <Icon name="spark" size={18} />
          </div>
          <h2>{greeting}, Lin.</h2>
          <p className="welcome-sub">
            Tell Atelier what you want to get done. It will assemble the right agents and pause when it needs your call.
          </p>
        </div>

        {composer}

        <div className="welcome-quick">
          <div className="welcome-quick-label">Quick start</div>
          {SUGGESTED_PROMPTS.map((p, i) => (
            <button key={i} className="welcome-prompt" onClick={() => onStart(p.prompt)} title={p.title}>
              <span className="pmt-ico"><Icon name={p.icon} size={14} /></span>
              <span>{p.quick || p.title}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="welcome-section welcome-template-strip">
        <div className="welcome-section-head">
          <div className="lbl">Team templates</div>
          <button className="lnk">Browse all <Icon name="arrow" size={11} /></button>
        </div>
        <div className="welcome-templates">
          {templates.slice(0, 3).map(t => (
            <button key={t.id} className="welcome-tpl" onClick={() => onPickTemplate(t)}>
              <div className="tpl-top">
                <span className="tpl-name">{t.name}</span>
                <span className="tpl-agents mono">{t.agents}×</span>
              </div>
              <div className="tpl-foot">
                {t.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="tpl-tag">{tag}</span>
                ))}
                <span className="muted mono small" style={{ marginLeft: "auto" }}>{t.agents} agents</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatArea({ onSelectAgent, conversation, agents, templates, forceEmpty, onExit, store, currentSessionId, sessionName, onRenameSession, onStartGuided, onConfirmTeam, onBuildComplete, guidedPhase, tasks, approvals, onApprovalDecide, onFocusTask, onFocusApproval, focusedApprovalId, onAnchorClear, focusPane, onFocusPane, onNewSession, modelOptions = [], model, onModelChange, onModelUsed }) {
  const [draft, setDraft] = React.useState("");
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(sessionName || "New session");
  const [atBottom, setAtBottom] = React.useState(true);
  const composerRef = React.useRef(null);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (!editingTitle) setTitleDraft(sessionName || "New session");
  }, [sessionName, editingTitle]);
  const turnCount = conversation.filter(m => m.role !== "system").length;
  const isEmpty = forceEmpty !== undefined ? forceEmpty : turnCount === 0;
  const statusCounts = React.useMemo(() => ({
    running: (tasks || []).filter(t => t.status === "running").length,
    awaiting: (tasks || []).filter(t => t.status === "awaiting").length,
    queued: (tasks || []).filter(t => t.status === "queued").length,
  }), [tasks]);

  const goFull = () => {
    onExit?.();
  };

  const handleStart = (text) => {
    setDraft(text);
    requestAnimationFrame(() => composerRef.current?.setValue(text));
  };
  const handlePickTemplate = (tpl) => {
    handleStart(`Run the "${tpl.name}" team template. Scope: `);
  };
  const handleSend = (text) => {
    const trimmed = text?.trim();
    if (!trimmed || !currentSessionId || !store) return;
    const sendModel = model || modelOptions[0] || "gpt-5.5";
    // First non-system turn → hand off to guided flow (App owns message creation).
    const nonSystem = conversation.filter(m => m.role !== "system").length;
    if (nonSystem === 0 && onStartGuided && !window.AgentTeamApi) {
      onModelUsed?.(sendModel);
      onStartGuided(trimmed);
      goFull();
      return;
    }
    const userId = `msg-${currentSessionId}-${Date.now().toString(36)}`;
    (store.append || store.create)("conversation", { id: userId, sessionId: currentSessionId, role: "user", text: trimmed, model: sendModel });
    onModelUsed?.(sendModel);
    goFull();

    const appendSendError = () => {
      (store.append || store.create)("conversation", {
        id: `err-${currentSessionId}-${Date.now().toString(36)}`,
        sessionId: currentSessionId,
        role: "system",
        text: "Backend unavailable. Start the AgentTeam backend to receive a real response.",
      });
    };

    if (window.AgentTeamApi?.sendMessage) {
      window.AgentTeamApi.sendMessage(currentSessionId, trimmed, userId, sendModel).catch(err => {
        console.warn("AgentTeam send failed", err);
        appendSendError();
      });
      return;
    }

    appendSendError();
  };

  const handleStreamingDone = React.useCallback((msgId) => {
    store?.update("conversation", msgId, { streaming: false });
  }, [store]);

  const syncAtBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  }, []);
  React.useLayoutEffect(() => {
    syncAtBottom();
  }, [conversation.length, isEmpty, syncAtBottom]);
  const scrollToBottom = React.useCallback((behavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setAtBottom(true);
  }, []);

  const commitTitle = React.useCallback(() => {
    const next = titleDraft.trim();
    if (next && next !== sessionName) onRenameSession?.(next);
    setTitleDraft(next || sessionName || "New session");
    setEditingTitle(false);
  }, [titleDraft, sessionName, onRenameSession]);
  const cancelTitle = React.useCallback(() => {
    setTitleDraft(sessionName || "New session");
    setEditingTitle(false);
  }, [sessionName]);

  const composer = (
    <Composer
      ref={composerRef}
      empty={isEmpty}
      onSend={handleSend}
      value={draft}
      onChange={setDraft}
      modelOptions={modelOptions}
      model={model}
      onModelChange={onModelChange}
      disabled={guidedPhase === "clarify" || guidedPhase === "building"}
      placeholder={
        guidedPhase === "clarify"  ? "右侧回答几个问题后再继续…" :
        guidedPhase === "building" ? "智能体正在组建中…" :
        undefined
      }
    />
  );

  return (
    <>
      <div className="main-header">
        {isEmpty ? (
          <>
            <div className="header-title">
              <h1>New session</h1>
            </div>
            <span className="subtle">· untitled · draft</span>
            <div className="header-actions">
              <button className="pane-focus-btn" onClick={() => onFocusPane?.("chat")} title={focusPane === "chat" ? "Exit chat fullscreen" : "Fullscreen chat"}>
                <Icon name={focusPane === "chat" ? "x" : "scan"} size={13} />
              </button>
              <span className="chip"><Icon name="history" size={11} /> from scratch</span>
            </div>
          </>
        ) : (
          <>
            <div className="header-title">
              {editingTitle ? (
                <input
                  className="header-title-input"
                  value={titleDraft}
                  autoFocus
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={e => {
                    if (e.key === "Enter") commitTitle();
                    if (e.key === "Escape") cancelTitle();
                  }}
                />
              ) : (
                <>
                  <h1 onDoubleClick={() => setEditingTitle(true)} title="Double-click to rename">{sessionName || "New session"}</h1>
                  <button className="title-edit-btn" onClick={() => setEditingTitle(true)} title="Rename session">
                    <Icon name="pen" size={12} />
                  </button>
                </>
              )}
            </div>
            <span className="subtle">· {turnCount === 0 ? "draft" : `turn ${turnCount}`}</span>
            <div className="header-actions">
              <button className="pane-focus-btn" onClick={() => onFocusPane?.("chat")} title={focusPane === "chat" ? "Exit chat fullscreen" : "Fullscreen chat"}>
                <Icon name={focusPane === "chat" ? "x" : "scan"} size={13} />
              </button>
              {statusCounts.running > 0 && (
                <span className="chip status-chip status-running" title={`${statusCounts.running} running`}>
                  <span className="status-dot s-running" /> <span className="status-label">{statusCounts.running} running</span>
                </span>
              )}
              {statusCounts.awaiting > 0 && (
                <span className="chip status-chip status-awaiting" title={`${statusCounts.awaiting} awaiting`}>
                  <span className="status-dot s-awaiting" /> <span className="status-label">{statusCounts.awaiting} awaiting</span>
                </span>
              )}
              {statusCounts.queued > 0 && (
                <span className="chip status-chip status-queued" title={`${statusCounts.queued} queued`}>
                  <span className="status-dot s-queued" /> <span className="status-label">{statusCounts.queued} queued</span>
                </span>
              )}
              <button className="btn-ghost" onClick={onNewSession} title="Start a new session">
                <Icon name="plus" size={12} /> New
              </button>
            </div>
          </>
        )}
      </div>
      <div className="chat-scroll-wrap">
        <div ref={scrollRef} onScroll={syncAtBottom} className={"chat-scroll" + (isEmpty ? " is-welcome" : "")}>
          {isEmpty ? (
            <WelcomeHero
              templates={templates || []}
              onStart={handleStart}
              onPickTemplate={handlePickTemplate}
              composer={composer}
            />
          ) : (
            <>
              {window.PulseBar && (
                <window.PulseBar
                  tasks={tasks}
                  agentThreads={window.AppData?.agentThreads}
                  approvals={approvals}
                  agents={agents}
                  currentSessionId={currentSessionId}
                  onSelectAgent={onSelectAgent}
                  onFocusTask={onFocusTask}
                  onFocusApproval={onFocusApproval}
                />
              )}
              <div className="chat-thread">
                {conversation.map(m => (
                  <Message
                    key={m.id}
                    msg={m}
                    agents={agents}
                    onSelectAgent={onSelectAgent}
                    onDecide={onApprovalDecide}
                    onConfirmTeam={onConfirmTeam}
                    onBuildComplete={onBuildComplete}
                    onStreamingDone={handleStreamingDone}
                    onFocusTask={onFocusTask}
                    focusedApprovalId={focusedApprovalId}
                    onAnchorClear={onAnchorClear}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        {!isEmpty && !atBottom && (
          <button className="scroll-bottom-btn" onClick={() => scrollToBottom()} title="Jump to latest">
            <Icon name="arrow" size={12} style={{ transform: "rotate(90deg)" }} />
            Latest
          </button>
        )}
      </div>
      {!isEmpty && composer}
    </>
  );
}

function InlineNotice({ icon = "info", kind = "info", children, action, onAction, dismissible, onClose }) {
  const [leaving, setLeaving] = React.useState(false);
  const [gone, setGone] = React.useState(false);
  const close = () => {
    setLeaving(true);
    setTimeout(() => { setGone(true); onClose && onClose(); }, 140);
  };
  if (gone) return null;
  return (
    <div className={"inline-notice " + kind + (leaving ? " is-leaving" : "")}>
      <Icon name={icon} size={13} />
      <span className="in-text">{children}</span>
      {action && <button className="in-action" onClick={onAction}>{action} →</button>}
      {dismissible && (
        <button className="in-close" onClick={close} aria-label="Dismiss">
          <Icon name="x" size={11} />
        </button>
      )}
    </div>
  );
}

Object.assign(window, { ChatArea, AgentBadge, InlineNotice });
