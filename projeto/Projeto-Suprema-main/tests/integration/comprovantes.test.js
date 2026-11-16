'use strict';
// Receipts of student actions (stage 7): issued together with the action, downloadable as a
// PDF by the student, verified by code by the administrator and the CSTI, invisible to
// teachers and to the coordination, and never carrying what was answered. Synthetic data.
const test = require('node:test');
const assert = require('node:assert/strict');
const {startApi} = require('../fixtures/api');
const {createClass} = require('../fixtures/turma');
const Receipts = require('../../apps/api/src/core/receipts');

async function setup(t) {
  const api = await startApi(t);
  const room = await createClass(api, {students: 2, tag: 'CMP'});
  const csti = await api.createUser(room.admin, 'CSTI', 'CSTI-1');
  const coord = await api.createUser(room.admin, 'COORDENACAO', 'COORD-1');
  const call = (who, method, route, body, expected) => api.call(route, {method, cookie: who.cookie, body, expected});
  // One released teacher evaluation, the first student action that issues a receipt.
  const id = (
    await call(
      csti,
      'POST',
      '/api/teacher-eval/campaigns',
      {year: 2026, semester: '2', round_name: 'Fim do semestre', period: '3'},
      201
    )
  ).data.id;
  const d = (await call(csti, 'GET', '/api/teacher-eval/campaigns/' + id, undefined, 200)).data;
  await call(
    csti,
    'PUT',
    '/api/teacher-eval/campaigns/' + id,
    {...d.campaign, questions: [{text: 'Foi pontual?'}], assignment_ids: d.assignment_ids},
    200
  );
  await call(csti, 'POST', `/api/teacher-eval/campaigns/${id}/release`, {revision: d.campaign.revision + 1}, 200);
  async function answer(student, value = 'SIM', comment = 'Comentario secreto ficticio', expected = 201) {
    const target = (await call(student, 'GET', '/api/teacher-eval/pending', undefined, 200)).data[0];
    const form = (await call(student, 'GET', '/api/teacher-eval/targets/' + target.id, undefined)).data;
    const questions = form.questions || [{id: 1}];
    return call(
      student,
      'POST',
      `/api/teacher-eval/targets/${target.id}/answers`,
      {answers: questions.map(q => ({question_id: q.id, value, comment}))},
      expected
    );
  }
  const download = async (who, code) => {
    const response = await fetch(`${api.base}/api/receipts/${code}/pdf`, {headers: {cookie: who.cookie}});
    return {
      status: response.status,
      type: response.headers.get('content-type'),
      disposition: response.headers.get('content-disposition'),
      body: Buffer.from(await response.arrayBuffer())
    };
  };
  return {api, db: api.runtime.db, room, csti, coord, admin: {cookie: room.admin}, call, answer, download};
}

test('codigo de verificacao: formato, aleatoriedade e tolerancia a digitacao', () => {
  const codes = new Set(Array.from({length: 200}, () => Receipts.newCode()));
  assert.equal(codes.size, 200);
  for (const code of codes) assert.match(code, /^AS(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
  const [code] = codes,
    bare = code.replace(/-/g, '');
  for (const typed of [code.toLowerCase(), bare, ' ' + bare.slice(2) + ' ', code.replace(/-/g, ' ')])
    assert.equal(Receipts.normalizeCode(typed), code, typed);
  // Letters that look like digits are read as the digits; anything else is not a code.
  assert.equal(Receipts.normalizeCode('AS-OOOO-IIII-LLLL-0000'), 'AS-0000-1111-1111-0000');
  for (const invalid of ['', null, 'AS-1234', 'AS-UUUU-0000-0000-0000', code + 'X'])
    assert.equal(Receipts.normalizeCode(invalid), null, String(invalid));
});

test('o envio do aluno gera um comprovante, que ele lista e baixa em PDF', async t => {
  const s = await setup(t),
    [student, other] = s.room.students;
  const sent = await s.answer(student);
  const code = sent.data.receipt.code;
  assert.match(code, /^AS(-[0-9A-Z]{4}){4}$/);
  const mine = (await s.call(student, 'GET', '/api/receipts/mine', undefined, 200)).data;
  assert.deepEqual(
    mine.map(r => [r.code, r.kind, r.title]),
    [[code, 'AVALIACAO_DOCENTE', 'Avaliação Docente respondida']]
  );
  assert.match(mine[0].detail, /Fim do semestre · 2026\.2 · 3º período · Disciplina Ficticia CMP · /);
  assert.deepEqual((await s.call(other, 'GET', '/api/receipts/mine', undefined, 200)).data, []);

  const file = await s.download(student, code);
  assert.deepEqual([file.status, file.type], [200, 'application/pdf']);
  assert.equal(file.disposition, `attachment; filename="comprovante-${code}.pdf"`);
  const text = file.body.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  for (const expected of [code, student.matricula, 'Comprovante', 'Avaliação Docente respondida'])
    assert.ok(text.includes(expected), expected);
  // A well-formed file: every offset of the cross-reference table points at its object.
  const table = text.indexOf('\nxref\n') + 1;
  const offsets = [...text.slice(table).matchAll(/^(\d{10}) 00000 n /gm)].map(m => Number(m[1]));
  assert.equal(offsets.length, 6);
  offsets.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), 'objeto ' + (i + 1)));
  assert.equal(Number(text.match(/startxref\n(\d+)/)[1]), table);
});

