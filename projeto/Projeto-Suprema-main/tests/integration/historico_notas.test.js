'use strict';
// Grade traceability: every changed cell and every published version is kept, and cannot be altered.
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {startApi, tempDir} = require('../fixtures/api');
const {openDatabase} = require('../../apps/api/src/core/database');
const migrations = require('../../apps/api/src/core/migrations');

// One course, one discipline, one teacher with two enrolled students, and the teacher's A1.
async function classroom(t, suffix = '01') {
  const api = await startApi(t);
  const admin = await api.adminSession();
  const post = (route, body) => api.call(route, {method: 'POST', cookie: admin, body, expected: 201});
  const course = (await post('/api/admin/courses', {name: 'Curso Ficticio ' + suffix})).data.id;
  const discipline = (
    await post('/api/admin/disciplines', {course_id: course, name: 'Disciplina Ficticia', period: '3'})
  ).data.id;
  const teacher = await api.createUser(admin, 'PROFESSOR', 'DOC-HIST-' + suffix);
  const ana = await api.createUser(admin, 'ALUNO', 'ALU-HIST-A' + suffix, {name: 'Ana Ficticia', period: '3'});
  const bia = await api.createUser(admin, 'ALUNO', 'ALU-HIST-B' + suffix, {name: 'Bia Ficticia', period: '3'});
  await post('/api/admin/assignments', {
    discipline_id: discipline,
    professor_id: teacher.id,
    year: 2026,
    semester: '2'
  });
  for (const student of [ana, bia])
    await post('/api/admin/enrollments', {
      discipline_id: discipline,
      student_id: student.studentId,
      year: 2026,
      semester: '2'
    });
  const a1 = (await api.call('/api/assessments', {cookie: teacher.cookie, expected: 200})).data.find(
    a => a.type === 'A1'
  );
  const state = async () => (await api.call('/api/assessment/' + a1.id, {cookie: teacher.cookie, expected: 200})).data;
  const rowOf = async student => (await state()).rows.find(r => r.student_id === student.studentId);
  async function save(student, values, expected = 200) {
    const current = await state();
    const row = current.rows.find(r => r.student_id === student.studentId);
    return api.call(`/api/assessment/${a1.id}/scores`, {
      method: 'PUT',
      cookie: teacher.cookie,
      expected,
      body: {revision: current.assessment.revision, rows: [{id: row.id, ...values}]}
    });
  }
  async function configure(key, max = 10) {
    const current = await state();
    await api.call(`/api/assessment/${a1.id}/question-config`, {
      method: 'PUT',
      cookie: teacher.cookie,
      expected: 200,
      body: {revision: current.assessment.revision, field_key: key, area: 'Area Ficticia', max_value: max}
    });
  }
  const publish = async (expected = 200) =>
    api.call(`/api/assessment/${a1.id}/publish`, {
      method: 'POST',
      cookie: teacher.cookie,
      expected,
      body: {revision: (await state()).assessment.revision}
    });
  const changes = () =>
    api.runtime.db.prepare('SELECT * FROM score_changes WHERE assessment_id=? ORDER BY id').all(a1.id);
  const snapshots = () =>
    api.runtime.db.prepare('SELECT * FROM publication_snapshots WHERE assessment_id=? ORDER BY id').all(a1.id);
  return {api, admin, teacher, ana, bia, a1, state, rowOf, save, configure, publish, changes, snapshots};
}

test('cada celula alterada no rascunho guarda valor anterior, novo valor, autor e revisao', async t => {
  const c = await classroom(t);
  await c.save(c.ana, {c1: 2});
  let rows = c.changes();
  assert.equal(rows.length, 1);
  assert.deepEqual(
    {
      field: rows[0].field_key,
      old: rows[0].old_value,
      now: rows[0].new_value,
      actor: rows[0].actor_id,
      student: rows[0].student_id,
      action: rows[0].action
    },
    {field: 'c1', old: null, now: 2, actor: c.teacher.id, student: c.ana.studentId, action: 'SALVAR_RASCUNHO'}
  );
  assert.equal(rows[0].revision, (await c.state()).assessment.revision);

  await c.save(c.ana, {c1: 3, c2: 1.5});
  rows = c.changes().slice(1);
  assert.deepEqual(
    rows.map(r => [r.field_key, r.old_value, r.new_value]),
    [
      ['c1', 2, 3],
      ['c2', null, 1.5]
    ]
  );

  // Saving the same values again changes nothing and records nothing.
  await c.save(c.ana, {c1: 3, c2: 1.5});
  assert.equal(c.changes().length, 3);

  // Clearing a grade is a change too; zero is a grade, not an empty cell.
  await c.save(c.ana, {c2: null});
  await c.save(c.bia, {c1: 0});
  rows = c.changes().slice(3);
  assert.deepEqual(
    rows.map(r => [r.student_id, r.field_key, r.old_value, r.new_value]),
    [
      [c.ana.studentId, 'c2', 1.5, null],
      [c.bia.studentId, 'c1', null, 0]
    ]
  );

  // The derived OSCE subtotal is tracked along with the stations that produce it.
  await c.save(c.ana, {osce1: 1, osce2: 2});
  assert.deepEqual(
    c
      .changes()
      .slice(5)
      .map(r => [r.field_key, r.old_value, r.new_value])
      .sort(),
    [
      ['osce', null, 3],
      ['osce1', null, 1],
      ['osce2', null, 2]
    ]
  );

  // A rejected save records nothing.
  const before = c.changes().length;
  await c.save(c.ana, {c1: -1}, 400);
  assert.equal(c.changes().length, before);
});

