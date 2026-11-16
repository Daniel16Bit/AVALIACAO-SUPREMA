'use strict';
// HTTPS policy (S5): refusal to start exposed without HTTPS, HSTS and the Secure cookie.
// Real processes on loopback, disposable database, synthetic account, throwaway certificate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {ADMIN} = require('../fixtures/api');
const {writeCertificate} = require('../fixtures/tls');
const {parseTrustedProxies} = require('../../packages/http/client-address');
const {HSTS, isLocalHost, webTransport, apiTransport} = require('../../packages/http/transport-policy');

const ROOT = path.resolve(__dirname, '../..');
const LOOPBACK = parseTrustedProxies('loopback');
const NONE = parseTrustedProxies('');

// Children must not inherit the developer's own configuration.
function cleanEnv(extra) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^(SUPREMA_|API_|HOST$|PORT$)/i.test(key)) env[key] = value;
  }
  return {...env, ...extra};
}

// One cleanup per test, children first: Windows cannot delete a folder whose database is open.
const scopes = new WeakMap();
function scope(t) {
  let entry = scopes.get(t);
  if (!entry) {
    entry = {children: [], dirs: []};
    scopes.set(t, entry);
    t.after(async () => {
      for (const child of entry.children) {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGTERM');
          await once(child, 'exit');
        }
      }
      for (const dir of entry.dirs) fs.rmSync(dir, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
    });
  }
  return entry;
}
function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suprema-teste-'));
  scope(t).dirs.push(dir);
  return dir;
}

// Starts a service and resolves with its address, or with the exit code when it refuses to start.
async function launch(t, entry, env, marker) {
  const child = spawn(process.execPath, [entry], {cwd: ROOT, env: cleanEnv(env), stdio: ['ignore', 'pipe', 'pipe']});
  scope(t).children.push(child);
  let output = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Tempo esgotado ao iniciar: ' + output)), 15000);
    const read = bytes => {
      output += bytes;
      const match = output.match(new RegExp('\\[' + marker + '\\] (https?://[^\\s]+)'));
      if (match) {
        clearTimeout(timer);
        resolve({child, base: match[1], output: () => output});
      }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.once('exit', code => {
      clearTimeout(timer);
      resolve({child, code, output: () => output});
    });
  });
}

function httpsCall(base, route, {ca, method = 'GET', body} = {}) {
  const payload = body ? JSON.stringify(body) : null;
  const url = new URL(route, base);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: '127.0.0.1',
        port: url.port,
        path: url.pathname,
        method,
        ca,
        servername: 'localhost',
        headers: payload ? {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload)} : {}
      },
      res => {
        res.resume();
        res.on('end', () => resolve({status: res.statusCode, headers: res.headers}));
      }
    );
    req.on('error', reject);
    req.end(payload);
  });
}

function adminDatabase(dataDir) {
  const {openDatabase} = require('../../apps/api/src/core/database');
  const {configureAdmin} = require('../../scripts/admin');
  const storage = openDatabase(dataDir);
  try {
    configureAdmin(storage.db, {name: 'Administrador Ficticio', ...ADMIN});
  } finally {
    storage.db.close();
  }
}

test('endereco local: so o que nunca sai desta maquina', () => {
  for (const host of ['127.0.0.1', '127.8.9.1', '::1', '[::1]', 'localhost', 'LOCALHOST', '::ffff:127.0.0.1'])
    assert.equal(isLocalHost(host), true, host);
  for (const host of ['0.0.0.0', '::', '192.168.0.10', '10.0.0.5', 'suprema.example', '127.example.com', '', undefined])
    assert.equal(isLocalHost(host), false, String(host));
});

test('politica da interface: exposta so com TLS ou proxy HTTPS declarado e listado', () => {
  assert.deepEqual(webTransport({host: '127.0.0.1', trustedProxies: NONE}), {https: false});
  assert.throws(() => webTransport({host: '0.0.0.0', trustedProxies: NONE}), /sem HTTPS/);
  assert.throws(() => webTransport({host: '192.168.0.10', trustedProxies: LOOPBACK}), /sem HTTPS/);
  assert.deepEqual(webTransport({host: '0.0.0.0', tls: true, trustedProxies: NONE}), {https: true});
  assert.deepEqual(
    webTransport({host: '0.0.0.0', behindHttpsProxy: true, trustedProxies: parseTrustedProxies('10.0.0.2')}),
    {https: true}
  );
  assert.deepEqual(webTransport({host: '127.0.0.1', behindHttpsProxy: true, trustedProxies: LOOPBACK}), {https: true});
  // Declaring the proxy without listing it would merge every user into one login limit.
  assert.throws(
    () => webTransport({host: '127.0.0.1', behindHttpsProxy: true, trustedProxies: NONE}),
    /SUPREMA_WEB_TRUSTED_PROXIES/
  );
  assert.throws(
    () => webTransport({host: '0.0.0.0', tls: true, behindHttpsProxy: true, trustedProxies: NONE}),
    /SUPREMA_WEB_TRUSTED_PROXIES/
  );
});

