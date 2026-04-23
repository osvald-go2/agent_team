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
   backing one chat session at a time, with the internal architecture
   prepared to swap to a Claude Code CLI subprocess mode without
   refactoring surrounding code.
2. Stream tokens, thinking, tool calls, subagents, TodoWrite, skills, and
   AskUserQuestion over a single WebSocket channel to the frontend.
3. Persist session metadata + message log + per-turn state in SQLite.
   Resume prior sessions with full Claude-side context (via the SDK's
   `resume` mechanism in normal cases, or by replaying history into a
   fresh provider session after a rollback — see Goal 8).
4. Define a **provider-agnostic** protocol so a future Codex adapter drops
   in without breaking the frontend or the database.
5. Ship a new monorepo: `shared` (protocol types), `backend` (Node.js +
   SDK), `frontend` (Vite + React + TS + Zustand + Tailwind).
6. Tolerate unknown / future message shapes from Claude Code without data
   loss (exhaustive-switch translator + `block.raw` passthrough).
7. **Termination recovery:** a backend crash / `kill -9` mid-turn leaves
   the session loadable afterwards, with no phantom "in-flight" turn,
   no corrupt workspace, and no lost committed history.
8. **Session rollback:** the user can roll back a session to the state
   after any prior completed turn. The rollback atomically truncates
   DB messages/turns and restores the workspace files to their snapshot
   at that point; subsequent messages continue from the restored state.
9. MVP acceptance criteria (Section 11) must all pass.

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
- **Non-per-turn rollback granularity** (no per-message or free-range
  rollback). Rollback targets are strictly "end of turn N".
- **Preserving partial assistant output across a crash.** Messages are
  persisted on `turn_end` only; a turn killed mid-stream is discarded in
  full (see Section 6.7).
