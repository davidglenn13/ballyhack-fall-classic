CREATE TABLE IF NOT EXISTS tournament_scores (
  round_no INTEGER NOT NULL CHECK (round_no BETWEEN 1 AND 4), player TEXT NOT NULL,
  hole INTEGER NOT NULL CHECK (hole BETWEEN 1 AND 18), gross INTEGER NOT NULL CHECK (gross BETWEEN 1 AND 20),
  updated_at TEXT NOT NULL, PRIMARY KEY (round_no, player, hole)
);
CREATE TABLE IF NOT EXISTS tournament_players (
  player TEXT PRIMARY KEY, photo TEXT, setup_at TEXT, last_accessed_at TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tournament_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tournament_charges (player TEXT PRIMARY KEY, amount REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tournament_credentials (
  player TEXT PRIMARY KEY, pin_hash TEXT NOT NULL, salt TEXT NOT NULL, token_hash TEXT, token_expires_at TEXT,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tournament_score_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mutation_id TEXT UNIQUE NOT NULL,
  round_no INTEGER NOT NULL CHECK (round_no BETWEEN 1 AND 4), group_no INTEGER NOT NULL CHECK (group_no BETWEEN 1 AND 2),
  player TEXT NOT NULL, hole INTEGER NOT NULL CHECK (hole BETWEEN 1 AND 18), old_gross INTEGER, new_gross INTEGER,
  actor TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'score', created_at TEXT NOT NULL, undone_at TEXT, undone_by TEXT
);
CREATE TABLE IF NOT EXISTS tournament_group_locks (
  round_no INTEGER NOT NULL CHECK (round_no BETWEEN 1 AND 4), group_no INTEGER NOT NULL CHECK (group_no BETWEEN 1 AND 2),
  locked_by TEXT NOT NULL, locked_at TEXT NOT NULL, PRIMARY KEY (round_no, group_no)
);
CREATE TABLE IF NOT EXISTS tournament_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT, reason TEXT NOT NULL, snapshot TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tournament_score_audit_created_idx ON tournament_score_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS tournament_backups_created_idx ON tournament_backups (created_at DESC);
