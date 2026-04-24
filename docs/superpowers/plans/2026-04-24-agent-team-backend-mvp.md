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

(Chunks 3 through 9 will be appended after Chunk 2 is reviewed and approved.)
