# Agent Team Backend MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MVP described in `docs/superpowers/specs/2026-04-23-agent-team-backend-design.md`: a pnpm monorepo with a Node.js/TypeScript backend that drives Claude Code via `@anthropic-ai/claude-agent-sdk`, a Vite/React/TypeScript/Zustand/Tailwind frontend that streams the conversation, SQLite persistence with per-turn git snapshots, session rollback with file restoration, and crash/termination recovery on startup.

**Architecture:** Hexagonal-ish layering inside `packages/backend`: an `AgentRunner` interface hides the Claude SDK behind a translator; an `EventBus` fans every domain event to three sinks (ring-buffer, WS broadcast, message-persist); `SessionService` + `TurnOrchestrator` own session lifecycle and one-turn execution; `WorkspaceManager` + `GitSnapshot` capture filesystem state per turn so `RollbackService` can atomically truncate DB and `git reset --hard`. The frontend consumes a provider-agnostic WebSocket protocol defined in `packages/shared`, with a pure-function reducer over a Zustand store.

**Tech Stack:** pnpm workspaces, TypeScript 5.5+, Node.js ≥20 (ESM), `@anthropic-ai/claude-agent-sdk`, `ws`, `better-sqlite3`, `simple-git`, `pino`, `dotenv`, Vite 5, React 18, Zustand, Tailwind CSS 3, Vitest, Playwright, Biome (lint + format).

**Spec reference:** `docs/superpowers/specs/2026-04-23-agent-team-backend-design.md`

**Working directory:** `/Users/lion268li/repos/toutiao/app/agent_team` (existing repo; the monorepo is established here in-place).

---

## Progress notes for the implementer

- Work through tasks in order. Each task is small enough to finish in under 15 minutes; steps inside a task are 2–5 minutes.
- Every task ends with a commit. Do not batch commits across tasks.
- Follow **TDD** wherever a test is listed: write the failing test, run it, watch it fail with the expected error, then implement, then watch it pass.
- When a step says "Expected: FAIL with `<message>`" or "Expected: PASS", you must actually run the command and confirm the output matches before checking the box.
- If you discover the spec is wrong, stop and raise it — do not quietly diverge. Spec lives at `docs/superpowers/specs/2026-04-23-agent-team-backend-design.md`.
- Do NOT push to any remote; all commits stay local.
- Do NOT add features outside what a step explicitly requests. If tempted, note it in the Future work section of the spec instead.

---

## Chunk 1: Monorepo Skeleton + `shared` Package

Goal of this chunk: lay the repo out as a pnpm monorepo, move the legacy React prototype to `legacy/prototype/`, and ship a buildable/testable `packages/shared` that exports the full WSEvent/domain type surface from the spec. When this chunk is done, `pnpm -r build` and `pnpm -r test` both pass, and `legacy/prototype/` is still loadable in a browser if someone visits it (nothing has been broken, only moved).

### Task 1: Archive the legacy React prototype

**Files:**
- Create: `legacy/prototype/` (directory)
- Move (no content changes): all prototype source files currently at the repo root

- [ ] **Step 1: Verify the repo is clean of uncommitted prototype changes that would be lost**

Run:
```bash
git status --short
```
Expected: the only modified files should be the spec-related docs. If there are other modified files, commit or stash them first — do not proceed while the working tree has mixed concerns.

- [ ] **Step 2: Create `legacy/prototype/` and move the prototype sources in**

Run exactly:
```bash
mkdir -p legacy/prototype
git mv \
  AgentDetail.jsx AgentDrawer.jsx App.jsx Chat.jsx CrudUI.jsx Dashboard.jsx \
  DetailShell.jsx GuidedFlow.jsx KBDetail.jsx Pages.jsx Shell.jsx SkillDetail.jsx \
  TaskDrawer.jsx TeamView.jsx TemplateDetail.jsx Toast.jsx icons.jsx \
  data.js index.html styles.css skills-lock.json \
  legacy/prototype/
```

If any of those files do not exist in your working tree, omit them from the command and continue — do not invent files.

- [ ] **Step 3: Move the prototype's visual reference assets**

Run:
```bash
git mv _check uploads legacy/prototype/ 2>/dev/null || true
# Screenshots at the root
find . -maxdepth 1 -type f -name '*.png' -exec git mv {} legacy/prototype/ \;
```

- [ ] **Step 4: Update the repo root `CLAUDE.md` to point at the new location**

Open `CLAUDE.md` and replace its contents with the following (this preserves the essential guidance while acknowledging the prototype move):

```markdown
# CLAUDE.md

This repository now contains a monorepo (pnpm workspaces) that implements
the MVP specified in `docs/superpowers/specs/2026-04-23-agent-team-backend-design.md`.

- `packages/shared` — TypeScript protocol + domain types, used by both halves.
- `packages/backend` — Node.js WebSocket server that drives Claude Code via
  `@anthropic-ai/claude-agent-sdk`, with SQLite persistence and per-turn git
  snapshots.
- `packages/frontend` — Vite + React + TypeScript client that renders the
  streaming conversation.
- `legacy/prototype/` — the original static React prototype that inspired the
  UI. Not built. Retained as a visual reference only; do NOT import from it.

See the spec for architecture, protocol, and acceptance criteria.
```

- [ ] **Step 5: Verify the legacy prototype still loads from its new home**

Run:
```bash
python3 -m http.server 8765 --directory legacy/prototype >/tmp/legacy-server.log 2>&1 &
sleep 1
curl -sSf -o /dev/null http://localhost:8765/index.html && echo OK
kill %1 2>/dev/null || true
```
Expected: prints `OK`. If it does not, something was moved incorrectly — investigate before proceeding.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: move prototype sources into legacy/prototype/"
```

### Task 2: Initialize pnpm workspaces at the repo root

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.env.example`

- [ ] **Step 1: Write `package.json` at the repo root**

Create `package.json` with this exact content:

```json
{
  "name": "agent-team",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20.11.0"
  },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "biome check .",
    "format": "biome format --write .",
    "dev": "pnpm -r --parallel dev"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
.pnpm-store/
dist/
coverage/
*.log
.env
.env.local
data/*.db*
workspaces/
.DS_Store
.vscode/
```

The `data/*.db*` glob intentionally covers SQLite's WAL mode artifacts
(`.db`, `.db-wal`, `.db-shm`, `.db-journal`) in one line.

- [ ] **Step 4: Write `.nvmrc`**

```
20.11.0
```

- [ ] **Step 5: Write `.env.example`**

```
ANTHROPIC_API_KEY=sk-ant-REPLACE_ME
PORT=3001
DB_PATH=./data/atelier.db
WORKSPACE_ROOT=./workspaces
DEFAULT_MODEL=claude-sonnet-4-6
LOG_LEVEL=info
CLAUDE_SOURCE=sdk
```

- [ ] **Step 6: Verify pnpm is installed and matches the declared version**

Run:
```bash
pnpm --version
```
Expected: prints `9.12.0` (or newer 9.x). If pnpm is missing, install it: `npm install -g pnpm@9.12.0`.

- [ ] **Step 7: Install root devDependencies**

Run:
```bash
pnpm install
```
Expected: completes with no errors; `node_modules/` appears; `pnpm-lock.yaml` is created.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml .gitignore .nvmrc .env.example
git commit -m "chore: initialize pnpm workspace at repo root"
```

### Task 3: Base TypeScript config + Biome config

**Files:**
- Create: `tsconfig.base.json`
- Create: `biome.json`

- [ ] **Step 1: Write `tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

- [ ] **Step 2: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "ignore": [
      "node_modules",
      "dist",
      "coverage",
      "legacy",
      "pnpm-lock.yaml",
      "data"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error",
        "useExhaustiveDependencies": "error"
      },
      "style": {
        "useNodejsImportProtocol": "error"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  }
}
```

- [ ] **Step 3: Sanity-check Biome on the current tree**

Run:
```bash
pnpm biome check . --no-errors-on-unmatched
```
Expected: exit code 0. The `legacy/` directory is ignored, so its JSX is not linted. If Biome complains about files you haven't created yet, something went wrong.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.base.json biome.json
git commit -m "chore: add base tsconfig and biome config"
```

### Task 4: Create the `shared` package scaffold

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/index.ts` (empty stub first)

- [ ] **Step 1: Write `packages/shared/package.json`**

```json
{
  "name": "@agent-team/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "clean": "rm -rf dist tsconfig.tsbuildinfo",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Write `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./tsconfig.tsbuildinfo"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `packages/shared/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: false,
    typecheck: {
      enabled: true,
      include: ["src/**/*.test-d.ts"],
    },
  },
});
```

- [ ] **Step 4: Write a temporary `src/index.ts` so the package builds**

```ts
export {};
```

- [ ] **Step 5: Install the package's deps**

Run:
```bash
pnpm install
```
Expected: `@agent-team/shared` appears in the workspace; `packages/shared/node_modules` is symlinked.

- [ ] **Step 6: Build once to verify the tsconfig wiring**

Run:
```bash
pnpm --filter @agent-team/shared build
```
Expected: exits 0; `packages/shared/dist/index.js` and `.d.ts` exist.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): scaffold package with tsconfig + vitest"
```

### Task 5: Implement `shared` domain types

**Files:**
- Create: `packages/shared/src/domain.ts`
- Create: `packages/shared/src/domain.test.ts`

- [ ] **Step 1: Write the failing runtime test**

Create `packages/shared/src/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  AskAnswer,
  AskQuestion,
  Block,
  ErrorCode,
  Message,
  SessionSummary,
  StopReason,
  TodoItem,
  TokenUsage,
  TurnSummary,
} from "./domain.js";

