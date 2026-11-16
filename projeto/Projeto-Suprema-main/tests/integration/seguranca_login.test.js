'use strict';
// Login limiter per real client, own-password change and first-access flow.
// Every test uses a disposable database and synthetic accounts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {once} = require('node:events');
const {createApplication} = require('../../apps/api/src/app');
const {createWebServer} = require('../../apps/web/server');
const {configureAdmin} = require('../../scripts/admin');
const {clientAddress, parseTrustedProxies} = require('../../packages/http/client-address');

const ADMIN = {email: 'admin@teste.invalid', password: 'Admin-Teste-123!'};
const PROVISIONAL = 'Provisoria-123!';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}
function closing(server) {
  return new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  });
}
// API alone, or API behind the web proxy when `web` is given.
async function fixture(t, {api = {}, web} = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'suprema-seguranca-'));
  const runtime = createApplication({dataDir: temp, onModuleError: () => {}, ...api});
  const apiServer = http.createServer(runtime.app);
  const apiBase = await listen(apiServer);
  let webServer,
    base = apiBase;
  if (web) {
    webServer = createWebServer({apiUrl: apiBase, ...web});
    base = await listen(webServer);
  }
  t.after(async () => {
    if (webServer) await closing(webServer);
    await closing(apiServer);
    runtime.close();
    fs.rmSync(temp, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  });
  configureAdmin(runtime.db, {name: 'Administrador Ficticio', ...ADMIN});
  async function call(route, {method = 'GET', body, cookie, headers = {}, expected} = {}) {
    const response = await fetch(base + route, {
      method,
      headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(cookie ? {cookie} : {}), ...headers},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (expected !== undefined) assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`);
    return {
      status: response.status,
      data,
      cookie: response.headers.get('set-cookie')?.split(';')[0],
      retryAfter: response.headers.get('retry-after')
    };
  }
  const login = (name, password, options = {}) =>
    call('/api/login', {method: 'POST', body: {login: name, password}, ...options});
  async function createUser(adminCookie, role, id) {
    const body = {
      role,
      name: 'Pessoa Ficticia ' + id,
      email: id.toLowerCase() + '@teste.invalid',
      matricula: id,
      password: PROVISIONAL
    };
    const created = await call('/api/admin/users', {method: 'POST', cookie: adminCookie, body, expected: 201});
    return {...body, id: created.data.id};
  }
  return {runtime, call, login, createUser};
}
const from = address => ({headers: {'X-Forwarded-For': address}});

test('endereco do cliente: cabecalho so vale quando vem de proxy confiavel', () => {
  const req = (peer, forwarded) => ({
    socket: {remoteAddress: peer},
    headers: forwarded === undefined ? {} : {'x-forwarded-for': forwarded}
  });
  const loopback = parseTrustedProxies(undefined, 'loopback'),
    none = parseTrustedProxies('', 'loopback'),
    listed = parseTrustedProxies('10.0.0.5, loopback');
  assert.equal(clientAddress(req('127.0.0.1', '203.0.113.7'), loopback), '203.0.113.7');
  assert.equal(clientAddress(req('::ffff:127.0.0.1', '203.0.113.7'), loopback), '203.0.113.7');
  assert.equal(clientAddress(req('::1', '2001:db8::9'), loopback), '2001:db8::9');
  // The right-most entry is the one written by the trusted proxy; earlier ones are client-controlled.
  assert.equal(clientAddress(req('127.0.0.1', '198.51.100.1, 203.0.113.7'), loopback), '203.0.113.7');
  assert.equal(clientAddress(req('198.51.100.20', '203.0.113.7'), loopback), '198.51.100.20');
  assert.equal(clientAddress(req('127.0.0.1', '203.0.113.7'), none), '127.0.0.1');
  assert.equal(clientAddress(req('10.0.0.5', '203.0.113.7'), listed), '203.0.113.7');
  assert.equal(clientAddress(req('10.0.0.6', '203.0.113.7'), listed), '10.0.0.6');
  assert.equal(clientAddress(req('127.0.0.1', 'nao-e-um-endereco'), loopback), '127.0.0.1');
  assert.equal(clientAddress(req('127.0.0.1'), loopback), '127.0.0.1');
  assert.throws(() => parseTrustedProxies('exemplo.invalid'), /Proxy confiavel invalido/);
});

test('pelo proxy: bloqueio de um cliente nao impede outro cliente de entrar na mesma conta', async t => {
  // The web server trusts loopback here so the test can play the role of an external HTTPS proxy.
  const {login} = await fixture(t, {web: {trustedProxies: 'loopback'}});
  for (let i = 0; i < 6; i++) await login(ADMIN.email, 'senha-incorreta', {...from('203.0.113.10'), expected: 401});
  const blocked = await login(ADMIN.email, ADMIN.password, {...from('203.0.113.10'), expected: 429});
  assert.ok(Number(blocked.retryAfter) > 0);
  const other = await login(ADMIN.email, ADMIN.password, {...from('203.0.113.11'), expected: 200});
  assert.equal(other.data.user.role, 'ADMIN');
});

test('pelo proxy: muitos erros de um cliente nao bloqueiam o login dos demais', async t => {
  const {login} = await fixture(t, {web: {trustedProxies: 'loopback'}});
  for (let i = 0; i < 80; i++)
    await login('inexistente-' + i + '@teste.invalid', 'senha-incorreta', {...from('203.0.113.20'), expected: 401});
  await login(ADMIN.email, ADMIN.password, {...from('203.0.113.20'), expected: 429});
  await login(ADMIN.email, ADMIN.password, {...from('203.0.113.21'), expected: 200});
});

test('pelo proxy padrao: X-Forwarded-For enviado pelo navegador nao burla o limite', async t => {
  const {login} = await fixture(t, {web: {}});
  for (let i = 0; i < 6; i++)
    await login(ADMIN.email, 'senha-incorreta', {...from('198.51.100.' + (i + 1)), expected: 401});
  await login(ADMIN.email, ADMIN.password, {...from('198.51.100.99'), expected: 429});
});

test('API sem proxy confiavel ignora X-Forwarded-For', async t => {
  const {login} = await fixture(t, {api: {trustedProxies: ''}});
  for (let i = 0; i < 6; i++)
    await login(ADMIN.email, 'senha-incorreta', {...from('198.51.100.' + (i + 1)), expected: 401});
  await login(ADMIN.email, ADMIN.password, {...from('198.51.100.99'), expected: 429});
});

test('login desconhecido e senha errada recebem a mesma resposta', async t => {
  const {login} = await fixture(t);
  const unknown = await login('ninguem@teste.invalid', 'senha-incorreta', {expected: 401});
  const wrong = await login(ADMIN.email, 'senha-incorreta', {expected: 401});
  assert.deepEqual(unknown.data, wrong.data);
});

test('primeiro acesso: conta criada pelo administrador so funciona depois de trocar a senha', async t => {
  const {call, login, createUser, runtime} = await fixture(t);
  const admin = await login(ADMIN.email, ADMIN.password, {expected: 200});
  assert.equal(admin.data.user.mustChangePassword, false);
  await call('/api/admin/users', {cookie: admin.cookie, expected: 200});
  const teacher = await createUser(admin.cookie, 'PROFESSOR', 'DOC-SEG-01');
  assert.equal(
    (await call('/api/admin/users', {cookie: admin.cookie})).data.find(u => u.id === teacher.id).must_change_password,
    1
  );

  const first = await login(teacher.email, PROVISIONAL, {expected: 200});
  assert.equal(first.data.user.mustChangePassword, true);
  assert.equal((await call('/api/me', {cookie: first.cookie, expected: 200})).data.mustChangePassword, true);
  for (const route of ['/api/assessments', '/api/evolution', '/api/assessment/1', '/api/assessment/1/export']) {
    const denied = await call(route, {cookie: first.cookie, expected: 403});
    assert.equal(denied.data.code, 'PASSWORD_CHANGE_REQUIRED', route);
  }
  const change = body => call('/api/me/password', {method: 'POST', cookie: first.cookie, body});
  assert.equal((await change({current_password: 'senha-incorreta', new_password: 'Nova-Senha-456!'})).status, 400);
  assert.equal((await change({current_password: PROVISIONAL, new_password: PROVISIONAL})).status, 400);
  assert.equal((await change({current_password: PROVISIONAL, new_password: 'curta'})).status, 400);
  assert.equal((await change({current_password: PROVISIONAL})).status, 400);
  assert.equal(
    runtime.db.prepare('SELECT must_change_password FROM users WHERE id=?').get(teacher.id).must_change_password,
    1
  );

  const done = await change({current_password: PROVISIONAL, new_password: 'Nova-Senha-456!'});
  assert.equal(done.status, 200);
  assert.equal(done.data.user.mustChangePassword, false);
  await call('/api/assessments', {cookie: first.cookie, expected: 200});
  await login(teacher.email, PROVISIONAL, {expected: 401});
  assert.equal((await login(teacher.email, 'Nova-Senha-456!', {expected: 200})).data.user.mustChangePassword, false);
  const logs = JSON.stringify(runtime.db.prepare('SELECT action,details FROM audit_logs').all());
  assert.match(logs, /ALTERAR_PROPRIA_SENHA/);
  for (const secret of [PROVISIONAL, 'Nova-Senha-456!']) assert.ok(!logs.includes(secret));
});

test('trocar a senha encerra as outras sessoes da conta e mantem a atual', async t => {
  const {call, login} = await fixture(t);
  const here = await login(ADMIN.email, ADMIN.password, {expected: 200});
  const elsewhere = await login(ADMIN.email, ADMIN.password, {expected: 200});
  await call('/api/me/password', {
    method: 'POST',
    cookie: here.cookie,
    body: {current_password: ADMIN.password, new_password: 'Admin-Nova-789!'},
    expected: 200
  });
  await call('/api/me', {cookie: here.cookie, expected: 200});
  await call('/api/admin/users', {cookie: here.cookie, expected: 200});
  await call('/api/me', {cookie: elsewhere.cookie, expected: 401});
  await call('/api/me/password', {
    method: 'POST',
    body: {current_password: 'Admin-Nova-789!', new_password: 'Outra-Senha-000!'},
    expected: 401
  });
});

test('tentativas com a senha atual errada sao limitadas', async t => {
  const {call, login} = await fixture(t);
  const session = await login(ADMIN.email, ADMIN.password, {expected: 200});
  const attempt = current =>
    call('/api/me/password', {
      method: 'POST',
      cookie: session.cookie,
      body: {current_password: current, new_password: 'Admin-Nova-789!'}
    });
  for (let i = 0; i < 6; i++) assert.equal((await attempt('senha-incorreta')).status, 400);
  assert.equal((await attempt(ADMIN.password)).status, 429);
  await login(ADMIN.email, ADMIN.password, {expected: 200});
});

test('redefinicao pelo administrador volta a exigir troca; a propria nao exige', async t => {
  const {call, login, createUser, runtime} = await fixture(t);
  const admin = await login(ADMIN.email, ADMIN.password, {expected: 200});
  const student = await createUser(admin.cookie, 'ALUNO', 'ALU-SEG-01');
  const first = await login(student.matricula, PROVISIONAL, {expected: 200});
  await call('/api/me/password', {
    method: 'POST',
    cookie: first.cookie,
    body: {current_password: PROVISIONAL, new_password: 'Senha-Do-Aluno-1!'},
    expected: 200
  });
  await call('/api/student/assessments', {cookie: first.cookie, expected: 200});

  const reset = await call('/api/admin/users/' + student.id + '/password', {
    method: 'POST',
    cookie: admin.cookie,
    body: {password: 'Redefinida-222!'},
    expected: 200
  });
  assert.equal(reset.data.must_change_password, true);
  await call('/api/me', {cookie: first.cookie, expected: 401});
  const again = await login(student.matricula, 'Redefinida-222!', {expected: 200});
  assert.equal(again.data.user.mustChangePassword, true);
  assert.equal(
    (await call('/api/student/assessments', {cookie: again.cookie, expected: 403})).data.code,
    'PASSWORD_CHANGE_REQUIRED'
  );

  const adminId = admin.data.user.id;
  const own = await call('/api/admin/users/' + adminId + '/password', {
    method: 'POST',
    cookie: admin.cookie,
    body: {password: 'Admin-Propria-333!'},
    expected: 200
  });
  assert.equal(own.data.must_change_password, false);
  assert.equal(
    runtime.db.prepare('SELECT must_change_password FROM users WHERE id=?').get(adminId).must_change_password,
    0
  );
  assert.equal((await login(ADMIN.email, 'Admin-Propria-333!', {expected: 200})).data.user.mustChangePassword, false);
});
