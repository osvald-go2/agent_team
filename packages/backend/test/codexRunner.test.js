import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CodexRunner } from "../src/runtime/codexRunner.js";

async function writeBin(dir, source) {
  const binPath = path.join(dir, "fake-codex.mjs");
  await fs.writeFile(binPath, `#!/usr/bin/env node\n${source}`, "utf8");
  await fs.chmod(binPath, 0o755);
  return binPath;
}

test("CodexRunner keeps stderr warnings out of output deltas and throws concise structured errors", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-team-codex-runner-"));
  try {
    const bin = await writeBin(dir, `
console.error("WARN codex_features: unknown feature key in config: skills");
console.log(JSON.stringify({
  type: "error",
  error: { type: "invalid_request_error", message: "The selected model requires a newer Codex CLI." }
}));
process.exit(1);
`);
    const runner = new CodexRunner({ bin, model: "gpt-test" });
    const events = [];
    await assert.rejects(
      runner.run({ prompt: "hi", cwd: dir, onEvent: (event) => events.push(event) }),
      /The selected model requires a newer Codex CLI\./,
    );

    const stderrEvent = events.find((event) => event.type === "codex.stderr");
    assert.ok(stderrEvent);
    assert.equal(stderrEvent.delta, undefined);
    assert.match(stderrEvent.raw.stderr, /WARN codex_features/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("CodexRunner reads final agent text from item.completed events", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-team-codex-runner-"));
  try {
    const bin = await writeBin(dir, `
console.log(JSON.stringify({ type: "thread.started", thread_id: "codex-test-thread" }));
console.log(JSON.stringify({
  type: "item.completed",
  item: { id: "item_0", type: "agent_message", text: "Hi. What do you want to work on?" }
}));
console.log(JSON.stringify({ type: "turn.completed" }));
`);
    const runner = new CodexRunner({ bin, model: "gpt-test" });
    const events = [];
    const result = await runner.run({ prompt: "hi", cwd: dir, onEvent: (event) => events.push(event) });

    assert.equal(result.text, "Hi. What do you want to work on?");
    assert.equal(result.codexSessionId, "codex-test-thread");
    assert.ok(events.some((event) => (
      event.type === "item.completed" &&
      event.delta === "Hi. What do you want to work on?"
    )));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("CodexRunner resumes prior sessions with the selected model", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-team-codex-runner-"));
  try {
    const callsPath = path.join(dir, "calls.ndjson");
    const bin = await writeBin(dir, `
import fs from "node:fs";
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({
    argv: process.argv.slice(2),
    prompt: Buffer.concat(chunks).toString("utf8")
  }) + "\\n");
  console.log(JSON.stringify({ type: "session.started", session_id: "codex-test-thread-2" }));
  console.log(JSON.stringify({ type: "response.output_text.delta", delta: "resumed ok" }));
});
`);
    const runner = new CodexRunner({ bin, model: "gpt-test" });
    const result = await runner.run({
      prompt: "continue",
      cwd: dir,
      model: "gpt-5",
      resumeSessionId: "codex-test-thread-1",
    });
    const [call] = (await fs.readFile(callsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));

    assert.equal(result.text, "resumed ok");
    assert.deepEqual(call.argv, [
      "exec",
      "resume",
      "--ignore-rules",
      "--json",
      "-m",
      "gpt-5",
      "--skip-git-repo-check",
      "codex-test-thread-1",
      "-",
    ]);
    assert.equal(call.prompt, "continue");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