- Allowing the user or Claude to run their own `git` repo inside a
  session workspace (the workspace is reserved for our snapshot
  mechanism). If the user wants version-controlled work, they drive it
  outside the session workspace.

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
│   │       ├── domain.ts           # Message, Block, TodoItem, TurnSummary, etc.
│   │       └── index.ts
│   ├── backend/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts            # HTTP + WS entry; manual dependency wiring
│   │       ├── config.ts
│   │       ├── ws/
│   │       │   ├── server.ts
│   │       │   └── connection.ts   # per-socket state, seq counter
│   │       ├── bus/
│   │       │   ├── event-bus.ts    # fan-out hub
│   │       │   ├── ring-buffer-sink.ts
│   │       │   ├── ws-broadcast-sink.ts
│   │       │   └── message-persist-sink.ts
│   │       ├── session/
│   │       │   ├── session-service.ts   # CRUD + lifecycle (create/load/list)
│   │       │   ├── turn-orchestrator.ts # one-turn execution (guard+run+persist)
│   │       │   └── types.ts
│   │       ├── agent/
│   │       │   ├── runner.ts            # AgentRunner interface, AgentEvent union,
│   │       │   │                        #   TurnResponder interface
│   │       │   ├── claude/
│   │       │   │   ├── runner.ts        # ClaudeAgentRunner (dispatches to source)
│   │       │   │   ├── translator.ts    # SDKMessage → AgentEvent (exhaustive)
│   │       │   │   ├── source.ts        # interface ClaudeSource
│   │       │   │   └── sources/
│   │       │   │       ├── sdk-source.ts    # MVP default
│   │       │   │       └── cli-source.ts    # Phase 2 (placeholder file OK)
│   │       │   └── codex/               # placeholder; not implemented in MVP
│   │       │       └── .gitkeep
│   │       ├── workspace/
│   │       │   ├── workspace-manager.ts # per-session dir lifecycle
│   │       │   └── git-snapshot.ts      # init/pre-turn/post-turn commit, reset
│   │       ├── rollback/
│   │       │   └── rollback-service.ts  # atomic DB + workspace rollback
│   │       ├── recovery/
│   │       │   └── startup-recovery.ts  # scan orphaned turns, reset workspaces
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
│           │   │       ├── AskUserBlock.tsx
│           │   │       └── RawBlock.tsx
│           │   └── Shell/
│           │       ├── Sidebar.tsx
│           │       └── SessionList.tsx
│           └── styles/
├── legacy/
│   └── prototype/                  # current .jsx / .html moved here
└── docs/superpowers/specs/
```

### 4.2 Component responsibilities

Dependencies strictly flow downward; upper layers must not import lower
ones by-passing the abstractions.

- **`packages/shared`** — Protocol and domain types only. No runtime
  dependencies except TypeScript. Both backend and frontend depend on
  it. Any drift between client and server becomes a compile error.
- **`ws/`** — WebSocket lifecycle, per-connection `seq` counter, JSON
  serialization, routing C2S events to services. Does **not** import
  from `agent/`, `workspace/`, or `rollback/`.
- **`bus/`** — `EventBus` is the only path upstream events take to reach
  multiple sinks. Sinks are independently substitutable:
  - `RingBufferSink` — per-session replay buffer for `sync` reconnect.
  - `WsBroadcastSink` — per-connection send.
  - `MessagePersistSink` — accumulates block events within a turn and
    writes the assistant `Message` row on `turn.end`.
- **`session/`** — Split into two collaborators:
  - `SessionService` — session CRUD, `create / load / list`, ownership
    of "the one active session" in MVP.
  - `TurnOrchestrator` — runs a single turn: guard against concurrent
    runs, create turn row + pre-turn git commit, drive `AgentRunner`,
    publish events to `EventBus`, finalize post-turn commit + turn row
    + message row on completion.
- **`agent/`** — Provider-agnostic AgentRunner interface and Claude
  implementation. The Claude implementation further factors into:
  - `claude/runner.ts` — implements `AgentRunner`, delegates stream
    production to a configured `ClaudeSource`.
  - `claude/source.ts` — interface producing `AsyncIterable<SDKMessage>`.
  - `claude/sources/sdk-source.ts` — uses `@anthropic-ai/claude-agent-sdk`
    in-process. MVP default.
  - `claude/sources/cli-source.ts` — spawns `claude --output-format
    stream-json` as a subprocess and parses JSON lines. Phase 2; MVP may
    commit a stub file but ships `sdk-source` as the only working source.
  - `claude/translator.ts` — the **single** place that understands
    `SDKMessage` shapes; produces `AgentEvent[]`. Exhaustive switch +
    `never` guard + runtime `raw` fallback (Section 6.1).
- **`workspace/`** — Owns each session's filesystem sandbox at
  `${WORKSPACE_ROOT}/${sessionId}/`. `workspace-manager` creates/opens
  the dir; `git-snapshot` wraps `simple-git` to init, commit pre/post
  turn, and reset to a prior commit. No one else talks to git.
- **`rollback/`** — Orchestrates atomic rollback: validate target turn,
  stop any in-flight turn (should not happen — see 5.5), truncate
  `turns` + `messages` rows, call `git-snapshot.resetTo`, invalidate
  the session's `provider_session_id`, emit `session.rollback.complete`
  via the EventBus.
- **`recovery/`** — Runs once at startup before WS accepts connections.
  Scans for orphaned turns, marks them, resets their workspaces.
- **`db/`** — SQLite (better-sqlite3). Sessions / messages / turns
  tables. Exposes a typed repository. No other module talks SQL.

### 4.3 Data flow

**Normal turn:**

```
Frontend Composer
  └─ ws.send({ type: "message.send", text })
       │
       ▼
ws/server → SessionService.assertActive → TurnOrchestrator.run(userText)
       │
       ├─ db: insert user Message + turn row (status=in_progress)
       ├─ workspace: git commit pre-turn-${turnId}
       ├─ bus.publish(turn.start)
       │
       └─ AgentRunner.startTurn(input, responder)
            │
            ├─ ClaudeAgentRunner → ClaudeSource (SDK|CLI) → SDKMessage stream
            └─ translator → AgentEvent[] ──┐
                                            │
       TurnOrchestrator                     │
         for each AgentEvent:               │
           map AgentEvent → WSEvent         │
           bus.publish(wsEvent) ◀───────────┘
                │
                ├─ WsBroadcastSink → all connections on session
                ├─ RingBufferSink → append (excluding heartbeat)
                └─ MessagePersistSink → buffer blocks until turn.end
       on turn_end:
         ├─ workspace: git commit post-turn-${turnId}
         ├─ db: update turn row (status=completed, post_turn_commit)
         ├─ db: insert assistant Message (via MessagePersistSink)
         └─ bus.publish(turn.end)
```

**Rollback:**

```
ws/server → SessionService.rollback(toTurnId)
       │
       └─ RollbackService.rollbackTo(toTurnId)
            ├─ verify target turn exists + is status=completed
            ├─ assert no in-flight turn (else reject)
            ├─ db tx:
            │    delete turns where sequence_num > target.sequence_num
            │    delete messages with those turn_ids
            │    clear sessions.provider_session_id  (force fresh provider session)
            ├─ workspace.git.resetTo(target.post_turn_commit)
            └─ bus.publish(session.rollback.complete{removedTurnIds, restoredToTurnId,
                              filesRestored, messages, lastSeq})
