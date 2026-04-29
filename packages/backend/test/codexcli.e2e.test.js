import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import WebSocket from "ws";

const BACKEND_ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function request(baseUrl, route, options = {}) {
  const res = await fetch(`${baseUrl}${route}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function writeFakeCodexBin(dir) {
  const binPath = path.join(dir, "fake-codex.mjs");
  await fs.writeFile(
    binPath,
    `#!/usr/bin/env node
import fs from "node:fs";

const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const prompt = Buffer.concat(chunks).toString("utf8");
  console.error("2026-04-28T00:00:00.000000Z WARN codex_features: unknown feature key in config: skills");
  fs.appendFileSync(process.env.FAKE_CODEX_CALLS_PATH, JSON.stringify({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    prompt,
  }) + "\\n");

  console.log(JSON.stringify({ type: "session.started", session_id: "codex_cli_" + process.pid + "_" + Date.now() }));

  if (prompt.includes("team_plan.json")) {
    console.log(JSON.stringify({
      type: "response.output_text.delta",
      delta: JSON.stringify({
        tasks: [{
          id: "task_codexcli_e2e",
          title: "Verify Codex CLI worker path",
          agentId: "codex-default",
          prompt: "Write a status note for the Codex CLI E2E run.",
          dependsOn: [],
          readPaths: [],
          writePaths: ["notes/e2e.md"],
          acceptanceCriteria: ["Output confirms the Codex CLI path."],
          expectedArtifacts: ["notes/e2e.md"]
        }]
      })
    }));
    return;
  }

  const text = prompt.includes("AgentTeam worker")
    ? "Worker completed through Codex CLI."
    : "CLI reply: " + prompt;
  for (const delta of text.match(/.{1,32}/g) || []) {
    console.log(JSON.stringify({ type: "response.output_text.delta", delta }));
  }
});
`,
    "utf8",
  );
  await fs.chmod(binPath, 0o755);
  return binPath;
}

async function waitForServer(baseUrl, child, logs) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early\nstdout:\n${logs.stdout}\nstderr:\n${logs.stderr}`);
    }
    try {
      const health = await request(baseUrl, "/health");
      return health;
    } catch {
      await delay(50);
    }
  }
  throw new Error(`server did not become healthy\nstdout:\n${logs.stdout}\nstderr:\n${logs.stderr}`);
}

async function startBackend(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-team-codexcli-e2e-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dbPath = path.join(dir, "atelier.db");
  const workspaceRoot = path.join(dir, "workspaces");
  const callsPath = path.join(dir, "codex-calls.ndjson");
  const codexBin = await writeFakeCodexBin(dir);
  const logs = { stdout: "", stderr: "" };
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: BACKEND_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
      WORKSPACE_ROOT: workspaceRoot,
      CODEX_BIN: codexBin,
      FAKE_CODEX_CALLS_PATH: callsPath,
      AGENTTEAM_FAKE_CODEX: "0",
      DEFAULT_MODEL: "gpt-5.5",
      FORCE_COLOR: "0",
    },
  });
  child.stdout.on("data", (chunk) => { logs.stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs.stderr += chunk.toString(); });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([once(child, "exit"), delay(2000)]);
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  const health = await waitForServer(baseUrl, child, logs);
  return { baseUrl, dbPath, workspaceRoot, callsPath, health };
}

function collectWs(ws) {
  const events = [];
  const waiters = new Set();

  ws.on("message", (raw) => {
    const event = JSON.parse(raw.toString());
    events.push(event);
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(event)) continue;
      clearTimeout(waiter.timer);
      waiters.delete(waiter);
      waiter.resolve(event);
    }
  });
  ws.on("error", (error) => {
    for (const waiter of waiters) waiter.reject(error);
    waiters.clear();
  });

  return {
    events,
    waitFor(predicate, timeoutMs = 5000) {
      const existing = events.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`timed out waiting for websocket event; saw ${events.map((event) => event.type).join(", ")}`));
        }, timeoutMs);
        waiters.add(waiter);
      });
    },
  };
}

