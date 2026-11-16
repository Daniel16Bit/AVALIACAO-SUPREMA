'use strict';
// Backup, retention and restore (S10, AT-17). Disposable databases and synthetic accounts only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {once} = require('node:events');
const {DatabaseSync} = require('node:sqlite');
const {startApi, tempDir, ADMIN} = require('../fixtures/api');
const {
  createBackup,
  pruneBackups,
  listBackups,
  parseKeep,
  sha256,
  DB_NAME,
  META_NAME,
  DEFAULT_KEEP
} = require('../../scripts/backup');
const {restoreBackup} = require('../../scripts/restore');

const ROOT = path.resolve(__dirname, '../..');
const names = async dir => (await listBackups(dir)).map(item => item.name);
const dbFile = dir => path.join(dir, DB_NAME);

// An address where nothing listens, so the restore sees the API as stopped.
async function stoppedApiUrl() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = 'http://127.0.0.1:' + server.address().port;
  await new Promise(resolve => server.close(resolve));
  return url;
}

function rows(file, sql) {
  const db = new DatabaseSync(file, {readOnly: true});
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}
const USERS = 'SELECT id,name,email,matricula,password_hash,role,active FROM users ORDER BY id';

function cli(script, args, env) {
  const clean = {};
  for (const [key, value] of Object.entries(process.env)) if (!/^(SUPREMA_|API_)/i.test(key)) clean[key] = value;
  return spawnSync(process.execPath, [script, ...args], {cwd: ROOT, env: {...clean, ...env}, encoding: 'utf8'});
}

test('backup: copia verificada, com data, tamanho, hash e versao do banco', async t => {
  const api = await startApi(t);
  const backups = tempDir(t);
  const first = await createBackup(dbFile(api.dataDir), backups);
  assert.match(first.folder, /BACKUP_001$/);
  const meta = JSON.parse(fs.readFileSync(path.join(first.folder, META_NAME), 'utf8'));
  assert.equal(meta.sha256, await sha256(first.dest));
  assert.equal(meta.bytes, fs.statSync(first.dest).size);
  assert.ok(Math.abs(Date.now() - Date.parse(meta.created_at)) < 60000);
  assert.ok(meta.schema.includes('003-grade-history'));
  // Taken while the API is running, and still identical to what the API sees.
  assert.deepEqual(rows(first.dest, USERS), api.runtime.db.prepare(USERS).all());
  // Nothing that identifies a person is written to the metadata.
  assert.doesNotMatch(JSON.stringify(meta), new RegExp(ADMIN.email));
});

test('retencao: mantem os mais recentes e nunca reutiliza um numero', async t => {
  const api = await startApi(t);
  const source = dbFile(api.dataDir),
    backups = tempDir(t);
  for (let n = 0; n < 5; n++) await createBackup(source, backups);
  const pruned = await pruneBackups(backups, 3);
  assert.deepEqual(pruned.removed, ['BACKUP_001', 'BACKUP_002']);
  assert.deepEqual(await names(backups), ['BACKUP_003', 'BACKUP_004', 'BACKUP_005']);
  assert.match((await createBackup(source, backups)).folder, /BACKUP_006$/);
  await pruneBackups(backups, 1);
  assert.deepEqual(await names(backups), ['BACKUP_006']);
  assert.match((await createBackup(source, backups)).folder, /BACKUP_007$/);
});

test('retencao: nao toca no que nao e backup deste sistema', async t => {
  const api = await startApi(t);
  const source = dbFile(api.dataDir),
    backups = tempDir(t);
  for (let n = 0; n < 4; n++) await createBackup(source, backups);
  fs.mkdirSync(path.join(backups, 'documentos'));
  fs.writeFileSync(path.join(backups, 'documentos', 'anotacao.txt'), 'ficticio');
  fs.writeFileSync(path.join(backups, 'BACKUP_001', 'anotacao.txt'), 'ficticio');
  const pruned = await pruneBackups(backups, 1);
  assert.deepEqual(pruned.skipped, ['BACKUP_001']);
  assert.deepEqual(pruned.removed, ['BACKUP_002', 'BACKUP_003']);
  assert.ok(fs.existsSync(path.join(backups, 'documentos', 'anotacao.txt')));
  assert.ok(fs.existsSync(path.join(backups, 'BACKUP_001', DB_NAME)));
});

