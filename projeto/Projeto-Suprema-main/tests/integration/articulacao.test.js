'use strict';
// Interdisciplinary articulation (stage 7): the CSTI builds the form with a free title and its
// own lists, every student answers once and receives a receipt, and the results are the counts
// and the figures of the institution's report (average, lowest and highest grade, share of each
// answer, per tutor and period), read by the CSTI, by the coordination after release and by each
// tutor for himself or herself. No single performance figure and no ranking. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {startApi} = require('../fixtures/api');
const Store = require('../../apps/api/src/modules/articulacao/store');

const TITLE = 'Avaliação Caso 9 - Articulação Interdisciplinar';
const LISTS = {
  PERIODO: [{label: '1º Período'}, {label: '2º Período'}],
  TUTOR: [{label: 'Tutor Ficticio A'}, {label: 'Tutor Ficticio B'}],
  ESTACAO: [{label: 'Estacao Ficticia 1'}, {label: 'Estacao Ficticia 2'}, {label: 'Estacao Ficticia 3'}]
};

async function setup(t, {students = 2} = {}) {
  const api = await startApi(t),
    admin = await api.adminSession();
  const csti = await api.createUser(admin, 'CSTI', 'CSTI-A');
  const coord = await api.createUser(admin, 'COORDENACAO', 'COORD-A');
  const tutorA = await api.createUser(admin, 'PROFESSOR', 'PROF-A');
  const tutorB = await api.createUser(admin, 'PROFESSOR', 'PROF-B');
  const pupils = [];
  for (let n = 1; n <= students; n++) pupils.push(await api.createUser(admin, 'ALUNO', 'ALU-ART-' + n, {period: '2'}));
  const call = (who, method, route, body, expected) => api.call(route, {method, cookie: who.cookie, body, expected});
  const detail = async id => (await call(csti, 'GET', '/api/articulation/forms/' + id, undefined, 200)).data;

  // A form with the default questions, the lists above and the two tutors linked to accounts.
  async function create({title = TITLE, release = true, change = d => d} = {}) {
    const id = (await call(csti, 'POST', '/api/articulation/forms', {title, year: 2026, semester: '2'}, 201)).data.id;
    const d = await detail(id);
    const options = {
      ...LISTS,
      TUTOR: [
        {label: 'Tutor Ficticio A', professor_id: tutorA.id},
        {label: 'Tutor Ficticio B', professor_id: tutorB.id}
      ]
    };
    const draft = change({
      revision: d.form.revision,
      title,
      year: 2026,
      semester: '2',
      questions: d.questions,
      options
    });
    await call(csti, 'PUT', '/api/articulation/forms/' + id, draft, 200);
    if (release)
      await call(csti, 'POST', `/api/articulation/forms/${id}/release`, {revision: d.form.revision + 1}, 200);
    return id;
  }
  // Answers every question: `picks` chooses list options by label, `values` overrides by question number.
  async function send(
    student,
    id,
    {picks = {}, values = {}, justification = '', expected = 201, mutate = a => a} = {}
  ) {
    const form = (await call(student, 'GET', '/api/articulation/open/' + id, undefined, 200)).data;
    const answers = form.questions.map((q, i) => {
      const base = {question_id: q.id, ...(q.justify && justification ? {justification} : {})};
      if (q.options) return {...base, option_id: (q.options.find(o => o.label === picks[q.kind]) || q.options[0]).id};
      if (values[i + 1] !== undefined) return {...base, value: values[i + 1]};
      return {...base, value: q.kind === 'NOTA_0_10' ? 8 : 'SIM'};
    });
    return call(student, 'POST', `/api/articulation/open/${id}/answers`, {answers: mutate(answers, form)}, expected);
  }
  const step = (id, action, expected = 200) =>
    call(csti, 'POST', `/api/articulation/forms/${id}/${action}`, {}, expected);
  return {
    api,
    db: api.runtime.db,
    admin: {cookie: admin},
    csti,
    coord,
    tutorA,
    tutorB,
    students: pupils,
    call,
    detail,
    create,
    send,
    step
  };
}

