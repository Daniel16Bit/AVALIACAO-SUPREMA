'use strict';
// OSCE module and the forms core (stage 5): permissions per profile, draft -> released ->
// closed, one answer per student and station, voiding, results, audit trail.
// The grades are the ones of the institution's spreadsheet (core/calculo/osce.js, checked against
// the formulas of the sheet in calculo_osce.test.js). Synthetic data.
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {startApi} = require('../fixtures/api');
const manifest = require('../../apps/api/src/modules');

async function setup(t, options) {
  const api = await startApi(t, options ? {options} : {});
  const admin = await api.adminSession();
  const nucleo = await api.createUser(admin, 'NUCLEO_AVALIACAO', 'NUC-1');
  const station = await api.createUser(admin, 'OPERACIONAL', 'AMB-1');
  const students = [];
  for (const n of [1, 2, 3]) students.push(await api.createUser(admin, 'ALUNO', 'ALU-P5-' + n, {period: '5'}));
  const other = await api.createUser(admin, 'ALUNO', 'ALU-P6-1', {period: '6'});
  const call = (who, method, route, body, expected) =>
    api.call('/api/osce' + route, {method, cookie: who.cookie, body, expected});
  const header = {year: 2026, semester: '2', round: 1, period: '5'};
  async function draft(extra = {}) {
    const id = (await call(nucleo, 'POST', '/events', {...header, ...extra}, 201)).data.id;
    return {id, detail: async () => (await call(nucleo, 'GET', '/events/' + id, undefined, 200)).data};
  }
  // Saves the stations (by default two, with one ordinary question each) and releases the event.
  const TWO = [
    {name: 'Anamnese', questions: [{text: 'Lavou as maos?'}]},
    {name: 'Exame fisico', questions: [{text: 'Explicou o procedimento?'}]}
  ];
  async function released(extra = {}, stationList = TWO, change = {}) {
    const event = await draft(extra),
      d = await event.detail();
    await call(
      nucleo,
      'PUT',
      '/events/' + event.id,
      {...d.event, ...change, stations: stationList, student_ids: d.student_ids},
      200
    );
    await call(nucleo, 'POST', `/events/${event.id}/release`, {revision: (await event.detail()).event.revision}, 200);
    const stations = (await call(station, 'GET', '/respond/events', undefined, 200)).data.find(
      e => e.id === event.id
    ).stations;
    return {...event, stations};
  }
  const form = async stationId => (await call(station, 'GET', '/respond/stations/' + stationId, undefined, 200)).data;
  const answer = async (stationId, student, values, expected = 201) => {
    const questions = (await form(stationId)).questions;
    return call(
      station,
      'POST',
      `/respond/stations/${stationId}/submissions`,
      {
        student_id: student.studentId,
        answers: questions.map((q, i) => ({
          question_id: q.id,
          value: values[i],
          comment: i === 0 ? 'Comentario ficticio' : ''
        }))
      },
      expected
    );
  };
  return {api, admin, nucleo, station, students, other, call, header, draft, released, form, answer};
}

test('permissoes: cada perfil alcanca so a sua parte do OSCE', async t => {
  const s = await setup(t);
  const event = await s.released();
  const teacher = await s.api.createUser(s.admin, 'PROFESSOR', 'PROF-OSCE');
  const csti = await s.api.createUser(s.admin, 'CSTI', 'CSTI-1');
  const stationId = event.stations[0].id;
  const routes = [
    ['GET', '/events'],
    ['POST', '/events'],
    ['GET', '/events/' + event.id],
    ['GET', `/events/${event.id}/results`],
    ['GET', `/events/${event.id}/results/export`],
    ['GET', '/respond/events'],
    ['GET', '/respond/stations/' + stationId],
    ['POST', `/respond/stations/${stationId}/submissions`]
  ];
  for (const who of [{cookie: s.admin}, teacher, s.students[0], csti]) {
    for (const [method, route] of routes) await s.call(who, method, route, method === 'GET' ? undefined : {}, 403);
  }
  for (const [method, route] of routes.slice(0, 5))
    await s.call(s.station, method, route, method === 'GET' ? undefined : {}, 403);
  for (const [method, route] of routes.slice(5))
    await s.call(s.nucleo, method, route, method === 'GET' ? undefined : {}, 403);
  assert.equal((await s.api.call('/api/osce/events')).status, 401);
  const granted = s.api.runtime.db
    .prepare("SELECT role,permission FROM role_permissions WHERE permission LIKE 'osce.%' ORDER BY role,permission")
    .all();
  assert.deepEqual(
    granted.map(g => g.role + ':' + g.permission),
    ['NUCLEO_AVALIACAO:osce.manage', 'NUCLEO_AVALIACAO:osce.results', 'OPERACIONAL:osce.respond']
  );
});