```

**Startup recovery:**

```
boot → load all sessions → for each:
  ensure git repo exists (init if new)
  mark turns with status='in_progress' as 'orphaned', stop_reason='crashed'
  if any orphans existed:
    git reset --hard <oldest orphan's pre_turn_commit>
  clear sessions.provider_session_id for sessions that had orphans
→ bind WS server
```

## 5. Protocol (shared/src/protocol.ts)

### 5.1 Envelope

Server → client events use the full envelope:

```ts
export type WSEvent<T extends string = string, P = unknown> = {
  type: T;
  seq: number;     // server-assigned; see 5.1a below
  ts: number;      // unix ms
  payload: P;
};
```

Client → server messages are bare `{ type, payload }` (no `seq` or `ts`) —
clients never produce these fields. This keeps C2S lightweight and
unambiguous.

### 5.1a `seq` semantics

- **Scope:** `seq` is monotonic per `(session, WS-connection)` pair. On a
  new connection the counter restarts at 1 for that connection.
- **Ring buffer:** the replay ring buffer is keyed by `sessionId` (not
  connection). It stores the last 500 **non-heartbeat** events per session
  along with the `seq` that was emitted on whichever connection was active
  at the time. `heartbeat` events never enter the buffer.
- **Reconnect:** on `sync { sessionId, sinceSeq }`, the server searches
  the buffer for events with `seq > sinceSeq` that were emitted on the
  **previous** connection. If found, it re-emits them under fresh `seq`
  on the new connection; original seqs are not retained (the reducer
  is idempotent over the event stream and does not need them). If the
  buffer gap cannot be bridged, the server responds with a fresh
  `session.ready` and the client discards any partial in-flight state.
- **Ordering guarantee:** for any given connection, all events belonging
  to turn T precede every event belonging to turn T+1. Rollback events
  also follow this ordering: once `session.rollback.complete` has been
  emitted, no further events for deleted turns will be delivered.

### 5.2 Client → Server events

```ts
type C2S =
  | { type: "session.create"; payload: { agent: "claude" | "codex"; cwd?: string; systemPrompt?: string; model?: string } }
  | { type: "session.load";   payload: { sessionId: string } }
  | { type: "session.list";   payload: {} }
  | { type: "session.rollback"; payload: { sessionId: string; toTurnId: string } }
  | { type: "turn.list";      payload: { sessionId: string } }
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
  | { type: "turn.list.result";     payload: { sessionId: string; turns: TurnSummary[] } }
  | { type: "session.rollback.complete"; payload: {
        sessionId: string;
        removedTurnIds: string[];
        restoredToTurnId: string;
        filesRestored: number;         // count of files changed by git reset
        messages: Message[];           // full post-rollback history
        lastSeq: number;               // new baseline for client
    } }

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
  | { type: "block.raw";            payload: { messageId?: string; blockIdx?: number; subtype: string; data: unknown } }

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
  turnId: string;          // always set in new DB rows
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
  | { type: "raw"; subtype: string; data: unknown };   // passthrough for unknown

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
  | "rollback.target_not_found" | "rollback.invalid_target"
  | "rollback.workspace_conflict" | "rollback.busy"
  | "provider.rate_limit" | "provider.auth" | "provider.network"
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
  firstUserText: string;        // preview for list UI (truncated to ~80 chars)
  createdAt: number;
  completedAt?: number;
};
```

### 5.5 Edge-case coverage

| Case | Handling |
|---|---|
| WS drop mid-stream | Client reconnects, emits `sync { sessionId, sinceSeq }`; server replays events from its in-memory ring buffer (cap 500 non-heartbeat events / session; `heartbeat` never consumes buffer capacity). If gap too large, server answers with fresh `session.ready` and client discards partial state. See 5.1a for exact seq semantics. |
| Send while turn running | Server rejects with `error { code: "turn.already_running" }`. |
| Cancel mid-generation | `turn.cancel` → server calls SDK AbortController → `turn.end { stopReason: "cancelled" }`. Workspace post-turn commit is still written to capture whatever changed before cancel. |
| Provider rate limit | `error { code: "provider.rate_limit", retriable: true }`; session stays alive; turn ends with `stopReason: "error"`. |
| Invalid session load | `error { code: "session.not_found" }`; no `session.ready` emitted. |
| Long tool execution | Server emits `heartbeat` every 10 s while waiting on tool_result. |
| Server restart | Startup recovery (6.7) marks in-flight turns orphaned and git-resets workspaces. Client WS closes → reconnects → new connection, `sinceSeq` invalid for old session → server sends fresh `session.ready` with current (post-recovery) history; client reloads. |
| Empty response | `turn.start` → (no delta) → `turn.end { stopReason: "end_turn" }`. |
| Unknown SDK message | Translator emits `AgentEvent{kind:"raw"}` → WS `block.raw`. Data is preserved; frontend falls back to `RawBlock` (JSON dump). |
| Rollback target missing | `error { code: "rollback.target_not_found" }`. |
| Rollback target is the current head | `error { code: "rollback.invalid_target" }` (no-op rollback is rejected to avoid ambiguity). |
| Rollback while a turn is running | `error { code: "rollback.busy" }`; client must cancel first. |
| Rollback git reset fails | `error { code: "rollback.workspace_conflict" }`; DB tx is **not** committed (rollback is atomic); session state unchanged. |
| Concurrent rollbacks | Serialized by a per-session mutex inside `RollbackService`; second rollback waits for first. |

## 6. Backend design

### 6.1 AgentRunner abstraction

```ts
// agent/runner.ts
export interface AgentRunner {
  startTurn(input: StartTurnInput, responder: TurnResponder): AsyncIterable<AgentEvent>;
  cancel(turnId: string): Promise<void>;
  resume(sessionId: string, providerSessionId: string | null): Promise<ResumeResult>;
}

