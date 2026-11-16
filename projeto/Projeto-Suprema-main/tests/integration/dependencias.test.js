'use strict';
// Guards the directed replacement of `uuid` under exceljs (S11): package.json "overrides".
// The spreadsheet suites never reach the one place where exceljs calls uuid, so this does.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const ExcelJS = require('exceljs');

test('uuid usado pelo exceljs esta na versao corrigida (11.1.1 ou superior)', () => {
  const fromExceljs = createRequire(require.resolve('exceljs'));
  let folder = path.dirname(fromExceljs.resolve('uuid'));
  while (
    !fs.existsSync(path.join(folder, 'package.json')) ||
    JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8')).name !== 'uuid'
  ) {
    const parent = path.dirname(folder);
    assert.notEqual(parent, folder, 'pacote uuid nao encontrado');
    folder = parent;
  }
  const [major, minor, patch] = JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'))
    .version.split('.')
    .map(Number);
  assert.ok(
    major > 11 || (major === 11 && (minor > 1 || (minor === 1 && patch >= 1))),
    `uuid ${major}.${minor}.${patch} e anterior a 11.1.1`
  );
});

test('exceljs grava e le planilha com barra de dados, o recurso que depende do uuid', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Ficticia');
  for (let row = 1; row <= 5; row++) sheet.getCell('A' + row).value = row;
  sheet.addConditionalFormatting({
    ref: 'A1:A5',
    rules: [{type: 'dataBar', cfvo: [{type: 'min'}, {type: 'max'}], color: {argb: 'FF0877E6'}, gradient: false}]
  });
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  const rule = reopened.getWorksheet('Ficticia').conditionalFormattings[0].rules[0];
  assert.equal(rule.type, 'dataBar');
  assert.match(rule.x14Id, /^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}$/);
  assert.deepEqual(
    [1, 2, 3, 4, 5].map(row => reopened.getWorksheet('Ficticia').getCell('A' + row).value),
    [1, 2, 3, 4, 5]
  );
});