async function readCodexCalls(callsPath) {
  const text = await fs.readFile(callsPath, "utf8");
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function waitForSqlRows(dbPath, sql, params = [], timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const rows = db.prepare(sql).all(...params);
      if (rows.length > 0) return rows;
    } finally {
      db.close();
    }
    await delay(50);
  }
  throw new Error(`timed out waiting for SQL rows: ${sql}`);
}

async function waitForRunCompleted(baseUrl, runId) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const payload = await request(baseUrl, `/api/runs/${encodeURIComponent(runId)}`);
    if (payload.run.status === "failed") throw new Error(`run failed: ${JSON.stringify(payload)}`);
    if (payload.run.status === "completed" && payload.tasks.length > 0 && payload.tasks.every((task) => task.status === "done")) {
      return payload;
    }
    await delay(100);
  }
  throw new Error(`run ${runId} did not complete`);
}

test("codexcli E2E streams CLI chat output and completes a run", async (t) => {
  const backend = await startBackend(t);
  assert.equal(backend.health.provider, "codexcli");
  assert.equal(backend.health.model, "gpt-5.5");

  const bootstrap = await request(backend.baseUrl, "/api/bootstrap");
  assert.equal(bootstrap.runtime.defaultAgent.id, "codex-default");
  assert.equal(bootstrap.runtime.defaultAgent.provider, "codexcli");

  const { session } = await request(backend.baseUrl, "/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      id: "sess_codexcli_e2e",
      projectId: "proj_codexcli_e2e",
      name: "Codex CLI E2E",
    }),
  });

  const ws = new WebSocket(`ws://127.0.0.1:${new URL(backend.baseUrl).port}/ws?sessionId=${encodeURIComponent(session.id)}`);
  const collector = collectWs(ws);
  t.after(() => ws.close());
  await once(ws, "open");
  await collector.waitFor((event) => event.type === "ws.ready" && event.sessionId === session.id);

  const chatPrompt = "Summarize codexcli e2e";
  const sent = await request(backend.baseUrl, `/api/sessions/${encodeURIComponent(session.id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ text: chatPrompt, id: "msg_codexcli_user" }),
  });
  assert.equal(sent.assistantMessage.agent, "codex-default");
  assert.equal(sent.assistantMessage.streaming, true);

  const finalMessage = await collector.waitFor((event) => (
    event.type === "message.created" &&
    event.message?.id === sent.assistantMessage.id &&
    event.message?.streaming === false
  ));
  assert.match(finalMessage.message.text, /CLI reply: Summarize codexcli e2e/);
  assert.doesNotMatch(finalMessage.message.text, /codex_features|WARN/);
  assert.ok(collector.events.some((event) => (
    event.type === "agent.output.delta" &&
    event.messageId === sent.assistantMessage.id &&
    event.delta
  )));
  assert.equal(collector.events.some((event) => (
    event.type === "agent.output.delta" &&
    event.messageId === sent.assistantMessage.id &&
    /codex_features|WARN/.test(event.delta || "")
  )), false);

  const chatCodexRows = await waitForSqlRows(
    backend.dbPath,
    "SELECT * FROM codex_sessions WHERE session_id = ? AND task_id IS NULL",
    [session.id],
  );
  assert.equal(chatCodexRows[0].agent_id, "codex-default");
  assert.equal(chatCodexRows[0].model, "gpt-5.5");
  assert.match(chatCodexRows[0].codex_session_id, /^codex_cli_/);
  const firstCodexSessionId = chatCodexRows[0].codex_session_id;

  const followupPrompt = "Continue with remembered context";
  const followup = await request(backend.baseUrl, `/api/sessions/${encodeURIComponent(session.id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ text: followupPrompt, id: "msg_codexcli_user_2", model: "gpt-5" }),
  });
  const followupFinal = await collector.waitFor((event) => (
    event.type === "message.created" &&
    event.message?.id === followup.assistantMessage.id &&
    event.message?.streaming === false
  ));
  assert.match(followupFinal.message.text, /CLI reply: Continue with remembered context/);
  assert.equal(followupFinal.message.model, "gpt-5");

  const updatedChatCodexRows = await waitForSqlRows(
    backend.dbPath,
    "SELECT * FROM codex_sessions WHERE session_id = ? AND task_id IS NULL AND model = ?",
    [session.id, "gpt-5"],
  );
  assert.equal(updatedChatCodexRows[0].agent_id, "codex-default");
  assert.match(updatedChatCodexRows[0].codex_session_id, /^codex_cli_/);

  const run = await request(backend.baseUrl, `/api/sessions/${encodeURIComponent(session.id)}/runs`, {
    method: "POST",
    body: JSON.stringify({ goal: "Run the Codex CLI E2E worker task." }),
  });
  assert.equal(run.sessionId, session.id);
  assert.equal(run.status, "running");

  const completed = await waitForRunCompleted(backend.baseUrl, run.id);
  assert.equal(completed.run.status, "completed");
  assert.deepEqual(completed.tasks.map((task) => task.id), ["task_codexcli_e2e"]);
  assert.equal(completed.tasks[0].agentId, "codex-default");

  const sessionMeta = path.join(backend.workspaceRoot, session.id, ".agent-team");
  const plan = JSON.parse(await fs.readFile(path.join(sessionMeta, "team_plan.json"), "utf8"));
  assert.equal(plan.tasks[0].id, "task_codexcli_e2e");
  const output = JSON.parse(await fs.readFile(path.join(sessionMeta, "tasks", "task_codexcli_e2e", "output.json"), "utf8"));
  assert.equal(output.text, "Worker completed through Codex CLI.");

  const taskCodexRows = await waitForSqlRows(
    backend.dbPath,
    "SELECT * FROM codex_sessions WHERE session_id = ? AND task_id = ?",
    [session.id, "task_codexcli_e2e"],
  );
  assert.equal(taskCodexRows[0].agent_id, "codex-default");
  assert.match(taskCodexRows[0].codex_session_id, /^codex_cli_/);

  const calls = await readCodexCalls(backend.callsPath);
  const workspace = path.join(backend.workspaceRoot, session.id, "workspace");
  const realWorkspace = await fs.realpath(workspace);
  const chatCall = calls.find((call) => call.prompt === chatPrompt);
  const followupCall = calls.find((call) => call.prompt === followupPrompt);
  const plannerCall = calls.find((call) => call.prompt.includes("team_plan.json"));
  const workerCall = calls.find((call) => call.prompt.includes("AgentTeam worker codex-default"));

  assert.ok(chatCall, "chat prompt should be sent to the Codex CLI subprocess");
  assert.ok(followupCall, "follow-up prompt should resume the existing Codex CLI session");
  assert.ok(plannerCall, "run planner prompt should be sent to the Codex CLI subprocess");
  assert.ok(workerCall, "worker prompt should be sent to the Codex CLI subprocess");
  for (const call of [chatCall, plannerCall, workerCall]) {
    assert.equal(call.cwd, realWorkspace);
    assert.ok(call.argv.includes("exec"));
    assert.ok(call.argv.includes("--ignore-rules"));
    assert.ok(call.argv.includes("--json"));
    assert.equal(call.argv.at(-1), "-");
    const cwdFlagIndex = call.argv.indexOf("-C");
    assert.notEqual(cwdFlagIndex, -1);
    assert.equal(await fs.realpath(call.argv[cwdFlagIndex + 1]), realWorkspace);
  }
  assert.equal(followupCall.cwd, realWorkspace);
  assert.deepEqual(followupCall.argv, [
    "exec",
    "resume",
    "--ignore-rules",
    "--json",
    "-m",
    "gpt-5",
    "--skip-git-repo-check",
    firstCodexSessionId,
    "-",
  ]);
});
