'use strict';
// Restores a verified backup over the database, keeping a safety copy of what was there.
// Run with both services stopped. Step by step in docs/BACKUP.md.
const fsp = require('node:fs/promises');
const path = require('node:path');
const {DatabaseSync, backup} = require('node:sqlite');
const {DB_NAME, META_NAME, sha256, inspect, listBackups, defaultDestination} = require('./backup');
const migrations = require('../apps/api/src/core/migrations');

const ROOT = path.resolve(__dirname, '..');
const defaultDataDir = () => path.resolve(process.env.SUPREMA_DATA_DIR || path.join(ROOT, 'data'));
const defaultApiUrl = () => process.env.API_URL || 'http://127.0.0.1:' + (process.env.API_PORT || 3003);
const exists = file =>
  fsp.access(file).then(
    () => true,
    () => false
  );

// Accepts a BACKUP_NNN folder or a database file. Metadata is used when it sits next to the file.
async function resolveBackup(target, backupDir) {
  if (target === undefined || target === null) {
    const newest = (await listBackups(backupDir)).at(-1);
    if (!newest) throw Error('Nenhum backup encontrado em ' + backupDir + '.');
    target = newest.folder;
  }
  target = path.resolve(String(target));
  let stat;
  try {
    stat = await fsp.stat(target);
  } catch {
    throw Error('Backup nao encontrado: ' + target);
  }
  const file = stat.isDirectory() ? path.join(target, DB_NAME) : target;
  if (!(await exists(file))) throw Error('Backup nao encontrado: ' + file);
  let meta = null;
  if (path.basename(file) === DB_NAME) {
    try {
      meta = JSON.parse(await fsp.readFile(path.join(path.dirname(file), META_NAME), 'utf8'));
    } catch {
      /* copy without metadata */
    }
  }
  return {file, meta};
}

// Everything that can be checked without touching the current database.
async function verifyBackup(file, meta) {
  const bytes = (await fsp.stat(file)).size;
  const hash = await sha256(file);
  if (meta && (meta.bytes !== bytes || meta.sha256 !== hash))
    throw Error(
      'O backup foi alterado ou esta corrompido: o conteudo nao confere com o registrado em ' + META_NAME + '.'
    );
  const {schema} = inspect(file);
  const db = new DatabaseSync(file, {readOnly: true});
  try {
    migrations.assertNotNewer(db);
  } finally {
    db.close();
  }
  const applied = new Set(schema);
  return {
    bytes,
    sha256: hash,
    schema,
    pending: migrations.MIGRATIONS.map(m => m.id).filter(id => !applied.has(id)),
    createdAt: meta?.created_at || null
  };
}

async function apiAnswers(apiUrl) {
  try {
    await fetch(new URL('/api/health', apiUrl), {signal: AbortSignal.timeout(1500)});
    return true;
  } catch {
    return false;
  }
}

// Copy of the database being replaced. Falls back to the raw files when it cannot be read as a database.
async function safetyCopy(current, dataDir) {
  const folder = path.join(dataDir, 'pre-restauracao');
  await fsp.mkdir(folder, {recursive: true});
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  let target,
    attempt = 0;
  do {
    target = path.join(folder, `avaliacao_suprema.antes-da-restauracao.${stamp}${attempt ? '-' + attempt : ''}.db`);
    attempt++;
  } while (await exists(target));
  try {
    const db = new DatabaseSync(current, {readOnly: true});
    try {
      await backup(db, target);
    } finally {
      db.close();
    }
  } catch {
    await fsp.rm(target, {force: true});
    for (const suffix of ['', '-wal', '-shm'])
      if (await exists(current + suffix)) await fsp.copyFile(current + suffix, target + suffix);
  }
  return target;
}

async function restoreBackup(target, options = {}) {
  const dataDir = path.resolve(options.dataDir || defaultDataDir());
  const {file, meta} = await resolveBackup(target, options.backupDir || defaultDestination());
  const verified = await verifyBackup(file, meta);
  const current = path.join(dataDir, DB_NAME);
  const report = {backup: file, target: current, ...verified, restored: false, safetyCopy: null};
  if (!options.confirm) return report;

  const apiUrl = options.apiUrl === undefined ? defaultApiUrl() : options.apiUrl;
  if (apiUrl && (await apiAnswers(apiUrl)))
    throw Error(
      'A API esta em execucao em ' + apiUrl + '. Desligue os servicos antes de restaurar; nada foi alterado.'
    );

  await fsp.mkdir(dataDir, {recursive: true});
  const staged = current + '.restaurando';
  try {
    await fsp.copyFile(file, staged);
    if ((await sha256(staged)) !== verified.sha256) throw Error('Falha ao copiar o backup; nada foi alterado.');
    if (await exists(current)) {
      report.safetyCopy = await safetyCopy(current, dataDir);
      // Fold the write-ahead log into the old file so no stale log can be replayed over the restored one.
      try {
        const db = new DatabaseSync(current);
        try {
          db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        } finally {
          db.close();
        }
      } catch {
        /* unreadable: the raw copy above has it */
      }
    }
    try {
      for (const suffix of ['-wal', '-shm']) await fsp.rm(current + suffix, {force: true});
      await fsp.rename(staged, current);
    } catch (err) {
      if (['EBUSY', 'EPERM', 'EACCES'].includes(err.code))
        throw Error('O banco esta em uso por outro processo. Desligue os servicos antes de restaurar.');
      throw err;
    }
  } finally {
    await fsp.rm(staged, {force: true});
  }
  if ((await sha256(current)) !== verified.sha256)
    throw Error('O banco restaurado nao confere com o backup. Use a copia em ' + report.safetyCopy + '.');
  inspect(current);
  report.restored = true;
  return report;
}

async function main(argv) {
  const confirm = argv.includes('--confirmar');
  const target = argv.find(arg => !arg.startsWith('--'));
  if (!target && !argv.includes('--ultimo')) {
    console.log(
      'Uso: npm run restore -- <pasta BACKUP_NNN ou arquivo .db> [--confirmar]\n     npm run restore -- --ultimo [--confirmar]\nSem --confirmar o backup e apenas verificado; nada e alterado.'
    );
    process.exitCode = 1;
    return;
  }
  const report = await restoreBackup(target, {confirm});
  console.log(
    'Backup verificado: ' + report.backup + (report.createdAt ? ' (criado em ' + report.createdAt + ')' : '')
  );
  if (!report.restored) {
    console.log(
      'Nada foi alterado. Com os servicos desligados, repita com --confirmar para restaurar em ' + report.target
    );
    return;
  }
  console.log('Banco restaurado: ' + report.target);
  if (report.safetyCopy) console.log('Copia do banco anterior: ' + report.safetyCopy);
  if (report.pending.length)
    console.log(
      'O backup e de uma versao anterior do banco; ao iniciar, o sistema aplicara: ' + report.pending.join(', ')
    );
}

if (require.main === module)
  main(process.argv.slice(2)).catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  });
module.exports = {restoreBackup, verifyBackup, resolveBackup};
