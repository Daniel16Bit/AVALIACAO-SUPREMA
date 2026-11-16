'use strict';
// Teacher evaluation by the students, anonymous (migration 007 holds the answers).
//  - A campaign belongs to a year, a semester, a named round ("fim do semestre") and a
//    period, and owns one form: every teacher of the campaign gets the same questions.
//  - A target is one teacher in one discipline offer of that period.
//  - min_responses is the smallest number of answers for which a target's result is shown.
//    It cannot be set below 3: with fewer, a result is a person's answer.
// Each of the four profiles involved receives exactly one permission.
module.exports = {
  id: '008-teacher-eval',
  up(db) {
    db.exec(`
      CREATE TABLE teacher_eval_campaigns (
        id INTEGER PRIMARY KEY,
        year INTEGER NOT NULL,
        semester TEXT NOT NULL CHECK(semester IN ('1', '2')),
        round_name TEXT NOT NULL,
        period TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK(status IN ('RASCUNHO', 'LIBERADO', 'ENCERRADO')),
        min_responses INTEGER NOT NULL DEFAULT 5 CHECK(min_responses BETWEEN 3 AND 1000),
        form_id INTEGER NOT NULL REFERENCES forms(id),
        revision INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        released_at TEXT,
        closed_at TEXT,
        UNIQUE(year, semester, round_name, period)
      );

      CREATE TABLE teacher_eval_targets (
        id INTEGER PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES teacher_eval_campaigns(id) ON DELETE CASCADE,
        assignment_id INTEGER NOT NULL REFERENCES teaching_assignments(id),
        professor_id INTEGER NOT NULL REFERENCES users(id),
        discipline_name TEXT NOT NULL,
        class_name TEXT NOT NULL DEFAULT '',
        UNIQUE(campaign_id, assignment_id)
      );
      CREATE INDEX idx_teacher_eval_targets_professor ON teacher_eval_targets(professor_id, campaign_id);

      INSERT OR IGNORE INTO role_permissions(role, permission) VALUES
        ('CSTI', 'teacher_eval.manage'),
        ('ALUNO', 'teacher_eval.answer'),
        ('PROFESSOR', 'teacher_eval.own'),
        ('COORDENACAO', 'teacher_eval.all');
    `);
  }
};
