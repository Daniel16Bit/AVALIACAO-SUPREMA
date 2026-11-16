'use strict';
// Maximum value of SAI, OSCE stations, work and other instruments (meeting of 06/11).
// The maximum is optional and never changes how the final grade is added up. Synthetic data.
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {startApi} = require('../fixtures/api');
const {createClass} = require('../fixtures/turma');

function instruments(room) {
  const route = `/api/assessment/${room.ids.A1}/instrument-config`;
  return async function setMax(api, key, max, {expected = 200, cookie = room.cookie, revision} = {}) {
    const current = revision ?? (await room.detail('A1')).assessment.revision;
    return api.call(route, {
      method: 'PUT',
      cookie,
      body: {revision: current, field_key: key, max_value: max},
      expected
    });
  };
}
const byKey = list => Object.fromEntries(list.map(item => [item.field_key, item]));
const metadata = (api, room) =>
  api.runtime.db
    .prepare('SELECT metadata_json FROM published_scores WHERE assessment_id=?')
    .all(room.ids.A1)
    .map(r => JSON.parse(r.metadata_json));

test('sem valor maximo declarado nada muda: publica como antes e nao inventa percentual', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 2, tag: 'SMX'});
  assert.ok((await room.detail('A1')).instrumentConfig.every(i => i.max_value === null));
  await room.setScores('A1', {'ALU-SMX-1': {pbl1: 1.5, osce1: 1, osce2: 0.5, trabalho: 2}, 'ALU-SMX-2': {pbl1: 0.5}});
  assert.equal((await room.publish('A1')).data.updated, 2);
  const stats = byKey((await room.stats('A1')).instrumentStats);
  assert.deepEqual(stats.pbl1, {field_key: 'pbl1', mean: 1, used: true, max_value: null});
  assert.equal(stats.osce.max_value, null);
  assert.equal(stats.pbl2.used, false);
  // The stored publication has the same shape it had before this feature.
  assert.ok(metadata(api, room).every(meta => !Object.hasOwn(meta, 'instrumentConfig')));
  assert.equal((await room.publish('A1')).data.updated, 0);
});

test('professor declara, altera e remove o valor maximo; entradas invalidas sao recusadas', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 1, tag: 'CFG'});
  const setMax = instruments(room);
  const before = (await room.detail('A1')).assessment.revision;
  const saved = await setMax(api, 'pbl1', 2);
  assert.equal(saved.data.revision, before + 1);
  assert.equal(byKey(saved.data.instrumentConfig).pbl1.max_value, 2);
  assert.equal(byKey((await setMax(api, 'pbl1', 2.5)).data.instrumentConfig).pbl1.max_value, 2.5);
  assert.equal(byKey((await setMax(api, 'pbl1', null)).data.instrumentConfig).pbl1.max_value, null);
  for (const key of ['c1', 'nota_final', 'outros_final', 'q10', '']) await setMax(api, key, 2, {expected: 400});
  for (const max of [0, -1, '2', 1e9]) await setMax(api, 'pbl1', max, {expected: 400});
  await setMax(api, 'pbl1', 2, {revision: before, expected: 409});
  assert.equal(
    api.runtime.db.prepare("SELECT count(*) n FROM audit_logs WHERE action='CONFIGURAR_INSTRUMENTO'").get().n,
    3
  );
});

test('so o professor da avaliacao configura; avaliacao encerrada nao aceita', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 1, tag: 'DON'});
  const other = await createClass(api, {students: 1, tag: 'OUT'});
  const setMax = instruments(room);
  await setMax(api, 'pbl1', 2, {cookie: other.cookie, expected: 404});
  await setMax(api, 'pbl1', 2, {cookie: room.students[0].cookie, expected: 403});
  await room.setScores('A1', {'ALU-DON-1': {pbl1: 1}});
  await room.publish('A1');
  const detail = await room.detail('A1');
  await api.call(`/api/assessment/${room.ids.A1}/send-all`, {
    method: 'POST',
    cookie: room.cookie,
    body: {revision: detail.assessment.revision},
    expected: 200
  });
  await setMax(api, 'pbl1', 2, {expected: 423});
});

test('publicacao recusa nota acima do maximo declarado e aceita depois da correcao', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 2, tag: 'PUB'});
  const setMax = instruments(room);
  await setMax(api, 'pbl1', 2);
  await setMax(api, 'osce1', 1);
  await room.setScores('A1', {'ALU-PUB-1': {pbl1: 2.5, osce1: 1.5}, 'ALU-PUB-2': {pbl1: 2, osce1: 1}});
  const refused = await room.publish('A1', 400);
  assert.match(refused.data.error, /SAI 1 com nota acima do valor máximo/);
  assert.match(refused.data.error, /OSCE — Estação 1 com nota acima do valor máximo/);
  assert.equal(api.runtime.db.prepare('SELECT count(*) n FROM published_scores').get().n, 0);
  await room.setScores('A1', {'ALU-PUB-1': {pbl1: 2, osce1: 1}});
  assert.equal((await room.publish('A1')).data.updated, 2);
});

