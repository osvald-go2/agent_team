// Shared mock data for the Agent Team platform.
// All components read from window.AppData.

window.AppData = (() => {
  const agents = [
    {
      id: "prd-analyst",
      name: "PRD Analyst",
      icon: "scan",
      role: "Requirements",
      desc: "Parses PRD docs into structured requirements, user stories, and acceptance criteria.",
      model: "claude-sonnet-4.5",
      skills: ["doc.parse", "kb.search", "req.extract", "web.search"],
      knowledge: ["kb-prd-templates", "kb-glossary"],
      status: "done",
      progress: 100,
      color: "oklch(0.72 0.13 230)",
    },
    {
      id: "domain-architect",
      name: "Domain Architect",
      icon: "layers",
      role: "Architecture",
      desc: "Maps requirements onto system components, bounded contexts and service boundaries.",
      model: "claude-opus-4.1",
      skills: ["diagram.mermaid", "kb.search", "ref.adr"],
      knowledge: ["kb-existing-arch", "kb-adr-library"],
      status: "running",
      progress: 62,
      color: "oklch(0.7 0.14 155)",
    },
    {
      id: "api-designer",
      name: "API Designer",
      icon: "plug",
      role: "Interface",
      desc: "Designs REST/gRPC contracts, payloads, error models and versioning strategy.",
      model: "claude-sonnet-4.5",
      skills: ["openapi.gen", "schema.validate", "mock.server"],
      knowledge: ["kb-api-style-guide"],
      status: "queued",
      progress: 0,
      color: "oklch(0.72 0.13 80)",
    },
    {
      id: "data-modeler",
      name: "Data Modeler",
      icon: "database",
      role: "Data",
      desc: "Produces ER diagrams, storage choices and migration plans.",
      model: "claude-sonnet-4.5",
      skills: ["sql.design", "erd.gen", "capacity.est"],
      knowledge: ["kb-data-catalog"],
      status: "awaiting",
      progress: 34,
      color: "oklch(0.68 0.14 300)",
    },
    {
      id: "risk-reviewer",
      name: "Risk Reviewer",
      icon: "shield",
      role: "Review",
      desc: "Evaluates security, compliance, reliability and cost risks.",
      model: "claude-opus-4.1",
      skills: ["risk.matrix", "sec.threat-model", "cost.estimate"],
      knowledge: ["kb-security-policy", "kb-sla-tiers"],
      status: "queued",
      progress: 0,
      color: "oklch(0.7 0.14 25)",
    },
    {
      id: "tech-writer",
      name: "Tech Writer",
      icon: "pen",
      role: "Delivery",
      desc: "Assembles the final technical design doc with diagrams and trade-off rationale.",
      model: "claude-haiku-4.5",
      skills: ["doc.compose", "diagram.render", "md.format"],
      knowledge: ["kb-doc-templates"],
      status: "queued",
      progress: 0,
      color: "oklch(0.7 0.01 260)",
    },
  ];

  const skills = [
    { id: "doc.parse", name: "doc.parse", category: "Ingest", desc: "Parse PDF / DOCX / MD into structured blocks.", kind: "builtin", calls: 1284 },
    { id: "kb.search", name: "kb.search", category: "Retrieve", desc: "Hybrid search across knowledge bases.", kind: "builtin", calls: 9214 },
    { id: "req.extract", name: "req.extract", category: "Analyze", desc: "Extract user stories, AC and non-functionals.", kind: "custom", calls: 342 },
    { id: "web.search", name: "web.search", category: "Retrieve", desc: "Search the web for references.", kind: "builtin", calls: 2108 },
    { id: "diagram.mermaid", name: "diagram.mermaid", category: "Produce", desc: "Render Mermaid diagrams to SVG.", kind: "builtin", calls: 544 },
    { id: "ref.adr", name: "ref.adr", category: "Retrieve", desc: "Lookup architecture decision records.", kind: "custom", calls: 87 },
    { id: "openapi.gen", name: "openapi.gen", category: "Produce", desc: "Generate OpenAPI 3.1 specs.", kind: "builtin", calls: 215 },
    { id: "schema.validate", name: "schema.validate", category: "Verify", desc: "Validate JSON schema against samples.", kind: "builtin", calls: 701 },
    { id: "mock.server", name: "mock.server", category: "Produce", desc: "Spin up a mock HTTP server.", kind: "custom", calls: 44 },
    { id: "sql.design", name: "sql.design", category: "Produce", desc: "Design relational schema DDL.", kind: "builtin", calls: 311 },
    { id: "erd.gen", name: "erd.gen", category: "Produce", desc: "Render ER diagrams.", kind: "builtin", calls: 240 },
    { id: "capacity.est", name: "capacity.est", category: "Analyze", desc: "Estimate storage & throughput needs.", kind: "custom", calls: 55 },
    { id: "risk.matrix", name: "risk.matrix", category: "Analyze", desc: "Produce likelihood×impact matrix.", kind: "builtin", calls: 132 },
    { id: "sec.threat-model", name: "sec.threat-model", category: "Analyze", desc: "STRIDE threat modeling.", kind: "custom", calls: 68 },
    { id: "cost.estimate", name: "cost.estimate", category: "Analyze", desc: "Cloud cost estimator.", kind: "builtin", calls: 194 },
    { id: "doc.compose", name: "doc.compose", category: "Produce", desc: "Assemble markdown docs from sections.", kind: "builtin", calls: 402 },
    { id: "diagram.render", name: "diagram.render", category: "Produce", desc: "Rasterize diagrams for delivery.", kind: "builtin", calls: 288 },
    { id: "md.format", name: "md.format", category: "Produce", desc: "Normalize markdown formatting.", kind: "builtin", calls: 611 },
  ];

  const knowledge = [
    { id: "kb-prd-templates", name: "PRD Templates", items: 34, size: "2.1 MB", updated: "2d ago", tags: ["product", "template"] },
    { id: "kb-glossary", name: "Company Glossary", items: 812, size: "640 KB", updated: "5h ago", tags: ["reference"] },
    { id: "kb-existing-arch", name: "Existing Architecture", items: 126, size: "18 MB", updated: "1d ago", tags: ["engineering", "c4"] },
    { id: "kb-adr-library", name: "ADR Library", items: 91, size: "3.4 MB", updated: "12h ago", tags: ["engineering"] },
    { id: "kb-api-style-guide", name: "API Style Guide", items: 12, size: "320 KB", updated: "1w ago", tags: ["engineering"] },
    { id: "kb-data-catalog", name: "Data Catalog", items: 640, size: "44 MB", updated: "3h ago", tags: ["data"] },
    { id: "kb-security-policy", name: "Security Policy", items: 48, size: "1.2 MB", updated: "4d ago", tags: ["security"] },
    { id: "kb-sla-tiers", name: "SLA Tiers", items: 7, size: "84 KB", updated: "2w ago", tags: ["ops"] },
    { id: "kb-doc-templates", name: "Doc Templates", items: 18, size: "560 KB", updated: "3d ago", tags: ["writing"] },
  ];

  const templates = [
    { id: "tpl-prd2tech", name: "PRD → Technical Design", desc: "Parse a PRD and produce a full technical design doc with arch, API and data design.", agents: 6, runs: 238, tags: ["engineering", "planning"] },
    { id: "tpl-bugfix", name: "Bug Triage & Fix", desc: "Reproduce, root-cause, patch and write a post-mortem.", agents: 4, runs: 512, tags: ["engineering"] },
    { id: "tpl-research", name: "Market & Competitor Research", desc: "Collect, synthesize and compare competitors on key dimensions.", agents: 5, runs: 88, tags: ["research"] },
    { id: "tpl-launch", name: "Launch Readiness", desc: "Go-to-market checklist, risk review and launch comms pack.", agents: 4, runs: 64, tags: ["product"] },
    { id: "tpl-review", name: "Code Review Council", desc: "Multi-angle review: correctness, perf, security, style.", agents: 4, runs: 174, tags: ["engineering"] },
    { id: "tpl-data", name: "Data Analysis Report", desc: "From question to chart-backed report with caveats.", agents: 3, runs: 96, tags: ["data"] },
  ];

  // Conversation in main chat — drives the story of a running PRD→Tech session.
  const conversation = [
    {
      id: "m1",
      sessionId: "sess-lighthouse-01",
      role: "user",
      ts: "09:42",
      text: "Parse the attached PRD for Project Lighthouse and produce a full technical design. Target: Q3 launch. Focus on payments + notifications.",
      attachments: [{ name: "Lighthouse-PRD-v1.3.pdf", size: "1.8 MB" }],
    },
    {
      id: "m2",
      sessionId: "sess-lighthouse-01",
      role: "system",
      ts: "09:42",
      kind: "team-proposal",
      title: "Proposed team",
      body: "Assembling 6 agents based on intent match for PRD → Tech Design. You can edit before running.",
    },
    {
      id: "m3",
      sessionId: "sess-lighthouse-01",
      role: "assistant",
      agent: "prd-analyst",
      ts: "09:43",
      text: "Extracted 24 user stories, 11 NFRs and 3 hard constraints. Flagging: payment SLA target (99.95%) conflicts with current infra tier. See artifact.",
      artifacts: [{ name: "requirements.structured.json", kind: "json" }],
    },
    {
      id: "m4",
      sessionId: "sess-lighthouse-01",
      role: "assistant",
      agent: "domain-architect",
      ts: "09:46",
      text: "Draft bounded contexts: Payments, Ledger, Notification, Identity. Proposing event-driven integration with an outbox pattern. Need your call on synchronous vs async confirmation UX.",
    },
    {
      id: "m5",
      sessionId: "sess-lighthouse-01",
      role: "system",
      ts: "09:46",
      kind: "approval",
      title: "Approval needed — Architecture trade-off",
      from: "domain-architect",
      body: "Should Payments confirm synchronously (lower throughput, simpler UX) or asynchronously via webhook + client poll (higher throughput, extra states)?",
      options: [
        { id: "sync", label: "Synchronous confirmation", hint: "Simpler UX, ~40% of peak throughput" },
        { id: "async", label: "Async + webhook", hint: "Full throughput, extra failure states" },
        { id: "hybrid", label: "Hybrid (sync ≤$50, async above)", hint: "Recommended" },
      ],
      recommended: "hybrid",
      status: "pending",
    },
    {
      id: "m6",
      sessionId: "sess-lighthouse-01",
      role: "assistant",
      agent: "data-modeler",
      ts: "09:48",
      text: "Waiting on arch decision before finalizing Ledger schema. Meanwhile, drafted 3 alternative partitioning strategies for Transactions table.",
    },
  ];

  // Kanban board tasks
  const tasks = [
    { id: "t1", sessionId: "sess-lighthouse-01", title: "Parse PRD v1.3", agent: "prd-analyst", status: "done", due: "09:45", priority: "P1", activity: "Completed · 24 stories extracted", todos: [
  { id: "t1-1", text: "Load PRD document",            status: "done" },
  { id: "t1-2", text: "Segment into user stories",    status: "done" },
  { id: "t1-3", text: "Tag stories by capability",    status: "done" },
  { id: "t1-4", text: "Emit requirements.json",       status: "done" },
] },
    { id: "t2", sessionId: "sess-lighthouse-01", title: "Extract NFRs & constraints", agent: "prd-analyst", status: "done", due: "09:45", priority: "P1", activity: "Completed · 11 NFRs, 3 conflicts flagged", todos: [
  { id: "t2-1", text: "Sweep PRD for NFR terms",      status: "done" },
  { id: "t2-2", text: "Extract latency / SLO claims", status: "done" },
  { id: "t2-3", text: "Flag conflicts between NFRs",  status: "done" },
] },
    { id: "t3", sessionId: "sess-lighthouse-01", title: "Draft bounded contexts", agent: "domain-architect", status: "running", due: "10:10", priority: "P1", activity: "Drafting context map · 4/6 contexts", todos: [
  { id: "t3-1", text: "Extract entities from PRD",    status: "done" },
  { id: "t3-2", text: "Identify aggregate roots",     status: "done" },
  { id: "t3-3", text: "Draft payments context",       status: "done" },
  { id: "t3-4", text: "Draft ledger context",         status: "done" },
  { id: "t3-5", text: "Sketch integration seams",     status: "doing" },
  { id: "t3-6", text: "Review with data-modeler",     status: "todo" },
] },
    { id: "t4", sessionId: "sess-lighthouse-01", title: "Integration pattern ADR", agent: "domain-architect", status: "awaiting", due: "10:20", priority: "P1", activity: "Awaiting your decision on sync vs async", todos: [
  { id: "t4-1", text: "Enumerate integration options",                  status: "done" },
  { id: "t4-2", text: "Compare sync vs async tradeoffs",                status: "done" },
  { id: "t4-3", text: "Awaiting your decision on sync vs async",        status: "doing" },
  { id: "t4-4", text: "Write ADR once decision is recorded",            status: "todo" },
] },
    { id: "t5", sessionId: "sess-lighthouse-01", title: "Ledger schema v0", agent: "data-modeler", status: "awaiting", due: "10:40", priority: "P2", activity: "Awaiting confirmation on partition key", todos: [
  { id: "t5-1", text: "Draft candidate partition keys",                 status: "done" },
  { id: "t5-2", text: "Awaiting confirmation on partition key choice",  status: "doing" },
  { id: "t5-3", text: "Lock schema v0",                                 status: "todo" },
] },
    { id: "t6", sessionId: "sess-lighthouse-01", title: "Partitioning strategy memo", agent: "data-modeler", status: "running", due: "10:30", priority: "P2", activity: "Comparing range vs hash partitioning", todos: [
  { id: "t6-1", text: "Gather ledger access patterns",    status: "done" },
  { id: "t6-2", text: "Compare range vs hash partitioning", status: "doing" },
  { id: "t6-3", text: "Recommend partition strategy",     status: "todo" },
] },
    { id: "t7", sessionId: "sess-lighthouse-01", title: "Payments API draft", agent: "api-designer", status: "queued", due: "11:00", priority: "P1", activity: "Waiting on bounded contexts", todos: [
  { id: "t7-1", text: "Outline payments endpoints",       status: "todo" },
  { id: "t7-2", text: "Define request/response schemas",  status: "todo" },
  { id: "t7-3", text: "Draft OpenAPI spec",               status: "todo" },
] },
    { id: "t8", sessionId: "sess-lighthouse-01", title: "Webhook contract", agent: "api-designer", status: "queued", due: "11:15", priority: "P2", activity: "Waiting on integration ADR", todos: [
  { id: "t8-1", text: "List webhook events",              status: "todo" },
  { id: "t8-2", text: "Design retry / signing policy",    status: "todo" },
  { id: "t8-3", text: "Write contract doc",               status: "todo" },
] },
    { id: "t9", sessionId: "sess-lighthouse-01", title: "Threat model (payments)", agent: "risk-reviewer", status: "queued", due: "11:30", priority: "P1", activity: "Waiting on Payments API draft", todos: [
  { id: "t9-1", text: "Enumerate payment trust boundaries", status: "todo" },
  { id: "t9-2", text: "Identify STRIDE threats",            status: "todo" },
  { id: "t9-3", text: "Propose mitigations",                status: "todo" },
] },
    { id: "t10", sessionId: "sess-lighthouse-01", title: "SLO & cost assessment", agent: "risk-reviewer", status: "queued", due: "11:45", priority: "P2", activity: "Waiting on schema + API", todos: [
  { id: "t10-1", text: "Estimate steady-state QPS",       status: "todo" },
  { id: "t10-2", text: "Derive SLO budgets",              status: "todo" },
  { id: "t10-3", text: "Draft cost model",                status: "todo" },
] },
    { id: "t11", sessionId: "sess-lighthouse-01", title: "Assemble design doc", agent: "tech-writer", status: "queued", due: "12:20", priority: "P1", activity: "Waiting on architecture sign-off", todos: [
  { id: "t11-1", text: "Assemble context + architecture sections", status: "todo" },
  { id: "t11-2", text: "Integrate ADRs and diagrams",              status: "todo" },
  { id: "t11-3", text: "Add risk & migration appendices",          status: "todo" },
] },
    { id: "t12", sessionId: "sess-lighthouse-01", title: "Diagrams export", agent: "tech-writer", status: "queued", due: "12:30", priority: "P3", activity: "Waiting on context map", todos: [
  { id: "t12-1", text: "Export context-map diagram",   status: "todo" },
  { id: "t12-2", text: "Export sequence diagrams",     status: "todo" },
  { id: "t12-3", text: "Bundle diagrams for doc",      status: "todo" },
] },
  ];

  // Kept for backwards-compat (used by old Canvas). New Canvas reads `topologies`.
  const edges = [
    { from: "prd-analyst",      to: "domain-architect", sessionId: "sess-lighthouse-01" },
    { from: "prd-analyst",      to: "data-modeler",     sessionId: "sess-lighthouse-01" },
    { from: "domain-architect", to: "api-designer",     sessionId: "sess-lighthouse-01" },
    { from: "domain-architect", to: "data-modeler",     sessionId: "sess-lighthouse-01" },
    { from: "api-designer",     to: "risk-reviewer",    sessionId: "sess-lighthouse-01" },
    { from: "data-modeler",     to: "risk-reviewer",    sessionId: "sess-lighthouse-01" },
    { from: "domain-architect", to: "tech-writer",      sessionId: "sess-lighthouse-01" },
    { from: "api-designer",     to: "tech-writer",      sessionId: "sess-lighthouse-01" },
    { from: "data-modeler",     to: "tech-writer",      sessionId: "sess-lighthouse-01" },
    { from: "risk-reviewer",    to: "tech-writer",      sessionId: "sess-lighthouse-01" },
  ];
  const nodePos = {
    "sess-lighthouse-01": {
      "prd-analyst":       { x: 8,  y: 46 },
      "domain-architect":  { x: 30, y: 22 },
      "data-modeler":      { x: 30, y: 70 },
      "api-designer":      { x: 55, y: 22 },
      "risk-reviewer":     { x: 55, y: 70 },
      "tech-writer":       { x: 82, y: 46 },
    },
  };

  // ——— Topology presets ———
  // Percent-based (0..100) positions. Each node gets a role label within the topology.
  // Edges are [from, to] by agent id.
  const topologies = {
    orchestrator: {
      id: "orchestrator",
      name: "Orchestrator–Worker",
      subtitle: "Manager delegates to workers",
      shape: "tree",
      // Manager at top, 2 sub-managers, then leaf workers
      nodes: {
        "domain-architect": { x: 50, y: 12, role: "Orchestrator" },
        "prd-analyst":      { x: 22, y: 42, role: "Sub-manager" },
        "api-designer":     { x: 78, y: 42, role: "Sub-manager" },
        "data-modeler":     { x: 10, y: 76, role: "Worker" },
        "risk-reviewer":    { x: 50, y: 76, role: "Worker" },
        "tech-writer":      { x: 90, y: 76, role: "Worker" },
      },
      edges: [
        ["domain-architect", "prd-analyst"],
        ["domain-architect", "api-designer"],
        ["prd-analyst", "data-modeler"],
        ["prd-analyst", "risk-reviewer"],
        ["api-designer", "risk-reviewer"],
        ["api-designer", "tech-writer"],
      ],
    },
    sequential: {
      id: "sequential",
      name: "Sequential Pipeline",
      subtitle: "Top→down hand-off",
      shape: "tree",
      nodes: {
        "prd-analyst":      { x: 50, y: 10, role: "Stage 1" },
        "domain-architect": { x: 50, y: 25, role: "Stage 2" },
        "data-modeler":     { x: 50, y: 40, role: "Stage 3" },
        "api-designer":     { x: 50, y: 55, role: "Stage 4" },
        "risk-reviewer":    { x: 50, y: 70, role: "Stage 5" },
        "tech-writer":      { x: 50, y: 85, role: "Sink" },
      },
      edges: [
        ["prd-analyst", "domain-architect"],
        ["domain-architect", "data-modeler"],
        ["data-modeler", "api-designer"],
        ["api-designer", "risk-reviewer"],
        ["risk-reviewer", "tech-writer"],
      ],
    },
    parallel: {
      id: "parallel",
      name: "Parallel Team",
      subtitle: "Fan-out → aggregate → fan-in",
      shape: "fan",
      // Source → 4 parallel workers → aggregator → sink
      nodes: {
        "prd-analyst":      { x: 8,  y: 50, role: "Source" },
        "domain-architect": { x: 36, y: 14, role: "Parallel" },
        "api-designer":     { x: 36, y: 38, role: "Parallel" },
        "data-modeler":     { x: 36, y: 62, role: "Parallel" },
        "risk-reviewer":    { x: 36, y: 86, role: "Parallel" },
        "tech-writer":      { x: 72, y: 50, role: "Aggregator" },
      },
      edges: [
        ["prd-analyst", "domain-architect"],
        ["prd-analyst", "api-designer"],
        ["prd-analyst", "data-modeler"],
        ["prd-analyst", "risk-reviewer"],
        ["domain-architect", "tech-writer"],
        ["api-designer", "tech-writer"],
        ["data-modeler", "tech-writer"],
        ["risk-reviewer", "tech-writer"],
      ],
    },
  };

  // Per-agent conversations (for drawer)
  const agentThreads = {
    "sess-lighthouse-01": {
      "prd-analyst": [
        { role: "system", text: "Activated. Context: Lighthouse PRD v1.3, 38 pages." },
        { role: "agent", text: "Parsed document. 24 user stories, 11 non-functionals detected." },
        { role: "tool", tool: "doc.parse", text: "doc.parse(pdf) → 312 blocks, 27 tables, 14 figures" },
        { role: "tool", tool: "req.extract", text: "req.extract → {stories: 24, nfrs: 11, constraints: 3}" },
        { role: "agent", text: "Flag: §4.2 payment SLA target 99.95% conflicts with current infra tier (T2 = 99.9%)." },
        { role: "agent", text: "Handing off structured requirements to Domain Architect and Data Modeler." },
      ],
      "domain-architect": [
        { role: "system", text: "Activated. Input: requirements.structured.json from PRD Analyst." },
        { role: "agent", text: "Mapping capabilities to bounded contexts…" },
        { role: "tool", tool: "kb.search", text: "kb.search('payments bounded context') → 8 hits in kb-existing-arch" },
        { role: "tool", tool: "ref.adr", text: "ref.adr('outbox') → ADR-0041, ADR-0063" },
        { role: "agent", text: "Proposing 4 contexts: Payments, Ledger, Notification, Identity with event-driven integration." },
        { role: "agent", text: "Awaiting user decision on sync vs async payment confirmation before finalizing." },
      ],
      "data-modeler": [
        { role: "system", text: "Activated. Input: 11 NFRs, SLA 99.95% for payments." },
        { role: "agent", text: "Drafting 3 partitioning strategies for Transactions (by tenant, by month, hybrid)." },
        { role: "tool", tool: "capacity.est", text: "capacity.est → peak 4,200 tx/s, 180GB/month" },
      ],
      "api-designer": [
        { role: "system", text: "Queued. Waiting on bounded context confirmation." },
      ],
      "risk-reviewer": [
        { role: "system", text: "Queued. Waiting on arch + API drafts." },
      ],
      "tech-writer": [
        { role: "system", text: "Queued. Will assemble once inputs are ready." },
      ],
    },
  };

  const approvals = [
    { id: "a1", sessionId: "sess-lighthouse-01", title: "Architecture: sync vs async payment confirmation", from: "domain-architect", age: "3m", priority: "high", status: "pending" },
    { id: "a2", sessionId: "sess-lighthouse-01", title: "Data: allow PII in analytics warehouse (masked)?", from: "risk-reviewer", age: "just now", priority: "high", status: "pending" },
    { id: "a3", sessionId: "sess-lighthouse-01", title: "Tool use: call external FX rates API", from: "api-designer", age: "1m", priority: "med", status: "pending" },
    { id: "a4", sessionId: "sess-lighthouse-01", title: "Budget: promote Redis to HA tier (+$240/mo)", from: "data-modeler", age: "5m", priority: "med", status: "pending" },
    { id: "a5", sessionId: "sess-lighthouse-01", title: "Spec: include feature flag for gradual rollout", from: "tech-writer", age: "8m", priority: "low", status: "approved" },
    { id: "a6", sessionId: "sess-lighthouse-01", title: "Doc: include ADR-0041 reference", from: "domain-architect", age: "12m", priority: "low", status: "approved" },
  ];

  const history = [
    { id: "h1", name: "Lighthouse — PRD to Tech Design", when: "Now", status: "running", agents: 6, turns: 14, duration: "12m" },
    { id: "h2", name: "Pricing v2 — GTM Launch plan", when: "Yesterday", status: "done", agents: 4, turns: 22, duration: "1h 04m" },
    { id: "h3", name: "P0 Outage — RCA draft", when: "Yesterday", status: "done", agents: 3, turns: 9, duration: "28m" },
    { id: "h4", name: "Mobile auth refactor review", when: "2d ago", status: "done", agents: 4, turns: 11, duration: "41m" },
    { id: "h5", name: "Competitor matrix Q2", when: "3d ago", status: "done", agents: 5, turns: 18, duration: "52m" },
    { id: "h6", name: "Data model — Billing v3", when: "5d ago", status: "cancelled", agents: 3, turns: 4, duration: "8m" },
    { id: "h7", name: "Checkout perf audit", when: "1w ago", status: "done", agents: 4, turns: 16, duration: "36m" },
  ];

  const projects = [
    {
      id: "proj-lighthouse",
      name: "Lighthouse",
      description: "Core PRD → Technical Design workstream.",
      icon: "cube",
      color: "oklch(0.75 0.12 40)",
      defaultTemplateId: "tpl-prd2tech",
      status: "active",
      created: "2026-04-10",
      lastActive: "Now",
    },
    {
      id: "proj-ai-report",
      name: "AI Report Templates",
      description: "AI-assisted reporting template library.",
      icon: "doc-code",
      color: "oklch(0.72 0.13 230)",
      defaultTemplateId: "tpl-data",
      status: "active",
      created: "2026-04-12",
      lastActive: "Yesterday",
    },
    {
      id: "proj-pricing",
      name: "Pricing v2 GTM",
      description: "Pricing redesign go-to-market plan.",
      icon: "grid",
      color: "oklch(0.72 0.13 150)",
      defaultTemplateId: "tpl-launch",
      status: "active",
      created: "2026-04-05",
      lastActive: "2d ago",
    },
    {
      id: "proj-outage",
      name: "P0 Outage Reviews",
      description: "Post-mortem and RCA workstream.",
      icon: "alert",
      color: "oklch(0.68 0.15 25)",
      defaultTemplateId: "tpl-bugfix",
      status: "active",
      created: "2026-03-28",
      lastActive: "1w ago",
    },
  ];

  const sessions = [
    // proj-lighthouse — the currently running session keeps the old name/id pattern
    { id: "sess-lighthouse-01", projectId: "proj-lighthouse", name: "Lighthouse — PRD to Tech Design", status: "running", agents: 6, turns: 14, duration: "12m", when: "Now",       createdBy: "Lin Chen" },
    { id: "sess-lighthouse-02", projectId: "proj-lighthouse", name: "Mobile auth refactor review",     status: "idle",    agents: 4, turns: 11, duration: "41m", when: "2d ago",   createdBy: "Lin Chen" },

    // proj-ai-report
    { id: "sess-ai-01", projectId: "proj-ai-report", name: "Q1 earnings report draft", status: "idle",     agents: 3, turns: 9, duration: "28m", when: "Yesterday", createdBy: "Lin Chen" },
    { id: "sess-ai-02", projectId: "proj-ai-report", name: "Weekly status digest",     status: "archived", agents: 3, turns: 7, duration: "21m", when: "1w ago",    createdBy: "Lin Chen" },

    // proj-pricing
    { id: "sess-pricing-01", projectId: "proj-pricing", name: "Pricing v2 — GTM Launch plan", status: "idle",     agents: 4, turns: 22, duration: "1h 04m", when: "Yesterday", createdBy: "Lin Chen" },
    { id: "sess-pricing-02", projectId: "proj-pricing", name: "Competitor matrix Q2",         status: "idle",     agents: 5, turns: 18, duration: "52m",    when: "3d ago",    createdBy: "Lin Chen" },
    { id: "sess-pricing-03", projectId: "proj-pricing", name: "Checkout perf audit",          status: "idle",     agents: 4, turns: 16, duration: "36m",    when: "1w ago",    createdBy: "Lin Chen" },

    // proj-outage
    { id: "sess-outage-01", projectId: "proj-outage", name: "P0 Outage — RCA draft", status: "idle",     agents: 3, turns: 9, duration: "28m", when: "Yesterday", createdBy: "Lin Chen" },
    { id: "sess-outage-02", projectId: "proj-outage", name: "Data model — Billing v3", status: "archived", agents: 3, turns: 4, duration: "8m",  when: "5d ago",    createdBy: "Lin Chen" },
  ];

  return { agents, skills, knowledge, templates, projects, sessions, conversation, tasks, edges, nodePos, topologies, agentThreads, approvals, history };
})();