test('novo OSCE nasce em rascunho com quatro estacoes, pergunta-chave e os alunos do periodo', async t => {
  const s = await setup(t);
  const event = await s.draft(),
    d = await event.detail();
  assert.equal(d.event.status, 'RASCUNHO');
  assert.equal(d.event.title, 'OSCE 1 · 2026.2 · 5º período');
  assert.deepEqual(
    d.stations.map(st => [st.name, st.questions.length, st.total_questions]),
    [1, 2, 3, 4].map(n => ['Estação ' + n, 0, 1])
  );
  assert.equal(d.event.key_question, true);
  // Only the active students registered in the period; the one from period 6 is not a candidate.
  assert.deepEqual(d.candidates.map(c => c.matricula).sort(), ['ALU-P5-1', 'ALU-P5-2', 'ALU-P5-3']);
  assert.equal(d.student_ids.length, 3);
  await s.call(s.nucleo, 'POST', '/events', s.header, 409);
  for (const invalid of [{round: 0}, {round: 'a'}, {period: 'x'}, {semester: '3'}, {year: 1500}])
    await s.call(s.nucleo, 'POST', '/events', {...s.header, ...invalid}, 400);
});

test('rascunho: salva estacoes, perguntas e lista de alunos; conflito de revisao e entradas invalidas', async t => {
  const s = await setup(t);
  const event = await s.draft(),
    d = await event.detail();
  const body = {
    ...d.event,
    key_question: false,
    stations: [{name: 'Unica', questions: [{text: 'Primeira?'}, {text: 'Segunda?'}]}],
    student_ids: [s.students[0].studentId, s.other.studentId]
  };
  await s.call(s.nucleo, 'PUT', '/events/' + event.id, body, 200);
  const saved = await event.detail();
  assert.deepEqual(
    saved.stations.map(st => [st.name, st.questions.map(q => q.text), st.total_questions]),
    [['Unica', ['Primeira?', 'Segunda?'], 2]]
  );
  assert.equal(saved.event.key_question, false);
  // A student from another period can be added by hand and stays listed as a candidate.
  assert.deepEqual(saved.student_ids.sort(), [s.students[0].studentId, s.other.studentId].sort());
  assert.ok(saved.candidates.some(c => c.matricula === 'ALU-P6-1'));
  await s.call(s.nucleo, 'PUT', '/events/' + event.id, body, 409); // stale revision
  const fresh = {...body, revision: saved.event.revision};
  await s.call(s.nucleo, 'PUT', '/events/' + event.id, {...fresh, stations: []}, 400);
  await s.call(
    s.nucleo,
    'PUT',
    '/events/' + event.id,
    {...fresh, stations: [{name: 'X', questions: [{text: '  '}]}]},
    400
  );
  await s.call(s.nucleo, 'PUT', '/events/' + event.id, {...fresh, student_ids: [999999]}, 400);
  assert.deepEqual(
    (await event.detail()).stations.map(st => st.name),
    ['Unica']
  );
});

