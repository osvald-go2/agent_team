// Generic CRUD UI primitives — entity store, drawer (view/edit/new), confirm dialog, row menu.
// Every management page can wire into this with just an entityKey + field schema.

/* ——— Entity store (hook) ———
 * Wraps window.AppData's arrays into React state with CRUD helpers.
 * Initialized once from AppData on first use, then held in state so mutations re-render.
 */
function useEntityStore() {
  const D = window.AppData;
  const api = window.AgentTeamApi;
  const entityKeys = ["agents", "skills", "knowledge", "templates", "projects", "sessions", "approvals", "tasks", "conversation"];
  const [state, setState] = React.useState(() => ({
    agents:       [...D.agents],
    skills:       [...D.skills],
    knowledge:    [...D.knowledge],
    templates:    [...D.templates],
    projects:     [...D.projects],
    sessions:     [...D.sessions],
    approvals:    [...D.approvals],
    tasks:        [...D.tasks],
    conversation: [...D.conversation],
  }));

  const persistCreate = React.useCallback((key, item) => {
    api?.createEntity?.(key, item).catch(err => console.warn("AgentTeam create failed", key, err));
  }, [api]);
  const persistUpdate = React.useCallback((key, id, patch) => {
    api?.updateEntity?.(key, id, patch).catch(err => console.warn("AgentTeam update failed", key, err));
  }, [api]);
  const persistDelete = React.useCallback((key, id) => {
    api?.deleteEntity?.(key, id).catch(err => console.warn("AgentTeam delete failed", key, err));
  }, [api]);

  React.useEffect(() => {
    let cancelled = false;
    api?.bootstrap?.()
      .then((payload) => {
        if (cancelled || !payload?.entities) return;
        Object.assign(window.AppData, payload.entities);
        if (payload.runtime) window.AppData.runtime = payload.runtime;
        setState(s => {
          const next = { ...s };
          entityKeys.forEach(k => {
            if (Array.isArray(payload.entities[k])) next[k] = payload.entities[k];
          });
          return next;
        });
      })
      .catch(err => console.warn("AgentTeam backend unavailable; using mock data", err));
    return () => { cancelled = true; };
  }, []);

  const create = React.useCallback((key, item) => {
    const id = item.id || `${key.slice(0, 2)}-${Date.now().toString(36)}`;
    const record = { ...item, id };
    setState(s => {
      return { ...s, [key]: [record, ...s[key]] };
    });
    persistCreate(key, record);
    return record.id;
  }, [persistCreate]);

  // Append-only variant for chronological collections (e.g. conversation):
  // `create` prepends, which puts new chat messages at the top of the thread.
  const append = React.useCallback((key, item) => {
    const id = item.id || `${key.slice(0, 2)}-${Date.now().toString(36)}`;
    const record = { ...item, id };
    setState(s => {
      return { ...s, [key]: [...s[key], record] };
    });
    persistCreate(key, record);
    return record.id;
  }, [persistCreate]);

  const update = React.useCallback((key, id, patch) => {
    setState(s => ({ ...s, [key]: s[key].map(x => x.id === id ? { ...x, ...patch } : x) }));
    persistUpdate(key, id, patch);
  }, [persistUpdate]);

  const remove = React.useCallback((key, id) => {
    setState(s => ({ ...s, [key]: s[key].filter(x => x.id !== id) }));
    persistDelete(key, id);
  }, [persistDelete]);

  const duplicate = React.useCallback((key, id) => {
    let copy;
    setState(s => {
      const src = s[key].find(x => x.id === id);
      if (!src) return s;
      copy = { ...src, id: `${key.slice(0, 2)}-${Date.now().toString(36)}`, name: (src.name || src.title || "Copy") + " (copy)" };
      const idx = s[key].findIndex(x => x.id === id);
      const next = [...s[key]];
      next.splice(idx + 1, 0, copy);
      return { ...s, [key]: next };
    });
    setTimeout(() => copy && persistCreate(key, copy), 0);
  }, [persistCreate]);

  const importGitSkill = React.useCallback(async (payload) => {
    if (!api?.importGitSkill) throw new Error("Backend is unavailable.");
    const result = await api.importGitSkill(payload);
    const skill = result?.skill || result;
    if (!skill?.id) throw new Error("Import did not return a skill.");
    setState(s => {
      const exists = s.skills.some(x => x.id === skill.id);
      return {
        ...s,
        skills: exists
          ? s.skills.map(x => x.id === skill.id ? skill : x)
          : [skill, ...s.skills],
      };
    });
    return skill;
  }, [api]);

  const createProject = React.useCallback(({ name, description, defaultTemplateId, icon, color, model }) => {
    const projectId = `proj-${Date.now().toString(36)}`;
    const sessionId = `sess-${Date.now().toString(36)}`;
    const now = "Now";
    const project = {
      id: projectId,
      name: name || "Untitled project",
      description: description || "",
      icon: icon || "folder",
      color: color || "oklch(0.72 0.13 80)",
      defaultTemplateId: defaultTemplateId || null,
      status: "active",
      created: now,
      lastActive: now,
      env: { roots: [], configs: [] },
    };
    const session = {
      id: sessionId,
      projectId,
      name: `${name || "Untitled"} · Session 1`,
      status: "draft",
      agents: 0, turns: 0, duration: "0m", when: now,
      createdBy: "Lin Chen",
    };
    if (model) session.model = model;
    const message = { id: `msg-${sessionId}-0`, sessionId, role: "system", text: "Team ready — describe what you want to work on." };
    setState(s => ({
      ...s,
      projects: [project, ...s.projects],
      sessions: [session, ...s.sessions],
      conversation: [message, ...s.conversation],
    }));
    persistCreate("projects", project);
    persistCreate("sessions", session);
    persistCreate("conversation", message);
    return { projectId, sessionId };
  }, [persistCreate]);

  const createSession = React.useCallback((projectId, { name, model } = {}) => {
    const sessionId = `sess-${Date.now().toString(36)}`;
    const now = "Now";
    const session = {
      id: sessionId,
      projectId,
      name: name || "New session",
      status: "draft",
      agents: 0, turns: 0, duration: "0m", when: now,
      createdBy: "Lin Chen",
    };
    if (model) session.model = model;
    const message = { id: `msg-${sessionId}-0`, sessionId, role: "system", text: "Team ready — describe what you want to work on." };
    setState(s => ({
      ...s,
      sessions: [session, ...s.sessions],
      conversation: [message, ...s.conversation],
    }));
    persistCreate("sessions", session);
    persistCreate("conversation", message);
    return sessionId;
  }, [persistCreate]);

  const archiveProject = React.useCallback((id) => {
    setState(s => ({ ...s, projects: s.projects.map(p => p.id === id ? { ...p, status: "archived" } : p) }));
    persistUpdate("projects", id, { status: "archived" });
  }, [persistUpdate]);

  const archiveSession = React.useCallback((id) => {
    setState(s => ({ ...s, sessions: s.sessions.map(x => x.id === id ? { ...x, status: "archived" } : x) }));
    persistUpdate("sessions", id, { status: "archived" });
  }, [persistUpdate]);

  const renameProject = React.useCallback((id, name) => {
    setState(s => ({ ...s, projects: s.projects.map(p => p.id === id ? { ...p, name } : p) }));
    persistUpdate("projects", id, { name });
  }, [persistUpdate]);

  const renameSession = React.useCallback((id, name) => {
    let nextRecord = null;
    setState(s => ({
      ...s,
      sessions: s.sessions.map(x => {
        if (x.id !== id) return x;
        nextRecord = { ...x, name };
        return nextRecord;
      }),
    }));
    setTimeout(() => {
      if (!nextRecord || !api?.updateEntity) return;
      api.updateEntity("sessions", id, { name })
        .catch(() => api.createEntity?.("sessions", nextRecord));
    }, 0);
  }, [api]);

  const deleteSession = React.useCallback((id) => {
    setState(s => ({
      ...s,
      sessions:     s.sessions.filter(x => x.id !== id),
      conversation: s.conversation.filter(m => m.sessionId !== id),
      tasks:        s.tasks.filter(t => t.sessionId !== id),
      approvals:    s.approvals.filter(a => a.sessionId !== id),
    }));
    // Note: D.edges, D.nodePos, D.agentThreads are read-only (live on window.AppData, not store).
    // Mutating them is out of scope for this prototype; stale entries are acceptable.
    persistDelete("sessions", id);
  }, [persistDelete]);

  const deleteProject = React.useCallback((id) => {
    let doomedSessionIds = [];
    setState(s => {
      doomedSessionIds = s.sessions.filter(x => x.projectId === id).map(x => x.id);
      const doomed = new Set(doomedSessionIds);
      return {
        ...s,
        projects:     s.projects.filter(p => p.id !== id),
        sessions:     s.sessions.filter(x => x.projectId !== id),
        conversation: s.conversation.filter(m => !doomed.has(m.sessionId)),
        tasks:        s.tasks.filter(t => !doomed.has(t.sessionId)),
        approvals:    s.approvals.filter(a => !doomed.has(a.sessionId)),
      };
    });
    persistDelete("projects", id);
    doomedSessionIds.forEach(sessionId => persistDelete("sessions", sessionId));
  }, [persistDelete]);

  const applyServerEvent = React.useCallback((event) => {
    if (!event) return;
    if (event.type === "agent.output.delta" && event.agentId && event.taskId) {
      const threads = window.AppData.agentThreads || (window.AppData.agentThreads = {});
      const sessionThreads = threads[event.sessionId] || (threads[event.sessionId] = {});
      const thread = sessionThreads[event.agentId] || (sessionThreads[event.agentId] = []);
      const last = thread[thread.length - 1];
      if (last?.taskId === event.taskId && last.role === "agent") {
        last.text = (last.text || "") + (event.delta || "");
      } else {
        thread.push({ role: "agent", taskId: event.taskId, text: event.delta || "" });
      }
      setState(s => ({ ...s }));
    }
    if (event.type === "agent.output.delta" && event.messageId) {
      setState(s => ({
        ...s,
        conversation: s.conversation.map(m => m.id === event.messageId ? { ...m, text: (m.text || "") + (event.delta || ""), streaming: true } : m),
      }));
      return;
    }
    if (event.type === "message.created" && event.message) {
      setState(s => {
        const exists = s.conversation.some(m => m.id === event.message.id);
        return {
          ...s,
          conversation: exists
            ? s.conversation.map(m => m.id === event.message.id ? event.message : m)
            : [...s.conversation, event.message],
        };
      });
      return;
    }
    if (event.type?.startsWith("task.") && event.task) {
      const uiStatus = ({ ready: "queued", blocked: "awaiting", failed: "awaiting" })[event.task.status] || event.task.status;
      const task = { ...event.task, rawStatus: event.task.status, status: uiStatus, agent: event.task.agent || event.task.agentId, activity: event.task.error || event.task.title };
      setState(s => {
        const exists = s.tasks.some(t => t.id === task.id);
        return {
          ...s,
          tasks: exists ? s.tasks.map(t => t.id === task.id ? { ...t, ...task } : t) : [...s.tasks, task],
        };
      });
      return;
    }
    if (event.type !== "entity.changed" || !event.kind || !state[event.kind]) return;
    setState(s => {
      if (!s[event.kind]) return s;
      if (event.action === "delete") {
        return { ...s, [event.kind]: s[event.kind].filter(x => x.id !== event.id) };
      }
      if (!event.record) return s;
      const exists = s[event.kind].some(x => x.id === event.record.id);
      return {
        ...s,
        [event.kind]: exists
          ? s[event.kind].map(x => x.id === event.record.id ? event.record : x)
          : [...s[event.kind], event.record],
      };
    });
  }, [state]);

  return {
    state, create, append, update, remove, duplicate, importGitSkill,
    createProject, createSession,
    archiveProject, archiveSession,
    renameProject, renameSession,
    deleteProject, deleteSession,
    applyServerEvent,
  };
}

