'use strict';
// Versioned schema changes, each applied exactly once and recorded in schema_migrations.
//
// The idempotent baseline in ../database.js predates this mechanism and still runs on
// every start: databases received before it carry no reliable version to resume from.
// Everything new goes here instead, as a numbered file listed in MIGRATIONS.
//
// Rules for a migration:
//  - additive only: never drop or rewrite grades, publications, passwords or history;
//  - no transaction control inside `up`: the caller owns one transaction for the whole
//    start-up, so a failure leaves the database exactly as it was;
//  - never edit a migration that has shipped; add a new one.
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');

const MIGRATIONS = [
  require('./001-sessions'),
  require('./002-permissions'),
  require('./003-grade-history'),
  require('./004-instrument-config'),
  require('./005-forms'),
  require('./006-osce'),
  require('./007-anonymous-forms'),
  require('./008-teacher-eval'),
  require('./009-receipts'),
  require('./010-articulation')
];

const VERSIONED = /^\d{3}-[a-z0-9-]+$/;

function validate(list) {
  let previous = '';
  for (const migration of list) {
    if (!migration || typeof migration.up !== 'function' || !VERSIONED.test(String(migration.id)))
      throw Error('Migracao invalida: use id no formato 000-nome e uma funcao up.');
    if (migration.id <= previous) throw Error('Migracoes fora de ordem ou repetidas: ' + migration.id);
    previous = migration.id;
  }
  return list;
}

function appliedIds(db) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  return new Set(
    exists
      ? db
          .prepare('SELECT id FROM schema_migrations')
          .all()
          .map(row => row.id)
      : []
  );
}

function pending(db, list = MIGRATIONS) {
  const done = appliedIds(db);
  return validate(list).filter(migration => !done.has(migration.id));
}

// A database touched by a newer release must not be opened by older code.
function assertNotNewer(db, list = MIGRATIONS) {
  const known = new Set(list.map(migration => migration.id));
  const unknown = [...appliedIds(db)].filter(id => VERSIONED.test(id) && !known.has(id));
  if (unknown.length)
    throw Error(
      'Este banco foi atualizado por uma versao mais nova do sistema (' +
        unknown.join(', ') +
        '). Atualize o sistema; nenhum dado foi alterado.'
    );
}

// Call inside the start-up transaction, after the baseline created schema_migrations.
function run(db, list = MIGRATIONS) {
  const record = db.prepare('INSERT INTO schema_migrations(id) VALUES(?)');
  const done = [];
  for (const migration of pending(db, list)) {
    migration.up(db);
    record.run(migration.id);
    done.push(migration.id);
  }
  return done;
}

function hasData(db) {
  const users = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get();
  return !!users && !!db.prepare('SELECT 1 FROM users LIMIT 1').get();
}

// A consistent copy taken before the first pending migration touches an existing database.
// Must run outside a transaction. Returns the copy's path, or null when nothing was needed.
function backupBeforeMigrating(db, dataDir, list = MIGRATIONS) {
  const todo = pending(db, list);
  if (!todo.length || !hasData(db)) return null;
  const folder = path.join(dataDir, 'pre-migracao');
  fs.mkdirSync(folder, {recursive: true});
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  let target,
    attempt = 0;
  do {
    target = path.join(folder, `avaliacao_suprema.antes-de-${todo[0].id}.${stamp}${attempt ? '-' + attempt : ''}.db`);
    attempt++;
  } while (fs.existsSync(target));
  db.prepare('VACUUM INTO ?').run(target);
  const copy = new DatabaseSync(target, {readOnly: true});
  try {
    if (copy.prepare('PRAGMA quick_check').get().quick_check !== 'ok')
      throw Error('Copia de seguranca inconsistente. A atualizacao do banco foi cancelada.');
  } finally {
    copy.close();
  }
  return target;
}

module.exports = {MIGRATIONS, pending, assertNotNewer, run, backupBeforeMigrating, validate};