test('a nota final continua a mesma soma, com ou sem valor maximo', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 1, tag: 'SOM'});
  const grades = {c1: 1, me1: 0.5, pbl1: 1.5, pbl2: 0.5, osce1: 1, osce2: 0.75, q7: 0.25, trabalho: 2};
  await room.setScores('A1', {'ALU-SOM-1': grades});
  const before = (await room.detail('A1')).rows[0];
  assert.equal(before.nota_final, 7.5);
  assert.equal(before.osce, 1.75);
  const setMax = instruments(room);
  for (const key of ['pbl1', 'pbl2', 'osce1', 'osce2', 'q7', 'trabalho']) await setMax(api, key, 10);
  await room.setScores('A1', {'ALU-SOM-1': grades});
  const after = (await room.detail('A1')).rows[0];
  assert.deepEqual(
    [after.nota_prova, after.osce, after.nota_final],
    [before.nota_prova, before.osce, before.nota_final]
  );
});

test('estatisticas por instrumento: maximo do OSCE e a soma das estacoes em uso', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 2, tag: 'EST'});
  const setMax = instruments(room);
  await setMax(api, 'pbl1', 2);
  await setMax(api, 'osce1', 1.5);
  await setMax(api, 'osce', 9); // value typed without stations: ignored while stations are in use
  await room.setScores('A1', {
    'ALU-EST-1': {pbl1: 2, osce1: 1.5, osce2: 1},
    'ALU-EST-2': {pbl1: 1, osce1: 0.5, osce2: 0}
  });
  await room.publish('A1');
  let stats = byKey((await room.stats('A1')).instrumentStats);
  assert.deepEqual(stats.pbl1, {field_key: 'pbl1', mean: 1.5, used: true, max_value: 2});
  assert.equal(stats.osce1.max_value, 1.5);
  // Station 2 is in use and has no maximum: the subtotal has no known maximum either.
  assert.equal(stats.osce.max_value, null);
  assert.equal(stats.osce.mean, 1.5);

  await setMax(api, 'osce2', 1);
  await room.publish('A1');
  stats = byKey((await room.stats('A1')).instrumentStats);
  assert.equal(stats.osce.max_value, 2.5);
  // The published version keeps the maxima it was published with.
  assert.deepEqual(
    metadata(api, room)[0].instrumentConfig.map(i => [i.field_key, i.max_value]),
    [
      ['pbl1', 2],
      ['osce1', 1.5],
      ['osce2', 1],
      ['osce', 9]
    ]
  );
});

test('OSCE lancado sem estacoes usa o maximo proprio e e validado na publicacao', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 1, tag: 'DIR'});
  const setMax = instruments(room);
  await setMax(api, 'osce', 4);
  await room.setScores('A1', {'ALU-DIR-1': {osce: 5}});
  assert.match((await room.publish('A1', 400)).data.error, /OSCE com nota acima do valor máximo/);
  await room.setScores('A1', {'ALU-DIR-1': {osce: 3}});
  await room.publish('A1');
  assert.deepEqual(byKey((await room.stats('A1')).instrumentStats).osce, {
    field_key: 'osce',
    mean: 3,
    used: true,
    max_value: 4
  });
});

test('aluno recebe os maximos dos instrumentos; em turma pequena, sem medias da turma', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 2, tag: 'ALN'});
  await instruments(room)(api, 'pbl1', 2);
  await room.setScores('A1', {'ALU-ALN-1': {pbl1: 2}, 'ALU-ALN-2': {pbl1: 1}});
  await room.publish('A1');
  const {data} = await room.studentResult(room.students[0], 'A1');
  assert.equal(data.classFigures.available, false);
  assert.deepEqual(byKey(data.stats.instrumentStats).pbl1, {field_key: 'pbl1', mean: null, used: true, max_value: 2});
  assert.equal(data.row.pbl1, 2);
});

test('importacao de planilha respeita o maximo declarado do instrumento', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 1, tag: 'XLS'});
  await instruments(room)(api, 'pbl1', 2);
  const send = async grade => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('A1');
    sheet.addRow(['Matrícula', 'Nome do aluno', 'SAI 1']);
    sheet.addRow(['ALU-XLS-1', room.students[0].name, grade]);
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(await book.xlsx.writeBuffer())]), 'notas.xlsx');
    const response = await fetch(`${api.base}/api/assessment/${room.ids.A1}/import`, {
      method: 'POST',
      headers: {cookie: room.cookie},
      body: form
    });
    return {status: response.status, data: await response.json()};
  };
  const refused = await send(2.5);
  assert.equal(refused.status, 400);
  assert.match(refused.data.error, /pbl1 excede o maximo 2/);
  assert.equal((await send(2)).status, 200);
});
