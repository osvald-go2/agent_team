import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeJsonAtomic(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, filePath);
}

export async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function envelope({ runId, taskId = null, from, to, kind, body }) {
  return {
    protocol: "agent-team.v1",
    id: `msg_${nanoid(12)}`,
    runId,
    taskId,
    from,
    to,
    kind,
    createdAt: new Date().toISOString(),
    body: body || {},
  };
}