/* ——— Dropdown row menu ——— */
function RowMenu({ onView, onEdit, onDuplicate, onDelete, align = "right" }) {
  const [open, setOpen] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const ref = React.useRef(null);

  const closeMenu = React.useCallback(() => {
    if (!open) return;
    setLeaving(true);
    setTimeout(() => { setOpen(false); setLeaving(false); }, 100);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) closeMenu(); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, closeMenu]);

  const call = (fn, toastMsg) => (e) => {
    e.stopPropagation();
    closeMenu();
    fn && fn();
    if (toastMsg && window.toast) setTimeout(() => window.toast(toastMsg, { kind: "success" }), 120);
  };

  return (
    <div className={"rowmenu-wrap " + (align === "left" ? "al-l" : "al-r")} ref={ref}>
      <button className="ibtn" onClick={(e) => { e.stopPropagation(); open ? closeMenu() : setOpen(true); }} aria-label="Actions">
        <Icon name="dots" size={14} />
      </button>
      {open && (
        <div className={"rowmenu " + (leaving ? "is-leaving" : "")} onClick={e => e.stopPropagation()}>
          {onView && <button onClick={call(onView)}><Icon name="eye" size={12} /> View details</button>}
          {onEdit && <button onClick={call(onEdit)}><Icon name="edit" size={12} /> Edit</button>}
          {onDuplicate && <button onClick={call(onDuplicate, "Duplicated")}><Icon name="copy" size={12} /> Duplicate</button>}
          {(onView || onEdit || onDuplicate) && onDelete && <div className="rowmenu-sep" />}
          {onDelete && <button className="danger" onClick={call(onDelete)}><Icon name="trash" size={12} /> Delete</button>}
        </div>
      )}
    </div>
  );
}

