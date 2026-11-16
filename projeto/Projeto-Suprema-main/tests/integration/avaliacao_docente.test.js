'use strict';
// Teacher evaluation, anonymous (stage 6): permissions of the four profiles, the campaign
// life cycle, who may answer about whom, and above all that nothing stored links an answer
// to the student who gave it. Results only after closing and above the minimum. Synthetic data.
const test = require('node:test');
const assert = require('node:assert/strict');
const {startApi} = require('../fixtures/api');
const {createClass} = require('../fixtures/turma');
const manifest = require('../../apps/api/src/modules');

async function setup(t, {students = 5, second = 0} = {}) {
  const api = await startApi(t);
  const room = await createClass(api, {students, tag: 'DOC'});
  const other = second ? await createClass(api, {students: second, tag: 'OUT'}) : null;
  const csti = await api.createUser(room.admin, 'CSTI', 'CSTI-1');
  const coord = await api.createUser(room.admin, 'COORDENACAO', 'COORD-1');
  const call = (who, method, route, body, expected) =>
    api.call('/api/teacher-eval' + route, {method, cookie: who.cookie, body, expected});
  const header = {year: 2026, semester: '2', round_name: 'Fim do semestre', period: '3'};
  const detail = async id => (await call(csti, 'GET', '/campaigns/' + id, undefined, 200)).data;
  async function released(extra = {}) {
    const id = (await call(csti, 'POST', '/campaigns', header, 201)).data.id,
      d = await detail(id);
    await call(
      csti,
      'PUT',
      '/campaigns/' + id,
      {
        ...d.campaign,
        questions: [{text: 'Foi pontual?'}, {text: 'Explicou com clareza?'}],
        assignment_ids: d.assignment_ids,
        ...extra
      },
      200
    );
    await call(csti, 'POST', `/campaigns/${id}/release`, {revision: (await detail(id)).campaign.revision}, 200);
    return id;
  }
  const pending = async student => (await call(student, 'GET', '/pending', undefined, 200)).data;
  // Answers about the first pending target of the student whose discipline matches `tag`.
  async function answer(student, values, comment = '', expected = 201, tag = '') {
    const target = (await pending(student)).find(item => item.discipline_name.includes(tag));
    const form = (await call(student, 'GET', '/targets/' + target.id, undefined, 200)).data;
    return call(
      student,
      'POST',
      `/targets/${target.id}/answers`,
      {answers: form.questions.map((q, i) => ({question_id: q.id, value: values[i], comment: i === 0 ? comment : ''}))},
      expected
    );
  }
  const close = id => call(csti, 'POST', `/campaigns/${id}/close`, {}, 200);
  return {api, db: api.runtime.db, room, other, csti, coord, call, header, detail, released, pending, answer, close};
}

test('permissoes: cada um dos quatro perfis alcanca so a sua parte', async t => {
  const s = await setup(t, {students: 1});
  const id = await s.released(),
    student = s.room.students[0],
    target = (await s.pending(student))[0];
  const nucleo = await s.api.createUser(s.room.admin, 'NUCLEO_AVALIACAO', 'NUC-1');
  const groups = {
    manage: [
      ['GET', '/campaigns'],
      ['POST', '/campaigns'],
      ['GET', '/campaigns/' + id],
      ['PUT', '/campaigns/' + id],
      ['POST', `/campaigns/${id}/close`]
    ],
    answer: [
      ['GET', '/pending'],
      ['GET', '/targets/' + target.id],
      ['POST', `/targets/${target.id}/answers`]
    ],
    own: [['GET', '/mine']],
    all: [['GET', '/results']]
  };
  const holders = {manage: s.csti, answer: student, own: s.room.teacher, all: s.coord};
  for (const [group, routes] of Object.entries(groups)) {
    for (const who of [
      ...Object.entries(holders)
        .filter(([name]) => name !== group)
        .map(([, user]) => user),
      {cookie: s.room.admin},
      nucleo
    ]) {
      for (const [method, route] of routes) await s.call(who, method, route, method === 'GET' ? undefined : {}, 403);
    }
  }
  assert.equal((await s.api.call('/api/teacher-eval/results')).status, 401);
  const granted = s.db
    .prepare("SELECT role,permission FROM role_permissions WHERE permission LIKE 'teacher_eval.%' ORDER BY role")
    .all();
  assert.deepEqual(
    granted.map(g => g.role + ':' + g.permission),
    [
      'ALUNO:teacher_eval.answer',
      'COORDENACAO:teacher_eval.all',
      'CSTI:teacher_eval.manage',
      'PROFESSOR:teacher_eval.own'
    ]
  );
});

