import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openDatabase } from "../src/db/connection.js";
import { Repository } from "../src/db/repository.js";
import { EventBus } from "../src/runtime/eventBus.js";
import { Scheduler } from "../src/runtime/scheduler.js";
import { WorkspaceManager } from "../src/runtime/workspace.js";

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-team-scheduler-"));
  const db = openDatabase(path.join(dir, "atelier.db"));
  const repo = new Repository(db);
  const workspace = new WorkspaceManager(path.join(dir, "workspaces"));
  return { dir, db, repo, workspace };
}

test("scheduler waits for dependencies before starting downstream tasks", async () => {
  const { db, repo, workspace } = await fixture();
  const starts = [];
  const runner = {
    async run({ prompt, onEvent }) {
      const taskId = prompt.includes("first") ? "task_1" : "task_2";
      starts.push(taskId);
      onEvent({ type: "response.output_text.delta", delta: taskId, raw: { delta: taskId } });
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { text: `done ${taskId}`, codexSessionId: `codex_${taskId}` };
    },
  };
  const scheduler = new Scheduler({ repo, workspace, runner, bus: new EventBus(), maxWorkers: 2 });
  const run = repo.createRun({ sessionId: "sess_test", goal: "test", model: "gpt-5.5" });
  const tasks = [
    {
      id: "task_1",
      runId: run.id,
      sessionId: "sess_test",
      agentId: "codex-default",
      title: "first",
      prompt: "first",
      dependsOn: [],
      readPaths: [],
      writePaths: ["a.md"],
      acceptanceCriteria: [],
      expectedArtifacts: [],
      status: "ready",
    },
    {
      id: "task_2",
      runId: run.id,
      sessionId: "sess_test",
      agentId: "codex-default",
      title: "second",
      prompt: "second",
      dependsOn: ["task_1"],
      readPaths: ["a.md"],
      writePaths: ["b.md"],
      acceptanceCriteria: [],
      expectedArtifacts: [],
      status: "ready",
    },
  ];
  tasks.forEach((task) => repo.upsertRunTask(task));
  const result = await scheduler.run({ run, tasks });
  assert.equal(result.status, "completed");
  assert.deepEqual(starts, ["task_1", "task_2"]);
  const persisted = repo.listRunTasks(run.id);
  assert.deepEqual(persisted.map((task) => task.status), ["done", "done"]);
  const board = JSON.parse(await fs.readFile(path.join(workspace.paths("sess_test").meta, "board.json"), "utf8"));
  assert.equal(board.tasks.length, 2);
  db.close();
});
