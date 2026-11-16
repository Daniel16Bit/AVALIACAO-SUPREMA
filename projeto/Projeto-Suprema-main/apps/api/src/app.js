'use strict';
// Integrated application: all profiles use the same database and authorization layer.
const express = require('express');
const {openDatabase} = require('./core/database');
const {installSecurity, hashPassword} = require('./core/security');
const D = require('./core/domain');
const VERSION = require('../../../package.json').version;
function createApplication(options = {}) {
  const storage = openDatabase(options.dataDir);
  const {db} = storage;
  // Link existing administrative assignments once, without fabricating academic rules.
  D.transaction(db, () => {
    for (const t of db.prepare('SELECT id FROM teaching_assignments WHERE active=1').all()) D.syncAssignment(db, t.id);
    if (!db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get('freeze-legacy-metadata-v1')) {
      for (const a of db.prepare('SELECT * FROM assessments').all()) {
        const meta = {
          ...D.publicationMetadata(db, a),
          legacy: true,
          metadataSource: 'Configuracao existente na migracao; sem comprovacao da configuracao historica'
        };
        db.prepare('UPDATE published_scores SET metadata_json=? WHERE assessment_id=? AND metadata_json IS NULL').run(
          JSON.stringify(meta),
          a.id
        );
      }
      db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run('freeze-legacy-metadata-v1');
    }
  });
  const app = express();
  app.disable('x-powered-by');
  app.use(require('../../../packages/http/security-headers').securityHeaders);
  app.use(express.json({limit: '3mb', strict: true}));
  const security = installSecurity(app, db, {
    secureCookie:
      !!options.secureCookie ||
      process.env.SUPREMA_SECURE_COOKIE === '1' ||
      process.env.SUPREMA_BEHIND_HTTPS_PROXY === '1' ||
      !!(process.env.SUPREMA_TLS_KEY && process.env.SUPREMA_TLS_CERT),
    trustedProxies: options.trustedProxies
  });
  const ctx = {
    app,
    db,
    auth: security.auth,
    can: security.can,
    hasPermission: security.hasPermission,
    revokeUserSessions: security.revokeUserSessions,
    clearLoginAttempts: security.clearLoginAttempts,
    hashPassword
  };
  const {installModules} = require('./module-loader');
  const manifest = require('./modules');
  const modules = installModules(ctx, options.modules || manifest, {onError: options.onModuleError});
  const health = () => ({
    ok: true,
    service: 'avaliacao-suprema',
    version: VERSION,
    database: 'SQLite local portatil',
    status: modules.every(m => m.status === 'ready') ? 'ready' : 'degraded',
    modules
  });
  app.get('/api/health', (req, res) => res.json(health()));
  app.get('/api/ready', (req, res) => res.status(health().status === 'ready' ? 200 : 503).json(health()));
  app.get('/api/setup-status', (req, res) =>
    res.json({needsAdmin: !db.prepare("SELECT 1 FROM users WHERE role='ADMIN' AND active=1").get()})
  );
  app.use('/api', (req, res) => res.status(404).json({error: 'Recurso nao encontrado.'}));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    let status = err.status || 500,
      message = err.message || 'Falha na operacao.';
    if (/UNIQUE constraint failed/i.test(message)) {
      status = 409;
      message = 'Este cadastro ou vinculo ja existe. Confira os identificadores.';
    } else if (/FOREIGN KEY constraint failed/i.test(message)) {
      status = 409;
      message = 'Vinculo invalido. Atualize a pagina e confira os cadastros.';
    } else if (err.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      message = 'A planilha deve ter no maximo 8 MB.';
    } else if (/SQLITE|no such|database|constraint/i.test(message) && !err.status) {
      status = 500;
      message = 'Falha ao acessar os dados. Nenhuma confirmacao de salvamento foi emitida.';
    }
    if (status >= 500) {
      console.error('[ERRO]', err.stack);
      message = 'Falha interna. A operacao nao foi confirmada. Consulte o registro do servidor.';
    }
    res.status(status).json({error: message});
  });
  let closed = false;
  return {
    app,
    ...storage,
    modules,
    version: VERSION,
    close() {
      if (closed) return;
      closed = true;
      security.close();
      db.close();
    }
  };
}
module.exports = {createApplication, VERSION};
