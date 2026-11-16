'use strict';
// docs/modelagem/esquema_atual.sql is generated from a real, empty database. This test fails
// when a migration changes the schema and the document is not generated again.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {generate, TARGET} = require('../../scripts/schema-doc');
const {MIGRATIONS} = require('../../apps/api/src/core/migrations');

test('o esquema documentado e o que o sistema cria (rode "npm run docs:schema" se falhar)', () => {
  const documented = fs.readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(documented, generate());
});

test('o documento cita todas as migracoes e nao tem dados de pessoas', () => {
  const documented = fs.readFileSync(TARGET, 'utf8');
  for (const migration of MIGRATIONS) assert.ok(documented.includes(migration.id), migration.id);
  // An empty database has no accounts: no e-mail address can appear in the document.
  assert.doesNotMatch(documented, /[\w.+-]+@[\w-]+\.[\w.]+/);
  assert.doesNotMatch(documented, /INSERT INTO/i);
});
