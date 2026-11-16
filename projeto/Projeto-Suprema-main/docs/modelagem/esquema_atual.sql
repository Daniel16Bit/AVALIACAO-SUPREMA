-- Avaliação Suprema: esquema atual do banco de dados (SQLite).
--
-- ARQUIVO GERADO. Não edite à mão: rode `npm run docs:schema`.
-- O conteúdo é lido de um banco novo e vazio, depois da criação inicial e de todas as
-- migrações. Um teste do `npm test` falha quando este arquivo fica desatualizado.
-- Serve para consulta; o sistema não executa este arquivo.
--
-- Migrações aplicadas: 001-sessions, 002-permissions, 003-grade-history, 004-instrument-config, 005-forms, 006-osce, 007-anonymous-forms, 008-teacher-eval, 009-receipts, 010-articulation, integrated-2026-11-v1, password-change-v1, student-period-import-v1, users-lifecycle-2026-11-v1.
-- 41 tabelas, 17 índices, 20 gatilhos.

-- ============================================================================
-- Tabelas
-- ============================================================================

CREATE TABLE academic_courses(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);

CREATE TABLE academic_disciplines(id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL, name TEXT NOT NULL, period TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, UNIQUE(course_id,name,period), FOREIGN KEY(course_id) REFERENCES academic_courses(id));

CREATE TABLE academic_enrollments(id INTEGER PRIMARY KEY, discipline_id INTEGER NOT NULL, student_id INTEGER NOT NULL, year INTEGER NOT NULL, semester TEXT NOT NULL, class_name TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, UNIQUE(discipline_id,student_id,year,semester,class_name), FOREIGN KEY(discipline_id) REFERENCES academic_disciplines(id), FOREIGN KEY(student_id) REFERENCES students(id));

CREATE TABLE anon_answers (
        submission_id TEXT NOT NULL REFERENCES anon_submissions(id),
        question_id INTEGER NOT NULL REFERENCES form_questions(id),
        value TEXT NOT NULL CHECK(value IN ('SIM', 'NAO', 'NA')),
        comment TEXT,
        PRIMARY KEY(submission_id, question_id)
      ) WITHOUT ROWID;

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

CREATE TABLE articulation_answers (
        response_id INTEGER NOT NULL REFERENCES articulation_responses(id),
        question_id INTEGER NOT NULL REFERENCES articulation_questions(id),
        value TEXT NOT NULL,
        option_id INTEGER REFERENCES articulation_options(id),
        justification TEXT,
        PRIMARY KEY(response_id, question_id)
      );

CREATE TABLE articulation_default_options (
        list TEXT NOT NULL CHECK(list IN ('PERIODO', 'TUTOR', 'ESTACAO')),
        position INTEGER NOT NULL,
        label TEXT NOT NULL,
        professor_id INTEGER REFERENCES users(id),
        PRIMARY KEY(list, position)
      );

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

CREATE TABLE assessment_headers (
      assessment_id INTEGER NOT NULL,
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      PRIMARY KEY(assessment_id, field_key),
      FOREIGN KEY(assessment_id) REFERENCES assessments(id)
    );

CREATE TABLE assessment_instrument_config (
        assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        field_key TEXT NOT NULL,
        max_value REAL NOT NULL CHECK(max_value > 0),
        PRIMARY KEY(assessment_id, field_key)
      );

CREATE TABLE assessment_question_config (
      assessment_id INTEGER NOT NULL,
      field_key TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'DISCURSIVA',
      area TEXT,
      max_value REAL,
      PRIMARY KEY(assessment_id, field_key),
      FOREIGN KEY(assessment_id) REFERENCES assessments(id)
    );

CREATE TABLE assessments (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      year INTEGER NOT NULL,
      semester TEXT NOT NULL,
      period TEXT NOT NULL,
      discipline TEXT NOT NULL,
      class_name TEXT NOT NULL,
      professor_id INTEGER NOT NULL,
      locked INTEGER NOT NULL DEFAULT 0, assignment_id INTEGER REFERENCES teaching_assignments(id), revision INTEGER NOT NULL DEFAULT 0, published_revision INTEGER NOT NULL DEFAULT 0,
      UNIQUE(type,year,semester,period,discipline,class_name,professor_id),
      FOREIGN KEY(professor_id) REFERENCES users(id)
    );

CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      details TEXT
    , actor_id INTEGER, origin TEXT, assessment_id INTEGER);

CREATE TABLE form_answers (
        submission_id INTEGER NOT NULL REFERENCES form_submissions(id),
        question_id INTEGER NOT NULL REFERENCES form_questions(id),
        value TEXT NOT NULL CHECK(value IN ('SIM', 'NAO', 'NA')),
        comment TEXT,
        PRIMARY KEY(submission_id, question_id)
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

CREATE TABLE forms (
        id INTEGER PRIMARY KEY,
        module TEXT NOT NULL,
        title TEXT NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE identity_counters(entity TEXT PRIMARY KEY CHECK(entity IN('users','students')), last_id INTEGER NOT NULL DEFAULT 0 CHECK(last_id>=0));

CREATE TABLE osce_event_students (
        event_id INTEGER NOT NULL REFERENCES osce_events(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES students(id),
        PRIMARY KEY(event_id, student_id)
      );

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

CREATE TABLE publication_events(id INTEGER PRIMARY KEY,assessment_id INTEGER NOT NULL REFERENCES assessments(id),actor_id INTEGER NOT NULL REFERENCES users(id),revision INTEGER NOT NULL,student_count INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

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

CREATE TABLE published_scores (
      score_id INTEGER PRIMARY KEY,
      assessment_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      c1 REAL, c2 REAL, c3 REAL, c4 REAL, c5 REAL, c6 REAL,
      a1 REAL, a2 REAL, a3_de_a1 REAL, a3_de_a2 REAL,
      me1 REAL, me2 REAL, me3 REAL, me4 REAL,
      q7 REAL, q8 REAL, q9 REAL, q10 REAL,
      osce1 REAL, osce2 REAL, osce3 REAL, osce4 REAL,
      nota_prova REAL,
      pbl1 REAL, pbl2 REAL, osce REAL, trabalho REAL, outros_final REAL,
      nota_final REAL,
      sent INTEGER NOT NULL DEFAULT 0,
      published_at TEXT, metadata_json TEXT,
      FOREIGN KEY(score_id) REFERENCES scores(id),
      FOREIGN KEY(assessment_id) REFERENCES assessments(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    );

CREATE TABLE receipts (
        id INTEGER PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        student_id INTEGER NOT NULL REFERENCES students(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        origin TEXT,
        issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE role_permissions(role TEXT NOT NULL, permission TEXT NOT NULL, PRIMARY KEY(role,permission));

CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

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

CREATE TABLE scores (
      id INTEGER PRIMARY KEY,
      assessment_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      c1 REAL, c2 REAL, c3 REAL, c4 REAL, c5 REAL, c6 REAL,
      a1 REAL, a2 REAL, a3_de_a1 REAL, a3_de_a2 REAL,
      me1 REAL, me2 REAL, me3 REAL, me4 REAL,
      q7 REAL, q8 REAL, q9 REAL, q10 REAL,
      osce1 REAL, osce2 REAL, osce3 REAL, osce4 REAL,
      nota_prova REAL,
      pbl1 REAL, pbl2 REAL, osce REAL, trabalho REAL, outros_final REAL,
      nota_final REAL,
      sent INTEGER NOT NULL DEFAULT 0,
      UNIQUE(assessment_id, student_id),
      FOREIGN KEY(assessment_id) REFERENCES assessments(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    );

CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        session_version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      ) WITHOUT ROWID;

CREATE TABLE student_import_runs (
        id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        file_name TEXT NOT NULL,
        source_sha256 TEXT NOT NULL,
        report_json TEXT NOT NULL
      );

CREATE TABLE students (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      matricula TEXT UNIQUE NOT NULL
    , period TEXT);

CREATE TABLE system_controls(key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0 CHECK(value IN(0,1)));

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

CREATE TABLE teaching_assignments(id INTEGER PRIMARY KEY, discipline_id INTEGER NOT NULL, professor_id INTEGER NOT NULL, year INTEGER NOT NULL, semester TEXT NOT NULL, class_name TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, UNIQUE(discipline_id,professor_id,year,semester,class_name), FOREIGN KEY(discipline_id) REFERENCES academic_disciplines(id), FOREIGN KEY(professor_id) REFERENCES users(id));

CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      matricula TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      invalid_attempts INTEGER NOT NULL DEFAULT 0
    , student_id INTEGER REFERENCES students(id), session_version INTEGER NOT NULL DEFAULT 0, must_change_password INTEGER NOT NULL DEFAULT 0);

-- ============================================================================
-- Índices
-- ============================================================================

-- em anon_submissions
CREATE INDEX idx_anon_submissions_subject ON anon_submissions(form_id, subject_key);

-- em teaching_assignments
CREATE INDEX idx_assignments_professor ON teaching_assignments(professor_id,active);

-- em audit_logs
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, id);

-- em audit_logs
CREATE INDEX idx_audit_assessment ON audit_logs(assessment_id, id);

-- em academic_enrollments
CREATE INDEX idx_enrollments_context ON academic_enrollments(discipline_id,year,semester,class_name,active);

-- em form_submissions
CREATE UNIQUE INDEX idx_form_one_valid_per_student ON form_submissions(form_id, subject_student_id)
        WHERE voided_at IS NULL AND subject_student_id IS NOT NULL;

-- em form_submissions
CREATE INDEX idx_form_submissions_form ON form_submissions(form_id, id);

-- em publication_snapshots
CREATE INDEX idx_publication_snapshots_assessment ON publication_snapshots(assessment_id, id);

-- em publication_snapshots
CREATE INDEX idx_publication_snapshots_student ON publication_snapshots(student_id, assessment_id, id);

-- em published_scores
CREATE INDEX idx_published_student ON published_scores(student_id,assessment_id);

-- em receipts
CREATE INDEX idx_receipts_student ON receipts(student_id, id);

-- em score_changes
CREATE INDEX idx_score_changes_assessment ON score_changes(assessment_id, id);

-- em score_changes
CREATE INDEX idx_score_changes_student ON score_changes(student_id, assessment_id, id);

-- em scores
CREATE INDEX idx_scores_assessment ON scores(assessment_id);

-- em sessions
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

-- em sessions
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- em teacher_eval_targets
CREATE INDEX idx_teacher_eval_targets_professor ON teacher_eval_targets(professor_id, campaign_id);

-- ============================================================================
-- Gatilhos
-- ============================================================================

-- em anon_answers
CREATE TRIGGER anon_answers_no_delete BEFORE DELETE ON anon_answers
        BEGIN SELECT RAISE(ABORT, 'Respostas anonimas nao podem ser apagadas.'); END;

-- em anon_answers
CREATE TRIGGER anon_answers_no_update BEFORE UPDATE ON anon_answers
        BEGIN SELECT RAISE(ABORT, 'Respostas anonimas nao podem ser alteradas.'); END;

-- em anon_participation
CREATE TRIGGER anon_participation_no_delete BEFORE DELETE ON anon_participation
        BEGIN SELECT RAISE(ABORT, 'Registros de participacao nao podem ser apagados.'); END;

-- em anon_participation
CREATE TRIGGER anon_participation_no_update BEFORE UPDATE ON anon_participation
        BEGIN SELECT RAISE(ABORT, 'Registros de participacao nao podem ser alterados.'); END;

-- em anon_submissions
CREATE TRIGGER anon_submissions_no_delete BEFORE DELETE ON anon_submissions
        BEGIN SELECT RAISE(ABORT, 'Respostas anonimas nao podem ser apagadas.'); END;

-- em anon_submissions
CREATE TRIGGER anon_submissions_no_update BEFORE UPDATE ON anon_submissions
        BEGIN SELECT RAISE(ABORT, 'Respostas anonimas nao podem ser alteradas.'); END;

-- em articulation_answers
CREATE TRIGGER articulation_answers_no_delete BEFORE DELETE ON articulation_answers
        BEGIN SELECT RAISE(ABORT, 'Respostas da articulacao nao podem ser apagadas.'); END;

-- em articulation_answers
CREATE TRIGGER articulation_answers_no_update BEFORE UPDATE ON articulation_answers
        BEGIN SELECT RAISE(ABORT, 'Respostas da articulacao nao podem ser alteradas.'); END;

-- em articulation_responses
CREATE TRIGGER articulation_responses_no_delete BEFORE DELETE ON articulation_responses
        BEGIN SELECT RAISE(ABORT, 'Respostas da articulacao nao podem ser apagadas.'); END;

-- em articulation_responses
CREATE TRIGGER articulation_responses_no_update BEFORE UPDATE ON articulation_responses
        BEGIN SELECT RAISE(ABORT, 'Respostas da articulacao nao podem ser alteradas.'); END;

-- em form_answers
CREATE TRIGGER form_answers_no_delete BEFORE DELETE ON form_answers
        BEGIN SELECT RAISE(ABORT, 'Respostas de formulario nao podem ser apagadas.'); END;

-- em form_answers
CREATE TRIGGER form_answers_no_update BEFORE UPDATE ON form_answers
        BEGIN SELECT RAISE(ABORT, 'Respostas de formulario nao podem ser alteradas.'); END;

-- em form_submissions
CREATE TRIGGER form_submissions_no_delete BEFORE DELETE ON form_submissions
        BEGIN SELECT RAISE(ABORT, 'Envios de formulario nao podem ser apagados.'); END;

-- em form_submissions
CREATE TRIGGER form_submissions_void_only BEFORE UPDATE ON form_submissions
        WHEN OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL
          OR NEW.form_id IS NOT OLD.form_id OR NEW.subject_student_id IS NOT OLD.subject_student_id
          OR NEW.submitted_by IS NOT OLD.submitted_by OR NEW.origin IS NOT OLD.origin OR NEW.created_at IS NOT OLD.created_at
        BEGIN SELECT RAISE(ABORT, 'Envios de formulario so podem ser anulados, uma unica vez.'); END;

-- em publication_snapshots
CREATE TRIGGER publication_snapshots_no_delete BEFORE DELETE ON publication_snapshots
        BEGIN SELECT RAISE(ABORT, 'O historico de publicacoes nao pode ser apagado.'); END;

-- em publication_snapshots
CREATE TRIGGER publication_snapshots_no_update BEFORE UPDATE ON publication_snapshots
        BEGIN SELECT RAISE(ABORT, 'O historico de publicacoes nao pode ser modificado.'); END;

-- em receipts
CREATE TRIGGER receipts_no_delete BEFORE DELETE ON receipts
        BEGIN SELECT RAISE(ABORT, 'Comprovantes nao podem ser apagados.'); END;

-- em receipts
CREATE TRIGGER receipts_no_update BEFORE UPDATE ON receipts
        BEGIN SELECT RAISE(ABORT, 'Comprovantes nao podem ser alterados.'); END;

-- em score_changes
CREATE TRIGGER score_changes_no_delete BEFORE DELETE ON score_changes
        BEGIN SELECT RAISE(ABORT, 'O historico de alteracoes de nota nao pode ser apagado.'); END;

-- em score_changes
CREATE TRIGGER score_changes_no_update BEFORE UPDATE ON score_changes
        BEGIN SELECT RAISE(ABORT, 'O historico de alteracoes de nota nao pode ser modificado.'); END;

-- ============================================================================
-- Permissões de cada perfil (conteúdo inicial de role_permissions)
-- ============================================================================

-- ADMIN              admin.manage
-- ADMIN              evolution.all
-- ADMIN              receipts.verify
-- ALUNO              articulation.answer
-- ALUNO              receipts.own
-- ALUNO              results.own
-- ALUNO              teacher_eval.answer
-- COORDENACAO        articulation.results
-- COORDENACAO        teacher_eval.all
-- CSTI               articulation.manage
-- CSTI               receipts.verify
-- CSTI               teacher_eval.manage
-- NUCLEO_AVALIACAO   osce.manage
-- NUCLEO_AVALIACAO   osce.results
-- OPERACIONAL        osce.respond
-- PROFESSOR          articulation.own
-- PROFESSOR          assessment.own
-- PROFESSOR          evolution.own
-- PROFESSOR          teacher_eval.own
