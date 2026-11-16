'use strict';
// Consistent, verified copies of the SQLite database, numbered and pruned by retention.
// Scheduling belongs to the operating system (docs/BACKUP.md): this script runs once and exits.
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {DatabaseSync, backup} = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const DB_NAME = 'avaliacao_suprema.db';
const META_NAME = 'backup.json';
const FOLDER = /^BACKUP_(\d{3,})$/;
// Provisional default: with one backup a day this is about a month. 0 keeps everything.
const DEFAULT_KEEP = 30;
// What a backup folder may contain; a folder with anything else is never deleted by retention.
const EXPECTED = new Set([DB_NAME, DB_NAME + '-wal', DB_NAME + '-shm', META_NAME]);

const defaultSource = () => path.join(process.env.SUPREMA_DATA_DIR || path.join(ROOT, 'data'), DB_NAME);
const defaultDestination = () => process.env.SUPREMA_BACKUP_DIR || path.join(ROOT, 'backups');

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('error', reject)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

// Opens a copy read-only. Throws unless it is a healthy database of this system.
function inspect(file) {
  let db;
  try {
    db = new DatabaseSync(file, {readOnly: true});
    const rows = db.prepare('PRAGMA integrity_check').all();
    if (rows.length !== 1 || rows[0].integrity_check !== 'ok') throw Error('falha na verificacao de integridade');
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get())
      throw Error('nao e um banco do Avaliacao Suprema');
    const versioned = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
    return {
      schema: versioned
        ? db
            .prepare('SELECT id FROM schema_migrations ORDER BY id')
            .all()
            .map(row => row.id)
        : []
    };
  } catch (err) {
    throw Error('Backup inconsistente: ' + err.message + '.');
  } finally {
    db?.close();
  }
}

// Backup folders of `destination`, oldest first. `meta` is null for copies made before metadata existed.
async function listBackups(destination = defaultDestination()) {
  let entries;
  try {
    entries = await fsp.readdir(destination, {withFileTypes: true});
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const found = [];
  for (const entry of entries) {
    const match = entry.isDirectory() && entry.name.match(FOLDER);
    if (!match) continue;
    const folder = path.join(destination, entry.name);
    let meta = null;
    try {
      meta = JSON.parse(await fsp.readFile(path.join(folder, META_NAME), 'utf8'));
    } catch {
      /* older or damaged folder */
    }
    found.push({number: Number(match[1]), name: entry.name, folder, file: path.join(folder, DB_NAME), meta});
  }
  return found.sort((a, b) => a.number - b.number);
}

async function createBackup(source = defaultSource(), destination = defaultDestination()) {
  await fsp.access(source);
  await fsp.mkdir(destination, {recursive: true});
  // Always above the highest existing number: after retention removes old copies,
  // the number still tells which backup is newer.
  let number = ((await listBackups(destination)).at(-1)?.number || 0) + 1,
    folder;
  for (; ; number++) {
    folder = path.join(destination, 'BACKUP_' + String(number).padStart(3, '0'));
    try {
      await fsp.mkdir(folder);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  const dest = path.join(folder, DB_NAME);
  const db = new DatabaseSync(source, {readOnly: true});
  try {
    await backup(db, dest);
    const {schema} = inspect(dest);
    // No personal data here: only what a restore needs to recognise and verify the copy.
    const meta = {
      format: 1,
      created_at: new Date().toISOString(),
      app_version: require('../package.json').version,
      file: DB_NAME,
      bytes: (await fsp.stat(dest)).size,
      sha256: await sha256(dest),
      schema
    };
    await fsp.writeFile(path.join(folder, META_NAME), JSON.stringify(meta, null, 2) + '\n');
    return {folder, dest, number, meta};
  } catch (err) {
    await fsp.rm(folder, {recursive: true, force: true});
    throw err;
  } finally {
    db.close();
  }
}

function parseKeep(value) {
  if (value === undefined || value === null || String(value).trim() === '') return DEFAULT_KEEP;
  const keep = Number(value);
  if (!Number.isInteger(keep) || keep < 0)
    throw Error('SUPREMA_BACKUP_KEEP invalido: use um numero inteiro (0 mantem todos os backups).');
  return keep;
}

// Keeps the `keep` newest backups. Call only after a new backup was created and verified.
async function pruneBackups(destination = defaultDestination(), keep = DEFAULT_KEEP) {
  keep = parseKeep(keep);
  const all = await listBackups(destination);
  const removed = [],
    skipped = [];
  if (keep > 0) {
    for (const item of all.slice(0, Math.max(0, all.length - keep))) {
      // Only what this script produced: an unexpected file means someone is using the folder.
      if ((await fsp.readdir(item.folder)).some(name => !EXPECTED.has(name))) {
        skipped.push(item.name);
        continue;
      }
      await fsp.rm(item.folder, {recursive: true, force: true});
      removed.push(item.name);
    }
  }
  return {removed, skipped, kept: all.map(item => item.name).filter(name => !removed.includes(name))};
}

async function main() {
  // Validated first: a wrong setting must stop the job before it does anything.
  const keep = parseKeep(process.env.SUPREMA_BACKUP_KEEP);
  const created = await createBackup();
  console.log('Backup criado: ' + created.dest);
  const pruned = await pruneBackups(undefined, keep);
  if (pruned.removed.length)
    console.log(
      `Retencao: ${pruned.removed.length} backup(s) antigo(s) removido(s); ${pruned.kept.length} mantido(s).`
    );
  if (pruned.skipped.length)
    console.log('Retencao: nao removido(s) por conter(em) arquivos inesperados: ' + pruned.skipped.join(', '));
}

if (require.main === module)
  main().catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  });
module.exports = {
  createBackup,
  pruneBackups,
  listBackups,
  parseKeep,
  inspect,
  sha256,
  defaultSource,
  defaultDestination,
  DB_NAME,
  META_NAME,
  DEFAULT_KEEP
};
