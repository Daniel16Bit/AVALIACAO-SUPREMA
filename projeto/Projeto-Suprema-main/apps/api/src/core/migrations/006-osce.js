'use strict';
// OSCE: one event per year, semester, round (OSCE 1, OSCE 2...) and period, with any
// number of stations. Each station owns one form of the forms core (migration 005).
// The key question ("did the student greet the patient?") is only switched on or off and
// stored: no calculation uses it until the institution says how it counts.
// Permissions go to the two profiles that existed without any: the assessment unit
// builds and reads results, the shared station accounts only answer.
module.exports = {
  id: '006-osce',
  up(db) {
    db.exec(`
      CREATE TABLE osce_events (
        id INTEGER PRIMARY KEY,
        year INTEGER NOT NULL,
        semester TEXT NOT NULL CHECK(semester IN ('1', '2')),
        round INTEGER NOT NULL CHECK(round BETWEEN 1 AND 9),
        period TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK(status IN ('RASCUNHO', 'LIBERADO', 'ENCERRADO')),
        key_question INTEGER NOT NULL DEFAULT 1 CHECK(key_question IN (0, 1)),
        key_question_text TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        released_at TEXT,
        closed_at TEXT,
        UNIQUE(year, semester, round, period)
      );

      CREATE TABLE osce_stations (
        id INTEGER PRIMARY KEY,
        event_id INTEGER NOT NULL REFERENCES osce_events(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        form_id INTEGER NOT NULL REFERENCES forms(id),
        UNIQUE(event_id, position)
      );

      CREATE TABLE osce_event_students (
        event_id INTEGER NOT NULL REFERENCES osce_events(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES students(id),
        PRIMARY KEY(event_id, student_id)
      );

      INSERT OR IGNORE INTO role_permissions(role, permission) VALUES
        ('NUCLEO_AVALIACAO', 'osce.manage'),
        ('NUCLEO_AVALIACAO', 'osce.results'),
        ('OPERACIONAL', 'osce.respond');
    `);
  }
};