test('cada versao publicada e preservada; republicar nao apaga a anterior', async t => {
  const c = await classroom(t);
  await c.configure('c1');
  await c.save(c.ana, {c1: 6});
  await c.save(c.bia, {c1: 8});
  assert.equal((await c.publish()).data.updated, 2);
  let snaps = c.snapshots();
  assert.equal(snaps.length, 2);
  assert.ok(snaps.every(s => s.source === 'PUBLICACAO' && s.publication_event_id !== null && s.metadata_json));
  assert.deepEqual(snaps.map(s => JSON.parse(s.values_json).nota_final).sort(), [6, 8]);

  // Publishing again without changes adds no version.
  assert.equal((await c.publish()).data.updated, 0);
  assert.equal(c.snapshots().length, 2);

  await c.save(c.ana, {c1: 9});
  assert.equal((await c.publish()).data.updated, 1);
  snaps = c.snapshots();
  assert.equal(snaps.length, 3);
  const ofAna = snaps.filter(s => s.student_id === c.ana.studentId).map(s => JSON.parse(s.values_json).c1);
  assert.deepEqual(ofAna, [6, 9], 'a versao anterior continua guardada');
  assert.notEqual(snaps[2].publication_event_id, snaps[0].publication_event_id);
  const current = c.api.runtime.db
    .prepare('SELECT c1,nota_final FROM published_scores WHERE student_id=? AND assessment_id=?')
    .get(c.ana.studentId, c.a1.id);
  assert.deepEqual({...current}, {c1: 9, nota_final: 9});
  const seen = (await c.api.call('/api/student/assessment/' + c.a1.id, {cookie: c.ana.cookie, expected: 200})).data;
  assert.equal(seen.row.nota_final, 9);

  // A publication that is refused keeps the history untouched.
  await c.save(c.ana, {c1: 11});
  await c.publish(400);
  assert.equal(c.snapshots().length, 3);
});

test('o historico nao pode ser alterado nem apagado, nem direto no banco', async t => {
  const c = await classroom(t);
  await c.configure('c1');
  await c.save(c.ana, {c1: 5});
  await c.publish();
  const db = c.api.runtime.db;
  assert.throws(() => db.prepare('UPDATE score_changes SET new_value=10').run(), /nao pode ser modificado/);
  assert.throws(() => db.prepare('DELETE FROM score_changes').run(), /nao pode ser apagado/);
  assert.throws(() => db.prepare("UPDATE publication_snapshots SET values_json='{}'").run(), /nao pode ser modificado/);
  assert.throws(() => db.prepare('DELETE FROM publication_snapshots').run(), /nao pode ser apagado/);
  assert.equal(c.changes()[0].new_value, 5);
  assert.equal(JSON.parse(c.snapshots()[0].values_json).c1, 5);
});

