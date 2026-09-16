CREATE TABLE IF NOT EXISTS tournament_login_attempts (
  player TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tournament_login_sessions (
  token_hash TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tournament_login_sessions_player_idx ON tournament_login_sessions (player);