describe("domain types", () => {
  it("allows constructing a full Message with every block variant", () => {
    const todo: TodoItem = { id: "t1", subject: "do", status: "pending" };
    const ask: AskQuestion = {
      id: "q1",
      header: "?",
      question: "?",
      multiSelect: false,
      options: [{ label: "yes" }],
    };
    const answer: AskAnswer = { questionId: "q1", selected: ["yes"] };
    expect(answer.selected).toEqual(["yes"]);

    const blocks: Block[] = [
      { type: "text", text: "hi" },
      { type: "thinking", text: "reason" },
      { type: "tool_use", toolCallId: "c1", name: "Bash", input: {} },
      { type: "tool_result", toolCallId: "c1", output: "", isError: false },
      { type: "todo", todos: [todo] },
      { type: "skill", skillName: "sp:bs" },
      {
        type: "subagent",
        subagentId: "s1",
        summary: "done",
        messages: [],
      },
      { type: "raw", subtype: "unknown_v1", data: { foo: 1 } },
    ];
    const msg: Message = {
      id: "m1",
      role: "assistant",
      blocks,
      turnId: "t1",
      createdAt: 0,
    };
    expect(msg.blocks).toHaveLength(8);
  });

  it("accepts every StopReason and ErrorCode literal", () => {
    const stops: StopReason[] = [
      "end_turn",
      "max_tokens",
      "tool_use_pending",
      "cancelled",
      "error",
    ];
    const errs: ErrorCode[] = [
      "session.not_found",
      "session.busy",
      "turn.already_running",
      "turn.not_found",
      "rollback.target_not_found",
      "rollback.invalid_target",
      "rollback.workspace_conflict",
      "rollback.busy",
      "provider.rate_limit",
      "provider.auth",
      "provider.network",
      "internal",
    ];
    expect(stops).toHaveLength(5);
    expect(errs).toHaveLength(12);
  });

  it("constructs SessionSummary and TurnSummary", () => {
    const sum: SessionSummary = {
      id: "s",
      title: "t",
      agent: "claude",
      model: "m",
      lastMessageAt: 0,
      messageCount: 0,
      turnCount: 0,
    };
    const usage: TokenUsage = { inputTokens: 1, outputTokens: 2 };
    const tsum: TurnSummary = {
      id: "t",
      sequenceNum: 1,
      status: "completed",
      firstUserText: "hi",
      createdAt: 0,
      completedAt: 1,
    };
    expect(sum.id).toBe("s");
    expect(usage.inputTokens).toBe(1);
    expect(tsum.status).toBe("completed");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
pnpm --filter @agent-team/shared test
```
Expected: FAIL — `domain.ts` does not export these names. You should see errors like `Cannot find module './domain.js'`.

- [ ] **Step 3: Implement `packages/shared/src/domain.ts`**

Create `packages/shared/src/domain.ts` with this exact content (mirrors spec §5.4):

```ts
export type Message = {
  id: string;
  role: "user" | "assistant";
  blocks: Block[];
  turnId: string;
  createdAt: number;
};

export type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; toolCallId: string; name: string; input: unknown }
  | { type: "tool_result"; toolCallId: string; output: unknown; isError: boolean }
  | { type: "todo"; todos: TodoItem[] }
  | { type: "skill"; skillName: string; args?: string }
  | { type: "subagent"; subagentId: string; summary: string; messages: Message[] }
  | { type: "raw"; subtype: string; data: unknown };

export type TodoItem = {
  id: string;
  subject: string;
  activeForm?: string;
  status: "pending" | "in_progress" | "completed";
};

export type AskQuestion = {
  id: string;
  header: string;
  question: string;
  multiSelect: boolean;
  options: Array<{ label: string; description?: string }>;
};

export type AskAnswer = {
  questionId: string;
  selected: string[];
  otherText?: string;
};

export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "tool_use_pending"
  | "cancelled"
  | "error";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
};

export type ErrorCode =
  | "session.not_found"
  | "session.busy"
  | "turn.already_running"
  | "turn.not_found"
  | "rollback.target_not_found"
  | "rollback.invalid_target"
  | "rollback.workspace_conflict"
  | "rollback.busy"
  | "provider.rate_limit"
  | "provider.auth"
  | "provider.network"
  | "internal";

export type SessionSummary = {
  id: string;
  title: string;
  agent: string;
  model: string;
  lastMessageAt: number;
  messageCount: number;
  turnCount: number;
};

export type TurnSummary = {
  id: string;
  sequenceNum: number;
  status: "in_progress" | "completed" | "cancelled" | "error" | "orphaned";
  stopReason?: StopReason;
  firstUserText: string;
  createdAt: number;
  completedAt?: number;
};
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @agent-team/shared test
```
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain.ts packages/shared/src/domain.test.ts
git commit -m "feat(shared): add domain types (Message/Block/Todo/Ask/errors)"
```

### Task 6: Implement `shared` protocol types (WSEvent union)

**Files:**
- Create: `packages/shared/src/protocol.ts`
- Create: `packages/shared/src/protocol.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/protocol.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  C2SMessage,
  WSEvent,
} from "./protocol.js";

describe("WSEvent union", () => {
  it("allows constructing every S2C event type", () => {
    const events: WSEvent[] = [
      {
        type: "session.ready",
        seq: 1,
        ts: 0,
        payload: {
          sessionId: "s",
          agent: "claude",
          model: "m",
          messages: [],
          lastSeq: 0,
        },
      },
      {
        type: "session.list.result",
        seq: 2,
        ts: 0,
        payload: { sessions: [] },
      },
      {
        type: "turn.list.result",
        seq: 3,
        ts: 0,
        payload: { sessionId: "s", turns: [] },
      },
      {
        type: "session.rollback.complete",
        seq: 4,
        ts: 0,
        payload: {
          sessionId: "s",
          removedTurnIds: [],
          restoredToTurnId: "t",
          filesRestored: 0,
          messages: [],
          lastSeq: 0,
        },
      },
      {
        type: "turn.start",
        seq: 5,
        ts: 0,
        payload: {
          turnId: "t",
          userMessage: {
            id: "m",
            role: "user",
            blocks: [],
            turnId: "t",
            createdAt: 0,
          },
        },
      },
      { type: "turn.end", seq: 6, ts: 0, payload: { turnId: "t", stopReason: "end_turn" } },
      { type: "message.start", seq: 7, ts: 0, payload: { turnId: "t", messageId: "m", role: "assistant" } },
      { type: "message.end", seq: 8, ts: 0, payload: { messageId: "m" } },
      { type: "block.text.delta", seq: 9, ts: 0, payload: { messageId: "m", blockIdx: 0, text: "x" } },
      { type: "block.thinking.delta", seq: 10, ts: 0, payload: { messageId: "m", blockIdx: 0, text: "x" } },
      { type: "block.tool_use", seq: 11, ts: 0, payload: { messageId: "m", blockIdx: 0, toolCallId: "c", name: "n", input: {} } },
      { type: "block.tool_result", seq: 12, ts: 0, payload: { toolCallId: "c", output: null, isError: false } },
      { type: "block.raw", seq: 13, ts: 0, payload: { subtype: "x", data: null } },
      { type: "todo.update", seq: 14, ts: 0, payload: { messageId: "m", blockIdx: 0, todos: [] } },
      {
        type: "subagent.start",
        seq: 15,
        ts: 0,
        payload: {
          subagentId: "s",
          parentToolCallId: "c",
          parentMessageId: "m",
          subagentType: "general-purpose",
          description: "d",
          prompt: "p",
        },
      },
      {
        type: "subagent.event",
        seq: 16,
        ts: 0,
        payload: {
          subagentId: "s",
          inner: { type: "block.text.delta", seq: 1, ts: 0, payload: { messageId: "m", blockIdx: 0, text: "x" } },
        },
      },
      { type: "subagent.end", seq: 17, ts: 0, payload: { subagentId: "s", result: "r" } },
      {
        type: "skill.invoked",
        seq: 18,
        ts: 0,
        payload: { messageId: "m", blockIdx: 0, skillName: "sp:bs", source: "model" },
      },
      {
        type: "askuser.request",
        seq: 19,
        ts: 0,
        payload: { requestId: "r", toolCallId: "c", questions: [] },
      },
      {
        type: "permission.request",
        seq: 20,
        ts: 0,
        payload: { requestId: "r", toolCallId: "c", tool: "Bash", input: {} },
      },
      { type: "heartbeat", seq: 21, ts: 0, payload: {} },
      {
        type: "error",
        seq: 22,
        ts: 0,
        payload: { code: "internal", message: "boom", retriable: false },
      },
    ];
    expect(events).toHaveLength(22);
  });

  it("allows constructing every C2S message", () => {
    const msgs: C2SMessage[] = [
      { type: "session.create", payload: { agent: "claude" } },
      { type: "session.load", payload: { sessionId: "s" } },
      { type: "session.list", payload: {} },
      { type: "session.rollback", payload: { sessionId: "s", toTurnId: "t" } },
      { type: "turn.list", payload: { sessionId: "s" } },
      { type: "message.send", payload: { text: "hi" } },
      { type: "turn.cancel", payload: { turnId: "t" } },
      { type: "askuser.respond", payload: { requestId: "r", answers: [] } },
      { type: "permission.respond", payload: { requestId: "r", decision: "allow_once" } },
      { type: "sync", payload: { sessionId: "s", sinceSeq: 0 } },
    ];
    expect(msgs).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run:
```bash
pnpm --filter @agent-team/shared test
```
Expected: FAIL — `protocol.ts` does not exist yet.

- [ ] **Step 3: Implement `packages/shared/src/protocol.ts`**

Create `packages/shared/src/protocol.ts` (mirrors spec §5.1–§5.3):

```ts
import type {
  AskAnswer,
  AskQuestion,
  ErrorCode,
  Message,
  SessionSummary,
  StopReason,
  TodoItem,
  TokenUsage,
  TurnSummary,
} from "./domain.js";

export type WSEventEnvelope<T extends string, P> = {
  type: T;
  seq: number;
  ts: number;
  payload: P;
};

export type C2SEnvelope<T extends string, P> = {
  type: T;
  payload: P;
};

export type WSEvent =
  | WSEventEnvelope<
      "session.ready",
      {
        sessionId: string;
        agent: string;
        model: string;
        messages: Message[];
        lastSeq: number;
      }
    >
  | WSEventEnvelope<"session.list.result", { sessions: SessionSummary[] }>
  | WSEventEnvelope<"turn.list.result", { sessionId: string; turns: TurnSummary[] }>
  | WSEventEnvelope<
      "session.rollback.complete",
      {
        sessionId: string;
        removedTurnIds: string[];
        restoredToTurnId: string;
        filesRestored: number;
        messages: Message[];
        lastSeq: number;
      }
    >
  | WSEventEnvelope<"turn.start", { turnId: string; userMessage: Message }>
  | WSEventEnvelope<
      "turn.end",
      { turnId: string; stopReason: StopReason; usage?: TokenUsage }
    >
  | WSEventEnvelope<
      "message.start",
      { turnId: string; messageId: string; role: "assistant" }
    >
  | WSEventEnvelope<"message.end", { messageId: string }>
  | WSEventEnvelope<
      "block.text.delta",
      { messageId: string; blockIdx: number; text: string }
    >
  | WSEventEnvelope<
      "block.thinking.delta",
      { messageId: string; blockIdx: number; text: string }
    >
  | WSEventEnvelope<
      "block.tool_use",
      {
        messageId: string;
        blockIdx: number;
        toolCallId: string;
        name: string;
        input: unknown;
      }
    >
  | WSEventEnvelope<
      "block.tool_result",
      { toolCallId: string; output: unknown; isError: boolean }
    >
  | WSEventEnvelope<
      "block.raw",
      { messageId?: string; blockIdx?: number; subtype: string; data: unknown }
    >
  | WSEventEnvelope<
      "todo.update",
      { messageId: string; blockIdx: number; todos: TodoItem[] }
    >
  | WSEventEnvelope<
      "subagent.start",
      {
        subagentId: string;
        parentToolCallId: string;
        parentMessageId: string;
        subagentType: string;
        description: string;
        prompt: string;
      }
    >
  | WSEventEnvelope<"subagent.event", { subagentId: string; inner: WSEvent }>
  | WSEventEnvelope<
      "subagent.end",
      { subagentId: string; result: string; usage?: TokenUsage }
    >
  | WSEventEnvelope<
      "skill.invoked",
      {
        messageId: string;
        blockIdx: number;
        skillName: string;
        args?: string;
        source: "user" | "model";
      }
    >
  | WSEventEnvelope<
      "askuser.request",
      { requestId: string; toolCallId: string; questions: AskQuestion[] }
    >
  | WSEventEnvelope<
      "permission.request",
      { requestId: string; toolCallId: string; tool: string; input: unknown }
    >
  | WSEventEnvelope<"heartbeat", Record<string, never>>
  | WSEventEnvelope<
      "error",
      {
        code: ErrorCode;
        message: string;
        retriable: boolean;
        turnId?: string;
      }
    >;

export type C2SMessage =
  | C2SEnvelope<
      "session.create",
      {
        agent: "claude" | "codex";
        cwd?: string;
        systemPrompt?: string;
        model?: string;
      }
    >
  | C2SEnvelope<"session.load", { sessionId: string }>
  | C2SEnvelope<"session.list", Record<string, never>>
  | C2SEnvelope<"session.rollback", { sessionId: string; toTurnId: string }>
  | C2SEnvelope<"turn.list", { sessionId: string }>
  | C2SEnvelope<"message.send", { text: string; clientTurnId?: string }>
  | C2SEnvelope<"turn.cancel", { turnId: string }>
  | C2SEnvelope<
      "askuser.respond",
      { requestId: string; answers: AskAnswer[] }
    >
  | C2SEnvelope<
      "permission.respond",
      {
        requestId: string;
        decision: "allow_once" | "allow_always" | "deny";
      }
    >
  | C2SEnvelope<"sync", { sessionId: string; sinceSeq: number }>;
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @agent-team/shared test
```
Expected: PASS — every S2C and C2S variant type-checks.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/protocol.ts packages/shared/src/protocol.test.ts
git commit -m "feat(shared): add WSEvent + C2SMessage union"
```

### Task 7: Wire up `shared/src/index.ts` and confirm package builds + tests pass

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: (implicit — the existing tests re-run on the rebuilt package)

- [ ] **Step 1: Replace `packages/shared/src/index.ts` with public re-exports**

```ts
export * from "./domain.js";
export * from "./protocol.js";
```

- [ ] **Step 2: Clean the prior build then rebuild**

Run:
```bash
pnpm --filter @agent-team/shared clean
pnpm --filter @agent-team/shared build
```
Expected: exits 0; `packages/shared/dist/index.js`, `index.d.ts`, `domain.d.ts`, `protocol.d.ts` all exist.

- [ ] **Step 3: Run the full workspace test**

Run:
```bash
pnpm -r test
```
Expected: PASS — `@agent-team/shared` runs both test files green; other packages are still absent (no error because `--recursive` skips missing scripts).

- [ ] **Step 4: Run Biome one more time to confirm the new files lint clean**

Run:
```bash
pnpm biome check . --no-errors-on-unmatched
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): export domain + protocol from package root"
```

### Chunk 1 exit criteria

All of the following must be true before starting Chunk 2:

- `git log --oneline -10` shows at least 7 commits authored during this chunk (one per task).
- `legacy/prototype/index.html` is reachable by `python3 -m http.server` and renders the prior prototype without any module resolution errors.
- `pnpm -r build` and `pnpm -r test` both exit 0 from the repo root.
- `pnpm biome check .` exits 0.
- `packages/shared/dist/` contains `index.js`, `domain.js`, `protocol.js` and matching `.d.ts` files.
- The tree at the repo root now contains exactly: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `biome.json`, `.gitignore`, `.nvmrc`, `.env.example`, `CLAUDE.md`, `packages/`, `legacy/`, `docs/`, plus any pre-existing unrelated directories (`video/`, `.claude/`, `.playwright-mcp/`) that should not be touched.

---

## Chunk 2: Backend Package Scaffold + Config + Logger + HTTP + Minimal WebSocket

Goal of this chunk: stand up `packages/backend` as a Node.js + TypeScript ESM package. Load and validate `.env` config. Wire `pino` logging. Start an `http` server that answers `GET /health` and a placeholder `GET /metrics`. Accept WebSocket upgrades on `/ws` and respond to a `{"type":"ping"}` message with `{"type":"pong"}`. No database, no agent, no session logic yet — the point is to prove the process starts, binds, and exchanges messages end-to-end with a test WebSocket client.

### Task 8: Backend package scaffold

**Files:**
- Create: `packages/backend/package.json`
- Create: `packages/backend/tsconfig.json`
- Create: `packages/backend/vitest.config.ts`
- Create: `packages/backend/src/index.ts` (placeholder)

- [ ] **Step 1: Write `packages/backend/package.json`**

```json
{
  "name": "@agent-team/backend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -b",
    "clean": "rm -rf dist tsconfig.tsbuildinfo",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@agent-team/shared": "workspace:*",
    "dotenv": "^16.4.5",
    "pino": "^9.5.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^22.5.4",
    "@types/ws": "^8.5.12",
    "tsx": "^4.19.1",
    "typescript": "^5.5.4",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Write `packages/backend/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./tsconfig.tsbuildinfo",
    "types": ["node"]
  },
  "references": [{ "path": "../shared" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `packages/backend/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    passWithNoTests: false,
    testTimeout: 10_000,
  },
});
```

- [ ] **Step 4: Write a placeholder `packages/backend/src/index.ts`**

```ts
// Entry point. Implemented in subsequent tasks.
export {};
```

- [ ] **Step 5: Install dependencies**

Run:
```bash
pnpm install
```
Expected: exits 0; `packages/backend/node_modules` is symlinked; `@agent-team/shared` is linked via `workspace:*`.

- [ ] **Step 6: Verify the backend package builds (should be a no-op)**

Run:
```bash
pnpm --filter @agent-team/backend build
```
Expected: exits 0; `packages/backend/dist/index.js` exists.

- [ ] **Step 7: Verify shared is referenced correctly**

Run:
```bash
pnpm --filter @agent-team/backend exec node --input-type=module -e \
  "import('@agent-team/shared').then(m => { if (Object.keys(m).length === 0) { console.error('EMPTY'); process.exit(1); } console.log('OK'); })"
```
Expected: prints `OK`. Any import error means the `workspace:*` link is broken — stop and fix before continuing (confirm `pnpm install` was run after Step 1 and `packages/backend/node_modules/@agent-team/shared` is a symlink).

- [ ] **Step 8: Commit**

```bash
git add packages/backend/
git commit -m "feat(backend): scaffold package with tsconfig + vitest"
```

### Task 9: Config loader

**Files:**
- Create: `packages/backend/src/config.ts`
- Create: `packages/backend/src/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/config.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const snapshotEnv = () => ({ ...process.env });
let saved: NodeJS.ProcessEnv;

describe("loadConfig", () => {
  beforeEach(() => {
    saved = snapshotEnv();
  });
  afterEach(() => {
    process.env = saved;
  });

  it("loads all required fields from env", () => {
    process.env = {
      ...saved,
      ANTHROPIC_API_KEY: "sk-ant-test",
      PORT: "4567",
      DB_PATH: "/tmp/test.db",
      WORKSPACE_ROOT: "/tmp/ws",
      DEFAULT_MODEL: "claude-sonnet-4-6",
      LOG_LEVEL: "debug",
      CLAUDE_SOURCE: "sdk",
    };
    const cfg = loadConfig();
    expect(cfg.anthropicApiKey).toBe("sk-ant-test");
    expect(cfg.port).toBe(4567);
    expect(cfg.dbPath).toBe("/tmp/test.db");
    expect(cfg.workspaceRoot).toBe("/tmp/ws");
    expect(cfg.defaultModel).toBe("claude-sonnet-4-6");
    expect(cfg.logLevel).toBe("debug");
    expect(cfg.claudeSource).toBe("sdk");
  });

  it("applies documented defaults when optional vars are missing", () => {
    process.env = {
      ...saved,
      ANTHROPIC_API_KEY: "sk-ant-test",
    };
    delete process.env.PORT;
    delete process.env.DB_PATH;
    delete process.env.WORKSPACE_ROOT;
    delete process.env.DEFAULT_MODEL;
    delete process.env.LOG_LEVEL;
    delete process.env.CLAUDE_SOURCE;
    const cfg = loadConfig();
    expect(cfg.port).toBe(3001);
    expect(cfg.dbPath).toBe("./data/atelier.db");
    expect(cfg.workspaceRoot).toBe("./workspaces");
    expect(cfg.defaultModel).toBe("claude-sonnet-4-6");
    expect(cfg.logLevel).toBe("info");
    expect(cfg.claudeSource).toBe("sdk");
  });

  it("throws if ANTHROPIC_API_KEY is missing", () => {
    process.env = { ...saved };
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => loadConfig()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("throws if PORT is not a valid integer", () => {
    process.env = {
      ...saved,
      ANTHROPIC_API_KEY: "sk-ant-test",
      PORT: "abc",
    };
    expect(() => loadConfig()).toThrow(/PORT/);
  });

  it("throws if CLAUDE_SOURCE is not sdk or cli", () => {
    process.env = {
      ...saved,
      ANTHROPIC_API_KEY: "sk-ant-test",
      CLAUDE_SOURCE: "xyz",
    };
    expect(() => loadConfig()).toThrow(/CLAUDE_SOURCE/);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: FAIL — `config.ts` does not exist.

- [ ] **Step 3: Implement `packages/backend/src/config.ts`**

```ts
import "dotenv/config";

export type ClaudeSourceKind = "sdk" | "cli";
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export type AppConfig = {
  anthropicApiKey: string;
  port: number;
  dbPath: string;
  workspaceRoot: string;
  defaultModel: string;
  logLevel: LogLevel;
  claudeSource: ClaudeSourceKind;
};

const VALID_LOG_LEVELS: ReadonlySet<LogLevel> = new Set([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
]);

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Config error: ${name} is required but missing or empty.`);
  }
  return v;
}

function optional(name: string, defaultValue: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : defaultValue;
}

function asInt(name: string, raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Config error: ${name}="${raw}" is not a non-negative integer.`);
  }
  return Number.parseInt(raw, 10);
}

