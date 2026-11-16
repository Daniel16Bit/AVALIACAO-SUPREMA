'use strict';
const D = require('../../core/domain');
const H = require('../../core/grade-history');
module.exports = function installAssessmentRoutes({app, db, auth, can}) {
  const middle = [auth, can('assessment.own')];
  const wrap = fn => (req, res, next) => {
    try {
      const p = fn(req, res);
      if (p && p.then) p.catch(next);
    } catch (e) {
      next(e);
    }
  };
  app.get(
    '/api/assessments',
    middle,
    wrap((req, res) => {
      const rows = db
        .prepare(
          `SELECT a.*,d.id discipline_id,c.name course_name FROM assessments a
   LEFT JOIN teaching_assignments t ON t.id=a.assignment_id LEFT JOIN academic_disciplines d ON d.id=t.discipline_id LEFT JOIN academic_courses c ON c.id=d.course_id
   WHERE a.professor_id=? AND a.type IN ('A1','A2','A3') AND (a.assignment_id IS NULL OR (t.active=1 AND d.active=1 AND c.active=1)) ORDER BY a.year DESC,a.semester DESC,a.period,a.discipline,a.type`
        )
        .all(req.user.id);
      res.json(
        rows.map(a => ({
          ...a,
          context_key: a.assignment_id
            ? 'assignment:' + a.assignment_id
            : JSON.stringify([a.year, a.semester, a.period, a.discipline, a.class_name]),
          context_label:
            a.discipline +
            (a.course_name ? ' \u00b7 ' + a.course_name : '') +
            (a.class_name ? ' \u00b7 ' + a.class_name : '')
        }))
      );
    })
  );
  app.get(
    '/api/assessment/:id',
    middle,
    wrap((req, res) => {
      const a = D.requireAssessment(db, req.params.id, req.user),
        rows = D.roster(db, a);
      const pubs = new Map(
        db
          .prepare('SELECT * FROM published_scores WHERE assessment_id=?')
          .all(a.id)
          .map(r => [r.score_id, r])
      );
      for (const r of rows) {
        const p = pubs.get(r.id);
        r.is_published = !!p?.sent;
        r.has_draft =
          (!p && D.additiveKeys.some(k => D.present(r[k]))) ||
          (!!p && D.scoreKeys.some(k => (r[k] ?? null) !== (p[k] ?? null)));
      }
      res.json({
        assessment: a,
        rows,
        headers: D.headers(db, a.id),
        questionConfig: D.config(db, a.id),
        instrumentConfig: D.instrumentConfig(db, a.id)
      });
    })
  );
  app.put(
    '/api/assessment/:id/headers',
    middle,
    wrap((req, res) => {
      const a = D.requireAssessment(db, req.params.id, req.user);
      D.assertWritable(db, a);
      D.assertRevision(a, req.body.revision);
      if (!req.body.headers || typeof req.body.headers !== 'object') D.fail(400, 'Cabe\u00e7alhos inv\u00e1lidos.');
      const entries = Object.entries(req.body.headers);
      if (entries.some(([k, v]) => !Object.hasOwn(D.defaultHeaders, k) || !D.text(v, 80)))
        D.fail(400, 'Cabe\u00e7alho inv\u00e1lido.');
      D.transaction(db, () => {
        for (const [key, label] of entries)
          db.prepare(
            'INSERT INTO assessment_headers(assessment_id,field_key,label) VALUES(?,?,?) ON CONFLICT(assessment_id,field_key) DO UPDATE SET label=excluded.label'
          ).run(a.id, key, D.text(label, 80));
        db.prepare('UPDATE assessments SET revision=revision+1 WHERE id=?').run(a.id);
        D.audit(db, req.user, 'ALTERAR_CABECALHOS', {assessment_id: a.id});
      });
      res.json({ok: true, revision: a.revision + 1, headers: D.headers(db, a.id)});
    })
  );
  app.put(
    '/api/assessment/:id/question-config',
    middle,
    wrap((req, res) => {
      const a = D.requireAssessment(db, req.params.id, req.user);
      D.assertWritable(db, a);
      D.assertRevision(a, req.body.revision);
      const key = req.body.field_key;
      if (!D.questionKeys.includes(key)) D.fail(400, 'Quest\u00e3o inv\u00e1lida.');
      const area = D.text(req.body.area, 160),
        max = req.body.max_value;
      if (max !== null && max !== '' && (typeof max !== 'number' || !Number.isFinite(max) || max <= 0 || max > 1000000))
        D.fail(400, 'Informe o valor m\u00e1ximo positivo, ou deixe vazio no rascunho.');
      D.transaction(db, () => {
        db.prepare(
          'INSERT INTO assessment_question_config(assessment_id,field_key,question_type,area,max_value) VALUES(?,?,?,?,?) ON CONFLICT(assessment_id,field_key) DO UPDATE SET area=excluded.area,max_value=excluded.max_value'
        ).run(a.id, key, key.startsWith('me') ? 'FECHADA' : 'DISCURSIVA', area, max === '' ? null : max);
        db.prepare('UPDATE assessments SET revision=revision+1 WHERE id=?').run(a.id);
        D.audit(db, req.user, 'CONFIGURAR_QUESTAO', {assessment_id: a.id, field: key});
      });
      res.json({ok: true, revision: a.revision + 1, questionConfig: D.config(db, a.id)});
    })
  );
  // Maximum value of an instrument outside the written exam. Optional: it never blocks a draft,
  // and at publication it only refuses grades above a maximum that was declared.
  app.put(
    '/api/assessment/:id/instrument-config',
    middle,
    wrap((req, res) => {
      const a = D.requireAssessment(db, req.params.id, req.user);
      D.assertWritable(db, a);
      D.assertRevision(a, req.body.revision);
      const key = req.body.field_key;
      if (!D.instrumentKeys.includes(key)) D.fail(400, 'Instrumento inválido.');
      const max = req.body.max_value,
        clear = max === null || max === '';
      if (!clear && (typeof max !== 'number' || !Number.isFinite(max) || max <= 0 || max > 1000000))
        D.fail(400, 'Informe o valor máximo positivo, ou deixe vazio.');
      D.transaction(db, () => {
        if (clear)
          db.prepare('DELETE FROM assessment_instrument_config WHERE assessment_id=? AND field_key=?').run(a.id, key);
        else
          db.prepare(
            'INSERT INTO assessment_instrument_config(assessment_id,field_key,max_value) VALUES(?,?,?) ON CONFLICT(assessment_id,field_key) DO UPDATE SET max_value=excluded.max_value'
          ).run(a.id, key, max);
        db.prepare('UPDATE assessments SET revision=revision+1 WHERE id=?').run(a.id);
        D.audit(db, req.user, 'CONFIGURAR_INSTRUMENTO', {assessment_id: a.id, field: key});
      });
      res.json({ok: true, revision: a.revision + 1, instrumentConfig: D.instrumentConfig(db, a.id)});
    })
  );
  app.put(
    '/api/assessment/:id/scores',
    middle,
    wrap((req, res) => {
      const a = D.requireAssessment(db, req.params.id, req.user);
      D.assertWritable(db, a);
      D.assertRevision(a, req.body.revision);
      if (!Array.isArray(req.body.rows) || req.body.rows.length > 5000) D.fail(400, 'Lista de notas inv\u00e1lida.');
      const allowed = new Map(D.roster(db, a).map(r => [r.id, r])),
        seen = new Set(),
        rows = [];
      for (const input of req.body.rows) {
        const rid = D.id(input.id);
        if (!allowed.has(rid) || seen.has(rid)) D.fail(400, 'Aluno fora desta avalia\u00e7\u00e3o ou linha duplicada.');
        seen.add(rid);
        rows.push(D.normalizeScore(allowed.get(rid), input));
      }
      const keys = [...D.scoreKeys, 'nota_prova', 'nota_final'],
        up = db.prepare(`UPDATE scores SET ${keys.map(k => k + '=?').join(',')} WHERE id=? AND assessment_id=?`);
      D.transaction(db, () => {
        for (const r of rows) up.run(...keys.map(k => r[k] ?? null), r.id, a.id);
        db.prepare('UPDATE assessments SET revision=revision+1 WHERE id=?').run(a.id);
        // Every cell that changed keeps its previous value, author and moment.
        const changed = H.recordScoreChanges(db, {
          assessmentId: a.id,
          actorId: req.user.id,
          action: 'SALVAR_RASCUNHO',
          revision: a.revision + 1,
          pairs: rows.map(r => [allowed.get(r.id), r])
        });
        D.audit(db, req.user, 'SALVAR_RASCUNHO', {assessment_id: a.id, rows: rows.length, changed_cells: changed});
      });
      res.json({ok: true, draft: true, revision: a.revision + 1});
    })
  );
  app.post(
    '/api/assessment/:id/publish',
    middle,
    wrap((req, res) => {
      const a = D.requireAssessment(db, req.params.id, req.user);
      D.assertWritable(db, a, 'publish');
      D.assertRevision(a, req.body.revision);
      const roster = D.roster(db, a),
        rows = roster.filter(r => D.additiveKeys.some(k => D.present(r[k])));
      if (!rows.length) D.fail(400, 'N\u00e3o h\u00e1 notas preenchidas para publicar.');
      const config = D.config(db, a.id),
        missing = [];
      for (const q of config) {
        const used = rows.some(r => D.present(r[q.field_key]));
        if (!used) continue;
        if (!String(q.area || '').trim()) missing.push(q.label + ' sem \u00e1rea de conhecimento');
        if (!(q.max_value > 0)) missing.push(q.label + ' sem valor m\u00e1ximo');
        else if (rows.some(r => D.present(r[q.field_key]) && r[q.field_key] > q.max_value + 1e-8))
          missing.push(q.label + ' com nota acima do valor m\u00e1ximo');
      }
      // Instruments: a declared maximum is enforced; an undeclared one blocks nothing.
      const names = D.headers(db, a.id),
        instrumentLabel = k =>
          D.stationKeys.includes(k) ? 'OSCE \u2014 Esta\u00e7\u00e3o ' + k.slice(4) : names[k] || k;
      for (const i of D.instrumentConfig(db, a.id)) {
        if (!(i.max_value > 0)) continue;
        // The maximum of "osce" applies to a value typed without stations; with stations each one has its own.
        const value = r => (i.field_key === 'osce' && D.stationKeys.some(k => D.present(r[k])) ? null : r[i.field_key]);
        if (rows.some(r => D.present(value(r)) && value(r) > i.max_value + 1e-8))
          missing.push(instrumentLabel(i.field_key) + ' com nota acima do valor m\u00e1ximo');
      }
      if (missing.length) D.fail(400, 'Publica\u00e7\u00e3o bloqueada: ' + missing.join('; ') + '.');
      for (const r of roster)
        if (!rows.includes(r) && db.prepare('SELECT 1 FROM published_scores WHERE score_id=? AND sent=1').get(r.id))
          D.fail(
            400,
            'Existe resultado publicado que ficou totalmente vazio no rascunho. Revise antes de publicar; o resultado anterior foi preservado.'
          );
      const keys = [...D.scoreKeys, 'a1', 'a2', 'a3_de_a1', 'a3_de_a2', 'nota_prova', 'nota_final'];
      const metadata = JSON.stringify(D.publicationMetadata(db, a));
      const up =
        db.prepare(`INSERT INTO published_scores(score_id,assessment_id,student_id,${keys.join(',')},sent,published_at,metadata_json)
   VALUES(${Array(3 + keys.length)
     .fill('?')
     .join(',')},1,CURRENT_TIMESTAMP,?) ON CONFLICT(score_id) DO UPDATE SET
   ${keys.map(k => k + '=excluded.' + k).join(',')},sent=1,published_at=CURRENT_TIMESTAMP,metadata_json=excluded.metadata_json`);
      const previous = db.prepare('SELECT * FROM published_scores WHERE score_id=?');
      let updated = 0;
      D.transaction(db, () => {
        const changedRows = [];
        for (const r of rows) {
          const prior = previous.get(r.id);
          if (
            !prior ||
            !prior.sent ||
            prior.metadata_json !== metadata ||
            keys.some(k => (prior[k] ?? null) !== (r[k] ?? null))
          )
            changedRows.push(r);
          db.prepare('UPDATE scores SET sent=1 WHERE id=?').run(r.id);
        }
        updated = changedRows.length;
        db.prepare('UPDATE assessments SET published_revision=revision WHERE id=?').run(a.id);
        if (updated) {
          const eventId = Number(
            db
              .prepare('INSERT INTO publication_events(assessment_id,actor_id,revision,student_count) VALUES(?,?,?,?)')
              .run(a.id, req.user.id, a.revision, updated).lastInsertRowid
          );
          // published_scores holds the current version; publication_snapshots keeps every version, forever.
          for (const r of changedRows) {
            up.run(r.id, a.id, r.student_id, ...keys.map(k => r[k] ?? null), metadata);
            H.recordPublication(db, {eventId, assessmentId: a.id, row: r, metadata});
          }
          D.audit(db, req.user, 'PUBLICAR_NOTAS', {assessment_id: a.id, updated});
        }
      });
      res.json({ok: true, updated, published: true});
    })
  );
  app.post(
    '/api/assessment/:id/send-one',
    middle,
    wrap((req, res) => {
      const a = D.requireAssessment(db, req.params.id, req.user);
      D.assertWritable(db, a, 'publish');
      const r = db
        .prepare('SELECT score_id FROM published_scores WHERE score_id=? AND assessment_id=? AND sent=1')
        .get(D.id(req.body.scoreId), a.id);
      if (!r) D.fail(409, 'Publique a avalia\u00e7\u00e3o primeiro. O envio n\u00e3o libera rascunhos.');
      res.json({ok: true, message: 'Resultado j\u00e1 dispon\u00edvel ao aluno pela publica\u00e7\u00e3o.'});
    })
  );
  app.post(
    '/api/assessment/:id/send-all',
    middle,
    wrap((req, res) => {
      const a = D.requireAssessment(db, req.params.id, req.user);
      D.assertWritable(db, a, 'publish');
      D.assertRevision(a, req.body.revision);
      if (
        a.revision !== a.published_revision ||
        !db.prepare('SELECT 1 FROM published_scores WHERE assessment_id=? AND sent=1').get(a.id)
      )
        D.fail(409, 'Publique as altera\u00e7\u00f5es antes de encerrar.');
      D.transaction(db, () => {
        db.prepare('UPDATE assessments SET locked=1 WHERE id=?').run(a.id);
        D.audit(db, req.user, 'ENCERRAR_AVALIACAO', {assessment_id: a.id});
      });
      res.json({ok: true});
    })
  );
  app.get(
    '/api/assessment/:id/audit-history',
    middle,
    wrap((req, res) => {
      const a = D.requireAssessment(db, req.params.id, req.user);
      // Indexed by assessment (migration 003): old operations no longer drop out as the log grows.
      res.json(
        db
          .prepare(
            "SELECT l.created_at,l.action,u.name actor_name FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE l.assessment_id=? AND l.action IN ('SALVAR_RASCUNHO','IMPORTAR_EXCEL','PUBLICAR_NOTAS','ENCERRAR_AVALIACAO','CONFIGURAR_QUESTAO','CONFIGURAR_INSTRUMENTO','ALTERAR_CABECALHOS','ADMIN_BLOQUEIO_AVALIACAO') ORDER BY l.id DESC LIMIT 200"
          )
          .all(a.id)
      );
    })
  );
  app.get(
    '/api/assessment/:id/score-history',
    middle,
    wrap((req, res) => {
      const a = D.requireAssessment(db, req.params.id, req.user);
      res.json(H.assessmentHistory(db, a.id));
    })
  );
  app.get(
    '/api/assessment/:id/stats',
    middle,
    wrap((req, res) => {
      const a = D.requireAssessment(db, req.params.id, req.user),
        rows = db
          .prepare(
            'SELECT p.*,p.score_id AS id,s.name,s.matricula FROM published_scores p JOIN students s ON s.id=p.student_id WHERE p.assessment_id=? AND p.sent=1 ORDER BY s.name COLLATE NOCASE'
          )
          .all(a.id);
      const meta = D.readMetadata(db, a, rows[0]);
      res.json({...D.aggregate(rows, meta.questionConfig, meta.instrumentConfig), headers: meta.headers});
    })
  );
};
