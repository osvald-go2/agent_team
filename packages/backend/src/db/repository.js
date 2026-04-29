import { nanoid } from "nanoid";
import { config } from "../config.js";
import { normalizeSeedEntities } from "./seed.js";

const now = () => Date.now();
const encode = (value) => JSON.stringify(value ?? null);
const decode = (value) => (value ? JSON.parse(value) : null);

export class Repository {
  constructor(db) {
    this.db = db;
    this.statements = {
      countEntities: db.prepare("SELECT COUNT(*) AS count FROM entity_records"),
      upsertEntity: db.prepare(`
        INSERT INTO entity_records (kind, id, json, created_at, updated_at)
        VALUES (@kind, @id, @json, @createdAt, @updatedAt)
        ON CONFLICT(kind, id) DO UPDATE SET
          json = excluded.json,
          updated_at = excluded.updated_at
      `),
      listEntities: db.prepare("SELECT id, json FROM entity_records WHERE kind = ? ORDER BY created_at ASC"),
      getEntity: db.prepare("SELECT id, json FROM entity_records WHERE kind = ? AND id = ?"),
      deleteEntity: db.prepare("DELETE FROM entity_records WHERE kind = ? AND id = ?"),
      insertRun: db.prepare(`
        INSERT INTO runs (id, session_id, goal, status, model, created_at, updated_at)
        VALUES (@id, @sessionId, @goal, @status, @model, @createdAt, @updatedAt)
      `),
      updateRun: db.prepare(`
        UPDATE runs SET status = @status, updated_at = @updatedAt, completed_at = @completedAt
        WHERE id = @id
      `),
      getRun: db.prepare("SELECT * FROM runs WHERE id = ?"),
      listRunTasks: db.prepare("SELECT * FROM run_tasks WHERE run_id = ? ORDER BY created_at ASC"),
      upsertTask: db.prepare(`
        INSERT INTO run_tasks (
          id, run_id, session_id, agent_id, title, prompt, depends_on_json,
          read_paths_json, write_paths_json, acceptance_criteria_json,
          expected_artifacts_json, status, output_json, error, created_at,
          updated_at, started_at, completed_at
        )
        VALUES (
          @id, @runId, @sessionId, @agentId, @title, @prompt, @dependsOnJson,
          @readPathsJson, @writePathsJson, @acceptanceCriteriaJson,
          @expectedArtifactsJson, @status, @outputJson, @error, @createdAt,
          @updatedAt, @startedAt, @completedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          output_json = excluded.output_json,
          error = excluded.error,
          updated_at = excluded.updated_at,
          started_at = COALESCE(excluded.started_at, run_tasks.started_at),
          completed_at = COALESCE(excluded.completed_at, run_tasks.completed_at)
      `),
      insertRunEvent: db.prepare(`
        INSERT INTO run_events (id, run_id, task_id, session_id, event_type, payload_json, raw_json, created_at)
        VALUES (@id, @runId, @taskId, @sessionId, @eventType, @payloadJson, @rawJson, @createdAt)
      `),
      upsertCodexSession: db.prepare(`
        INSERT INTO codex_sessions (id, session_id, agent_id, task_id, codex_session_id, model, created_at, updated_at)
        VALUES (@id, @sessionId, @agentId, @taskId, @codexSessionId, @model, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          codex_session_id = excluded.codex_session_id,
          model = excluded.model,
          updated_at = excluded.updated_at
      `),
      getCodexSession: db.prepare("SELECT * FROM codex_sessions WHERE id = ?"),
      clearLocksForTask: db.prepare("DELETE FROM file_locks WHERE task_id = ?"),
      getLocks: db.prepare("SELECT * FROM file_locks WHERE path IN (SELECT value FROM json_each(?))"),
      insertLock: db.prepare(`
        INSERT INTO file_locks (path, run_id, task_id, agent_id, created_at)
        VALUES (@path, @runId, @taskId, @agentId, @createdAt)
      `),
      listLocksForRun: db.prepare("SELECT * FROM file_locks WHERE run_id = ? ORDER BY created_at ASC"),
    };
  }

  seedIfEmpty() {
    if (this.statements.countEntities.get().count > 0) return false;
    const seed = normalizeSeedEntities();
    const insertMany = this.db.transaction(() => {
      for (const [kind, records] of Object.entries(seed)) {
        for (const record of records) this.upsertEntity(kind, record.id, record.value);
      }
      this.ensureDefaultCodexAgent();
    });
    insertMany();
    return true;
  }

  ensureDefaultCodexAgent() {
    const existing = this.getEntity("agents", config.defaultAgentId);
    if (existing) return existing;
    const agent = {
      id: config.defaultAgentId,
      name: "Codex CLI",
      icon: "terminal",
      role: "Default",
      desc: "Runs Codex CLI locally for AgentTeam sessions.",
      provider: config.defaultProvider,
      model: config.defaultModel,
      skills: ["codex.exec", "filesystem.shared", "json.protocol"],
      knowledge: [],
      status: "queued",
      progress: 0,
      color: "oklch(0.62 0.14 250)",
    };
    this.upsertEntity("agents", agent.id, agent);
    return agent;
  }

  bootstrap() {
    const result = {};
    const kinds = this.db.prepare("SELECT DISTINCT kind FROM entity_records ORDER BY kind").all();
    for (const { kind } of kinds) result[kind] = this.listEntities(kind);
    return {
      entities: result,
      runtime: {
        defaultAgent: this.ensureDefaultCodexAgent(),
        provider: config.defaultProvider,
        model: config.defaultModel,
        maxWorkers: config.maxWorkers,
      },
    };
  }