export interface TurnResponder {
  respondAskUser(requestId: string, answers: AskAnswer[]): void;
  respondPermission(requestId: string, decision: "allow_once" | "allow_always" | "deny"): void;
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
  | { kind: "raw"; subtype: string; data: unknown }         // passthrough for unknown
  | { kind: "turn_end"; stopReason: StopReason; usage?: TokenUsage };

export type StartTurnInput = {
  sessionId: string;
  providerSessionId: string | null;  // null → new provider session (post-rollback or first turn)
  userText: string;
  turnId: string;
  abortSignal: AbortSignal;
  // Contract: TurnOrchestrator MUST pass the full Message[] history from the
  // repository whenever providerSessionId is null (including the first turn,
  // where history is simply []). The runner is DB-free and relies solely on
  // what's injected here.
  replayHistory?: Message[];
};

export type ResumeResult = {
  providerSessionId: string;
};
```

**Claude source abstraction.** `claude/source.ts`:

```ts
export interface ClaudeSource {
  messages(input: StartTurnInput): AsyncIterable<SDKMessage>;
  abort(turnId: string): Promise<void>;
}
```

`ClaudeAgentRunner` holds a `ClaudeSource` chosen at wire-up time
(`config.claudeSource === "sdk" | "cli"`). MVP only ships `sdk-source.ts`
as the working implementation; `cli-source.ts` may land as a compile-time
stub. Adding the CLI mode later is a single-file change; nothing else in
the codebase references the SDK directly.

**Translator exhaustiveness.** `translator.ts` is the only file that
imports `@anthropic-ai/claude-agent-sdk`. It uses a `switch` on
`SDKMessage` variants with a `never`-guarded `default` that **also**
produces an `AgentEvent{kind:"raw"}` at runtime. This gives two layers
of safety: new SDK types trip compilation; unanticipated payload shapes
flow through as `raw` without breaking the stream.

**Subagent event nesting.** `AgentEvent.subagent_event.inner` is itself
typed as `AgentEvent` (internal domain). `TurnOrchestrator` is
responsible for wrapping each `inner: AgentEvent` into the corresponding
`inner: WSEvent` when broadcasting `subagent.event` over the wire. The
translator only produces AgentEvents; the serialization boundary lives
at the orchestrator / WS layer.

**`TurnResponder` plumbing.** When `TurnOrchestrator` receives
`askuser.respond` / `permission.respond` over WS, it calls the
responder passed into the current turn's `AgentRunner.startTurn`.
`ClaudeAgentRunner` internally holds a pending promise for each
outstanding request id and resolves it when the responder fires; the
SDK's `canUseTool` (or equivalent) hook awaits that promise.

### 6.2 SessionService + TurnOrchestrator

- **`SessionService`** owns `activeSessionId: string | null`.
  - `create(params)`: generate UUID, call `workspaceManager.create`,
    `gitSnapshot.initAndInitialCommit`, insert DB row, publish
    `session.ready`.
  - `load(sessionId)`: validate exists; call `workspaceManager.ensure`
    (creates dir + git repo if missing); if session needs a fresh
    provider session (after rollback or initial), leave
    `providerSessionId` null — first subsequent turn will do the replay.
    Publish `session.ready`.
  - `list()`: return `SessionSummary[]`.
  - `listTurns(sessionId)`: return `TurnSummary[]`.
- **`TurnOrchestrator`** handles one turn end-to-end. A per-session
  mutex serializes turn execution and rollback.
  - Guard: reject if a turn is in flight or a rollback is running.
  - Pre-turn: insert `turn` row (`status=in_progress`,
    `pre_turn_commit=<sha>`), persist user `Message`, publish
    `turn.start`.
  - Drive: if `providerSessionId` is null, call `AgentRunner.resume`
    first OR pass `replayHistory` so the runner seeds a fresh provider
    session from stored messages; then call `startTurn`.
  - Stream: for each AgentEvent, map to WSEvent, publish to EventBus.
  - Post-turn: on `turn_end`, call `gitSnapshot.commitPostTurn`, update
    `turn` row (`status=completed`, `post_turn_commit`,
    `stop_reason`, `usage`, `completed_at`), trigger
    `MessagePersistSink.flushTurn(turnId)` which writes the assistant
    `Message` row, publish `turn.end`.
  - On cancel / error: mark turn row accordingly, still run
    `commitPostTurn` to capture partial file state (rollback target
    therefore still exists).

### 6.3 DB schema

```sql
-- schema.sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  agent TEXT NOT NULL,                -- "claude" | "codex"
  model TEXT NOT NULL,
  provider_session_id TEXT,           -- opaque; NULL after rollback / before first turn
  system_prompt TEXT,
  cwd TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sequence_num INTEGER NOT NULL,      -- monotonic per session, starts at 1
  status TEXT NOT NULL,               -- in_progress | completed | cancelled | error | orphaned
  stop_reason TEXT,
  usage_json TEXT,                    -- JSON TokenUsage
  pre_turn_commit TEXT NOT NULL,      -- git sha captured BEFORE turn runs
  post_turn_commit TEXT,              -- git sha captured AFTER turn finishes (any terminal status)
  first_user_text TEXT NOT NULL,      -- preview (truncated), for TurnSummary
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
  role TEXT NOT NULL,                 -- "user" | "assistant"
  blocks_json TEXT NOT NULL,          -- JSON-serialized Block[]
  blocks_schema_version INTEGER NOT NULL DEFAULT 1,
  stop_reason TEXT,                   -- only for assistant
  usage_json TEXT,                    -- JSON TokenUsage
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session_created
  ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_turn
  ON messages(turn_id);
```

Notes:
- `messages.turn_id` is NOT NULL — unlike legacy designs, every message
  belongs to a turn.
- `ON DELETE CASCADE` on `turn → messages` means rollback just needs to
  `DELETE FROM turns WHERE ...` and messages disappear with them.
- `blocks_json` is stored as JSON, not normalized: consumers always want
  the full `Block[]`, and join-free read keeps the query path simple.
- `blocks_schema_version` is reserved for when the `Block` union
  evolves incompatibly.

### 6.4 EventBus + sinks

```ts
// bus/event-bus.ts
export interface EventSink {
  handle(ev: WSEvent, ctx: EventContext): void;
}
export type EventContext = {
  sessionId: string;
  turnId?: string;
  subagentId?: string;
};

export class EventBus {
  constructor(private sinks: EventSink[]) {}
  publish(ev: WSEvent, ctx: EventContext) {
    for (const s of this.sinks) s.handle(ev, ctx);
  }
}
```

**`RingBufferSink`** — per-session circular buffer (cap 500 non-heartbeat
events). Adds an entry with the `seq` already assigned. Skips
`heartbeat`. Exposes `replaySince(sessionId, sinceSeq): WSEvent[]` for
`sync`.

**`WsBroadcastSink`** — holds a registry of connections subscribed per
session. On `publish`, writes the event to each WS; also the sink
responsible for assigning connection-scoped `seq` (via the connection's
counter) and setting `ts`. Publishing to a session with zero connections
is valid (events still go to the ring buffer).

**`MessagePersistSink`** — stateful per turn. Starts a per-turn block
buffer on `turn.start`; each `block.*` / `todo.update` / `skill.invoked`
event updates the in-progress `Block[]`; on `turn.end` it writes the
full assistant `Message` row in one DB insert and clears the buffer.
Orphaned buffers (turn never ended) are discarded on restart.

Testing: each sink has a unit test seeded with a scripted
`(ev, ctx)` stream; assertions are purely on its outputs (DB rows, WS
writes, buffer contents).

### 6.5 Workspace & git snapshot

Every session has a directory at `${WORKSPACE_ROOT}/${sessionId}/`.
The directory is a standalone git repo (no remote, never pushed). We
use `simple-git` to manage it.

Operations:

```ts
// workspace/git-snapshot.ts (pseudocode)
class GitSnapshot {
  async initAndInitialCommit(dir: string): Promise<string>      // returns sha
  async commitPreTurn(dir: string, turnId: string): Promise<string>
  async commitPostTurn(dir: string, turnId: string): Promise<string>
  async resetTo(dir: string, sha: string): Promise<{ filesRestored: number }>
  async verifyClean(dir: string): Promise<boolean>
}
```

Rules:
- Commit messages: `"pre-turn ${turnId}"` and `"post-turn ${turnId}"`.
  This keeps `git log` human-readable for debug.
- `git add -A` before every commit (captures new files, deletions, and
  modifications from any tool — Write, Edit, Bash, etc.).
- If the workspace has uncommitted changes on server startup (e.g., a
  turn died without committing), recovery resets to the most recent
  known-good commit (see 6.7) before the session accepts new turns.
- Author/committer identity is fixed (`AgentTeam <agent@local>`) to
  avoid cluttering user global git config.
- Non-goal: users should not use this git repo themselves. `.git` is
  an internal detail; future work may move the snapshot store outside
  the workspace dir to free the namespace.

### 6.6 Rollback service

```ts
// rollback/rollback-service.ts (pseudocode)
class RollbackService {
  async rollbackTo(sessionId: string, toTurnId: string): Promise<RollbackResult> {
    acquire sessionMutex(sessionId);
    try {
      const target = db.getTurn(toTurnId);
      if (!target || target.session_id !== sessionId)
        throw Error("rollback.target_not_found");
      if (target.status !== "completed")
        throw Error("rollback.invalid_target");
      const head = db.latestTurn(sessionId);
      if (head.id === toTurnId)
        throw Error("rollback.invalid_target");    // no-op rejected
      if (head.status === "in_progress")
        throw Error("rollback.busy");

      const removed = db.turnsAfter(sessionId, target.sequence_num);
      // DB tx first; git reset runs ONLY if DB tx committed
      db.runTx(() => {
        db.deleteTurns(removed.map(t => t.id));   // cascades messages
        db.clearProviderSessionId(sessionId);
      });
      try {
        const { filesRestored } = await git.resetTo(
          workspaceDir(sessionId),
          target.post_turn_commit
        );
        // Ordering is deliberate: emit rollback.complete ONLY after the git
        // reset succeeds. Emitting before would lie to the client about
        // workspace state, and the DB has already committed so a later
        // failure to git-reset leaves the session in the "needs reconcile"
        // state that startup recovery handles.
        bus.publish({
          type: "session.rollback.complete",
          payload: {
            sessionId,
            removedTurnIds: removed.map(t => t.id),
            restoredToTurnId: target.id,
            filesRestored,
            messages: db.messagesForSession(sessionId),
            lastSeq: nextSeq(sessionId)
          }
        }, { sessionId });
        return { ok: true };
      } catch (gitErr) {
        // DB already committed; workspace out of sync with DB.
        // Mark session as requiring recovery, emit error.
        log.error("rollback git failure — session requires restart recovery", gitErr);
        throw Error("rollback.workspace_conflict");
      }
    } finally { releaseMutex(); }
  }
}
```

Notes:
- The DB truncate happens **before** git reset. If git fails after DB
  succeeds, the session is in a degraded but recoverable state — on
  next startup, recovery logic can detect "workspace HEAD does not match
  expected post_turn_commit of latest turn" and re-run the git reset.
  (Implementation: a small `reconcile_on_startup` flag in the recovery
  module.)
- Emitting `session.rollback.complete` includes the full `messages[]`
  list so the client does not need to re-`session.load`; seq baseline
  resets on the next connection cycle.
- Clearing `provider_session_id` forces the next turn to take the
  "fresh provider session + replay history" path (6.2). This guarantees
  Claude's side context matches the truncated DB history exactly.

### 6.7 Termination recovery (startup)

```ts
// recovery/startup-recovery.ts (pseudocode)
async function runStartupRecovery(): Promise<void> {
  for (const session of db.allSessions()) {
    ensureWorkspaceAndRepo(session);

    const orphans = db.turnsByStatus(session.id, "in_progress");
    if (orphans.length === 0) {
      // Still verify workspace HEAD matches latest turn's post_turn_commit
      // (reconcile case from 6.6)
      reconcileHead(session);
      continue;
    }

    // 1) Mark orphans
    for (const t of orphans) {
      db.updateTurn(t.id, {
        status: "orphaned",
        stop_reason: "error",
        completed_at: now()
      });
    }
    // 2) Reset workspace to the oldest orphan's pre_turn_commit
    const oldest = minBy(orphans, t => t.sequence_num);
    await git.resetTo(workspaceDir(session.id), oldest.pre_turn_commit);
    // 3) Invalidate provider session so next turn rebuilds context
    db.clearProviderSessionId(session.id);
    log.warn("recovered session with orphaned turns", {
      sessionId: session.id,
      orphanIds: orphans.map(t => t.id)
    });
  }
}
```

Called once during `index.ts` bootstrap, before the WS server starts
accepting connections. Idempotent: running again on a clean DB / clean
workspaces is a no-op.

### 6.8 Runtime & configuration

```
# .env
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
DB_PATH=./data/atelier.db
WORKSPACE_ROOT=./workspaces
DEFAULT_MODEL=claude-sonnet-4-6
LOG_LEVEL=info
CLAUDE_SOURCE=sdk           # "sdk" | "cli" — MVP uses "sdk"
```

Each session gets `${WORKSPACE_ROOT}/${sessionId}/` as its Claude Code cwd.
Directories are created on `session.create`, never garbage-collected by
MVP. Backend binds `127.0.0.1` only (no remote exposure).

`index.ts` wires all dependencies by hand (no DI framework):

```ts
const config = loadConfig();
const db = openDb(config.dbPath);
const repo = new Repository(db);
const workspaceMgr = new WorkspaceManager(config.workspaceRoot);
const git = new GitSnapshot();
const source = config.claudeSource === "cli"
  ? new ClaudeCliSource(config)     // Phase 2
  : new ClaudeSdkSource(config);
const runner = new ClaudeAgentRunner(source, translator);
const bus = new EventBus([
  new RingBufferSink(500),
  new WsBroadcastSink(),
  new MessagePersistSink(repo),
]);
const rollback = new RollbackService(repo, workspaceMgr, git, bus);
const sessions = new SessionService(repo, workspaceMgr, git, bus);
const orch = new TurnOrchestrator(repo, workspaceMgr, git, runner, bus);
await runStartupRecovery({ repo, workspaceMgr, git });
startWsServer({ port: config.port, sessions, orch, rollback, bus });
```

## 7. Frontend design

### 7.1 State management

Single Zustand store, reducer-driven:

```ts
// state/reducer.ts — PURE function, unit-testable without React
export function reduce(state: SessionState, event: WSEvent): SessionState {
  switch (event.type) {
    case "session.ready":             return onSessionReady(state, event.payload);
    case "session.rollback.complete": return onRollbackComplete(state, event.payload);
    case "turn.start":                return onTurnStart(state, event.payload);
    case "block.text.delta":          return appendTextDelta(state, event.payload);
    case "block.raw":                 return appendRawBlock(state, event.payload);
    case "todo.update":               return upsertTodoBlock(state, event.payload);
    case "subagent.event":            return nestInSubagent(state, event.payload);
    // ... other cases
    default:                          return state;
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
          <RawBlock>       # fallback JSON dump
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
- `TodoBlock`, `SubagentBlock`, `SkillBlock`, `AskUserBlock`, `RawBlock`
  render a `<pre>` of the event payload. Enough to prove events flow
  end-to-end; polished rendering is Phase 2.

**Phase 1 — rollback UI:**
- No dedicated button; a lightweight "turns drawer" listing
  `TurnSummary[]` with a "Roll back here" action per completed turn.
  Triggering fires `session.rollback`. On `session.rollback.complete`,
  the reducer swaps in `payload.messages` and shows a one-line toast
  ("Rolled back to turn N, M files restored").

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
| SDK | unknown message variant | translator emits `block.raw` event; no error |
| Tool exec | tool throws | SDK emits `tool_result { isError: true }` as usual; Claude continues |
| Rollback | target missing / invalid / busy | `error { rollback.* }`; session unchanged |
| Rollback | git reset fails after DB commit | `error { rollback.workspace_conflict }`; session flagged for startup-recovery reconcile |
| Recovery | git repo missing on load | recreate empty repo + initial commit |
| Unhandled | exception in handler | `error { internal }`, process stays up (pino logs w/ stack) |

Invariant: **a failed turn never kills its session; a failed rollback
never leaves the session unrecoverable; a crashed session never kills
the backend process.**

## 9. Testing strategy

```
E2E (Playwright)
  1 happy-path test: open frontend, send message, assert streamed reply.
  1 persistence test: send message, reload backend, assert history loads.
  1 rollback test: send 2 messages that create files, roll back to turn 1,
                   assert the later message is gone AND the later file is gone.
  1 crash-recovery test: start a turn, kill backend mid-stream, restart,
                   assert turn is orphaned, workspace clean, session usable.
  SDK calls stubbed with a fake source.

Integration (backend, Vitest + supertest for WS)
  - Real WS server + mock AgentRunner feeding scripted AgentEvents.
  - Asserts protocol ordering: session.ready → turn.start → deltas → turn.end.
  - Guard tests: concurrent send rejected, sync replay works.
  - Rollback atomicity: induce git failure, assert DB transaction also rolls back.
  - Startup recovery: seed DB with orphaned turn + uncommitted files, run
                      recovery, assert clean state.

Unit
  - shared: type-level smoke tests (exhaustiveness checks on WSEvent).
  - backend/agent/claude/translator.ts: fixture SDK events → expected AgentEvent[],
                                         including unknown variants → raw.
  - backend/session/turn-orchestrator.ts: state machine transitions.
  - backend/bus/*-sink.ts: each sink independently.
  - backend/workspace/git-snapshot.ts: against a tmp directory.
  - backend/rollback/rollback-service.ts: DB tx + git reset interplay.
  - backend/recovery/startup-recovery.ts: seeded DB + fake git repo.
  - frontend/state/reducer.ts: event sequences → expected state,
                                including rollback.
  - frontend/ws/client.ts: reconnect + sync logic with mock WebSocket.
  - Component smoke tests with Vitest + React Testing Library.
```

`pnpm -r test` runs the whole pyramid.

## 10. Observability (MVP minimum)

- `GET /health` → `{ ok: true, version }`.
- `GET /metrics` → plain text (active session count, total turns, WS
  connections, orphaned-turn count since boot). Not Prometheus-formatted;
  curl-friendly.
- Structured JSON logs via `pino`. Log: WS connect/disconnect, session
  create/load, turn start/end, rollback start/complete/fail, startup
  recovery outcome, all errors.

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
7. Extended thinking, subagent (Task), TodoWrite, skill invocation, and
   an unknown-message `block.raw` each produce the expected protocol
   event stream (verified via backend logs / Phase-1 `<pre>` dump
   blocks in frontend) even if their polished UIs are deferred to
   Phase 2.
8. Run three turns in sequence that (a) create `a.py`, (b) add a line to
   `a.py`, (c) delete `a.py`. Roll back to the end of turn 1. Assert:
   - `messages` and `turn.list.result` show only turn 1's user+assistant
     pair.
   - `a.py` exists in `workspaces/${sessionId}/` with only turn 1's
     content.
   - A new follow-up message continues normally (Claude side has been
     reinitialized with the truncated history).
9. While a turn is streaming, `kill -9` the backend. Restart it. Load the
   same session. The interrupted turn appears as `status=orphaned` in
   `turn.list.result`; the workspace contains only files from turns
   prior to the orphaned one; sending a new message works.
10. `pnpm -r test` passes (including the unit + integration + E2E tests
    listed in Section 9).

## 12. Future work (post-MVP, explicitly deferred)

- Claude Code CLI subprocess source (`sources/cli-source.ts`) to gain
  access to plugin/hook/skill features not exposed through the SDK.
- Codex runner (`packages/backend/src/agent/codex/`).
- Polished Phase 2 UIs for TodoBlock / SubagentBlock / SkillBlock /
  AskUserBlock / RawBlock.
- Permission request UI (protocol reserved).
- Multi-session concurrency (requires AgentRunner pooling + per-session
  mutexes already sketched in this spec).
- Agents / Skills / Knowledge CRUD backed by DB (prototype pages → real).
- Approvals panel wired to `permission.request` events.
- Workspace cleanup on session delete; quotas.
- Rollback UX: diff viewer (`git diff post-turn-X post-turn-Y`), time
  travel cursor, undo-of-undo.
- Move the git snapshot store out of the workspace directory so users
  can use their own git inside a session.
- AuthN/Z (single-user → multi-user).
- Proper `/metrics` (Prometheus) and OpenTelemetry tracing.
- Migrate away from legacy prototype entirely once Phase 2 is
  feature-parity.
