// KBDetail — Markdown vault workspace with wiki links, backlinks, and a local graph.

function KBDetail({ kbId, store, goBack }) {
  const kb = store.state.knowledge.find(k => k.id === kbId);

  if (!kb) {
    return (
      <div className="detail-empty">
        <div>Knowledge base not found.</div>
        <button className="btn-primary-accent" onClick={goBack}>Back</button>
      </div>
    );
  }

  const docs = React.useMemo(() => ensureKBDocs(kb), [kb.id, kb.docs]);
  const vault = React.useMemo(() => buildVaultIndex(docs), [docs]);
  const defaultPath = (docs[0] || {}).name;
  const [activePath, setActivePath] = React.useState(defaultPath);
  const [viewMode, setViewMode] = React.useState("rendered");

  React.useEffect(() => {
    setActivePath(defaultPath);
    setViewMode("rendered");
  }, [kb.id, defaultPath]);

  const active = vault.docsByPath[activePath] || docs[0];
  const activeInfo = active ? vault.infoByPath[active.name] : null;
  const nodes = React.useMemo(() => buildFileTree(docs, d => d.name), [docs]);
  const isMd = active && /\.md$/i.test(active.name);
  const outbound = activeInfo ? activeInfo.links : [];
  const backlinks = active ? (vault.backlinksByPath[active.name] || []) : [];
  const mentions = active ? findUnlinkedMentions(docs, active, backlinks) : [];
  const noteCount = docs.filter(d => /\.md$/i.test(d.name || "")).length;

  const pickPath = (path) => {
    if (!path || !vault.docsByPath[path]) return;
    setActivePath(path);
    setViewMode("rendered");
  };

  return (
    <div className="simple-detail kb-vault-detail">
      <div className="detail-topbar">
        <button className="back-btn" onClick={goBack}>
          <Icon name="arrow" size={13} style={{ transform: "scaleX(-1)" }} /> Back
        </button>
        <div className="crumb-trail">
          <span>Library</span><span className="sep">/</span>
          <span>Knowledge</span><span className="sep">/</span>
          <span className="current">{kb.name}</span>
        </div>
        <div className="spacer" />
      </div>

      <div className="simple-detail-head kb-vault-head">
        <div>
          <div className="sd-title">{kb.name}</div>
          <div className="sd-desc">{kb.desc || "A Markdown vault organized by notes, links, and references."}</div>
        </div>
        <div className="kb-vault-stats">
          <span><Icon name="doc" size={12} /> {noteCount} notes</span>
          <span><Icon name="link" size={12} /> {vault.edges.length} links</span>
          <span><Icon name="folder" size={12} /> {countTopFolders(docs)} folders</span>
          {kb.updated && <span><Icon name="clock" size={12} /> {kb.updated}</span>}
        </div>
      </div>

      <div className="kb-vault-layout">
        <aside className="kb-tree-pane">
          <div className="kb-pane-head">
            <div>
              <div className="kb-pane-title">Vault</div>
              <div className="small muted mono">{kb.id}</div>
            </div>
          </div>
          <FileTree nodes={nodes} activePath={active?.name} onPick={n => pickPath(n.path)} />
        </aside>

        <main className="kb-note-pane">
          {active ? (
            <>
              <div className="kb-note-head">
                <div className="kb-note-path">
                  <Icon name={iconForPath(active.name)} size={13} />
                  {active.name.split("/").map((part, i, arr) => (
                    <React.Fragment key={i}>
                      <span className={i === arr.length - 1 ? "current" : ""}>{part}</span>
                      {i < arr.length - 1 && <span className="sep">/</span>}
                    </React.Fragment>
                  ))}
                </div>
                <div className="spacer" />
                {isMd && (
                  <SegControl value={viewMode} onChange={setViewMode}
                    options={[
                      { value: "rendered", label: "Rendered" },
                      { value: "source", label: "Source" },
                    ]} />
                )}
              </div>

              <div className="kb-note-body">
                <div className="kb-note-meta">
                  <h2>{activeInfo?.title || titleFromPath(active.name)}</h2>
                  <div className="kb-note-meta-line">
                    {active.updated && <span><Icon name="clock" size={11} /> {active.updated}</span>}
                    {(active.tags || []).map(t => <span key={t} className="chip">#{t}</span>)}
                  </div>
                </div>

                {isMd && viewMode === "rendered"
                  ? <WikiMarkdownView source={active.content || ""} vault={vault} onNavigate={pickPath} />
                  : <CodeEditor value={active.content || ""}
                      language={isMd ? "markdown" : languageForPath(active.name)} readOnly />
                }

                {isMd && (
                  <ReferenceStrip links={outbound} onPick={pickPath} />
                )}
              </div>
            </>
          ) : (
            <div className="empty-inline" style={{ padding: 60, textAlign: "center" }}>
              Select a note.
            </div>
          )}
        </main>

        <aside className="kb-side-pane">
          <section className="kb-side-section">
            <div className="kb-section-head">
              <div>
                <h3>Graph</h3>
                <div className="small muted">Local links in this vault</div>
              </div>
              <Icon name="network" size={14} />
            </div>
            <VaultGraph vault={vault} activePath={active?.name} onPick={pickPath} />
          </section>

          <section className="kb-side-section">
            <div className="kb-section-head">
              <div>
                <h3>Backlinks</h3>
                <div className="small muted">{backlinks.length} notes reference this note</div>
              </div>
              <Icon name="link" size={14} />
            </div>
            <BacklinkList items={backlinks} docsByPath={vault.docsByPath} onPick={pickPath} empty="No backlinks yet." />
          </section>

          <section className="kb-side-section">
            <div className="kb-section-head">
              <div>
                <h3>Unlinked mentions</h3>
                <div className="small muted">Text mentions without [[links]]</div>
              </div>
              <Icon name="quote" size={14} />
            </div>
            <MentionList items={mentions} onPick={pickPath} />
          </section>
        </aside>
      </div>
    </div>
  );
}

function WikiMarkdownView({ source, vault, onNavigate }) {
  const ref = React.useRef(null);
  const html = React.useMemo(() => {
    if (!window.marked) return "<pre>" + escapeHtml(source || "") + "</pre>";
    try {
      window.marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
      return window.marked.parse(decorateWikiLinks(source || "", vault));
    } catch {
      return "<pre>" + escapeHtml(source || "") + "</pre>";
    }
  }, [source, vault]);

  React.useEffect(() => {
    if (!ref.current || !window.hljs) return;
    ref.current.querySelectorAll("pre code").forEach(el => {
      try { window.hljs.highlightElement(el); } catch {}
    });
  }, [html]);

  const handleClick = (e) => {
    const link = e.target.closest && e.target.closest("[data-wiki-path], [data-wiki-target]");
    if (!link) return;
    e.preventDefault();
    const path = link.getAttribute("data-wiki-path");
    if (path) onNavigate(path);
  };

  return <div ref={ref} className="md-body kb-md-body" onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

function ReferenceStrip({ links, onPick }) {
  return (
    <section className="kb-reference-strip">
      <div className="kb-ref-label">References from this note</div>
      <div className="kb-ref-list">
        {links.length === 0 && <span className="muted small">No wiki links in this note.</span>}
        {links.map((link, i) => (
          <button key={i}
            className={"kb-ref-chip " + (link.path ? "" : "missing")}
            onClick={() => link.path && onPick(link.path)}
            disabled={!link.path}>
            <Icon name={link.path ? "link" : "alert"} size={11} />
            <span>{link.label || link.target}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function VaultGraph({ vault, activePath, onPick }) {
  const layout = React.useMemo(() => layoutVaultGraph(vault, activePath), [vault, activePath]);
  return (
    <svg className="kb-graph" viewBox="0 0 320 220" role="img" aria-label="Knowledge graph">
      <g className="kb-graph-edges">
        {layout.edges.map((edge, i) => {
          const from = layout.positions[edge.from];
          const to = layout.positions[edge.to];
          if (!from || !to) return null;
          const isActive = edge.from === activePath || edge.to === activePath;
          return <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={isActive ? "active" : ""} />;
        })}
      </g>
      <g className="kb-graph-nodes">
        {layout.nodes.map(node => {
          const pos = layout.positions[node.id];
          const cls = [
            "kb-graph-node",
            node.id === activePath ? "active" : "",
            node.missing ? "missing" : "",
          ].filter(Boolean).join(" ");
          return (
            <g key={node.id} className={cls} transform={`translate(${pos.x} ${pos.y})`}
              onClick={() => !node.missing && onPick(node.path)}>
              <circle r={node.id === activePath ? 12 : 8} />
              <text y={node.id === activePath ? 26 : 22}>{shortGraphLabel(node.title)}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function BacklinkList({ items, docsByPath, onPick, empty }) {
  if (!items.length) return <div className="empty-inline">{empty}</div>;
  return (
    <div className="kb-backlink-list">
      {items.map((item, i) => {
        const doc = docsByPath[item.from];
        return (
          <button key={i} className="kb-backlink" onClick={() => onPick(item.from)}>
            <span className="kb-backlink-title">{doc ? titleFromDoc(doc) : item.from}</span>
            <span className="kb-backlink-path mono">{item.from}</span>
            {item.label && <span className="kb-backlink-context">linked as [[{item.label}]]</span>}
          </button>
        );
      })}
    </div>
  );
}

function MentionList({ items, onPick }) {
  if (!items.length) return <div className="empty-inline">No plain-text mentions found.</div>;
  return (
    <div className="kb-backlink-list">
      {items.map(item => (
        <button key={item.path} className="kb-backlink" onClick={() => onPick(item.path)}>
          <span className="kb-backlink-title">{item.title}</span>
          <span className="kb-backlink-context">{item.context}</span>
        </button>
      ))}
    </div>
  );
}

function ensureKBDocs(kb) {
  const existing = Array.isArray(kb.docs) ? kb.docs : [];
  const hasContent = existing.some(d => d.content);
  if (hasContent) return existing.filter(d => /\.md$/i.test(d.name || ""));
  return buildDefaultDocs(kb);
}

function buildDefaultDocs(kb) {
  const topic = kb.name || "Knowledge Base";
  const tags = kb.tags || [];
  return [
    { id: kb.id + "-readme", name: "README.md", type: "md", updated: kb.updated || "recent", tags,
      content: readmeContent(kb, topic) },
    { id: kb.id + "-map", name: "map/knowledge-map.md", type: "md", updated: kb.updated || "recent", tags: ["map"].concat(tags.slice(0, 1)),
      content: knowledgeMapContent(kb, topic) },
    { id: kb.id + "-concepts", name: "notes/core-concepts.md", type: "md", updated: "3 days ago", tags: ["concepts"].concat(tags.slice(0, 1)),
      content: coreConceptsContent(kb, topic) },
    { id: kb.id + "-patterns", name: "notes/reference-patterns.md", type: "md", updated: "4 days ago", tags: ["patterns"].concat(tags.slice(0, 1)),
      content: patternsContent(kb, topic) },
    { id: kb.id + "-questions", name: "notes/open-questions.md", type: "md", updated: "1 week ago", tags: ["questions"],
      content: openQuestionsContent(kb, topic) },
    { id: kb.id + "-sources", name: "sources/source-notes.md", type: "md", updated: "2 weeks ago", tags: ["sources"],
      content: sourceNotesContent(kb, topic) },
    { id: kb.id + "-refs", name: "references/citations.md", type: "md", updated: "2 weeks ago", tags: ["references"],
      content: citationsContent(kb, topic) },
  ];
}

function buildVaultIndex(docs) {
  const mdDocs = docs.filter(d => /\.md$/i.test(d.name || ""));
  const aliases = buildAliasIndex(mdDocs);
  const docsByPath = {};
  const infoByPath = {};
  const backlinksByPath = {};
  const edges = [];
  const missing = {};

  mdDocs.forEach(doc => {
    docsByPath[doc.name] = doc;
    backlinksByPath[doc.name] = [];
  });

  mdDocs.forEach(doc => {
    const links = parseWikiLinks(doc.content || "").map(link => {
      const path = resolveWikiLink(link.target, aliases, docsByPath);
      if (!path) missing[missingNodeId(link.target)] = link.target;
      return { ...link, path };
    });
    infoByPath[doc.name] = { title: titleFromDoc(doc), links };
    links.forEach(link => {
      const to = link.path || missingNodeId(link.target);
      edges.push({ from: doc.name, to, label: link.label, target: link.target, missing: !link.path });
      if (link.path && backlinksByPath[link.path]) {
        backlinksByPath[link.path].push({ from: doc.name, label: link.label, target: link.target });
      }
    });
  });

  return { docs: mdDocs, docsByPath, infoByPath, backlinksByPath, edges, missing };
}

function buildAliasIndex(docs) {
  const aliases = {};
  docs.forEach(doc => {
    aliasKeysForDoc(doc).forEach(key => {
      if (!key) return;
      aliases[key] = aliases[key] && aliases[key] !== doc.name ? null : doc.name;
    });
  });
  return aliases;
}

function aliasKeysForDoc(doc) {
  const path = doc.name || "";
  const noExt = path.replace(/\.md$/i, "");
  const base = noExt.split("/").pop();
  const title = titleFromDoc(doc);
  return [
    path,
    noExt,
    base,
    title,
    slugifyText(base),
    slugifyText(title),
  ].map(normalizeLinkKey);
}

function parseWikiLinks(source) {
  const out = [];
  const re = /\[\[([^[\]\n]+?)\]\]/g;
  let match;
  while ((match = re.exec(source || ""))) {
    const parts = match[1].split("|");
    const target = (parts[0] || "").trim();
    const label = (parts[1] || target).trim();
    if (target) out.push({ raw: match[0], target, label });
  }
  return out;
}

function resolveWikiLink(target, aliases, docsByPath) {
  const clean = String(target || "").trim().replace(/^\/+/, "");
  if (docsByPath[clean]) return clean;
  if (docsByPath[clean + ".md"]) return clean + ".md";
  const key = normalizeLinkKey(clean);
  return aliases[key] || null;
}

function decorateWikiLinks(source, vault) {
  const aliasIndex = buildAliasIndex(vault.docs);
  return String(source || "").split(/(```[\s\S]*?```)/g).map(part => {
    if (part.startsWith("```")) return part;
    return decorateWikiLinkText(part, vault, aliasIndex);
  }).join("");
}

function decorateWikiLinkText(source, vault, aliasIndex) {
  return (source || "").replace(/\[\[([^[\]\n]+?)\]\]/g, (full, inner) => {
    const parts = inner.split("|");
    const target = (parts[0] || "").trim();
    const label = (parts[1] || target).trim();
    const path = resolveWikiLink(target, aliasIndex, vault.docsByPath);
    const cls = "wiki-link" + (path ? "" : " missing");
    return `<a href="#wiki-${encodeURIComponent(target)}" class="${cls}" data-wiki-target="${escapeAttr(target)}" data-wiki-path="${escapeAttr(path || "")}">${escapeHtml(label)}</a>`;
  });
}

function normalizeLinkKey(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.md$/i, "")
    .toLowerCase();
}

function slugifyText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function missingNodeId(target) {
  return "missing:" + normalizeLinkKey(target);
}

function titleFromDoc(doc) {
  const heading = extractFirstHeading(doc.content || "");
  return heading || titleFromPath(doc.name);
}

function titleFromPath(path) {
  const base = String(path || "").split("/").pop().replace(/\.md$/i, "");
  return base.split(/[-_]/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function extractFirstHeading(source) {
  const match = String(source || "").match(/^#\s+(.+)$/m);
  return match ? match[1].replace(/`/g, "").trim() : "";
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function countTopFolders(docs) {
  return new Set(docs.map(d => {
    const parts = (d.name || "").split("/");
    return parts.length > 1 ? parts[0] : null;
  }).filter(Boolean)).size;
}

function layoutVaultGraph(vault, activePath) {
  const docNodes = vault.docs.map(doc => ({
    id: doc.name,
    path: doc.name,
    title: vault.infoByPath[doc.name]?.title || titleFromPath(doc.name),
  }));
  const missingNodes = Object.keys(vault.missing).map(id => ({
    id,
    path: "",
    title: vault.missing[id],
    missing: true,
  }));
  const nodes = docNodes.concat(missingNodes);
  const positions = {};
  const active = nodes.find(n => n.id === activePath);
  const orbit = nodes.filter(n => n.id !== activePath);
  const cx = 160;
  const cy = 104;

  if (active) positions[active.id] = { x: cx, y: cy };
  orbit.forEach((node, i) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / Math.max(orbit.length, 1);
    const rx = node.missing ? 122 : 112;
    const ry = node.missing ? 78 : 70;
    positions[node.id] = {
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    };
  });

  return { nodes, positions, edges: vault.edges };
}

function shortGraphLabel(label) {
  const text = String(label || "");
  return text.length > 18 ? text.slice(0, 16) + "..." : text;
}

function findUnlinkedMentions(docs, active, backlinks) {
  const title = titleFromDoc(active);
  const base = titleFromPath(active.name);
  const terms = [title, base].filter(Boolean).map(t => t.toLowerCase());
  const linked = new Set(backlinks.map(b => b.from));
  const activePath = active.name;

  return docs
    .filter(doc => doc.name !== activePath && !linked.has(doc.name))
    .map(doc => {
      const source = stripWikiLinks(doc.content || "");
      const lower = source.toLowerCase();
      const term = terms.find(t => t && lower.includes(t));
      if (!term) return null;
      const index = lower.indexOf(term);
      const start = Math.max(0, index - 42);
      const end = Math.min(source.length, index + term.length + 58);
      return {
        path: doc.name,
        title: titleFromDoc(doc),
        context: source.slice(start, end).replace(/\s+/g, " ").trim(),
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function stripWikiLinks(source) {
  return String(source || "").replace(/\[\[([^[\]\n]+?)\]\]/g, "");
}

function readmeContent(kb, topic) {
  return [
    "# " + topic,
    "",
    "> " + (kb.desc || "Markdown notes for this topic, connected by wiki links and references."),
    "",
    "## Start here",
    "",
    "- Open the [[map/knowledge-map|knowledge map]] for the vault structure.",
    "- Read [[notes/core-concepts|core concepts]] before applying [[notes/reference-patterns|reference patterns]].",
    "- Check [[references/citations|citations]] when a note needs source context.",
    "",
    "## Vault rules",
    "",
    "- One concept per Markdown note.",
    "- Use `[[wiki links]]` for internal references.",
    "- Put source excerpts in `sources/` and link back to the note that interprets them.",
    "",
    "## Tags",
    "",
    (kb.tags || []).map(t => "`#" + t + "`").join(" ") || "_No tags yet._",
    "",
  ].join("\n");
}

function knowledgeMapContent(kb, topic) {
  return [
    "# Knowledge Map",
    "",
    "The vault is layered from stable context to working notes.",
    "",
    "## Layers",
    "",
    "| Layer | Purpose | Key notes |",
    "| --- | --- | --- |",
    "| `README.md` | Entry point | [[README]] |",
    "| `notes/` | Interpreted knowledge | [[notes/core-concepts]], [[notes/reference-patterns]] |",
    "| `sources/` | Source excerpts | [[sources/source-notes]] |",
    "| `references/` | Citation and provenance notes | [[references/citations]] |",
    "",
    "## Link flow",
    "",
    "```text",
    "README -> Knowledge Map -> Core Concepts -> Reference Patterns",
    "                         -> Source Notes -> Citations",
    "```",
    "",
    "Use [[notes/open-questions|open questions]] to track gaps without inventing content.",
    "",
  ].join("\n");
}

function coreConceptsContent(kb, topic) {
  return [
    "# Core Concepts",
    "",
    "A short glossary of the ideas that recur across **" + topic + "**.",
    "",
    "## Canonical note",
    "",
    "Every important term gets a canonical note, then related notes link to it with `[[term]]` syntax.",
    "This keeps the graph readable and makes backlinks useful.",
    "",
    "## Working context",
    "",
    "- Prefer named examples over generic advice.",
    "- Link from decisions to the concept they depend on.",
    "- When a note quotes source material, connect it to [[sources/source-notes]].",
    "",
    "## Related",
    "",
    "- [[map/knowledge-map]]",
    "- [[notes/reference-patterns]]",
    "- [[references/citations]]",
    "",
  ].join("\n");
}

function patternsContent(kb, topic) {
  return [
    "# Reference Patterns",
    "",
    "Reusable Markdown structures for notes in **" + topic + "**.",
    "",
    "## Concept note",
    "",
    "```markdown",
    "# Concept name",
    "",
    "## Definition",
    "Short canonical definition.",
    "",
    "## Links",
    "- [[related-note]]",
    "- [[sources/source-notes]]",
    "```",
    "",
    "## Decision note",
    "",
    "Decision notes should link to [[notes/core-concepts]] and cite the source trail in [[references/citations]].",
    "",
    "## Related",
    "",
    "- [[README]]",
    "- [[notes/open-questions]]",
    "",
  ].join("\n");
}

function openQuestionsContent(kb, topic) {
  return [
    "# Open Questions",
    "",
    "Questions that should stay visible until someone adds a note or reference.",
    "",
    "- Which source should be canonical when [[sources/source-notes]] disagree?",
    "- Do we need a separate [[review-playbook]] for this vault?",
    "- Should [[notes/reference-patterns]] include examples for every tag?",
    "",
    "When a question is answered, convert it into a note and link it from [[map/knowledge-map]].",
    "",
  ].join("\n");
}

function sourceNotesContent(kb, topic) {
  return [
    "# Source Notes",
    "",
    "Source excerpts and provenance notes for **" + topic + "**.",
    "",
    "## Handling",
    "",
    "1. Keep excerpts short and cite where they came from.",
    "2. Link the interpretation note, usually [[notes/core-concepts]] or [[notes/reference-patterns]].",
    "3. Move long references to [[references/citations]].",
    "",
    "## Source ledger",
    "",
    "| Source | Used by | Notes |",
    "| --- | --- | --- |",
    "| Team docs | [[notes/core-concepts]] | Stable vocabulary and examples |",
    "| Review notes | [[notes/reference-patterns]] | Patterns that passed review |",
    "",
  ].join("\n");
}

function citationsContent(kb, topic) {
  return [
    "# Citations",
    "",
    "Reference trail for notes in this vault.",
    "",
    "## References",
    "",
    "- Internal handbook sections linked from [[sources/source-notes]].",
    "- Prior project notes connected through [[map/knowledge-map]].",
    "- Review comments summarized in [[notes/reference-patterns]].",
    "",
    "## Maintenance",
    "",
    "When a citation changes, update the source note first, then check backlinks from the graph.",
    "",
  ].join("\n");
}

Object.assign(window, { KBDetail });
