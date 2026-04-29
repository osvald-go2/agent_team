import express from "express";
import http from "node:http";
import path from "node:path";
import { nanoid } from "nanoid";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { openDatabase } from "./db/connection.js";
import { Repository } from "./db/repository.js";
import { EventBus } from "./runtime/eventBus.js";
import { CodexRunner } from "./runtime/codexRunner.js";
import { Planner } from "./runtime/planner.js";
import { Scheduler } from "./runtime/scheduler.js";
import { WorkspaceManager } from "./runtime/workspace.js";

const db = openDatabase();
const repo = new Repository(db);
repo.seedIfEmpty();
repo.ensureDefaultCodexAgent();
repo.recoverInterruptedMessages();

const bus = new EventBus();
const workspace = new WorkspaceManager();
const runner = new CodexRunner();
const planner = new Planner({ runner, repo, workspace, bus });
const scheduler = new Scheduler({ runner, repo, workspace, bus, maxWorkers: config.maxWorkers });

const app = express();
app.use(express.json({ limit: "2mb" }));

function entityId(kind, item = {}) {
  return item.id || `${kind.slice(0, 4)}_${nanoid(8)}`;
}

function publishEntity(kind, action, record, id = record?.id) {
  bus.publish({ type: "entity.changed", kind, action, id, record, sessionId: record?.sessionId || null });
}

function requestedModel(req) {
  const model = String(req.body?.model || "").trim();
  return model || config.defaultModel;
}

function rememberSessionModel(sessionId, model) {
  const session = repo.getEntity("sessions", sessionId);
  if (!session || session.model === model) return session;
  const next = repo.patchEntity("sessions", sessionId, { model });
  if (next) publishEntity("sessions", "upsert", next);
  return next;
}

function upsertConversation(message) {
  repo.upsertEntity("conversation", message.id, message);
  publishEntity("conversation", "upsert", message);
  bus.publish({ type: "message.created", sessionId: message.sessionId, message });
  return message;
}

