'use strict';
// Writes docs/modelagem/esquema_atual.sql: the schema the system really creates, read from a
// new, empty database after the baseline and every migration have run. Nothing is typed by
// hand, so the document cannot drift from the code without a test noticing
// (tests/integration/esquema_documentado.test.js).
//
//   node scripts/schema-doc.js           rewrites the document
//   node scripts/schema-doc.js --check   exits 1 when the document is out of date
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {openDatabase} = require('../apps/api/src/core/database');

const TARGET = path.join(__dirname, '../docs/modelagem/esquema_atual.sql');
const KINDS = [
  ['table', 'Tabelas'],
  ['index', 'Índices'],
  ['trigger', 'Gatilhos']
];

function generate() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suprema-esquema-'));
  const state = openDatabase(dataDir);
  try {
    const db = state.db;
    const objects = db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all();
    const migrations = db
      .prepare('SELECT id FROM schema_migrations ORDER BY id')
      .all()
      .map(row => row.id);
    const permissions = db.prepare('SELECT role,permission FROM role_permissions ORDER BY role,permission').all();
    const lines = [
      '-- Avaliação Suprema: esquema atual do banco de dados (SQLite).',
      '--',
      '-- ARQUIVO GERADO. Não edite à mão: rode `npm run docs:schema`.',
      '-- O conteúdo é lido de um banco novo e vazio, depois da criação inicial e de todas as',
      '-- migrações. Um teste do `npm test` falha quando este arquivo fica desatualizado.',
      '-- Serve para consulta; o sistema não executa este arquivo.',
      '--',
      `-- Migrações aplicadas: ${migrations.join(', ')}.`,
      `-- ${objects.filter(o => o.type === 'table').length} tabelas, ${objects.filter(o => o.type === 'index').length} índices, ${objects.filter(o => o.type === 'trigger').length} gatilhos.`,
      ''
    ];
    for (const [type, title] of KINDS) {
      lines.push(`-- ${'='.repeat(76)}`, `-- ${title}`, `-- ${'='.repeat(76)}`, '');
      for (const object of objects.filter(o => o.type === type)) {
        if (type !== 'table') lines.push(`-- em ${object.tbl_name}`);
        lines.push(
          object.sql
            .split('\n')
            .map(line => line.trimEnd())
            .join('\n') + ';',
          ''
        );
      }
    }
    lines.push(
      `-- ${'='.repeat(76)}`,
      '-- Permissões de cada perfil (conteúdo inicial de role_permissions)',
      `-- ${'='.repeat(76)}`,
      ''
    );
    for (const {role, permission} of permissions) lines.push(`-- ${role.padEnd(18)} ${permission}`);
    return lines.join('\n') + '\n';
  } finally {
    state.db.close();
    fs.rmSync(dataDir, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  }
}

if (require.main === module) {
  const text = generate();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : '';
    if (current !== text) {
      console.error('docs/modelagem/esquema_atual.sql esta desatualizado. Rode: npm run docs:schema');
      process.exit(1);
    }
    console.log('docs/modelagem/esquema_atual.sql corresponde ao banco.');
  } else {
    fs.writeFileSync(TARGET, text);
    console.log('Escrito: ' + path.relative(process.cwd(), TARGET));
  }
}

module.exports = {generate, TARGET};