test('retencao: 0 mantem tudo; valor invalido e recusado sem apagar nada', async t => {
  const api = await startApi(t);
  const source = dbFile(api.dataDir),
    backups = tempDir(t);
  for (let n = 0; n < 3; n++) await createBackup(source, backups);
  assert.deepEqual((await pruneBackups(backups, 0)).removed, []);
  for (const invalid of [-1, 1.5, 'muitos'])
    await assert.rejects(pruneBackups(backups, invalid), /SUPREMA_BACKUP_KEEP invalido/);
  assert.equal((await names(backups)).length, 3);
  assert.equal(parseKeep(undefined), DEFAULT_KEEP);
  assert.equal(parseKeep(''), DEFAULT_KEEP);
  assert.equal(parseKeep('7'), 7);
});

test('restauracao em ambiente limpo: o sistema sobe com os mesmos dados (AT-17)', async t => {
  const origin = await startApi(t);
  const admin = await origin.adminSession();
  const teacher = await origin.createUser(admin, 'PROFESSOR', 'PROF-BACKUP');
  await origin.call('/api/admin/courses', {method: 'POST', cookie: admin, body: {name: 'Curso Ficticio de Backup'}});
  assert.equal(origin.runtime.db.prepare('SELECT count(*) n FROM academic_courses').get().n, 1);
  const before = {
    users: origin.runtime.db.prepare(USERS).all(),
    courses: origin.runtime.db.prepare('SELECT * FROM academic_courses').all()
  };
  const backups = tempDir(t);
  const made = await createBackup(dbFile(origin.dataDir), backups);

  const clean = tempDir(t);
  // Without confirmation the backup is only verified.
  const dryRun = await restoreBackup(made.folder, {dataDir: clean});
  assert.equal(dryRun.restored, false);
  assert.deepEqual(fs.readdirSync(clean), []);

  const report = await restoreBackup(made.folder, {dataDir: clean, confirm: true, apiUrl: await stoppedApiUrl()});
  assert.equal(report.restored, true);
  assert.equal(report.safetyCopy, null);
  assert.deepEqual(report.pending, []);
  assert.equal(await sha256(dbFile(clean)), made.meta.sha256);

  const restored = await startApi(t, {dataDir: clean, admin: false});
  assert.deepEqual(restored.runtime.db.prepare(USERS).all(), before.users);
  assert.deepEqual(restored.runtime.db.prepare('SELECT * FROM academic_courses').all(), before.courses);
  await restored.login(ADMIN.email, ADMIN.password, {expected: 200});
  await restored.login(teacher.matricula, teacher.password, {expected: 200});
});

test('restauracao sobre banco existente: guarda copia do anterior e volta ao estado do backup', async t => {
  const api = await startApi(t);
  const admin = await api.adminSession();
  await api.createUser(admin, 'PROFESSOR', 'PROF-ANTES');
  const backups = tempDir(t);
  const made = await createBackup(dbFile(api.dataDir), backups);
  await api.createUser(admin, 'PROFESSOR', 'PROF-DEPOIS');
  const matriculas = file =>
    rows(file, 'SELECT matricula FROM users WHERE matricula IS NOT NULL ORDER BY matricula').map(row => row.matricula);
  await api.stop();

  const report = await restoreBackup(undefined, {
    dataDir: api.dataDir,
    backupDir: backups,
    confirm: true,
    apiUrl: await stoppedApiUrl()
  });
  assert.equal(report.backup, made.dest);
  assert.ok(matriculas(dbFile(api.dataDir)).includes('PROF-ANTES'));
  assert.ok(!matriculas(dbFile(api.dataDir)).includes('PROF-DEPOIS'));
  // What was replaced is still recoverable.
  assert.ok(report.safetyCopy.startsWith(path.join(api.dataDir, 'pre-restauracao')));
  assert.ok(matriculas(report.safetyCopy).includes('PROF-DEPOIS'));
  assert.ok(!fs.existsSync(dbFile(api.dataDir) + '.restaurando'));
});

