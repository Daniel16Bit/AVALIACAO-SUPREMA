'use strict';
const D = require('../../core/domain');
const {minimumGroup, withoutClassFigures} = require('../../core/privacy');
module.exports = function ({app, db, auth, can}) {
  const middle = [
    auth,
    can('results.own'),
    (req, res, next) =>
      req.user.studentId
        ? next()
        : res.status(403).json({error: 'Conta de aluno sem cadastro acad\u00eamico. Procure o administrador.'})
  ];
  app.get('/api/student/assessments', middle, (req, res) => {
    const rows = db
      .prepare(
        "SELECT a.id,a.type,a.year,a.semester,a.period,a.discipline,a.class_name,p.published_at,p.metadata_json FROM published_scores p JOIN assessments a ON a.id=p.assessment_id WHERE p.student_id=? AND p.sent=1 AND a.type IN ('A1','A2','A3') ORDER BY a.year DESC,a.semester DESC,a.discipline,a.type"
      )
      .all(req.user.studentId);
    res.json(
      rows.map(r => {
        let stored = {};
        try {
          stored = JSON.parse(r.metadata_json || '{}').assessment || {};
        } catch {}
        const {metadata_json, ...out} = r;
        return {...out, ...stored, sent: 1};
      })
    );
  });
  app.get(
    '/api/student/assessment/:id',
    (req, res, next) => auth(req, res, () => can('results.own')(req, res, next)),
    (req, res, next) => {
      try {
        if (!req.user.studentId) D.fail(403, 'Cadastro acad\u00eamico n\u00e3o encontrado.');
        const aid = D.id(req.params.id),
          a = db.prepare("SELECT * FROM assessments WHERE id=? AND type IN ('A1','A2','A3')").get(aid);
        if (!a) D.fail(404, 'Resultado n\u00e3o dispon\u00edvel.');
        const row = db
          .prepare(
            'SELECT p.*,p.score_id AS id,s.name,s.matricula FROM published_scores p JOIN students s ON s.id=p.student_id WHERE p.assessment_id=? AND p.student_id=? AND p.sent=1'
          )
          .get(a.id, req.user.studentId);
        if (!row) D.fail(404, 'Resultado n\u00e3o dispon\u00edvel.');
        const all = db
            .prepare('SELECT * FROM published_scores WHERE assessment_id=? AND sent=1 AND metadata_json IS ?')
            .all(a.id, row.metadata_json),
          meta = D.readMetadata(db, a, row),
          stats = D.aggregate(all, meta.questionConfig, meta.instrumentConfig);
        const rank = 1 + all.filter(r => D.present(r.nota_final) && r.nota_final > row.nota_final).length;
        delete stats.rows; // Other students' identities and raw grades never leave this endpoint.
        delete row.metadata_json;
        // In a small group the class figures would reveal a classmate's grade: send none of them.
        const minimum = minimumGroup(),
          enough = stats.count >= minimum,
          shown = enough ? {...stats, rank} : withoutClassFigures(stats);
        res.json({
          assessment: {id: a.id, ...meta.assessment},
          available: true,
          headers: meta.headers,
          questionStats: shown.questionStats,
          row,
          stats: shown,
          classFigures: {available: enough, minimum}
        });
      } catch (e) {
        next(e);
      }
    }
  );
};
