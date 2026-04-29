import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openDatabase } from "../src/db/connection.js";
import { Repository } from "../src/db/repository.js";

async function tempDb() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-team-db-"));
  return { dir, db: openDatabase(path.join(dir, "atelier.db")) };
}

test("seedIfEmpty loads blank workspace entities and default Codex agent", async () => {
  const { db } = await tempDb();
  const repo = new Repository(db);
  assert.equal(repo.seedIfEmpty(), true);
  const boot = repo.bootstrap();
  assert.ok(boot.entities.agents.length >= 7);
  assert.deepEqual(boot.entities.projects.map(p => p.name), ["Local workspace"]);
  assert.deepEqual(boot.entities.sessions.map(s => s.name), ["New session"]);
  assert.equal(boot.entities.conversation.length, 1);
  assert.equal(boot.entities.conversation[0].role, "system");
  assert.equal(boot.entities.tasks, undefined);
  assert.equal(boot.entities.approvals, undefined);
  assert.equal(boot.runtime.defaultAgent.id, "codex-default");
  assert.equal(boot.runtime.defaultAgent.model, "gpt-5.5");
  db.close();
});

test("file locks block conflicting write paths until released", async () => {
  const { db } = await tempDb();
  const repo = new Repository(db);
  const first = repo.acquireLocks({ runId: "run_1", taskId: "task_1", agentId: "agent_1", paths: ["notes/out.md"] });
  assert.equal(first.ok, true);
  const second = repo.acquireLocks({ runId: "run_1", taskId: "task_2", agentId: "agent_2", paths: ["notes/out.md"] });
  assert.equal(second.ok, false);
  assert.equal(second.blockedBy[0].task_id, "task_1");
  repo.releaseTaskLocks("task_1");
  const third = repo.acquireLocks({ runId: "run_1", taskId: "task_2", agentId: "agent_2", paths: ["notes/out.md"] });
  assert.equal(third.ok, true);
  db.close();
});

test("saveCodexSession updates the persisted chat session model", async () => {
  const { db } = await tempDb();
  const repo = new Repository(db);
  repo.saveCodexSession({
    sessionId: "sess_model",
    agentId: "codex-default",
    codexSessionId: "codex_first",
    model: "gpt-5.5",
  });
  repo.saveCodexSession({
    sessionId: "sess_model",
    agentId: "codex-default",
    codexSessionId: "codex_second",
    model: "gpt-5",
  });

  const row = repo.getCodexSession({ sessionId: "sess_model", agentId: "codex-default" });
  assert.equal(row.codexSessionId, "codex_second");
  assert.equal(row.model, "gpt-5");
  assert.equal(row.taskId, null);
  db.close();
});