test('restauracao recusa backup corrompido, truncado ou de versao mais nova, sem tocar no banco', async t => {
  const api = await startApi(t);
  const backups = tempDir(t);
  const made = await createBackup(dbFile(api.dataDir), backups);
  await api.stop();
  const current = dbFile(api.dataDir),
    original = await sha256(current),
    apiUrl = await stoppedApiUrl();
  const untouched = async () => {
    assert.equal(await sha256(current), original);
    assert.ok(!fs.existsSync(path.join(api.dataDir, 'pre-restauracao')));
  };

  // Same size, different bytes: only the recorded hash can tell.
  const damaged = tempDir(t);
  fs.cpSync(made.folder, path.join(damaged, 'BACKUP_001'), {recursive: true});
  const bytes = fs.readFileSync(path.join(damaged, 'BACKUP_001', DB_NAME));
  bytes.fill(0x5a, bytes.length - 2048, bytes.length - 1024);
  fs.writeFileSync(path.join(damaged, 'BACKUP_001', DB_NAME), bytes);
  await assert.rejects(
    restoreBackup(path.join(damaged, 'BACKUP_001'), {dataDir: api.dataDir, confirm: true, apiUrl}),
    /alterado ou esta corrompido/
  );
  await untouched();

  // A bare truncated file has no metadata: the integrity check must catch it.
  const truncated = path.join(tempDir(t), 'copia.db');
  fs.writeFileSync(truncated, fs.readFileSync(made.dest).subarray(0, 6000));
  await assert.rejects(restoreBackup(truncated, {dataDir: api.dataDir, confirm: true, apiUrl}), /Backup inconsistente/);
  await untouched();

  const newer = path.join(tempDir(t), 'copia.db');
  fs.copyFileSync(made.dest, newer);
  const db = new DatabaseSync(newer);
  db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run('999-versao-futura');
  db.close();
  await assert.rejects(restoreBackup(newer, {dataDir: api.dataDir, confirm: true, apiUrl}), /versao mais nova/);
  await untouched();

  await assert.rejects(
    restoreBackup(path.join(backups, 'BACKUP_404'), {dataDir: api.dataDir, confirm: true, apiUrl}),
    /Backup nao encontrado/
  );
});

test('restauracao recusa enquanto a API responde', async t => {
  const api = await startApi(t);
  const backups = tempDir(t);
  const made = await createBackup(dbFile(api.dataDir), backups);
  await assert.rejects(
    restoreBackup(made.folder, {dataDir: tempDir(t), confirm: true, apiUrl: api.base}),
    /A API esta em execucao/
  );
});

test('linha de comando: backup aplica a retencao configurada; restauracao exige --confirmar', async t => {
  const api = await startApi(t);
  await api.stop();
  const backups = tempDir(t),
    clean = tempDir(t);
  const env = {SUPREMA_DATA_DIR: api.dataDir, SUPREMA_BACKUP_DIR: backups, SUPREMA_BACKUP_KEEP: '2'};
  for (let n = 0; n < 3; n++) {
    const run = cli('scripts/backup.js', [], env);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Backup criado: /);
  }
  assert.deepEqual(await names(backups), ['BACKUP_002', 'BACKUP_003']);

  // A wrong setting stops the job before any copy is made or removed.
  const invalid = cli('scripts/backup.js', [], {...env, SUPREMA_BACKUP_KEEP: 'tudo'});
  assert.equal(invalid.status, 1);
  assert.deepEqual(await names(backups), ['BACKUP_002', 'BACKUP_003']);
  // A failed backup must be visible to the scheduler.
  assert.equal(cli('scripts/backup.js', [], {...env, SUPREMA_DATA_DIR: tempDir(t)}).status, 1);

  const target = {SUPREMA_DATA_DIR: clean, SUPREMA_BACKUP_DIR: backups, API_URL: await stoppedApiUrl()};
  const check = cli('scripts/restore.js', ['--ultimo'], target);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /Nada foi alterado/);
  assert.deepEqual(fs.readdirSync(clean), []);
  const done = cli('scripts/restore.js', ['--ultimo', '--confirmar'], target);
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /Banco restaurado: /);
  assert.equal(await sha256(dbFile(clean)), await sha256(path.join(backups, 'BACKUP_003', DB_NAME)));
  assert.equal(cli('scripts/restore.js', [], target).status, 1);
});
