'use strict';
// Class figures are withheld from students in small groups (S9). Synthetic data.
const test = require('node:test');
const assert = require('node:assert/strict');
const {startApi} = require('../fixtures/api');
const {createClass} = require('../fixtures/turma');
const {minimumGroup, DEFAULT_MINIMUM} = require('../../apps/api/src/core/privacy');

// Publishes an A1 where each student has a distinct grade in question 1 (maximum 10).
async function publishedClass(t, students, tag) {
  const api = await startApi(t);
  const room = await createClass(api, {students, tag});
  await room.configureQuestion('A1', 'c1', 'Area Ficticia', 10);
  await room.setScores('A1', Object.fromEntries(room.students.map((s, i) => [s.matricula, {c1: 4 + i}])));
  await room.publish('A1');
  return room;
}

function withMinimum(t, value) {
  const previous = process.env.SUPREMA_MIN_AGGREGATE_STUDENTS;
  if (value === undefined) delete process.env.SUPREMA_MIN_AGGREGATE_STUDENTS;
  else process.env.SUPREMA_MIN_AGGREGATE_STUDENTS = value;
  t.after(() => {
    if (previous === undefined) delete process.env.SUPREMA_MIN_AGGREGATE_STUDENTS;
    else process.env.SUPREMA_MIN_AGGREGATE_STUDENTS = previous;
  });
}

test('minimo configuravel: valor invalido volta ao padrao, nunca desliga a protecao', () => {
  assert.equal(DEFAULT_MINIMUM, 5);
  assert.equal(minimumGroup({}), 5);
  assert.equal(minimumGroup({SUPREMA_MIN_AGGREGATE_STUDENTS: '8'}), 8);
  for (const invalid of ['0', '-3', '2.5', 'muitos', ''])
    assert.equal(minimumGroup({SUPREMA_MIN_AGGREGATE_STUDENTS: invalid}), 5, invalid);
});

test('turma com 2 resultados: o aluno ve a propria nota e nenhum numero da turma', async t => {
  withMinimum(t, undefined);
  const room = await publishedClass(t, 2, 'PEQ');
  const {data} = await room.studentResult(room.students[0], 'A1');
  assert.equal(data.row.c1, 4);
  assert.equal(data.row.nota_final, 4);
  assert.deepEqual(data.classFigures, {available: false, minimum: 5});
  for (const key of ['avgProva', 'stdProva', 'avgFinal', 'stdFinal', 'median', 'above', 'below', 'rank'])
    assert.equal(data.stats[key], null, key);
  assert.ok(Object.values(data.stats.meansByKey).every(value => value === null));
  assert.ok(data.questionStats.every(q => q.mean === null));
  assert.ok(data.stats.questionStats.every(q => q.mean === null));
  // What describes the assessment itself is still there.
  assert.equal(data.stats.provaMax, 10);
  assert.equal(data.questionStats.find(q => q.field_key === 'c1').max_value, 10);
  // The other student's grade (5) appears nowhere in the answer.
  assert.doesNotMatch(JSON.stringify({stats: data.stats, questionStats: data.questionStats}), /\b4\.5\b|:5[,}]/);
});

test('turma com 5 resultados: os numeros da turma sao exibidos como antes', async t => {
  withMinimum(t, undefined);
  const room = await publishedClass(t, 5, 'GRA');
  const {data} = await room.studentResult(room.students[0], 'A1');
  assert.deepEqual(data.classFigures, {available: true, minimum: 5});
  assert.equal(data.stats.count, 5);
  assert.equal(data.stats.avgFinal, 6);
  assert.equal(data.stats.median, 6);
  assert.equal(data.stats.rank, 5);
  assert.equal(data.questionStats.find(q => q.field_key === 'c1').mean, 6);
});

test('o minimo configurado vale na requisicao seguinte, sem reiniciar', async t => {
  withMinimum(t, '2');
  const room = await publishedClass(t, 2, 'CFG');
  assert.equal((await room.studentResult(room.students[0], 'A1')).data.classFigures.available, true);
  process.env.SUPREMA_MIN_AGGREGATE_STUDENTS = '3';
  const restricted = (await room.studentResult(room.students[0], 'A1')).data;
  assert.deepEqual(restricted.classFigures, {available: false, minimum: 3});
  assert.equal(restricted.stats.avgFinal, null);
});

test('o professor continua vendo as estatisticas da turma pequena', async t => {
  withMinimum(t, undefined);
  const room = await publishedClass(t, 2, 'PRO');
  const stats = await room.stats('A1');
  assert.equal(stats.count, 2);
  assert.equal(stats.avgFinal, 4.5);
  assert.equal(stats.rows.length, 2);
});
