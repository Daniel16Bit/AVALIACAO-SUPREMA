'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const {spawn} = require('node:child_process');
const {createApplication} = require('../../apps/api/src/app');
const manifest = require('../../apps/api/src/modules');
const {createWebServer} = require('../../apps/web/server');
const {configureAdmin} = require('../../scripts/admin');
const ROOT = path.resolve(__dirname, '../..');

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}
function cleanupServer(t, server) {
  t.after(
    () =>
      new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
      })
  );
}
async function apiFixture(t, modules) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'suprema-isolation-'));
  const runtime = createApplication({dataDir: temp, modules, onModuleError: () => {}});
  const server = require('node:http').createServer(runtime.app);
  const base = await listen(server);
  t.after(async () => {
    await new Promise(r => {
      server.close(r);
      server.closeAllConnections();
    });
    runtime.close();
    fs.rmSync(temp, {recursive: true, force: true});
  });
  return {runtime, base, temp};
}

test('syntax error in one module leaves login and other feature routes active', async t => {
  const brokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suprema-broken-'));
  const broken = path.join(brokenDir, 'routes.js');
  fs.writeFileSync(broken, 'module.exports = {');
  t.after(() => fs.rmSync(brokenDir, {recursive: true, force: true}));
  const modules = manifest.map(m => (m.id === 'evolucao' ? {...m, load: () => require(broken)} : m));
  const {runtime, base} = await apiFixture(t, modules);
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.status, 'degraded');
  assert.equal(health.modules.find(m => m.id === 'evolucao').status, 'unavailable');
  assert.equal((await fetch(base + '/api/ready')).status, 503);
  assert.equal((await fetch(base + '/api/evolution')).status, 503);
  assert.equal((await fetch(base + '/api/admin/users')).status, 401);
  assert.equal((await fetch(base + '/api/student/assessments')).status, 401);
  configureAdmin(runtime.db, {name: 'Teste', email: 'isolamento@teste.invalid', password: 'Senha-Isolada-123!'});
  const login = await fetch(base + '/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({login: 'isolamento@teste.invalid', password: 'Senha-Isolada-123!'})
  });
  assert.equal(login.status, 200);
  const users = await fetch(base + '/api/admin/users', {
    headers: {cookie: login.headers.get('set-cookie').split(';')[0]}
  });
  assert.equal(users.status, 200);
  assert.equal(
    (await fetch(base + '/api/admin/health', {headers: {cookie: login.headers.get('set-cookie').split(';')[0]}}))
      .status,
    200
  );
});

test('partial registration is discarded and runtime errors stay within the request', async t => {
  const partial = {
    id: 'partial',
    owns: /^\/api\/partial/,
    load:
      () =>
      ({app}) => {
        app.get('/api/partial', (req, res) => res.json({leaked: true}));
        throw Error('Registration failed');
      }
  };
  const throws = {
    id: 'throwing',
    owns: /^\/api\/throw/,
    load:
      () =>
      ({app}) =>
        app.get('/api/throw', () => {
          throw Error('Request failed');
        })
  };
  const {base} = await apiFixture(t, [partial, throws, ...manifest]);
  assert.equal((await fetch(base + '/api/partial')).status, 503);
  assert.equal((await fetch(base + '/api/throw')).status, 500);
  assert.equal((await fetch(base + '/api/student/assessments')).status, 401);
  assert.equal((await fetch(base + '/api/health')).status, 200);
});

test('a failed specific module does not block the parent feature', async t => {
  const modules = manifest.map(m =>
    m.id === 'planilhas' || m.id === 'importacao-alunos'
      ? {
          ...m,
          load: () => {
            throw Error('Dependency missing');
          }
        }
      : m
  );
  const {base} = await apiFixture(t, modules);
  assert.equal((await fetch(base + '/api/assessment/1/export')).status, 503);
  assert.equal((await fetch(base + '/api/assessment/1')).status, 401);
  assert.equal((await fetch(base + '/api/admin/student-import/1/report')).status, 503);
  assert.equal((await fetch(base + '/api/admin/users')).status, 401);
});

test('API starts without any frontend files', async t => {
  const {base} = await apiFixture(t);
  assert.equal((await fetch(base + '/api/ready')).status, 200);
  assert.equal((await fetch(base + '/')).status, 404);
});

