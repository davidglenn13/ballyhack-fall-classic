CREATE TABLE IF NOT EXISTS tournament_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tournament_activity_actor_time_idx ON tournament_activity (actor, created_at DESC);
