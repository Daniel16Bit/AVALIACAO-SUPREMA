'use strict';
// Grade traceability.
//  - score_changes: one row per cell changed in a draft (old value, new value, who, when).
//  - publication_snapshots: every version ever published to a student. published_scores keeps
//    only the current one and is overwritten on republication; this table never is.
//  - audit_logs gains real columns for the actor, the client address and the assessment,
//    instead of burying them in the JSON details.
// Both history tables reject UPDATE and DELETE at the database level.
const VALUE_KEYS = [
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'c6',
  'me1',
  'me2',
  'me3',
  'me4',
  'q7',
  'q8',
  'q9',
  'q10',
  'osce1',
  'osce2',
  'osce3',
  'osce4',
  'pbl1',
  'pbl2',
  'osce',
  'trabalho',
  'outros_final',
  'a1',
  'a2',
  'a3_de_a1',
  'a3_de_a2',
  'nota_prova',
  'nota_final'
];

module.exports = {
  id: '003-grade-history',
  VALUE_KEYS,
  up(db) {
    db.exec(`
      ALTER TABLE audit_logs ADD COLUMN actor_id INTEGER;
      ALTER TABLE audit_logs ADD COLUMN origin TEXT;
      ALTER TABLE audit_logs ADD COLUMN assessment_id INTEGER;
      CREATE INDEX idx_audit_assessment ON audit_logs(assessment_id, id);
      CREATE INDEX idx_audit_actor ON audit_logs(actor_id, id);

      CREATE TABLE score_changes (
        id INTEGER PRIMARY KEY,
        assessment_id INTEGER NOT NULL REFERENCES assessments(id),
        score_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL REFERENCES students(id),
        field_key TEXT NOT NULL,
        old_value REAL,
        new_value REAL,
        actor_id INTEGER NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_score_changes_assessment ON score_changes(assessment_id, id);
      CREATE INDEX idx_score_changes_student ON score_changes(student_id, assessment_id, id);

      CREATE TABLE publication_snapshots (
        id INTEGER PRIMARY KEY,
        publication_event_id INTEGER REFERENCES publication_events(id),
        assessment_id INTEGER NOT NULL REFERENCES assessments(id),
        score_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL REFERENCES students(id),
        values_json TEXT NOT NULL,
        metadata_json TEXT,
        source TEXT NOT NULL CHECK(source IN ('PUBLICACAO','MIGRACAO')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_publication_snapshots_assessment ON publication_snapshots(assessment_id, id);
      CREATE INDEX idx_publication_snapshots_student ON publication_snapshots(student_id, assessment_id, id);

      CREATE TRIGGER score_changes_no_update BEFORE UPDATE ON score_changes
        BEGIN SELECT RAISE(ABORT, 'O historico de alteracoes de nota nao pode ser modificado.'); END;
      CREATE TRIGGER score_changes_no_delete BEFORE DELETE ON score_changes
        BEGIN SELECT RAISE(ABORT, 'O historico de alteracoes de nota nao pode ser apagado.'); END;
      CREATE TRIGGER publication_snapshots_no_update BEFORE UPDATE ON publication_snapshots
        BEGIN SELECT RAISE(ABORT, 'O historico de publicacoes nao pode ser modificado.'); END;
      CREATE TRIGGER publication_snapshots_no_delete BEFORE DELETE ON publication_snapshots
        BEGIN SELECT RAISE(ABORT, 'O historico de publicacoes nao pode ser apagado.'); END;
    `);

    // Older audit rows only have the actor and the assessment inside the JSON details.
    const fill = db.prepare('UPDATE audit_logs SET actor_id=?, assessment_id=? WHERE id=?');
    for (const row of db.prepare('SELECT id, details FROM audit_logs').all()) {
      let details;
      try {
        details = JSON.parse(row.details || '{}');
      } catch {
        continue;
      }
      const actor = Number.isSafeInteger(details?.actor_id) ? details.actor_id : null;
      const assessment = Number.isSafeInteger(details?.assessment_id) ? details.assessment_id : null;
      if (actor !== null || assessment !== null) fill.run(actor, assessment, row.id);
    }

    // Results already visible to students become the first entry of their history, so the
    // next republication cannot erase what was published before this version.
    const columns = new Set(
      db
        .prepare('PRAGMA table_info(published_scores)')
        .all()
        .map(c => c.name)
    );
    const keys = VALUE_KEYS.filter(key => columns.has(key));
    const keep = db.prepare(
      "INSERT INTO publication_snapshots(publication_event_id,assessment_id,score_id,student_id,values_json,metadata_json,source,created_at) VALUES(NULL,?,?,?,?,?,'MIGRACAO',COALESCE(?,CURRENT_TIMESTAMP))"
    );
    for (const row of db
      .prepare('SELECT * FROM published_scores WHERE sent=1 ORDER BY assessment_id, score_id')
      .all()) {
      const values = {};
      for (const key of keys) values[key] = row[key] ?? null;
      keep.run(
        row.assessment_id,
        row.score_id,
        row.student_id,
        JSON.stringify(values),
        row.metadata_json ?? null,
        row.published_at ?? null
      );
    }
  }
};
