CREATE TABLE IF NOT EXISTS tournament_scores (
  round_no INTEGER NOT NULL CHECK (round_no BETWEEN 1 AND 4),
  player TEXT NOT NULL,
  hole INTEGER NOT NULL CHECK (hole BETWEEN 1 AND 18),
  gross INTEGER NOT NULL CHECK (gross BETWEEN 1 AND 20),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (round_no, player, hole)
);

CREATE TABLE IF NOT EXISTS tournament_players (
  player TEXT PRIMARY KEY,
  photo TEXT,
  setup_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_charges (
  player TEXT PRIMARY KEY,
  amount NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
