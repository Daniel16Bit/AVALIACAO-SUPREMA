'use strict';
// Shared harness for node:test suites: a real API on a disposable database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {once} = require('node:events');
const {createApplication} = require('../../apps/api/src/app');
const {configureAdmin} = require('../../scripts/admin');

const ADMIN = {email: 'admin@teste.invalid', password: 'Admin-Teste-123!'};
const PROVISIONAL = 'Provisoria-123!';

// One cleanup hook per test: stop every API first, then delete folders. Hooks run in
// registration order and Windows cannot delete a folder whose database is still open.
const cleanups = new WeakMap();
function cleanupOf(t) {
  let entry = cleanups.get(t);
  if (!entry) {
    entry = {stops: [], dirs: []};
    cleanups.set(t, entry);
    t.after(async () => {
      for (const stop of entry.stops) await stop();
      for (const dir of entry.dirs) fs.rmSync(dir, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
    });
  }
  return entry;
}

function tempDir(t, prefix = 'suprema-teste-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanupOf(t).dirs.push(dir);
  return dir;
}

// Starts the API on `dataDir`. Call `stop()` then `startApi` again to simulate a restart.
async function startApi(t, {dataDir = tempDir(t), admin = true, options = {}} = {}) {
  const runtime = createApplication({dataDir, onModuleError: () => {}, ...options});
  const server = http.createServer(runtime.app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
    runtime.close();
  }
  cleanupOf(t).stops.push(stop);
  if (admin && !runtime.db.prepare("SELECT 1 FROM users WHERE role='ADMIN'").get())
    configureAdmin(runtime.db, {name: 'Administrador Ficticio', ...ADMIN});

  async function call(route, {method = 'GET', body, cookie, headers = {}, expected} = {}) {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
        ...(cookie ? {cookie} : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (expected !== undefined) assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`);
    return {status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0]};
  }
  const login = (name, password, extra = {}) =>
    call('/api/login', {method: 'POST', body: {login: name, password}, ...extra});
  const adminSession = async () => (await login(ADMIN.email, ADMIN.password, {expected: 200})).cookie;

  // Creates an account through the API and completes the first-access password change,
  // returning a ready session. `password` is the account's own password afterwards.
  async function createUser(adminCookie, role, id, extra = {}) {
    const body = {
      role,
      name: 'Pessoa Ficticia ' + id,
      email: id.toLowerCase() + '@teste.invalid',
      matricula: id,
      password: PROVISIONAL,
      ...extra
    };
    const created = await call('/api/admin/users', {method: 'POST', cookie: adminCookie, body, expected: 201});
    const password = 'Propria-' + id + '-9!';
    const first = await login(body.matricula, PROVISIONAL, {expected: 200});
    await call('/api/me/password', {
      method: 'POST',
      cookie: first.cookie,
      body: {current_password: PROVISIONAL, new_password: password},
      expected: 200
    });
    return {...body, id: created.data.id, studentId: created.data.student_id, password, cookie: first.cookie};
  }
  return {runtime, base, dataDir, call, login, adminSession, createUser, stop};
}

module.exports = {startApi, tempDir, ADMIN, PROVISIONAL};