test('formulario novo: nome livre, perguntas do modelo e listas padrao que o CSTI altera e salva', async t => {
  const s = await setup(t, {students: 0});
  const id = (await s.call(s.csti, 'POST', '/api/articulation/forms', {title: TITLE, year: 2026, semester: '2'}, 201))
    .data.id;
  const d = await s.detail(id);
  assert.deepEqual([d.form.title, d.form.status, d.responses], [TITLE, 'RASCUNHO', 0]);
  assert.deepEqual(
    d.questions.map(q => q.kind),
    Store.TEMPLATE.map(q => q.kind)
  );
  assert.equal(d.questions.length, 17);
  assert.deepEqual(
    d.options.PERIODO.map(o => o.label),
    [1, 2, 3, 4, 5, 6, 7, 8].map(n => n + 'º Período')
  );
  assert.deepEqual([d.options.TUTOR, d.options.ESTACAO], [[], []]);
  assert.deepEqual(d.teachers.map(p => p.id).sort(), [s.tutorA.id, s.tutorB.id].sort());
  await s.call(s.csti, 'POST', '/api/articulation/forms', {title: '  ', year: 2026, semester: '2'}, 400);

  // Any number of periods, tutors and stations; blanks and repeated labels are dropped.
  const options = {
    PERIODO: [{label: '9º Período'}, {label: ' 9º período '}, {label: ''}, {label: '10º Período'}],
    TUTOR: [{label: 'Tutor Ficticio A', professor_id: s.tutorA.id}, {label: 'Tutor Sem Conta'}],
    ESTACAO: [{label: 'Estacao Ficticia 1'}]
  };
  const questions = [
    ...d.questions.slice(0, 3),
    {section: 'Nova', text: 'Pergunta criada pelo CSTI?', kind: 'SIM_NAO', justify: true}
  ];
  const saved = await s.call(
    s.csti,
    'PUT',
    '/api/articulation/forms/' + id,
    {
      revision: d.form.revision,
      title: 'Avaliação Caso 10 - Articulação Interdisciplinar',
      year: 2027,
      semester: '1',
      questions,
      options
    },
    200
  );
  const after = await s.detail(id);
  assert.deepEqual(
    [after.form.title, after.form.year, after.form.semester, after.form.revision],
    ['Avaliação Caso 10 - Articulação Interdisciplinar', 2027, '1', saved.data.revision]
  );
  assert.deepEqual(
    after.options.PERIODO.map(o => o.label),
    ['9º Período', '10º Período']
  );
  assert.deepEqual(after.options.TUTOR, [
    {label: 'Tutor Ficticio A', professor_id: s.tutorA.id},
    {label: 'Tutor Sem Conta', professor_id: null}
  ]);
  assert.deepEqual(after.questions.at(-1), {
    section: 'Nova',
    text: 'Pergunta criada pelo CSTI?',
    kind: 'SIM_NAO',
    justify: true
  });
  assert.equal(after.questions.length, 4);

  // Stale screen, invalid answer type, account that is not a teacher.
  const body = {revision: after.form.revision, title: TITLE, year: 2026, semester: '2', questions, options};
  await s.call(s.csti, 'PUT', '/api/articulation/forms/' + id, {...body, revision: d.form.revision}, 409);
  await s.call(
    s.csti,
    'PUT',
    '/api/articulation/forms/' + id,
    {...body, questions: [{text: 'Texto livre?', kind: 'TEXTO'}]},
    400
  );
  await s.call(
    s.csti,
    'PUT',
    '/api/articulation/forms/' + id,
    {...body, options: {...options, TUTOR: [{label: 'X', professor_id: s.coord.id}]}},
    400
  );

  // The saved default lists are the starting point of the next form; the existing one keeps its own.
  await s.call(s.csti, 'PUT', '/api/articulation/defaults', {options}, 200);
  const next = await s.detail(
    (
      await s.call(
        s.csti,
        'POST',
        '/api/articulation/forms',
        {title: 'Avaliação Caso 11', year: 2027, semester: '1'},
        201
      )
    ).data.id
  );
  assert.deepEqual(next.options, after.options);
  assert.equal(next.questions.length, 17);
});

