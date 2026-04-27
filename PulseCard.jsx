// Activity Pulse — inline system message rendered when a task changes status.

const PULSE_KIND_META = {
  "task-done":     { verb: "finished",          klass: "pulse-card--done",     icon: "check" },
  "task-started":  { verb: "started",           klass: "pulse-card--running",  icon: "spark" },
  "task-blocked":  { verb: "blocked",           klass: "pulse-card--blocked",  icon: "alert" },
  "task-awaiting": { verb: "needs your input on", klass: "pulse-card--awaiting", icon: "flag" },
};

function PulseCard({ msg, agents, onSelectAgent, onFocusTask }) {
  const meta = PULSE_KIND_META[msg.latestPulseKind || msg.pulseKind] || PULSE_KIND_META["task-done"];
  const agent = msg.agent ? (agents || []).find(a => a.id === msg.agent) : null;
  const merged = (msg.mergedCount || 1) > 1;

  const formatTs = (ts) => {
    if (!ts) return "";
    if (typeof ts === "string") return ts;
    try {
      const d = new Date(ts);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    } catch { return ""; }
  };

  return (
    <div className={"pulse-card " + meta.klass} role="status" aria-live="polite">
      <span className="pulse-card-ico"><Icon name={meta.icon} size={12} /></span>
      <span className="pulse-card-agent">
        {agent && <AgentBadge agent={agent} size={16} />}
        <button
          type="button"
          className="pulse-card-agent-name"
          onClick={() => agent && onSelectAgent && onSelectAgent(agent.id)}
        >
          {agent?.name || "Team"}
        </button>
      </span>
      <span className="pulse-card-text">
        <span> {meta.verb} </span>
        <button
          type="button"
          className="pulse-card-task"
          onClick={() => msg.taskId && onFocusTask && onFocusTask(msg.taskId)}
        >
          {msg.taskTitle || msg.taskId || "task"}
        </button>
      </span>
      {merged && <span className="pulse-card-count">×{msg.mergedCount}</span>}
      <span className="pulse-card-spacer" />
      <span className="pulse-card-ts">{formatTs(msg.ts)}</span>
    </div>
  );
}

Object.assign(window, { PulseCard });