test('liberacao exige perguntas e alunos; depois de liberado a estrutura fica travada', async t => {
  const s = await setup(t);
  const event = await s.draft(),
    d = await event.detail();
  await s.call(
    s.nucleo,
    'PUT',
    '/events/' + event.id,
    {...d.event, key_question: false, stations: [{name: 'Vazia', questions: []}], student_ids: []},
    200
  );
  const blocked = await s.call(
    s.nucleo,
    'POST',
    `/events/${event.id}/release`,
    {revision: (await event.detail()).event.revision},
    400
  );
  assert.match(blocked.data.error, /Vazia sem perguntas; nenhum aluno na lista/);
  const d2 = await event.detail();
  await s.call(
    s.nucleo,
    'PUT',
    '/events/' + event.id,
    {
      ...d2.event,
      key_question: true,
      stations: [{name: 'Com chave', questions: []}],
      student_ids: [s.students[0].studentId]
    },
    200
  );
  const d3 = await event.detail();
  await s.call(s.nucleo, 'POST', `/events/${event.id}/release`, {revision: d3.event.revision - 1}, 409);
  await s.call(s.nucleo, 'POST', `/events/${event.id}/release`, {revision: d3.event.revision}, 200);
  const live = await event.detail();
  assert.equal(live.event.status, 'LIBERADO');
  await s.call(
    s.nucleo,
    'PUT',
    '/events/' + event.id,
    {...live.event, stations: [{name: 'Outra', questions: []}], student_ids: []},
    423
  );
  await s.call(s.nucleo, 'DELETE', '/events/' + event.id, undefined, 409);
  // Without answers it may go back to draft, and a draft may be deleted.
  await s.call(s.nucleo, 'POST', `/events/${event.id}/reopen`, {}, 200);
  await s.call(s.nucleo, 'DELETE', '/events/' + event.id, undefined, 200);
  await s.call(s.nucleo, 'GET', '/events/' + event.id, undefined, 404);
  assert.equal(s.api.runtime.db.prepare('SELECT count(*) n FROM forms').get().n, 0);
});

test('conta operacional ve so OSCE liberado e responde uma vez por aluno em cada estacao', async t => {
  const s = await setup(t);
  await s.draft({round: 2}); // a draft never reaches the station accounts
  const event = await s.released();
  const listed = (await s.call(s.station, 'GET', '/respond/events', undefined, 200)).data;
  assert.deepEqual(
    listed.map(e => e.id),
    [event.id]
  );
  const [first, second] = event.stations;
  const form = await s.form(first.id);
  assert.deepEqual(
    form.questions.map(q => [q.text, q.is_key]),
    [
      ['O aluno cumprimentou o paciente?', true],
      ['Lavou as maos?', false]
    ]
  );
  assert.ok(form.students.every(st => st.answered === false));

  await s.answer(first.id, s.students[0], ['NAO', 'SIM']);
  assert.deepEqual(
    (await s.form(first.id)).students.map(st => st.answered),
    [true, false, false]
  );
  const repeated = await s.answer(first.id, s.students[0], ['SIM', 'SIM'], 409);
  assert.match(repeated.data.error, /já foi avaliado/);
  await s.answer(second.id, s.students[0], ['SIM', 'NAO']); // another station: its own answer

  const route = `/respond/stations/${first.id}/submissions`,
    q = form.questions;
  await s.call(
    s.station,
    'POST',
    route,
    {student_id: s.students[1].studentId, answers: [{question_id: q[0].id, value: 'SIM'}]},
    400
  );
  await s.call(
    s.station,
    'POST',
    route,
    {student_id: s.students[1].studentId, answers: q.map(x => ({question_id: x.id, value: 'NA'}))},
    400
  );
  await s.call(
    s.station,
    'POST',
    route,
    {student_id: s.students[1].studentId, answers: [q[0], q[0]].map(x => ({question_id: x.id, value: 'SIM'}))},
    400
  );
  await s.call(
    s.station,
    'POST',
    route,
    {student_id: s.other.studentId, answers: q.map(x => ({question_id: x.id, value: 'SIM'}))},
    400
  );
  assert.equal(s.api.runtime.db.prepare('SELECT count(*) n FROM form_submissions').get().n, 2);
});

test('encerrado nao recebe respostas; reabrir volta a receber; com respostas nao volta a rascunho', async t => {
  const s = await setup(t);
  const event = await s.released(),
    stationId = event.stations[0].id;
  await s.answer(stationId, s.students[0], ['SIM', 'SIM']);
  await s.call(s.nucleo, 'POST', `/events/${event.id}/reopen`, {}, 409); // has answers: cannot become a draft
  const questions = (await s.form(stationId)).questions;
  await s.call(s.nucleo, 'POST', `/events/${event.id}/close`, {}, 200);
  // Closed: neither the form nor a new answer is served.
  await s.call(s.station, 'GET', '/respond/stations/' + stationId, undefined, 423);
  await s.call(
    s.station,
    'POST',
    `/respond/stations/${stationId}/submissions`,
    {student_id: s.students[1].studentId, answers: questions.map(q => ({question_id: q.id, value: 'SIM'}))},
    423
  );
  assert.deepEqual((await s.call(s.station, 'GET', '/respond/events', undefined, 200)).data, []);
  await s.call(s.nucleo, 'POST', `/events/${event.id}/close`, {}, 409);
  assert.equal((await s.call(s.nucleo, 'POST', `/events/${event.id}/reopen`, {}, 200)).data.status, 'LIBERADO');
  await s.answer(stationId, s.students[1], ['SIM', 'SIM']);
});

