'use strict';
// Versioned migrations: run once, all-or-nothing, with a copy of existing data first.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const {openDatabase} = require('../../apps/api/src/core/database');
const migrations = require('../../apps/api/src/core/migrations');
const {configureAdmin} = require('../../scripts/admin');

// Tests add their own migrations after the shipped ones, which the rest of the code relies on.
const BASE = migrations.MIGRATIONS;

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suprema-migracoes-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}));
  return dir;
}
const recorded = db =>
  db
    .prepare('SELECT id FROM schema_migrations ORDER BY id')
    .all()
    .map(row => row.id);
const tableExists = (db, name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const backups = dir =>
  fs.existsSync(path.join(dir, 'pre-migracao')) ? fs.readdirSync(path.join(dir, 'pre-migracao')) : [];

test('as migracoes do sistema tem identificadores validos e em ordem', () => {
  assert.doesNotThrow(() => migrations.validate(migrations.MIGRATIONS));
  assert.throws(
    () =>
      migrations.validate([
        {id: '002-b', up() {}},
        {id: '001-a', up() {}}
      ]),
    /fora de ordem/
  );
  assert.throws(
    () =>
      migrations.validate([
        {id: '001-a', up() {}},
        {id: '001-a', up() {}}
      ]),
    /fora de ordem ou repetidas/
  );
  assert.throws(() => migrations.validate([{id: 'sem-numero', up() {}}]), /Migracao invalida/);
  assert.throws(() => migrations.validate([{id: '001-a'}]), /Migracao invalida/);
});

test('banco novo recebe todas as migracoes uma unica vez', t => {
  const dir = tempDir(t);
  let calls = 0;
  const list = [
    {
      id: '901-primeira',
      up(db) {
        calls++;
        db.exec('CREATE TABLE teste_primeira(id INTEGER PRIMARY KEY)');
      }
    },
    {
      id: '902-segunda',
      up(db) {
        calls++;
        db.exec('CREATE TABLE teste_segunda(id INTEGER PRIMARY KEY)');
      }
    }
  ];
  let storage = openDatabase(dir, {migrations: list});
  assert.equal(calls, 2);
  assert.ok(tableExists(storage.db, 'teste_primeira') && tableExists(storage.db, 'teste_segunda'));
  assert.deepEqual(
    recorded(storage.db).filter(id => id.startsWith('90')),
    ['901-primeira', '902-segunda']
  );
  assert.equal(storage.preMigrationBackup, null);
  storage.db.close();

  storage = openDatabase(dir, {migrations: list});
  assert.equal(calls, 2, 'reabrir o banco nao repete migracoes');
  storage.db.close();

  // A migration added later runs alone.
  storage = openDatabase(dir, {
    migrations: [
      ...list,
      {
        id: '903-terceira',
        up(db) {
          calls++;
          db.exec('CREATE TABLE teste_terceira(id INTEGER PRIMARY KEY)');
        }
      }
    ]
  });
  assert.equal(calls, 3);
  assert.ok(tableExists(storage.db, 'teste_terceira'));
  storage.db.close();
});

test('falha em uma migracao desfaz todas as desta abertura e preserva os dados', t => {
  const dir = tempDir(t);
  let storage = openDatabase(dir, {migrations: BASE});
  configureAdmin(storage.db, {
    name: 'Administrador Ficticio',
    email: 'admin@teste.invalid',
    password: 'Admin-Teste-123!'
  });
  const before = storage.db.prepare('SELECT id,email,password_hash FROM users').all();
  storage.db.close();

  const list = [
    ...BASE,
    {
      id: '901-ok',
      up(db) {
        db.exec('CREATE TABLE teste_ok(id INTEGER PRIMARY KEY)');
        db.exec("UPDATE users SET name='alterado'");
      }
    },
    {
      id: '902-falha',
      up() {
        throw Error('falha simulada');
      }
    }
  ];
  assert.throws(() => openDatabase(dir, {migrations: list}), /falha simulada/);

  const raw = new DatabaseSync(path.join(dir, 'avaliacao_suprema.db'), {readOnly: true});
  try {
    assert.equal(tableExists(raw, 'teste_ok'), false);
    assert.deepEqual(raw.prepare('SELECT id,email,password_hash FROM users').all(), before);
    assert.equal(raw.prepare('SELECT name FROM users').get().name, 'Administrador Ficticio');
    assert.deepEqual(
      recorded(raw).filter(id => id.startsWith('90')),
      []
    );
    assert.equal(raw.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  } finally {
    raw.close();
  }

  // After the defect is fixed the same database upgrades normally.
  storage = openDatabase(dir, {
    migrations: [
      ...BASE,
      list[BASE.length],
      {
        id: '902-falha',
        up(db) {
          db.exec('CREATE TABLE teste_corrigida(id INTEGER PRIMARY KEY)');
        }
      }
    ]
  });
  assert.ok(tableExists(storage.db, 'teste_ok') && tableExists(storage.db, 'teste_corrigida'));
  storage.db.close();
});

test('banco com dados recebe copia de seguranca antes de migrar; banco vazio nao', t => {
  const dir = tempDir(t);
  let storage = openDatabase(dir, {migrations: BASE});
  assert.equal(storage.preMigrationBackup, null);
  assert.deepEqual(backups(dir), []);
  configureAdmin(storage.db, {
    name: 'Administrador Ficticio',
    email: 'admin@teste.invalid',
    password: 'Admin-Teste-123!'
  });
  storage.db.close();

  const list = [
    ...BASE,
    {
      id: '901-altera',
      up(db) {
        db.exec("UPDATE users SET name='Depois da migracao'");
      }
    }
  ];
  storage = openDatabase(dir, {migrations: list});
  assert.ok(storage.preMigrationBackup, 'copia criada');
  assert.equal(backups(dir).length, 1);
  assert.match(path.basename(storage.preMigrationBackup), /^avaliacao_suprema\.antes-de-901-altera\.\d{8}-\d{6}\.db$/);
  assert.equal(storage.db.prepare('SELECT name FROM users').get().name, 'Depois da migracao');
  storage.db.close();

  const copy = new DatabaseSync(path.join(dir, 'pre-migracao', backups(dir)[0]), {readOnly: true});
  try {
    assert.equal(copy.prepare('SELECT name FROM users').get().name, 'Administrador Ficticio');
    assert.deepEqual(
      recorded(copy).filter(id => id.startsWith('90')),
      []
    );
  } finally {
    copy.close();
  }

  storage = openDatabase(dir, {migrations: list});
  assert.equal(storage.preMigrationBackup, null, 'sem migracao pendente nao ha nova copia');
  assert.equal(backups(dir).length, 1);
  storage.db.close();
});

test('banco atualizado por versao mais nova nao e aberto por codigo antigo', t => {
  const dir = tempDir(t);
  let storage = openDatabase(dir, {migrations: [...BASE, {id: '901-nova', up() {}}]});
  configureAdmin(storage.db, {
    name: 'Administrador Ficticio',
    email: 'admin@teste.invalid',
    password: 'Admin-Teste-123!'
  });
  storage.db.close();
  assert.throws(() => openDatabase(dir, {migrations: BASE}), /versao mais nova/);
  // Legacy free-form markers written before versioning are not mistaken for newer migrations.
  storage = openDatabase(dir, {migrations: [...BASE, {id: '901-nova', up() {}}]});
  storage.db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run('marcador-antigo-sem-numero');
  storage.db.close();
  storage = openDatabase(dir, {migrations: [...BASE, {id: '901-nova', up() {}}]});
  storage.db.close();
});
