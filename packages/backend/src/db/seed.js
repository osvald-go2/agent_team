import fs from "node:fs";
import vm from "node:vm";
import { config } from "../config.js";

export const entityKinds = [
  "agents",
  "skills",
  "knowledge",
  "templates",
  "projects",
  "sessions",
  "conversation",
  "tasks",
  "approvals",
  "providers",
  "modelsByProvider",
  "edges",
  "nodePos",
  "topologies",
  "agentThreads",
  "clarifyQuestions",
  "guidedAgentScript",
  "mockReplies",
];

export function loadAppData() {
  const source = fs.readFileSync(`${config.repoRoot}/data.js`, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "data.js" });
  return sandbox.window.AppData || {};
}

export function normalizeSeedEntities(appData = loadAppData()) {
  const entities = {};
  for (const kind of entityKinds) {
    const value = appData[kind];
    if (Array.isArray(value)) {
      entities[kind] = value.map((item, index) => ({
        id: item?.id || `${kind}-${index}`,
        value: item,
      }));
    } else if (value && typeof value === "object") {
      entities[kind] = Object.entries(value).map(([id, item]) => ({
        id,
        value: { id, value: item },
      }));
    } else if (value !== undefined) {
      entities[kind] = [{ id: kind, value }];
    }
  }
  return entities;
}
