'use strict';
// The report of the Interdisciplinary Articulation must give the numbers of the final workbook
// the institution uses (one tab per tutor). The formulas below are the ones written in the cells
// of its three rows of totals. This test evaluates them the way a spreadsheet does, over a grid
// with the layout of a tab, and compares every result with core/calculo/articulacao.js.
// Synthetic data only: nothing of the workbook received is copied here.
const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../../apps/api/src/core/calculo/articulacao');

// Layout of the sheet: students in rows 2 to 14, names in column C.
const FIRST = 2,
  LAST = 14;
const GRADE_COLUMNS = ['F', 'L', 'W', 'X'];
const CHOICE_COLUMNS = ['H', 'I', 'K', 'M', 'O', 'Q', 'S', 'T', 'V'];
// Rows 15, 16 and 17 of every tab, in this order.
const MATRIZ = {
  respondents: '=COUNTA(C2:C14)',
  grade: ['=SUM(#$2:#$14)/$B$15', '=MAX(#$2:#$14)', '=MIN(#$2:#$14)'],
  choice: [
    '=COUNTIF(#$2:#$14,"Sim")/$B$15',
    '=COUNTIF(#$2:#$14,"Parcialmente")/$B$15',
    '=COUNTIF(#$2:#$14,"Não")/$B$15'
  ]
};

