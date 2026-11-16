'use strict';
// Authorization moves from "is this exact profile" to "does this profile hold this permission".
// The three original permissions were already seeded by the baseline; this adds the two that
// the evolution report checked inline. The new profiles (COORDENACAO, NUCLEO_AVALIACAO, CSTI,
// OPERACIONAL) deliberately receive nothing here: each module grants its own permissions
// when it is built, so no profile gains access by default.
module.exports = {
  id: '002-permissions',
  up(db) {
    db.exec(`
      INSERT OR IGNORE INTO role_permissions(role,permission) VALUES
        ('ADMIN','admin.manage'),
        ('PROFESSOR','assessment.own'),
        ('ALUNO','results.own'),
        ('ADMIN','evolution.all'),
        ('PROFESSOR','evolution.own');
    `);
  }
};
