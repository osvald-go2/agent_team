// Main chat area — user conversation with the Team

function AgentBadge({ agent, size = 22 }) {
  if (!agent) return null;
  return (
    <span className="ag-ico" style={{ background: agent.color, width: size, height: size }}>
      <Icon name={agent.icon} size={Math.round(size * 0.6)} />
    </span>
  );
}

function TeamProposalCard({ msg, agents, onRun }) {
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
          {agents.map(a => (
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

function ApprovalCard({ msg, agents, onDecide }) {
  const fromAgent = agents.find(a => a.id === msg.from);
  const [chosen, setChosen] = React.useState(null);
  const [decided, setDecided] = React.useState(false);
  const pick = (id) => { setChosen(id); setDecided(true); onDecide?.(id); };
  return (
    <div className="card approval-card">
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

function Message({ msg, agents, onSelectAgent, onDecide }) {
  if (msg.kind === "team-proposal") {
    return <TeamProposalCard msg={msg} agents={agents} />;
  }
  if (msg.kind === "approval") {
    return <ApprovalCard msg={msg} agents={agents} onDecide={onDecide} />;
  }

  const agent = msg.agent ? agents.find(a => a.id === msg.agent) : null;
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

  return (
    <div className={"msg " + roleClass}>
      {label}
      {msg.text && <div className="msg-body">{msg.text}</div>}
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
      {agent && (
        <div className="msg-chips">
          <button className="chip" onClick={() => onSelectAgent(agent.id)}>
            <Icon name="eye" size={11} /> Open thread
          </button>
        </div>
      )}
    </div>
  );
}

const Composer = React.forwardRef(function Composer({ onSend, empty, value, onChange }, ref) {
  const [localText, setLocalText] = React.useState("");
  const text = value !== undefined ? value : localText;
  const setText = onChange || setLocalText;
  const taRef = React.useRef(null);
  React.useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    setValue: (v) => { setText(v); setTimeout(() => taRef.current?.focus(), 0); },
  }));
  return (
    <div className={"composer-wrap" + (empty ? " composer-empty" : "")}>
      <div className={"composer" + (empty ? " is-empty" : "")}>
        <textarea
          ref={taRef}
          placeholder={empty
            ? "Describe a goal — e.g. “Parse this PRD and produce a technical design.”"
            : "Give the team a new instruction, or reply with context…"}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { onSend?.(text); setText(""); } }}
        />
        <div className="tools">
          <button className="tool-btn"><Icon name="paperclip" size={13} /> Attach</button>
          <button className="tool-btn"><Icon name="book" size={13} /> Knowledge</button>
          <button className="tool-btn"><Icon name="user" size={13} /> @ mention agent</button>
          <button className="tool-btn"><Icon name="branch" size={13} /> Fork</button>
          <button className="send-btn" onClick={() => { onSend?.(text); setText(""); }}>
            <Icon name="send" size={13} /> Send <span className="mono hint">⌘↵</span>
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
    title: "Turn a PRD into a technical design",
    body: "Attach a product spec — the team will extract requirements, draft architecture, API and data models.",
    prompt: "Parse the attached PRD and produce a full technical design, with bounded contexts, API contracts, data model, and a risk review. Flag open questions before running.",
    needsAttach: true,
    tag: "doc-to-design",
  },
  {
    icon: "shield",
    title: "Review a service for launch readiness",
    body: "Risk, security, reliability, cost. Get a go/no-go with concrete mitigations.",
    prompt: "Run a launch-readiness review on the Payments service. Cover security, reliability, cost, and compliance. Produce a go/no-go with a mitigations checklist.",
    tag: "review",
  },
  {
    icon: "compass",
    title: "Market & competitor research",
    body: "Synthesize competitors on a set of dimensions and produce a briefing deck.",
    prompt: "Research the top 5 competitors in the payment orchestration space. Compare on pricing, coverage, SLAs, DX and compliance. Produce a briefing doc with citations.",
    tag: "research",
  },
  {
    icon: "bolt",
    title: "Triage and fix a bug",
    body: "Reproduce, root-cause, patch, write post-mortem.",
    prompt: "Triage bug LIG-482: intermittent duplicate charges under retry. Reproduce locally, root-cause, propose a patch and write a post-mortem.",
    tag: "bugfix",
  },
];

const ONBOARDING_STEPS = [
  { n: 1, title: "Describe the goal", body: "Plain English. Attach docs if you have them." },
  { n: 2, title: "Team assembles", body: "Atelier picks a template and proposes a roster. Edit before running." },
  { n: 3, title: "Approve & steer", body: "Agents pause on decisions. You stay in the loop." },
  { n: 4, title: "Export the result", body: "Docs, diagrams, code — ready for handoff." },
];

function WelcomeHero({ onStart, onPickTemplate, templates }) {
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="welcome">
      <div className="welcome-hero">
        <div className="welcome-mark">
          <Icon name="spark" size={18} />
        </div>
        <h2>{greeting}, Lin.</h2>
        <p className="welcome-sub">
          Describe a goal in plain language. Atelier assembles a team of agents, routes work between them, and pauses when it needs your call.
        </p>
        <div className="welcome-meta">
          <span className="chip"><Icon name="user" size={11} /> New session</span>
          <span className="chip mono">workspace: acme-eng</span>
          <span className="chip mono">18 agents · 64 skills available</span>
        </div>
      </div>

      <div className="welcome-section">
        <div className="welcome-section-head">
          <div className="lbl">Start with a suggestion</div>
          <span className="muted mono small">4 of {templates.length}</span>
        </div>
        <div className="welcome-prompts">
          {SUGGESTED_PROMPTS.map((p, i) => (
            <button key={i} className="welcome-prompt" onClick={() => onStart(p.prompt)}>
              <span className="pmt-ico"><Icon name={p.icon} size={14} /></span>
              <span className="pmt-body">
                <span className="pmt-title">{p.title}</span>
                <span className="pmt-desc">{p.body}</span>
                <span className="pmt-foot">
                  <span className="pmt-tag mono">{p.tag}</span>
                  {p.needsAttach && <span className="pmt-hint"><Icon name="paperclip" size={10} /> attach a file</span>}
                  <span className="pmt-arrow"><Icon name="arrow" size={12} /></span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="welcome-section">
        <div className="welcome-section-head">
          <div className="lbl">Or pick a team template</div>
          <button className="lnk">Browse all <Icon name="arrow" size={11} /></button>
        </div>
        <div className="welcome-templates">
          {templates.slice(0, 6).map(t => (
            <button key={t.id} className="welcome-tpl" onClick={() => onPickTemplate(t)}>
              <div className="tpl-top">
                <span className="tpl-name">{t.name}</span>
                <span className="tpl-agents mono">{t.agents}×</span>
              </div>
              <div className="tpl-desc">{t.desc}</div>
              <div className="tpl-foot">
                {t.tags.map(tag => (
                  <span key={tag} className="tpl-tag">{tag}</span>
                ))}
                <span className="muted mono small" style={{ marginLeft: "auto" }}>{t.runs} runs</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="welcome-section welcome-onboard">
        <div className="welcome-section-head">
          <div className="lbl">How it works</div>
          <span className="muted mono small">takes ~2 min to read</span>
        </div>
        <ol className="welcome-steps">
          {ONBOARDING_STEPS.map(s => (
            <li key={s.n}>
              <span className="step-n mono">0{s.n}</span>
              <div>
                <div className="step-t">{s.title}</div>
                <div className="step-b">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="welcome-tips">
          <div className="tip"><Icon name="paperclip" size={12} /> <span><b>Attach docs</b> with ⌘U — PDFs, Markdown, URLs.</span></div>
          <div className="tip"><Icon name="user" size={12} /> <span><b>@mention</b> to scope a turn to one agent.</span></div>
          <div className="tip"><Icon name="branch" size={12} /> <span><b>Fork</b> to explore an alternative without losing the thread.</span></div>
          <div className="tip"><Icon name="book" size={12} /> <span><b>Knowledge</b> — pin a KB so every agent uses it.</span></div>
        </div>
      </div>
    </div>
  );
}

function ChatArea({ onSelectAgent, conversation, agents, templates, forceEmpty, onExit }) {
  const [isEmpty, setIsEmpty] = React.useState(() => {
    if (forceEmpty !== undefined) return forceEmpty;
    try { return localStorage.getItem("at.chat.empty") === "1"; } catch { return false; }
  });
  const [draft, setDraft] = React.useState("");
  const composerRef = React.useRef(null);

  React.useEffect(() => {
    if (forceEmpty !== undefined) setIsEmpty(forceEmpty);
  }, [forceEmpty]);

  const goEmpty = () => {
    setIsEmpty(true);
    try { localStorage.setItem("at.chat.empty", "1"); } catch {}
  };
  const goFull = () => {
    setIsEmpty(false);
    try { localStorage.setItem("at.chat.empty", "0"); } catch {}
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
    if (!text?.trim()) return;
    goFull();
  };

  return (
    <>
      <div className="main-header">
        {isEmpty ? (
          <>
            <h1>New session</h1>
            <span className="subtle">· untitled · draft</span>
            <div className="header-actions">
              <span className="chip"><Icon name="history" size={11} /> from scratch</span>
              <button className="btn-ghost" onClick={goFull} title="Preview a running session">
                <Icon name="play" size={12} /> Demo session
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>Lighthouse — PRD to Tech Design</h1>
            <span className="subtle">· turn 14 · started 09:42</span>
            <div className="header-actions">
              <span className="chip"><span className="status-dot s-running" /> 2 running</span>
              <span className="chip"><span className="status-dot s-awaiting" /> 2 awaiting</span>
              <span className="chip"><span className="status-dot s-queued" /> 2 queued</span>
              <button className="btn-ghost" onClick={goEmpty} title="Reset to empty welcome state">
                <Icon name="plus" size={12} /> New
              </button>
            </div>
          </>
        )}
      </div>
      <div className={"chat-scroll" + (isEmpty ? " is-welcome" : "")}>
        {isEmpty ? (
          <WelcomeHero
            templates={templates || []}
            onStart={handleStart}
            onPickTemplate={handlePickTemplate}
          />
        ) : (
          <div className="chat-thread">
            {conversation.map(m => (
              <Message key={m.id} msg={m} agents={agents} onSelectAgent={onSelectAgent} />
            ))}
          </div>
        )}
      </div>
      <Composer ref={composerRef} empty={isEmpty} onSend={handleSend} value={draft} onChange={setDraft} />
    </>
  );
}

Object.assign(window, { ChatArea, AgentBadge });
