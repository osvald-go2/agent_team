# Agent Team Backend — MVP Design Spec

**Date:** 2026-04-23
**Status:** Draft — brainstorming approved
**Scope:** New TypeScript backend + rebuilt frontend for Atelier (agent_team)
**Repo layout:** Monorepo (pnpm workspaces) with `packages/shared`, `packages/backend`, `packages/frontend`

---

## 1. Problem & Goal

The current Atelier project is a frontend-only React prototype with fully
mocked data. There is no real agent runtime — `window.AppData` seeds every
entity and mutations live in React state only. To make the platform usable,
we need a backend that drives a real Claude-powered agent and a frontend
rebuilt to consume its event stream.

The MVP proves the end-to-end chain: user types a message → backend runs
Claude Code (via the Agent SDK) → tokens stream back → history persists and
can be resumed after restart. Non-chat features (Agents CRUD, Approvals,
Kanban, Canvas, etc.) are **out of MVP scope** — the protocol is designed so
they become additive later.

## 2. Goals

1. Run Claude Code (via `@anthropic-ai/claude-agent-sdk`) as the agent
   backing one chat session at a time.
2. Stream tokens, thinking, tool calls, subagents, TodoWrite, skills, and
   AskUserQuestion over a single WebSocket channel to the frontend.
3. Persist session metadata + message log in SQLite; resume prior sessions
   with full Claude-side context (via the SDK's `resume` mechanism).
4. Define a **provider-agnostic** protocol so a future Codex adapter drops
   in without breaking the frontend or the database.
5. Ship a new monorepo: `shared` (protocol types), `backend` (Node.js +
   SDK), `frontend` (Vite + React + TS + Zustand + Tailwind).
6. MVP acceptance criteria (Section 11) must all pass.

## 3. Non-goals (MVP)

- Agents CRUD, Skills CRUD, Templates, Knowledge base (prototype pages stay
  as reference in `legacy/`).
- Approvals / permission prompts UI (protocol reserves events; UI later).
- Multi-session concurrency — exactly one active session at a time.
- Multi-user / auth (localhost single-user only; no API key mgmt UI).
- Kanban / Canvas / TeamView integration (future phase).
- Workspace cleanup / quota enforcement.
- Observability beyond `/health` + minimal `/metrics`.
- Codex runner implementation (only the abstraction is in place).

## 4. Architecture

### 4.1 Monorepo layout

```
agent-team/
├── package.json                    # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json (or eslint/prettier)
├── .env.example
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   └── src/
│   │       ├── protocol.ts         # WSEvent union (source of truth)
│   │       ├── domain.ts           # Message, Block, TodoItem, etc.
│   │       └── index.ts
│   ├── backend/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts            # HTTP + WS entry
│   │       ├── config.ts
│   │       ├── ws/
│   │       │   ├── server.ts
│   │       │   └── connection.ts   # per-socket state, seq counter
│   │       ├── session/
│   │       │   ├── manager.ts      # single active session state machine
│   │       │   └── types.ts
│   │       ├── agent/
│   │       │   ├── runner.ts       # AgentRunner interface, AgentEvent union
│   │       │   ├── claude/
│   │       │   │   ├── runner.ts   # ClaudeAgentRunner
│   │       │   │   └── translator.ts
│   │       │   └── codex/          # placeholder; not implemented in MVP
│   │       │       └── .gitkeep
│   │       └── db/
│   │           ├── schema.sql
│   │           ├── connection.ts
│   │           └── repository.ts
│   └── frontend/
│       ├── package.json
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── ws/
│           │   ├── client.ts
│           │   └── useWsClient.ts
│           ├── state/
│           │   ├── session.store.ts
│           │   └── reducer.ts      # pure (state, event) => state
│           ├── components/
│           │   ├── Chat/
│           │   │   ├── ChatView.tsx
│           │   │   ├── MessageList.tsx
│           │   │   ├── Composer.tsx
│           │   │   └── blocks/
│           │   │       ├── TextBlock.tsx
│           │   │       ├── ThinkingBlock.tsx
│           │   │       ├── ToolUseBlock.tsx
│           │   │       ├── TodoBlock.tsx
│           │   │       ├── SubagentBlock.tsx
│           │   │       ├── SkillBlock.tsx
│           │   │       └── AskUserBlock.tsx
│           │   └── Shell/
│           │       ├── Sidebar.tsx
│           │       └── SessionList.tsx
│           └── styles/
├── legacy/
│   └── prototype/                  # current .jsx / .html moved here
└── docs/superpowers/specs/
```

### 4.2 Component responsibilities

- **`packages/shared`** — Protocol and domain types only. No runtime
  dependencies except TypeScript. Both backend and frontend depend on it.
  Any drift between client and server becomes a compile error.
- **`ws/`** — WebSocket lifecycle, per-connection `seq` counter, JSON
  serialization. Does **not** import anything from `agent/`.
- **`session/`** — Session state machine (create / load / active turn
  guard). Owns the current active session id. Routes WS requests to
  `agent/runner` and writes results to `db/repository`.
- **`agent/`** — AgentRunner interface + Claude implementation. Translates
  SDK events to internal `AgentEvent`. No knowledge of WebSocket, DB, or
  session manager beyond the callback it receives.
- **`db/`** — SQLite (better-sqlite3). Sessions and messages tables.
  Exposes a repository with typed queries. No other module talks SQL.

### 4.3 Data flow (one user turn)

```
Frontend Composer
  └─ ws.send({ type: "message.send", text })
       │
       ▼
Backend WS Handler
  └─ route → SessionManager.sendMessage()
       │
       ▼
SessionManager
  ├─ guard: no turn in progress
  ├─ db: insert user message
  ├─ emit: turn.start
  └─ AgentRunner.startTurn()
       │
       ▼
ClaudeAgentRunner
  ├─ sdk.query({ prompt, resume: sessionId, options... })
  └─ for each SDK event → translator → AgentEvent
       │
       ▼
SessionManager
  ├─ AgentEvent → WSEvent (e.g. text_delta → block.text.delta)
  ├─ emit to WS (with seq)
  └─ on turn_end: db insert assistant message, emit turn.end
```

## 5. Protocol (shared/src/protocol.ts)

### 5.1 Envelope

```ts
export type WSEvent<T extends string = string, P = unknown> = {
  type: T;
  seq: number;     // server-assigned, monotonic per WS connection
  ts: number;      // unix ms
  payload: P;
};
```

Client → server messages use the same envelope shape but `seq` is
server-assigned on broadcast echo; client may omit it on send.

### 5.2 Client → Server events

```ts
type C2S =
  | { type: "session.create"; payload: { agent: "claude" | "codex"; cwd?: string; systemPrompt?: string; model?: string } }
  | { type: "session.load";   payload: { sessionId: string } }
  | { type: "session.list";   payload: {} }
  | { type: "message.send";   payload: { text: string; clientTurnId?: string } }
  | { type: "turn.cancel";    payload: { turnId: string } }
  | { type: "askuser.respond"; payload: { requestId: string; answers: AskAnswer[] } }
  | { type: "permission.respond"; payload: { requestId: string; decision: "allow_once" | "allow_always" | "deny" } }
  | { type: "sync";           payload: { sessionId: string; sinceSeq: number } };
```

### 5.3 Server → Client events

```ts
type S2C =
  // Session lifecycle
  | { type: "session.ready";        payload: { sessionId: string; agent: string; model: string; messages: Message[]; lastSeq: number } }
  | { type: "session.list.result";  payload: { sessions: SessionSummary[] } }

  // Turn lifecycle
  | { type: "turn.start";           payload: { turnId: string; userMessage: Message } }
  | { type: "turn.end";             payload: { turnId: string; stopReason: StopReason; usage?: TokenUsage } }

  // Assistant message lifecycle
  | { type: "message.start";        payload: { turnId: string; messageId: string; role: "assistant" } }
  | { type: "message.end";          payload: { messageId: string } }

  // Content block deltas
  | { type: "block.text.delta";     payload: { messageId: string; blockIdx: number; text: string } }
  | { type: "block.thinking.delta"; payload: { messageId: string; blockIdx: number; text: string } }
  | { type: "block.tool_use";       payload: { messageId: string; blockIdx: number; toolCallId: string; name: string; input: unknown } }
  | { type: "block.tool_result";    payload: { toolCallId: string; output: unknown; isError: boolean } }

  // Claude Code-native semantic events
  | { type: "todo.update";          payload: { messageId: string; blockIdx: number; todos: TodoItem[] } }
  | { type: "subagent.start";       payload: { subagentId: string; parentToolCallId: string; parentMessageId: string; subagentType: string; description: string; prompt: string } }
  | { type: "subagent.event";       payload: { subagentId: string; inner: WSEvent } }  // recursive
  | { type: "subagent.end";         payload: { subagentId: string; result: string; usage?: TokenUsage } }
  | { type: "skill.invoked";        payload: { messageId: string; blockIdx: number; skillName: string; args?: string; source: "user" | "model" } }
  | { type: "askuser.request";      payload: { requestId: string; toolCallId: string; questions: AskQuestion[] } }
  | { type: "permission.request";   payload: { requestId: string; toolCallId: string; tool: string; input: unknown } }

  // Operational
  | { type: "heartbeat";            payload: {} }
  | { type: "error";                payload: { code: ErrorCode; message: string; retriable: boolean; turnId?: string } };
```

### 5.4 Domain types (shared/src/domain.ts)

```ts
export type Message = {
  id: string;
  role: "user" | "assistant";
  blocks: Block[];
  createdAt: number;
};

export type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; toolCallId: string; name: string; input: unknown }
  | { type: "tool_result"; toolCallId: string; output: unknown; isError: boolean }
  | { type: "todo"; todos: TodoItem[] }
  | { type: "skill"; skillName: string; args?: string }
  | { type: "subagent"; subagentId: string; summary: string; messages: Message[] };

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
  | "end_turn" | "max_tokens" | "tool_use_pending" | "cancelled" | "error";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
};

export type ErrorCode =
  | "session.not_found" | "session.busy"
  | "turn.already_running" | "turn.not_found"
  | "provider.rate_limit" | "provider.auth" | "provider.network"
  | "internal";

export type SessionSummary = {
  id: string;
  title: string;
  agent: string;
  model: string;
  lastMessageAt: number;
  messageCount: number;
};
```

### 5.5 Edge-case coverage

| Case | Handling |
|---|---|
| WS drop mid-stream | Client reconnects, emits `sync { sessionId, sinceSeq }`; server replays events from its in-memory ring buffer (cap 500 events / session). If gap too large, server answers with fresh `session.ready` and client discards partial state. |
| Send while turn running | Server rejects with `error { code: "turn.already_running" }`. |
| Cancel mid-generation | `turn.cancel` → server calls SDK AbortController → `turn.end { stopReason: "cancelled" }`. |
| Provider rate limit | `error { code: "provider.rate_limit", retriable: true }`; session stays alive. |
| Invalid session load | `error { code: "session.not_found" }`; no `session.ready` emitted. |
| Long tool execution | Server emits `heartbeat` every 10 s while waiting on tool_result. |
| Server restart | Client WS closes → reconnects → new connection, `sinceSeq` invalid for old session → server sends fresh `session.ready`, client reloads messages from DB-backed history. |
| Empty response | `turn.start` → (no delta) → `turn.end { stopReason: "end_turn" }`. |

## 6. Backend design

### 6.1 AgentRunner abstraction

```ts
// agent/runner.ts
export interface AgentRunner {
  startTurn(input: StartTurnInput): AsyncIterable<AgentEvent>;
  cancel(turnId: string): Promise<void>;
  resume(sessionId: string): Promise<ResumeResult>;
}

export type AgentEvent =
  | { kind: "text_delta"; text: string }
  | { kind: "thinking_delta"; text: string }
  | { kind: "tool_use"; toolCallId: string; name: string; input: unknown }
  | { kind: "tool_result"; toolCallId: string; output: unknown; isError: boolean }
  | { kind: "todo_update"; todos: TodoItem[] }
  | { kind: "subagent_start"; subagentId: string; parentToolCallId: string; subagentType: string; description: string; prompt: string }
  | { kind: "subagent_event"; subagentId: string; inner: AgentEvent }
  | { kind: "subagent_end"; subagentId: string; result: string; usage?: TokenUsage }
  | { kind: "skill_invoked"; skillName: string; args?: string; source: "user" | "model" }
  | { kind: "askuser_request"; requestId: string; toolCallId: string; questions: AskQuestion[] }
  | { kind: "permission_request"; requestId: string; toolCallId: string; tool: string; input: unknown }
  | { kind: "turn_end"; stopReason: StopReason; usage?: TokenUsage };

export type StartTurnInput = {
  sessionId: string;
  providerSessionId?: string;  // opaque to core; stored per session for resume
  userText: string;
  turnId: string;
  abortSignal: AbortSignal;
};

export type ResumeResult = {
  providerSessionId: string;
  // any extra provider-specific state needed to resume (opaque)
};
```

`ClaudeAgentRunner` is the only implementation in MVP. `translator.ts`
turns `@anthropic-ai/claude-agent-sdk` stream events into `AgentEvent`. The
exact SDK surface is verified at implementation time; translator is the
single file that imports the SDK, so an SDK breaking change has one place
to fix.

### 6.2 Session manager

- Holds `activeSessionId: string | null` and `inFlightTurn: TurnState | null`.
- `create`: generate UUID, create workspace dir, insert DB row, emit
  `session.ready`.
- `load`: read DB, ask `AgentRunner.resume` for `providerSessionId`, emit
  `session.ready` with messages.
- `sendMessage`: guard no in-flight, create turn, call `startTurn`, pipe
  AgentEvents to WS, persist assistant message to DB on `turn_end`.
- `cancel`: call `AbortController.abort()`; translator must propagate to
  SDK abort.
- Only one session is active per backend process (MVP constraint).

### 6.3 DB schema

```sql
-- schema.sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  agent TEXT NOT NULL,                -- "claude" | "codex"
  model TEXT NOT NULL,
  provider_session_id TEXT,           -- opaque, used by SDK resume
  system_prompt TEXT,
  cwd TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                 -- "user" | "assistant"
  blocks_json TEXT NOT NULL,          -- JSON-serialized Block[]
  turn_id TEXT,                       -- null for legacy, set for new rows
  stop_reason TEXT,                   -- only for assistant
  usage_json TEXT,                    -- JSON TokenUsage
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_messages_session_created
  ON messages(session_id, created_at);
```

Message blocks are stored as JSON rather than normalized, because the
frontend consumes `Block[]` directly and the query pattern is always "give
me all blocks for a message." Normalization would add joins without query
flexibility benefit.

### 6.4 Runtime & configuration

```
# .env
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
DB_PATH=./data/atelier.db
WORKSPACE_ROOT=./workspaces
DEFAULT_MODEL=claude-sonnet-4-6
LOG_LEVEL=info
```

Each session gets `${WORKSPACE_ROOT}/${sessionId}/` as its Claude Code cwd.
Directories are created on `session.create`, never garbage-collected by
MVP. Backend binds `127.0.0.1` only (no remote exposure).

## 7. Frontend design

### 7.1 State management

Single Zustand store, reducer-driven:

```ts
// state/reducer.ts — PURE function, unit-testable without React
export function reduce(state: SessionState, event: WSEvent): SessionState {
  switch (event.type) {
    case "session.ready":   return { ...state, sessionId: event.payload.sessionId, messages: event.payload.messages };
    case "turn.start":      return { ...state, messages: [...state.messages, event.payload.userMessage], activeTurn: event.payload.turnId };
    case "block.text.delta": return appendTextDelta(state, event.payload);
    case "todo.update":     return upsertTodoBlock(state, event.payload);
    case "subagent.event":  return nestInSubagent(state, event.payload);
    // ... other cases
    default:                return state;
  }
}
```

The store sits on top:

```ts
// state/session.store.ts
export const useSessionStore = create<Store>((set, get) => ({
  state: initialState,
  dispatch: (event: WSEvent) => set({ state: reduce(get().state, event) }),
  // action creators call ws.send(...) from ws/client.ts
}));
```

### 7.2 WS client

- Wraps native WebSocket with:
  - Exponential backoff reconnect (1s → max 30s).
  - Connection open: emit `session.load` (if a prior sessionId in
    localStorage) or `session.create` (if fresh).
  - On reconnect: emit `sync { sinceSeq }` using the last-seen `seq`.
  - Dispatch every incoming event into the store.
- Exposed as `useWsClient()` hook for components.

### 7.3 Component hierarchy

```
<App>
  <Shell>
    <Sidebar>
      <SessionList />      # MVP: one hardcoded session is fine
    </Sidebar>
    <ChatView>
      <MessageList>
        {messages.map(m => <Message />)}
        Each <Message> renders its Block[]:
          <TextBlock> / <ThinkingBlock> / <ToolUseBlock>
          <TodoBlock> / <SubagentBlock> / <SkillBlock>
          <AskUserBlock>   # inline, blocks Composer until answered
      </MessageList>
      <Composer />         # textarea + send button
    </ChatView>
  </Shell>
</App>
```

### 7.4 MVP frontend scope

**Phase 1 — implemented and styled:**
- `TextBlock` (streaming markdown)
- `ThinkingBlock` (collapsed by default)
- `ToolUseBlock` (name + truncated input/output, expandable)

**Phase 1 — protocol wired but UI is a debug dump:**
- `TodoBlock`, `SubagentBlock`, `SkillBlock`, `AskUserBlock` render a
  `<pre>` of the event payload. Enough to prove events flow end-to-end;
  polished rendering is Phase 2.

AskUser in Phase 1 is minimally functional: a text input auto-replies
`answers[0].otherText = user's input`; multi-select / structured options
come in Phase 2.

### 7.5 Styling

Tailwind for utility classes. Color tokens and spacing are copied from
`legacy/prototype/styles.css` to keep visual continuity; `data-theme`
attribute contract is preserved so the existing Tweaks postMessage host
could plug in later (no MVP work on this).

## 8. Error handling

Errors are first-class protocol events, never out-of-band.

| Layer | Failure | Protocol behavior |
|---|---|---|
| WS transport | connection drop | client reconnects, server keeps session alive in memory |
| Protocol parse | bad JSON / unknown `type` | server logs warn, ignores (forward-compat) |
| Session op | not found / busy | `error` event, session unaffected |
| Turn op | concurrent send | `error { turn.already_running }` |
| SDK | rate limit / auth / network | `error { provider.* }`, turn ends with `stopReason: "error"`, session alive |
| Tool exec | tool throws | SDK emits `tool_result { isError: true }` as usual; Claude continues |
| Unhandled | exception in handler | `error { internal }`, process stays up (pino logs w/ stack) |

Invariant: **a failed turn never kills its session; a crashed session
never kills the backend process.**

## 9. Testing strategy

```
E2E (Playwright)
  1 happy-path test: open frontend, send message, assert streamed reply.
  1 persistence test: send message, reload backend, assert history loads.
  SDK calls stubbed with a fake runner.

Integration (backend, Vitest + supertest for WS)
  - Real WS server + mock AgentRunner feeding scripted AgentEvents.
  - Asserts protocol ordering: session.ready → turn.start → deltas → turn.end.
  - Guard tests: concurrent send rejected, sync replay works.

Unit
  - shared: type-level smoke tests (exhaustiveness checks on WSEvent).
  - backend/agent/claude/translator.ts: fixture SDK events → expected AgentEvent[].
  - backend/session/manager.ts: state machine transitions.
  - frontend/state/reducer.ts: event sequences → expected state.
  - frontend/ws/client.ts: reconnect + sync logic with mock WebSocket.
  - Component smoke tests with Vitest + React Testing Library.
```

`pnpm -r test` runs the whole pyramid.

## 10. Observability (MVP minimum)

- `GET /health` → `{ ok: true, version }`.
- `GET /metrics` → plain text (active session count, total turns, WS
  connections). Not Prometheus-formatted; curl-friendly.
- Structured JSON logs via `pino`. Log: WS connect/disconnect, session
  create/load, turn start/end, all errors.

## 11. MVP acceptance criteria

The MVP is "done" when all of the following pass on a clean machine:

1. `pnpm install && pnpm -r dev` starts both backend (3001) and frontend
   (5173) with zero manual steps.
2. Browser at `localhost:5173` shows the Chat view with an empty session.
3. Sending "Hello, write a hello-world Python script" produces a streamed
   reply with visible tool calls (Write), and `hello.py` appears in
   `workspaces/${sessionId}/`.
4. Shut down browser and backend; restart both; load the same session;
   prior messages are visible; a follow-up message continues with full
   Claude-side context intact.
5. Sending a second message while the first is still streaming yields a
   visible `turn.already_running` error; UI does not crash.
6. Forcing a network failure to the Anthropic API surfaces a
   `provider.network` error in the UI; backend and session stay alive.
7. Extended thinking, subagent (Task), TodoWrite, and skill invocation
   each produce the expected protocol event stream (verified via backend
   logs / `<pre>` dump blocks in frontend) even if their polished UIs are
   deferred to Phase 2.
8. `pnpm -r test` passes.

## 12. Future work (post-MVP, explicitly deferred)

- Codex runner (`packages/backend/src/agent/codex/`).
- Polished Phase 2 UIs for TodoBlock / SubagentBlock / SkillBlock /
  AskUserBlock.
- Permission request UI (protocol reserved).
- Multi-session concurrency (requires AgentRunner pooling).
- Agents / Skills / Knowledge CRUD backed by DB (prototype pages → real).
- Approvals panel wired to `permission.request` events.
- Workspace cleanup on session delete; quotas.
- AuthN/Z (single-user → multi-user).
- Proper `/metrics` (Prometheus) and OpenTelemetry tracing.
- Migrate away from legacy prototype entirely once Phase 2 is feature-parity.