test('consulta do historico: professor ve o da propria avaliacao; administrador ve qualquer uma', async t => {
  const c = await classroom(t);
  await c.configure('c1');
  await c.save(c.ana, {c1: 4});
  await c.publish();
  await c.save(c.ana, {c1: 7});
  await c.publish();

  const own = (await c.api.call(`/api/assessment/${c.a1.id}/score-history`, {cookie: c.teacher.cookie, expected: 200}))
    .data;
  assert.equal(own.changes_truncated, false);
  assert.deepEqual(
    own.changes.map(x => [x.student_name, x.field_label, x.old_value, x.new_value, x.actor_name]),
    [
      ['Ana Ficticia', 'Questão 1', 4, 7, c.teacher.name],
      ['Ana Ficticia', 'Questão 1', null, 4, c.teacher.name]
    ]
  );
  assert.equal(own.publications.length, 2);
  assert.deepEqual(
    own.publications.map(p => [p.source, p.actor_name, p.students.length, p.students[0].nota_final]),
    [
      ['PUBLICACAO', c.teacher.name, 1, 7],
      ['PUBLICACAO', c.teacher.name, 1, 4]
    ]
  );

  const other = await c.api.createUser(c.admin, 'PROFESSOR', 'DOC-HIST-OUTRO');
  await c.api.call(`/api/assessment/${c.a1.id}/score-history`, {cookie: other.cookie, expected: 404});
  await c.api.call(`/api/assessment/${c.a1.id}/score-history`, {cookie: c.ana.cookie, expected: 403});
  await c.api.call(`/api/admin/assessments/${c.a1.id}/history`, {cookie: c.teacher.cookie, expected: 403});

  const full = (await c.api.call(`/api/admin/assessments/${c.a1.id}/history`, {cookie: c.admin, expected: 200})).data;
  assert.equal(full.assessment.professor_name, c.teacher.name);
  assert.equal(full.assessment.type, 'A1');
  assert.equal(full.changes.length, 2);
  assert.equal(full.publications.length, 2);
  await c.api.call('/api/admin/assessments/999999/history', {cookie: c.admin, expected: 404});

  const operations = (
    await c.api.call(`/api/assessment/${c.a1.id}/audit-history`, {cookie: c.teacher.cookie, expected: 200})
  ).data;
  assert.deepEqual(
    operations.map(o => o.action),
    ['PUBLICAR_NOTAS', 'SALVAR_RASCUNHO', 'PUBLICAR_NOTAS', 'SALVAR_RASCUNHO', 'CONFIGURAR_QUESTAO']
  );
  assert.ok(operations.every(o => o.actor_name === c.teacher.name));
});

test('auditoria registra autor, origem e avaliacao em colunas proprias', async t => {
  const c = await classroom(t);
  await c.save(c.ana, {c1: 4});
  const db = c.api.runtime.db;
  const saved = db.prepare("SELECT * FROM audit_logs WHERE action='SALVAR_RASCUNHO' ORDER BY id DESC").get();
  assert.equal(saved.actor_id, c.teacher.id);
  assert.equal(saved.assessment_id, c.a1.id);
  assert.match(saved.origin, /^(127\.0\.0\.1|::1)$/);
  assert.equal(JSON.parse(saved.details).changed_cells, 1);
  const login = db.prepare("SELECT * FROM audit_logs WHERE action='LOGIN' ORDER BY id DESC").get();
  assert.ok(login.actor_id);
  assert.match(login.origin, /^(127\.0\.0\.1|::1)$/);

  const listed = (await c.api.call('/api/admin/audit', {cookie: c.admin, expected: 200})).data;
  const entry = listed.find(l => l.action === 'SALVAR_RASCUNHO');
  assert.equal(entry.actor_name, c.teacher.name);
  assert.match(entry.origin, /^(127\.0\.0\.1|::1)$/);
  // The address is for the audit log only; it is not echoed back to the session.
  assert.ok(!('origin' in (await c.api.call('/api/me', {cookie: c.teacher.cookie, expected: 200})).data));
  assert.ok(!JSON.stringify(listed).includes('password'));
});

test('importacao de planilha tambem registra as celulas alteradas', async t => {
  const c = await classroom(t);
  await c.save(c.ana, {c1: 2});
  const model = await fetch(`${c.api.base}/api/assessment/${c.a1.id}/export?modelo=1`, {
    headers: {cookie: c.teacher.cookie}
  });
  assert.equal(model.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await model.arrayBuffer()));
  const sheet = book.worksheets[0];
  let line = 0;
  sheet.eachRow((row, number) => {
    if (String(row.getCell(2).value) === c.ana.matricula) line = number;
  });
  assert.ok(line > 1, 'aluna localizada no modelo');
  sheet.getRow(line).getCell(3).value = 5; // Questao 1
  sheet.getRow(line).getCell(4).value = 1; // Questao 2
  const form = new FormData();
  form.append('file', new Blob([await book.xlsx.writeBuffer()]), 'notas.xlsx');
  const preview = await fetch(`${c.api.base}/api/assessment/${c.a1.id}/import`, {
    method: 'POST',
    headers: {cookie: c.teacher.cookie},
    body: form
  });
  const previewData = await preview.json();
  assert.equal(preview.status, 200, JSON.stringify(previewData));
  const before = c.changes().length;
  await c.api.call(`/api/assessment/${c.a1.id}/import/confirm`, {
    method: 'POST',
    cookie: c.teacher.cookie,
    body: {token: previewData.token},
    expected: 200
  });
  const rows = c.changes().slice(before);
  assert.deepEqual(
    rows.map(r => [r.action, r.field_key, r.old_value, r.new_value]),
    [
      ['IMPORTAR_EXCEL', 'c1', 2, 5],
      ['IMPORTAR_EXCEL', 'c2', null, 1]
    ]
  );
  assert.ok(rows.every(r => r.actor_id === c.teacher.id && r.student_id === c.ana.studentId));
});

