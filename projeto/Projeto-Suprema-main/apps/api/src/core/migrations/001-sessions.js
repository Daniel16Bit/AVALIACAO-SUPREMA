'use strict';
// Sessions used to live in process memory: a restart signed everyone out and a second
// API instance could not share them. Only a SHA-256 of the cookie token is stored, so a
// copy of the database does not contain usable session tokens.
module.exports = {
  id: '001-sessions',
  up(db) {
    db.exec(`
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        session_version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      ) WITHOUT ROWID;
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
    `);
  }
};