// A spreadsheet in miniature: enough to evaluate the formulas above and nothing else.
function evaluate(formula, grid) {
  const range = (column, from, to) => {
    const cells = [];
    for (let row = Number(from); row <= Number(to); row++) cells.push(grid[column + row]);
    return cells;
  };
  const filled = cells => cells.filter(v => v !== undefined && v !== null && v !== '');
  const numeric = cells => filled(cells).filter(v => typeof v === 'number');
  const fn = {
    COUNTA: cells => filled(cells).length,
    SUM: cells => numeric(cells).reduce((sum, v) => sum + v, 0),
    MIN: cells => (numeric(cells).length ? Math.min(...numeric(cells)) : 0),
    MAX: cells => (numeric(cells).length ? Math.max(...numeric(cells)) : 0),
    COUNTIF: (cells, criterion) => cells.filter(v => v === criterion).length
  };
  const found = formula.match(/^=([A-Z]+)\(\$?([A-Z]+)\$?(\d+):\$?[A-Z]+\$?(\d+)(?:,"([^"]*)")?\)(\/\$B\$15)?$/);
  assert.ok(found, 'Formula fora do que este teste sabe avaliar: ' + formula);
  const [, name, column, from, to, criterion, divided] = found;
  const value = fn[name](range(column, from, to), criterion);
  if (!divided) return value;
  return grid.B15 ? value / grid.B15 : '#DIV/0!';
}

// One sheet of the institution filled with invented answers.
function sheet(students, random) {
  const grid = {};
  const pick = list => list[Math.floor(random() * list.length)];
  for (let row = FIRST; row < FIRST + students; row++) {
    grid['C' + row] = 'Pessoa Ficticia ' + row;
    for (const column of GRADE_COLUMNS) grid[column + row] = Math.floor(random() * 11);
    for (const column of CHOICE_COLUMNS) grid[column + row] = pick(['Sim', 'Não', 'Parcialmente']);
  }
  grid.B15 = evaluate(MATRIZ.respondents, grid);
  return grid;
}
const column = (grid, name) => {
  const values = [];
  for (let row = FIRST; row <= LAST; row++) if (grid['C' + row]) values.push(grid[name + row]);
  return values;
};
const CODES = {Sim: 'SIM', Não: 'NAO', Parcialmente: 'PARCIAL'};
// Deterministic pseudo-random numbers, so that a failure can be repeated.
function generator(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

test('exemplo conferido a mao: media, menor e maior nota e percentuais sobre quem respondeu', () => {
  // Five students of one tutor. Grades 10, 8, 8, 7, 4: sum 37, average 7.4.
  const grades = [10, 8, 8, 7, 4];
  assert.equal(Calc.average(grades, 5), 7.4);
  assert.equal(Calc.lowest(grades), 4);
  assert.equal(Calc.highest(grades), 10);
  assert.deepEqual(Calc.figures('NOTA_0_10', grades, 5), {average: 7.4, lowest: 4, highest: 10});
  // Three "Sim", one "Não", one "Parcialmente": 60%, 20%, 20%.
  const answers = ['SIM', 'SIM', 'NAO', 'PARCIAL', 'SIM'];
  assert.deepEqual(Calc.figures('SIM_NAO_PARCIAL', answers, 5, ['SIM', 'NAO', 'PARCIAL']), {
    shares: {SIM: 60, NAO: 20, PARCIAL: 20}
  });
  // A yes/no question shows only its own two answers on screen.
  assert.deepEqual(Calc.figures('SIM_NAO', ['SIM', 'NAO', 'SIM', 'SIM'], 4, ['SIM', 'NAO']), {
    shares: {SIM: 75, NAO: 25}
  });
  // Lists (period, tutor, station) have no totals in the sheet.
  assert.deepEqual(Calc.figures('ESTACAO', ['Estacao Ficticia 1'], 1), {});
});

test('as formulas da planilha e o sistema dao o mesmo resultado em 3.000 planilhas inventadas', () => {
  const random = generator(20261116);
  let compared = 0;
  for (let n = 0; n < 3000; n++) {
    const students = 1 + Math.floor(random() * (LAST - FIRST + 1)); // 1 to 13, the size of the sheet
    const grid = sheet(students, random);
    assert.equal(grid.B15, students);
    for (const name of GRADE_COLUMNS) {
      const values = column(grid, name);
      const [mean, max, min] = MATRIZ.grade.map(f => evaluate(f.replaceAll('#', name), grid));
      assert.equal(Calc.average(values, students), mean);
      assert.equal(Calc.lowest(values), min);
      assert.equal(Calc.highest(values), max);
      compared += 3;
    }
    for (const name of CHOICE_COLUMNS) {
      const values = column(grid, name).map(v => CODES[v]);
      const ratios = MATRIZ.choice.map(f => evaluate(f.replaceAll('#', name), grid));
      Calc.SHEET_SHARES.forEach((code, i) => {
        assert.equal(Calc.share(values, students, code), ratios[i]);
        compared++;
      });
    }
  }
  assert.equal(compared, 3000 * (4 * 3 + 9 * 3));
});

test('a planilha conta as respostas pelo texto que o sistema exporta', () => {
  assert.deepEqual(Calc.SHEET_LABELS, {SIM: 'Sim', NAO: 'Não', PARCIAL: 'Parcialmente'});
  assert.deepEqual(Calc.SHEET_SHARES, ['SIM', 'PARCIAL', 'NAO']);
  for (const [i, code] of Calc.SHEET_SHARES.entries())
    assert.ok(MATRIZ.choice[i].includes('"' + Calc.SHEET_LABELS[code] + '"'));
});

test('o divisor e quem respondeu ao formulario, nao quem respondeu a pergunta', () => {
  // Three students in the sheet, one of them left the grade blank: the sheet still divides by 3.
  const grid = {C2: 'A', C3: 'B', C4: 'C', F2: 9, F3: 6};
  grid.B15 = evaluate(MATRIZ.respondents, grid);
  assert.equal(evaluate('=SUM(F$2:F$14)/$B$15', grid), 5);
  assert.equal(Calc.average([9, 6, null], 3), 5);
  assert.equal(Calc.lowest([9, 6, null]), 6);
  assert.equal(Calc.share(['SIM', undefined, 'SIM'], 3, 'SIM'), 2 / 3);
});

test('arredondamento: percentual inteiro como a planilha exibe, media com duas casas', () => {
  assert.equal(Calc.wholePercent(1 / 8), 13); // 12.5% is displayed as 13%
  assert.equal(Calc.wholePercent(1 / 3), 33);
  assert.equal(Calc.wholePercent(2 / 3), 67);
  assert.equal(Calc.wholePercent(0), 0);
  assert.equal(Calc.wholePercent(1), 100);
  // As in the sheet, three rounded shares may add up to 99 or 101.
  assert.deepEqual(Calc.figures('SIM_NAO_PARCIAL', ['SIM', 'NAO', 'PARCIAL'], 3, ['SIM', 'NAO', 'PARCIAL']).shares, {
    SIM: 33,
    NAO: 33,
    PARCIAL: 33
  });
  assert.equal(Calc.figures('NOTA_0_10', [10, 9, 9], 3).average, 9.33);
  assert.equal(Calc.figures('NOTA_0_10', [8, 8, 9], 3).average, 8.33);
  assert.equal(Calc.figures('NOTA_0_10', [1, 0, 0, 0, 0, 0, 0, 0], 8).average, 0.13);
});

test('grupo sem respostas nao tem numero: a planilha mostra erro de divisao por zero', () => {
  assert.equal(evaluate('=SUM(F$2:F$14)/$B$15', {B15: 0}), '#DIV/0!');
  assert.deepEqual(Calc.figures('NOTA_0_10', [], 0), {average: null, lowest: null, highest: null});
  assert.deepEqual(Calc.figures('SIM_NAO', [], 0, ['SIM', 'NAO']), {shares: {SIM: null, NAO: null}});
});

test('nao existe numero unico de desempenho nem classificacao de tutores', () => {
  assert.deepEqual(Object.keys(Calc).sort(), [
    'SHEET_LABELS',
    'SHEET_SHARES',
    'average',
    'figures',
    'highest',
    'lowest',
    'share',
    'wholePercent'
  ]);
});