test('resultados para o Nucleo: respostas, contagens, acertos e nota de cada estacao', async t => {
  const s = await setup(t);
  const event = await s.released(),
    [first] = event.stations;
  await s.answer(first.id, s.students[0], ['NAO', 'SIM']);
  await s.answer(first.id, s.students[1], ['SIM', 'SIM']);
  const {data} = await s.call(s.nucleo, 'GET', `/events/${event.id}/results`, undefined, 200);
  const station = data.stations[0];
  assert.deepEqual([station.total, station.answered], [3, 2]);
  assert.deepEqual(
    station.questions.map(q => [q.is_key, q.sim, q.nao]),
    [
      [true, 1, 1],
      [false, 2, 0]
    ]
  );
  const row = station.rows.find(r => r.student.matricula === 'ALU-P5-1');
  assert.deepEqual(Object.values(row.submission.answers), [
    {value: 'NAO', comment: 'Comentario ficticio'},
    {value: 'SIM', comment: null}
  ]);
  assert.equal(row.submission.account, s.station.name);
  const missing = station.rows.find(r => r.student.matricula === 'ALU-P5-3');
  assert.deepEqual([missing.submission, missing.hits, missing.grade], [null, null, null]);
  // One item per station. Without the posture the only hit is worth half: 0.5 of 1. With it: 1 of 1.
  assert.deepEqual([row.hits, row.grade], [0.5, 0.5]);
  const full = station.rows.find(r => r.student.matricula === 'ALU-P5-2');
  assert.deepEqual([full.hits, full.grade], [1, 1]);
  assert.deepEqual([station.items, station.average], [1, 0.75]);
  assert.deepEqual([data.stations[1].items, data.stations[1].answered, data.stations[1].average], [1, 0, null]);
  // "Resultado Final": the station nobody was evaluated in is left out of every average.
  assert.equal(data.consolidated.available, true);
  assert.match(data.consolidated.message, /planilha do OSCE da instituição/);
  assert.deepEqual(
    data.consolidated.students.map(x => [x.student.matricula, x.grades, x.evaluated, x.final]),
    [
      ['ALU-P5-1', [0.5, null], 1, 0.5],
      ['ALU-P5-2', [1, null], 1, 1],
      ['ALU-P5-3', [null, null], 0, null]
    ]
  );
  assert.equal(data.consolidated.average, 0.75);
  // Nothing beyond the spreadsheet: no pass mark, weight, ranking or comparison between rounds.
  assert.doesNotMatch(JSON.stringify(data), /"(score|rank|peso|weight|aprovad|classifica|melhor|pior)[a-z_]*"/i);
  assert.deepEqual(Object.keys(data.consolidated).sort(), ['available', 'average', 'message', 'students']);
});

