'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const {Worker} = require('node:worker_threads');
const D = require('../../core/domain');
const Accounts = require('../../core/account-creation');
const {provisionalPassword, hashPasswordAsync} = require('../../core/security');
const TTL = 20 * 60 * 1000;
const CREDENTIALS_NOTICE =
  'Baixe a lista agora: as senhas não ficam guardadas no sistema e deixam de estar disponíveis em poucos minutos. Cada aluno define a própria senha no primeiro acesso.';
function parseWorkbook(bytes, extension) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'student-workbook-worker.js'), {
      workerData: {bytes, extension},
      resourceLimits: {maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32, stackSizeMb: 4}
    });
    let finished = false;
    const finish = (err, data) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      err ? reject(err) : resolve(data);
    };
    const timer = setTimeout(
      () =>
        finish(
          Object.assign(
            Error('A leitura excedeu o limite. Divida a planilha e tente novamente; nenhuma conta foi criada.'),
            {status: 400}
          )
        ),
      20000
    );
    worker.once('message', m => (m.ok ? finish(null, m.result) : finish(Object.assign(Error(m.error), {status: 400}))));
    worker.once('error', () =>
      finish(
        Object.assign(
          Error(
            'N\u00e3o foi poss\u00edvel ler este arquivo dentro dos limites de seguran\u00e7a. Salve como .xlsx ou divida a planilha.'
          ),
          {status: 400}
        )
      )
    );
    worker.once('exit', () => {
      if (!finished)
        finish(Object.assign(Error('Leitura da planilha interrompida. Nenhuma conta foi criada.'), {status: 400}));
    });
  });
}
function internalEmail(matricula) {
  const s = String(matricula).trim().toLowerCase();
  const local = /^[a-z0-9][a-z0-9._+-]{0,55}$/.test(s)
    ? s
    : 'aluno-' + crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);
  return `${local}@alunos.suprema.local`;
}
function validateRows(db, raw) {
  const groups = new Map();
  for (const r of raw)
    if (r.selected !== false && r.matricula) {
      const key = r.matricula.toLowerCase();
      groups.set(key, (groups.get(key) || 0) + 1);
    }
  const existingUser = db.prepare('SELECT id,role FROM users WHERE lower(matricula)=? OR lower(email)=?');
  const existingStudent = db.prepare('SELECT id FROM students WHERE lower(matricula)=?');
  return raw.map(r => {
    const out = {
      row_id: r.row_id,
      sheet_id: r.sheet_id,
      sheet: r.sheet,
      excel_row: r.excel_row,
      name: r.name,
      matricula: r.matricula,
      period: r.period || null,
      selected: r.selected !== false,
      email: internalEmail(r.matricula),
      status: 'READY',
      message: 'Pronto para criar.'
    };
    const status = (s, m) => Object.assign(out, {status: s, message: m});
    if (r.selected === false) return status('EXCLUDED', 'Ignorado por escolha do administrador.');
    if (r.parse_errors?.length) return status('INVALID', r.parse_errors.join(' '));
    if (!r.name || !r.matricula) return status('INVALID', 'Nome e matr\u00edcula s\u00e3o obrigat\u00f3rios.');
    if (r.name.length > 150 || r.matricula.length > 70)
      return status('INVALID', 'Nome (150) ou matr\u00edcula (70) excede o limite de caracteres.');
    const key = r.matricula.toLowerCase(),
      u = existingUser.get(key, key),
      st = existingStudent.get(key);
    if (u)
      return status(
        'EXISTING',
        'J\u00e1 existe uma conta com esta matr\u00edcula / identifica\u00e7\u00e3o. Nenhum dado ou senha ser\u00e1 substitu\u00eddo.'
      );
    if (st)
      return status(
        'EXISTING',
        'Aluno j\u00e1 cadastrado. N\u00e3o ser\u00e1 duplicado; use o cadastro individual para criar um acesso, se necess\u00e1rio.'
      );
    if (groups.get(key) > 1)
      return status(
        'DUPLICATE',
        'Matr\u00edcula repetida no arquivo. Selecione apenas a linha correta ou corrija a planilha.'
      );
    if (!r.period) return status('REVIEW_PERIOD', 'Informe o per\u00edodo antes de confirmar.');
    try {
      D.period(r.period);
      Accounts.identity(db, {name: r.name, matricula: r.matricula, email: out.email});
    } catch (e) {
      return status(e.status === 409 ? 'EXISTING' : 'INVALID', e.message);
    }
    return out;
  });
}
function summary(rows) {
  return {
    total: rows.length,
    ready: rows.filter(r => r.status === 'READY').length,
    existing: rows.filter(r => r.status === 'EXISTING').length,
    duplicates: rows.filter(r => r.status === 'DUPLICATE').length,
    review: rows.filter(r => r.status === 'REVIEW_PERIOD').length,
    invalid: rows.filter(r => r.status === 'INVALID').length,
    excluded: rows.filter(r => r.status === 'EXCLUDED').length
  };
}
module.exports = function installStudentImport({app, db, auth, can, hasPermission}) {
  const middle = [auth, can('admin.manage')],
    drafts = new Map();
  let parsing = 0;
  const wrap = fn => (req, res, next) => {
    try {
      const p = fn(req, res);
      if (p?.then) p.catch(next);
    } catch (e) {
      next(e);
    }
  };
  const currentActor = id => db.prepare('SELECT id,role,active,session_version FROM users WHERE id=?').get(id);
  const stillAdmin = actor => !!actor?.active && hasPermission(actor.role, 'admin.manage');
  function clean() {
    for (const [id, d] of drafts) if (d.expires < Date.now() && !d.busy) drafts.delete(id);
  }
  function draft(req) {
    clean();
    const id = req.body?.token;
    if (typeof id !== 'string' || id.length > 80) D.fail(400, 'Pr\u00e9via inv\u00e1lida.');
    const d = drafts.get(id);
    if (!d || d.owner !== req.user.id)
      D.fail(404, 'Pr\u00e9via n\u00e3o encontrada ou expirada. Envie a planilha novamente.');
    const actor = currentActor(req.user.id);
    if (!stillAdmin(actor) || actor.session_version !== d.ownerVersion)
      D.fail(401, 'A sess\u00e3o mudou. Entre novamente e envie a planilha.');
    return d;
  }
  function ensureRevision(d, body) {
    if (body.revision !== d.revision)
      D.fail(409, 'A pr\u00e9via foi alterada. Reabra a revis\u00e3o antes de confirmar.');
    if (d.busy) D.fail(409, 'Esta importa\u00e7\u00e3o j\u00e1 est\u00e1 em processamento.');
  }
  function view(d) {
    const rows = validateRows(db, d.rows);
    return {
      token: d.id,
      revision: d.revision,
      file_name: d.fileName,
      source_sha256: d.sha256,
      expires_at: new Date(d.expires).toISOString(),
      sheets: d.sheets,
      rows,
      summary: summary(rows),
      blank_rows: d.blankRows,
      login: 'matricula',
      email_policy: 'Identificador interno @alunos.suprema.local, n\u00e3o um e-mail real de contato.',
      password_policy:
        'Cada conta recebe uma senha provis\u00f3ria individual, gerada pelo sistema e exibida uma \u00fanica vez ao concluir. O aluno define a pr\u00f3pria senha no primeiro acesso. Nenhuma senha \u00e9 compartilhada entre contas.'
    };
  }
  app.post(
    '/api/admin/student-import/preview',
    middle,
    express.raw({type: 'application/octet-stream', limit: '8mb'}),
    wrap(async (req, res) => {
      if (!Buffer.isBuffer(req.body)) D.fail(400, 'Envie um arquivo Excel como application/octet-stream.');
      let fileName;
      try {
        fileName = decodeURIComponent(req.headers['x-file-name'] || '');
      } catch {
        D.fail(400, 'Nome de arquivo inv\u00e1lido.');
      }
      fileName = path.posix.basename(fileName.replace(/\\/g, '/'));
      if (!fileName || fileName.length > 200 || /[\x00-\x1f]/.test(fileName))
        D.fail(400, 'Nome de arquivo inv\u00e1lido.');
      const ext = path.extname(fileName).toLowerCase();
      if (!['.xlsx', '.xls'].includes(ext)) D.fail(400, 'Use um arquivo .xlsx ou .xls.');
      clean();
      if (parsing >= 2)
        D.fail(429, 'Duas planilhas est\u00e3o sendo lidas. Tente novamente ap\u00f3s concluir uma delas.');
      const before = currentActor(req.user.id);
      let parsed;
      parsing++;
      try {
        parsed = await parseWorkbook(req.body, ext);
      } finally {
        parsing--;
      }
      const after = currentActor(req.user.id);
      if (!stillAdmin(after) || after.session_version !== before.session_version)
        D.fail(401, 'Sess\u00e3o alterada durante a leitura. Entre novamente.');
      const mine = [...drafts.values()]
        .filter(d => d.owner === req.user.id && !d.busy)
        .sort((a, b) => a.expires - b.expires);
      while (mine.length >= 3) drafts.delete(mine.shift().id);
      if (drafts.size >= 20)
        D.fail(429, 'Limite de pr\u00e9vias simult\u00e2neas atingido. Conclua as importa\u00e7\u00f5es abertas.');
      const d = {
        id: crypto.randomUUID(),
        owner: req.user.id,
        ownerVersion: after.session_version,
        expires: Date.now() + TTL,
        busy: false,
        revision: 1,
        fileName,
        sha256: crypto.createHash('sha256').update(req.body).digest('hex'),
        rows: parsed.rows.map(r => ({...r, selected: true})),
        sheets: parsed.sheets,
        blankRows: parsed.blank_rows
      };
      drafts.set(d.id, d);
      res.json(view(d));
    })
  );
  app.post(
    '/api/admin/student-import/review',
    middle,
    wrap((req, res) => {
      const d = draft(req);
      ensureRevision(d, req.body);
      if (db.prepare('SELECT id FROM student_import_runs WHERE id=?').get(d.id))
        D.fail(409, 'Esta importa\u00e7\u00e3o j\u00e1 foi conclu\u00edda.');
      const edits = req.body.rows;
      if (!Array.isArray(edits) || edits.length > d.rows.length) D.fail(400, 'Revis\u00e3o inv\u00e1lida.');
      const lookup = new Map(d.rows.map(r => [r.row_id, r])),
        seen = new Set(),
        changes = [];
      for (const e of edits) {
        if (!e || typeof e.row_id !== 'string' || !lookup.has(e.row_id) || seen.has(e.row_id))
          D.fail(400, 'Linha desconhecida ou repetida na revis\u00e3o.');
        seen.add(e.row_id);
        if (Object.keys(e).some(k => !['row_id', 'period', 'selected'].includes(k)))
          D.fail(400, 'Somente per\u00edodo e sele\u00e7\u00e3o podem ser alterados na pr\u00e9via.');
        if (typeof e.selected !== 'boolean') D.fail(400, 'Sele\u00e7\u00e3o de linha inv\u00e1lida.');
        const p = e.period === null || e.period === '' ? null : D.period(e.period);
        changes.push([lookup.get(e.row_id), {period: p, selected: e.selected}]);
      }
      for (const [r, c] of changes) Object.assign(r, c);
      d.revision++;
      d.expires = Date.now() + TTL;
      res.json(view(d));
    })
  );
  app.post(
    '/api/admin/student-import/confirm',
    middle,
    wrap(async (req, res) => {
      const token = req.body?.token;
      if (typeof token === 'string') {
        const done = db.prepare('SELECT actor_id,report_json FROM student_import_runs WHERE id=?').get(token);
        if (done) {
          if (done.actor_id !== req.user.id) D.fail(404, 'Importa\u00e7\u00e3o n\u00e3o encontrada.');
          // A lost response must not strand the accounts: while this preview is still in memory,
          // the same administrator gets the provisional passwords again. They are never read from the database.
          const live = drafts.get(token),
            credentials = (live && live.owner === req.user.id && live.expires > Date.now() && live.credentials) || [];
          return res.json({
            ...JSON.parse(done.report_json),
            replayed: true,
            credentials,
            credentials_notice: credentials.length
              ? CREDENTIALS_NOTICE
              : 'As senhas provisórias desta importação não estão mais disponíveis. Use Redefinir senha em Usuários para as contas que precisarem.'
          });
        }
      }
      const d = draft(req);
      ensureRevision(d, req.body);
      // One password for the whole batch let any student sign in as a classmate.
      if (req.body.password !== undefined)
        D.fail(
          400,
          'A senha única por lote foi descontinuada. Cada conta recebe uma senha provisória individual; atualize a página e confirme novamente.'
        );
      let initial = validateRows(db, d.rows),
        ready = initial.filter(r => r.status === 'READY');
      d.busy = true;
      // Plain provisional passwords stay in memory with this preview (20 minutes at most):
      // never in the database, the stored report or the audit log.
      const provisional = new Map();
      try {
        // Hash outside the write transaction; two async scrypt jobs at a time leave
        // the event loop and database available while the batch is prepared.
        const hashes = new Map();
        let cursor = 0;
        async function hashJob() {
          for (;;) {
            const i = cursor++;
            if (i >= ready.length) return;
            const secret = provisionalPassword();
            provisional.set(ready[i].row_id, secret);
            hashes.set(ready[i].row_id, await hashPasswordAsync(secret));
          }
        }
        await Promise.all([hashJob(), hashJob()]);
        const actor = currentActor(d.owner);
        if (!stillAdmin(actor) || actor.session_version !== d.ownerVersion)
          D.fail(401, 'A conta administrativa mudou. Nenhum aluno foi criado nesta tentativa.');
        const report = D.transaction(db, () => {
          const checked = validateRows(db, d.rows),
            results = [];
          for (const row of checked) {
            const base = {
              row_id: row.row_id,
              sheet: row.sheet,
              excel_row: row.excel_row,
              name: row.name,
              matricula: row.matricula,
              period: row.period,
              email: row.email
            };
            if (row.status !== 'READY') {
              const ignored = ['EXISTING', 'EXCLUDED', 'DUPLICATE'].includes(row.status);
              results.push({...base, result: ignored ? 'IGNORADO' : 'ERRO', reason: row.message, code: row.status});
              continue;
            }
            if (!hashes.has(row.row_id)) {
              results.push({
                ...base,
                result: 'ERRO',
                reason:
                  'O cadastro mudou durante a prepara\u00e7\u00e3o. Reenvie esta linha para uma nova revis\u00e3o.',
                code: 'CHANGED'
              });
              continue;
            }
            db.exec('SAVEPOINT student_import_row');
            try {
              const created = Accounts.createAccount(
                db,
                {role: 'ALUNO', name: row.name, email: row.email, matricula: row.matricula, period: row.period},
                hashes.get(row.row_id)
              );
              db.exec('RELEASE student_import_row');
              results.push({
                ...base,
                result: 'CRIADO',
                reason: 'Conta de aluno criada. Login pela matr\u00edcula, com senha provis\u00f3ria individual.',
                user_id: created.id,
                student_id: created.student_id,
                code: 'CREATED'
              });
            } catch (e) {
              db.exec('ROLLBACK TO student_import_row');
              db.exec('RELEASE student_import_row');
              if (e.status >= 400 && e.status < 500)
                results.push({
                  ...base,
                  result: e.status === 409 ? 'IGNORADO' : 'ERRO',
                  reason: e.message,
                  code: 'CREATE_REJECTED'
                });
              else throw e;
            }
          }
          const result = {
            ok: true,
            import_id: d.id,
            file_name: d.fileName,
            created_at: new Date().toISOString(),
            summary: {
              total: results.length,
              created: results.filter(r => r.result === 'CRIADO').length,
              ignored: results.filter(r => r.result === 'IGNORADO').length,
              errors: results.filter(r => r.result === 'ERRO').length
            },
            rows: results,
            sheets: d.sheets,
            notes: [
              'As contas importadas possuem somente o perfil Aluno.',
              'O per\u00edodo cadastral n\u00e3o cria matr\u00edculas em disciplinas automaticamente. Use Matr\u00edculas para definir curso, ano, semestre e disciplinas.',
              'E-mails @alunos.suprema.local s\u00e3o identificadores internos; n\u00e3o foram enviados e-mails.'
            ]
          };
          db.prepare(
            'INSERT INTO student_import_runs(id,actor_id,file_name,source_sha256,report_json) VALUES(?,?,?,?,?)'
          ).run(d.id, d.owner, d.fileName, d.sha256, JSON.stringify(result));
          D.audit(db, req.user, 'ADMIN_IMPORTAR_ALUNOS', {import_id: d.id, ...result.summary});
          return result;
        });
        d.result = report;
        d.expires = Date.now() + TTL;
        const credentials = report.rows
          .filter(r => r.code === 'CREATED' && provisional.has(r.row_id))
          .map(r => ({
            row_id: r.row_id,
            name: r.name,
            matricula: r.matricula,
            period: r.period,
            password: provisional.get(r.row_id)
          }));
        d.credentials = credentials;
        res.json({...report, credentials, credentials_notice: credentials.length ? CREDENTIALS_NOTICE : ''});
      } finally {
        d.busy = false;
        provisional.clear();
      }
    })
  );
  app.get(
    '/api/admin/student-import/:id/report',
    middle,
    wrap((req, res) => {
      const r = db.prepare('SELECT actor_id,report_json FROM student_import_runs WHERE id=?').get(req.params.id);
      if (!r || r.actor_id !== req.user.id) D.fail(404, 'Relat\u00f3rio n\u00e3o encontrado.');
      res.json(JSON.parse(r.report_json));
    })
  );
};
module.exports.parseWorkbook = parseWorkbook;
module.exports.internalEmail = internalEmail;
module.exports.validateRows = validateRows;
