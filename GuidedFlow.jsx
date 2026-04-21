// Guided session flow
//  - ClarifyPanel / ClarifyForm  → rendered in the right column during the clarify phase
//  - AgentBuildCard              → rendered INLINE in the chat thread (kind:"agent-build"),
//                                  typewriter streams desc + prompt for each agent
//  - ConfirmTeamCard             → rendered INLINE in the chat thread (kind:"confirm-team")

/* ——— Clarify (right panel) ——— */

function ClarifyPanel({ questions, onSubmit, onSkip }) {
  return (
    <div className="right">
      <div className="right-body clarify-body">
        <ClarifyForm questions={questions} onSubmit={onSubmit} onSkip={onSkip} />
      </div>
    </div>
  );
}

function ClarifyForm({ questions, onSubmit, onSkip }) {
  const [answers, setAnswers] = React.useState({});
  const set = (qid, v) => setAnswers(a => ({ ...a, [qid]: v }));
  const allRequired = questions
    .filter(q => q.kind !== "text")
    .every(q => !!answers[q.id]);

  return (
    <div className="card clarify-card">
      <div className="card-head">
        <Icon name="spark" size={14} />
        <div className="title">回答几个问题，组建你的团队</div>
        <button className="btn-ghost clarify-skip" onClick={onSkip} title="跳过澄清">
          跳过 <Icon name="arrow" size={11} />
        </button>
      </div>
      <div className="card-body">
        <div className="muted small" style={{ marginBottom: 12 }}>
          识别到一个新的数据需求。你的回答会用来装配合适的智能体。
        </div>
        {questions.map((q, i) => (
          <div className="q-block" key={q.id}>
            <div className="q-prompt">
              <span className="qn mono">Q{i + 1}</span>
              {q.prompt}
              {q.kind !== "text" && <span className="q-req">必填</span>}
            </div>
            {q.kind === "select" && (
              <div className="options">
                {q.options.map((o, k) => {
                  const sel = answers[q.id] === o.id;
                  return (
                    <button
                      key={o.id}
                      className={"opt " + (sel ? "selected" : "")}
                      onClick={() => set(q.id, o.id)}
                    >
                      <span className="num">
                        {sel ? <Icon name="check" size={11} /> : String.fromCharCode(65 + k)}
                      </span>
                      <div className="body">
                        <div className="l">{o.label}</div>
                        {o.hint && <div className="h">{o.hint}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {q.kind === "text" && (
              <textarea
                className="clarify-text"
                rows={3}
                value={answers[q.id] || ""}
                onChange={e => set(q.id, e.target.value)}
                placeholder={q.placeholder || ""}
              />
            )}
          </div>
        ))}
      </div>
      <div className="card-foot">
        <span className="muted small mono" style={{ marginRight: "auto" }}>
          {allRequired ? "ready · 提交后开始组建" : "请先完成必填项"}
        </span>
        <button
          className="btn-primary-accent"
          disabled={!allRequired}
          onClick={() => onSubmit(answers)}
        >
          <Icon name="check" size={12} /> 提交并组建团队
        </button>
      </div>
    </div>
  );
}

/* ——— Agent build (chat-inline, typewriter) ——— */

const TW_STEP = 28;   // ms per char for desc / prompt
const TW_HEAD = 220;  // ms after agent starts before head appears
const TW_GAP  = 280;  // ms between desc→prompt and prompt→chips
const TW_TAIL = 160;  // ms after chips before the next agent starts

function buildSchedule(agents) {
  let cur = 0;
  return agents.map(a => {
    const start    = cur;
    const headEnd  = start + TW_HEAD;
    const descEnd  = headEnd + (a.desc?.length   || 0) * TW_STEP;
    const promptEnd = descEnd + TW_GAP + (a.prompt?.length || 0) * TW_STEP;
    const chipsAt  = promptEnd + TW_GAP;
    const end      = chipsAt + TW_TAIL;
    cur = end;
    return { start, headEnd, descEnd, promptEnd, chipsAt, end };
  });
}

function AgentBuildCard({ msg, onComplete }) {
  const agents = msg.agents || [];
  const completed = !!msg.completed;
  const schedule = React.useMemo(() => buildSchedule(agents), [agents]);
  const total = schedule.length ? schedule[schedule.length - 1].end : 0;
  const [now, setNow] = React.useState(completed ? total : 0);
  const doneRef = React.useRef(completed);

  React.useEffect(() => {
    if (completed) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const t = Date.now() - startedAt;
      setNow(t);
      if (t >= total) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [completed, total]);

  React.useEffect(() => {
    if (!completed && now >= total && !doneRef.current) {
      doneRef.current = true;
      onComplete?.();
    }
  }, [now, total, completed, onComplete]);

  const allDone = completed || now >= total;

  return (
    <div className={"card agent-build-card " + (allDone ? "is-done" : "is-streaming")}>
      <div className="card-head">
        <Icon name="spark" size={14} />
        <div className="title">
          {allDone
            ? `已为这次需求组建 ${agents.length} 个智能体`
            : `正在为这次需求实时组建 ${agents.length} 个智能体…`}
        </div>
        <span className={"badge " + (allDone ? "s-done" : "s-running")} style={{ marginLeft: "auto" }}>
          <span className="status-dot" /> {allDone ? "ready" : "streaming"}
        </span>
      </div>
      <div className="card-body build-body">
        {agents.map((a, i) => {
          const s = schedule[i];
          const started = allDone || now >= s.headEnd;
          const descChars = allDone ? (a.desc?.length || 0)
                          : Math.max(0, Math.min(a.desc?.length || 0, Math.floor((now - s.headEnd) / TW_STEP)));
          const descDone = allDone || now >= s.descEnd;
          const promptStart = s.descEnd + TW_GAP;
          const promptChars = allDone ? (a.prompt?.length || 0)
                          : (now >= promptStart
                              ? Math.max(0, Math.min(a.prompt?.length || 0, Math.floor((now - promptStart) / TW_STEP)))
                              : 0);
          const promptDone = allDone || now >= s.promptEnd;
          const showChips = allDone || now >= s.chipsAt;
          const rowDone = allDone || now >= s.end;
          const active = started && !rowDone;
          const caretOn = !allDone && active && (!descDone || !promptDone);

          return (
            <div
              key={a.id}
              className={"build-row " + (rowDone ? "done" : active ? "active" : "pending")}
            >
              <div className="build-row-head">
                <span className="ag-ico" style={{ background: a.color, width: 22, height: 22 }}>
                  <Icon name={a.icon} size={12} />
                </span>
                <div className="build-row-title">
                  <div className="build-name">{started ? a.name : "…"}</div>
                  <div className="build-role muted small">{a.role}</div>
                </div>
                <span className="build-step mono muted small">
                  {String(i + 1).padStart(2, "0")} / {String(agents.length).padStart(2, "0")}
                </span>
              </div>

              {started && (
                <div className="build-row-body">
                  <div className="build-field">
                    <span className="l">描述</span>
                    <span className="v">
                      {a.desc.slice(0, descChars)}
                      {caretOn && !descDone && <span className="tw-caret" />}
                    </span>
                  </div>

                  {(descDone || promptChars > 0) && (
                    <div className="build-field">
                      <span className="l">Prompt</span>
                      <span className="v mono">
                        {a.prompt.slice(0, promptChars)}
                        {caretOn && descDone && !promptDone && <span className="tw-caret" />}
                      </span>
                    </div>
                  )}

                  {showChips && (
                    <>
                      <div className="build-field">
                        <span className="l">Skills</span>
                        <span className="v">
                          {a.skills.map(s => <span key={s} className="chip">{s}</span>)}
                        </span>
                      </div>
                      <div className="build-field">
                        <span className="l">Meta</span>
                        <span className="v mono small muted">
                          {Object.entries(a.meta || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </span>
                      </div>
                      <div className="build-field">
                        <span className="l">Model</span>
                        <span className="v mono">{a.model}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ——— Confirm team (chat-inline) ——— */

function ConfirmTeamCard({ msg, onYes, onNo }) {
  const agents = msg.agents || [];
  const decided = msg.decision || null;
  const counts = agents.reduce((acc, a) => { acc[a.role] = (acc[a.role] || 0) + 1; return acc; }, {});
  const summary = Object.entries(counts).map(([r, n]) => `${n}× ${r}`).join(" · ");

  return (
    <div className="card confirm-team-card">
      <div className="card-head">
        <Icon name="spark" size={13} />
        <div className="title">团队就绪 · 是否下发任务？</div>
        <span
          className={"badge " + (decided === "yes" ? "s-done" : decided === "no" ? "s-queued" : "s-awaiting")}
          style={{ marginLeft: "auto" }}
        >
          <span className="status-dot" /> {decided === "yes" ? "已下发" : decided === "no" ? "已取消" : "等你确认"}
        </span>
      </div>
      <div className="card-body">
        <div className="muted small" style={{ marginBottom: 10 }}>
          本次需求预计用 <b>{agents.length} 个智能体</b>完成：{summary}
        </div>
        <div className="agents-strip">
          {agents.map(a => (
            <div className="mini-agent" key={a.id}>
              <span className="ag-ico" style={{ background: a.color, width: 20, height: 20 }}>
                <Icon name={a.icon} size={11} />
              </span>
              <span>{a.name}</span>
              <span className="muted mono small">{a.role}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card-foot">
        <span className="muted small mono" style={{ marginRight: "auto" }}>
          确认后将创建 {agents.length} 条任务并切换到看板
        </span>
        <button className="btn-ghost" disabled={!!decided} onClick={onNo}>先不下发</button>
        <button className="btn-primary-accent" disabled={!!decided} onClick={onYes}>
          <Icon name="play" size={12} /> 确认并分配任务
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { ClarifyPanel, ClarifyForm, AgentBuildCard, ConfirmTeamCard });