function bootstrapPromptFromHistory(sessionId, userMessageId, text) {
  const prior = repo.listEntities("conversation")
    .filter((m) => m?.sessionId === sessionId && m.id !== userMessageId && m.role !== "system" && m.text)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`);
  if (prior.length === 0) return text;
  return [
    "Continue this saved AgentTeam session. The backend did not have a provider resume id, so use this persisted transcript as conversation memory.",
    "Treat facts stated by the user in the transcript as remembered session context.",
    "",
    "<persisted_transcript>",
    prior.join("\n\n"),
    "</persisted_transcript>",
    "",
    `Latest user message:\n${text}`,
  ].join("\n");
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, model: config.defaultModel, provider: config.defaultProvider });
});

app.get("/api/bootstrap", (_req, res) => {
  res.json(repo.bootstrap());
});

app.get("/api/entities/:kind", (req, res) => {
  res.json({ kind: req.params.kind, records: repo.listEntities(req.params.kind) });
});

app.post("/api/entities/:kind", (req, res) => {
  const kind = req.params.kind;
  const record = { ...req.body, id: entityId(kind, req.body) };
  repo.upsertEntity(kind, record.id, record);
  publishEntity(kind, "upsert", record);
  res.status(201).json(record);
});

app.patch("/api/entities/:kind/:id", (req, res) => {
  const record = repo.patchEntity(req.params.kind, req.params.id, req.body);
  if (!record) return res.status(404).json({ error: "not_found" });
  publishEntity(req.params.kind, "upsert", record);
  res.json(record);
});

app.delete("/api/entities/:kind/:id", (req, res) => {
  const removed = repo.deleteEntity(req.params.kind, req.params.id);
  if (!removed) return res.status(404).json({ error: "not_found" });
  publishEntity(req.params.kind, "delete", null, req.params.id);
  res.status(204).end();
});

app.post("/api/sessions", (req, res) => {
  const id = req.body.id || `sess_${nanoid(8)}`;
  const now = "Now";
  const session = {
    id,
    projectId: req.body.projectId || null,
    name: req.body.name || "New session",
    status: "draft",
    agents: 1,
    turns: 0,
    duration: "0m",
    when: now,
    createdBy: req.body.createdBy || "Local user",
  };
  if (req.body.model) session.model = String(req.body.model);
  repo.upsertEntity("sessions", id, session);
  publishEntity("sessions", "upsert", session);
  const message = {
    id: `msg_${nanoid(10)}`,
    sessionId: id,
    role: "system",
    text: "Team ready — describe what you want to work on.",
  };
  upsertConversation(message);
  workspace.ensureSession(id).catch((error) => console.error(error));
  res.status(201).json({ session, message });
});

app.post("/api/sessions/:sessionId/messages", (req, res) => {
  const sessionId = req.params.sessionId;
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "text_required" });
  const model = requestedModel(req);
  rememberSessionModel(sessionId, model);
  const userMessage = upsertConversation({
    id: req.body.id || `msg_${nanoid(10)}`,
    sessionId,
    role: "user",
    text,
    model,
  });
  const assistantMessage = upsertConversation({
    id: `msg_${nanoid(10)}`,
    sessionId,
    role: "agent",
    agent: config.defaultAgentId,
    text: "",
    streaming: true,
    model,
  });

  runChatTurn({ sessionId, text, userMessageId: userMessage.id, assistantMessageId: assistantMessage.id, model }).catch((error) => {
    const failed = { ...assistantMessage, text: error.message, streaming: false };
    upsertConversation(failed);
  });

  res.status(202).json({ userMessage, assistantMessage });
});

app.post("/api/sessions/:sessionId/runs", (req, res) => {
  const sessionId = req.params.sessionId;
  const goal = String(req.body.goal || req.body.text || "").trim();
  if (!goal) return res.status(400).json({ error: "goal_required" });
  const model = requestedModel(req);
  rememberSessionModel(sessionId, model);
  const run = repo.createRun({ sessionId, goal, model });
  bus.publish({ type: "run.started", sessionId, runId: run.id, run });
  workspace.writeRun(sessionId, run).catch((error) => console.error(error));
  executeRun({ run, goal }).catch((error) => {
    repo.recordEvent({ runId: run.id, sessionId, type: "run.error", payload: { error: error.message } });
    repo.updateRun(run.id, "failed");
    bus.publish({ type: "run.failed", sessionId, runId: run.id, error: error.message });
  });
  res.status(202).json(run);
});

app.get("/api/runs/:runId", (req, res) => {
  const run = repo.getRun(req.params.runId);
  if (!run) return res.status(404).json({ error: "not_found" });
  res.json({ run, tasks: repo.listRunTasks(req.params.runId), locks: repo.listLocksForRun(req.params.runId) });
});

async function runChatTurn({ sessionId, text, userMessageId, assistantMessageId, model }) {
  const p = await workspace.ensureSession(sessionId);
  const previous = repo.getCodexSession({ sessionId, agentId: config.defaultAgentId });
  const prompt = previous?.codexSessionId ? text : bootstrapPromptFromHistory(sessionId, userMessageId, text);
  let accumulated = "";
  const result = await runner.run({
    prompt,
    cwd: p.workspace,
    model,
    resumeSessionId: previous?.codexSessionId || null,
    onEvent: (event) => {
      repo.recordEvent({ sessionId, type: event.type, payload: { delta: event.delta || "" }, raw: event.raw });
      if (!event.delta) return;
      accumulated += event.delta;
      bus.publish({ type: "agent.output.delta", sessionId, messageId: assistantMessageId, agentId: config.defaultAgentId, delta: event.delta, rawType: event.type });
    },
  });
  const message = {
    id: assistantMessageId,
    sessionId,
    role: "agent",
    agent: config.defaultAgentId,
    text: result.text || accumulated,
    streaming: false,
    model,
  };
  upsertConversation(message);
  repo.saveCodexSession({ sessionId, agentId: config.defaultAgentId, codexSessionId: result.codexSessionId, model });
}

async function executeRun({ run, goal }) {
  const plan = await planner.plan({ run, goal });
  await workspace.writeRun(run.sessionId, { ...run, planTaskCount: plan.tasks.length });
  await scheduler.run({ run, tasks: plan.tasks });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");
  bus.add(ws, sessionId);
  ws.send(JSON.stringify({ type: "ws.ready", sessionId, createdAt: new Date().toISOString() }));
});

app.use(express.static(config.repoRoot, { index: "index.html" }));
app.get("*", (_req, res) => {
  res.sendFile(path.join(config.repoRoot, "index.html"));
});

server.listen(config.port, () => {
  console.log(`AgentTeam backend listening on http://localhost:${config.port}`);
});