function asClaudeSource(raw: string): ClaudeSourceKind {
  if (raw !== "sdk" && raw !== "cli") {
    throw new Error(`Config error: CLAUDE_SOURCE="${raw}" must be "sdk" or "cli".`);
  }
  return raw;
}

function asLogLevel(raw: string): LogLevel {
  if (!VALID_LOG_LEVELS.has(raw as LogLevel)) {
    throw new Error(`Config error: LOG_LEVEL="${raw}" must be one of ${[...VALID_LOG_LEVELS].join(", ")}.`);
  }
  return raw as LogLevel;
}

export function loadConfig(): AppConfig {
  return {
    anthropicApiKey: required("ANTHROPIC_API_KEY"),
    port: asInt("PORT", optional("PORT", "3001")),
    dbPath: optional("DB_PATH", "./data/atelier.db"),
    workspaceRoot: optional("WORKSPACE_ROOT", "./workspaces"),
    defaultModel: optional("DEFAULT_MODEL", "claude-sonnet-4-6"),
    logLevel: asLogLevel(optional("LOG_LEVEL", "info")),
    claudeSource: asClaudeSource(optional("CLAUDE_SOURCE", "sdk")),
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: PASS — all 5 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/config.ts packages/backend/src/config.test.ts
git commit -m "feat(backend): add validated env config loader"
```

### Task 10: Logger

**Files:**
- Create: `packages/backend/src/logger.ts`

- [ ] **Step 1: Implement `packages/backend/src/logger.ts`**

No TDD here — pino is a thin wrapper we pass through. Just create:

```ts
import pino from "pino";
import type { LogLevel } from "./config.js";

export type Logger = pino.Logger;

export function createLogger(level: LogLevel): Logger {
  return pino({
    level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
```

- [ ] **Step 2: Verify the backend still builds**

Run:
```bash
pnpm --filter @agent-team/backend build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/logger.ts
git commit -m "feat(backend): add pino logger wrapper"
```

### Task 11: HTTP server with `/health` and `/metrics` placeholder

**Files:**
- Create: `packages/backend/src/http/server.ts`
- Create: `packages/backend/src/http/server.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `packages/backend/src/http/server.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createHttpServer, type HttpServerHandle } from "./server.js";
import { createLogger } from "../logger.js";

const log = createLogger("fatal");

describe("http server", () => {
  let handle: HttpServerHandle;
  let baseUrl: string;

  beforeEach(async () => {
    handle = await createHttpServer({ port: 0, logger: log });
    const addr = handle.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await handle.close();
  });

  it("GET /health returns ok + version", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
  });

  it("GET /metrics returns plain text with zero values in chunk 2", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const text = await res.text();
    expect(text).toMatch(/active_sessions\s+0/);
    expect(text).toMatch(/ws_connections\s+0/);
    expect(text).toMatch(/total_turns\s+0/);
    expect(text).toMatch(/orphaned_turns\s+0/);
  });

  it("unknown path returns 404 JSON", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: FAIL — `./server.js` does not exist.

- [ ] **Step 3: Implement `packages/backend/src/http/server.ts`**

```ts
import http from "node:http";
import type { Server } from "node:http";
import type { Logger } from "../logger.js";

export type MetricsSource = {
  activeSessions: () => number;
  wsConnections: () => number;
  totalTurns: () => number;
  orphanedTurns: () => number;
};

export type HttpServerOptions = {
  port: number;
  logger: Logger;
  metrics?: MetricsSource;
  version?: string;
};

export type HttpServerHandle = {
  server: Server;
  close: () => Promise<void>;
};

const ZERO_METRICS: MetricsSource = {
  activeSessions: () => 0,
  wsConnections: () => 0,
  totalTurns: () => 0,
  orphanedTurns: () => 0,
};

export async function createHttpServer(
  opts: HttpServerOptions,
): Promise<HttpServerHandle> {
  const { port, logger } = opts;
  const metrics = opts.metrics ?? ZERO_METRICS;
  const version = opts.version ?? "0.0.0";

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method === "GET" && url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, version }));
      return;
    }
    if (req.method === "GET" && url === "/metrics") {
      const body =
        `active_sessions ${metrics.activeSessions()}\n` +
        `ws_connections ${metrics.wsConnections()}\n` +
        `total_turns ${metrics.totalTurns()}\n` +
        `orphaned_turns ${metrics.orphanedTurns()}\n`;
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(body);
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  logger.info({ port }, "http server listening");

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: PASS — all 3 HTTP cases plus the earlier config cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/http/server.ts packages/backend/src/http/server.test.ts
git commit -m "feat(backend): add http server with /health and /metrics"
```

### Task 12: WebSocket server with ping/pong echo

**Files:**
- Create: `packages/backend/src/ws/server.ts`
- Create: `packages/backend/src/ws/server.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `packages/backend/src/ws/server.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import { createHttpServer, type HttpServerHandle } from "../http/server.js";
import { attachWsServer, type WsServerHandle } from "./server.js";
import { createLogger } from "../logger.js";

const log = createLogger("fatal");

const recv = (ws: WebSocket): Promise<string> =>
  new Promise((resolve, reject) => {
    ws.once("message", (data) => resolve(data.toString("utf8")));
    ws.once("error", reject);
  });

describe("ws server — minimal ping/pong", () => {
  let http: HttpServerHandle;
  let ws: WsServerHandle;
  let wsUrl: string;

  beforeEach(async () => {
    http = await createHttpServer({ port: 0, logger: log });
    ws = attachWsServer({ httpServer: http.server, path: "/ws", logger: log });
    const addr = http.server.address() as AddressInfo;
    wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
  });

  afterEach(async () => {
    ws.close();
    await http.close();
  });

  it("responds to {type:'ping'} with {type:'pong'}", async () => {
    const client = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      client.once("open", () => resolve());
      client.once("error", reject);
    });
    client.send(JSON.stringify({ type: "ping" }));
    const raw = await recv(client);
    const msg = JSON.parse(raw) as { type: string };
    expect(msg.type).toBe("pong");
    client.close();
  });

  it("ignores malformed JSON frames without crashing the server", async () => {
    const c1 = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => c1.once("open", () => resolve()));
    // IMPORTANT: attach the message listener BEFORE sending the valid ping,
    // and AFTER sending the malformed frame. The server drops malformed
    // frames silently, so the next message the client sees must be the pong.
    // Do not reorder these three calls.
    c1.send("this is not json");
    const pong = recv(c1);
    c1.send(JSON.stringify({ type: "ping" }));
    const raw = await pong;
    expect(JSON.parse(raw).type).toBe("pong");
    c1.close();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: FAIL — `./server.js` does not exist.

- [ ] **Step 3: Implement `packages/backend/src/ws/server.ts`**

```ts
import type { Server as HttpServer } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import type { Logger } from "../logger.js";

export type WsServerOptions = {
  httpServer: HttpServer;
  path: string;
  logger: Logger;
};

export type WsServerHandle = {
  wss: WebSocketServer;
  close: () => void;
};

export function attachWsServer(opts: WsServerOptions): WsServerHandle {
  const { httpServer, path, logger } = opts;
  const wss = new WebSocketServer({ server: httpServer, path });

  wss.on("connection", (socket) => {
    logger.info("ws connection opened");

    socket.on("message", (raw) => {
      const text = raw.toString("utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        logger.warn({ text }, "ws: malformed json dropped");
        return;
      }
      if (
        parsed &&
        typeof parsed === "object" &&
        "type" in parsed &&
        (parsed as { type: unknown }).type === "ping"
      ) {
        socket.send(JSON.stringify({ type: "pong" }));
        return;
      }
      logger.debug({ parsed }, "ws: dropped unknown frame (chunk 2 placeholder)");
    });

    socket.on("close", () => {
      logger.info("ws connection closed");
    });

    socket.on("error", (err) => {
      logger.warn({ err }, "ws socket error");
    });
  });

  return {
    wss,
    close: () => {
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.terminate();
      }
      wss.close();
    },
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: PASS — both ping/pong and malformed-tolerance cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/ws/server.ts packages/backend/src/ws/server.test.ts
git commit -m "feat(backend): add ws server with ping/pong echo"
```

### Task 13: `index.ts` entry point wires config + http + ws

**Files:**
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Replace `src/index.ts` placeholder with the real entry**

```ts
import { loadConfig } from "./config.js";
import { createHttpServer } from "./http/server.js";
import { createLogger } from "./logger.js";
import { attachWsServer } from "./ws/server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const http = await createHttpServer({
    port: config.port,
    logger,
  });
  attachWsServer({ httpServer: http.server, path: "/ws", logger });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await http.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  // Intentionally no logger here — config failure happens before logger exists.
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify build**

Run:
```bash
pnpm --filter @agent-team/backend build
```
Expected: exits 0.

- [ ] **Step 3: Smoke-run the server end-to-end (interactive, not CI)**

Run from the **repo root**:
```bash
cd "$(git rev-parse --show-toplevel)"
cp -n .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-placeholder (any non-empty value is fine for chunk 2)

pnpm --filter @agent-team/backend build
node packages/backend/dist/index.js &
SERVER_PID=$!

# Wait up to 5 seconds for the server to accept connections.
for i in 1 2 3 4 5; do
  if curl -sf http://127.0.0.1:3001/health > /dev/null; then break; fi
  sleep 1
done

HEALTH=$(curl -sf http://127.0.0.1:3001/health) || { echo "health failed"; kill $SERVER_PID 2>/dev/null; exit 1; }
echo "$HEALTH" | grep -q '"ok":true' && echo "health OK" || { echo "health body unexpected: $HEALTH"; kill $SERVER_PID 2>/dev/null; exit 1; }

METRICS=$(curl -sf http://127.0.0.1:3001/metrics) || { echo "metrics failed"; kill $SERVER_PID 2>/dev/null; exit 1; }
echo "$METRICS" | grep -qE '^active_sessions\s+0'  || { echo "metrics missing active_sessions"; kill $SERVER_PID 2>/dev/null; exit 1; }
echo "$METRICS" | grep -qE '^ws_connections\s+0'   || { echo "metrics missing ws_connections"; kill $SERVER_PID 2>/dev/null; exit 1; }
echo "$METRICS" | grep -qE '^total_turns\s+0'      || { echo "metrics missing total_turns"; kill $SERVER_PID 2>/dev/null; exit 1; }
echo "$METRICS" | grep -qE '^orphaned_turns\s+0'   || { echo "metrics missing orphaned_turns"; kill $SERVER_PID 2>/dev/null; exit 1; }
echo "metrics OK"

kill $SERVER_PID 2>/dev/null || true
```
Expected: prints `health OK` and `metrics OK`; no stack traces appear on stderr.

Note: this smoke test is meant for interactive developer use after implementing Chunk 2. Do not add it to CI — the sleep loop is not timing-robust enough for shared runners. CI runs `pnpm -r test` which covers the HTTP and WS paths via real integration tests.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/index.ts
git commit -m "feat(backend): wire config + http + ws in entry point"
```

### Chunk 2 exit criteria

All of the following must be true before starting Chunk 3:

- `pnpm -r build` exits 0 from the repo root.
- `pnpm -r test` passes across both `@agent-team/shared` and `@agent-team/backend`.
- Running `node packages/backend/dist/index.js` binds to `127.0.0.1:3001`, returns `GET /health` and `GET /metrics` correctly, responds to WebSocket `{"type":"ping"}` with `{"type":"pong"}`, and shuts down cleanly on `SIGINT`.
- `git log --oneline -10` shows the commits added in this chunk.

---

## Chunk 3: Database — Schema, Connection, Repository

Goal of this chunk: create the SQLite schema that backs the MVP (spec §6.3 — sessions / turns / messages), open a typed connection via `better-sqlite3`, and expose a single `Repository` class with all the methods the spec's pseudocode references. The chunk ends with `index.ts` opening the DB at startup and a verifiable round-trip (insert a session, list it back) via integration tests using an in-memory database.

### Task 14: Install `better-sqlite3`, write schema, open DB

**Files:**
- Modify: `packages/backend/package.json`
- Create: `packages/backend/src/db/schema.sql`
- Create: `packages/backend/src/db/connection.ts`
- Create: `packages/backend/src/db/connection.test.ts`

- [ ] **Step 1: Add `better-sqlite3` to `packages/backend/package.json`**

Edit the `dependencies` and `devDependencies` blocks so they include:

```json
"dependencies": {
  "@agent-team/shared": "workspace:*",
  "better-sqlite3": "^11.5.0",
  "dotenv": "^16.4.5",
  "pino": "^9.5.0",
  "ws": "^8.18.0"
},
"devDependencies": {
  "@types/better-sqlite3": "^7.6.11",
  "@types/node": "^22.5.4",
  "@types/ws": "^8.5.12",
  "tsx": "^4.19.1",
  "typescript": "^5.5.4",
  "vitest": "^2.1.1"
}
```

Run:
```bash
pnpm install
```
Expected: installs; prebuilt binary for your platform is fetched (no local `python`/`node-gyp` build needed on macOS/Linux/Windows Node 20+). If it falls back to `node-gyp`, make sure `python3` and a C++ toolchain are available; on macOS: `xcode-select --install`.

- [ ] **Step 2: Write `packages/backend/src/db/schema.sql`** (verbatim from spec §6.3)

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  agent TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_session_id TEXT,
  system_prompt TEXT,
  cwd TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sequence_num INTEGER NOT NULL,
  status TEXT NOT NULL,
  stop_reason TEXT,
  usage_json TEXT,
  pre_turn_commit TEXT NOT NULL,
  post_turn_commit TEXT,
  first_user_text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_session_seq
  ON turns(session_id, sequence_num);
CREATE INDEX IF NOT EXISTS idx_turns_session_status
  ON turns(session_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  blocks_json TEXT NOT NULL,
  blocks_schema_version INTEGER NOT NULL DEFAULT 1,
  stop_reason TEXT,
  usage_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session_created
  ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_turn
  ON messages(turn_id);
```

- [ ] **Step 3: Write the failing DB connection test**

Create `packages/backend/src/db/connection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openDb } from "./connection.js";

describe("openDb", () => {
  it("opens an in-memory database and applies the schema", () => {
    const db = openDb(":memory:");
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name);
    expect(names).toContain("sessions");
    expect(names).toContain("turns");
    expect(names).toContain("messages");
    db.close();
  });

  it("enables foreign_keys pragma", () => {
    const db = openDb(":memory:");
    const row = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
    db.close();
  });

  it("is idempotent — running schema twice does not throw", () => {
    const db = openDb(":memory:");
    // Re-run schema file directly; connection.ts uses IF NOT EXISTS so this is safe.
    expect(() => {
      db.prepare("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY)").run();
    }).not.toThrow();
    db.close();
  });
});
```

- [ ] **Step 4: Run the test and confirm it fails**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: FAIL — `./connection.js` does not exist.

- [ ] **Step 5: Implement `packages/backend/src/db/connection.ts`**

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export type Db = Database.Database;

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(MODULE_DIR, "schema.sql");
// Read once at module load — schema.sql is copied next to the compiled JS.
const SCHEMA_SQL = readFileSync(SCHEMA_PATH, "utf8");

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.exec(SCHEMA_SQL);
  return db;
}
```

- [ ] **Step 6: Ensure `schema.sql` is copied into `dist/` on build**

TypeScript does not copy non-TS assets, so add a post-build `cpSync` step to the `build` script in `packages/backend/package.json`:

```json
"scripts": {
  "build": "tsc -b && node -e \"require('node:fs').cpSync('src/db/schema.sql','dist/db/schema.sql')\"",
  "clean": "rm -rf dist tsconfig.tsbuildinfo",
  "dev": "tsx watch src/index.ts",
  "start": "node dist/index.js",
  "test": "vitest run"
}
```

Note: `vitest` runs TS directly via its own loader, so tests find `schema.sql` relative to `src/db/`; the post-build copy only matters for `node dist/index.js`. Document this in a comment above `SCHEMA_PATH` if you prefer — but the current code uses `import.meta.url`, which resolves correctly in both `src/` and `dist/` contexts because the SQL file sits alongside the module.

- [ ] **Step 7: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: PASS — all 3 connection tests green.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/package.json pnpm-lock.yaml \
  packages/backend/src/db/schema.sql \
  packages/backend/src/db/connection.ts \
  packages/backend/src/db/connection.test.ts
git commit -m "feat(backend): add SQLite schema + typed connection"
```

### Task 15: Sessions repository

**Files:**
- Create: `packages/backend/src/db/types.ts`
- Create: `packages/backend/src/db/repository.ts`
- Create: `packages/backend/src/db/sessions.test.ts`

- [ ] **Step 1: Write `packages/backend/src/db/types.ts`** (DB row + insert DTO types)

```ts
import type { StopReason, TokenUsage } from "@agent-team/shared";

export type SessionRow = {
  id: string;
  title: string;
  agent: string;
  model: string;
  providerSessionId: string | null;
  systemPrompt: string | null;
  cwd: string;
  createdAt: number;
  lastMessageAt: number;
};

export type NewSession = Omit<SessionRow, "lastMessageAt"> & {
  lastMessageAt?: number;
};

export type TurnStatus =
  | "in_progress"
  | "completed"
  | "cancelled"
  | "error"
  | "orphaned";

export type TurnRow = {
  id: string;
  sessionId: string;
  sequenceNum: number;
  status: TurnStatus;
  stopReason: StopReason | null;
  usage: TokenUsage | null;
  preTurnCommit: string;
  postTurnCommit: string | null;
  firstUserText: string;
  createdAt: number;
  completedAt: number | null;
};

export type NewTurn = Omit<TurnRow, "postTurnCommit" | "completedAt" | "stopReason" | "usage"> & {
  postTurnCommit?: string | null;
  completedAt?: number | null;
  stopReason?: StopReason | null;
  usage?: TokenUsage | null;
};

export type TurnPatch = Partial<
  Pick<TurnRow, "status" | "stopReason" | "usage" | "postTurnCommit" | "completedAt">
>;

export type MessageRow = {
  id: string;
  sessionId: string;
  turnId: string;
  role: "user" | "assistant";
  blocksJson: string;                  // JSON of Block[]
  blocksSchemaVersion: number;
  stopReason: StopReason | null;
  usage: TokenUsage | null;
  createdAt: number;
};

export type NewMessage = Omit<MessageRow, "blocksSchemaVersion" | "stopReason" | "usage"> & {
  blocksSchemaVersion?: number;
  stopReason?: StopReason | null;
  usage?: TokenUsage | null;
};
```

- [ ] **Step 2: Write the failing sessions test**

Create `packages/backend/src/db/sessions.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./connection.js";
import { Repository } from "./repository.js";

describe("Repository — sessions", () => {
  let db: Db;
  let repo: Repository;

  beforeEach(() => {
    db = openDb(":memory:");
    repo = new Repository(db);
  });

  it("creates and retrieves a session", () => {
    repo.createSession({
      id: "s1",
      title: "Test",
      agent: "claude",
      model: "claude-sonnet-4-6",
      providerSessionId: null,
      systemPrompt: null,
      cwd: "/tmp/s1",
      createdAt: 100,
    });
    const got = repo.getSession("s1");
    expect(got?.id).toBe("s1");
    expect(got?.providerSessionId).toBeNull();
    expect(got?.lastMessageAt).toBe(100);
  });

  it("lists sessions with message and turn counts (zero to start)", () => {
    repo.createSession({
      id: "a",
      title: "A",
      agent: "claude",
      model: "m",
      providerSessionId: null,
      systemPrompt: null,
      cwd: "/a",
      createdAt: 1,
    });
    const list = repo.listSessions();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe("a");
    expect(list[0]!.messageCount).toBe(0);
    expect(list[0]!.turnCount).toBe(0);
  });

  it("updates and clears provider_session_id", () => {
    repo.createSession({
      id: "s1",
      title: "T",
      agent: "claude",
      model: "m",
      providerSessionId: null,
      systemPrompt: null,
      cwd: "/s1",
      createdAt: 0,
    });
    repo.updateProviderSessionId("s1", "claude-abc");
    expect(repo.getSession("s1")?.providerSessionId).toBe("claude-abc");
    repo.clearProviderSessionId("s1");
    expect(repo.getSession("s1")?.providerSessionId).toBeNull();
  });

  it("allSessions returns the raw rows without counts", () => {
    repo.createSession({
      id: "s1",
      title: "T",
      agent: "claude",
      model: "m",
      providerSessionId: null,
      systemPrompt: null,
      cwd: "/s1",
      createdAt: 0,
    });
    const all = repo.allSessions();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe("s1");
  });

  it("getSession returns null for missing id", () => {
    expect(repo.getSession("nope")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: FAIL — `./repository.js` does not exist.

- [ ] **Step 4: Implement `packages/backend/src/db/repository.ts` with sessions only (turns + messages added in Tasks 16–17)**

```ts
import type { SessionSummary } from "@agent-team/shared";
import type { Db } from "./connection.js";
import type { NewSession, SessionRow } from "./types.js";

type SessionDbRow = {
  id: string;
  title: string;
  agent: string;
  model: string;
  provider_session_id: string | null;
  system_prompt: string | null;
  cwd: string;
  created_at: number;
  last_message_at: number;
};

function rowToSession(r: SessionDbRow): SessionRow {
  return {
    id: r.id,
    title: r.title,
    agent: r.agent,
    model: r.model,
    providerSessionId: r.provider_session_id,
    systemPrompt: r.system_prompt,
    cwd: r.cwd,
    createdAt: r.created_at,
    lastMessageAt: r.last_message_at,
  };
}

export class Repository {
  constructor(private readonly db: Db) {}

  // ==== Sessions ====

  createSession(input: NewSession): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, title, agent, model, provider_session_id,
           system_prompt, cwd, created_at, last_message_at)
         VALUES (@id, @title, @agent, @model, @providerSessionId,
           @systemPrompt, @cwd, @createdAt, @lastMessageAt)`,
      )
      .run({
        ...input,
        lastMessageAt: input.lastMessageAt ?? input.createdAt,
      });
  }

  getSession(id: string): SessionRow | null {
    const r = this.db
      .prepare(`SELECT * FROM sessions WHERE id = ?`)
      .get(id) as SessionDbRow | undefined;
    return r ? rowToSession(r) : null;
  }

  allSessions(): SessionRow[] {
    const rs = this.db
      .prepare(`SELECT * FROM sessions ORDER BY last_message_at DESC`)
      .all() as SessionDbRow[];
    return rs.map(rowToSession);
  }

  listSessions(): SessionSummary[] {
    const rows = this.db
      .prepare(
        `SELECT s.*,
                (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS msg_count,
                (SELECT COUNT(*) FROM turns t WHERE t.session_id = s.id)   AS turn_count
         FROM sessions s
         ORDER BY s.last_message_at DESC`,
      )
      .all() as (SessionDbRow & { msg_count: number; turn_count: number })[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      agent: r.agent,
      model: r.model,
      lastMessageAt: r.last_message_at,
      messageCount: r.msg_count,
      turnCount: r.turn_count,
    }));
  }

  updateProviderSessionId(sessionId: string, providerSessionId: string): void {
    this.db
      .prepare(`UPDATE sessions SET provider_session_id = ? WHERE id = ?`)
      .run(providerSessionId, sessionId);
  }

  clearProviderSessionId(sessionId: string): void {
    this.db
      .prepare(`UPDATE sessions SET provider_session_id = NULL WHERE id = ?`)
      .run(sessionId);
  }

  runTx<T>(fn: () => T): T {
    const tx = this.db.transaction(fn);
    return tx();
  }
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: PASS — all 5 sessions cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/db/types.ts \
        packages/backend/src/db/repository.ts \
        packages/backend/src/db/sessions.test.ts
git commit -m "feat(backend): add Repository with sessions CRUD"
```

### Task 16: Turns repository methods

**Files:**
- Modify: `packages/backend/src/db/repository.ts`
- Create: `packages/backend/src/db/turns.test.ts`

- [ ] **Step 1: Write the failing turns test**

Create `packages/backend/src/db/turns.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./connection.js";
import { Repository } from "./repository.js";

const seedSession = (r: Repository, id = "s1") => {
  r.createSession({
    id,
    title: "T",
    agent: "claude",
    model: "m",
    providerSessionId: null,
    systemPrompt: null,
    cwd: `/${id}`,
    createdAt: 0,
  });
};

describe("Repository — turns", () => {
  let db: Db;
  let repo: Repository;

  beforeEach(() => {
    db = openDb(":memory:");
    repo = new Repository(db);
    seedSession(repo);
  });

  it("inserts and retrieves a turn", () => {
    repo.insertTurn({
      id: "t1",
      sessionId: "s1",
      sequenceNum: 1,
      status: "in_progress",
      preTurnCommit: "abc",
      firstUserText: "hello",
      createdAt: 10,
    });
    const got = repo.getTurn("t1");
    expect(got?.status).toBe("in_progress");
    expect(got?.postTurnCommit).toBeNull();
    expect(got?.stopReason).toBeNull();
  });

  it("lists turns by session ordered by sequence_num asc", () => {
    repo.insertTurn({
      id: "t2",
      sessionId: "s1",
      sequenceNum: 2,
      status: "completed",
      preTurnCommit: "x",
      firstUserText: "b",
      createdAt: 20,
    });
    repo.insertTurn({
      id: "t1",
      sessionId: "s1",
      sequenceNum: 1,
      status: "completed",
      preTurnCommit: "x",
      firstUserText: "a",
      createdAt: 10,
    });
    const list = repo.listTurnsBySession("s1");
    expect(list.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("latestTurn returns the highest sequence_num", () => {
    for (const [id, seq] of [["t1", 1], ["t2", 3], ["t3", 2]] as const) {
      repo.insertTurn({
        id,
        sessionId: "s1",
        sequenceNum: seq,
        status: "completed",
        preTurnCommit: "c",
        firstUserText: "u",
        createdAt: seq,
      });
    }
    expect(repo.latestTurn("s1")?.id).toBe("t2");
  });

  it("turnsAfter returns turns with sequence_num > n", () => {
    for (let seq = 1; seq <= 3; seq++) {
      repo.insertTurn({
        id: `t${seq}`,
        sessionId: "s1",
        sequenceNum: seq,
        status: "completed",
        preTurnCommit: "c",
        firstUserText: "u",
        createdAt: seq,
      });
    }
    const after = repo.turnsAfter("s1", 1);
    expect(after.map((t) => t.id)).toEqual(["t2", "t3"]);
  });

  it("turnsByStatus filters by status", () => {
    repo.insertTurn({
      id: "t1",
      sessionId: "s1",
      sequenceNum: 1,
      status: "in_progress",
      preTurnCommit: "c",
      firstUserText: "u",
      createdAt: 1,
    });
    repo.insertTurn({
      id: "t2",
      sessionId: "s1",
      sequenceNum: 2,
      status: "completed",
      preTurnCommit: "c",
      firstUserText: "u",
      createdAt: 2,
    });
    expect(repo.turnsByStatus("s1", "in_progress").map((t) => t.id)).toEqual(["t1"]);
    expect(repo.turnsByStatus("s1", "completed").map((t) => t.id)).toEqual(["t2"]);
  });

  it("updateTurn patches the status, stop_reason, usage, post_turn_commit, completed_at", () => {
    repo.insertTurn({
      id: "t1",
      sessionId: "s1",
      sequenceNum: 1,
      status: "in_progress",
      preTurnCommit: "c",
      firstUserText: "u",
      createdAt: 1,
    });
    repo.updateTurn("t1", {
      status: "completed",
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 5 },
      postTurnCommit: "after",
      completedAt: 42,
    });
    const got = repo.getTurn("t1")!;
    expect(got.status).toBe("completed");
    expect(got.stopReason).toBe("end_turn");
    expect(got.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(got.postTurnCommit).toBe("after");
    expect(got.completedAt).toBe(42);
  });

  it("deleteTurns removes turns and cascades referenced messages", () => {
    repo.insertTurn({
      id: "t1",
      sessionId: "s1",
      sequenceNum: 1,
      status: "completed",
      preTurnCommit: "c",
      firstUserText: "u",
      createdAt: 1,
    });
    repo.insertMessage({
      id: "m1",
      sessionId: "s1",
      turnId: "t1",
      role: "user",
      blocksJson: "[]",
      createdAt: 1,
    });
    repo.deleteTurns(["t1"]);
    expect(repo.getTurn("t1")).toBeNull();
    expect(repo.listMessagesBySession("s1")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: FAIL — `Repository` does not yet have `insertTurn / getTurn / …`. Also `insertMessage / listMessagesBySession` are referenced; they are implemented in Task 17 but we add their stubs in Task 16 Step 3 to keep the single-file repository linearly growable.

- [ ] **Step 3: Replace `packages/backend/src/db/repository.ts` wholesale**

Because TypeScript does not support partial class bodies, we replace the file in full. The new version combines sessions (from Task 15) + turns (this task) + message CRUD (the stub here is already the final implementation; Task 17 only adds dedicated messages tests):

```ts
import type { SessionSummary } from "@agent-team/shared";
import type { Db } from "./connection.js";
import type {
  MessageRow,
  NewMessage,
  NewSession,
  NewTurn,
  SessionRow,
  TurnPatch,
  TurnRow,
  TurnStatus,
} from "./types.js";

type SessionDbRow = {
  id: string;
  title: string;
  agent: string;
  model: string;
  provider_session_id: string | null;
  system_prompt: string | null;
  cwd: string;
  created_at: number;
  last_message_at: number;
};

type TurnDbRow = {
  id: string;
  session_id: string;
  sequence_num: number;
  status: string;
  stop_reason: string | null;
  usage_json: string | null;
  pre_turn_commit: string;
  post_turn_commit: string | null;
  first_user_text: string;
  created_at: number;
  completed_at: number | null;
};

type MessageDbRow = {
  id: string;
  session_id: string;
  turn_id: string;
  role: string;
  blocks_json: string;
  blocks_schema_version: number;
  stop_reason: string | null;
  usage_json: string | null;
  created_at: number;
};

function rowToSession(r: SessionDbRow): SessionRow {
  return {
    id: r.id,
    title: r.title,
    agent: r.agent,
    model: r.model,
    providerSessionId: r.provider_session_id,
    systemPrompt: r.system_prompt,
    cwd: r.cwd,
    createdAt: r.created_at,
    lastMessageAt: r.last_message_at,
  };
}

function rowToTurn(r: TurnDbRow): TurnRow {
  return {
    id: r.id,
    sessionId: r.session_id,
    sequenceNum: r.sequence_num,
    status: r.status as TurnRow["status"],
    stopReason: (r.stop_reason as TurnRow["stopReason"]) ?? null,
    usage: r.usage_json ? (JSON.parse(r.usage_json) as TurnRow["usage"]) : null,
    preTurnCommit: r.pre_turn_commit,
    postTurnCommit: r.post_turn_commit,
    firstUserText: r.first_user_text,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

function rowToMessage(r: MessageDbRow): MessageRow {
  return {
    id: r.id,
    sessionId: r.session_id,
    turnId: r.turn_id,
    role: r.role as MessageRow["role"],
    blocksJson: r.blocks_json,
    blocksSchemaVersion: r.blocks_schema_version,
    stopReason: (r.stop_reason as MessageRow["stopReason"]) ?? null,
    usage: r.usage_json ? (JSON.parse(r.usage_json) as MessageRow["usage"]) : null,
    createdAt: r.created_at,
  };
}

export class Repository {
  constructor(private readonly db: Db) {}

  // ==== Sessions ====

  createSession(input: NewSession): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, title, agent, model, provider_session_id,
           system_prompt, cwd, created_at, last_message_at)
         VALUES (@id, @title, @agent, @model, @providerSessionId,
           @systemPrompt, @cwd, @createdAt, @lastMessageAt)`,
      )
      .run({
        ...input,
        lastMessageAt: input.lastMessageAt ?? input.createdAt,
      });
  }

  getSession(id: string): SessionRow | null {
    const r = this.db
      .prepare(`SELECT * FROM sessions WHERE id = ?`)
      .get(id) as SessionDbRow | undefined;
    return r ? rowToSession(r) : null;
  }

  allSessions(): SessionRow[] {
    const rs = this.db
      .prepare(`SELECT * FROM sessions ORDER BY last_message_at DESC`)
      .all() as SessionDbRow[];
    return rs.map(rowToSession);
  }

  listSessions(): SessionSummary[] {
    const rows = this.db
      .prepare(
        `SELECT s.*,
                (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS msg_count,
                (SELECT COUNT(*) FROM turns t WHERE t.session_id = s.id)   AS turn_count
         FROM sessions s
         ORDER BY s.last_message_at DESC`,
      )
      .all() as (SessionDbRow & { msg_count: number; turn_count: number })[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      agent: r.agent,
      model: r.model,
      lastMessageAt: r.last_message_at,
      messageCount: r.msg_count,
      turnCount: r.turn_count,
    }));
  }

  updateProviderSessionId(sessionId: string, providerSessionId: string): void {
    this.db
      .prepare(`UPDATE sessions SET provider_session_id = ? WHERE id = ?`)
      .run(providerSessionId, sessionId);
  }

  clearProviderSessionId(sessionId: string): void {
    this.db
      .prepare(`UPDATE sessions SET provider_session_id = NULL WHERE id = ?`)
      .run(sessionId);
  }

  // ==== Turns ====

  insertTurn(input: NewTurn): void {
    this.db
      .prepare(
        `INSERT INTO turns (id, session_id, sequence_num, status, stop_reason,
           usage_json, pre_turn_commit, post_turn_commit, first_user_text,
           created_at, completed_at)
         VALUES (@id, @sessionId, @sequenceNum, @status, @stopReason,
           @usageJson, @preTurnCommit, @postTurnCommit, @firstUserText,
           @createdAt, @completedAt)`,
      )
      .run({
        id: input.id,
        sessionId: input.sessionId,
        sequenceNum: input.sequenceNum,
        status: input.status,
        stopReason: input.stopReason ?? null,
        usageJson: input.usage ? JSON.stringify(input.usage) : null,
        preTurnCommit: input.preTurnCommit,
        postTurnCommit: input.postTurnCommit ?? null,
        firstUserText: input.firstUserText,
        createdAt: input.createdAt,
        completedAt: input.completedAt ?? null,
      });
  }

  getTurn(id: string): TurnRow | null {
    const r = this.db
      .prepare(`SELECT * FROM turns WHERE id = ?`)
      .get(id) as TurnDbRow | undefined;
    return r ? rowToTurn(r) : null;
  }

  listTurnsBySession(sessionId: string): TurnRow[] {
    const rs = this.db
      .prepare(
        `SELECT * FROM turns WHERE session_id = ? ORDER BY sequence_num ASC`,
      )
      .all(sessionId) as TurnDbRow[];
    return rs.map(rowToTurn);
  }

  latestTurn(sessionId: string): TurnRow | null {
    const r = this.db
      .prepare(
        `SELECT * FROM turns WHERE session_id = ?
         ORDER BY sequence_num DESC LIMIT 1`,
      )
      .get(sessionId) as TurnDbRow | undefined;
    return r ? rowToTurn(r) : null;
  }

  turnsAfter(sessionId: string, sequenceNum: number): TurnRow[] {
    const rs = this.db
      .prepare(
        `SELECT * FROM turns WHERE session_id = ? AND sequence_num > ?
         ORDER BY sequence_num ASC`,
      )
      .all(sessionId, sequenceNum) as TurnDbRow[];
    return rs.map(rowToTurn);
  }

  turnsByStatus(sessionId: string, status: TurnStatus): TurnRow[] {
    const rs = this.db
      .prepare(
        `SELECT * FROM turns WHERE session_id = ? AND status = ?
         ORDER BY sequence_num ASC`,
      )
      .all(sessionId, status) as TurnDbRow[];
    return rs.map(rowToTurn);
  }

  updateTurn(id: string, patch: TurnPatch): void {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };
    if (patch.status !== undefined) {
      sets.push("status = @status");
      params.status = patch.status;
    }
    if (patch.stopReason !== undefined) {
      sets.push("stop_reason = @stopReason");
      params.stopReason = patch.stopReason;
    }
    if (patch.usage !== undefined) {
      sets.push("usage_json = @usageJson");
      params.usageJson = patch.usage ? JSON.stringify(patch.usage) : null;
    }
    if (patch.postTurnCommit !== undefined) {
      sets.push("post_turn_commit = @postTurnCommit");
      params.postTurnCommit = patch.postTurnCommit;
    }
    if (patch.completedAt !== undefined) {
      sets.push("completed_at = @completedAt");
      params.completedAt = patch.completedAt;
    }
    if (sets.length === 0) return;
    this.db
      .prepare(`UPDATE turns SET ${sets.join(", ")} WHERE id = @id`)
      .run(params);
  }

  deleteTurns(ids: string[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    this.db
      .prepare(`DELETE FROM turns WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  // ==== Messages (stub — real impl in Task 17) ====

  insertMessage(input: NewMessage): void {
    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, turn_id, role, blocks_json,
           blocks_schema_version, stop_reason, usage_json, created_at)
         VALUES (@id, @sessionId, @turnId, @role, @blocksJson,
           @blocksSchemaVersion, @stopReason, @usageJson, @createdAt)`,
      )
      .run({
        id: input.id,
        sessionId: input.sessionId,
        turnId: input.turnId,
        role: input.role,
        blocksJson: input.blocksJson,
        blocksSchemaVersion: input.blocksSchemaVersion ?? 1,
        stopReason: input.stopReason ?? null,
        usageJson: input.usage ? JSON.stringify(input.usage) : null,
        createdAt: input.createdAt,
      });
    this.db
      .prepare(`UPDATE sessions SET last_message_at = ? WHERE id = ?`)
      .run(input.createdAt, input.sessionId);
  }

  // MessageRow deliberately keeps `blocksJson` as a raw string. Consumers
  // (e.g. SessionService building `session.ready` in Chunk 6) are responsible
  // for parsing to `Block[]`. Keeping the repo JSON-agnostic avoids double
  // parse/stringify when a caller only needs counts or metadata.
  listMessagesBySession(sessionId: string): MessageRow[] {
    const rs = this.db
      .prepare(
        `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC`,
      )
      .all(sessionId) as MessageDbRow[];
    return rs.map(rowToMessage);
  }

  // ==== Transactions ====

  // SYNCHRONOUS ONLY. Do not `await` inside `fn`. Any async op (git, network,
  // subprocess) must run OUTSIDE the transaction — see spec §6.6 rollback,
  // which commits the DB tx first and runs `git resetTo` afterwards.
  runTx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: PASS — all 7 turns cases green, existing sessions cases still green.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/repository.ts packages/backend/src/db/turns.test.ts
git commit -m "feat(backend): add turns CRUD + message stubs in Repository"
```

### Task 17: Messages repository tests (formalize)

**Files:**
- Create: `packages/backend/src/db/messages.test.ts`

The message CRUD methods were added to `repository.ts` in Task 16 (because `deleteTurns`'s cascade test needed them). Task 17 adds a dedicated test file that exercises the messages-specific behavior end-to-end.

- [ ] **Step 1: Write the failing messages test**

Create `packages/backend/src/db/messages.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./connection.js";
import { Repository } from "./repository.js";

const seed = (r: Repository) => {
  r.createSession({
    id: "s1",
    title: "T",
    agent: "claude",
    model: "m",
    providerSessionId: null,
    systemPrompt: null,
    cwd: "/s1",
    createdAt: 0,
  });
  r.insertTurn({
    id: "t1",
    sessionId: "s1",
    sequenceNum: 1,
    status: "in_progress",
    preTurnCommit: "c",
    firstUserText: "u",
    createdAt: 1,
  });
};

describe("Repository — messages", () => {
  let db: Db;
  let repo: Repository;

  beforeEach(() => {
    db = openDb(":memory:");
    repo = new Repository(db);
    seed(repo);
  });

  it("inserts a user message and bumps session.last_message_at", () => {
    repo.insertMessage({
      id: "m1",
      sessionId: "s1",
      turnId: "t1",
      role: "user",
      blocksJson: JSON.stringify([{ type: "text", text: "hi" }]),
      createdAt: 100,
    });
    const s = repo.getSession("s1")!;
    expect(s.lastMessageAt).toBe(100);
  });

  it("persists and re-hydrates a Block[] via blocksJson round-trip", () => {
    const blocks = [
      { type: "text", text: "a" },
      { type: "thinking", text: "b" },
      { type: "tool_use", toolCallId: "c", name: "Bash", input: { cmd: "ls" } },
    ];
    repo.insertMessage({
      id: "m1",
      sessionId: "s1",
      turnId: "t1",
      role: "assistant",
      blocksJson: JSON.stringify(blocks),
      createdAt: 50,
    });
    const got = repo.listMessagesBySession("s1");
    expect(got).toHaveLength(1);
    expect(JSON.parse(got[0]!.blocksJson)).toEqual(blocks);
    expect(got[0]!.blocksSchemaVersion).toBe(1);
  });

  it("orders messages by created_at ASC within a session", () => {
    repo.insertMessage({
      id: "m2",
      sessionId: "s1",
      turnId: "t1",
      role: "assistant",
      blocksJson: "[]",
      createdAt: 20,
    });
    repo.insertMessage({
      id: "m1",
      sessionId: "s1",
      turnId: "t1",
      role: "user",
      blocksJson: "[]",
      createdAt: 10,
    });
    const list = repo.listMessagesBySession("s1");
    expect(list.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("stores TokenUsage and stopReason when provided on assistant messages", () => {
    repo.insertMessage({
      id: "m1",
      sessionId: "s1",
      turnId: "t1",
      role: "assistant",
      blocksJson: "[]",
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 3 },
      createdAt: 1,
    });
    const got = repo.listMessagesBySession("s1")[0]!;
    expect(got.stopReason).toBe("end_turn");
    expect(got.usage).toEqual({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 3 });
  });

  it("runTx runs the inner writes atomically", () => {
    expect(() =>
      repo.runTx(() => {
        repo.insertMessage({
          id: "m1",
          sessionId: "s1",
          turnId: "t1",
          role: "user",
          blocksJson: "[]",
          createdAt: 1,
        });
        // Second insert with duplicate PK — triggers rollback of whole tx.
        repo.insertMessage({
          id: "m1",
          sessionId: "s1",
          turnId: "t1",
          role: "user",
          blocksJson: "[]",
          createdAt: 2,
        });
      }),
    ).toThrow();
    expect(repo.listMessagesBySession("s1")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test and confirm it passes (no implementation change needed)**

Run:
```bash
pnpm --filter @agent-team/backend test
```
Expected: PASS — all 5 messages cases green. If any fail, it means Task 16's messages stub has a bug — fix it there, not here.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/db/messages.test.ts
git commit -m "test(backend): add messages repository coverage"
```

### Task 18: Wire DB into the entry point + exit-criteria smoke

**Files:**
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Update `packages/backend/src/index.ts` to open the DB at startup**

```ts
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadConfig } from "./config.js";
import { openDb } from "./db/connection.js";
import { Repository } from "./db/repository.js";
import { createHttpServer } from "./http/server.js";
import { createLogger } from "./logger.js";
import { attachWsServer } from "./ws/server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  mkdirSync(dirname(config.dbPath), { recursive: true });
  const db = openDb(config.dbPath);
  const repo = new Repository(db);
  logger.info({ dbPath: config.dbPath }, "db opened");
  // repo is threaded through in later chunks; reference to silence unused-var lint.
  void repo;

  const http = await createHttpServer({
    port: config.port,
    logger,
  });
  attachWsServer({ httpServer: http.server, path: "/ws", logger });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await http.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Build and verify**

Run:
```bash
pnpm --filter @agent-team/backend build
```
Expected: exits 0; `dist/db/schema.sql` exists alongside `dist/db/connection.js`.

- [ ] **Step 3: Smoke-run to confirm the DB file is created on startup**

```bash
cd "$(git rev-parse --show-toplevel)"
rm -f data/atelier.db data/atelier.db-journal data/atelier.db-wal data/atelier.db-shm
node packages/backend/dist/index.js &
SERVER_PID=$!
for i in 1 2 3 4 5; do
  if [ -f data/atelier.db ] && curl -sf http://127.0.0.1:3001/health > /dev/null; then break; fi
  sleep 1
done
test -f data/atelier.db && echo "db created OK" || { echo "db not created"; kill $SERVER_PID 2>/dev/null; exit 1; }
kill $SERVER_PID 2>/dev/null || true
```
Expected: prints `db created OK`.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/index.ts
git commit -m "feat(backend): open sqlite at startup, wire Repository"
```

### Chunk 3 exit criteria

- `pnpm -r test` passes (adds sessions/turns/messages suites to the previous HTTP + config + WS suites).
- `node packages/backend/dist/index.js` creates `data/atelier.db` with the three tables on first launch, reuses it on re-launch.
- Every repository method called by the spec's pseudocode (§6.6, §6.7) exists and is tested: `getSession`, `allSessions`, `listSessions`, `updateProviderSessionId`, `clearProviderSessionId`, `insertTurn`, `getTurn`, `listTurnsBySession`, `latestTurn`, `turnsAfter`, `turnsByStatus`, `updateTurn`, `deleteTurns`, `insertMessage`, `listMessagesBySession`, `runTx`.
- `data/` is in `.gitignore`; no `.db` files are ever committed.

---

## Chunk 4: EventBus + RingBufferSink + WsBroadcastSink

Goal: introduce the fan-out hub that every upstream event flows through, plus two of the three sinks. `EventBus` owns per-session `seq` assignment and `ts` stamping so sinks always see a fully-populated `WSEvent`. `RingBufferSink` keeps the last 500 non-heartbeat events per session for `sync` replay. `WsBroadcastSink` maintains a connection registry and pushes events down subscribed sockets. `MessagePersistSink` (stateful, accumulates blocks into Message rows) and the `ws/connection` wire-up are Chunk 5.

Design note: the bus is the **only** source of `seq`. Callers publish partial events via `Omit<WSEvent, "seq" | "ts">`; the bus stamps and dispatches. When a new connection opens for a session (Chunk 5), it calls `bus.resetSeq(sessionId)` so the counter restarts at 1 per spec §5.1a.

### Task 19: `EventBus` + `EventSink` interface

**Files:**
- Create: `packages/backend/src/bus/types.ts`
- Create: `packages/backend/src/bus/event-bus.ts`
- Create: `packages/backend/src/bus/event-bus.test.ts`

- [ ] **Step 1: Write `packages/backend/src/bus/types.ts`**

```ts
import type { WSEvent } from "@agent-team/shared";

export type EventContext = {
  sessionId: string;
  turnId?: string;
  subagentId?: string;
};

// DistributiveOmit preserves the discriminated-union structure of WSEvent.
// Plain `Omit<WSEvent, "seq" | "ts">` collapses the union (because
// `keyof (A | B | C)` is the *intersection* of keys, which discards the
// per-variant payload shape). That would make `bus.publish(...)` callers
// in later chunks impossible to type-check.
type DistributiveOmit<T, K extends keyof never> = T extends unknown
  ? Omit<T, K>
  : never;

export type PublishInput = DistributiveOmit<WSEvent, "seq" | "ts">;

// Sinks MUST treat `ev.seq` and `ev.ts` as read-only. They were stamped by
// the EventBus and are load-bearing for the sync/replay invariant. The
// single-stamper invariant is a convention, not enforced by the type.
export interface EventSink {
  handle(ev: WSEvent, ctx: EventContext): void;
}
```

**Note on spec alignment:** spec §6.4 describes seq/ts assignment as happening inside `WsBroadcastSink`. This plan deliberately refines that by centralizing stamping in `EventBus` instead. The reasons are:
1. the RingBufferSink needs `seq` too — dual stamping adds risk of divergence;
2. a single stamper makes the "seq is monotonic per session" invariant provable at the bus level; 
3. sinks become pure consumers, easier to test.
Spec §5.1a's reset-on-new-connection rule is preserved via `EventBus.resetSeq(sessionId)`, which ws/connection (Chunk 5) will call on connection open.

- [ ] **Step 2: Write the failing EventBus test**

Create `packages/backend/src/bus/event-bus.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { WSEvent } from "@agent-team/shared";
import { EventBus } from "./event-bus.js";
import type { EventContext, EventSink, PublishInput } from "./types.js";

const ping = (i = 1): PublishInput => ({
  type: "heartbeat",
  payload: {},
});

describe("EventBus", () => {
  it("assigns monotonic seq per session starting at 1", () => {
    const seen: WSEvent[] = [];
    const sink: EventSink = { handle: (ev) => seen.push(ev) };
    const bus = new EventBus([sink]);
    bus.publish(ping(), { sessionId: "s1" });
    bus.publish(ping(), { sessionId: "s1" });
    bus.publish(ping(), { sessionId: "s1" });
    expect(seen.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("assigns separate seq counters per session", () => {
    const seen: WSEvent[] = [];
    const sink: EventSink = { handle: (ev) => seen.push(ev) };
    const bus = new EventBus([sink]);
    bus.publish(ping(), { sessionId: "a" });
    bus.publish(ping(), { sessionId: "b" });
    bus.publish(ping(), { sessionId: "a" });
    expect(seen.map((e) => `${e.seq}@s`)).toEqual(["1@s", "1@s", "2@s"]);
  });

  it("stamps ts with current time (monotonic non-decreasing)", () => {
    const seen: WSEvent[] = [];
    const sink: EventSink = { handle: (ev) => seen.push(ev) };
    const bus = new EventBus([sink]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000));
    bus.publish(ping(), { sessionId: "s1" });
    vi.setSystemTime(new Date(1_000_100));
    bus.publish(ping(), { sessionId: "s1" });
    vi.useRealTimers();
    expect(seen[0]!.ts).toBe(1_000_000);
    expect(seen[1]!.ts).toBe(1_000_100);
  });

  it("fans out to all sinks in the order they were registered", () => {
    const calls: string[] = [];
    const a: EventSink = { handle: () => calls.push("a") };
    const b: EventSink = { handle: () => calls.push("b") };
    const c: EventSink = { handle: () => calls.push("c") };
    const bus = new EventBus([a, b, c]);
    bus.publish(ping(), { sessionId: "s1" });
    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("a throwing sink does not stop other sinks from receiving the event", () => {
    const calls: string[] = [];
    const crashy: EventSink = {
      handle: () => {
        throw new Error("boom");
      },
    };
    const good: EventSink = { handle: () => calls.push("good") };
    const bus = new EventBus([crashy, good], { onSinkError: () => {} });
    bus.publish(ping(), { sessionId: "s1" });
    expect(calls).toEqual(["good"]);
  });

  it("resetSeq rewinds the counter for exactly one session", () => {
    const seen: WSEvent[] = [];
    const sink: EventSink = { handle: (ev) => seen.push(ev) };
    const bus = new EventBus([sink]);
    bus.publish(ping(), { sessionId: "s1" });
    bus.publish(ping(), { sessionId: "s2" });
    bus.resetSeq("s1");
    bus.publish(ping(), { sessionId: "s1" });
    bus.publish(ping(), { sessionId: "s2" });
    expect(seen.map((e) => `${e.seq}`)).toEqual(["1", "1", "1", "2"]);
  });
});
```

- [ ] **Step 3: Run and confirm it fails**

```bash
pnpm --filter @agent-team/backend test
```
Expected: FAIL — `./event-bus.js` does not exist.

- [ ] **Step 4: Implement `packages/backend/src/bus/event-bus.ts`**

```ts
import type { WSEvent } from "@agent-team/shared";
import type { EventContext, EventSink, PublishInput } from "./types.js";

export type EventBusOptions = {
  // Called when a sink throws. Defaults to console.error. Tests override with noop.
  onSinkError?: (err: unknown, sinkIndex: number, ev: WSEvent) => void;
};

export class EventBus {
  private readonly seqBySession = new Map<string, number>();

  constructor(
    private readonly sinks: readonly EventSink[],
    private readonly opts: EventBusOptions = {},
  ) {}

  publish(input: PublishInput, ctx: EventContext): WSEvent {
    const nextSeq = (this.seqBySession.get(ctx.sessionId) ?? 0) + 1;
    this.seqBySession.set(ctx.sessionId, nextSeq);
    const ev = { ...input, seq: nextSeq, ts: Date.now() } as WSEvent;
    for (let i = 0; i < this.sinks.length; i++) {
      try {
        this.sinks[i]!.handle(ev, ctx);
      } catch (err) {
        const onError =
          this.opts.onSinkError ??
          ((e, idx) => {
            // eslint-disable-next-line no-console
            console.error("EventBus sink", idx, "threw:", e);
          });
        onError(err, i, ev);
      }
    }
    return ev;
  }

  resetSeq(sessionId: string): void {
    this.seqBySession.set(sessionId, 0);
  }

  peekSeq(sessionId: string): number {
    return this.seqBySession.get(sessionId) ?? 0;
  }
}
```

- [ ] **Step 5: Run and confirm it passes**

```bash
pnpm --filter @agent-team/backend test
```
Expected: PASS — all 6 cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/bus/types.ts \
        packages/backend/src/bus/event-bus.ts \
        packages/backend/src/bus/event-bus.test.ts
git commit -m "feat(backend): add EventBus with per-session seq + sink fan-out"
```

### Task 20: `RingBufferSink`

**Files:**
- Create: `packages/backend/src/bus/ring-buffer-sink.ts`
- Create: `packages/backend/src/bus/ring-buffer-sink.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/bus/ring-buffer-sink.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WSEvent } from "@agent-team/shared";
import { EventBus } from "./event-bus.js";
import { RingBufferSink } from "./ring-buffer-sink.js";

const heartbeat = (): { type: "heartbeat"; payload: Record<string, never> } => ({
  type: "heartbeat",
  payload: {},
});

// Non-heartbeat event we can publish repeatedly
const noisy = () =>
  ({ type: "block.text.delta", payload: { messageId: "m", blockIdx: 0, text: "x" } }) as const;

describe("RingBufferSink", () => {
  it("stores up to `capacity` non-heartbeat events per session", () => {
    const sink = new RingBufferSink({ capacity: 3 });
    const bus = new EventBus([sink]);
    for (let i = 0; i < 5; i++) bus.publish(noisy(), { sessionId: "s1" });
    const got = sink.replaySince("s1", 0);
    expect(got.map((e) => e.seq)).toEqual([3, 4, 5]);
  });

  it("never records heartbeat events", () => {
    const sink = new RingBufferSink({ capacity: 10 });
    const bus = new EventBus([sink]);
    bus.publish(heartbeat(), { sessionId: "s1" });
    bus.publish(noisy(), { sessionId: "s1" });
    bus.publish(heartbeat(), { sessionId: "s1" });
    bus.publish(noisy(), { sessionId: "s1" });
    const got = sink.replaySince("s1", 0);
    expect(got.map((e) => e.type)).toEqual(["block.text.delta", "block.text.delta"]);
  });

  it("replaySince returns only events with seq > sinceSeq", () => {
    const sink = new RingBufferSink({ capacity: 10 });
    const bus = new EventBus([sink]);
    for (let i = 0; i < 5; i++) bus.publish(noisy(), { sessionId: "s1" });
    const got = sink.replaySince("s1", 3);
    expect(got.map((e) => e.seq)).toEqual([4, 5]);
  });

  it("isolates ring buffers between sessions", () => {
    const sink = new RingBufferSink({ capacity: 10 });
    const bus = new EventBus([sink]);
    bus.publish(noisy(), { sessionId: "a" });
    bus.publish(noisy(), { sessionId: "b" });
    bus.publish(noisy(), { sessionId: "a" });
    expect(sink.replaySince("a", 0)).toHaveLength(2);
    expect(sink.replaySince("b", 0)).toHaveLength(1);
  });

  it("replaySince returns [] when sinceSeq exceeds latest", () => {
    const sink = new RingBufferSink({ capacity: 10 });
    const bus = new EventBus([sink]);
    bus.publish(noisy(), { sessionId: "s1" });
    expect(sink.replaySince("s1", 999)).toEqual([]);
  });

  it("replaySince returns [] for unknown session", () => {
    const sink = new RingBufferSink({ capacity: 10 });
    expect(sink.replaySince("nope", 0)).toEqual([]);
  });

  it("clear wipes a single session's buffer", () => {
    const sink = new RingBufferSink({ capacity: 10 });
    const bus = new EventBus([sink]);
    bus.publish(noisy(), { sessionId: "s1" });
    bus.publish(noisy(), { sessionId: "s2" });
    sink.clear("s1");
    expect(sink.replaySince("s1", 0)).toEqual([]);
    expect(sink.replaySince("s2", 0)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

```bash
pnpm --filter @agent-team/backend test
```
Expected: FAIL — `./ring-buffer-sink.js` does not exist.

- [ ] **Step 3: Implement `packages/backend/src/bus/ring-buffer-sink.ts`**

```ts
import type { WSEvent } from "@agent-team/shared";
import type { EventContext, EventSink } from "./types.js";

export type RingBufferOptions = {
  capacity: number;
};

// Simple per-session ring buffer. Non-heartbeat events only (spec §5.1a).
// Capacity is the max retained events; older entries are evicted FIFO.
export class RingBufferSink implements EventSink {
  private readonly buffers = new Map<string, WSEvent[]>();

  constructor(private readonly opts: RingBufferOptions) {
    if (opts.capacity <= 0) {
      throw new Error("RingBufferSink capacity must be > 0");
    }
  }

  handle(ev: WSEvent, ctx: EventContext): void {
    if (ev.type === "heartbeat") return;
    let buf = this.buffers.get(ctx.sessionId);
    if (!buf) {
      buf = [];
      this.buffers.set(ctx.sessionId, buf);
    }
    buf.push(ev);
    if (buf.length > this.opts.capacity) {
      buf.splice(0, buf.length - this.opts.capacity);
    }
  }

  replaySince(sessionId: string, sinceSeq: number): WSEvent[] {
    const buf = this.buffers.get(sessionId);
    if (!buf) return [];
    // Events are appended in seq order, so slice from the first > sinceSeq.
    const idx = buf.findIndex((e) => e.seq > sinceSeq);
    return idx === -1 ? [] : buf.slice(idx);
  }

  clear(sessionId: string): void {
    this.buffers.delete(sessionId);
  }
}
```

- [ ] **Step 4: Run and confirm it passes**

```bash
pnpm --filter @agent-team/backend test
```
Expected: PASS — all 7 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/bus/ring-buffer-sink.ts \
        packages/backend/src/bus/ring-buffer-sink.test.ts
git commit -m "feat(backend): add RingBufferSink for sync replay"
```

### Task 21: `WsBroadcastSink`

**Files:**
- Create: `packages/backend/src/bus/ws-broadcast-sink.ts`
- Create: `packages/backend/src/bus/ws-broadcast-sink.test.ts`

The sink maintains a registry of subscribed connections, one-or-more per session. Each subscription carries a callback that serializes + sends the event. Unsubscription is by connection id. Because MVP only has one active connection per session at a time, subscriptions are typically a single entry, but the registry is designed to handle N without assuming N=1.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/bus/ws-broadcast-sink.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WSEvent } from "@agent-team/shared";
import { EventBus } from "./event-bus.js";
import { WsBroadcastSink } from "./ws-broadcast-sink.js";

const noisy = () =>
  ({ type: "block.text.delta", payload: { messageId: "m", blockIdx: 0, text: "x" } }) as const;

describe("WsBroadcastSink", () => {
  it("routes events only to subscribers of the same session", () => {
    const sink = new WsBroadcastSink();
    const bus = new EventBus([sink]);
    const a: WSEvent[] = [];
    const b: WSEvent[] = [];
    sink.subscribe("s1", "conn-1", (ev) => a.push(ev));
    sink.subscribe("s2", "conn-2", (ev) => b.push(ev));
    bus.publish(noisy(), { sessionId: "s1" });
    bus.publish(noisy(), { sessionId: "s2" });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]!.seq).toBe(1);
    expect(b[0]!.seq).toBe(1);
  });

  it("broadcasts to all subscribers of a session", () => {
    const sink = new WsBroadcastSink();
    const bus = new EventBus([sink]);
    const a: WSEvent[] = [];
    const b: WSEvent[] = [];
    sink.subscribe("s1", "conn-1", (ev) => a.push(ev));
    sink.subscribe("s1", "conn-2", (ev) => b.push(ev));
    bus.publish(noisy(), { sessionId: "s1" });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("unsubscribing removes delivery", () => {
    const sink = new WsBroadcastSink();
    const bus = new EventBus([sink]);
    const received: WSEvent[] = [];
    sink.subscribe("s1", "conn-1", (ev) => received.push(ev));
    bus.publish(noisy(), { sessionId: "s1" });
    sink.unsubscribe("conn-1");
    bus.publish(noisy(), { sessionId: "s1" });
    expect(received).toHaveLength(1);
  });

  it("tolerates a sender callback that throws — other subscribers still receive", () => {
    const sink = new WsBroadcastSink({ onSenderError: () => {} });
    const bus = new EventBus([sink]);
    const good: WSEvent[] = [];
    sink.subscribe("s1", "bad", () => {
      throw new Error("socket closed");
    });
    sink.subscribe("s1", "good", (ev) => good.push(ev));
    bus.publish(noisy(), { sessionId: "s1" });
    expect(good).toHaveLength(1);
  });

  it("connectionCount reports active subscribers across sessions", () => {
    const sink = new WsBroadcastSink();
    sink.subscribe("a", "c1", () => {});
    sink.subscribe("a", "c2", () => {});
    sink.subscribe("b", "c3", () => {});
    expect(sink.connectionCount()).toBe(3);
    sink.unsubscribe("c2");
    expect(sink.connectionCount()).toBe(2);
  });

  it("publishing to a session with zero subscribers is a no-op", () => {
    const sink = new WsBroadcastSink();
    const bus = new EventBus([sink]);
    expect(() => bus.publish(noisy(), { sessionId: "orphan" })).not.toThrow();
  });

  it("other sinks still receive when WsBroadcastSink has zero subscribers for a session", () => {
    const sink = new WsBroadcastSink();
    const received: WSEvent[] = [];
    const recorder = { handle: (ev: WSEvent) => received.push(ev) };
    const bus = new EventBus([sink, recorder]);
    bus.publish(noisy(), { sessionId: "orphan" });
    expect(received).toHaveLength(1);
  });

  it("unsubscribe is idempotent for unknown connection ids", () => {
    const sink = new WsBroadcastSink();
    expect(() => sink.unsubscribe("never-existed")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

```bash
pnpm --filter @agent-team/backend test
```
Expected: FAIL — `./ws-broadcast-sink.js` does not exist.

- [ ] **Step 3: Implement `packages/backend/src/bus/ws-broadcast-sink.ts`**

```ts
import type { WSEvent } from "@agent-team/shared";
import type { EventContext, EventSink } from "./types.js";

export type SendFn = (ev: WSEvent) => void;

export type WsBroadcastOptions = {
  onSenderError?: (err: unknown, connectionId: string, ev: WSEvent) => void;
};

type Subscription = {
  connectionId: string;
  sessionId: string;
  send: SendFn;
};

export class WsBroadcastSink implements EventSink {
  private readonly bySession = new Map<string, Map<string, Subscription>>();
  private readonly byConnection = new Map<string, Subscription>();

  constructor(private readonly opts: WsBroadcastOptions = {}) {}

  subscribe(sessionId: string, connectionId: string, send: SendFn): void {
    const sub: Subscription = { sessionId, connectionId, send };
    let perSession = this.bySession.get(sessionId);
    if (!perSession) {
      perSession = new Map();
      this.bySession.set(sessionId, perSession);
    }
    perSession.set(connectionId, sub);
    this.byConnection.set(connectionId, sub);
  }

  unsubscribe(connectionId: string): void {
    const sub = this.byConnection.get(connectionId);
    if (!sub) return;
    this.byConnection.delete(connectionId);
    const perSession = this.bySession.get(sub.sessionId);
    if (perSession) {
      perSession.delete(connectionId);
      if (perSession.size === 0) this.bySession.delete(sub.sessionId);
    }
  }

  connectionCount(): number {
    return this.byConnection.size;
  }

  handle(ev: WSEvent, ctx: EventContext): void {
    const perSession = this.bySession.get(ctx.sessionId);
    if (!perSession) return;
    for (const sub of perSession.values()) {
      try {
        sub.send(ev);
      } catch (err) {
        const onErr =
          this.opts.onSenderError ??
          ((e, cid) => {
            // eslint-disable-next-line no-console
            console.error("WsBroadcastSink send failed for", cid, e);
          });
        onErr(err, sub.connectionId, ev);
      }
    }
  }
}
```

- [ ] **Step 4: Run and confirm it passes**

```bash
pnpm --filter @agent-team/backend test
```
Expected: PASS — all 7 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/bus/ws-broadcast-sink.ts \
        packages/backend/src/bus/ws-broadcast-sink.test.ts
git commit -m "feat(backend): add WsBroadcastSink with connection registry"
```

### Chunk 4 exit criteria

- `pnpm -r test` passes; bus suites add ~20 new test cases.
- `EventBus` is the single stamper of `seq` and `ts`; no other module assigns either field.
- `PublishInput` compiles as a proper distributive union (`DistributiveOmit<WSEvent, "seq" | "ts">`) — construction of a typed event like `{ type: "block.text.delta", payload: { messageId, blockIdx, text } }` must type-check when passed to `bus.publish`.
- `RingBufferSink.replaySince(sessionId, sinceSeq)` returns the correct slice or `[]` in every edge case covered by tests.
- `WsBroadcastSink` exposes `subscribe / unsubscribe / connectionCount / handle` and is the unique path from events to WebSockets.
- `EventBus.resetSeq` is defined and unit-tested (Task 19) but NOT yet called from anywhere; the call site lives in Chunk 5's `ws/connection`. This is expected.
- `index.ts` is NOT yet updated to use the bus — wiring lands in Chunk 5 along with `MessagePersistSink` and `ws/connection`.

---

## Chunk 5: MessagePersistSink + Bus Wire-up in `index.ts`

Goal: finish the bus trio by adding `MessagePersistSink` — a stateful sink that accumulates `Block[]` per in-flight assistant message and writes one `messages` row on `turn.end`. Then wire `EventBus` + all three sinks into `index.ts` and update `/metrics` to report real values from the sinks. `ws/connection` routing still waits for Chunk 6 where `SessionService` exists to receive C2S commands.

**Deferred inside this chunk:** `subagent.start` / `subagent.event` / `subagent.end` handling. `MessagePersistSink` records these as `raw` blocks for now; full `Block { type: "subagent" }` nesting is added later when `TurnOrchestrator` emits the events end-to-end. This keeps Chunk 5 focused.

### Task 22: `MessagePersistSink`

**Files:**
- Create: `packages/backend/src/bus/message-persist-sink.ts`
- Create: `packages/backend/src/bus/message-persist-sink.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/bus/message-persist-sink.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Block, WSEvent } from "@agent-team/shared";
import { openDb, type Db } from "../db/connection.js";
import { Repository } from "../db/repository.js";
import { EventBus } from "./event-bus.js";
import { MessagePersistSink } from "./message-persist-sink.js";

const seedSessionAndTurn = (r: Repository) => {
  r.createSession({
    id: "s1",
    title: "T",
    agent: "claude",
    model: "m",
    providerSessionId: null,
    systemPrompt: null,
    cwd: "/s1",
    createdAt: 0,
  });
  r.insertTurn({
    id: "t1",
    sessionId: "s1",
    sequenceNum: 1,
    status: "in_progress",
    preTurnCommit: "c0",
    firstUserText: "hi",
    createdAt: 1,
  });
};

describe("MessagePersistSink", () => {
  let db: Db;
  let repo: Repository;
  let sink: MessagePersistSink;
  let bus: EventBus;

  beforeEach(() => {
    db = openDb(":memory:");
    repo = new Repository(db);
    seedSessionAndTurn(repo);
    sink = new MessagePersistSink(repo);
    bus = new EventBus([sink]);
  });

  it("persists one assistant message on turn.end assembling text delta chunks", () => {
    bus.publish({ type: "turn.start", payload: { turnId: "t1", userMessage: {
      id: "mu", role: "user", blocks: [], turnId: "t1", createdAt: 1,
    } } }, { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "message.start", payload: { turnId: "t1", messageId: "ma", role: "assistant" } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "block.text.delta", payload: { messageId: "ma", blockIdx: 0, text: "He" } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "block.text.delta", payload: { messageId: "ma", blockIdx: 0, text: "llo" } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "message.end", payload: { messageId: "ma" } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "turn.end", payload: { turnId: "t1", stopReason: "end_turn",
                  usage: { inputTokens: 1, outputTokens: 2 } } },
                { sessionId: "s1", turnId: "t1" });

    const msgs = repo.listMessagesBySession("s1");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe("assistant");
    expect(msgs[0]!.stopReason).toBe("end_turn");
    expect(msgs[0]!.usage).toEqual({ inputTokens: 1, outputTokens: 2 });
    const blocks = JSON.parse(msgs[0]!.blocksJson) as Block[];
    expect(blocks).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("accumulates multi-block messages (text + tool_use + text) at distinct blockIdx", () => {
    bus.publish({ type: "turn.start", payload: { turnId: "t1", userMessage: {
      id: "mu", role: "user", blocks: [], turnId: "t1", createdAt: 1 } } },
      { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "message.start", payload: { turnId: "t1", messageId: "ma", role: "assistant" } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "block.text.delta", payload: { messageId: "ma", blockIdx: 0, text: "A" } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "block.tool_use",
                  payload: { messageId: "ma", blockIdx: 1, toolCallId: "c1", name: "Bash", input: { cmd: "ls" } } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "block.text.delta", payload: { messageId: "ma", blockIdx: 2, text: "B" } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "message.end", payload: { messageId: "ma" } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "turn.end", payload: { turnId: "t1", stopReason: "end_turn" } },
                { sessionId: "s1", turnId: "t1" });

    const blocks = JSON.parse(repo.listMessagesBySession("s1")[0]!.blocksJson) as Block[];
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({ type: "text", text: "A" });
    expect(blocks[1]).toEqual({ type: "tool_use", toolCallId: "c1", name: "Bash", input: { cmd: "ls" } });
    expect(blocks[2]).toEqual({ type: "text", text: "B" });
  });

  it("absorbs todo.update, skill.invoked, block.raw, thinking delta, tool_result", () => {
    bus.publish({ type: "turn.start", payload: { turnId: "t1", userMessage: {
      id: "mu", role: "user", blocks: [], turnId: "t1", createdAt: 1 } } },
      { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "message.start", payload: { turnId: "t1", messageId: "ma", role: "assistant" } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "block.thinking.delta", payload: { messageId: "ma", blockIdx: 0, text: "reason" } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "todo.update",
                  payload: { messageId: "ma", blockIdx: 1,
                             todos: [{ id: "t1", subject: "do", status: "pending" }] } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "skill.invoked",
                  payload: { messageId: "ma", blockIdx: 2, skillName: "sp:bs", source: "model" } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "block.raw",
                  payload: { messageId: "ma", blockIdx: 3, subtype: "future_v1", data: { x: 1 } } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "block.tool_result",
                  payload: { toolCallId: "ignored-routes-by-messageId", output: null, isError: false } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "message.end", payload: { messageId: "ma" } },
                { sessionId: "s1", turnId: "t1" });
    bus.publish({ type: "turn.end", payload: { turnId: "t1", stopReason: "end_turn" } },
                { sessionId: "s1", turnId: "t1" });

    const blocks = JSON.parse(repo.listMessagesBySession("s1")[0]!.blocksJson) as Block[];
    // tool_result is NOT added to the assistant message — tool_results belong
    // to the conceptual "user message returning tool output" in the SDK
    // protocol. For MVP Chunk 5 we simply drop it from the persisted assistant
    // blocks; the WS layer still broadcasts it. Frontend Phase 1 shows it
    // via the live event stream, not via the replayed history.
    expect(blocks).toEqual([
      { type: "thinking", text: "reason" },
      { type: "todo", todos: [{ id: "t1", subject: "do", status: "pending" }] },
      { type: "skill", skillName: "sp:bs" },
      { type: "raw", subtype: "future_v1", data: { x: 1 } },
    ]);
  });

  it("persists multiple assistant messages within a single turn", () => {
    bus.publish({ type: "turn.start", payload: { turnId: "t1", userMessage: {
      id: "mu", role: "user", blocks: [], turnId: "t1", createdAt: 1 } } },
      { sessionId: "s1", turnId: "t1" });
    for (const msgId of ["ma", "mb"]) {
      bus.publish({ type: "message.start", payload: { turnId: "t1", messageId: msgId, role: "assistant" } },
                  { sessionId: "s1", turnId: "t1" });
      bus.publish({ type: "block.text.delta", payload: { messageId: msgId, blockIdx: 0, text: msgId } },
                  { sessionId: "s1", turnId: "t1" });
      bus.publish({ type: "message.end", payload: { messageId: msgId } },
                  { sessionId: "s1", turnId: "t1" });
    }
    bus.publish({ type: "turn.end", payload: { turnId: "t1", stopReason: "end_turn" } },
                { sessionId: "s1", turnId: "t1" });

    const msgs = repo.listMessagesBySession("s1");
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m) => m.id)).toEqual(["ma", "mb"]);
    expect(JSON.parse(msgs[0]!.blocksJson)).toEqual([{ type: "text", text: "ma" }]);
    expect(JSON.parse(msgs[1]!.blocksJson)).toEqual([{ type: "text", text: "mb" }]);
  });

  it("drops state across turn.end so a new turn starts clean", () => {
    const pubAllForMsg = (turnId: string, msgId: string, text: string) => {
      bus.publish({ type: "turn.start", payload: { turnId, userMessage: {
        id: "mu", role: "user", blocks: [], turnId, createdAt: 1 } } },
        { sessionId: "s1", turnId });
      bus.publish({ type: "message.start", payload: { turnId, messageId: msgId, role: "assistant" } },
                  { sessionId: "s1", turnId });
      bus.publish({ type: "block.text.delta", payload: { messageId: msgId, blockIdx: 0, text } },
                  { sessionId: "s1", turnId });
      bus.publish({ type: "message.end", payload: { messageId: msgId } }, { sessionId: "s1", turnId });
      bus.publish({ type: "turn.end", payload: { turnId, stopReason: "end_turn" } }, { sessionId: "s1", turnId });
    };
    pubAllForMsg("t1", "ma", "first");
    repo.insertTurn({
      id: "t2", sessionId: "s1", sequenceNum: 2,
      status: "in_progress", preTurnCommit: "c1", firstUserText: "again", createdAt: 10,
    });
    pubAllForMsg("t2", "mb", "second");

    const msgs = repo.listMessagesBySession("s1");
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m) => m.turnId)).toEqual(["t1", "t2"]);
  });

  it("ignores events for unknown messageId without throwing", () => {
    expect(() => {
      bus.publish({ type: "block.text.delta", payload: { messageId: "nope", blockIdx: 0, text: "x" } },
                  { sessionId: "s1", turnId: "t1" });
    }).not.toThrow();
    // No message should exist — message.start never fired.
    expect(repo.listMessagesBySession("s1")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

```bash
pnpm --filter @agent-team/backend test
```
Expected: FAIL — `./message-persist-sink.js` does not exist.

- [ ] **Step 3: Implement `packages/backend/src/bus/message-persist-sink.ts`**

```ts
import type { Block, StopReason, TodoItem, TokenUsage, WSEvent } from "@agent-team/shared";
import type { Repository } from "../db/repository.js";
import type { EventContext, EventSink } from "./types.js";

type MessageAccum = {
  messageId: string;
  sessionId: string;
  turnId: string;
  blocks: Block[];
  createdAt: number;
};

export class MessagePersistSink implements EventSink {
  // messageId -> accumulator
  private readonly active = new Map<string, MessageAccum>();
  // turnId -> ordered list of messageIds that belong to it
  private readonly byTurn = new Map<string, string[]>();

  constructor(private readonly repo: Repository) {}

  handle(ev: WSEvent, ctx: EventContext): void {
    switch (ev.type) {
      case "turn.start":
        this.byTurn.set(ev.payload.turnId, []);
        return;

      case "message.start":
        this.active.set(ev.payload.messageId, {
          messageId: ev.payload.messageId,
          sessionId: ctx.sessionId,
          turnId: ev.payload.turnId,
          blocks: [],
          createdAt: ev.ts,
        });
        this.byTurn.get(ev.payload.turnId)?.push(ev.payload.messageId);
        return;

      case "block.text.delta":
        this.appendText(ev.payload.messageId, ev.payload.blockIdx, "text", ev.payload.text);
        return;

      case "block.thinking.delta":
        this.appendText(ev.payload.messageId, ev.payload.blockIdx, "thinking", ev.payload.text);
        return;

      case "block.tool_use":
        this.setBlock(ev.payload.messageId, ev.payload.blockIdx, {
          type: "tool_use",
          toolCallId: ev.payload.toolCallId,
          name: ev.payload.name,
          input: ev.payload.input,
        });
        return;

      case "block.tool_result":
        // tool_result events do not belong to the assistant message being
        // persisted. They are broadcast live for UI but not written into
        // the assistant's Block[]. See MVP Chunk 5 design note.
        return;

      case "block.raw":
        if (ev.payload.messageId !== undefined && ev.payload.blockIdx !== undefined) {
          this.setBlock(ev.payload.messageId, ev.payload.blockIdx, {
            type: "raw",
            subtype: ev.payload.subtype,
            data: ev.payload.data,
          });
        }
        return;

      case "todo.update":
        this.setBlock(ev.payload.messageId, ev.payload.blockIdx, {
          type: "todo",
          todos: ev.payload.todos,
        });
        return;

      case "skill.invoked": {
        const payload = ev.payload;
        const block: Block =
          payload.args !== undefined
            ? { type: "skill", skillName: payload.skillName, args: payload.args }
            : { type: "skill", skillName: payload.skillName };
        this.setBlock(payload.messageId, payload.blockIdx, block);
        return;
      }

      case "message.end":
        // No action — we flush on turn.end. `message.end` is a marker
        // for the WS/UI layer, not for persistence.
        return;

      case "turn.end":
        this.flushTurn(ev.payload.turnId, ev.payload.stopReason, ev.payload.usage);
        return;

      // Deferred events — covered when TurnOrchestrator emits them in later chunks.
      case "subagent.start":
      case "subagent.event":
      case "subagent.end":
      case "askuser.request":
      case "permission.request":
      case "session.ready":
      case "session.list.result":
      case "turn.list.result":
      case "session.rollback.complete":
      case "heartbeat":
      case "error":
        return;

      default: {
        const _exhaustive: never = ev;
        void _exhaustive;
        return;
      }
    }
  }

  private ensureAccum(messageId: string): MessageAccum | null {
    return this.active.get(messageId) ?? null;
  }

  private setBlock(messageId: string, blockIdx: number, block: Block): void {
    const m = this.ensureAccum(messageId);
    if (!m) return;
    m.blocks[blockIdx] = block;
  }

  private appendText(
    messageId: string,
    blockIdx: number,
    kind: "text" | "thinking",
    text: string,
  ): void {
    const m = this.ensureAccum(messageId);
    if (!m) return;
    const existing = m.blocks[blockIdx];
    if (existing && existing.type === kind) {
      existing.text += text;
    } else {
      m.blocks[blockIdx] = { type: kind, text };
    }
  }

  private flushTurn(
    turnId: string,
    stopReason: StopReason,
    usage: TokenUsage | undefined,
  ): void {
    const ids = this.byTurn.get(turnId);
    if (!ids) return;
    this.repo.runTx(() => {
      for (const id of ids) {
        const m = this.active.get(id);
        if (!m) continue;
        this.repo.insertMessage({
          id: m.messageId,
          sessionId: m.sessionId,
          turnId: m.turnId,
          role: "assistant",
          blocksJson: JSON.stringify(m.blocks),
          stopReason,
          usage: usage ?? null,
          createdAt: m.createdAt,
        });
      }
    });
    for (const id of ids) this.active.delete(id);
    this.byTurn.delete(turnId);
  }
}
```

- [ ] **Step 4: Run and confirm it passes**

```bash
pnpm --filter @agent-team/backend test
```
Expected: PASS — all 6 MessagePersistSink cases green, plus earlier suites still green.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/bus/message-persist-sink.ts \
        packages/backend/src/bus/message-persist-sink.test.ts
git commit -m "feat(backend): add MessagePersistSink (turn-end flush)"
```

### Task 23: Wire bus + sinks into `index.ts`, surface real `/metrics`

**Files:**
- Modify: `packages/backend/src/http/server.ts` (optional — already MetricsSource-compatible)
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Update `packages/backend/src/index.ts` to construct the bus + sinks**

```ts
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { EventBus } from "./bus/event-bus.js";
import { MessagePersistSink } from "./bus/message-persist-sink.js";
import { RingBufferSink } from "./bus/ring-buffer-sink.js";
import { WsBroadcastSink } from "./bus/ws-broadcast-sink.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db/connection.js";
import { Repository } from "./db/repository.js";
import { createHttpServer, type MetricsSource } from "./http/server.js";
import { createLogger } from "./logger.js";
import { attachWsServer } from "./ws/server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  mkdirSync(dirname(config.dbPath), { recursive: true });
  const db = openDb(config.dbPath);
  const repo = new Repository(db);
  logger.info({ dbPath: config.dbPath }, "db opened");

  const ringBuffer = new RingBufferSink({ capacity: 500 });
  const wsBroadcast = new WsBroadcastSink({
    onSenderError: (err, connectionId) =>
      logger.warn({ connectionId, err }, "ws send failed"),
  });
  const messagePersist = new MessagePersistSink(repo);
  const bus = new EventBus([wsBroadcast, ringBuffer, messagePersist], {
    onSinkError: (err, sinkIndex) =>
      logger.error({ sinkIndex, err }, "event sink threw"),
  });
  // `bus` will be handed to SessionService/TurnOrchestrator in Chunk 6.
  void bus;

  const metrics: MetricsSource = {
    activeSessions: () => 0, // filled in once SessionService exists (Chunk 6)
    wsConnections: () => wsBroadcast.connectionCount(),
    totalTurns: () => {
      const row = db.prepare("SELECT COUNT(*) AS c FROM turns").get() as { c: number };
      return row.c;
    },
    orphanedTurns: () => {
      const row = db
        .prepare("SELECT COUNT(*) AS c FROM turns WHERE status = 'orphaned'")
        .get() as { c: number };
      return row.c;
    },
  };

  const http = await createHttpServer({ port: config.port, logger, metrics });
  attachWsServer({ httpServer: http.server, path: "/ws", logger });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await http.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @agent-team/backend build
```
Expected: exits 0.

- [ ] **Step 3: Rerun the Chunk 2 HTTP/metrics smoke test (values still 0 but now computed)**

```bash
cd "$(git rev-parse --show-toplevel)"
rm -f data/atelier.db*
node packages/backend/dist/index.js &
SERVER_PID=$!
for i in 1 2 3 4 5; do
  if curl -sf http://127.0.0.1:3001/health > /dev/null; then break; fi
  sleep 1
done
METRICS=$(curl -sf http://127.0.0.1:3001/metrics)
echo "$METRICS" | grep -qE '^ws_connections\s+0'  || { echo "ws count missing"; kill $SERVER_PID 2>/dev/null; exit 1; }
echo "$METRICS" | grep -qE '^total_turns\s+0'     || { echo "total_turns missing"; kill $SERVER_PID 2>/dev/null; exit 1; }
echo "$METRICS" | grep -qE '^orphaned_turns\s+0'  || { echo "orphaned_turns missing"; kill $SERVER_PID 2>/dev/null; exit 1; }
echo "metrics OK"
kill $SERVER_PID 2>/dev/null || true
```
Expected: prints `metrics OK`.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/index.ts
git commit -m "feat(backend): wire EventBus + 3 sinks into startup; live /metrics"
```

### Chunk 5 exit criteria

- `pnpm -r test` passes; `MessagePersistSink` adds 6 cases.
- Running `node packages/backend/dist/index.js` still boots, serves `/health`, `/metrics` now reports `ws_connections` and `total_turns` from live sources (both 0 until Chunk 6 brings real traffic).
- All three sinks are constructed in `index.ts` in the order `[wsBroadcast, ringBuffer, messagePersist]`. `bus` is held as a binding but not yet consumed (consumer lands with `SessionService` / `TurnOrchestrator` in Chunk 6).
- `subagent.*` events are explicitly no-ops in `MessagePersistSink` for MVP (documented by a TODO-style comment referencing that Chunk 7 or beyond adds nested message persistence).
- WebSocket protocol dispatch (C2S routing) is still ping/pong only — full C2S handling lands in Chunk 6.

---

(Chunks 6 through 9 will be appended after Chunk 5 is reviewed and approved.)