test('liberacao: exige as listas e uma pergunta de tutor; depois de liberada a estrutura trava', async t => {
  const s = await setup(t, {students: 1});
  const blocked = async (change, pattern) => {
    const id = await s.create({release: false, change});
    const d = await s.detail(id);
    const refused = await s.call(
      s.csti,
      'POST',
      `/api/articulation/forms/${id}/release`,
      {revision: d.form.revision},
      400
    );
    assert.match(refused.data.error, pattern);
    await s.call(s.csti, 'DELETE', '/api/articulation/forms/' + id, undefined, 200);
  };
  await blocked(d => ({...d, questions: []}), /nenhuma pergunta/);
  await blocked(d => ({...d, options: {...d.options, TUTOR: []}}), /lista de tutores vazia/);
  await blocked(d => ({...d, options: {...d.options, ESTACAO: []}}), /lista de estações de apoio vazia/);
  await blocked(
    d => ({...d, questions: d.questions.filter(q => q.kind !== 'TUTOR')}),
    /exatamente uma pergunta do tipo Tutor/
  );
  await blocked(
    d => ({...d, questions: [...d.questions, {section: '', text: 'Outro tutor', kind: 'TUTOR'}]}),
    /exatamente uma pergunta do tipo Tutor/
  );
  assert.equal((await s.call(s.csti, 'GET', '/api/articulation/forms', undefined, 200)).data.length, 0);

  const id = await s.create({release: false});
  const draft = await s.detail(id);
  assert.deepEqual((await s.call(s.students[0], 'GET', '/api/articulation/open', undefined, 200)).data, []);
  await s.call(s.csti, 'POST', `/api/articulation/forms/${id}/release`, {revision: draft.form.revision - 1}, 409);
  await s.call(s.csti, 'POST', `/api/articulation/forms/${id}/release`, {revision: draft.form.revision}, 200);
  const released = await s.detail(id);
  await s.call(
    s.csti,
    'PUT',
    '/api/articulation/forms/' + id,
    {
      revision: released.form.revision,
      title: 'Outro',
      year: 2026,
      semester: '2',
      questions: released.questions,
      options: released.options
    },
    423
  );
  await s.call(s.csti, 'DELETE', '/api/articulation/forms/' + id, undefined, 409);
  await s.step(id, 'publish', 409); // results cannot be released before the collection is finished

  // While nobody has answered, the form may return to draft to be corrected.
  assert.equal((await s.step(id, 'reopen')).data.status, 'RASCUNHO');
  await s.step(id, 'release', 409); // release needs the revision the CSTI is looking at
  await s.call(
    s.csti,
    'POST',
    `/api/articulation/forms/${id}/release`,
    {revision: (await s.detail(id)).form.revision},
    200
  );
  await s.send(s.students[0], id);
  await s.step(id, 'finish');
  assert.equal((await s.step(id, 'reopen')).data.status, 'LIBERADO');
  const refused = await s.step(id, 'reopen', 409);
  assert.match(refused.data.error, /já recebeu respostas/);
  const actions = s.db
    .prepare("SELECT action FROM audit_logs WHERE action LIKE 'ARTICULACAO_%' ORDER BY id")
    .all()
    .map(r => r.action);
  for (const expected of [
    'ARTICULACAO_CRIAR',
    'ARTICULACAO_SALVAR',
    'ARTICULACAO_EXCLUIR',
    'ARTICULACAO_LIBERAR',
    'ARTICULACAO_REABRIR',
    'ARTICULACAO_RESPONDER',
    'ARTICULACAO_FINALIZAR'
  ])
    assert.ok(actions.includes(expected), expected);
});

