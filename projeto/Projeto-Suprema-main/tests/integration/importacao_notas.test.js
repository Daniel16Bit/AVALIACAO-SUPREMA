'use strict';
// Grade import matches students by registration only (S7, AT-10). Synthetic data.
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {startApi} = require('../fixtures/api');
const {createClass} = require('../fixtures/turma');

async function workbook(rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('A1');
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function importSheet(api, room, rows) {
  const form = new FormData();
  form.append('file', new Blob([await workbook(rows)]), 'notas.xlsx');
  const response = await fetch(`${api.base}/api/assessment/${room.ids.A1}/import`, {
    method: 'POST',
    headers: {cookie: room.cookie},
    body: form
  });
  return {status: response.status, data: await response.json()};
}

const draftGrades = async room => Object.fromEntries((await room.detail('A1')).rows.map(r => [r.matricula, r.c1]));

test('planilha com matricula: associa pela matricula, mesmo com o nome trocado', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 2, tag: 'IMP'});
  const preview = await importSheet(api, room, [
    ['Matrícula', 'Nome do aluno', 'Questão 1'],
    ['ALU-IMP-1', room.students[1].name, 1.5],
    ['ALU-IMP-2', room.students[0].name, 2.5]
  ]);
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.deepEqual(
    preview.data.changes.map(c => [c.matricula, c.values.c1]),
    [
      ['ALU-IMP-1', 1.5],
      ['ALU-IMP-2', 2.5]
    ]
  );
});

test('planilha sem coluna de matricula e recusada, mesmo com nomes unicos', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 2, tag: 'SEM'});
  const refused = await importSheet(api, room, [
    ['Nome do aluno', 'Questão 1'],
    [room.students[0].name, 1.5],
    [room.students[1].name, 2.5]
  ]);
  assert.equal(refused.status, 400);
  assert.match(refused.data.error, /não tem a coluna Matrícula/);
  assert.deepEqual(await draftGrades(room), {'ALU-SEM-1': null, 'ALU-SEM-2': null});
});

test('linha com nota e sem matricula bloqueia a importacao inteira', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 2, tag: 'LIN'});
  const refused = await importSheet(api, room, [
    ['Matrícula', 'Nome do aluno', 'Questão 1'],
    ['ALU-LIN-1', room.students[0].name, 1.5],
    ['', room.students[1].name, 2.5]
  ]);
  assert.equal(refused.status, 400);
  assert.match(refused.data.error, /Linha 3: matrícula não informada/);
  assert.deepEqual(await draftGrades(room), {'ALU-LIN-1': null, 'ALU-LIN-2': null});
});

test('matricula de fora da avaliacao e recusada; linha sem matricula e sem nota e ignorada', async t => {
  const api = await startApi(t);
  const room = await createClass(api, {students: 1, tag: 'FOR'});
  const refused = await importSheet(api, room, [
    ['Matrícula', 'Nome do aluno', 'Questão 1'],
    ['ALU-OUTRA-9', 'Pessoa Ficticia de Fora', 1]
  ]);
  assert.equal(refused.status, 400);
  assert.match(refused.data.error, /Linha 2: matrícula não encontrada nesta avaliação/);

  const accepted = await importSheet(api, room, [
    ['Matrícula', 'Nome do aluno', 'Questão 1'],
    ['ALU-FOR-1', room.students[0].name, 1],
    ['', 'Observacao ficticia sem nota', '']
  ]);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal(accepted.data.updated, 1);
});
