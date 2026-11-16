'use strict';
// Account lifecycle operations. Call mutations inside D.transaction.
// No grade, publication or audit history is deleted by this module.
const D = require('./domain');
const {studentPeriod} = require('./student-period');
const {managedRoles} = require('./roles');
const H = require('./grade-history');

function nextId(db, entity) {
  if (!['users', 'students'].includes(entity)) throw Error('Invalid identity counter.');
  const max = Number(db.prepare(`SELECT COALESCE(MAX(id),0) n FROM ${entity}`).get().n);
  db.prepare('UPDATE identity_counters SET last_id=MAX(last_id,?)+1 WHERE entity=?').run(max, entity);
  return Number(db.prepare('SELECT last_id FROM identity_counters WHERE entity=?').get(entity).last_id);
}
function managedUser(db, uid, actor) {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(D.id(uid));
  if (!u) D.fail(404, 'Usu\u00e1rio n\u00e3o encontrado. Atualize a lista.');
  if (!managedRoles.includes(u.role) || u.id === actor?.id)
    D.fail(
      403,
      'A conta administrativa n\u00e3o pode ser exclu\u00edda ou ter a fun\u00e7\u00e3o alterada por este cadastro.'
    );
  return u;
}
function checkVersion(u, body, required = false) {
  if (body.expected_version === undefined && !required) return;
  if (!Number.isInteger(body.expected_version) || body.expected_version < 0)
    D.fail(400, 'Atualize a lista de usu\u00e1rios antes de confirmar a opera\u00e7\u00e3o.');
  if (body.expected_version !== u.session_version)
    D.fail(409, 'Este cadastro mudou em outra sess\u00e3o. Feche a janela, atualize a lista e confira os dados.');
}
function impact(db, u) {
  const sid = u.student_id || null;
  // Includes all stored grade columns, also legacy and derived values. Zero is a grade.
  const columns = db
    .prepare('PRAGMA table_info(scores)')
    .all()
    .map(c => c.name)
    .filter(c => !['id', 'assessment_id', 'student_id', 'sent'].includes(c));
  const notes =
    columns
      .map(c => `(s."${c.replace(/"/g, '""')}" IS NOT NULL AND CAST(s."${c.replace(/"/g, '""')}" AS TEXT)<>'')`)
      .join(' OR ') || '0';
  const affected = '(s.student_id=? OR s.assessment_id IN(SELECT id FROM assessments WHERE professor_id=?))';
  const count = (q, ...p) => Number(db.prepare(q).get(...p).n);
  const counts = {
    assignments: count('SELECT count(*) n FROM teaching_assignments WHERE professor_id=?', u.id),
    active_assignments: count('SELECT count(*) n FROM teaching_assignments WHERE professor_id=? AND active=1', u.id),
    assessments: count('SELECT count(*) n FROM assessments WHERE professor_id=?', u.id),
    enrollments: count('SELECT count(*) n FROM academic_enrollments WHERE student_id=?', sid),
    active_enrollments: count('SELECT count(*) n FROM academic_enrollments WHERE student_id=? AND active=1', sid),
    score_rows: count(`SELECT count(*) n FROM scores s WHERE ${affected}`, sid, u.id),
    graded_rows: count(`SELECT count(*) n FROM scores s WHERE ${affected} AND (${notes} OR s.sent<>0)`, sid, u.id),
    published_rows: count(
      'SELECT count(*) n FROM published_scores WHERE student_id=? OR assessment_id IN(SELECT id FROM assessments WHERE professor_id=?)',
      sid,
      u.id
    ),
    publication_events: count(
      'SELECT count(*) n FROM publication_events WHERE actor_id=? OR assessment_id IN(SELECT id FROM assessments WHERE professor_id=?)',
      u.id,
      u.id
    ),
    shared_student_accounts: count('SELECT count(*) n FROM users WHERE student_id=? AND id<>?', sid, u.id),
    history_rows: H.historyCount(db, u.id, sid)
  };
  let reason = '';
  if (counts.shared_student_accounts)
    reason =
      'Este cadastro acad\u00eamico est\u00e1 associado a outra conta. Revise os v\u00ednculos antes de excluir.';
  else if (counts.history_rows)
    reason =
      'Exclus\u00e3o bloqueada: existe hist\u00f3rico de notas ligado a esta conta. Para preserv\u00e1-lo, desative o acesso em vez de excluir.';
  else if (counts.graded_rows || counts.published_rows || counts.publication_events)
    reason =
      'Exclus\u00e3o bloqueada: existem notas ou publica\u00e7\u00f5es vinculadas. Para preservar o hist\u00f3rico, edite a fun\u00e7\u00e3o ou desative o acesso.';
  return {
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      matricula: u.matricula,
      role: u.role,
      active: u.active,
      session_version: u.session_version,
      period:
        u.role === 'ALUNO' && sid ? db.prepare('SELECT period FROM students WHERE id=?').get(sid)?.period || null : null
    },
    counts,
    can_delete: !reason,
    reason
  };
}
function touchStudentAssessments(db, sid) {
  db.prepare(
    'UPDATE assessments SET revision=revision+1 WHERE id IN(SELECT assessment_id FROM scores WHERE student_id=?)'
  ).run(sid);
}
function updateUser(db, u, v, body) {
  const role = body.role === undefined ? u.role : body.role;
  if (!managedRoles.includes(role))
    D.fail(400, 'Selecione um perfil v\u00e1lido. Este cadastro n\u00e3o promove usu\u00e1rios a administrador.');
  const p = studentPeriod(body.period, role);
  const changed = role !== u.role;
  checkVersion(u, body, changed);
  if (changed && body.confirm_role_change !== true)
    D.fail(
      400,
      'Confirme a altera\u00e7\u00e3o de fun\u00e7\u00e3o. Os v\u00ednculos ativos da fun\u00e7\u00e3o anterior ser\u00e3o desativados, sem apagar notas.'
    );
  let sid = u.student_id || null;
  if (sid && db.prepare('SELECT id FROM users WHERE student_id=? AND id<>?').get(sid, u.id))
    D.fail(
      409,
      'O cadastro acad\u00eamico est\u00e1 associado a outra conta. Nenhuma altera\u00e7\u00e3o foi aplicada.'
    );
  if (sid) {
    if (!db.prepare('SELECT id FROM students WHERE id=?').get(sid))
      D.fail(409, 'Cadastro acad\u00eamico inconsistente. Nenhuma altera\u00e7\u00e3o foi aplicada.');
    if (db.prepare('SELECT id FROM students WHERE lower(matricula)=lower(?) AND id<>?').get(v.matricula, sid))
      D.fail(409, 'Esta matr\u00edcula j\u00e1 pertence a outro cadastro acad\u00eamico.');
  } else if (role === 'ALUNO') {
    const legacy = db.prepare('SELECT id FROM students WHERE lower(matricula)=lower(?)').get(v.matricula);
    // A role conversion must not silently adopt another student's grades.
    if (legacy) {
      if (changed || db.prepare('SELECT id FROM users WHERE student_id=? AND id<>?').get(legacy.id, u.id))
        D.fail(
          409,
          'Esta matr\u00edcula j\u00e1 pertence a um cadastro acad\u00eamico. Use um identificador dispon\u00edvel; o hist\u00f3rico n\u00e3o ser\u00e1 transferido.'
        );
      sid = legacy.id;
    } else {
      sid = nextId(db, 'students');
      db.prepare('INSERT INTO students(id,name,matricula) VALUES(?,?,?)').run(sid, v.name, v.matricula);
    }
  }
  let disabledAssignments = 0,
    disabledEnrollments = 0;
  if (changed && u.role === 'PROFESSOR') {
    disabledAssignments = Number(
      db.prepare('UPDATE teaching_assignments SET active=0 WHERE professor_id=? AND active=1').run(u.id).changes
    );
    db.prepare('UPDATE assessments SET revision=revision+1 WHERE professor_id=?').run(u.id);
  }
  if (changed && u.role === 'ALUNO' && sid) {
    disabledEnrollments = Number(
      db.prepare('UPDATE academic_enrollments SET active=0 WHERE student_id=? AND active=1').run(sid).changes
    );
    touchStudentAssessments(db, sid);
  }
  db.prepare(
    'UPDATE users SET name=?,email=?,matricula=?,role=?,student_id=?,active=?,session_version=session_version+1 WHERE id=?'
  ).run(v.name, v.email, v.matricula, role, sid, body.active, u.id);
  if (sid) db.prepare('UPDATE students SET name=?,matricula=? WHERE id=?').run(v.name, v.matricula, sid);
  if (sid && role === 'ALUNO' && Object.hasOwn(body, 'period'))
    db.prepare('UPDATE students SET period=? WHERE id=?').run(p, sid);
  return {
    ok: true,
    id: u.id,
    role,
    previous_role: u.role,
    role_changed: changed,
    student_id: sid,
    disabled_assignments: disabledAssignments,
    disabled_enrollments: disabledEnrollments,
    history_preserved: true
  };
}
function deleteUser(db, u, body) {
  checkVersion(u, body, true);
  if (
    typeof body.confirmation_email !== 'string' ||
    body.confirmation_email.trim().toLowerCase() !== u.email.toLowerCase()
  )
    D.fail(400, 'Digite o e-mail desta conta para confirmar a exclus\u00e3o.');
  const preview = impact(db, u);
  if (!preview.can_delete) D.fail(409, preview.reason);
  const sid = u.student_id || null;
  // Only empty rows and non-graded setup can reach this transaction.
  if (sid) touchStudentAssessments(db, sid);
  db.prepare(
    'DELETE FROM scores WHERE student_id=? OR assessment_id IN(SELECT id FROM assessments WHERE professor_id=?)'
  ).run(sid, u.id);
  for (const table of ['assessment_headers', 'assessment_question_config'])
    db.prepare(`DELETE FROM ${table} WHERE assessment_id IN(SELECT id FROM assessments WHERE professor_id=?)`).run(
      u.id
    );
  db.prepare('DELETE FROM assessments WHERE professor_id=?').run(u.id);
  db.prepare('DELETE FROM teaching_assignments WHERE professor_id=?').run(u.id);
  db.prepare('DELETE FROM academic_enrollments WHERE student_id=?').run(sid);
  db.prepare('DELETE FROM users WHERE id=?').run(u.id);
  if (sid) db.prepare('DELETE FROM students WHERE id=?').run(sid);
  return {ok: true, id: u.id, deleted: true, email_released: true, previous_role: u.role, removed: preview.counts};
}
module.exports = {nextId, managedUser, checkVersion, impact, updateUser, deleteUser};