test('aluno responde uma unica vez, com todas as perguntas, e recebe o comprovante', async t => {
  const s = await setup(t),
    [student, other] = s.students;
  const id = await s.create();
  assert.deepEqual((await s.call(student, 'GET', '/api/articulation/open', undefined, 200)).data, [
    {id, title: TITLE, year: 2026, semester: '2', answered: false}
  ]);
  const form = (await s.call(student, 'GET', '/api/articulation/open/' + id, undefined, 200)).data;
  assert.equal(form.questions.length, 17);
  assert.deepEqual(
    form.questions[1].options.map(o => o.label),
    ['Tutor Ficticio A', 'Tutor Ficticio B']
  );
  assert.doesNotMatch(JSON.stringify(form), /professor/); // which account a tutor is linked to is not the student's business

  // Refused without recording anything: missing answer, grade out of range, unknown choice, option of another list.
  const stationOption = form.questions.find(q => q.kind === 'ESTACAO').options[0].id;
  await s.send(student, id, {expected: 400, mutate: answers => answers.slice(1)});
  await s.send(student, id, {expected: 400, values: {3: 11}});
  await s.send(student, id, {expected: 400, values: {3: 7.5}});
  await s.send(student, id, {expected: 400, values: {3: ''}});
  await s.send(student, id, {expected: 400, values: {4: 'PARCIAL'}}); // question 2.1 accepts only yes or no
  await s.send(student, id, {
    expected: 400,
    mutate: answers => answers.map((a, i) => (i === 1 ? {...a, option_id: stationOption} : a))
  });
  assert.equal(s.db.prepare('SELECT count(*) n FROM articulation_responses').get().n, 0);
  assert.equal(s.db.prepare('SELECT count(*) n FROM receipts').get().n, 0);

  const sent = await s.send(student, id, {
    picks: {TUTOR: 'Tutor Ficticio B'},
    values: {3: 10, 5: 'PARCIAL'},
    justification: 'Justificativa secreta ficticia'
  });
  const code = sent.data.receipt.code;
  assert.match(code, /^AS(-[0-9A-Z]{4}){4}$/);
  const [receipt] = (await s.call(student, 'GET', '/api/receipts/mine', undefined, 200)).data;
  assert.deepEqual(
    [receipt.code, receipt.kind, receipt.title, receipt.detail],
    [code, 'ARTICULACAO', 'Articulação Interdisciplinar respondida', TITLE + ' · 2026.2']
  );
  // The receipt proves that the student answered, never what was answered.
  const pdf = Buffer.from(
    await (await fetch(`${s.api.base}/api/receipts/${code}/pdf`, {headers: {cookie: student.cookie}})).arrayBuffer()
  ).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.4') && pdf.includes(code));
  assert.doesNotMatch(
    pdf + JSON.stringify(s.db.prepare('SELECT * FROM receipts').get()),
    /Justificativa secreta|Tutor Ficticio|PARCIAL/
  );

  // Once only; the other student is not affected.
  await s.call(student, 'GET', '/api/articulation/open/' + id, undefined, 409);
  await s.call(student, 'POST', `/api/articulation/open/${id}/answers`, {answers: []}, 409);
  const open = async who =>
    (await s.call(who, 'GET', '/api/articulation/open', undefined, 200)).data.map(f => f.answered);
  assert.deepEqual([await open(student), await open(other)], [[true], [false]]);
  // A justification is kept only where the question asks for one.
  const stored = s.db
    .prepare(
      'SELECT q.position,a.value,a.justification FROM articulation_answers a JOIN articulation_questions q ON q.id=a.question_id ORDER BY q.position'
    )
    .all();
  assert.deepEqual(
    stored.slice(1, 5).map(a => [a.position, a.value, a.justification]),
    [
      [2, 'Tutor Ficticio B', null],
      [3, '10', 'Justificativa secreta ficticia'],
      [4, 'SIM', null],
      [5, 'PARCIAL', 'Justificativa secreta ficticia']
    ]
  );

  // After the collection is finished nobody else answers.
  await s.step(id, 'finish');
  assert.deepEqual(await open(other), []);
  await s.call(other, 'GET', '/api/articulation/open/' + id, undefined, 404);
  await s.call(other, 'POST', `/api/articulation/open/${id}/answers`, {answers: []}, 404);
  assert.equal(s.db.prepare('SELECT count(*) n FROM receipts').get().n, 1);
});

test('respostas nao podem ser alteradas nem apagadas', async t => {
  const s = await setup(t, {students: 1});
  await s.send(s.students[0], await s.create());
  assert.throws(() => s.db.prepare("UPDATE articulation_answers SET value='NAO'").run(), /nao podem ser alteradas/);
  assert.throws(() => s.db.prepare('DELETE FROM articulation_answers').run(), /nao podem ser apagadas/);
  assert.throws(
    () => s.db.prepare('UPDATE articulation_responses SET student_id=student_id').run(),
    /nao podem ser alteradas/
  );
  assert.throws(() => s.db.prepare('DELETE FROM articulation_responses').run(), /nao podem ser apagadas/);
});