test('rascunho: nasce com os professores do periodo; valida, libera e trava a estrutura', async t => {
  const s = await setup(t, {students: 2});
  const id = (await s.call(s.csti, 'POST', '/campaigns', s.header, 201)).data.id,
    d = await s.detail(id);
  assert.equal(d.campaign.title, 'Fim do semestre · 2026.2 · 3º período');
  assert.deepEqual([d.campaign.status, d.campaign.min_responses], ['RASCUNHO', 5]);
  assert.deepEqual(
    d.candidates.map(c => [c.professor_name, c.discipline_name, c.eligible]),
    [[s.room.teacher.name, 'Disciplina Ficticia DOC', 2]]
  );
  assert.equal(d.assignment_ids.length, 1);
  await s.call(s.csti, 'POST', '/campaigns', s.header, 409);
  for (const invalid of [{round_name: ''}, {period: 'x'}, {semester: '3'}, {year: 1500}])
    await s.call(s.csti, 'POST', '/campaigns', {...s.header, ...invalid}, 400);

  const body = {...d.campaign, questions: [{text: 'Foi pontual?'}], assignment_ids: d.assignment_ids};
  for (const min of [2, 0, 4.5, '5'])
    await s.call(s.csti, 'PUT', '/campaigns/' + id, {...body, min_responses: min}, 400);
  await s.call(s.csti, 'PUT', '/campaigns/' + id, {...body, assignment_ids: [999999]}, 400);
  await s.call(s.csti, 'PUT', '/campaigns/' + id, {...body, questions: [{text: ' '}]}, 400);
  // No questions yet: release is refused and says why.
  const blocked = await s.call(s.csti, 'POST', `/campaigns/${id}/release`, {revision: d.campaign.revision}, 400);
  assert.match(blocked.data.error, /nenhuma pergunta/);
  await s.call(s.csti, 'PUT', '/campaigns/' + id, {...body, min_responses: 3}, 200);
  await s.call(s.csti, 'PUT', '/campaigns/' + id, body, 409); // stale revision
  const saved = await s.detail(id);
  assert.deepEqual([saved.questions, saved.campaign.min_responses], [[{text: 'Foi pontual?'}], 3]);
  await s.call(s.csti, 'POST', `/campaigns/${id}/release`, {revision: saved.campaign.revision}, 200);
  await s.call(s.csti, 'PUT', '/campaigns/' + id, {...body, revision: saved.campaign.revision + 1}, 423);
  await s.call(s.csti, 'DELETE', '/campaigns/' + id, undefined, 409);
  // Nobody answered: it may go back to draft, and a draft may be deleted.
  await s.call(s.csti, 'POST', `/campaigns/${id}/reopen`, {}, 200);
  await s.call(s.csti, 'DELETE', '/campaigns/' + id, undefined, 200);
  assert.equal(s.db.prepare('SELECT count(*) n FROM forms').get().n, 0);
});

