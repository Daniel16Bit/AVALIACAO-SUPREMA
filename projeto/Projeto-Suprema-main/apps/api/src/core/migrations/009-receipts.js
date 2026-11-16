'use strict';
// Receipts of what a student did (answering an evaluation, for instance).
//  - One row per action, with a random verification code. The PDF handed to the student is
//    produced from this row; what proves the action is the row, never the file.
//  - A receipt says who did what and when. It never holds what was answered, so it can
//    exist for anonymous evaluations without linking the student to the content.
//  - Rows are never updated or deleted.
// The student reads his or her own receipts; the administrator and the CSTI (the IT team)
// verify a code and list receipts. Teachers and the coordination receive no permission.
module.exports = {
  id: '009-receipts',
  up(db) {
    db.exec(`
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
      CREATE INDEX idx_receipts_student ON receipts(student_id, id);

      CREATE TRIGGER receipts_no_update BEFORE UPDATE ON receipts
        BEGIN SELECT RAISE(ABORT, 'Comprovantes nao podem ser alterados.'); END;
      CREATE TRIGGER receipts_no_delete BEFORE DELETE ON receipts
        BEGIN SELECT RAISE(ABORT, 'Comprovantes nao podem ser apagados.'); END;

      INSERT OR IGNORE INTO role_permissions(role, permission) VALUES
        ('ALUNO', 'receipts.own'),
        ('ADMIN', 'receipts.verify'),
        ('CSTI', 'receipts.verify');
    `);
  }
};
