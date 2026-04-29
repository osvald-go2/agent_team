import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "../..");
const frontendRoot = path.resolve(repoRoot, "packages/frontend");

export const config = {
  port: Number(process.env.PORT || 3001),
  repoRoot,
  backendRoot,
  frontendRoot,
  dbPath: path.resolve(backendRoot, process.env.DB_PATH || "data/atelier.db"),
  workspaceRoot: path.resolve(backendRoot, process.env.WORKSPACE_ROOT || "workspaces"),
  defaultAgentId: process.env.DEFAULT_AGENT_ID || "codex-default",
  defaultProvider: "codexcli",
  defaultModel: process.env.DEFAULT_MODEL || "gpt-5.5",
  codexBin: process.env.CODEX_BIN || "codex",
  maxWorkers: Number(process.env.AGENTTEAM_MAX_WORKERS || 3),
};