test('aluno responde uma vez sobre o professor da disciplina em que esta matriculado', async t => {
  const s = await setup(t, {students: 2});
  const outsider = await s.api.createUser(s.room.admin, 'ALUNO', 'ALU-FORA-1', {period: '3'}); // same period, not enrolled
  await s.call(s.csti, 'POST', '/campaigns', {...s.header, round_name: 'Rascunho que ninguem ve'}, 201);
  const id = await s.released(),
    [first, second] = s.room.students;
  const list = await s.pending(first);
  assert.deepEqual(
    list.map(item => [item.campaign, item.professor_name, item.discipline_name, item.answered]),
    [['Fim do semestre · 2026.2 · 3º período', s.room.teacher.name, 'Disciplina Ficticia DOC', false]]
  );
  assert.deepEqual(await s.pending(outsider), []);
  await s.call(outsider, 'GET', '/targets/' + list[0].id, undefined, 404);
  await s.call(outsider, 'POST', `/targets/${list[0].id}/answers`, {answers: []}, 404);

  const route = `/targets/${list[0].id}/answers`,
    q = (await s.call(first, 'GET', '/targets/' + list[0].id, undefined, 200)).data.questions;
  await s.call(first, 'POST', route, {answers: [{question_id: q[0].id, value: 'SIM'}]}, 400);
  await s.call(first, 'POST', route, {answers: q.map(x => ({question_id: x.id, value: 'TALVEZ'}))}, 400);
  await s.answer(first, ['NA', 'NAO'], 'Comentario ficticio');
  assert.equal((await s.pending(first))[0].answered, true);
  await s.call(first, 'GET', '/targets/' + list[0].id, undefined, 409);
  const again = await s.call(first, 'POST', route, {answers: q.map(x => ({question_id: x.id, value: 'SIM'}))}, 409);
  assert.match(again.data.error, /já respondeu/);
  assert.equal(s.db.prepare('SELECT count(*) n FROM anon_submissions').get().n, 1);

  await s.close(id);
  assert.deepEqual(await s.pending(second), []);
  await s.call(second, 'GET', '/targets/' + list[0].id, undefined, 404);
});

