import path from "node:path";
import { config } from "../config.js";
import { ensureDir, writeJsonAtomic } from "./jsonStore.js";

export class WorkspaceManager {
  constructor(root = config.workspaceRoot) {
    this.root = root;
  }

  paths(sessionId) {
    const sessionRoot = path.join(this.root, sessionId);
    const workspace = path.join(sessionRoot, "workspace");
    const meta = path.join(sessionRoot, ".agent-team");
    return {
      sessionRoot,
      workspace,
      meta,
      agents: path.join(meta, "agents"),
      tasks: path.join(meta, "tasks"),
      mailbox: path.join(meta, "mailbox"),
      events: path.join(meta, "events"),
    };
  }

  async ensureSession(sessionId) {
    const p = this.paths(sessionId);
    await Promise.all([
      ensureDir(p.workspace),
      ensureDir(p.agents),
      ensureDir(p.tasks),
      ensureDir(p.mailbox),
      ensureDir(p.events),
    ]);
    return p;
  }

  async writeRun(sessionId, run) {
    const p = await this.ensureSession(sessionId);
    await writeJsonAtomic(path.join(p.meta, "run.json"), run);
  }

  async writePlan(sessionId, plan) {
    const p = await this.ensureSession(sessionId);
    await writeJsonAtomic(path.join(p.meta, "team_plan.json"), plan);
  }

  async writeBoard(sessionId, board) {
    const p = await this.ensureSession(sessionId);
    await writeJsonAtomic(path.join(p.meta, "board.json"), board);
  }

  async writeLocks(sessionId, locks) {
    const p = await this.ensureSession(sessionId);
    await writeJsonAtomic(path.join(p.meta, "locks.json"), locks);
  }

  async writeMailbox(sessionId, message) {
    const p = await this.ensureSession(sessionId);
    await writeJsonAtomic(path.join(p.mailbox, `${message.id}.json`), message);
  }

  async writeEvent(sessionId, sequence, event) {
    const p = await this.ensureSession(sessionId);
    const seq = String(sequence).padStart(6, "0");
    await writeJsonAtomic(path.join(p.events, `${seq}.json`), event);
  }

  async prepareTask(task) {
    const p = await this.ensureSession(task.sessionId);
    const dir = path.join(p.tasks, task.id);
    await ensureDir(path.join(dir, "artifacts"));
    await writeJsonAtomic(path.join(dir, "task.json"), task);
    await writeJsonAtomic(path.join(dir, "status.json"), { taskId: task.id, status: task.status || "ready" });
    await writeJsonAtomic(path.join(dir, "input.json"), {
      prompt: task.prompt,
      dependsOn: task.dependsOn || [],
      readPaths: task.readPaths || [],
      writePaths: task.writePaths || [],
      acceptanceCriteria: task.acceptanceCriteria || [],
      expectedArtifacts: task.expectedArtifacts || [],
    });
    return { dir, artifacts: path.join(dir, "artifacts") };
  }

  async writeTaskStatus(task) {
    const p = await this.ensureSession(task.sessionId);
    await writeJsonAtomic(path.join(p.tasks, task.id, "status.json"), {
      taskId: task.id,
      status: task.status,
      error: task.error || null,
      updatedAt: new Date().toISOString(),
    });
  }

  async writeTaskOutput(task, output) {
    const p = await this.ensureSession(task.sessionId);
    await writeJsonAtomic(path.join(p.tasks, task.id, "output.json"), output);
  }
}
