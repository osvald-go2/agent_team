import { spawn } from "node:child_process";
import readline from "node:readline";
import { config } from "../config.js";

function extractContentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (typeof part?.text === "string") return part.text;
    if (typeof part?.content === "string") return part.content;
    return "";
  }).join("");
}

function extractFinalMessageText(event) {
  const item = event?.item;
  if (!item || !["agent_message", "message"].includes(item.type)) return "";
  if (typeof item.text === "string") return item.text;
  return extractContentText(item.content);
}

function extractDeltaText(event) {
  if (!event || typeof event !== "object") return "";
  if (typeof event.delta === "string") return event.delta;
  if (typeof event.text === "string") return event.text;
  if (typeof event.content === "string") return event.content;
  if (typeof event.message === "string") return event.message;
  if (typeof event.output === "string") return event.output;
  if (event.type === "agent_message" && typeof event.message?.content === "string") return event.message.content;
  if (event.type === "response.output_text.delta" && typeof event.delta === "string") return event.delta;
  const messageContent = extractContentText(event.message?.content);
  if (messageContent) return messageContent;
  return "";
}

function extractCodexSessionId(event) {
  return event?.thread_id || event?.threadId || event?.session_id || event?.sessionId || event?.conversation_id || event?.conversationId || null;
}

export class CodexRunner {
  constructor({ bin = config.codexBin, model = config.defaultModel } = {}) {
    this.bin = bin;
    this.model = model;
  }

  async run({ prompt, cwd, model = this.model, resumeSessionId = null, onEvent = () => {} }) {
    if (process.env.AGENTTEAM_FAKE_CODEX === "1") {
      return this.fakeRun({ prompt, onEvent });
    }

    const args = resumeSessionId
      ? ["exec", "resume", "--ignore-rules", "--json", "-m", model, "--skip-git-repo-check", resumeSessionId, "-"]
      : ["-m", model, "-s", "workspace-write", "-a", "never", "exec", "--ignore-rules", "--json", "-C", cwd, "--skip-git-repo-check", "-"];
    const child = spawn(this.bin, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let streamedText = "";
    let finalMessageText = "";
    let codexSessionId = null;
    let structuredError = "";
    let stderr = "";
    const exitPromise = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });

    child.stdin.end(prompt);

    const stdoutDone = new Promise((resolve) => {
      const rl = readline.createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let event;
        try {
          event = JSON.parse(trimmed);
        } catch {
          event = { type: "stdout.line", text: trimmed };
        }
        codexSessionId = extractCodexSessionId(event) || codexSessionId;
        if (event.type === "error") structuredError = event.error?.message || event.message || JSON.stringify(event.error || event);
        if (event.type === "turn.failed") structuredError = event.error?.message || structuredError;
        const finalText = extractFinalMessageText(event);
        if (finalText) finalMessageText = finalMessageText ? `${finalMessageText}\n${finalText}` : finalText;
        const delta = finalText && streamedText ? "" : (finalText || extractDeltaText(event));
        if (delta) streamedText += delta;
        onEvent({ type: event.type || "codex.event", delta, raw: event });
      });
      rl.on("close", resolve);
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      onEvent({ type: "codex.stderr", raw: { stderr: chunk.toString() } });
    });

    const exitCode = await exitPromise;
    await stdoutDone;
    if (exitCode !== 0) {
      const fallback = stderr ? stderr.trim().slice(0, 1000) : `codex exited with code ${exitCode}`;
      const error = new Error(structuredError || fallback);
      error.exitCode = exitCode;
      throw error;
    }
    return { text: (finalMessageText || streamedText).trim(), codexSessionId };
  }

  async fakeRun({ prompt, onEvent }) {
    const isPlanner = prompt.includes("team_plan.json");
    const text = isPlanner
      ? JSON.stringify({
          tasks: [
            {
              id: "task_plan_1",
              title: "Analyze request",
              agentId: config.defaultAgentId,
              prompt: "Analyze the request and write a concise execution note.",
              dependsOn: [],
              readPaths: [],
              writePaths: ["notes/analysis.md"],
              acceptanceCriteria: ["Output explains the requested goal."],
              expectedArtifacts: ["notes/analysis.md"],
            },
            {
              id: "task_plan_2",
              title: "Summarize result",
              agentId: config.defaultAgentId,
              prompt: "Read previous artifacts and summarize the result.",
              dependsOn: ["task_plan_1"],
              readPaths: ["notes/analysis.md"],
              writePaths: ["notes/summary.md"],
              acceptanceCriteria: ["Output includes next steps."],
              expectedArtifacts: ["notes/summary.md"],
            },
          ],
        })
      : `Codex fake response for: ${prompt.slice(0, 180)}`;
    onEvent({ type: "session.started", raw: { session_id: `fake_${Date.now()}` } });
    for (const chunk of text.match(/.{1,80}/g) || []) {
      onEvent({ type: "response.output_text.delta", delta: chunk, raw: { delta: chunk } });
    }
    return { text, codexSessionId: `fake_${Date.now()}` };
  }
}
