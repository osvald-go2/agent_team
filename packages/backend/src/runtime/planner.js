import { nanoid } from "nanoid";
import { config } from "../config.js";

function extractJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {}
  }
  return null;
}

function normalizeTask(raw, index, sessionId, runId) {
  return {
    id: raw.id || `task_${nanoid(8)}`,
    runId,
    sessionId,
    title: raw.title || `Task ${index + 1}`,
    agentId: raw.agentId || raw.agent || config.defaultAgentId,
    prompt: raw.prompt || raw.title || "Complete this task.",
    dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn : [],
    readPaths: Array.isArray(raw.readPaths) ? raw.readPaths : [],
    writePaths: Array.isArray(raw.writePaths) ? raw.writePaths : [],
    acceptanceCriteria: Array.isArray(raw.acceptanceCriteria) ? raw.acceptanceCriteria : [],
    expectedArtifacts: Array.isArray(raw.expectedArtifacts) ? raw.expectedArtifacts : [],
    status: "ready",
  };
}

export class Planner {
  constructor({ runner, repo, workspace, bus }) {
    this.runner = runner;
    this.repo = repo;
    this.workspace = workspace;
    this.bus = bus;
  }

  async plan({ run, goal }) {
    const bootstrap = this.repo.bootstrap();
    const prompt = [
      "You are the AgentTeam planner.",
      "Design a minimal executable multi-agent task graph for the user's goal.",
      "Return only JSON for .agent-team/team_plan.json with this shape:",
      '{"tasks":[{"id":"task_id","title":"...","agentId":"codex-default","prompt":"...","dependsOn":[],"readPaths":[],"writePaths":[],"acceptanceCriteria":[],"expectedArtifacts":[]}]}',
      "",
      `Default agent: ${config.defaultAgentId}; model: ${run.model}`,
      `Available agents: ${JSON.stringify((bootstrap.entities.agents || []).map((a) => ({ id: a.id, role: a.role, model: a.model, provider: a.provider })))}`,
      `Templates: ${JSON.stringify((bootstrap.entities.templates || []).map((t) => ({ id: t.id, name: t.name, desc: t.desc })))}`,
      "",
      `User goal:\n${goal}`,
    ].join("\n");

    const sessionPaths = await this.workspace.ensureSession(run.sessionId);
    let planText = "";
    const result = await this.runner.run({
      prompt,
      cwd: sessionPaths.workspace,
      model: run.model,
      onEvent: (event) => {
        this.repo.recordEvent({ runId: run.id, sessionId: run.sessionId, type: event.type, payload: { delta: event.delta || "" }, raw: event.raw });
        if (event.delta) planText += event.delta;
        this.bus.publish({ type: "agent.output.delta", sessionId: run.sessionId, runId: run.id, delta: event.delta || "", rawType: event.type });
      },
    });

    const parsed = extractJson(result.text || planText);
    const tasks = Array.isArray(parsed?.tasks)
      ? parsed.tasks.map((task, index) => normalizeTask(task, index, run.sessionId, run.id))
      : [normalizeTask({ title: "Complete request", prompt: goal, writePaths: ["agent-team-output.md"] }, 0, run.sessionId, run.id)];
    const plan = { protocol: "agent-team.v1", runId: run.id, sessionId: run.sessionId, tasks };
    await this.workspace.writePlan(run.sessionId, plan);
    for (const task of tasks) {
      this.repo.upsertRunTask(task);
      await this.workspace.prepareTask(task);
      this.bus.publish({ type: "task.ready", sessionId: run.sessionId, runId: run.id, taskId: task.id, task });
    }
    return plan;
  }
}
