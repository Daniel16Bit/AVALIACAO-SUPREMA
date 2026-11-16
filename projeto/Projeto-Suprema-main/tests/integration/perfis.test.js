'use strict';
// Profiles and permission-based authorization. New profiles exist and sign in,
// but hold no permission until a module grants one. The OSCE module (stage 5) and the
// teacher evaluation module (stage 6), the receipts and the articulation (stage 7) grant their own permissions,
// and nothing else.
const test = require('node:test');
const assert = require('node:assert/strict');
const {startApi, PROVISIONAL} = require('../fixtures/api');

const NEW_ROLES = ['COORDENACAO', 'NUCLEO_AVALIACAO', 'CSTI', 'OPERACIONAL'];
// What each new profile holds, exactly. A profile absent from this list holds nothing.
const MODULE_PERMISSIONS = {
  NUCLEO_AVALIACAO: ['osce.manage', 'osce.results'],
  OPERACIONAL: ['osce.respond'],
  COORDENACAO: ['articulation.results', 'teacher_eval.all'],
  CSTI: ['articulation.manage', 'receipts.verify', 'teacher_eval.manage']
};
const PROTECTED = [
  ['GET', '/api/admin/summary'],
  ['GET', '/api/admin/users'],
  ['GET', '/api/admin/roles'],
  ['GET', '/api/admin/audit'],
  ['GET', '/api/admin/assessments'],
  ['GET', '/api/admin/students'],
  ['POST', '/api/admin/users'],
  ['PUT', '/api/admin/controls'],
  ['POST', '/api/admin/student-import/confirm'],
  ['GET', '/api/admin/student-import/x/report'],
  ['GET', '/api/assessments'],
  ['GET', '/api/assessment/1'],
  ['PUT', '/api/assessment/1/scores'],
  ['POST', '/api/assessment/1/publish'],
  ['GET', '/api/assessment/1/stats'],
  ['GET', '/api/assessment/1/export'],
  ['POST', '/api/assessment/1/import/confirm'],
  ['GET', '/api/student/assessments'],
  ['GET', '/api/student/assessment/1'],
  ['GET', '/api/evolution']
];
const versionOf = (api, id) =>
  api.runtime.db.prepare('SELECT session_version FROM users WHERE id=?').get(id).session_version;
const edit = (api, admin, user, changes, expected = 200) =>
  api.call('/api/admin/users/' + user.id, {
    method: 'PUT',
    cookie: admin,
    expected,
    body: {
      name: user.name,
      email: user.email,
      matricula: user.matricula,
      role: user.role,
      active: true,
      expected_version: versionOf(api, user.id),
      confirm_role_change: true,
      ...changes
    }
  });

test('lista de perfis: sete perfis, administrador fora do cadastro comum', async t => {
  const api = await startApi(t);
  const admin = await api.adminSession();
  const roles = (await api.call('/api/admin/roles', {cookie: admin, expected: 200})).data;
  assert.deepEqual(
    roles.map(r => r.id),
    ['ADMIN', 'PROFESSOR', 'ALUNO', ...NEW_ROLES]
  );
  assert.deepEqual(
    roles.filter(r => !r.managed).map(r => r.id),
    ['ADMIN']
  );
  assert.ok(roles.every(r => typeof r.name === 'string' && r.name.length > 0));
});