// Two stations with several items. Student 1 does both (the second without the posture), student
// 2 only the first, student 3 none.
const RICH = [
  {name: 'Anamnese', questions: [{text: 'Item ficticio 1'}, {text: 'Item ficticio 2'}, {text: 'Item ficticio 3'}]},
  {
    name: 'Exame fisico',
    questions: [
      {text: 'Item ficticio 4'},
      {text: 'Item ficticio 5'},
      {text: 'Item ficticio 6'},
      {text: 'Item ficticio 7'}
    ]
  }
];
async function rich(s) {
  const event = await s.released({}, RICH),
    [first, second] = event.stations;
  await s.answer(first.id, s.students[0], ['SIM', 'SIM', 'SIM', 'NAO']); // 2 of 3
  const halved = (await s.answer(second.id, s.students[0], ['NAO', 'SIM', 'SIM', 'SIM', 'NAO'])).data.id; // 3 x 0.5 of 4
  await s.answer(first.id, s.students[1], ['SIM', 'SIM', 'SIM', 'SIM']); // 3 of 3
  return {event, first, second, halved};
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('notas do OSCE: varios itens, postura que reduz pela metade e media das estacoes avaliadas', async t => {
  const s = await setup(t);
  const {event, halved} = await rich(s);
  const read = async () => (await s.call(s.nucleo, 'GET', `/events/${event.id}/results`, undefined, 200)).data;
  let data = await read();
  const [anamnese, exame] = data.stations;
  assert.deepEqual(
    anamnese.rows.map(r => [r.student.matricula, r.hits, r.grade]),
    [
      ['ALU-P5-1', 2, 0.67],
      ['ALU-P5-2', 3, 1],
      ['ALU-P5-3', null, null]
    ]
  );
  assert.deepEqual(
    exame.rows.map(r => [r.hits, r.grade]),
    [
      [1.5, 0.38],
      [null, null],
      [null, null]
    ]
  );
  assert.deepEqual([anamnese.items, anamnese.average, exame.items, exame.average], [3, 0.83, 4, 0.38]);
  // Student 1: (2/3 + 1.5/4) / 2 = 0.5208. Student 2 has one station, and its grade is the final one.
  assert.deepEqual(
    data.consolidated.students.map(x => [x.grades, x.evaluated, x.final]),
    [
      [[0.67, 0.38], 2, 0.52],
      [[1, null], 1, 1],
      [[null, null], 0, null]
    ]
  );
  // General: (2/3 + 1 + 0.375) / 3, every grade once; not the average of the two stations.
  assert.equal(data.consolidated.average, 0.68);

  // A voided answer is no longer a grade.
  await s.call(s.nucleo, 'POST', `/submissions/${halved}/void`, {reason: 'Motivo ficticio'}, 200);
  data = await read();
  assert.deepEqual([data.stations[1].answered, data.stations[1].average], [0, null]);
  assert.deepEqual(
    data.consolidated.students.map(x => [x.evaluated, x.final]),
    [
      [1, 0.67],
      [1, 1],
      [0, null]
    ]
  );
  assert.equal(data.consolidated.average, 0.83);
});

test('OSCE sem pergunta-chave nao tem reducao; estacao so com a pergunta-chave nao tem nota', async t => {
  const s = await setup(t);
  const plain = await s.released(
    {},
    [{name: 'Unica', questions: [{text: 'Item ficticio 1'}, {text: 'Item ficticio 2'}]}],
    {
      key_question: false
    }
  );
  await s.answer(plain.stations[0].id, s.students[0], ['SIM', 'NAO']);
  let data = (await s.call(s.nucleo, 'GET', `/events/${plain.id}/results`, undefined, 200)).data;
  const row = data.stations[0].rows[0];
  assert.deepEqual([data.stations[0].items, row.hits, row.grade], [2, 1, 0.5]);
  assert.equal(data.consolidated.students[0].final, 0.5);

  const empty = await s.released({round: 2}, [{name: 'So postura', questions: []}]);
  await s.answer(empty.stations[0].id, s.students[0], ['SIM']);
  data = (await s.call(s.nucleo, 'GET', `/events/${empty.id}/results`, undefined, 200)).data;
  assert.deepEqual(
    [data.stations[0].items, data.stations[0].answered, data.stations[0].rows[0].hits, data.stations[0].rows[0].grade],
    [0, 1, 0, null]
  );
  assert.deepEqual([data.consolidated.students[0].final, data.consolidated.average], [null, null]);
});

test('exportacao: abas das estacoes com as formulas da planilha, Juncao e Resultado Final', async t => {
  const s = await setup(t);
  const {event} = await rich(s);
  const route = `${s.api.base}/api/osce/events/${event.id}/results/export`;
  assert.equal((await fetch(route)).status, 401);
  const response = await fetch(route, {headers: {cookie: s.nucleo.cookie}});
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  assert.deepEqual(
    book.worksheets.map(w => w.name),
    ['Anamnese', 'Exame fisico', 'Junção', 'Resultado Final']
  );
  const [one, two] = s.students;
  // The library that reads the file back drops a stored result of zero; the file itself has it.
  const cell = (sheet, address) => {
    const value = sheet.getCell(address).value;
    return value && value.formula ? {formula: value.formula, result: value.result ?? 0} : value;
  };
  const rowOf = (sheet, name, column = 2) => {
    for (let row = 1; row <= sheet.rowCount; row++) {
      const value = sheet.getCell(row, column).value;
      if ((value && value.formula ? value.result : value) === name) return row;
    }
    assert.fail('Linha nao encontrada: ' + name);
  };

  // Station tab: moment, student, evaluator, posture item and one column of comments after each
  // answer; then hits, grade and the station.
  const [anamnese, exame, joined, final] = book.worksheets;
  assert.deepEqual(anamnese.getRow(1).values.slice(1), [
    'Carimbo de data/hora',
    'Aluno',
    'Avaliador',
    'O aluno cumprimentou o paciente?',
    'Comentários',
    'Item ficticio 1',
    'Comentários',
    'Item ficticio 2',
    'Comentários',
    'Item ficticio 3',
    'Comentários',
    'Acertos',
    'NOTA',
    'Estação'
  ]);
  const a1 = rowOf(anamnese, one.name),
    a2 = rowOf(anamnese, two.name);
  assert.deepEqual([a1, a2].sort(), [2, 3]);
  assert.ok(anamnese.getCell('A' + a1).value instanceof Date);
  // Array.from turns the holes of the empty cells into undefined.
  assert.deepEqual(Array.from(anamnese.getRow(a1).values.slice(2, 12)), [
    one.name,
    s.station.name,
    'Fez',
    'Comentario ficticio',
    'Fez',
    undefined,
    'Fez',
    undefined,
    'Não Fez',
    undefined
  ]);
  assert.deepEqual(cell(anamnese, 'L' + a1), {
    formula: `(COUNTIF(F${a1},"Fez")+COUNTIF(H${a1},"Fez")+COUNTIF(J${a1},"Fez"))*(IF(D${a1}="Fez",1,0.5))`,
    result: 2
  });
  assert.deepEqual(cell(anamnese, 'M' + a1), {formula: `(L${a1})/C$6`, result: 2 / 3});
  assert.deepEqual(cell(anamnese, 'M' + a2), {formula: `(L${a2})/C$6`, result: 1});
  assert.equal(cell(anamnese, 'N' + a1), 'Anamnese');
  assert.deepEqual([cell(anamnese, 'B6'), cell(anamnese, 'C6')], ['Total Questões', 3]);
  assert.equal(anamnese.actualRowCount, 1 + 2 + 1);
  // Second station: one student, without the posture, so the three hits are worth 1.5 of 4.
  assert.equal(cell(exame, 'D2'), 'Não Fez');
  assert.deepEqual(cell(exame, 'N2'), {
    formula: '(COUNTIF(F2,"Fez")+COUNTIF(H2,"Fez")+COUNTIF(J2,"Fez")+COUNTIF(L2,"Fez"))*(IF(D2="Fez",1,0.5))',
    result: 1.5
  });
  assert.deepEqual(cell(exame, 'O2'), {formula: '(N2)/C$5', result: 0.375});
  assert.deepEqual([cell(exame, 'B5'), cell(exame, 'C5')], ['Total Questões', 4]);

  // "Junção": every grade, station after station, read from the tabs.
  assert.deepEqual(joined.getRow(1).values.slice(1), ['Nome', 'Nota', 'Estação']);
  assert.equal(joined.actualRowCount, 1 + 3);
  assert.deepEqual(
    [2, 3, 4].map(row => cell(joined, 'C' + row).result),
    ['Anamnese', 'Anamnese', 'Exame fisico']
  );
  assert.deepEqual(
    ['A4', 'B4', 'C4'].map(address => cell(joined, address)),
    [
      {formula: "'Exame fisico'!B2", result: one.name},
      {formula: "'Exame fisico'!O2", result: 0.375},
      {formula: "'Exame fisico'!P2", result: 'Exame fisico'}
    ]
  );

  // "Resultado Final": students with a grade in rows, stations in columns, averages at the end.
  assert.equal(cell(final, 'A3'), 'Média de Nota');
  assert.deepEqual(final.getRow(4).values.slice(1), ['Aluno', 'Anamnese', 'Exame fisico', 'Total Geral']);
  const f1 = rowOf(final, one.name, 1),
    f2 = rowOf(final, two.name, 1);
  assert.deepEqual([f1, f2].sort(), [5, 6]);
  assert.deepEqual(cell(final, 'B' + f1), {formula: `'Anamnese'!M${a1}`, result: 2 / 3});
  assert.deepEqual(cell(final, 'C' + f1), {formula: "'Exame fisico'!O2", result: 0.375});
  assert.equal(cell(final, 'D' + f1).formula, `AVERAGE(B${f1}:C${f1})`);
  near(cell(final, 'D' + f1).result, (2 / 3 + 0.375) / 2);
  assert.equal(cell(final, 'C' + f2), null); // not evaluated there: an empty cell, out of the average
  assert.deepEqual(cell(final, 'D' + f2), {formula: `AVERAGE(B${f2}:C${f2})`, result: 1});
  assert.equal(cell(final, 'A7'), 'Total Geral');
  assert.equal(cell(final, 'B7').formula, 'AVERAGE(B5:B6)');
  near(cell(final, 'B7').result, (2 / 3 + 1) / 2);
  assert.deepEqual(cell(final, 'C7'), {formula: 'AVERAGE(C5:C6)', result: 0.375});
  assert.equal(cell(final, 'D7').formula, 'AVERAGE(B5:C6)');
  near(cell(final, 'D7').result, (2 / 3 + 1 + 0.375) / 3);
  assert.deepEqual([final.getCell('B5').numFmt, final.getCell('D7').numFmt], ['0.00', '0.00']);
  assert.equal(final.actualRowCount, 2 + 2 + 1); // the student without any grade is not listed

  const log = s.api.runtime.db.prepare("SELECT details FROM audit_logs WHERE action='OSCE_EXPORTAR'").all();
  assert.deepEqual(
    log.map(entry => JSON.parse(entry.details).event_id),
    [event.id]
  );
});

test('exportacao: nomes de aba validos e sem repeticao, e estacao sem pergunta-chave', async t => {
  const s = await setup(t);
  const event = await s.released(
    {},
    [
      {name: 'Junção', questions: [{text: 'Item ficticio 1'}]},
      {name: 'Estacao: com/barra [e] um nome bem comprido', questions: [{text: 'Item ficticio 2'}]},
      {name: "Sala d'agua", questions: [{text: 'Item ficticio 3'}]}
    ],
    {key_question: false}
  );
  await s.answer(event.stations[2].id, s.students[0], ['SIM']);
  const response = await fetch(`${s.api.base}/api/osce/events/${event.id}/results/export`, {
    headers: {cookie: s.nucleo.cookie}
  });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const names = book.worksheets.map(w => w.name);
  assert.deepEqual(names, [
    'Junção (2)',
    'Estacao com barra e um nome bem',
    "Sala d'agua",
    'Junção',
    'Resultado Final'
  ]);
  for (const name of names) assert.ok(name.length <= 31 && !/[\\/?*[\]:]/.test(name), name);
  // Without the key question the posture columns stay empty and nothing is halved.
  const tab = book.worksheets[2];
  assert.deepEqual(Array.from(tab.getRow(1).values.slice(1, 9)), [
    'Carimbo de data/hora',
    'Aluno',
    'Avaliador',
    undefined,
    undefined,
    'Item ficticio 3',
    'Comentários',
    'Acertos'
  ]);
  assert.deepEqual(tab.getCell('H2').value, {formula: '(COUNTIF(F2,"Fez"))', result: 1});
  assert.deepEqual(tab.getCell('I2').value, {formula: '(H2)/C$5', result: 1});
  // A quote in the name of a tab is doubled where another tab refers to it.
  assert.deepEqual(book.worksheets[3].getCell('B2').value, {formula: "'Sala d''agua'!I2", result: 1});
  assert.deepEqual(book.worksheets[4].getCell('D5').value, {formula: "'Sala d''agua'!I2", result: 1});
  // A station nobody was evaluated in: header and number of items only.
  assert.equal(book.worksheets[0].actualRowCount, 2);
  assert.deepEqual(book.worksheets[0].getCell('C4').value, 1);
});

test('anulacao pelo Nucleo: a resposta anulada fica guardada e o aluno pode ser avaliado de novo', async t => {
  const s = await setup(t);
  const event = await s.released(),
    [first] = event.stations;
  const original = (await s.answer(first.id, s.students[0], ['NAO', 'NAO'])).data.id;
  await s.call(s.station, 'POST', `/submissions/${original}/void`, {reason: 'x'}, 403);
  await s.call(s.nucleo, 'POST', `/submissions/${original}/void`, {reason: ''}, 400);
  await s.call(s.nucleo, 'POST', '/submissions/999999/void', {reason: 'Ficticio'}, 404);
  await s.call(s.nucleo, 'POST', `/submissions/${original}/void`, {reason: 'Aluno trocado na estacao'}, 200);
  await s.call(s.nucleo, 'POST', `/submissions/${original}/void`, {reason: 'De novo'}, 409);
  await s.answer(first.id, s.students[0], ['SIM', 'SIM']);
  const station = (await s.call(s.nucleo, 'GET', `/events/${event.id}/results`, undefined, 200)).data.stations[0];
  assert.equal(station.answered, 1);
  assert.deepEqual(
    station.voided.map(v => [v.id, v.reason, v.voided_by, Object.values(v.answers).map(a => a.value)]),
    [[original, 'Aluno trocado na estacao', s.nucleo.name, ['NAO', 'NAO']]]
  );
});

test('respostas nao podem ser alteradas nem apagadas, nem direto no banco', async t => {
  const s = await setup(t);
  const event = await s.released(),
    db = s.api.runtime.db;
  const id = (await s.answer(event.stations[0].id, s.students[0], ['SIM', 'SIM'])).data.id;
  assert.throws(
    () => db.prepare("UPDATE form_answers SET value='NAO' WHERE submission_id=?").run(id),
    /nao podem ser alteradas/
  );
  assert.throws(() => db.prepare('DELETE FROM form_answers WHERE submission_id=?').run(id), /nao podem ser apagadas/);
  assert.throws(() => db.prepare('DELETE FROM form_submissions WHERE id=?').run(id), /nao podem ser apagados/);
  assert.throws(
    () => db.prepare('UPDATE form_submissions SET subject_student_id=? WHERE id=?').run(s.students[1].studentId, id),
    /so podem ser anulados/
  );
  assert.throws(
    () => db.prepare('UPDATE form_submissions SET created_at=CURRENT_TIMESTAMP WHERE id=?').run(id),
    /so podem ser anulados/
  );
});

test('auditoria registra a conta compartilhada, a estacao e a origem, sem o conteudo das respostas', async t => {
  const s = await setup(t);
  const event = await s.released(),
    [first] = event.stations;
  const id = (await s.answer(first.id, s.students[0], ['NAO', 'SIM'])).data.id;
  const log = s.api.runtime.db
    .prepare("SELECT l.*,u.role FROM audit_logs l JOIN users u ON u.id=l.actor_id WHERE l.action='OSCE_RESPONDER'")
    .all();
  assert.equal(log.length, 1);
  assert.equal(log[0].role, 'OPERACIONAL');
  assert.equal(log[0].actor_id, s.station.id);
  assert.ok(log[0].origin);
  const details = JSON.parse(log[0].details);
  assert.deepEqual([details.event_id, details.station_id, details.submission_id], [event.id, first.id, id]);
  assert.doesNotMatch(log[0].details, /SIM|NAO|Comentario/);
  const actions = s.api.runtime.db
    .prepare("SELECT action FROM audit_logs WHERE action LIKE 'OSCE_%' ORDER BY id")
    .all()
    .map(r => r.action);
  assert.deepEqual(actions, ['OSCE_CRIAR', 'OSCE_SALVAR', 'OSCE_LIBERAR', 'OSCE_RESPONDER']);
});

test('conta operacional com senha provisoria nao acessa nada antes de trocar a senha', async t => {
  const s = await setup(t);
  await s.released();
  const created = await s.api.call('/api/admin/users', {
    method: 'POST',
    cookie: s.admin,
    body: {
      role: 'OPERACIONAL',
      name: 'Ambulatorio Ficticio 2',
      email: 'amb2@teste.invalid',
      matricula: 'AMB-2',
      password: 'Provisoria-123!'
    },
    expected: 201
  });
  assert.ok(created.data.id);
  const first = await s.api.login('AMB-2', 'Provisoria-123!', {expected: 200});
  const denied = await s.api.call('/api/osce/respond/events', {cookie: first.cookie, expected: 403});
  assert.equal(denied.data.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('falha ao carregar o modulo OSCE nao derruba o restante do sistema', async t => {
  const broken = manifest.map(feature =>
    feature.id === 'osce'
      ? {
          ...feature,
          load: () => {
            throw Error('falha ficticia de carga');
          }
        }
      : feature
  );
  const api = await startApi(t, {options: {modules: broken}});
  const admin = await api.adminSession();
  const down = await api.call('/api/osce/events', {cookie: admin, expected: 503});
  assert.deepEqual([down.data.code, down.data.module], ['MODULE_UNAVAILABLE', 'osce']);
  await api.call('/api/admin/users', {cookie: admin, expected: 200});
  assert.equal((await api.call('/api/health')).data.status, 'degraded');
});