test('web remains available when API is down; static files cannot expose data', async t => {
  // Reserve then close a local port to obtain an unreachable API endpoint.
  const reserve = require('node:net').createServer();
  await listen(reserve);
  const port = reserve.address().port;
  await new Promise(r => reserve.close(r));
  const web = createWebServer({apiUrl: 'http://127.0.0.1:' + port, proxyTimeout: 300});
  cleanupServer(t, web);
  const base = await listen(web);
  assert.equal((await fetch(base + '/health')).status, 200);
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await page.text(), /Avaliação Suprema/);
  const unavailable = await fetch(base + '/api/health');
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, 'API_UNAVAILABLE');
  for (const url of ['/data/avaliacao_suprema.db', '/.env', '/%2e%2e%2fpackage.json', '/%ZZ', '/server.js']) {
    assert.ok([400, 404].includes((await fetch(base + url)).status), url);
  }
  assert.equal((await fetch(base + '/features/avaliacoes/app.js')).status, 200);
});

test('proxy preserves sessions, multipart uploads, security headers and origin validation', async t => {
  const {runtime, base: api} = await apiFixture(t);
  configureAdmin(runtime.db, {name: 'Proxy', email: 'proxy@teste.invalid', password: 'Senha-Proxy-123!'});
  const web = createWebServer({apiUrl: api});
  cleanupServer(t, web);
  const base = await listen(web);
  const login = await fetch(base + '/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Origin: base},
    body: JSON.stringify({login: 'proxy@teste.invalid', password: 'Senha-Proxy-123!'})
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const users = await fetch(base + '/api/admin/users', {headers: {cookie}});
  assert.equal(users.status, 200);
  assert.equal((await users.json()).length, 1);
  const denied = await fetch(base + '/api/admin/courses', {
    method: 'POST',
    headers: {cookie, Origin: 'http://other.invalid', 'Content-Type': 'application/json'},
    body: JSON.stringify({name: 'Denied'})
  });
  assert.equal(denied.status, 403);
  assert.equal(runtime.db.prepare('SELECT count(*) n FROM academic_courses').get().n, 0);
  const body = new FormData();
  body.append('file', new Blob(['test']), 'test.xlsx');
  // Auth must be enforced before workbook validation, even through streaming proxy.
  assert.equal((await fetch(base + '/api/assessment/1/import', {method: 'POST', body})).status, 401);
});

async function childService(t, entry, env, marker) {
  const child = spawn(process.execPath, [entry], {
    cwd: ROOT,
    env: {...process.env, ...env},
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(Error('Service startup timeout: ' + output)), 10000);
    child.stdout.on('data', bytes => {
      output += bytes;
      const match = output.match(new RegExp('\\[' + marker + '\\] (http://[^\\s]+)'));
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.stderr.on('data', bytes => {
      output += bytes;
    });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(Error('Startup exited ' + code + ': ' + output));
    });
  });
  return {child, base};
}

test('terminating either real process leaves the other process running; reconnection works', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'suprema-process-'));
  const services = [];
  // Hooks run in registration order. Windows refuses to delete the data folder
  // while a child still has the database open, so stop every child first.
  t.after(async () => {
    for (const {child} of services) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await once(child, 'exit');
      }
    }
    fs.rmSync(temp, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  });
  const api = await childService(t, 'apps/api/server.js', {API_PORT: '0', SUPREMA_DATA_DIR: temp}, 'api');
  services.push(api);
  const web = await childService(t, 'apps/web/server.js', {PORT: '0', API_URL: api.base}, 'web');
  services.push(web);
  assert.equal((await fetch(web.base + '/api/health')).status, 200);
  api.child.kill('SIGTERM');
  await once(api.child, 'exit');
  assert.equal((await fetch(web.base + '/')).status, 200);
  assert.equal((await fetch(web.base + '/api/health')).status, 503);
  const recovered = await childService(
    t,
    'apps/api/server.js',
    {API_PORT: new URL(api.base).port, SUPREMA_DATA_DIR: temp},
    'api'
  );
  services.push(recovered);
  assert.equal((await fetch(web.base + '/api/health')).status, 200);
  web.child.kill('SIGTERM');
  await once(web.child, 'exit');
  assert.equal((await fetch(recovered.base + '/api/ready')).status, 200);
});
