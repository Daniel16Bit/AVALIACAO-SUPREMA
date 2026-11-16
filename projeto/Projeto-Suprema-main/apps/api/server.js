'use strict';
const http = require('node:http');
const {createApplication, VERSION} = require('./src/app');
const {apiTransport, apiPrivateNetwork} = require('../../packages/http/transport-policy');

function start(options = {}) {
  const port = options.port ?? Number(process.env.API_PORT || 3003);
  const host = options.host || process.env.API_HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('API_PORT invalida.');
  // Checked before the database is opened: a refused start must not migrate anything.
  apiTransport({host, privateNetwork: apiPrivateNetwork()});
  const runtime = createApplication(options);
  if (runtime.preMigrationBackup)
    console.log('[api] Banco atualizado. Copia anterior em ' + runtime.preMigrationBackup);
  const server = http.createServer(runtime.app);
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.on('error', err => {
    console.error('[api]', err.code === 'EADDRINUSE' ? 'Porta da API em uso.' : err.message);
    runtime.close();
    if (require.main === module) process.exitCode = 1;
  });
  server.listen(port, host, () => console.log(`[api] http://${host}:${server.address().port}`));
  let stopping;
  const stop = () =>
    (stopping ||= new Promise(resolve => {
      server.close(() => {
        runtime.close();
        resolve();
      });
      const timer = setTimeout(() => server.closeAllConnections(), 5000);
      timer.unref();
    }));
  if (require.main === module) {
    process.once('SIGINT', () => void stop());
    process.once('SIGTERM', () => void stop());
  }
  return {...runtime, server, stop};
}

if (require.main === module) {
  try {
    start();
  } catch (err) {
    console.error('[api]', err.message);
    process.exitCode = 1;
  }
}
module.exports = {start, createApplication, VERSION};
