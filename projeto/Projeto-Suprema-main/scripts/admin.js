'use strict';
const readline = require('node:readline'),
  {Writable} = require('node:stream'),
  crypto = require('node:crypto');
const {openDatabase} = require('../apps/api/src/core/database');
const {hashPassword} = require('../apps/api/src/core/security');
const D = require('../apps/api/src/core/domain');
const U = require('../apps/api/src/core/user-management');
function configureAdmin(db, {name, email, password}) {
  name = D.text(name);
  email = D.text(email, 240).toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) D.fail(400, 'Informe nome e e-mail válido.');
  const hash = hashPassword(password);
  return D.transaction(db, () => {
    const tx = db;
    const old = tx.prepare('SELECT * FROM users WHERE lower(email)=? OR lower(matricula)=?').get(email, email);
    if (old && old.role !== 'ADMIN') D.fail(409, 'Este e-mail pertence a professor ou aluno. Use outro e-mail.');
    let uid;
    if (old) {
      uid = Number(old.id);
      tx.prepare(
        'UPDATE users SET name=?,password_hash=?,active=1,invalid_attempts=0,must_change_password=0,session_version=session_version+1 WHERE id=?'
      ).run(name, hash, uid);
    } else {
      const alias = 'ADMIN-' + crypto.randomBytes(5).toString('hex').toUpperCase();
      uid = U.nextId(tx, 'users');
      tx.prepare("INSERT INTO users(id,name,email,matricula,password_hash,role) VALUES(?,?,?,?,?,'ADMIN')").run(
        uid,
        name,
        email,
        alias,
        hash
      );
    }
    D.audit(tx, {id: uid}, 'ADMIN_CONFIGURACAO_LOCAL', {id: uid});
    return {id: uid, email};
  });
}
async function main() {
  let storage,
    rl,
    hidden = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!hidden) process.stdout.write(chunk);
      callback();
    }
  });
  try {
    storage = await openDatabase();
    console.log('\nCONFIGURAR ADMINISTRADOR GERAL - AVALIACAO SUPREMA (Banco local)\n');
    rl = readline.createInterface({input: process.stdin, output, terminal: process.stdin.isTTY});
    const ask = q => new Promise(resolve => rl.question(q, resolve)),
      email = await ask('E-mail para entrar: '),
      name = await ask('Nome do administrador: ');
    process.stdout.write('Senha: ');
    hidden = true;
    const password = await ask('');
    hidden = false;
    process.stdout.write('\nRepita a senha: ');
    hidden = true;
    const confirmation = await ask('');
    hidden = false;
    process.stdout.write('\n');
    if (password !== confirmation) throw Error('As senhas não coincidem. Nada foi alterado.');
    const result = configureAdmin(storage.db, {name, email, password});
    console.log('\nAdministrador configurado. Login: ' + result.email);
  } catch (e) {
    console.error('\nERRO: ' + e.message);
    process.exitCode = 1;
  } finally {
    hidden = false;
    rl?.close();
    storage?.db.close();
  }
}
if (require.main === module) main();
module.exports = {configureAdmin, main};
