'use strict';
// The teacher's spreadsheet recalculates the totals in the browser while grades are typed
// (recalcLocal, in features/avaliacoes/app.js). The grade that counts is the one the server
// computes (calcScore, in core/domain.js). This test runs the browser's code against the
// server's for thousands of rows: the preview must never show a total the server would not save.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../../apps/api/src/core/domain');

const source = fs.readFileSync(path.join(__dirname, '../../apps/web/public/features/avaliacoes/app.js'), 'utf8');
function piece(pattern, name) {
  const found = source.match(pattern);
  assert.ok(found, 'Trecho nao encontrado em app.js: ' + name);
  return found[0];
}
// Only the pieces the preview depends on, exactly as they are in the file the browser loads.
const browser = vm.runInNewContext(
  [
    piece(/const questionKeys = \[[^;]*;/, 'chaves das questoes e das estacoes'),
    piece(/function present\(v\) \{[\s\S]*?\n\}\n/, 'present'),
    piece(/function recalcLocal\(r\) \{[\s\S]*?\n\}\n/, 'recalcLocal'),
    '({questionKeys, osceKeys, recalcLocal});'
  ].join('\n')
);

const TYPED = [
  ...D.questionKeys,
  ...D.stationKeys,
  'osce',
  'pbl1',
  'pbl2',
  'q7',
  'q8',
  'q9',
  'trabalho',
  'outros_final'
];
// A reproducible sequence, so a failure can be repeated.
function generator(seed) {
  let state = seed;
  return () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
}
// `grade` turns a random number into a typed grade; a blank field is null or ''.
function row(random, fill, grade) {
  const values = {};
  for (const key of TYPED) {
    const chance = random();
    values[key] = chance > fill ? (chance > 0.97 ? '' : null) : grade(random());
  }
  return values;
}
const same = (a, b) => (a === null || a === undefined ? b === null || b === undefined : Number(a) === Number(b));

// Runs the preview and the server's saving path (normalizeScore) over the same typed rows.
function compare(grade, seed) {
  const random = generator(seed);
  let compared = 0;
  for (const fill of [0, 0.05, 0.3, 0.6, 0.9, 1]) {
    for (let n = 0; n < 1500; n++) {
      const typed = row(random, fill, grade),
        preview = {...typed},
        saved = D.normalizeScore({}, typed);
      browser.recalcLocal(preview);
      for (const key of ['nota_prova', 'nota_final'])
        assert.ok(
          same(preview[key], saved[key]),
          `${key}: tela ${preview[key]} x servidor ${saved[key]} em ${JSON.stringify(typed)}`
        );
      // The OSCE total is replaced only when a station has a grade; otherwise the typed value stays.
      if (D.stationKeys.some(key => typed[key] !== null && typed[key] !== ''))
        assert.ok(
          same(preview.osce, saved.osce),
          `osce: tela ${preview.osce} x servidor ${saved.osce} em ${JSON.stringify(typed)}`
        );
      compared++;
    }
  }
  return compared;
}

test('as chaves de questoes e de estacoes da tela sao as mesmas do servidor', () => {
  assert.deepEqual([...browser.questionKeys], D.questionKeys);
  assert.deepEqual([...browser.osceKeys], D.stationKeys);
  for (const key of TYPED) assert.ok(D.scoreKeys.includes(key), key);
});

test('previa da planilha: mesmos totais que o servidor com notas de duas casas decimais', () => {
  assert.equal(
    compare(r => Math.round(r * 250) / 100, 20261115),
    9000
  ); // 0,00 a 2,50
  assert.equal(
    compare(r => Math.round(r * 1000) / 100, 7),
    9000
  ); // 0,00 a 10,00
});

test('previa da planilha: mesmos totais que o servidor quando a nota digitada tem mais casas', () => {
  // The server keeps two decimal places of each grade before adding; the preview does the same.
  assert.equal(
    compare(r => Math.round(r * 40) / 16, 20261115),
    9000
  ); // passos de 1/16
  assert.equal(
    compare(r => r * 2.5, 99),
    9000
  ); // qualquer valor
});

test('linha vazia: nenhum total, na tela e no servidor', () => {
  const empty = Object.fromEntries(TYPED.map(key => [key, null])),
    preview = {...empty};
  browser.recalcLocal(preview);
  assert.deepEqual([preview.nota_prova, preview.nota_final], [null, null]);
  assert.deepEqual(D.calcScore(empty), {nota_prova: null, osce: null, nota_final: null});
});