test('o comprovante prova a participacao e nunca o que foi respondido', async t => {
  const s = await setup(t),
    [student] = s.room.students;
  const code = (await s.answer(student, 'NAO', 'Comentario secreto ficticio')).data.receipt.code;
  const row = s.db.prepare('SELECT * FROM receipts WHERE code=?').get(code);
  assert.deepEqual(Object.keys(row), [
    'id',
    'code',
    'student_id',
    'user_id',
    'kind',
    'title',
    'detail',
    'origin',
    'issued_at'
  ]);
  const everything = JSON.stringify(row) + (await s.download(student, code)).body.toString('latin1');
  assert.doesNotMatch(everything, /Comentario secreto|NAO|"value"/);
  // Nothing in the receipt points at the stored answer, and the answer still has no student.
  const submission = s.db.prepare('SELECT * FROM anon_submissions').get();
  assert.ok(!JSON.stringify(row).includes(submission.id));
  assert.deepEqual(Object.keys(submission), ['id', 'form_id', 'subject_key', 'answered_on']);
});

test('quem ve comprovantes: o proprio aluno, o Administrador e o CSTI; professor e Coordenacao nao', async t => {
  const s = await setup(t),
    [student, other] = s.room.students;
  const code = (await s.answer(student)).data.receipt.code;
  // Another student, the teacher and the coordination get the same answer as for a code that does not exist.
  for (const who of [other, s.room.teacher, s.coord]) assert.equal((await s.download(who, code)).status, 404);
  assert.equal((await s.download(student, 'AS-0000-0000-0000-0000')).status, 404);
  for (const who of [s.admin, s.csti]) assert.equal((await s.download(who, code)).status, 200);
  for (const who of [student, s.room.teacher, s.coord]) {
    await s.call(who, 'POST', '/api/receipts/verify', {code}, 403);
    await s.call(who, 'POST', '/api/receipts/search', {search: ''}, 403);
  }
  for (const who of [s.room.teacher, s.coord, s.admin, s.csti])
    await s.call(who, 'GET', '/api/receipts/mine', undefined, 403);
  assert.equal((await s.api.call('/api/receipts/mine')).status, 401);
  const granted = s.db
    .prepare("SELECT role,permission FROM role_permissions WHERE permission LIKE 'receipts.%' ORDER BY role")
    .all();
  assert.deepEqual(
    granted.map(g => g.role + ':' + g.permission),
    ['ADMIN:receipts.verify', 'ALUNO:receipts.own', 'CSTI:receipts.verify']
  );
});

test('verificacao pelo codigo: vale o registro do sistema, nao o arquivo', async t => {
  const s = await setup(t),
    [student, other] = s.room.students;
  const code = (await s.answer(student)).data.receipt.code;
  await s.answer(other);
  for (const who of [s.admin, s.csti]) {
    const checked = (
      await s.call(who, 'POST', '/api/receipts/verify', {code: code.toLowerCase().replace(/-/g, ' ')}, 200)
    ).data;
    assert.equal(checked.valid, true);
    assert.deepEqual(
      [checked.receipt.code, checked.receipt.student_matricula, checked.receipt.student_name, checked.receipt.title],
      [code, student.matricula, student.name, 'Avaliação Docente respondida']
    );
  }
  // A made-up code, or one digit changed, matches nothing.
  const forged = code.slice(0, -1) + (code.endsWith('0') ? '1' : '0');
  for (const wrong of [forged, 'AS-0000-0000-0000-0000', 'qualquer coisa', ''])
    assert.deepEqual((await s.call(s.csti, 'POST', '/api/receipts/verify', {code: wrong}, 200)).data, {valid: false});
  const found = (await s.call(s.csti, 'POST', '/api/receipts/search', {search: student.matricula}, 200)).data;
  assert.deepEqual(
    found.map(r => r.code),
    [code]
  );
  assert.equal((await s.call(s.admin, 'POST', '/api/receipts/search', {search: ''}, 200)).data.length, 2);
  const audit = s.db
    .prepare("SELECT details FROM audit_logs WHERE action='COMPROVANTE_VERIFICAR'")
    .all()
    .map(r => JSON.parse(r.details).valid);
  assert.deepEqual(audit, [true, true, false, false, false, false]);
});

test('comprovante so existe se a acao foi registrada, e nao pode ser alterado nem apagado', async t => {
  const s = await setup(t),
    [student] = s.room.students;
  await s.answer(student);
  await s.answer(student, 'SIM', '', 409); // second attempt is refused: no second receipt
  assert.equal(s.db.prepare('SELECT count(*) n FROM receipts').get().n, 1);
  assert.throws(() => s.db.prepare("UPDATE receipts SET title='Outra coisa'").run(), /nao podem ser alterados/);
  assert.throws(() => s.db.prepare('DELETE FROM receipts').run(), /nao podem ser apagados/);
});