  listEntities(kind) {
    const rows = this.statements.listEntities.all(kind);
    if (["modelsByProvider", "nodePos", "topologies", "agentThreads"].includes(kind)) {
      return Object.fromEntries(rows.map((row) => [row.id, decode(row.json)?.value ?? decode(row.json)]));
    }
    if (["providers", "edges", "clarifyQuestions", "guidedAgentScript", "mockReplies"].includes(kind)) {
      return rows.map((row) => decode(row.json));
    }
    return rows.map((row) => decode(row.json));
  }

  getEntity(kind, id) {
    const row = this.statements.getEntity.get(kind, id);
    return row ? decode(row.json) : null;
  }

  upsertEntity(kind, id, value) {
    const at = now();
    this.statements.upsertEntity.run({
      kind,
      id,
      json: encode(value),
      createdAt: at,
      updatedAt: at,
    });
    return value;
  }

  patchEntity(kind, id, patch) {
    const current = this.getEntity(kind, id);
    if (!current) return null;
    const next = { ...current, ...patch, id };
    this.upsertEntity(kind, id, next);
    return next;
  }

  deleteEntity(kind, id) {
    return this.statements.deleteEntity.run(kind, id).changes > 0;
  }

  recoverInterruptedMessages() {
    let recovered = 0;
    for (const message of this.listEntities("conversation")) {
      if (!message?.streaming || message.role === "user") continue;
      const text = message.text || "Previous response was interrupted. Send a new message to continue.";
      this.upsertEntity("conversation", message.id, {
        ...message,
        text,
        streaming: false,
        interrupted: true,
      });
      recovered += 1;
    }
    return recovered;
  }

  createRun({ sessionId, goal, model = config.defaultModel }) {
    const at = now();
    const run = { id: `run_${nanoid(10)}`, sessionId, goal, status: "running", model, createdAt: at, updatedAt: at };
    this.statements.insertRun.run(run);
    return run;
  }

  updateRun(id, status) {
    this.statements.updateRun.run({
      id,
      status,
      updatedAt: now(),
      completedAt: status === "completed" || status === "failed" ? now() : null,
    });
  }

  getRun(id) {
    return this.statements.getRun.get(id);
  }

  listRunTasks(runId) {
    return this.statements.listRunTasks.all(runId).map((task) => ({
      id: task.id,
      runId: task.run_id,
      sessionId: task.session_id,
      agentId: task.agent_id,
      title: task.title,
      prompt: task.prompt,
      dependsOn: decode(task.depends_on_json) || [],
      readPaths: decode(task.read_paths_json) || [],
      writePaths: decode(task.write_paths_json) || [],
      acceptanceCriteria: decode(task.acceptance_criteria_json) || [],
      expectedArtifacts: decode(task.expected_artifacts_json) || [],
      status: task.status,
      output: decode(task.output_json),
      error: task.error,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      startedAt: task.started_at,
      completedAt: task.completed_at,
    }));
  }

  upsertRunTask(task) {
    const at = now();
    const row = {
      id: task.id,
      runId: task.runId,
      sessionId: task.sessionId,
      agentId: task.agentId,
      title: task.title,
      prompt: task.prompt,
      dependsOnJson: encode(task.dependsOn || []),
      readPathsJson: encode(task.readPaths || []),
      writePathsJson: encode(task.writePaths || []),
      acceptanceCriteriaJson: encode(task.acceptanceCriteria || []),
      expectedArtifactsJson: encode(task.expectedArtifacts || []),
      status: task.status || "ready",
      outputJson: task.output ? encode(task.output) : null,
      error: task.error || null,
      createdAt: task.createdAt || at,
      updatedAt: at,
      startedAt: task.startedAt || null,
      completedAt: task.completedAt || null,
    };
    this.statements.upsertTask.run(row);
    return { ...task, updatedAt: at };
  }

  recordEvent(event) {
    const row = {
      id: event.id || `evt_${nanoid(12)}`,
      runId: event.runId || null,
      taskId: event.taskId || null,
      sessionId: event.sessionId || null,
      eventType: event.type || event.eventType,
      payloadJson: encode(event.payload || event),
      rawJson: event.raw ? encode(event.raw) : null,
      createdAt: now(),
    };
    this.statements.insertRunEvent.run(row);
    return row;
  }

  saveCodexSession({ sessionId, agentId, taskId, codexSessionId, model }) {
    if (!codexSessionId) return;
    const at = now();
    this.statements.upsertCodexSession.run({
      id: `${sessionId}:${agentId}:${taskId || "chat"}`,
      sessionId,
      agentId,
      taskId: taskId || null,
      codexSessionId,
      model,
      createdAt: at,
      updatedAt: at,
    });
  }

  getCodexSession({ sessionId, agentId, taskId }) {
    const row = this.statements.getCodexSession.get(`${sessionId}:${agentId}:${taskId || "chat"}`);
    return row ? {
      id: row.id,
      sessionId: row.session_id,
      agentId: row.agent_id,
      taskId: row.task_id,
      codexSessionId: row.codex_session_id,
      model: row.model,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } : null;
  }

  acquireLocks({ runId, taskId, agentId, paths }) {
    const wanted = [...new Set((paths || []).filter(Boolean))];
    if (wanted.length === 0) return { ok: true, blockedBy: [] };
    const existing = this.statements.getLocks.all(encode(wanted));
    if (existing.length > 0) return { ok: false, blockedBy: existing };
    const insert = this.db.transaction(() => {
      for (const path of wanted) this.statements.insertLock.run({ path, runId, taskId, agentId, createdAt: now() });
    });
    insert();
    return { ok: true, blockedBy: [] };
  }

  releaseTaskLocks(taskId) {
    this.statements.clearLocksForTask.run(taskId);
  }

  listLocksForRun(runId) {
    return this.statements.listLocksForRun.all(runId);
  }
}
