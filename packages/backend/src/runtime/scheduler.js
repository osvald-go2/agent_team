import path from "node:path";
import { envelope, writeJsonAtomic } from "./jsonStore.js";

export class Scheduler {
  constructor({ repo, workspace, runner, bus, maxWorkers }) {
    this.repo = repo;
    this.workspace = workspace;
    this.runner = runner;
    this.bus = bus;
    this.maxWorkers = maxWorkers;
    this.eventSeq = 0;
  }

  async run({ run, tasks }) {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const done = new Set();
    const failed = new Set();
    const running = new Set();

    await this.syncBoard(run.sessionId, run.id, tasks);

    return new Promise((resolve) => {
      const pump = () => {
        if (done.size + failed.size === tasks.length) {
          const status = failed.size ? "failed" : "completed";
          this.repo.updateRun(run.id, status);
          this.bus.publish({ type: `run.${status}`, sessionId: run.sessionId, runId: run.id });
          resolve({ status, done: [...done], failed: [...failed] });
          return;
        }

        for (const task of tasks) {
          if (running.size >= this.maxWorkers) break;
          if (done.has(task.id) || failed.has(task.id) || running.has(task.id)) continue;
          const dependencies = task.dependsOn || [];
          if (dependencies.some((id) => failed.has(id))) {
            failed.add(task.id);
            this.markTask({ ...task, status: "failed", error: "Dependency failed" });
            continue;
          }
          if (!dependencies.every((id) => done.has(id))) continue;
          const lock = this.repo.acquireLocks({ runId: run.id, taskId: task.id, agentId: task.agentId, paths: task.writePaths });
          if (!lock.ok) {
            this.markTask({ ...task, status: "blocked", error: `Waiting for ${lock.blockedBy.map((x) => x.path).join(", ")}` });
            continue;
          }
          running.add(task.id);
          this.runTask({ run, task: byId.get(task.id) })
            .then(() => done.add(task.id))
            .catch((error) => {
              failed.add(task.id);
              this.markTask({ ...task, status: "failed", error: error.message });
            })
            .finally(() => {
              running.delete(task.id);
              this.repo.releaseTaskLocks(task.id);
              this.syncBoard(run.sessionId, run.id, tasks).finally(pump);
            });
        }

        if (running.size === 0 && done.size + failed.size < tasks.length) {
          const blocked = tasks.filter((task) => !done.has(task.id) && !failed.has(task.id));
          for (const task of blocked) this.markTask({ ...task, status: "blocked", error: "Waiting for dependencies or file locks" });
          setTimeout(pump, 500);
        }
      };
      pump();
    });
  }

  async runTask({ run, task }) {
    await this.markTask({ ...task, status: "running", startedAt: Date.now(), error: null });
    const msg = envelope({
      runId: run.id,
      taskId: task.id,
      from: "scheduler",
      to: `agent:${task.agentId}`,
      kind: "task.ready",
      body: { title: task.title, prompt: task.prompt, readPaths: task.readPaths, writePaths: task.writePaths },
    });
    await this.workspace.writeMailbox(run.sessionId, msg);
    await this.workspace.writeEvent(run.sessionId, ++this.eventSeq, msg);

    const p = await this.workspace.ensureSession(run.sessionId);
    const prompt = this.workerPrompt({ task, metaDir: p.meta });
    let outputText = "";
    const result = await this.runner.run({
      prompt,
      cwd: p.workspace,
      model: run.model,
      onEvent: (event) => {
        this.repo.recordEvent({ runId: run.id, taskId: task.id, sessionId: run.sessionId, type: event.type, payload: { delta: event.delta || "" }, raw: event.raw });
        if (event.delta) outputText += event.delta;
        this.bus.publish({ type: "agent.output.delta", sessionId: run.sessionId, runId: run.id, taskId: task.id, agentId: task.agentId, delta: event.delta || "", rawType: event.type });
      },
    });
    const output = {
      taskId: task.id,
      agentId: task.agentId,
      text: result.text || outputText,
      completedAt: new Date().toISOString(),
      expectedArtifacts: task.expectedArtifacts || [],
    };
    await this.workspace.writeTaskOutput(task, output);
    await this.markTask({ ...task, status: "done", output, completedAt: Date.now(), error: null });
    this.repo.saveCodexSession({ sessionId: run.sessionId, agentId: task.agentId, taskId: task.id, codexSessionId: result.codexSessionId, model: run.model });
    return output;
  }

  workerPrompt({ task, metaDir }) {
    return [
      `You are AgentTeam worker ${task.agentId}.`,
      "Use the shared workspace as your working directory.",
      `Your task metadata is in ${path.join(metaDir, "tasks", task.id)}.`,
      "Write only files covered by writePaths unless a clearly necessary support file is inside the same directory.",
      "When done, summarize work and artifacts. The scheduler will persist your final stdout into output.json.",
      "",
      `Title: ${task.title}`,
      `Prompt:\n${task.prompt}`,
      `Dependencies: ${(task.dependsOn || []).join(", ") || "none"}`,
      `Read paths: ${(task.readPaths || []).join(", ") || "none"}`,
      `Write paths: ${(task.writePaths || []).join(", ") || "none"}`,
      `Acceptance criteria:\n${(task.acceptanceCriteria || []).map((x) => `- ${x}`).join("\n") || "- Complete the task."}`,
      `Expected artifacts:\n${(task.expectedArtifacts || []).map((x) => `- ${x}`).join("\n") || "- A concise final answer."}`,
    ].join("\n");
  }

  async markTask(task) {
    this.repo.upsertRunTask(task);
    await this.workspace.writeTaskStatus(task);
    this.bus.publish({
      type: task.status === "done" ? "task.done" : task.status === "failed" ? "task.failed" : task.status === "blocked" ? "task.blocked" : "task.running",
      sessionId: task.sessionId,
      runId: task.runId,
      taskId: task.id,
      task,
    });
  }

  async syncBoard(sessionId, runId, tasks) {
    const current = this.repo.listRunTasks(runId);
    await this.workspace.writeBoard(sessionId, { protocol: "agent-team.v1", runId, tasks: current });
    await this.workspace.writeLocks(sessionId, this.repo.listLocksForRun(runId));
  }
}