test('anonimato no banco: nada liga uma resposta ao aluno que a deu', async t => {
  const s = await setup(t, {students: 3});
  const id = await s.released();
  for (const [i, student] of s.room.students.entries())
    await s.answer(student, ['SIM', i ? 'NAO' : 'NA'], 'Comentario ficticio ' + i);
  const columns = table =>
    s.db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map(c => c.name);
  // The answers carry no student, account, session, hour or sequence.
  assert.deepEqual(columns('anon_submissions'), ['id', 'form_id', 'subject_key', 'answered_on']);
  assert.deepEqual(columns('anon_answers'), ['submission_id', 'question_id', 'value', 'comment']);
  // The participation carries no reference to a submission.
  assert.deepEqual(columns('anon_participation'), ['form_id', 'subject_key', 'student_id', 'answered_on']);
  for (const table of ['anon_submissions', 'anon_answers', 'anon_participation'])
    assert.throws(() => s.db.prepare(`SELECT rowid FROM ${table}`).all(), /no such column/, table);

  const submissions = s.db.prepare('SELECT * FROM anon_submissions').all(),
    participation = s.db.prepare('SELECT * FROM anon_participation').all();
  assert.equal(submissions.length, 3);
  assert.equal(new Set(submissions.map(row => row.id)).size, 3);
  for (const row of submissions) {
    assert.match(row.id, /^[0-9a-f]{32}$/);
    assert.match(row.answered_on, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const row of participation) assert.match(row.answered_on, /^\d{4}-\d{2}-\d{2}$/);
  // No identifier of a person appears anywhere in what was answered.
  const stored = JSON.stringify([submissions, s.db.prepare('SELECT * FROM anon_answers').all()]);
  for (const student of s.room.students)
    for (const mark of [student.matricula, student.name, student.email]) assert.ok(!stored.includes(mark), mark);
  // The identified path of the forms core stays unused by this module.
  assert.equal(s.db.prepare('SELECT count(*) n FROM form_submissions').get().n, 0);

  // The audit trail says that a student answered in the campaign: no teacher, no content.
  const log = s.db
    .prepare("SELECT details FROM audit_logs WHERE action='DOCENTE_RESPONDER'")
    .all()
    .map(row => JSON.parse(row.details));
  assert.equal(log.length, 3);
  for (const details of log) assert.deepEqual(Object.keys(details).sort(), ['actor_id', 'campaign_id']);
  assert.ok(log.every(details => details.campaign_id === id));

  // Adherence reaches the CSTI as counts only.
  const d = await s.detail(id);
  assert.deepEqual(
    d.adherence.map(a => [a.eligible, a.answered]),
    [[3, 3]]
  );
  for (const student of s.room.students) assert.ok(!JSON.stringify(d).includes(student.matricula));
});

test('respostas e participacoes nao podem ser alteradas nem apagadas, nem direto no banco', async t => {
  const s = await setup(t, {students: 1});
  await s.released();
  await s.answer(s.room.students[0], ['SIM', 'SIM']);
  const blocked = [
    ["UPDATE anon_answers SET value='NAO'", /nao podem ser alteradas/],
    ['DELETE FROM anon_answers', /nao podem ser apagadas/],
    ["UPDATE anon_submissions SET answered_on='2000-01-01'", /nao podem ser alteradas/],
    ['DELETE FROM anon_submissions', /nao podem ser apagadas/],
    ['UPDATE anon_participation SET student_id=student_id', /nao podem ser alterados/],
    ['DELETE FROM anon_participation', /nao podem ser apagados/]
  ];
  for (const [sql, message] of blocked) assert.throws(() => s.db.prepare(sql).run(), message, sql);
});

test('resultado so aparece depois de encerrar e a partir do minimo de respostas', async t => {
  const s = await setup(t, {students: 5});
  const id = await s.released();
  for (const student of s.room.students.slice(0, 4)) await s.answer(student, ['SIM', 'NAO'], 'Comentario ficticio');
  // During the collection nobody sees any result.
  assert.deepEqual((await s.call(s.room.teacher, 'GET', '/mine', undefined, 200)).data, []);
  assert.deepEqual((await s.call(s.coord, 'GET', '/results', undefined, 200)).data, {campaigns: [], targets: []});
  await s.close(id);
  // Four answers, minimum of five: the count is known, nothing else.
  const [mine] = (await s.call(s.room.teacher, 'GET', '/mine', undefined, 200)).data;
  assert.deepEqual(
    [mine.responses, mine.min_responses, mine.sufficient, mine.questions, mine.total],
    [4, 5, false, [], null]
  );
  const all = (await s.call(s.coord, 'GET', '/results', undefined, 200)).data;
  assert.deepEqual([all.targets[0].sufficient, all.targets[0].questions, all.targets[0].total], [false, [], null]);
  assert.deepEqual([all.campaigns[0].insufficient, all.campaigns[0].total], [1, {sim: 0, nao: 0, na: 0}]);
  assert.doesNotMatch(JSON.stringify([mine, all]), /Comentario ficticio/);
});

test('resultados: percentuais por pergunta, "nao se aplica" a parte, professor ve so os seus', async t => {
  const s = await setup(t, {students: 5, second: 3});
  const id = await s.released();
  const values = [
    ['SIM', 'SIM'],
    ['SIM', 'NAO'],
    ['SIM', 'NA'],
    ['NAO', 'NA'],
    ['NA', 'NAO']
  ];
  for (const [i, student] of s.room.students.entries()) await s.answer(student, values[i], 'Comentario ' + i);
  for (const student of s.other.students) await s.answer(student, ['NAO', 'NAO'], 'Outro comentario', 201, 'OUT');
  await s.close(id);

  const mine = (await s.call(s.room.teacher, 'GET', '/mine', undefined, 200)).data;
  assert.equal(mine.length, 1);
  const [own] = mine;
  assert.deepEqual([own.discipline_name, own.responses, own.sufficient], ['Disciplina Ficticia DOC', 5, true]);
  assert.deepEqual(
    own.questions.map(q => [q.text, q.sim, q.nao, q.na]),
    [
      ['Foi pontual?', 3, 1, 1],
      ['Explicou com clareza?', 1, 2, 2]
    ]
  );
  assert.deepEqual(own.total, {sim: 4, nao: 3, na: 3});
  assert.deepEqual(
    [...own.questions[0].comments].sort(),
    [0, 1, 2, 3, 4].map(i => 'Comentario ' + i)
  );
  // Comments come as loose text: no date, no identifier, and in a different order on each read.
  assert.ok(own.questions[0].comments.every(comment => typeof comment === 'string'));
  assert.ok(!Object.hasOwn(own, 'professor_name'));
  const orders = new Set();
  for (let n = 0; n < 12; n++)
    orders.add((await s.call(s.room.teacher, 'GET', '/mine', undefined, 200)).data[0].questions[0].comments.join('|'));
  assert.ok(orders.size > 1, 'os comentarios vieram sempre na mesma ordem');

  // The other teacher has three answers: below the minimum, nothing but the count.
  const theirs = (await s.call(s.other.teacher, 'GET', '/mine', undefined, 200)).data;
  assert.deepEqual(
    theirs.map(r => [r.discipline_name, r.responses, r.sufficient, r.total]),
    [['Disciplina Ficticia OUT', 3, false, null]]
  );

  const all = (await s.call(s.coord, 'GET', '/results', undefined, 200)).data;
  assert.deepEqual(
    all.targets.map(r => [r.professor_name, r.sufficient]),
    [
      [s.room.teacher.name, true],
      [s.other.teacher.name, false]
    ]
  );
  // The general figure adds only the target that reached the minimum.
  assert.deepEqual(
    all.campaigns.map(c => [c.targets, c.insufficient, c.total]),
    [[2, 1, {sim: 4, nao: 3, na: 3}]]
  );
  assert.doesNotMatch(JSON.stringify(all), /Outro comentario/);
  for (const student of [...s.room.students, ...s.other.students])
    assert.ok(!JSON.stringify([mine, all]).includes(student.matricula));
});

test('encerramento e definitivo; com respostas a avaliacao nao volta a rascunho', async t => {
  const s = await setup(t, {students: 1});
  const id = await s.released();
  await s.answer(s.room.students[0], ['SIM', 'SIM']);
  await s.call(s.csti, 'POST', `/campaigns/${id}/reopen`, {}, 409);
  await s.close(id);
  const refused = await s.call(s.csti, 'POST', `/campaigns/${id}/reopen`, {}, 409);
  assert.match(refused.data.error, /não pode ser reaberta/);
  await s.call(s.csti, 'POST', `/campaigns/${id}/close`, {}, 409);
  assert.equal((await s.detail(id)).campaign.status, 'ENCERRADO');
  const actions = s.db
    .prepare("SELECT action FROM audit_logs WHERE action LIKE 'DOCENTE_%' ORDER BY id")
    .all()
    .map(row => row.action);
  assert.deepEqual(actions, [
    'DOCENTE_CRIAR',
    'DOCENTE_SALVAR',
    'DOCENTE_LIBERAR',
    'DOCENTE_RESPONDER',
    'DOCENTE_ENCERRAR'
  ]);
});

test('falha ao carregar o modulo nao derruba o restante do sistema', async t => {
  const broken = manifest.map(feature =>
    feature.id === 'avaliacao-docente'
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
  const down = await api.call('/api/teacher-eval/campaigns', {cookie: admin, expected: 503});
  assert.deepEqual([down.data.code, down.data.module], ['MODULE_UNAVAILABLE', 'avaliacao-docente']);
  await api.call('/api/admin/users', {cookie: admin, expected: 200});
  await api.call('/api/osce/events', {cookie: admin, expected: 403});
});
