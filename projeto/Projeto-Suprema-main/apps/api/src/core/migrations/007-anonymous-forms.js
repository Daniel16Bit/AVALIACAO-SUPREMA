'use strict';
// Anonymous path of the forms core, for evaluations where the answer must not be linked
// to who gave it (teacher evaluation now, interdisciplinary articulation later).
//
// Two things are stored and nothing connects them:
//  - anon_participation: "student X already answered about subject Y". It exists to refuse
//    a second answer and to count adherence.
//  - anon_submissions / anon_answers: what was answered, with no student, account or session.
//
// No clue of order or time is kept either:
//  - the three tables are WITHOUT ROWID, so rows carry no insertion sequence;
//  - a submission is identified by a random value, never a counter;
//  - only the day is recorded, never the hour.
// Rows are never updated or deleted.
//
// Limit that no schema removes: someone holding two copies of the database taken at
// different moments can see which participations and which submissions appeared in
// between. With a single respondent in that interval the link is possible.
module.exports = {
  id: '007-anonymous-forms',
  up(db) {
    db.exec(`
      CREATE TABLE anon_participation (
        form_id INTEGER NOT NULL REFERENCES forms(id),
        subject_key TEXT NOT NULL,
        student_id INTEGER NOT NULL REFERENCES students(id),
        answered_on TEXT NOT NULL,
        PRIMARY KEY(form_id, subject_key, student_id)
      ) WITHOUT ROWID;

      CREATE TABLE anon_submissions (
        id TEXT PRIMARY KEY,
        form_id INTEGER NOT NULL REFERENCES forms(id),
        subject_key TEXT NOT NULL,
        answered_on TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE INDEX idx_anon_submissions_subject ON anon_submissions(form_id, subject_key);

      CREATE TABLE anon_answers (
        submission_id TEXT NOT NULL REFERENCES anon_submissions(id),
        question_id INTEGER NOT NULL REFERENCES form_questions(id),
        value TEXT NOT NULL CHECK(value IN ('SIM', 'NAO', 'NA')),
        comment TEXT,
        PRIMARY KEY(submission_id, question_id)
      ) WITHOUT ROWID;

      CREATE TRIGGER anon_participation_no_update BEFORE UPDATE ON anon_participation
        BEGIN SELECT RAISE(ABORT, 'Registros de participacao nao podem ser alterados.'); END;
      CREATE TRIGGER anon_participation_no_delete BEFORE DELETE ON anon_participation
        BEGIN SELECT RAISE(ABORT, 'Registros de participacao nao podem ser apagados.'); END;
      CREATE TRIGGER anon_submissions_no_update BEFORE UPDATE ON anon_submissions
        BEGIN SELECT RAISE(ABORT, 'Respostas anonimas nao podem ser alteradas.'); END;
      CREATE TRIGGER anon_submissions_no_delete BEFORE DELETE ON anon_submissions
        BEGIN SELECT RAISE(ABORT, 'Respostas anonimas nao podem ser apagadas.'); END;
      CREATE TRIGGER anon_answers_no_update BEFORE UPDATE ON anon_answers
        BEGIN SELECT RAISE(ABORT, 'Respostas anonimas nao podem ser alteradas.'); END;
      CREATE TRIGGER anon_answers_no_delete BEFORE DELETE ON anon_answers
        BEGIN SELECT RAISE(ABORT, 'Respostas anonimas nao podem ser apagadas.'); END;
    `);
  }
};
