'use strict';
// One account-creation path for the individual form and the confirmed Excel import.
// The caller owns the transaction. No fixed password and no implicit enrollments.
const D = require('./domain');
const U = require('./user-management');
const {studentPeriod} = require('./student-period');
const {isManagedRole} = require('./roles');
function identity(db, body, except = 0) {
  const name = D.text(body.name),
    email = D.text(body.email, 240).toLowerCase();
  const matricula = D.text(body.matricula, 70);
  if (!name || !matricula || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    D.fail(400, 'Informe nome, e-mail v\u00e1lido e matr\u00edcula.');
  if (
    String(body.name || '').trim().length > 150 ||
    String(body.email || '').trim().length > 240 ||
    String(body.matricula || '').trim().length > 70
  )
    D.fail(400, 'Nome, e-mail ou matr\u00edcula excede o tamanho permitido.');
  if (
    db
      .prepare('SELECT id FROM users WHERE id<>? AND (lower(email) IN (?,?) OR lower(matricula) IN (?,?))')
      .get(except, email, matricula.toLowerCase(), email, matricula.toLowerCase())
  )
    D.fail(409, 'E-mail ou matr\u00edcula j\u00e1 cadastrado. Use Editar para corrigir a conta existente.');
  return {name, email, matricula};
}
function createAccount(db, body, passwordHash) {
  const role = body.role;
  if (!isManagedRole(role)) D.fail(400, 'Perfil inv\u00e1lido. Este cadastro n\u00e3o cria administradores.');
  const v = identity(db, body),
    period = studentPeriod(body.period, role);
  if (typeof passwordHash !== 'string' || !/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(passwordHash))
    D.fail(500, 'Hash de senha inv\u00e1lido.');
  let sid = null;
  if (role === 'ALUNO') {
    const previous = db.prepare('SELECT id FROM students WHERE lower(matricula)=lower(?)').get(v.matricula);
    if (previous) {
      sid = previous.id;
      if (db.prepare('SELECT id FROM users WHERE student_id=?').get(sid))
        D.fail(409, 'Este aluno j\u00e1 possui conta.');
    } else {
      sid = U.nextId(db, 'students');
      db.prepare('INSERT INTO students(id,name,matricula,period) VALUES(?,?,?,?)').run(
        sid,
        v.name,
        v.matricula,
        period
      );
    }
    db.prepare('UPDATE students SET name=? WHERE id=?').run(v.name, sid);
    if (Object.hasOwn(body, 'period')) db.prepare('UPDATE students SET period=? WHERE id=?').run(period, sid);
  }
  const id = U.nextId(db, 'users');
  // The password was chosen by someone else: its owner must replace it on first access.
  db.prepare(
    'INSERT INTO users(id,name,email,matricula,password_hash,role,student_id,must_change_password) VALUES(?,?,?,?,?,?,?,1)'
  ).run(id, v.name, v.email, v.matricula, passwordHash, role, sid);
  return {
    ok: true,
    id,
    role,
    student_id: sid,
    period: role === 'ALUNO' ? db.prepare('SELECT period FROM students WHERE id=?').get(sid).period : null
  };
}
module.exports = {identity, createAccount};
