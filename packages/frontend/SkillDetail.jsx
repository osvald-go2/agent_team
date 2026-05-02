// SkillDetail — simple header + left file list / right file preview.

function SkillDetail({ skillId, store, goBack }) {
  const skill = store.state.skills.find(s => s.id === skillId);

  if (!skill) {
    return (
      <div className="detail-empty">
        <div>Skill not found.</div>
        <button className="btn-primary-accent" onClick={goBack}>Back</button>
      </div>
    );
  }

  const files = React.useMemo(() => ensureSkillFiles(skill), [skill.id, skill.files]);
  const defaultPath = React.useMemo(
    () => {
      const previewPath = skill.preview?.path;
      return (
        (previewPath && files.find(f => f.path === previewPath)) ||
        files.find(f => /^skill\.md$/i.test(f.path)) ||
        files[0] ||
        {}
      ).path;
    },
    [files, skill.preview?.path]
  );
  const [activePath, setActivePath] = React.useState(defaultPath);
  const [viewMode, setViewMode] = React.useState("rendered");
  React.useEffect(() => {
    setActivePath(defaultPath);
    setViewMode("rendered");
  }, [skill.id, defaultPath]);

  const active = files.find(f => f.path === activePath) || files[0];
  const nodes = React.useMemo(() => buildFileTree(files, f => f.path), [files]);
  const source = skill.source?.type === "git" ? skill.source : null;

  return (
    <div className="simple-detail">
      <div className="detail-topbar">
        <button className="back-btn" onClick={goBack}>
          <Icon name="arrow" size={13} style={{ transform: "scaleX(-1)" }} /> Back
        </button>
        <div className="crumb-trail">
          <span>Library</span><span className="sep">/</span>
          <span>Skills</span><span className="sep">/</span>
          <span className="current mono">{skill.name}</span>
        </div>
        <div className="spacer" />
      </div>

      <div className="simple-detail-head">
        <div className="sd-title mono">{skill.name}</div>
        {skill.desc && <div className="sd-desc">{skill.desc}</div>}
        <div className="sd-meta skill-meta muted small">
          {skill.category && <span>{skill.category}</span>}
          {skill.kind && <><span className="sep">·</span><span>{skill.kind}</span></>}
          <><span className="sep">·</span><span>{files.length} files</span></>
          {source?.commit && <><span className="sep">·</span><span className="mono">{source.commit.slice(0, 7)}</span></>}
          {source?.importedAt && <><span className="sep">·</span><span>imported {formatSkillDate(source.importedAt)}</span></>}
        </div>
        {source && (
          <div className="skill-source-line">
            <Icon name="branch" size={12} />
            <span className="mono clamp-1">{source.url}</span>
            {source.subdir && <span className="chip mono">{source.subdir}</span>}
          </div>
        )}
      </div>

      <div className="detail-twocol">
        <aside className="file-pane">
          <FileTree nodes={nodes} activePath={activePath} onPick={n => setActivePath(n.path)} />
        </aside>
        <main className="file-preview">
          {active ? (
            <FilePreview file={active} viewMode={viewMode} onViewMode={setViewMode} />
          ) : (
            <div className="empty-inline" style={{ padding: 60, textAlign: "center" }}>
              Select a file.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function FilePreview({ file, viewMode, onViewMode }) {
  const isMd = /\.md$/i.test(file.path);
  return (
    <>
      <div className="file-preview-head">
        <Icon name={iconForPath(file.path)} size={12} />
        <span className="fp-path mono">{file.path}</span>
        {file.size != null && <span className="muted mono">{formatBytes(file.size)}</span>}
        <span style={{ flex: 1 }} />
        {isMd && (
          <SegControl value={viewMode} onChange={onViewMode}
            options={[
              { value: "rendered", label: "Rendered" },
              { value: "source", label: "Source" },
            ]} />
        )}
      </div>
      {isMd && viewMode === "rendered" ? (
        <div className="file-preview-body md-scroll">
          <MarkdownView source={file.content || ""} />
        </div>
      ) : (
        <div className="file-preview-body code-scroll">
          <CodeEditor value={file.content || ""} language={languageForPath(file.path)} readOnly />
        </div>
      )}
    </>
  );
}

function ensureSkillFiles(skill) {
  const existing = Array.isArray(skill.files) ? skill.files : [];
  if (existing.some(f => /^skill\.md$/i.test(f.path))) return existing;
  const md = { path: "skill.md", language: "markdown", content: defaultSkillMd(skill) };
  const fallback = existing.length
    ? existing
    : [{ path: "index.py", language: "python", content: defaultSkillPy(skill) }];
  return [md, ...fallback];
}

function defaultSkillMd(s) {
  const calls = s.calls != null ? s.calls : 0;
  return [
    "# " + (s.name || "untitled.skill"),
    "",
    s.desc || "A reusable capability for agents.",
    "",
    "## When to use",
    "",
    "Use this skill when the agent needs to " +
      (s.desc ? s.desc.toLowerCase().replace(/\.$/, "") : "perform this capability") + ".",
    "",
    "## Category",
    "",
    "`" + (s.category || "general") + "`",
    "",
    "## Inputs",
    "",
    "| name  | type   | required | description             |",
    "| ----- | ------ | -------- | ----------------------- |",
    "| query | string | yes      | The request to run      |",
    "",
    "## Outputs",
    "",
    "Returns a structured object with the results of the skill.",
    "",
    "## Example",
    "",
    "```python",
    "from skills import " + (s.name || "skill").replace(/\./g, "_"),
    "",
    "result = " + (s.name || "skill").replace(/\./g, "_") + "(query=\"example\")",
    "print(result)",
    "```",
    "",
    "## Metadata",
    "",
    "- **Kind:** `" + (s.kind || "builtin") + "`",
    "- **Calls (30d):** " + calls,
    "",
  ].join("\n");
}

function defaultSkillPy(s) {
  const fn = (s.name || "run").replace(/\./g, "_");
  return [
    '"""' + (s.desc || "Skill entry point.") + '"""',
    "",
    "",
    "def " + fn + "(query: str) -> dict:",
    "    # TODO: implement",
    '    return {"results": [f"match for {query}"]}',
    "",
  ].join("\n");
}

function formatSkillDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatBytes(value) {
  const n = Number(value || 0);
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

/* ——— Generic file tree (used by Skill and KB) ——— */

function FileTree({ nodes, activePath, onPick }) {
  return (
    <div className="file-tree-v2">
      {nodes.map(n => (
        <FileNode key={n.path} node={n} activePath={activePath} onPick={onPick} depth={0} />
      ))}
      {nodes.length === 0 && <div className="empty-inline" style={{ padding: 14 }}>No files.</div>}
    </div>
  );
}

function FileNode({ node, activePath, onPick, depth }) {
  const [open, setOpen] = React.useState(true);
  const pad = 6 + depth * 12;
  if (node.type === "folder") {
    return (
      <>
        <div className="ft2-row folder" style={{ paddingLeft: pad }}
          onClick={() => setOpen(o => !o)}>
          <Icon name="arrow" size={9}
            style={{ transform: "rotate(" + (open ? 90 : 0) + "deg)", opacity: 0.55, transition: "transform 0.12s" }} />
          <Icon name="folder" size={12} />
          <span>{node.name}</span>
        </div>
        {open && node.children.map(c => (
          <FileNode key={c.path} node={c} activePath={activePath} onPick={onPick} depth={depth + 1} />
        ))}
      </>
    );
  }
  return (
    <div className={"ft2-row file " + (activePath === node.path ? "active" : "")}
      style={{ paddingLeft: pad + 14 }}
      onClick={() => onPick(node)}>
      <Icon name={iconForPath(node.name)} size={11} />
      <span className="ft2-name">{node.name}</span>
    </div>
  );
}

function buildFileTree(items, getName) {
  const root = { type: "folder", name: "", path: "", children: [] };
  items.forEach(item => {
    const full = getName(item);
    const parts = full.split("/").filter(Boolean);
    let cur = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      if (isFile) {
        cur.children.push({ type: "file", name: part, path: full, data: item });
      } else {
        let folder = cur.children.find(c => c.type === "folder" && c.name === part);
        if (!folder) {
          folder = {
            type: "folder",
            name: part,
            path: parts.slice(0, i + 1).join("/"),
            children: [],
          };
          cur.children.push(folder);
        }
        cur = folder;
      }
    });
  });
  const sortRec = (n) => {
    n.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(c => { if (c.type === "folder") sortRec(c); });
  };
  sortRec(root);
  return root.children;
}

function iconForPath(p) {
  if (/\.md$/i.test(p)) return "doc";
  if (/\.(py)$/i.test(p)) return "flask";
  if (/\.(js|jsx|ts|tsx)$/i.test(p)) return "hammer";
  if (/\.(json|ya?ml)$/i.test(p)) return "cube";
  if (/\.(css|html?|svg)$/i.test(p)) return "doc";
  return "doc";
}

function languageForPath(p) {
  if (/\.py$/i.test(p)) return "python";
  if (/\.(js|jsx)$/i.test(p)) return "javascript";
  if (/\.(ts|tsx)$/i.test(p)) return "typescript";
  if (/\.json$/i.test(p)) return "json";
  if (/\.ya?ml$/i.test(p)) return "yaml";
  if (/\.md$/i.test(p)) return "markdown";
  if (/\.css$/i.test(p)) return "css";
  if (/\.html?$/i.test(p)) return "xml";
  if (/\.sh$/i.test(p)) return "bash";
  return "plaintext";
}

Object.assign(window, { SkillDetail, FileTree, FileNode, buildFileTree, iconForPath, languageForPath });
