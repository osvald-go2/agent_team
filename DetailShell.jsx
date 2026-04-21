// DetailShell — full-screen entity editor with left tab rail, top breadcrumbs,
// autosave indicator, and a content slot. Shared by Agent/Skill/KB/Template editors.

function DetailShell({ crumbs, onBack, tabs, activeTab, onTab, headerRight, children, savedAt }) {
  return (
    <div className="detail-shell">
      <div className="detail-topbar">
        <button className="back-btn" onClick={onBack}>
          <Icon name="arrow" size={13} style={{ transform: "scaleX(-1)" }} /> Back
        </button>
        <div className="crumb-trail">
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              <span className={i === crumbs.length - 1 ? "current" : ""}>{c.label}</span>
              {i < crumbs.length - 1 && <span className="sep">/</span>}
            </React.Fragment>
          ))}
        </div>
        <div className="spacer" />
        <SavedIndicator savedAt={savedAt} />
        {headerRight}
      </div>

      <div className="detail-body">
        <nav className="detail-tabs">
          {tabs.map(t => (
            <button key={t.id}
              className={"dtab " + (activeTab === t.id ? "active" : "")}
              onClick={() => onTab(t.id)}>
              <Icon name={t.icon} size={14} />
              <span>{t.label}</span>
              {t.count != null && <span className="tab-count">{t.count}</span>}
            </button>
          ))}
        </nav>

        <main className="detail-content">
          <div key={activeTab} className="tab-content">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function SavedIndicator({ savedAt }) {
  const [flash, setFlash] = React.useState(false);
  const prev = React.useRef(savedAt);
  React.useEffect(() => {
    if (prev.current !== savedAt) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1200);
      prev.current = savedAt;
      return () => clearTimeout(t);
    }
  }, [savedAt]);
  const rel = useRelTime(savedAt);
  if (savedAt == null) return null;
  return (
    <span className={"saved-ind " + (flash ? "flash" : "")}>
      <span className="saved-dot" />
      {flash ? "Saving…" : `Saved ${rel}`}
    </span>
  );
}

function useRelTime(ts) {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    const t = setInterval(() => force(), 30000);
    return () => clearInterval(t);
  }, []);
  if (!ts) return "just now";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ——— Autosave hook ———
 * Debounces writes to store.update. Returns [draft, setDraft, savedAt].
 */
function useAutosave(initial, onPersist, delay = 450) {
  const [draft, setDraft] = React.useState(initial);
  const [savedAt, setSavedAt] = React.useState(Date.now());
  const timer = React.useRef(null);
  const firstRun = React.useRef(true);

  React.useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onPersist(draft);
      setSavedAt(Date.now());
    }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [draft]);

  return [draft, setDraft, savedAt];
}

/* ——— Reusable editor primitives (used inside every tab) ——— */

function Section({ title, sub, right, children }) {
  return (
    <section className="editor-section">
      <header>
        <div>
          <h3>{title}</h3>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {right}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

function LabeledInput({ label, hint, children, wide }) {
  return (
    <div className={"linp " + (wide ? "wide" : "")}>
      <label>{label}{hint && <span className="hint"> · {hint}</span>}</label>
      {children}
    </div>
  );
}

function SegControl({ value, onChange, options }) {
  return (
    <div className="seg-ctrl">
      {options.map(o => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return (
          <button key={v} className={value === v ? "active" : ""} onClick={() => onChange(v)}>{l}</button>
        );
      })}
    </div>
  );
}

Object.assign(window, { DetailShell, useAutosave, Section, LabeledInput, SegControl, SavedIndicator });
