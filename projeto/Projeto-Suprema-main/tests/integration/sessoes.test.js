'use strict';
// Sessions stored in the database: survive restarts, never keep the raw token, end when they should.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {startApi, tempDir, ADMIN} = require('../fixtures/api');

const tokenOf = cookie => cookie.split('=')[1];
const sessionRows = runtime => runtime.db.prepare('SELECT * FROM sessions').all();

test('sessao continua valida depois de reiniciar a API', async t => {
  const dataDir = tempDir(t);
  let api = await startApi(t, {dataDir});
  const cookie = await api.adminSession();
  await api.call('/api/admin/users', {cookie, expected: 200});
  await api.stop();

  api = await startApi(t, {dataDir});
  assert.equal((await api.call('/api/me', {cookie, expected: 200})).data.role, 'ADMIN');
  await api.call('/api/admin/users', {cookie, expected: 200});
});

test('o banco guarda apenas o hash do token da sessao', async t => {
  const api = await startApi(t);
  const cookie = await api.adminSession(),
    token = tokenOf(cookie);
  const rows = sessionRows(api.runtime);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(rows).includes(token));
  assert.ok(rows[0].expires_at > Date.now() && rows[0].expires_at <= Date.now() + 8 * 60 * 60 * 1000);
});

test('sair remove a sessao; o cookie antigo deixa de valer, inclusive apos reinicio', async t => {
  const dataDir = tempDir(t);
  let api = await startApi(t, {dataDir});
  const cookie = await api.adminSession();
  await api.call('/api/logout', {method: 'POST', cookie, expected: 200});
  assert.equal(sessionRows(api.runtime).length, 0);
  await api.call('/api/me', {cookie, expected: 401});
  await api.stop();
  api = await startApi(t, {dataDir});
  await api.call('/api/me', {cookie, expected: 401});
});

test('sessao vencida e recusada e apagada', async t => {
  const api = await startApi(t);
  const cookie = await api.adminSession();
  api.runtime.db.prepare('UPDATE sessions SET expires_at=?').run(Date.now() - 1000);
  await api.call('/api/me', {cookie, expected: 401});
  assert.equal(sessionRows(api.runtime).length, 0);
});

test('token desconhecido ou adulterado nao autentica', async t => {
  const api = await startApi(t);
  const cookie = await api.adminSession();
  await api.call('/api/me', {cookie: 'as_session=' + 'a'.repeat(64), expected: 401});
  await api.call('/api/me', {cookie: cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0'), expected: 401});
  // The stored hash itself is not a usable token.
  await api.call('/api/me', {cookie: 'as_session=' + sessionRows(api.runtime)[0].token_hash, expected: 401});
  await api.call('/api/me', {cookie, expected: 200});
});

test('novo login substitui a sessao anterior do mesmo navegador', async t => {
  const api = await startApi(t);
  const first = await api.adminSession();
  const second = (await api.login(ADMIN.email, ADMIN.password, {cookie: first, expected: 200})).cookie;
  await api.call('/api/me', {cookie: first, expected: 401});
  await api.call('/api/me', {cookie: second, expected: 200});
  assert.equal(sessionRows(api.runtime).length, 1);
});

test('desativar, redefinir senha ou excluir a conta encerra as sessoes dela', async t => {
  const api = await startApi(t);
  const admin = await api.adminSession();
  const count = id => api.runtime.db.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').get(id).n;

  const teacher = await api.createUser(admin, 'PROFESSOR', 'DOC-SES-01');
  await api.call('/api/assessments', {cookie: teacher.cookie, expected: 200});
  const version = api.runtime.db
    .prepare('SELECT session_version FROM users WHERE id=?')
    .get(teacher.id).session_version;
  await api.call('/api/admin/users/' + teacher.id, {
    method: 'PUT',
    cookie: admin,
    expected: 200,
    body: {
      name: teacher.name,
      email: teacher.email,
      matricula: teacher.matricula,
      role: 'PROFESSOR',
      active: false,
      expected_version: version
    }
  });
  await api.call('/api/me', {cookie: teacher.cookie, expected: 401});
  assert.equal(count(teacher.id), 0);

  const student = await api.createUser(admin, 'ALUNO', 'ALU-SES-01');
  await api.call('/api/admin/users/' + student.id + '/password', {
    method: 'POST',
    cookie: admin,
    body: {password: 'Redefinida-222!'},
    expected: 200
  });
  await api.call('/api/me', {cookie: student.cookie, expected: 401});
  assert.equal(count(student.id), 0);

  // Deleting an account with a live session must not trip the foreign key to users.
  const other = await api.createUser(admin, 'ALUNO', 'ALU-SES-02');
  assert.equal(count(other.id), 1);
  const current = api.runtime.db.prepare('SELECT session_version FROM users WHERE id=?').get(other.id).session_version;
  await api.call('/api/admin/users/' + other.id, {
    method: 'DELETE',
    cookie: admin,
    expected: 200,
    body: {expected_version: current, confirmation_email: other.email}
  });
  assert.equal(count(other.id), 0);
  await api.call('/api/me', {cookie: other.cookie, expected: 401});
  assert.equal(api.runtime.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  await api.call('/api/me', {cookie: admin, expected: 200});
});
