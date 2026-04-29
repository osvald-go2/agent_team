PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entity_records (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);

CREATE INDEX IF NOT EXISTS idx_entity_records_kind
  ON entity_records(kind, updated_at DESC);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS run_tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  depends_on_json TEXT NOT NULL,
  read_paths_json TEXT NOT NULL,
  write_paths_json TEXT NOT NULL,
  acceptance_criteria_json TEXT NOT NULL,
  expected_artifacts_json TEXT NOT NULL,
  status TEXT NOT NULL,
  output_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_run_tasks_run
  ON run_tasks(run_id, status, updated_at);

CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  task_id TEXT,
  session_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  raw_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_run_events_run
  ON run_events(run_id, created_at);

CREATE TABLE IF NOT EXISTS codex_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  task_id TEXT,
  codex_session_id TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS file_locks (
  path TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
