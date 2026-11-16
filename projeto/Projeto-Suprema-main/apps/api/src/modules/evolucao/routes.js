'use strict';
module.exports = function installEvolution({app, db, auth, can, hasPermission}) {
  app.get('/api/evolution', auth, can('evolution.all', 'evolution.own'), (req, res, next) => {
    try {
      const u = req.user;
      // 'evolution.all' sees every published assessment; 'evolution.own' only the holder's.
      const isAdmin = hasPermission(u.role, 'evolution.all');
      const limit = 300;
      const rows = db
        .prepare(
          `SELECT a.id,a.type,a.year,a.semester,a.period,a.discipline,a.class_name,a.professor_id,
    u.name professor_name,p.student_id,s.matricula,s.name student_name,p.nota_prova,p.nota_final,p.metadata_json
    FROM assessments a JOIN users u ON u.id=a.professor_id
    JOIN published_scores p ON p.assessment_id=a.id AND p.sent=1
    JOIN students s ON s.id=p.student_id
    WHERE a.type IN ('A1','A2','A3') ${isAdmin ? '' : 'AND a.professor_id=?'}
    ORDER BY a.year DESC,a.semester DESC,a.id DESC,s.name COLLATE NOCASE
    LIMIT 30000`
        )
        .all(...(isAdmin ? [] : [u.id]));
      const acc = new Map();
      for (const row of rows) {
        let item = acc.get(row.id);
        if (!item) {
          item = {
            id: row.id,
            type: row.type,
            year: row.year,
            semester: row.semester,
            period: row.period,
            discipline: row.discipline,
            class_name: row.class_name,
            professor_id: row.professor_id,
            professor_name: row.professor_name,
            count: 0,
            sum: 0,
            withValue: 0,
            provaMax: null,
            cutCount: 0,
            belowCount: 0,
            students: []
          };
          acc.set(row.id, item);
        }
        let max = null;
        try {
          const meta = JSON.parse(row.metadata_json || '{}');
          const qs = meta.questionConfig || [];
          const used = qs.filter(q => Number(q.max_value) > 0);
          const total = used.reduce((a, q) => a + (Number(q.max_value) || 0), 0);
          if (total > 0) max = total;
        } catch {}
        const score = row.nota_prova === null ? null : Number(row.nota_prova);
        // Never compare raw A1/A2/A3 numbers if a published maximum cannot be verified.
        const pct = score !== null && max > 0 ? Math.round((score / max) * 10000) / 100 : null;
        if (max > 0 && item.provaMax === null) item.provaMax = max;
        if (pct !== null) {
          item.sum += pct;
          item.withValue++;
          if (pct < 60) item.belowCount++;
          else item.cutCount++;
        }
        item.count++;
        item.students.push({
          student_id: row.student_id,
          matricula: row.matricula,
          name: row.student_name,
          percent: pct,
          nota_prova: score,
          nota_final: row.nota_final
        });
      }
      const assessments = [...acc.values()].slice(0, limit).map(({sum, ...a}) => ({
        ...a,
        meanPercent: a.withValue ? Math.round((sum / a.withValue) * 100) / 100 : null,
        students: a.students.slice(0, 1000)
      }));
      res.json({
        assessments,
        partial: rows.length >= 30000,
        description: 'Somente notas publicadas; percentual calculado a partir do maximo configurado na publicacao.'
      });
    } catch (e) {
      next(e);
    }
  });
};
