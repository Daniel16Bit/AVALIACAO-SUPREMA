'use strict';
// Forms core, shared by OSCE now and by the teacher evaluation and the interdisciplinary
// articulation later: a form, its questions, the submissions and their raw answers.
//  - Raw answers are always kept: answers reject UPDATE and DELETE, submissions reject DELETE.
//  - A submission is never erased; it can only be voided, and the voided row stays.
//  - While a submission about a student is valid, a second one for the same form is refused.
//  - subject_student_id and submitted_by are optional so that anonymous modules can use the
//    same tables without any link to who answered.
module.exports = {
  id: '005-forms',
  up(db) {
    db.exec(`
      CREATE TABLE forms (
        id INTEGER PRIMARY KEY,
        module TEXT NOT NULL,
        title TEXT NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE form_questions (
        id INTEGER PRIMARY KEY,
        form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        text TEXT NOT NULL,
        answer_type TEXT NOT NULL DEFAULT 'SIM_NAO' CHECK(answer_type IN ('SIM_NAO', 'SIM_NAO_NA')),
        is_key INTEGER NOT NULL DEFAULT 0 CHECK(is_key IN (0, 1)),
        UNIQUE(form_id, position)
      );

      CREATE TABLE form_submissions (
        id INTEGER PRIMARY KEY,
        form_id INTEGER NOT NULL REFERENCES forms(id),
        subject_student_id INTEGER REFERENCES students(id),
        submitted_by INTEGER REFERENCES users(id),
        origin TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        voided_at TEXT,
        voided_by INTEGER REFERENCES users(id),
        void_reason TEXT
      );
      CREATE INDEX idx_form_submissions_form ON form_submissions(form_id, id);
      CREATE UNIQUE INDEX idx_form_one_valid_per_student ON form_submissions(form_id, subject_student_id)
        WHERE voided_at IS NULL AND subject_student_id IS NOT NULL;

      CREATE TABLE form_answers (
        submission_id INTEGER NOT NULL REFERENCES form_submissions(id),
        question_id INTEGER NOT NULL REFERENCES form_questions(id),
        value TEXT NOT NULL CHECK(value IN ('SIM', 'NAO', 'NA')),
        comment TEXT,
        PRIMARY KEY(submission_id, question_id)
      );

      CREATE TRIGGER form_answers_no_update BEFORE UPDATE ON form_answers
        BEGIN SELECT RAISE(ABORT, 'Respostas de formulario nao podem ser alteradas.'); END;
      CREATE TRIGGER form_answers_no_delete BEFORE DELETE ON form_answers
        BEGIN SELECT RAISE(ABORT, 'Respostas de formulario nao podem ser apagadas.'); END;
      CREATE TRIGGER form_submissions_no_delete BEFORE DELETE ON form_submissions
        BEGIN SELECT RAISE(ABORT, 'Envios de formulario nao podem ser apagados.'); END;
      -- The only change a submission accepts is being voided, once.
      CREATE TRIGGER form_submissions_void_only BEFORE UPDATE ON form_submissions
        WHEN OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL
          OR NEW.form_id IS NOT OLD.form_id OR NEW.subject_student_id IS NOT OLD.subject_student_id
          OR NEW.submitted_by IS NOT OLD.submitted_by OR NEW.origin IS NOT OLD.origin OR NEW.created_at IS NOT OLD.created_at
        BEGIN SELECT RAISE(ABORT, 'Envios de formulario so podem ser anulados, uma unica vez.'); END;
    `);
  }
};
