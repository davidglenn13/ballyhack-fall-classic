CREATE TABLE IF NOT EXISTS tournament_credentials (
  player TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  token_hash TEXT,
  token_expires_at TIMESTAMPTZ,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_score_audit (
  id BIGSERIAL PRIMARY KEY,
  mutation_id TEXT UNIQUE NOT NULL,
  round_no INTEGER NOT NULL CHECK (round_no BETWEEN 1 AND 4),
  group_no INTEGER NOT NULL CHECK (group_no BETWEEN 1 AND 2),
  player TEXT NOT NULL,
  hole INTEGER NOT NULL CHECK (hole BETWEEN 1 AND 18),
  old_gross INTEGER,
  new_gross INTEGER,
  actor TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'score',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at TIMESTAMPTZ,
  undone_by TEXT
);

CREATE TABLE IF NOT EXISTS tournament_group_locks (
  round_no INTEGER NOT NULL CHECK (round_no BETWEEN 1 AND 4),
  group_no INTEGER NOT NULL CHECK (group_no BETWEEN 1 AND 2),
  locked_by TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (round_no, group_no)
);

CREATE TABLE IF NOT EXISTS tournament_backups (
  id BIGSERIAL PRIMARY KEY,
  reason TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tournament_score_audit_created_idx
  ON tournament_score_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS tournament_backups_created_idx
  ON tournament_backups (created_at DESC);