test('resultados: contagens e numeros do relatorio, por tutor, sem numero unico de desempenho', async t => {
  const s = await setup(t, {students: 3});
  const id = await s.create();
  await s.send(s.students[0], id, {
    picks: {TUTOR: 'Tutor Ficticio A', ESTACAO: 'Estacao Ficticia 2'},
    values: {3: 10, 4: 'SIM', 5: 'SIM'},
    justification: 'Justificativa ficticia um'
  });
  await s.send(s.students[1], id, {
    picks: {TUTOR: 'Tutor Ficticio A', ESTACAO: 'Estacao Ficticia 2'},
    values: {3: 6, 4: 'NAO', 5: 'PARCIAL'}
  });
  await s.send(s.students[2], id, {
    picks: {TUTOR: 'Tutor Ficticio B', ESTACAO: 'Estacao Ficticia 3'},
    values: {3: 6, 4: 'SIM', 5: 'NAO'}
  });
  const r = (await s.call(s.csti, 'GET', '/api/articulation/results/' + id, undefined, 200)).data;
  assert.equal(r.responses, 3);
  // No figure sums a tutor up and tutors are not ranked: the institution's report has neither.
  assert.deepEqual(r.performance.available, false);
  assert.match(r.performance.message, /A instituição não usa um número único de desempenho por tutor/);
  assert.doesNotMatch(JSON.stringify({...r, performance: null}), /ranking|rank|score|desempenho|classifica/i);
  for (const board of [r.general, ...r.tutors.flatMap(x => [x.questions, ...x.periods.map(p => p.questions)])])
    for (const q of board) {
      const figures = Object.keys(q).filter(
        key => !['position', 'section', 'text', 'kind', 'answered', 'justifications'].includes(key)
      );
      const expected = {
        NOTA_0_10: ['distribution', 'average', 'lowest', 'highest'],
        SIM_NAO: ['counts', 'shares'],
        SIM_NAO_PARCIAL: ['counts', 'shares']
      };
      assert.deepEqual(figures, expected[q.kind] || ['choices'], q.text);
    }

  const [, tutor, grade, punctual, steps] = r.general;
  assert.deepEqual(tutor.choices, [
    {label: 'Tutor Ficticio A', count: 2},
    {label: 'Tutor Ficticio B', count: 1}
  ]);
  assert.deepEqual(grade.distribution, [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1]);
  assert.deepEqual(grade.justifications, [{student_name: s.students[0].name, text: 'Justificativa ficticia um'}]);
  assert.deepEqual(punctual.counts, {SIM: 2, NAO: 1});
  assert.deepEqual(steps.counts, {SIM: 1, NAO: 1, PARCIAL: 1});
  // The same formulas over the three students: (10 + 6 + 6) / 3, and each answer over 3.
  assert.deepEqual([grade.average, grade.lowest, grade.highest], [7.33, 6, 10]);
  assert.deepEqual(punctual.shares, {SIM: 67, NAO: 33});
  assert.deepEqual(steps.shares, {SIM: 33, NAO: 33, PARCIAL: 33});
  assert.deepEqual(r.general.find(q => q.kind === 'ESTACAO').choices, [
    {label: 'Estacao Ficticia 2', count: 2},
    {label: 'Estacao Ficticia 3', count: 1}
  ]);

  // Each tutor gets only the answers of the students who chose him or her.
  assert.deepEqual(
    r.tutors.map(x => [x.label, x.professor_name, x.responses]),
    [
      ['Tutor Ficticio A', s.tutorA.name, 2],
      ['Tutor Ficticio B', s.tutorB.name, 1]
    ]
  );
  const [a, b] = r.tutors;
  assert.ok(!a.questions.some(q => q.kind === 'TUTOR'));
  assert.deepEqual(a.questions.find(q => q.position === 4).counts, {SIM: 1, NAO: 1});
  assert.deepEqual(b.questions.find(q => q.position === 5).counts, {SIM: 0, NAO: 1, PARCIAL: 0});
  // The report of each tutor, as in the institution's sheet: divided by the tutor's respondents.
  const at = (board, position) => board.find(q => q.position === position);
  assert.deepEqual([at(a.questions, 3).average, at(a.questions, 3).lowest, at(a.questions, 3).highest], [8, 6, 10]);
  assert.deepEqual(at(a.questions, 4).shares, {SIM: 50, NAO: 50});
  assert.deepEqual(at(a.questions, 5).shares, {SIM: 50, NAO: 0, PARCIAL: 50});
  assert.deepEqual([at(b.questions, 3).average, at(b.questions, 3).lowest, at(b.questions, 3).highest], [6, 6, 6]);
  assert.deepEqual(at(b.questions, 5).shares, {SIM: 0, NAO: 100, PARCIAL: 0});
  // Everyone informed the same period: one group per tutor, equal to the tutor's own figures.
  assert.deepEqual(
    r.tutors.map(x => x.periods.map(p => [p.period, p.responses])),
    [[['1º Período', 2]], [['1º Período', 1]]]
  );
  assert.ok(!a.periods[0].questions.some(q => q.kind === 'TUTOR' || q.kind === 'PERIODO'));
  assert.deepEqual(at(a.periods[0].questions, 3), at(a.questions, 3));
  // Identified rows, as in the original spreadsheet.
  assert.deepEqual(
    r.rows.map(row => [row.student_name, row.student_matricula]),
    s.students.map(p => [p.name, p.matricula])
  );
  assert.equal(r.rows[1].answers[r.questions[2].id].value, '6');
});

