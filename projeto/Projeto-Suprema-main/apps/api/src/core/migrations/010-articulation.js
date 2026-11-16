'use strict';
// Interdisciplinary articulation: the evaluation the students answer about the week of a
// tutorial case. It replaces a form kept outside the system.
//  - A form has a free title (the case number changes every time), its own questions and three
//    lists the CSTI edits: periods, tutors and support stations. A set of default lists can be
//    saved and is copied into each new form.
//  - Answers are identified, as in the original form: who answered is stored with the answer.
//    Each student answers a form once. Rows are never updated or deleted.
//  - A tutor of the list may be linked to a teacher account, who then reads his or her own
//    consolidated results once the CSTI releases them.
// No performance figure is computed: the institutional formula has not been provided.
module.exports = {
  id: '010-articulation',
  up(db) {
    db.exec(`
      CREATE TABLE articulation_forms (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        year INTEGER NOT NULL,
        semester TEXT NOT NULL CHECK(semester IN ('1', '2')),
        status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK(status IN ('RASCUNHO', 'LIBERADO', 'FINALIZADO', 'RESULTADOS_LIBERADOS')),
        revision INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        released_at TEXT,
        finished_at TEXT,
        results_released_at TEXT
      );

      CREATE TABLE articulation_options (
        id INTEGER PRIMARY KEY,
        form_id INTEGER NOT NULL REFERENCES articulation_forms(id) ON DELETE CASCADE,
        list TEXT NOT NULL CHECK(list IN ('PERIODO', 'TUTOR', 'ESTACAO')),
        position INTEGER NOT NULL,
        label TEXT NOT NULL,
        professor_id INTEGER REFERENCES users(id),
        UNIQUE(form_id, list, position)
      );

      CREATE TABLE articulation_default_options (
        list TEXT NOT NULL CHECK(list IN ('PERIODO', 'TUTOR', 'ESTACAO')),
        position INTEGER NOT NULL,
        label TEXT NOT NULL,
        professor_id INTEGER REFERENCES users(id),
        PRIMARY KEY(list, position)
      );

      CREATE TABLE articulation_questions (
        id INTEGER PRIMARY KEY,
        form_id INTEGER NOT NULL REFERENCES articulation_forms(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        section TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('NOTA_0_10', 'SIM_NAO', 'SIM_NAO_PARCIAL', 'PERIODO', 'TUTOR', 'ESTACAO')),
        justify INTEGER NOT NULL DEFAULT 0 CHECK(justify IN (0, 1)),
        UNIQUE(form_id, position)
      );

      CREATE TABLE articulation_responses (
        id INTEGER PRIMARY KEY,
        form_id INTEGER NOT NULL REFERENCES articulation_forms(id),
        student_id INTEGER NOT NULL REFERENCES students(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        origin TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(form_id, student_id)
      );

      CREATE TABLE articulation_answers (
        response_id INTEGER NOT NULL REFERENCES articulation_responses(id),
        question_id INTEGER NOT NULL REFERENCES articulation_questions(id),
        value TEXT NOT NULL,
        option_id INTEGER REFERENCES articulation_options(id),
        justification TEXT,
        PRIMARY KEY(response_id, question_id)
      );

      CREATE TRIGGER articulation_responses_no_update BEFORE UPDATE ON articulation_responses
        BEGIN SELECT RAISE(ABORT, 'Respostas da articulacao nao podem ser alteradas.'); END;
      CREATE TRIGGER articulation_responses_no_delete BEFORE DELETE ON articulation_responses
        BEGIN SELECT RAISE(ABORT, 'Respostas da articulacao nao podem ser apagadas.'); END;
      CREATE TRIGGER articulation_answers_no_update BEFORE UPDATE ON articulation_answers
        BEGIN SELECT RAISE(ABORT, 'Respostas da articulacao nao podem ser alteradas.'); END;
      CREATE TRIGGER articulation_answers_no_delete BEFORE DELETE ON articulation_answers
        BEGIN SELECT RAISE(ABORT, 'Respostas da articulacao nao podem ser apagadas.'); END;

      INSERT INTO articulation_default_options(list, position, label) VALUES
        ('PERIODO', 1, '1º Período'), ('PERIODO', 2, '2º Período'), ('PERIODO', 3, '3º Período'), ('PERIODO', 4, '4º Período'),
        ('PERIODO', 5, '5º Período'), ('PERIODO', 6, '6º Período'), ('PERIODO', 7, '7º Período'), ('PERIODO', 8, '8º Período');

      INSERT OR IGNORE INTO role_permissions(role, permission) VALUES
        ('CSTI', 'articulation.manage'),
        ('ALUNO', 'articulation.answer'),
        ('COORDENACAO', 'articulation.results'),
        ('PROFESSOR', 'articulation.own');
    `);
  }
};
