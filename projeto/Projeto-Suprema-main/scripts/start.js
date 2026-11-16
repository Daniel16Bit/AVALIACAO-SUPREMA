'use strict';
const {spawn} = require('node:child_process');
const path = require('node:path');

function start() {
  const root = path.resolve(__dirname, '..');
  const children = new Map();
  // Deliberately do not terminate the sibling after a failure.
  for (const [name, entry] of [
    ['api', 'apps/api/server.js'],
    ['web', 'apps/web/server.js']
  ]) {
    const env = {...process.env};
    if (env.SUPREMA_TLS_KEY && env.SUPREMA_TLS_CERT) env.SUPREMA_SECURE_COOKIE = '1';
    const child = spawn(process.execPath, ['--env-file-if-exists=.env', entry], {cwd: root, env, stdio: 'inherit'});
    children.set(name, child);
    child.on('error', err => console.error(`[${name}]`, err.message));
    child.on('exit', code => {
      children.delete(name);
      if (!stopping && code !== 0) {
        console.error(
          `[${name}] encerrou. O outro servico continua ativo. Reinicie este lado em outro terminal com npm run start:${name}.`
        );
        process.exitCode = 1;
      }
    });
  }
  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    for (const child of children.values()) child.kill('SIGTERM');
    setTimeout(() => {
      for (const child of children.values()) child.kill('SIGKILL');
    }, 6000).unref();
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return {children, stop};
}
if (require.main === module) start();
module.exports = {start};