test('quem ve o que: CSTI sempre, Coordenacao so depois da liberacao, tutor so o proprio consolidado', async t => {
  const s = await setup(t, {students: 6});
  const id = await s.create();
  for (const [i, student] of s.students.entries())
    await s.send(student, id, {
      picks: {TUTOR: i < 5 ? 'Tutor Ficticio A' : 'Tutor Ficticio B'},
      values: {4: i < 2 ? 'NAO' : 'SIM'},
      justification: 'Justificativa ficticia ' + i
    });
  const student = s.students[0],
    everyone = [s.admin, s.coord, s.tutorA, student];

  // Building is the CSTI's alone, including for the administrator of the accounts.
  for (const who of everyone) {
    await s.call(who, 'GET', '/api/articulation/forms', undefined, 403);
    await s.call(who, 'POST', '/api/articulation/forms', {title: 'X', year: 2026, semester: '2'}, 403);
    await s.call(who, 'GET', '/api/articulation/forms/' + id, undefined, 403);
    await s.call(who, 'PUT', '/api/articulation/defaults', {options: LISTS}, 403);
    for (const action of ['release', 'finish', 'publish', 'reopen'])
      await s.call(who, 'POST', `/api/articulation/forms/${id}/${action}`, {}, 403);
  }
  for (const who of [s.admin, s.coord, s.tutorA, s.csti])
    await s.call(who, 'GET', '/api/articulation/open', undefined, 403);
  for (const who of [s.admin, s.tutorA, student]) {
    await s.call(who, 'GET', '/api/articulation/results', undefined, 403);
    await s.call(who, 'GET', '/api/articulation/results/' + id, undefined, 403);
    await s.call(who, 'GET', `/api/articulation/results/${id}/export`, undefined, 403);
  }
  for (const who of [s.admin, s.coord, s.csti, student])
    await s.call(who, 'GET', '/api/articulation/mine', undefined, 403);
  assert.equal((await s.api.call('/api/articulation/results/' + id)).status, 401);

  // Before the results are released: the CSTI follows the collection, nobody else sees anything.
  const seen = async who =>
    (await s.call(who, 'GET', '/api/articulation/results', undefined, 200)).data.map(f => [
      f.id,
      f.status,
      f.responses
    ]);
  const mine = async who => (await s.call(who, 'GET', '/api/articulation/mine', undefined, 200)).data;
  for (const status of ['LIBERADO', 'FINALIZADO']) {
    assert.deepEqual(await seen(s.csti), [[id, status, 6]]);
    assert.deepEqual(await seen(s.coord), []);
    await s.call(s.coord, 'GET', '/api/articulation/results/' + id, undefined, 404);
    await s.call(s.coord, 'GET', `/api/articulation/results/${id}/export`, undefined, 404);
    assert.deepEqual([await mine(s.tutorA), await mine(s.tutorB)], [[], []]);
    if (status === 'LIBERADO') await s.step(id, 'finish');
  }
  await s.step(id, 'publish');
  assert.deepEqual(await seen(s.coord), [[id, 'RESULTADOS_LIBERADOS', 6]]);
  assert.equal((await s.call(s.coord, 'GET', '/api/articulation/results/' + id, undefined, 200)).data.rows.length, 6);

  // The tutor: own figures, no student name, nothing about the other tutor.
  const [own] = await mine(s.tutorA);
  assert.deepEqual(
    [own.form.id, own.tutor, own.responses, own.withheld, own.performance.available],
    [id, 'Tutor Ficticio A', 5, false, false]
  );
  assert.deepEqual(own.questions.find(q => q.position === 4).counts, {SIM: 3, NAO: 2});
  assert.deepEqual(own.questions.find(q => q.position === 4).shares, {SIM: 60, NAO: 40});
  assert.deepEqual(
    ['average', 'lowest', 'highest'].map(key => own.questions.find(q => q.position === 3)[key]),
    [8, 8, 8]
  );
  assert.deepEqual(
    own.periods.map(p => [p.period, p.responses]),
    [['1º Período', 5]]
  );
  assert.equal(own.questions.find(q => q.position === 3).justifications.length, 5);
  const text = JSON.stringify(own);
  assert.doesNotMatch(text, /Tutor Ficticio B|student|ALU-ART|Pessoa Ficticia ALU/);
  // A group below the minimum shows how many answered and nothing else.
  const [small] = await mine(s.tutorB);
  assert.deepEqual(
    [small.tutor, small.responses, small.minimum, small.withheld, small.questions, small.periods],
    ['Tutor Ficticio B', 1, 5, true, [], []]
  );
  assert.doesNotMatch(JSON.stringify(small), /Justificativa/);

  const granted = s.db
    .prepare("SELECT role,permission FROM role_permissions WHERE permission LIKE 'articulation.%' ORDER BY role")
    .all();
  assert.deepEqual(
    granted.map(g => g.role + ':' + g.permission),
    [
      'ALUNO:articulation.answer',
      'COORDENACAO:articulation.results',
      'CSTI:articulation.manage',
      'PROFESSOR:articulation.own'
    ]
  );
});

