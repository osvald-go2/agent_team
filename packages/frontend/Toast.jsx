// Global toast notification system.
// Usage from anywhere: window.toast("Saved", { kind: "success" })
// Mount <ToastHost /> once at App root.

(function initToastBus() {
  if (window.__toastBus) return;
  const subs = new Set();
  let nextId = 1;
  const bus = {
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    emit(t) { subs.forEach(fn => fn(t)); },
    nextId() { return nextId++; },
  };
  window.__toastBus = bus;
  window.toast = function (msg, opts = {}) {
    bus.emit({
      id: `tst-${bus.nextId()}`,
      msg,
      kind: opts.kind || "info",
      ttl: opts.ttl ?? 3000,
    });
  };
})();

function ToastHost() {
  const [toasts, setToasts] = React.useState([]);

  React.useEffect(() => {
    return window.__toastBus.subscribe((t) => {
      setToasts(arr => [...arr, t]);
      if (t.ttl > 0) {
        setTimeout(() => dismiss(t.id), t.ttl);
      }
    });
  }, []);

  const dismiss = (id) => {
    setToasts(arr => arr.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => {
      setToasts(arr => arr.filter(t => t.id !== id));
    }, 160);
  };

  if (toasts.length === 0) return null;

  const iconFor = (kind) => kind === "success" ? "check" : kind === "error" ? "x" : kind === "warn" ? "alert" : "info";

  return (
    <div className="toast-host">
      {toasts.map(t => (
        <div key={t.id} className={"toast " + t.kind + (t.leaving ? " is-leaving" : "")}>
          <span className="t-ico"><Icon name={iconFor(t.kind)} size={13} /></span>
          <span className="t-body">{t.msg}</span>
          <button className="t-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <Icon name="x" size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { ToastHost });