/* ——— Confirm dialog ——— */
function ConfirmDialog({ open, title, body, confirmLabel = "Delete", danger = true, onConfirm, onCancel }) {
  const [visible, setVisible] = React.useState(open);
  const [leaving, setLeaving] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) { setVisible(true); setLeaving(false); setBusy(false); return; }
    if (!visible) return;
    setLeaving(true);
    const t = setTimeout(() => { setVisible(false); setLeaving(false); setBusy(false); }, 160);
    return () => clearTimeout(t);
  }, [open]);

  if (!visible) return null;

  const handleConfirm = () => {
    if (busy) return;
    setBusy(true);
    setTimeout(() => {
      onConfirm && onConfirm();
      if (window.toast) window.toast(danger ? "Deleted" : "Done", { kind: danger ? "info" : "success" });
    }, 650);
  };

  return (
    <div className={"modal-backdrop " + (leaving ? "is-leaving" : "")} onClick={busy ? undefined : onCancel}>
      <div className={"modal " + (leaving ? "is-leaving" : "")} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className={"modal-icon " + (danger ? "danger" : "")}>
            <Icon name={danger ? "trash" : "alert"} size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="modal-title">{title}</div>
            {body && <div className="modal-body">{body}</div>}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={danger ? "btn-danger" : "btn-primary"} onClick={handleConfirm} disabled={busy}>
            {busy ? <><span className="spinner-sm" /> {danger ? "Deleting…" : "Working…"}</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ——— Field renderers ——— */
function FieldRow({ label, hint, children, full }) {
  return (
    <div className={"field " + (full ? "full" : "")}>
      <label>{label}{hint && <span className="hint"> · {hint}</span>}</label>
      {children}
    </div>
  );
}

function Field({ field, value, onChange, mode, context }) {
  const readOnly = mode === "view";
  if (field.kind === "text") {
    return (
      <FieldRow label={field.label} hint={field.hint} full={field.full}>
        <input type="text" value={value ?? ""} readOnly={readOnly} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />
      </FieldRow>
    );
  }
  if (field.kind === "textarea") {
    return (
      <FieldRow label={field.label} hint={field.hint} full>
        <textarea rows={field.rows || 3} value={value ?? ""} readOnly={readOnly} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />
      </FieldRow>
    );
  }
  if (field.kind === "number") {
    return (
      <FieldRow label={field.label} hint={field.hint} full={field.full}>
        <input type="number" value={value ?? 0} readOnly={readOnly} onChange={e => onChange(Number(e.target.value))} />
      </FieldRow>
    );
  }
  if (field.kind === "select") {
    const opts = typeof field.options === "function" ? field.options(context) : field.options;
    return (
      <FieldRow label={field.label} hint={field.hint} full={field.full}>
        <select value={value ?? ""} disabled={readOnly} onChange={e => onChange(e.target.value)}>
          {opts.map(o => {
            const v = typeof o === "string" ? o : o.value;
            const l = typeof o === "string" ? o : o.label;
            return <option key={v} value={v}>{l}</option>;
          })}
        </select>
      </FieldRow>
    );
  }
  if (field.kind === "tags") {
    const arr = Array.isArray(value) ? value : [];
    const [draft, setDraft] = React.useState("");
    const add = () => {
      const t = draft.trim();
      if (!t) return;
      onChange([...arr, t]);
      setDraft("");
    };
    return (
      <FieldRow label={field.label} hint={field.hint} full>
        <div className="tag-editor">
          {arr.map((t, i) => (
            <span key={i} className="tag-chip">
              {t}
              {!readOnly && <button onClick={() => onChange(arr.filter((_, j) => j !== i))}><Icon name="x" size={9} /></button>}
            </span>
          ))}
          {!readOnly && (
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              onBlur={add}
              placeholder={field.placeholder || "Add…"}
            />
          )}
        </div>
      </FieldRow>
    );
  }
  if (field.kind === "chips") {
    // Multi-select from fixed options
    const arr = Array.isArray(value) ? value : [];
    const opts = typeof field.options === "function" ? field.options(context) : field.options;
    return (
      <FieldRow label={field.label} hint={field.hint} full>
        <div className="chip-picker">
          {opts.map(o => {
            const v = typeof o === "string" ? o : o.value;
            const l = typeof o === "string" ? o : o.label;
            const on = arr.includes(v);
            return (
              <button key={v}
                type="button"
                className={"chip-opt " + (on ? "on" : "")}
                disabled={readOnly}
                onClick={() => onChange(on ? arr.filter(x => x !== v) : [...arr, v])}>
                {on && <Icon name="check" size={10} />} {l}
              </button>
            );
          })}
        </div>
      </FieldRow>
    );
  }
  if (field.kind === "color") {
    const palette = ["#3b82f6", "#8b5cf6", "#14b8a6", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#6366f1", "#0ea5e9", "#f97316"];
    return (
      <FieldRow label={field.label} hint={field.hint} full={field.full}>
        <div className="color-picker">
          {palette.map(c => (
            <button key={c} type="button" disabled={readOnly}
              className={"color-sw " + (value === c ? "on" : "")}
              style={{ background: c }}
              onClick={() => onChange(c)} />
          ))}
        </div>
      </FieldRow>
    );
  }
  if (field.kind === "icon") {
    const icons = ["user", "compass", "cube", "bolt", "shield", "doc", "book", "chat", "flag", "flask", "target", "hammer"];
    return (
      <FieldRow label={field.label} hint={field.hint} full>
        <div className="icon-picker">
          {icons.map(ic => (
            <button key={ic} type="button" disabled={readOnly}
              className={"icon-sw " + (value === ic ? "on" : "")}
              onClick={() => onChange(ic)}>
              <Icon name={ic} size={14} />
            </button>
          ))}
        </div>
      </FieldRow>
    );
  }
  if (field.kind === "static") {
    const display = typeof field.render === "function" ? field.render(context) : (value ?? "—");
    return (
      <FieldRow label={field.label} hint={field.hint} full={field.full}>
        <div className="static-val">{display}</div>
      </FieldRow>
    );
  }
  return null;
}

/* ——— Entity drawer (new / view / edit) ———
 * Props:
 *   open: boolean
 *   mode: 'new' | 'view' | 'edit'
 *   title: string
 *   subtitle?: string
 *   fields: [{ kind, name, label, ... }]
 *   value: object (the entity or draft)
 *   onClose()
 *   onSave(value)
 *   onDelete?()
 *   onModeChange?(mode)  // e.g. switch from view -> edit
 *   extras?: ReactNode   // extra panel below fields (read-only sections for 'view')
 */
function EntityDrawerSkeleton({ fieldCount = 5 }) {
  return (
    <>
      <div className="entity-drawer-head">
        <div style={{ flex: 1, minWidth: 0 }} className="skel-stack">
          <span className="skel skel-line-sm" style={{ width: 54 }} />
          <span className="skel skel-line-lg" style={{ width: "60%" }} />
          <span className="skel skel-line-sm" style={{ width: "35%" }} />
        </div>
      </div>
      <div className="entity-drawer-body">
        <div className="ed-fields skel-stack" style={{ gap: 18 }}>
          {Array.from({ length: fieldCount }).map((_, i) => (
            <div key={i} className="skel-stack" style={{ gap: 6 }}>
              <span className="skel skel-line-sm" style={{ width: 80 }} />
              <span className="skel skel-line-lg" style={{ width: i % 2 === 0 ? "100%" : "70%" }} />
            </div>
          ))}
        </div>
      </div>
      <div className="entity-drawer-foot">
        <div style={{ flex: 1 }} />
        <span className="skel skel-line-lg" style={{ width: 72 }} />
        <span className="skel skel-line-lg" style={{ width: 120 }} />
      </div>
    </>
  );
}

function EntityDrawer({ open, mode, title, subtitle, fields, value, onClose, onSave, onDelete, onModeChange, extras, sideMeta }) {
  const [visible, setVisible] = React.useState(open);
  const [leaving, setLeaving] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [draft, setDraft] = React.useState(value || {});

  React.useEffect(() => { setDraft(value || {}); }, [value, mode, open]);

  React.useEffect(() => {
    if (open) {
      setVisible(true);
      setLeaving(false);
      setSaving(false);
      setReady(false);
      const t = setTimeout(() => setReady(true), 260);
      return () => clearTimeout(t);
    }
    if (!visible) return;
    setLeaving(true);
    const t = setTimeout(() => {
      setVisible(false);
      setLeaving(false);
      setReady(false);
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  if (!visible) return null;

  const set = (name, v) => setDraft(d => ({ ...d, [name]: v }));

  const isView = mode === "view";
  const isNew = mode === "new";
  const isEdit = mode === "edit";

  const handleSave = () => {
    if (saving) return;
    setSaving(true);
    setTimeout(() => {
      onSave && onSave(draft);
      if (window.toast) window.toast(isNew ? "Created" : "Saved", { kind: "success" });
    }, 700);
  };

  const safeClose = () => {
    if (saving) return;
    onClose && onClose();
  };

  return (
    <div className={"entity-drawer-backdrop " + (leaving ? "is-leaving" : "")} onClick={safeClose}>
      <aside className={"entity-drawer " + (leaving ? "is-leaving" : "")} onClick={e => e.stopPropagation()}>
        {!ready ? (
          <EntityDrawerSkeleton fieldCount={Math.min(fields.length, 6)} />
        ) : (
          <>
            <div className="entity-drawer-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ed-mode-pill">
                  {isNew && <><Icon name="plus" size={10} /> New</>}
                  {isView && <><Icon name="eye" size={10} /> Details</>}
                  {isEdit && <><Icon name="edit" size={10} /> Editing</>}
                </div>
                <div className="ed-title">{title}</div>
                {subtitle && <div className="ed-sub">{subtitle}</div>}
              </div>
              <button className="ibtn" onClick={safeClose} aria-label="Close" disabled={saving}><Icon name="x" size={14} /></button>
            </div>

            <div className="entity-drawer-body">
              <div className="ed-fields">
                {fields.map(f => (
                  <Field key={f.name} field={f} value={draft[f.name]} onChange={v => set(f.name, v)} mode={mode} context={draft} />
                ))}
              </div>
              {isView && extras && <div className="ed-extras">{extras}</div>}
              {sideMeta && <div className="ed-meta">{sideMeta}</div>}
            </div>

            <div className="entity-drawer-foot">
              {isView ? (
                <>
                  {onDelete && <button className="btn-ghost danger" onClick={onDelete}><Icon name="trash" size={11} /> Delete</button>}
                  <div style={{ flex: 1 }} />
                  <button className="btn-ghost" onClick={safeClose}>Close</button>
                  {onModeChange && <button className="btn-primary-accent" onClick={() => onModeChange("edit")}><Icon name="edit" size={11} /> Edit</button>}
                </>
              ) : (
                <>
                  {isEdit && onDelete && <button className="btn-ghost danger" onClick={onDelete} disabled={saving}><Icon name="trash" size={11} /> Delete</button>}
                  <div style={{ flex: 1 }} />
                  <button className="btn-ghost" onClick={safeClose} disabled={saving}>Cancel</button>
                  <button className="btn-primary-accent" onClick={handleSave} disabled={saving}>
                    {saving
                      ? <><span className="spinner-sm" /> {isNew ? "Creating…" : "Saving…"}</>
                      : <><Icon name="check" size={11} /> {isNew ? "Create" : "Save changes"}</>}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

/* ——— sliceBySession —————————————————————————————————————————
 * Derive a per-session view of all per-session collections.
 * Chunk 1 installs it; Chunk 2 wires consumers.
 */
function sliceBySession(D, store, sessionId) {
  if (!sessionId) {
    return { conversation: [], tasks: [], edges: [], nodePos: {}, approvals: [] };
  }
  return {
    conversation: store.state.conversation.filter(m => m.sessionId === sessionId),
    tasks:        store.state.tasks.filter(t => t.sessionId === sessionId),
    edges:        D.edges.filter(e => e.sessionId === sessionId),
    nodePos:      D.nodePos[sessionId] || {},
    approvals:    store.state.approvals.filter(a => a.sessionId === sessionId),
  };
}

Object.assign(window, { useEntityStore, RowMenu, ConfirmDialog, EntityDrawer, Field, sliceBySession });