test('exportacao: uma aba por tutor como na planilha final da instituicao e uma aba com todas as respostas', async t => {
  const s = await setup(t),
    [first, second] = s.students;
  const id = await s.create();
  await s.send(first, id, {
    picks: {PERIODO: '2º Período', TUTOR: 'Tutor Ficticio B', ESTACAO: 'Estacao Ficticia 3'},
    values: {3: 9, 4: 'NAO', 5: 'PARCIAL'},
    justification: 'Justificativa ficticia'
  });
  await s.send(second, id);
  const response = await fetch(`${s.api.base}/api/articulation/results/${id}/export`, {
    headers: {cookie: s.csti.cookie}
  });
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  // One tab per tutor, in alphabetical order and named after the tutor, as in the institution's
  // final workbook; the last tab, which that workbook does not have, lists every answer.
  assert.deepEqual(
    book.worksheets.map(w => w.name),
    ['Tutor Ficticio A', 'Tutor Ficticio B', 'Todas as respostas']
  );
  const sheet = book.worksheets[2],
    values = n => sheet.getRow(n).values.slice(1);
  // Moment, e-mail and name, the 17 questions and one "Justifique" column after each of the 8 that ask for it.
  const header = values(1);
  assert.equal(header.length, 3 + 17 + 8);
  assert.deepEqual(header.slice(0, 6), [
    'Carimbo de data/hora',
    'Endereço de e-mail',
    'Nome do aluno:',
    'Período do curso',
    'Nome do Tutor',
    Store.TEMPLATE[2].text
  ]);
  assert.deepEqual(
    header.filter(h => /^Justifique/.test(h)),
    ['Justifique', ...[2, 3, 4, 5, 6, 7, 8].map(n => 'Justifique ' + n)]
  );
  assert.equal(header[6], 'Justifique');
  const row = values(2);
  assert.ok(row[0] instanceof Date);
  assert.deepEqual(row.slice(1, 11), [
    first.email,
    first.name,
    '2º Período',
    'Tutor Ficticio B',
    9,
    'Justificativa ficticia',
    'Não',
    'Parcialmente',
    'Justificativa ficticia',
    'Sim'
  ]);
  assert.equal(sheet.actualRowCount, 3);
  assert.deepEqual(values(3).slice(2, 6), [second.name, '1º Período', 'Tutor Ficticio A', 8]);
  assert.equal(s.db.prepare("SELECT count(*) n FROM audit_logs WHERE action='ARTICULACAO_EXPORTAR'").get().n, 1);

  // The tab of a tutor: the answers about that tutor and, right below, the three rows of totals
  // with the formulas of the institution's workbook, in its order and without labels.
  // The library that reads the file back drops a stored result of zero; the file itself has it.
  const tab = book.worksheets[1],
    cell = address => {
      const value = tab.getCell(address).value;
      return value && value.formula ? {formula: value.formula, result: value.result ?? 0} : value;
    };
  assert.deepEqual(tab.getRow(1).values, sheet.getRow(1).values);
  assert.deepEqual(tab.getRow(2).values.slice(2), sheet.getRow(2).values.slice(2));
  assert.equal(tab.actualRowCount, 5);
  assert.equal(cell('A3'), 'Total');
  assert.deepEqual(cell('B3'), {formula: 'COUNTA(C2:C2)', result: 1});
  assert.deepEqual(cell('D3'), {formula: 'D2', result: '2º Período'});
  assert.deepEqual(cell('E3'), {formula: 'E2', result: 'Tutor Ficticio B'});
  // Column F is the grade of question 1; H is 2.1 (yes or no) and I is 2.2 (yes, no or partially).
  assert.deepEqual(['F3', 'F4', 'F5'].map(cell), [
    {formula: 'SUM(F$2:F$2)/$B$3', result: 9},
    {formula: 'MAX(F$2:F$2)', result: 9},
    {formula: 'MIN(F$2:F$2)', result: 9}
  ]);
  assert.deepEqual(['H3', 'H4', 'H5'].map(cell), [
    {formula: 'COUNTIF(H$2:H$2,"Sim")/$B$3', result: 0},
    {formula: 'COUNTIF(H$2:H$2,"Parcialmente")/$B$3', result: 0},
    {formula: 'COUNTIF(H$2:H$2,"Não")/$B$3', result: 1}
  ]);
  assert.deepEqual(
    ['I3', 'I4', 'I5'].map(address => cell(address).result),
    [0, 1, 0]
  );
  assert.deepEqual([tab.getCell('F3').numFmt, tab.getCell('H3').numFmt], ['0.00', '0%']);
  // Justifications and the station lists have no totals, and the rows of totals have no labels.
  for (const address of ['G3', 'J3', 'S3', 'U3', 'A4', 'D4', 'A5', 'D5']) assert.equal(cell(address), null, address);
  // The other tutor has a tab of his or her own, with the answer of the other student.
  const other = book.worksheets[0];
  assert.equal(other.actualRowCount, 5);
  assert.deepEqual(other.getRow(2).values.slice(3, 7), [second.name, '1º Período', 'Tutor Ficticio A', 8]);
});