test('conta com historico de notas nao pode ser excluida', async t => {
  const c = await classroom(t);
  // Grade entered and then cleared: no grade remains, but the history does.
  await c.save(c.ana, {c1: 3});
  await c.save(c.ana, {c1: null});
  for (const user of [c.teacher, c.ana]) {
    const impact = (await c.api.call(`/api/admin/users/${user.id}/impact`, {cookie: c.admin, expected: 200})).data;
    assert.equal(impact.can_delete, false);
    assert.ok(impact.counts.history_rows > 0);
    assert.match(impact.reason, /histórico de notas/);
    await c.api.call('/api/admin/users/' + user.id, {
      method: 'DELETE',
      cookie: c.admin,
      expected: 409,
      body: {expected_version: impact.user.session_version, confirmation_email: user.email}
    });
  }
  // A student without any history is still removable.
  const impact = (await c.api.call(`/api/admin/users/${c.bia.id}/impact`, {cookie: c.admin, expected: 200})).data;
  assert.equal(impact.counts.history_rows, 0);
  assert.equal(impact.can_delete, true);
  await c.api.call('/api/admin/users/' + c.bia.id, {
    method: 'DELETE',
    cookie: c.admin,
    expected: 200,
    body: {expected_version: impact.user.session_version, confirmation_email: c.bia.email}
  });
  assert.equal(c.changes().length, 2);
});

test('banco anterior: resultados ja publicados viram a primeira versao do historico', async t => {
  const dir = tempDir(t);
  const before = migrations.MIGRATIONS.filter(m => m.id < '003');
  let storage = openDatabase(dir, {migrations: before});
  const db = storage.db;
  const hash = 'a'.repeat(32) + ':' + 'b'.repeat(128);
  db.prepare(
    "INSERT INTO users(id,name,email,matricula,password_hash,role) VALUES(1,'Docente Legado','docente@teste.invalid','DOC-LEG',?,'PROFESSOR')"
  ).run(hash);
  db.prepare("INSERT INTO students(id,name,matricula,period) VALUES(1,'Aluno Legado','ALU-LEG','3')").run();
  db.prepare(
    "INSERT INTO assessments(id,type,year,semester,period,discipline,class_name,professor_id) VALUES(1,'A1',2026,'2','3','Disciplina Legada','',1)"
  ).run();
  db.prepare(
    'INSERT INTO scores(id,assessment_id,student_id,c1,nota_prova,nota_final,sent) VALUES(1,1,1,7.5,7.5,7.5,1)'
  ).run();
  db.prepare(
    "INSERT INTO published_scores(score_id,assessment_id,student_id,c1,nota_prova,nota_final,sent,published_at) VALUES(1,1,1,7.5,7.5,7.5,1,'2026-10-01 12:00:00')"
  ).run();
  db.prepare("INSERT INTO audit_logs(action,details) VALUES('SALVAR_RASCUNHO',?)").run(
    JSON.stringify({actor_id: 1, assessment_id: 1, rows: 1})
  );
  db.prepare("INSERT INTO audit_logs(action,details) VALUES('LOGIN','nao e json')").run();
  db.close();

  storage = openDatabase(dir);
  try {
    assert.ok(storage.preMigrationBackup, 'copia de seguranca criada antes de migrar');
    const snaps = storage.db.prepare('SELECT * FROM publication_snapshots').all();
    assert.equal(snaps.length, 1);
    assert.deepEqual(
      {source: snaps[0].source, event: snaps[0].publication_event_id, at: snaps[0].created_at},
      {source: 'MIGRACAO', event: null, at: '2026-10-01 12:00:00'}
    );
    assert.deepEqual([JSON.parse(snaps[0].values_json).c1, JSON.parse(snaps[0].values_json).nota_final], [7.5, 7.5]);
    const logs = storage.db
      .prepare('SELECT action,actor_id,assessment_id FROM audit_logs ORDER BY id')
      .all()
      .map(l => ({...l}));
    assert.deepEqual(logs, [
      {action: 'SALVAR_RASCUNHO', actor_id: 1, assessment_id: 1},
      {action: 'LOGIN', actor_id: null, assessment_id: null}
    ]);
    // Original data is untouched.
    assert.deepEqual(
      {...storage.db.prepare('SELECT c1,nota_final,sent,published_at FROM published_scores').get()},
      {c1: 7.5, nota_final: 7.5, sent: 1, published_at: '2026-10-01 12:00:00'}
    );
    assert.equal(storage.db.prepare('SELECT password_hash FROM users').get().password_hash, hash);
  } finally {
    storage.db.close();
  }
});