test('politica da API: fora desta maquina so com declaracao de rede protegida', () => {
  assert.deepEqual(apiTransport({host: '127.0.0.1'}), {exposed: false});
  assert.throws(() => apiTransport({host: '0.0.0.0'}), /SUPREMA_API_PRIVATE_NETWORK/);
  assert.deepEqual(apiTransport({host: '10.0.0.3', privateNetwork: true}), {exposed: true});
});

test('interface recusa iniciar exposta na rede sem HTTPS', async t => {
  const refused = await launch(t, 'apps/web/server.js', {HOST: '0.0.0.0', PORT: '0'}, 'web');
  assert.equal(refused.code, 1, refused.output());
  assert.match(refused.output(), /expoe a interface na rede sem HTTPS/);
  assert.doesNotMatch(refused.output(), /\[web\] https?:\/\//);
});

test('interface recusa proxy HTTPS declarado sem a lista de proxies confiaveis', async t => {
  const refused = await launch(
    t,
    'apps/web/server.js',
    {HOST: '0.0.0.0', PORT: '0', SUPREMA_BEHIND_HTTPS_PROXY: '1'},
    'web'
  );
  assert.equal(refused.code, 1, refused.output());
  assert.match(refused.output(), /SUPREMA_WEB_TRUSTED_PROXIES/);
});

test('API recusa iniciar exposta na rede e nao abre o banco', async t => {
  const dataDir = tempDir(t);
  const refused = await launch(
    t,
    'apps/api/server.js',
    {API_HOST: '0.0.0.0', API_PORT: '0', SUPREMA_DATA_DIR: dataDir},
    'api'
  );
  assert.equal(refused.code, 1, refused.output());
  assert.match(refused.output(), /expoe a API na rede/);
  assert.deepEqual(fs.readdirSync(dataDir), []);
});

test('sem HTTPS em endereco local: inicia como antes e nao envia HSTS', async t => {
  const web = await launch(t, 'apps/web/server.js', {PORT: '0'}, 'web');
  assert.match(web.base || '', /^http:\/\/127\.0\.0\.1:/, web.output());
  const response = await fetch(web.base + '/');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('strict-transport-security'), null);
});

test('proxy HTTPS declarado: HSTS nas paginas e cookie Secure no login', async t => {
  const dataDir = tempDir(t);
  adminDatabase(dataDir);
  const proxied = {SUPREMA_BEHIND_HTTPS_PROXY: '1', SUPREMA_WEB_TRUSTED_PROXIES: 'loopback'};
  const api = await launch(t, 'apps/api/server.js', {API_PORT: '0', SUPREMA_DATA_DIR: dataDir, ...proxied}, 'api');
  assert.ok(api.base, api.output());
  const web = await launch(t, 'apps/web/server.js', {PORT: '0', API_URL: api.base, ...proxied}, 'web');
  assert.ok(web.base, web.output());
  assert.equal((await fetch(web.base + '/')).headers.get('strict-transport-security'), HSTS);
  const login = await fetch(web.base + '/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({login: ADMIN.email, password: ADMIN.password})
  });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('strict-transport-security'), HSTS);
  assert.match(login.headers.get('set-cookie'), /;\s*Secure/i);
});

test('TLS na interface: HTTPS de ponta a ponta, HSTS e cookie Secure', async t => {
  const dataDir = tempDir(t);
  adminDatabase(dataDir);
  const certificate = writeCertificate(tempDir(t));
  const tls = {SUPREMA_TLS_KEY: certificate.key, SUPREMA_TLS_CERT: certificate.cert};
  const api = await launch(t, 'apps/api/server.js', {API_PORT: '0', SUPREMA_DATA_DIR: dataDir, ...tls}, 'api');
  assert.ok(api.base, api.output());
  const web = await launch(t, 'apps/web/server.js', {PORT: '0', API_URL: api.base, ...tls}, 'web');
  assert.match(web.base || '', /^https:\/\//, web.output());
  const page = await httpsCall(web.base, '/', {ca: certificate.ca});
  assert.equal(page.status, 200);
  assert.equal(page.headers['strict-transport-security'], HSTS);
  const login = await httpsCall(web.base, '/api/login', {
    ca: certificate.ca,
    method: 'POST',
    body: {login: ADMIN.email, password: ADMIN.password}
  });
  assert.equal(login.status, 200);
  assert.equal(login.headers['strict-transport-security'], HSTS);
  assert.match(String(login.headers['set-cookie']), /;\s*Secure/i);
  // The API itself stays on loopback over plain HTTP and does not claim HTTPS.
  assert.equal((await fetch(api.base + '/api/health')).headers.get('strict-transport-security'), null);
});