test('relatorio por tutor: divisao por periodo nas telas, sigilo do tutor e nomes das abas', async t => {
  const s = await setup(t, {students: 8});
  const long = 'Tutor Ficticio: com/barra [e] um nome bem comprido',
    twin = 'Tutor Ficticio: com/barra [e] um nome bem comprido tambem';
  const id = await s.create({
    change: d => ({
      ...d,
      options: {
        ...d.options,
        TUTOR: [
          {label: long, professor_id: s.tutorA.id},
          {label: twin, professor_id: s.tutorB.id},
          {label: 'Tutor Sem Resposta'}
        ]
      }
    })
  });
  // Tutor A: five students of the 1st period and two of the 2nd. Tutor B: one student.
  const plan = [
    ['1º Período', long, 10],
    ['1º Período', long, 9],
    ['1º Período', long, 8],
    ['1º Período', long, 7],
    ['1º Período', long, 6],
    ['2º Período', long, 4],
    ['2º Período', long, 3],
    ['2º Período', twin, 5]
  ];
  for (const [i, [period, tutor, grade]] of plan.entries())
    await s.send(s.students[i], id, {picks: {PERIODO: period, TUTOR: tutor}, values: {3: grade}});

  const r = (await s.call(s.csti, 'GET', '/api/articulation/results/' + id, undefined, 200)).data;
  const grade = board => {
    const q = board.find(x => x.position === 3);
    return [q.average, q.lowest, q.highest];
  };
  const [a, b, nobody] = r.tutors;
  assert.deepEqual(
    a.periods.map(p => [p.period, p.responses, ...grade(p.questions)]),
    [
      ['1º Período', 5, 8, 6, 10],
      ['2º Período', 2, 3.5, 3, 4]
    ]
  );
  assert.deepEqual([a.responses, ...grade(a.questions)], [7, 6.71, 3, 10]); // 47 / 7
  assert.deepEqual(
    b.periods.map(p => [p.period, p.responses, ...grade(p.questions)]),
    [['2º Período', 1, 5, 5, 5]]
  );
  assert.deepEqual([nobody.responses, nobody.periods, ...grade(nobody.questions)], [0, [], null, null, null]);

  // The tutor sees the total; the division by period would expose a group of two students.
  await s.step(id, 'finish');
  await s.step(id, 'publish');
  const [own] = (await s.call(s.tutorA, 'GET', '/api/articulation/mine', undefined, 200)).data;
  assert.deepEqual([own.responses, own.withheld, own.periods, ...grade(own.questions)], [7, false, [], 6.71, 3, 10]);

  // One tab per tutor, even when the tutor has students of two periods, as in the institution's
  // workbook. Sheet names: no character a spreadsheet refuses, 31 characters at most, never
  // repeated, and no sheet for the tutor nobody chose.
  const response = await fetch(`${s.api.base}/api/articulation/results/${id}/export`, {
    headers: {cookie: s.csti.cookie}
  });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const names = book.worksheets.map(w => w.name);
  assert.deepEqual(names, ['Tutor Ficticio com barra e um n', 'Tutor Ficticio com barra e (2)', 'Todas as respostas']);
  for (const name of names) assert.ok(name.length <= 31 && !/[\\/?*[\]:]/.test(name), name);
  const first = book.worksheets[0];
  assert.equal(first.actualRowCount, 1 + 7 + 3);
  assert.deepEqual(first.getCell('B9').value, {formula: 'COUNTA(C2:C8)', result: 7});
  // As in the original, the period shown in the totals is the one of the first answer of the tab.
  assert.deepEqual(first.getCell('D9').value, {formula: 'D2', result: '1º Período'});
  assert.deepEqual(
    ['F9', 'F10', 'F11'].map(address => first.getCell(address).value),
    [
      {formula: 'SUM(F$2:F$8)/$B$9', result: 47 / 7},
      {formula: 'MAX(F$2:F$8)', result: 10},
      {formula: 'MIN(F$2:F$8)', result: 3}
    ]
  );
  assert.deepEqual(first.getCell('H9').value, {formula: 'COUNTIF(H$2:H$8,"Sim")/$B$9', result: 1});
  assert.deepEqual(book.worksheets[1].getCell('F3').value, {formula: 'SUM(F$2:F$2)/$B$3', result: 5});
  assert.equal(book.worksheets[2].actualRowCount, 1 + 8);
});