test('perfis novos entram, trocam a senha e nao acessam nenhuma rota dos perfis originais', async t => {
  const api = await startApi(t);
  const admin = await api.adminSession();
  for (const role of NEW_ROLES) {
    const user = await api.createUser(admin, role, 'NOVO-' + role.slice(0, 4));
    const me = (await api.call('/api/me', {cookie: user.cookie, expected: 200})).data;
    assert.equal(me.role, role);
    assert.ok(me.roleLabel);
    assert.equal(me.studentId, null);
    assert.equal(me.mustChangePassword, false);
    for (const [method, route] of PROTECTED) {
      const denied = await api.call(route, {method, cookie: user.cookie, body: method === 'GET' ? undefined : {}});
      assert.equal(denied.status, 403, `${role} ${method} ${route}`);
      assert.notEqual(denied.data.code, 'PASSWORD_CHANGE_REQUIRED', `${role} ${method} ${route}`);
    }
    const held = api.runtime.db
      .prepare('SELECT permission FROM role_permissions WHERE role=? ORDER BY permission')
      .all(role)
      .map(row => row.permission);
    assert.deepEqual(held, MODULE_PERMISSIONS[role] || [], role);
  }
  assert.equal(api.runtime.db.prepare('SELECT count(*) n FROM users').get().n, 1 + NEW_ROLES.length);
});

test('cadastro nao cria nem promove administrador, e recusa perfil desconhecido', async t => {
  const api = await startApi(t);
  const admin = await api.adminSession();
  const body = role => ({
    role,
    name: 'Pessoa Ficticia',
    email: 'x-' + String(role).toLowerCase() + '@teste.invalid',
    matricula: 'X-' + role,
    password: PROVISIONAL
  });
  for (const role of ['ADMIN', 'ROOT', 'professor', '', null])
    await api.call('/api/admin/users', {method: 'POST', cookie: admin, body: body(role), expected: 400});
  const user = await api.createUser(admin, 'CSTI', 'CSTI-01');
  await edit(api, admin, user, {role: 'ADMIN'}, 400);
  await edit(api, admin, user, {role: 'INEXISTENTE'}, 400);
  assert.equal(api.runtime.db.prepare('SELECT role FROM users WHERE id=?').get(user.id).role, 'CSTI');
  assert.equal(api.runtime.db.prepare("SELECT count(*) n FROM users WHERE role='ADMIN'").get().n, 1);
  // Period belongs to students only.
  await api.call('/api/admin/users', {
    method: 'POST',
    cookie: admin,
    body: {...body('COORDENACAO'), period: '3'},
    expected: 400
  });
});

test('conta com perfil desconhecido no banco nao consegue entrar', async t => {
  const api = await startApi(t);
  const admin = await api.adminSession();
  const user = await api.createUser(admin, 'PROFESSOR', 'DOC-PERFIL-01');
  api.runtime.db.prepare("UPDATE users SET role='PERFIL_ANTIGO' WHERE id=?").run(user.id);
  await api.login(user.matricula, user.password, {expected: 401});
  await api.call('/api/me', {cookie: user.cookie, expected: 401});
});

