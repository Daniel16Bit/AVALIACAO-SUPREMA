// Database initialization is additive and transactional. Never reset grades or passwords.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const migrations = require('./migrations');
const ROOT = path.resolve(__dirname, '../../../..');
function openDatabase(dataDir = process.env.SUPREMA_DATA_DIR || path.join(ROOT, 'data'), options = {}) {
  dataDir = path.resolve(dataDir);
  // Tests may inject their own list; production always uses the shipped migrations.
  const versioned = options.migrations || migrations.MIGRATIONS;
  fs.mkdirSync(dataDir, {recursive: true});
  const filename = path.join(dataDir, 'avaliacao_suprema.db');
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const integrity = db.prepare('PRAGMA quick_check').all();
  if (integrity.some(r => Object.values(r)[0] !== 'ok')) {
    db.close();
    throw Error('Banco inconsistente. Nenhum dado foi substituido.');
  }
  let preMigrationBackup = null;
  try {
    migrations.assertNotNewer(db, versioned);
    // Copy an existing database before any pending versioned migration changes it.
    preMigrationBackup = migrations.backupBeforeMigrating(db, dataDir, versioned);
  } catch (e) {
    db.close();
    throw e;
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      matricula TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      invalid_attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      year INTEGER NOT NULL,
      semester TEXT NOT NULL,
      period TEXT NOT NULL,
      discipline TEXT NOT NULL,
      class_name TEXT NOT NULL,
      professor_id INTEGER NOT NULL,
      locked INTEGER NOT NULL DEFAULT 0,
      UNIQUE(type,year,semester,period,discipline,class_name,professor_id),
      FOREIGN KEY(professor_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      matricula TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scores (
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
    CREATE TABLE IF NOT EXISTS published_scores (
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
      published_at TEXT,
      FOREIGN KEY(score_id) REFERENCES scores(id),
      FOREIGN KEY(assessment_id) REFERENCES assessments(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    );
    CREATE TABLE IF NOT EXISTS assessment_headers (
      assessment_id INTEGER NOT NULL,
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      PRIMARY KEY(assessment_id, field_key),
      FOREIGN KEY(assessment_id) REFERENCES assessments(id)
    );
    CREATE TABLE IF NOT EXISTS assessment_question_config (
      assessment_id INTEGER NOT NULL,
      field_key TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'DISCURSIVA',
      area TEXT,
      max_value REAL,
      PRIMARY KEY(assessment_id, field_key),
      FOREIGN KEY(assessment_id) REFERENCES assessments(id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      details TEXT
    );
  `);
    db.exec(`CREATE TABLE IF NOT EXISTS academic_courses(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS academic_disciplines(id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL, name TEXT NOT NULL, period TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, UNIQUE(course_id,name,period), FOREIGN KEY(course_id) REFERENCES academic_courses(id));
  CREATE TABLE IF NOT EXISTS teaching_assignments(id INTEGER PRIMARY KEY, discipline_id INTEGER NOT NULL, professor_id INTEGER NOT NULL, year INTEGER NOT NULL, semester TEXT NOT NULL, class_name TEXT NOT NULL DEFAULT '', UNIQUE(discipline_id,professor_id,year,semester,class_name), FOREIGN KEY(discipline_id) REFERENCES academic_disciplines(id), FOREIGN KEY(professor_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS academic_enrollments(id INTEGER PRIMARY KEY, discipline_id INTEGER NOT NULL, student_id INTEGER NOT NULL, year INTEGER NOT NULL, semester TEXT NOT NULL, class_name TEXT NOT NULL DEFAULT '', UNIQUE(discipline_id,student_id,year,semester,class_name), FOREIGN KEY(discipline_id) REFERENCES academic_disciplines(id), FOREIGN KEY(student_id) REFERENCES students(id));`);
    function add(table, column, type) {
      if (
        !db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some(c => c.name === column)
      )
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
    for (const table of ['scores', 'published_scores']) {
      for (const c of [
        'a1',
        'a2',
        'a3_de_a1',
        'a3_de_a2',
        'me1',
        'me2',
        'me3',
        'me4',
        'osce1',
        'osce2',
        'osce3',
        'osce4'
      ])
        add(table, c, 'REAL');
    }
    add('students', 'period', 'TEXT');
    add('users', 'student_id', 'INTEGER REFERENCES students(id)');
    add('users', 'session_version', 'INTEGER NOT NULL DEFAULT 0');
    add('users', 'active', 'INTEGER NOT NULL DEFAULT 1');
    add('users', 'invalid_attempts', 'INTEGER NOT NULL DEFAULT 0');
    // Set when an administrator chooses or resets a password; cleared by the owner's own change.
    // Existing accounts keep 0: nothing is forced retroactively.
    add('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
    add('teaching_assignments', 'active', 'INTEGER NOT NULL DEFAULT 1');
    add('academic_enrollments', 'active', 'INTEGER NOT NULL DEFAULT 1');
    add('assessments', 'assignment_id', 'INTEGER REFERENCES teaching_assignments(id)');
    add('assessments', 'revision', 'INTEGER NOT NULL DEFAULT 0');
    add('assessments', 'published_revision', 'INTEGER NOT NULL DEFAULT 0');
    add('published_scores', 'metadata_json', 'TEXT');
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS system_controls(key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0 CHECK(value IN(0,1)));
      CREATE TABLE IF NOT EXISTS role_permissions(role TEXT NOT NULL, permission TEXT NOT NULL, PRIMARY KEY(role,permission));
      CREATE TABLE IF NOT EXISTS publication_events(id INTEGER PRIMARY KEY,assessment_id INTEGER NOT NULL REFERENCES assessments(id),actor_id INTEGER NOT NULL REFERENCES users(id),revision INTEGER NOT NULL,student_count INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE INDEX IF NOT EXISTS idx_scores_assessment ON scores(assessment_id);
      CREATE INDEX IF NOT EXISTS idx_published_student ON published_scores(student_id,assessment_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_professor ON teaching_assignments(professor_id,active);
      CREATE INDEX IF NOT EXISTS idx_enrollments_context ON academic_enrollments(discipline_id,year,semester,class_name,active);
      INSERT OR IGNORE INTO system_controls(key,value) VALUES('pause_scores',0),('pause_publication',0);
      INSERT OR IGNORE INTO role_permissions(role,permission) VALUES('ADMIN','admin.manage'),('PROFESSOR','assessment.own'),('ALUNO','results.own');
      INSERT OR IGNORE INTO schema_migrations(id) VALUES('integrated-2026-11-v1');
      CREATE TABLE IF NOT EXISTS identity_counters(entity TEXT PRIMARY KEY CHECK(entity IN('users','students')), last_id INTEGER NOT NULL DEFAULT 0 CHECK(last_id>=0));
      INSERT OR IGNORE INTO identity_counters(entity,last_id) SELECT 'users',COALESCE(MAX(id),0) FROM users;
      INSERT OR IGNORE INTO identity_counters(entity,last_id) SELECT 'students',COALESCE(MAX(id),0) FROM students;
      INSERT OR IGNORE INTO schema_migrations(id) VALUES('users-lifecycle-2026-11-v1');
      CREATE TABLE IF NOT EXISTS student_import_runs (
        id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        file_name TEXT NOT NULL,
        source_sha256 TEXT NOT NULL,
        report_json TEXT NOT NULL
      );
      INSERT OR IGNORE INTO schema_migrations(id) VALUES('student-period-import-v1');
      INSERT OR IGNORE INTO schema_migrations(id) VALUES('password-change-v1');
    `);
    // Versioned migrations share this transaction: a failure leaves the database untouched.
    migrations.run(db, versioned);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    db.close();
    throw e;
  }
  // No seed, no automatic publication, no score recalculation, no password resets.
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
  return {db, filename, dataDir, preMigrationBackup};
}
module.exports = {openDatabase, ROOT};
