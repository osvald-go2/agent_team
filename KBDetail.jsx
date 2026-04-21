// KBDetail — simple header + left file tree / right markdown preview (rendered or source).

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
  const defaultPath = (docs[0] || {}).name;
  const [activePath, setActivePath] = React.useState(defaultPath);
  const [viewMode, setViewMode] = React.useState("rendered");
  React.useEffect(() => {
    setActivePath(defaultPath);
    setViewMode("rendered");
  }, [kb.id]);

  const active = docs.find(d => d.name === activePath) || docs[0];
  const nodes = React.useMemo(() => buildFileTree(docs, d => d.name), [docs]);
  const isMd = active && /\.md$/i.test(active.name);

  return (
    <div className="simple-detail">
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

      <div className="simple-detail-head">
        <div className="sd-title">{kb.name}</div>
        {kb.desc && <div className="sd-desc">{kb.desc}</div>}
        <div className="sd-meta muted small">
          <span>{docs.length} docs</span>
          {kb.size && <><span className="sep">·</span><span>{kb.size}</span></>}
          {kb.updated && <><span className="sep">·</span><span>updated {kb.updated}</span></>}
        </div>
      </div>

      <div className="detail-twocol">
        <aside className="file-pane">
          <FileTree nodes={nodes} activePath={activePath} onPick={n => setActivePath(n.path)} />
        </aside>
        <main className="file-preview">
          {active ? (
            <>
              <div className="file-preview-head">
                <Icon name={iconForPath(active.name)} size={12} />
                <span className="fp-path mono">{active.name}</span>
                <span style={{ flex: 1 }} />
                {isMd && (
                  <SegControl value={viewMode} onChange={setViewMode}
                    options={[
                      { value: "rendered", label: "Rendered" },
                      { value: "source", label: "Source" },
                    ]} />
                )}
              </div>
              <div className="file-preview-body md-scroll">
                {isMd && viewMode === "rendered"
                  ? <MarkdownView source={active.content || ""} />
                  : <CodeEditor value={active.content || ""}
                      language={isMd ? "markdown" : languageForPath(active.name)} readOnly />
                }
              </div>
            </>
          ) : (
            <div className="empty-inline" style={{ padding: 60, textAlign: "center" }}>
              Select a document.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ensureKBDocs(kb) {
  const existing = Array.isArray(kb.docs) ? kb.docs : [];
  const hasContent = existing.some(d => d.content);
  if (hasContent) return existing;
  return buildDefaultDocs(kb);
}

function buildDefaultDocs(kb) {
  const tags = kb.tags || [];
  const topic = kb.name || "Knowledge Base";
  return [
    { id: kb.id + "-readme", name: "README.md", type: "md", size: "2 KB",
      status: "indexed", chunks: 8, updated: kb.updated || "recent",
      content: readmeContent(kb, topic) },
    { id: kb.id + "-overview", name: "wiki/overview.md", type: "md", size: "4 KB",
      status: "indexed", chunks: 16, updated: kb.updated || "recent",
      content: overviewContent(kb, topic) },
    { id: kb.id + "-glossary", name: "wiki/concepts/glossary.md", type: "md", size: "3 KB",
      status: "indexed", chunks: 12, updated: "1 week ago",
      content: glossaryContent(kb, topic) },
    { id: kb.id + "-practices", name: "wiki/concepts/best-practices.md", type: "md", size: "6 KB",
      status: "indexed", chunks: 24, updated: "3 days ago",
      content: bestPracticesContent(kb, topic) },
    { id: kb.id + "-pitfalls", name: "wiki/concepts/common-pitfalls.md", type: "md", size: "3 KB",
      status: "indexed", chunks: 10, updated: "5 days ago",
      content: pitfallsContent(kb, topic) },
    { id: kb.id + "-intro", name: "raw/source-intro.md", type: "md", size: "2 KB",
      status: "indexed", chunks: 6, updated: "2 weeks ago",
      content: sourceIntroContent(kb, topic) },
    { id: kb.id + "-changelog", name: "raw/changelog.md", type: "md", size: "1 KB",
      status: "indexed", chunks: 4, updated: kb.updated || "recent",
      content: changelogContent(kb, topic) },
    { id: kb.id + "-config", name: "config.yaml", type: "yaml", size: "512 B",
      status: "indexed", chunks: 1, updated: "2 weeks ago",
      content: configYamlContent(kb) },
  ];
}

function readmeContent(kb, topic) {
  return [
    "# " + topic,
    "",
    "> " + (kb.desc || "A curated knowledge base for this topic."),
    "",
    "## Contents",
    "",
    "- **wiki/** — long-form concepts and reference material",
    "  - `overview.md` — start here for a high-level tour",
    "  - `concepts/` — individual topics, one per file",
    "- **raw/** — source material imported as-is",
    "- **config.yaml** — indexing and retrieval settings",
    "",
    "## Stats",
    "",
    "| Field   | Value |",
    "| ------- | ----- |",
    "| Items   | " + (kb.items ?? "—") + " |",
    "| Size    | " + (kb.size || "—") + " |",
    "| Updated | " + (kb.updated || "—") + " |",
    "",
    "## Tags",
    "",
    (kb.tags || []).map(t => "`" + t + "`").join(" ") || "_(none)_",
    "",
  ].join("\n");
}

function overviewContent(kb, topic) {
  return [
    "# " + topic + " — Overview",
    "",
    "This knowledge base collects the material an agent needs to answer questions about **" + topic + "**.",
    "Agents retrieve from it via hybrid search: keyword BM25 plus dense vectors from the configured embedding model.",
    "",
    "## Coverage",
    "",
    "1. **Core concepts** — vocabulary, reference definitions, and the relationships between them",
    "2. **Operating practices** — how things are actually done, including known-good patterns",
    "3. **Historical context** — prior decisions, incidents, and the rationale that produced them",
    "",
    "## How to use it",
    "",
    "The retriever is tuned for precision over recall. Ask **specific** questions, reference concrete",
    "entities, and include relevant tags in the query when possible.",
    "",
    "### Example query",
    "",
    "```text",
    "Find the canonical definition of \"" + topic + "\" and the top three references that cite it.",
    "```",
    "",
    "## Caveats",
    "",
    "- Content is versioned; older revisions may contradict the current best practice. Check `updated`.",
    "- Tags are curated, not exhaustive. Don't rely on a tag's absence to infer a topic isn't covered.",
    "",
  ].join("\n");
}

function glossaryContent(kb, topic) {
  return [
    "# Glossary",
    "",
    "Quick reference for the vocabulary used throughout **" + topic + "**.",
    "",
    "### Aggregate",
    "A cluster of domain objects that is treated as a single unit for the purposes of data changes.",
    "",
    "### Bounded context",
    "An explicit boundary within which a particular domain model is defined and applicable.",
    "",
    "### Eventual consistency",
    "A guarantee that, given no new updates, replicas will converge to the same state over time.",
    "",
    "### Idempotency",
    "An operation that produces the same result regardless of how many times it is applied.",
    "",
    "### SLO / SLA",
    "**SLO** is an internal target; **SLA** is an external contractual commitment, usually weaker.",
    "",
    "### Ubiquitous language",
    "A shared vocabulary used by both developers and domain experts, structured around the domain model.",
    "",
  ].join("\n");
}

function bestPracticesContent(kb, topic) {
  return [
    "# Best Practices",
    "",
    "Patterns that have consistently worked for teams operating on **" + topic + "**.",
    "",
    "## 1. Prefer explicit over implicit",
    "",
    "Make dependencies, invariants and failure modes visible in the code, not just in your head.",
    "Implicit rules are the first thing a new contributor breaks.",
    "",
    "```python",
    "# bad — callers have to know `None` means `skip`",
    "def process(job, deadline=None): ...",
    "",
    "# good — the contract is visible",
    "def process(job, deadline: datetime | SkipDeadline) -> Result: ...",
    "```",
    "",
    "## 2. Design for reversibility",
    "",
    "Cheap-to-reverse decisions should be made fast and iterated. Expensive-to-reverse decisions",
    "deserve proportionally more upfront analysis. Don't apply the same process to both.",
    "",
    "## 3. Short feedback loops",
    "",
    "The highest-leverage investment is almost always compressing the loop between change and signal.",
    "A 30-second test run enables experimentation a 5-minute run does not.",
    "",
    "> \"The faster the feedback, the sharper the thinking.\" — common refrain",
    "",
    "## 4. Write for the next reader",
    "",
    "Code is read many more times than it is written. Optimize for the reader who has less context",
    "than you do — that reader is usually you, three months from now.",
    "",
    "## Related",
    "",
    "- [[overview]]",
    "- [[common-pitfalls]]",
    "",
  ].join("\n");
}

function pitfallsContent(kb, topic) {
  return [
    "# Common Pitfalls",
    "",
    "Recurring mistakes when working with **" + topic + "**. Each entry lists the symptom,",
    "the underlying cause, and the fix.",
    "",
    "## Pitfall 1 — Premature abstraction",
    "",
    "**Symptom.** A generic helper with three call sites, each passing a different shape of data.",
    "",
    "**Cause.** The abstraction was designed before the variation was understood.",
    "",
    "**Fix.** Inline the helper. Wait until you have at least three real, similar call sites.",
    "Duplication is cheaper than the wrong abstraction.",
    "",
    "## Pitfall 2 — Silent fallback",
    "",
    "**Symptom.** A bug reported in production is not reproducible in staging.",
    "",
    "**Cause.** A `try/except` somewhere swallowed the original error and returned a default.",
    "",
    "**Fix.** Delete the `except`. Let the error propagate. Log and re-raise if you need both.",
    "",
    "## Pitfall 3 — Heroic retries",
    "",
    "**Symptom.** A failing call eventually succeeds, but tail latency is terrible.",
    "",
    "**Cause.** The client is masking a provider-side problem with aggressive retries.",
    "",
    "**Fix.** Cap retries; add jitter; escalate to the caller when the budget is exhausted.",
    "",
  ].join("\n");
}

function sourceIntroContent(kb, topic) {
  return [
    "# Source Material",
    "",
    "Raw documents captured from upstream sources. These are **not edited** — only indexed.",
    "",
    "## Provenance",
    "",
    "- Exported on " + (kb.updated || "—"),
    "- " + (kb.items ?? "—") + " items, " + (kb.size || "—") + " total",
    "- Canonical format: markdown with YAML front-matter",
    "",
    "## Handling",
    "",
    "1. Documents land here first.",
    "2. A scheduled job normalizes headings, resolves relative links, and strips boilerplate.",
    "3. The normalized result is chunked and embedded. See `config.yaml` for parameters.",
    "",
    "If a document is malformed, flag it in the ingest queue rather than editing it directly —",
    "direct edits drift away from the source and are silently overwritten on the next re-import.",
    "",
  ].join("\n");
}

function changelogContent(kb, topic) {
  return [
    "# Changelog",
    "",
    "## " + (kb.updated || "recent"),
    "",
    "- Re-embedded all documents with the current model",
    "- Added " + Math.max(3, Math.round((kb.items || 10) / 4)) + " new entries under `wiki/concepts/`",
    "- Corrected broken cross-links in the overview",
    "",
    "## 1 week ago",
    "",
    "- Initial import from upstream",
    "- Applied the default chunking configuration (512 / 64 overlap)",
    "",
  ].join("\n");
}

function configYamlContent(kb) {
  const conf = (kb.indexing) || { chunkSize: 512, overlap: 64, embedding: "text-embedding-3-large" };
  return [
    "# Indexing and retrieval configuration for this knowledge base.",
    "",
    "indexing:",
    "  chunkSize: " + conf.chunkSize,
    "  overlap: " + conf.overlap,
    "  embedding: " + conf.embedding,
    "",
    "retrieval:",
    "  strategy: hybrid",
    "  topK: 8",
    "  minSimilarity: 0.72",
    "  rerank: cross-encoder",
    "",
    "access: " + (kb.access || "workspace"),
    "",
    "tags:",
    ...(kb.tags || []).map(t => "  - " + t),
    "",
  ].join("\n");
}

Object.assign(window, { KBDetail });
