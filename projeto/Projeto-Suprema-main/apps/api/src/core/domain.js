'use strict';
const questionKeys = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'me1', 'me2', 'me3', 'me4'];
const stationKeys = ['osce1', 'osce2', 'osce3', 'osce4'];
const scoreKeys = [
  ...questionKeys,
  'q7',
  'q8',
  'q9',
  'q10',
  ...stationKeys,
  'pbl1',
  'pbl2',
  'osce',
  'trabalho',
  'outros_final'
];
// Preserve the existing additive formula. q10 is a legacy field, not part of the total.
const additiveKeys = [...questionKeys, 'q7', 'q8', 'q9', 'pbl1', 'pbl2', 'osce', 'trabalho', 'outros_final'];
// Instruments outside the written exam whose maximum value the teacher may declare.
// "osce" is the value typed without stations; with stations its maximum is their sum.
const instrumentKeys = ['pbl1', 'pbl2', ...stationKeys, 'osce', 'q7', 'q8', 'q9', 'trabalho'];
const defaultHeaders = {
  q7: 'Outros 1',
  q8: 'Outros 2',
  q9: 'Outros 3',
  nota_prova: 'Nota da Prova',
  pbl1: 'SAI 1',
  pbl2: 'SAI 2',
  osce: 'OSCE',
  trabalho: 'Trabalho Rev. Sist.',
  nota_final: 'Nota Final',
  status: 'Status'
};
const present = v => v !== null && v !== undefined && v !== '';
const num = v => (present(v) ? Number(v) : 0);
const round = v => Math.round((v + Number.EPSILON) * 100) / 100;
function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
function text(v, max = 150) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}
function id(v) {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 1) fail(400, 'Identificador inv\u00e1lido.');
  return n;
}
function period(v) {
  const s = text(String(v ?? ''), 30);
  const m = s.match(/^(\d{1,2})(?:\s*[\u00ba\u00b0o]?\s*(?:per[i\u00ed]odo)?)?$/i);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 30) fail(400, 'Informe o per\u00edodo como n\u00famero (ex.: 2).');
  return String(Number(m[1]));
}
function term(body) {
  const year = Number(body.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) fail(400, 'Ano letivo inv\u00e1lido.');
  const semester = String(body.semester);
  if (!['1', '2'].includes(semester)) fail(400, 'Semestre deve ser 1 ou 2.');
  return {year, semester, class_name: text(String(body.class_name || ''), 70)};
}
function calcScore(s) {
  const usedProva = questionKeys.some(k => present(s[k]));
  const hasStations = stationKeys.some(k => present(s[k]));
  const osce = hasStations
    ? round(stationKeys.reduce((a, k) => a + num(s[k]), 0))
    : present(s.osce)
      ? num(s.osce)
      : null;
  const merged = {...s, osce};
  return {
    nota_prova: usedProva ? round(questionKeys.reduce((a, k) => a + num(s[k]), 0)) : null,
    osce,
    nota_final: additiveKeys.some(k => present(merged[k]))
      ? round(additiveKeys.reduce((a, k) => a + num(merged[k]), 0))
      : null
  };
}
function normalizeScore(previous, input) {
  const out = {...previous};
  for (const k of scoreKeys)
    if (Object.hasOwn(input, k)) {
      const v = input[k];
      if (v === null || v === '') {
        out[k] = null;
        continue;
      }
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1000000)
        fail(400, 'Nota inv\u00e1lida em ' + k + '. Use n\u00famero positivo ou campo vazio.');
      out[k] = round(v);
    }
  // Clearing all previously used stations clears the derived OSCE subtotal too.
  if (
    stationKeys.some(k => present(previous[k])) &&
    stationKeys.every(k => Object.hasOwn(input, k)) &&
    !stationKeys.some(k => present(out[k]))
  )
    out.osce = null;
  return {...out, ...calcScore(out)};
}
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
// Actor, client address and assessment are real columns (migration 003); details keeps the rest.
function audit(db, actor, action, details = {}) {
  const assessment = Number.isSafeInteger(details?.assessment_id) ? details.assessment_id : null;
  db.prepare('INSERT INTO audit_logs(action,details,actor_id,origin,assessment_id) VALUES(?,?,?,?,?)').run(
    action,
    JSON.stringify({actor_id: actor?.id || null, ...details}),
    actor?.id || null,
    actor?.origin ? String(actor.origin).slice(0, 64) : null,
    assessment
  );
}
function config(db, assessmentId) {
  const rows = db
    .prepare('SELECT field_key,question_type,area,max_value FROM assessment_question_config WHERE assessment_id=?')
    .all(assessmentId);
  return questionKeys.map((k, i) => ({
    ...{field_key: k, question_type: k.startsWith('me') ? 'FECHADA' : 'DISCURSIVA', area: '', max_value: null},
    ...rows.find(r => r.field_key === k),
    label: k.startsWith('me') ? `M\u00faltipla Escolha ${i - 5}` : `Quest\u00e3o ${i + 1}`
  }));
}
function instrumentConfig(db, assessmentId) {
  const rows = new Map(
    db
      .prepare('SELECT field_key,max_value FROM assessment_instrument_config WHERE assessment_id=?')
      .all(assessmentId)
      .map(r => [r.field_key, r.max_value])
  );
  return instrumentKeys.map(k => ({field_key: k, max_value: rows.get(k) ?? null}));
}
// Mean, use and maximum per instrument. No maximum is ever assumed: without one the
// instrument has no percentage.
function instrumentStats(populated, meansByKey, icfg) {
  const max = new Map((icfg || []).filter(i => i.max_value > 0).map(i => [i.field_key, i.max_value]));
  const used = k => populated.some(r => present(r[k]));
  const usedStations = stationKeys.filter(used);
  // OSCE subtotal: the sum of the stations in use, known only when each of them has a maximum.
  const osceMax = usedStations.length
    ? usedStations.every(k => max.has(k))
      ? round(usedStations.reduce((s, k) => s + max.get(k), 0))
      : null
    : (max.get('osce') ?? null);
  return instrumentKeys.map(k => ({
    field_key: k,
    mean: meansByKey[k] ?? null,
    used: used(k),
    max_value: k === 'osce' ? osceMax : (max.get(k) ?? null)
  }));
}
function headers(db, assessmentId) {
  const out = {...defaultHeaders};
  for (const r of db.prepare('SELECT field_key,label FROM assessment_headers WHERE assessment_id=?').all(assessmentId))
    if (Object.hasOwn(out, r.field_key)) out[r.field_key] = r.label;
  return out;
}
function requireAssessment(db, aid, user) {
  const a = db
    .prepare(
      `SELECT a.* FROM assessments a LEFT JOIN teaching_assignments t ON t.id=a.assignment_id LEFT JOIN academic_disciplines d ON d.id=t.discipline_id LEFT JOIN academic_courses c ON c.id=d.course_id
 WHERE a.id=? AND a.professor_id=? AND (a.assignment_id IS NULL OR (t.active=1 AND d.active=1 AND c.active=1))`
    )
    .get(id(aid), user.id);
  if (!a) fail(404, 'Avalia\u00e7\u00e3o n\u00e3o encontrada para este professor.');
  return a;
}
function roster(db, a) {
  return db
    .prepare(
      `SELECT s.*,st.name,st.matricula FROM scores s JOIN students st ON st.id=s.student_id
 WHERE s.assessment_id=? AND (? IS NULL OR EXISTS(SELECT 1 FROM teaching_assignments t JOIN academic_enrollments e ON e.discipline_id=t.discipline_id AND e.year=t.year AND e.semester=t.semester AND e.class_name=t.class_name AND e.active=1 WHERE t.id=? AND e.student_id=s.student_id)) ORDER BY st.name COLLATE NOCASE,st.id`
    )
    .all(a.id, a.assignment_id, a.assignment_id);
}
function assertRevision(a, revision) {
  if (!Number.isInteger(revision) || revision !== a.revision)
    fail(
      409,
      'Esta avalia\u00e7\u00e3o mudou em outra sess\u00e3o. Atualize a tela antes de salvar; suas altera\u00e7\u00f5es n\u00e3o foram gravadas.'
    );
}
function assertWritable(db, a, kind = 'scores') {
  if (a.locked) fail(423, 'Avalia\u00e7\u00e3o encerrada. Solicite reabertura ao administrador.');
  if (
    db
      .prepare('SELECT value FROM system_controls WHERE key=?')
      .get(kind === 'publish' ? 'pause_publication' : 'pause_scores')?.value
  )
    fail(
      423,
      kind === 'publish'
        ? 'Publica\u00e7\u00f5es pausadas pelo administrador.'
        : 'Lan\u00e7amentos pausados pelo administrador.'
    );
}
function canonicalAcademic(v) {
  const m = String(v ?? '')
    .trim()
    .match(/^([0-9]{1,2})(?:\s|[\u00ba\u00b0o]|$)/);
  return m ? String(Number(m[1])) : String(v ?? '').trim();
}
function syncAssignment(db, assignmentId) {
  const t = db
    .prepare(
      'SELECT t.*,d.name,d.period,d.active discipline_active,c.active course_active FROM teaching_assignments t JOIN academic_disciplines d ON d.id=t.discipline_id JOIN academic_courses c ON c.id=d.course_id WHERE t.id=?'
    )
    .get(assignmentId);
  if (!t || !t.active) return [];
  const result = [];
  for (const type of ['A1', 'A2', 'A3']) {
    let a = db.prepare('SELECT * FROM assessments WHERE assignment_id=? AND type=?').get(t.id, type);
    if (!a) {
      const candidates = db
        .prepare(
          'SELECT * FROM assessments WHERE professor_id=? AND type=? AND year=? AND discipline=? AND class_name=?'
        )
        .all(t.professor_id, type, t.year, t.name, t.class_name)
        .filter(
          x =>
            canonicalAcademic(x.semester) === canonicalAcademic(t.semester) &&
            canonicalAcademic(x.period) === canonicalAcademic(t.period)
        );
      if (candidates.length > 1)
        fail(409, 'Ha mais de uma avaliacao antiga para esta oferta. Revise os registros antes de vincular.');
      a = candidates[0];
      if (a?.assignment_id && a.assignment_id !== t.id)
        fail(409, 'Contexto duplicado. Diferencie o grupo acad\u00eamico desta oferta.');
      if (a) {
        db.prepare('UPDATE assessments SET assignment_id=? WHERE id=?').run(t.id, a.id);
        // Existing rosters are evidence of membership, not an inference from the student's period.
        for (const s of db.prepare('SELECT student_id FROM scores WHERE assessment_id=?').all(a.id))
          db.prepare(
            'INSERT OR IGNORE INTO academic_enrollments(discipline_id,student_id,year,semester,class_name) VALUES(?,?,?,?,?)'
          ).run(t.discipline_id, s.student_id, t.year, t.semester, t.class_name);
      } else {
        const r = db
          .prepare(
            'INSERT INTO assessments(type,year,semester,period,discipline,class_name,professor_id,assignment_id) VALUES(?,?,?,?,?,?,?,?)'
          )
          .run(type, t.year, t.semester, t.period, t.name, t.class_name, t.professor_id, t.id);
        a = {id: Number(r.lastInsertRowid)};
      }
    }
    let added = 0;
    for (const s of db
      .prepare(
        'SELECT student_id FROM academic_enrollments WHERE discipline_id=? AND year=? AND semester=? AND class_name=? AND active=1'
      )
      .all(t.discipline_id, t.year, t.semester, t.class_name)) {
      added += Number(
        db.prepare('INSERT OR IGNORE INTO scores(assessment_id,student_id) VALUES(?,?)').run(a.id, s.student_id).changes
      );
    }
    if (added) db.prepare('UPDATE assessments SET revision=revision+1 WHERE id=?').run(a.id);
    result.push(a.id);
  }
  return result;
}
function syncContext(db, disciplineId, year, semester, className) {
  for (const t of db
    .prepare(
      'SELECT id FROM teaching_assignments WHERE discipline_id=? AND year=? AND semester=? AND class_name=? AND active=1'
    )
    .all(disciplineId, year, semester, className))
    syncAssignment(db, t.id);
}
function publicationMetadata(db, a) {
  const meta = {
    assessment: {
      type: a.type,
      year: a.year,
      semester: a.semester,
      period: a.period,
      discipline: a.discipline,
      class_name: a.class_name
    },
    headers: headers(db, a.id),
    questionConfig: config(db, a.id)
  };
  // Present only when some maximum is declared, so publications made before this existed
  // still compare equal and are not recorded again as changed.
  const instruments = instrumentConfig(db, a.id).filter(i => i.max_value > 0);
  if (instruments.length) meta.instrumentConfig = instruments;
  return meta;
}
function readMetadata(db, a, row) {
  try {
    if (row?.metadata_json) return JSON.parse(row.metadata_json);
  } catch {}
  return publicationMetadata(db, a);
}
function aggregate(rows, qcfg, icfg = []) {
  const populated = rows.filter(r => additiveKeys.some(k => present(r[k])));
  const avg = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const std = a => (a.length < 2 ? 0 : Math.sqrt(a.reduce((s, v) => s + (v - avg(a)) ** 2, 0) / (a.length - 1)));
  const vals = k => populated.filter(r => present(r[k])).map(r => Number(r[k]));
  const provas = vals('nota_prova'),
    finais = vals('nota_final'),
    meansByKey = {};
  for (const k of scoreKeys) meansByKey[k] = avg(vals(k));
  const questionStats = qcfg.map(q => ({
    ...q,
    mean: meansByKey[q.field_key],
    used: populated.some(r => present(r[q.field_key]))
  }));
  const sorted = [...finais].sort((a, b) => a - b),
    m = Math.floor(sorted.length / 2);
  return {
    count: populated.length,
    avgProva: avg(provas),
    stdProva: std(provas),
    avgFinal: avg(finais),
    stdFinal: std(finais),
    median: sorted.length ? (sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2) : null,
    above: finais.filter(v => v > avg(finais)).length,
    below: finais.filter(v => v < avg(finais)).length,
    meansByKey,
    questionStats,
    instrumentStats: instrumentStats(populated, meansByKey, icfg),
    provaMax: questionStats.filter(q => q.used && q.max_value > 0).reduce((s, q) => s + q.max_value, 0),
    rows: populated
  };
}
module.exports = {
  questionKeys,
  stationKeys,
  scoreKeys,
  additiveKeys,
  instrumentKeys,
  instrumentConfig,
  defaultHeaders,
  present,
  num,
  round,
  fail,
  text,
  id,
  period,
  term,
  calcScore,
  normalizeScore,
  transaction,
  audit,
  config,
  headers,
  requireAssessment,
  roster,
  assertRevision,
  assertWritable,
  canonicalAcademic,
  syncAssignment,
  syncContext,
  publicationMetadata,
  readMetadata,
  aggregate
};