test('troca de perfil preserva historico e desativa os vinculos do perfil anterior', async t => {
  const api = await startApi(t);
  const admin = await api.adminSession();
  const db = api.runtime.db;
  const post = (route, body) => api.call(route, {method: 'POST', cookie: admin, body, expected: 201});
  const course = (await post('/api/admin/courses', {name: 'Curso Ficticio'})).data.id;
  const discipline = (
    await post('/api/admin/disciplines', {course_id: course, name: 'Disciplina Ficticia', period: '2'})
  ).data.id;
  const teacher = await api.createUser(admin, 'PROFESSOR', 'DOC-TROCA-01');
  const student = await api.createUser(admin, 'ALUNO', 'ALU-TROCA-01', {period: '2'});
  await post('/api/admin/assignments', {
    discipline_id: discipline,
    professor_id: teacher.id,
    year: 2026,
    semester: '2'
  });
  await post('/api/admin/enrollments', {
    discipline_id: discipline,
    student_id: student.studentId,
    year: 2026,
    semester: '2'
  });
  await api.call('/api/assessments', {cookie: teacher.cookie, expected: 200});

  const toCoordination = (await edit(api, admin, teacher, {role: 'COORDENACAO'})).data;
  assert.equal(toCoordination.role_changed, true);
  assert.equal(toCoordination.disabled_assignments, 1);
  await api.call('/api/me', {cookie: teacher.cookie, expected: 401});
  const again = await api.login(teacher.matricula, teacher.password, {expected: 200});
  assert.equal(again.data.user.role, 'COORDENACAO');
  await api.call('/api/assessments', {cookie: again.cookie, expected: 403});
  assert.equal(
    db.prepare('SELECT count(*) n FROM assessments WHERE professor_id=?').get(teacher.id).n,
    3,
    'avaliacoes preservadas'
  );

  const toCsti = (await edit(api, admin, student, {role: 'CSTI'})).data;
  assert.equal(toCsti.disabled_enrollments, 1);
  assert.equal(toCsti.student_id, student.studentId);
  assert.ok(db.prepare('SELECT 1 FROM students WHERE id=?').get(student.studentId), 'cadastro academico preservado');
  const csti = await api.login(student.matricula, student.password, {expected: 200});
  await api.call('/api/student/assessments', {cookie: csti.cookie, expected: 403});

  const back = (await edit(api, admin, {...teacher, role: 'COORDENACAO'}, {role: 'PROFESSOR'})).data;
  assert.equal(back.role, 'PROFESSOR');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('o acesso segue a tabela de permissoes, nao o nome do perfil', async t => {
  const api = await startApi(t);
  const admin = await api.adminSession();
  const db = api.runtime.db;
  const teacher = await api.createUser(admin, 'PROFESSOR', 'DOC-PERM-01');
  const coordinator = await api.createUser(admin, 'COORDENACAO', 'COORD-PERM-01');

  await api.call('/api/assessments', {cookie: teacher.cookie, expected: 200});
  db.prepare("DELETE FROM role_permissions WHERE role='PROFESSOR' AND permission='assessment.own'").run();
  await api.call('/api/assessments', {cookie: teacher.cookie, expected: 403});
  await api.call('/api/evolution', {cookie: teacher.cookie, expected: 200});
  db.prepare("INSERT INTO role_permissions(role,permission) VALUES('PROFESSOR','assessment.own')").run();
  await api.call('/api/assessments', {cookie: teacher.cookie, expected: 200});

  // Granting one permission opens exactly that route family.
  await api.call('/api/evolution', {cookie: coordinator.cookie, expected: 403});
  db.prepare("INSERT INTO role_permissions(role,permission) VALUES('COORDENACAO','evolution.own')").run();
  assert.deepEqual(
    (await api.call('/api/evolution', {cookie: coordinator.cookie, expected: 200})).data.assessments,
    []
  );
  for (const route of ['/api/admin/users', '/api/assessments', '/api/student/assessments'])
    await api.call(route, {cookie: coordinator.cookie, expected: 403});
});

test('permissoes: cada perfil tem exatamente as suas, e nenhuma a mais', async t => {
  const api = await startApi(t);
  const rows = api.runtime.db
    .prepare('SELECT role,permission FROM role_permissions ORDER BY role,permission')
    .all()
    .map(r => r.role + ':' + r.permission);
  assert.deepEqual(rows, [
    'ADMIN:admin.manage',
    'ADMIN:evolution.all',
    'ADMIN:receipts.verify',
    'ALUNO:articulation.answer',
    'ALUNO:receipts.own',
    'ALUNO:results.own',
    'ALUNO:teacher_eval.answer',
    'COORDENACAO:articulation.results',
    'COORDENACAO:teacher_eval.all',
    'CSTI:articulation.manage',
    'CSTI:receipts.verify',
    'CSTI:teacher_eval.manage',
    'NUCLEO_AVALIACAO:osce.manage',
    'NUCLEO_AVALIACAO:osce.results',
    'OPERACIONAL:osce.respond',
    'PROFESSOR:articulation.own',
    'PROFESSOR:assessment.own',
    'PROFESSOR:evolution.own',
    'PROFESSOR:teacher_eval.own'
  ]);
});
