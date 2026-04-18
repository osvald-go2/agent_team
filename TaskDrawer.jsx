// Task drawer — per-task detail. Two tabs: Task (checklist) | Chat (thread + composer).
// Sibling to AgentDrawer.jsx; reuses drawer-* CSS and adds task-drawer-head + .drawer.wide.

function TaskDrawer({ task, store, agents, onClose, onSelectAgent }) {
  const [tab, setTab] = React.useState("task");

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!task) return null;
  const agent = agents.find(a => a.id === task.agent);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer wide">
        <div className="drawer-header task-drawer-head">
          <div className="tdh-title-wrap">
            <div className="tdh-title" title={task.title}>{task.title}</div>
            <div className="tdh-sub">
              {agent && (
                <button
                  className="tc-agent-pill"
                  onClick={() => onSelectAgent(agent.id)}
                  title={`Open ${agent.name}`}
                >
                  <span className="ag-ico" style={{ background: agent.color }}>
                    <Icon name={agent.icon} size={9} />
                  </span>
                  <span className="nm">{agent.name}</span>
                  <span className="role">{agent.role}</span>
                </button>
              )}
              <span className={"tc-status s-" + task.status}>
                {task.status === "running" && <span className="spinner-sm" />}
                {task.status === "awaiting" && <Icon name="alert" size={9} />}
                {task.status === "queued" && <Icon name="clock" size={9} />}
                {task.status === "done" && <Icon name="check" size={9} />}
                <span>{task.status}</span>
              </span>
              <span className="tc-due mono" title="Due">
                <Icon name="clock" size={9} /> {task.due}
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="drawer-tabs">
          <button className={tab === "task" ? "active" : ""} onClick={() => setTab("task")}>
            <Icon name="board" size={11} /> Task
          </button>
          <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
            <Icon name="chat" size={11} /> Chat
          </button>
        </div>

        <div className="drawer-body">
          {tab === "task" && <TaskTab task={task} agent={agent} />}
          {tab === "chat" && <div className="muted small">Chat tab (coming)</div>}
        </div>
      </div>
    </>
  );
}

function TaskTab({ task, agent }) {
  const todos = task.todos || [];
  return (
    <div className="task-tab">
      {task.activity && (
        <div className="task-tab-activity">{task.activity}</div>
      )}
      <ul className="todo-items task-tab-todos">
        {todos.map(td => (
          <li key={td.id} className={"todo-row s-" + td.status}>
            <span className="todo-check" data-status={td.status}>
              {td.status === "done"  && <Icon name="check" size={11} />}
              {td.status === "doing" && <span className="spinner" />}
              {td.status === "todo"  && <span className="square" />}
            </span>
            <span className="todo-title">{td.text}</span>
            {td.status === "doing" && <span className="todo-tag">doing</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

Object.assign(window, { TaskDrawer });
