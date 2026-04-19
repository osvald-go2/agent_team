// Generic CRUD UI primitives — entity store, drawer (view/edit/new), confirm dialog, row menu.
// Every management page can wire into this with just an entityKey + field schema.

/* ——— Entity store (hook) ———
 * Wraps window.AppData's arrays into React state with CRUD helpers.
 * Initialized once from AppData on first use, then held in state so mutations re-render.
 */
function useEntityStore() {
  const D = window.AppData;
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

  const create = React.useCallback((key, item) => {
    setState(s => {
      const id = item.id || `${key.slice(0, 2)}-${Date.now().toString(36)}`;
      return { ...s, [key]: [{ ...item, id }, ...s[key]] };
    });
  }, []);

  const update = React.useCallback((key, id, patch) => {
    setState(s => ({ ...s, [key]: s[key].map(x => x.id === id ? { ...x, ...patch } : x) }));
  }, []);

  const remove = React.useCallback((key, id) => {
    setState(s => ({ ...s, [key]: s[key].filter(x => x.id !== id) }));
  }, []);

  const duplicate = React.useCallback((key, id) => {
    setState(s => {
      const src = s[key].find(x => x.id === id);
      if (!src) return s;
      const copy = { ...src, id: `${key.slice(0, 2)}-${Date.now().toString(36)}`, name: (src.name || src.title || "Copy") + " (copy)" };
      const idx = s[key].findIndex(x => x.id === id);
      const next = [...s[key]];
      next.splice(idx + 1, 0, copy);
      return { ...s, [key]: next };
    });
  }, []);

  const createProject = React.useCallback(({ name, description, defaultTemplateId, icon, color }) => {
    const projectId = `proj-${Date.now().toString(36)}`;
    const sessionId = `sess-${Date.now().toString(36)}`;
    const now = "Now";
    setState(s => ({
      ...s,
      projects: [
        {
          id: projectId,
          name: name || "Untitled project",
          description: description || "",
          icon: icon || "cube",
          color: color || "oklch(0.72 0.13 80)",
          defaultTemplateId: defaultTemplateId || null,
          status: "active",
          created: now,
          lastActive: now,
        },
        ...s.projects,
      ],
      sessions: [
        {
          id: sessionId,
          projectId,
          name: `${name || "Untitled"} · Session 1`,
          status: "draft",
          agents: 0, turns: 0, duration: "0m", when: now,
          createdBy: "Lin Chen",
        },
        ...s.sessions,
      ],
      conversation: [
        { id: `msg-${sessionId}-0`, sessionId, role: "system", text: "Team ready — describe what you want to work on." },
        ...s.conversation,
      ],
    }));
    return { projectId, sessionId };
  }, []);

  const createSession = React.useCallback((projectId, { name } = {}) => {
    const sessionId = `sess-${Date.now().toString(36)}`;
    const now = "Now";
    setState(s => ({
      ...s,
      sessions: [
        {
          id: sessionId,
          projectId,
          name: name || "New session",
          status: "draft",
          agents: 0, turns: 0, duration: "0m", when: now,
          createdBy: "Lin Chen",
        },
        ...s.sessions,
      ],
      conversation: [
        { id: `msg-${sessionId}-0`, sessionId, role: "system", text: "Team ready — describe what you want to work on." },
        ...s.conversation,
      ],
    }));
    return sessionId;
  }, []);

  const archiveProject = React.useCallback((id) => {
    setState(s => ({ ...s, projects: s.projects.map(p => p.id === id ? { ...p, status: "archived" } : p) }));
  }, []);

  const archiveSession = React.useCallback((id) => {
    setState(s => ({ ...s, sessions: s.sessions.map(x => x.id === id ? { ...x, status: "archived" } : x) }));
  }, []);

  const renameProject = React.useCallback((id, name) => {
    setState(s => ({ ...s, projects: s.projects.map(p => p.id === id ? { ...p, name } : p) }));
  }, []);

  const renameSession = React.useCallback((id, name) => {
    setState(s => ({ ...s, sessions: s.sessions.map(x => x.id === id ? { ...x, name } : x) }));
  }, []);

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
  }, []);

  const deleteProject = React.useCallback((id) => {
    setState(s => {
      const doomedSessionIds = s.sessions.filter(x => x.projectId === id).map(x => x.id);
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
  }, []);

  return {
    state, create, update, remove, duplicate,
    createProject, createSession,
    archiveProject, archiveSession,
    renameProject, renameSession,
    deleteProject, deleteSession,
  };
}

/* ——— Dropdown row menu ——— */
function RowMenu({ onView, onEdit, onDuplicate, onDelete, align = "right" }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const call = (fn) => (e) => {
    e.stopPropagation();
    setOpen(false);
    fn && fn();
  };

  return (
    <div className={"rowmenu-wrap " + (align === "left" ? "al-l" : "al-r")} ref={ref}>
      <button className="ibtn" onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} aria-label="Actions">
        <Icon name="dots" size={14} />
      </button>
      {open && (
        <div className="rowmenu" onClick={e => e.stopPropagation()}>
          {onView && <button onClick={call(onView)}><Icon name="eye" size={12} /> View details</button>}
          {onEdit && <button onClick={call(onEdit)}><Icon name="edit" size={12} /> Edit</button>}
          {onDuplicate && <button onClick={call(onDuplicate)}><Icon name="copy" size={12} /> Duplicate</button>}
          {(onView || onEdit || onDuplicate) && onDelete && <div className="rowmenu-sep" />}
          {onDelete && <button className="danger" onClick={call(onDelete)}><Icon name="trash" size={12} /> Delete</button>}
        </div>
      )}
    </div>
  );
}

/* ——— Confirm dialog ——— */
function ConfirmDialog({ open, title, body, confirmLabel = "Delete", danger = true, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
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
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm}>{confirmLabel}</button>
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
function EntityDrawer({ open, mode, title, subtitle, fields, value, onClose, onSave, onDelete, onModeChange, extras, sideMeta }) {
  const [draft, setDraft] = React.useState(value || {});
  React.useEffect(() => { setDraft(value || {}); }, [value, mode, open]);
  if (!open) return null;

  const set = (name, v) => setDraft(d => ({ ...d, [name]: v }));

  const isView = mode === "view";
  const isNew = mode === "new";
  const isEdit = mode === "edit";

  return (
    <div className="entity-drawer-backdrop" onClick={onClose}>
      <aside className="entity-drawer" onClick={e => e.stopPropagation()}>
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
          <button className="ibtn" onClick={onClose} aria-label="Close"><Icon name="x" size={14} /></button>
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
              <button className="btn-ghost" onClick={onClose}>Close</button>
              {onModeChange && <button className="btn-primary-accent" onClick={() => onModeChange("edit")}><Icon name="edit" size={11} /> Edit</button>}
            </>
          ) : (
            <>
              {isEdit && onDelete && <button className="btn-ghost danger" onClick={onDelete}><Icon name="trash" size={11} /> Delete</button>}
              <div style={{ flex: 1 }} />
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary-accent" onClick={() => onSave(draft)}>
                <Icon name="check" size={11} /> {isNew ? "Create" : "Save changes"}
              </button>
            </>
          )}
        </div>
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
