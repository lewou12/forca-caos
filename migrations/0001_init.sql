-- FORCA//CAOS — schema inicial
-- O estado completo da sala vive em rooms.state (JSON) e é protegido por CAS
-- (UPDATE ... WHERE version = ?). Isso elimina escritas parciais e corridas
-- entre jogadores sem depender de transações multi-linha.

CREATE TABLE IF NOT EXISTS rooms (
  code       TEXT PRIMARY KEY,
  state      TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_expires_at ON rooms (expires_at);

-- Rate limiting por IP anonimizado (SHA-256) + ação + janela.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);
