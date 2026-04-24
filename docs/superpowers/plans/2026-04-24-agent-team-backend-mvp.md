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
data/*.db
data/*.db-journal
workspaces/
.DS_Store
.vscode/
```

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

(The remaining chunks — 2 through 8 — will be appended after this chunk is reviewed and approved.)
