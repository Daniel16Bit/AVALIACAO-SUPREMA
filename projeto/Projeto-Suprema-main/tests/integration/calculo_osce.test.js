'use strict';
// The OSCE grades must be the ones of the spreadsheet the institution uses. The formulas below are
// the ones written in its cells: hits and grade in the tab of each station, and the averages of
// the pivot table "Resultado Final". This test evaluates them the way a spreadsheet does, over a
// grid with the layout of a station tab, and compares every result with core/calculo/osce.js.
// Synthetic data only: nothing of the workbook received is copied here.
const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../../apps/api/src/core/calculo/osce');

// Layout of a station tab: A moment, B student, C evaluator, D posture item, E its comment, then
// one column per item, each followed by a column of comments; hits, grade and station name last.
const SHEET = {
  hits: '=(COUNTIF(#FIRST#ROW:#LAST#ROW,"Fez"))*(IF(D#ROW="Fez",1,0.5))',
  grade: '=(#HITS#ROW)/C$#TOTAL'
};
const letters = n => {
  let name = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};
const number = name => [...name].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

// A spreadsheet in miniature: enough to evaluate the two formulas above and nothing else.
// COUNTIF and the comparison of IF ignore upper and lower case, as in a spreadsheet.
function evaluate(formula, grid) {
  const same = (cell, text) => typeof cell === 'string' && cell.toLowerCase() === text.toLowerCase();
  const hits = formula.match(
    /^=\(COUNTIF\(([A-Z]+)(\d+):([A-Z]+)\2,"([^"]*)"\)\)\*\(IF\(([A-Z]+)\2="([^"]*)",1,0\.5\)\)$/
  );
  if (hits) {
    const [, from, row, to, criterion, posture, wanted] = hits;
    let count = 0;
    for (let column = number(from); column <= number(to); column++)
      if (same(grid[letters(column) + row], criterion)) count++;
    return count * (same(grid[posture + row], wanted) ? 1 : 0.5);
  }
  const grade = formula.match(/^=\(([A-Z]+\d+)\)\/C\$(\d+)$/);
  assert.ok(grade, 'Formula fora do que este teste sabe avaliar: ' + formula);
  return grid['C' + grade[2]] ? grid[grade[1]] / grid['C' + grade[2]] : '#DIV/0!';
}

// One station tab of the institution filled with invented answers. Comments are free text that
// is never the word the formula counts.
function tab(students, items, random) {
  const grid = {},
    pick = () => (random() < 0.7 ? 'Fez' : 'Não Fez'),
    first = 6,
    last = first + items * 2 - 1,
    total = students + 4;
  const rows = [];
  for (let row = 2; row < 2 + students; row++) {
    grid['B' + row] = 'Pessoa Ficticia ' + row;
    grid['D' + row] = random() < 0.85 ? 'Fez' : 'Não Fez';
    const answers = [];
    for (let i = 0; i < items; i++) {
      grid[letters(first + i * 2) + row] = pick();
      if (random() < 0.2) grid[letters(first + i * 2 + 1) + row] = 'Comentario ficticio';
      answers.push(grid[letters(first + i * 2) + row]);
    }
    rows.push({row, answers, posture: grid['D' + row]});
  }
  grid['C' + total] = items;
  const columns = {first: letters(first), last: letters(last), hits: letters(last + 1)};
  const formula = (text, row) =>
    text
      .replaceAll('#FIRST', columns.first)
      .replaceAll('#LAST', columns.last)
      .replaceAll('#HITS', columns.hits)
      .replaceAll('#ROW', row)
      .replaceAll('#TOTAL', total);
  return {grid, rows, columns, formula};
}
const CODES = {Fez: 'SIM', 'Não Fez': 'NAO'};
// Deterministic pseudo-random numbers, so that a failure can be repeated.
function generator(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
// The pivot table of "Resultado Final": average of the rows of "Junção" that match.
const pivot = (rows, match) => {
  const grades = rows.filter(match).map(row => row.grade);
  return grades.length ? grades.reduce((sum, grade) => sum + grade, 0) / grades.length : null;
};

test('exemplo conferido a mao: acertos, reducao pela postura e nota de 0 a 1', () => {
  // Six items, five done, posture done: 5 hits, grade 5/6.
  const five = ['SIM', 'SIM', 'SIM', 'NAO', 'SIM', 'SIM'];
  assert.equal(Calc.hits(five, 'SIM'), 5);
  assert.equal(Calc.grade(five, 'SIM'), 5 / 6);
  // The same answers without the posture: the hits are worth half, 2.5, and the grade 2.5/6.
  assert.equal(Calc.hits(five, 'NAO'), 2.5);
  assert.equal(Calc.grade(five, 'NAO'), 2.5 / 6);
  // Everything done: grade 1. Nothing done: grade 0, with or without the posture.
  assert.equal(Calc.grade(['SIM', 'SIM'], 'SIM'), 1);
  assert.equal(Calc.grade(['NAO', 'NAO'], 'SIM'), 0);
  assert.equal(Calc.grade(['NAO', 'NAO'], 'NAO'), 0);
  // The posture item is not one of the items: it never adds a hit and is not in the divisor.
  assert.equal(Calc.grade(['NAO'], 'SIM'), 0);
  assert.equal(Calc.grade(['SIM'], 'SIM'), 1);
});

test('as formulas da planilha e o sistema dao a mesma nota em 3.000 estacoes inventadas', () => {
  const random = generator(20261116);
  let compared = 0;
  for (let n = 0; n < 3000; n++) {
    const students = 1 + Math.floor(random() * 15),
      items = 1 + Math.floor(random() * 14);
    const {grid, rows, columns, formula} = tab(students, items, random);
    for (const {row, answers, posture} of rows) {
      grid[columns.hits + row] = evaluate(formula(SHEET.hits, row), grid);
      const grade = evaluate(formula(SHEET.grade, row), grid),
        codes = answers.map(answer => CODES[answer]);
      assert.equal(Calc.hits(codes, CODES[posture]), grid[columns.hits + row]);
      assert.equal(Calc.grade(codes, CODES[posture]), grade);
      compared += 2;
    }
  }
  assert.ok(compared > 40000, String(compared));
});

test('Resultado Final: media por aluno, por estacao e geral, como a tabela dinamica', () => {
  const random = generator(8);
  for (let n = 0; n < 500; n++) {
    const students = 2 + Math.floor(random() * 12),
      stations = 1 + Math.floor(random() * 6),
      junction = [], // the tab "Junção": one row per grade
      table = []; // table[student][station]: grade or null
    for (let s = 0; s < students; s++) {
      table.push([]);
      for (let e = 0; e < stations; e++) {
        const items = 3 + e,
          done = random() < 0.85; // some students miss a station
        const grade = done
          ? Calc.grade(
              Array.from({length: items}, () => (random() < 0.7 ? 'SIM' : 'NAO')),
              'SIM'
            )
          : null;
        table[s].push(grade);
        if (done) junction.push({student: s, station: e, grade});
      }
    }
    for (let s = 0; s < students; s++)
      assert.equal(
        Calc.average(table[s]),
        pivot(junction, row => row.student === s)
      );
    for (let e = 0; e < stations; e++)
      assert.equal(
        Calc.average(table.map(row => row[e])),
        pivot(junction, row => row.station === e)
      );
    // The general figure is the average of every grade, not the average of the averages.
    const everything = [];
    for (let e = 0; e < stations; e++) for (let s = 0; s < students; s++) everything.push(table[s][e]);
    assert.ok(Math.abs(Calc.average(everything) - pivot(junction, () => true)) < 1e-12);
  }
});

test('estacao nao avaliada fica fora da media do aluno; nao conta como zero', () => {
  assert.equal(Calc.average([0.5, null, 1]), 0.75);
  assert.equal(Calc.average([0.4, null, null, undefined]), 0.4);
  assert.equal(Calc.average([0, 1]), 0.5); // a grade of zero is a grade
  assert.equal(Calc.average([null, null]), null);
  assert.equal(Calc.average([]), null);
});

test('a postura reduz pela metade sempre que nao e "Fez"; estacao sem o item de postura nao reduz', () => {
  assert.equal(Calc.factor('SIM'), 1);
  assert.equal(Calc.factor('NAO'), 0.5);
  // An empty posture cell is not "Fez": the spreadsheet halves it too.
  assert.equal(Calc.factor(null), 0.5);
  assert.equal(evaluate('=(COUNTIF(F2:I2,"Fez"))*(IF(D2="Fez",1,0.5))', {F2: 'Fez', H2: 'Fez'}), 1);
  assert.equal(Calc.hits(['SIM', 'SIM'], null), 1);
  // The system allows a station built without the posture item; then nothing is reduced.
  assert.equal(Calc.factor(undefined), 1);
  assert.equal(Calc.grade(['SIM', 'NAO'], undefined), 0.5);
});

test('estacao sem itens nao tem nota: a planilha mostra erro de divisao por zero', () => {
  assert.equal(evaluate('=(F2)/C$6', {F2: 0, C6: 0}), '#DIV/0!');
  assert.equal(Calc.grade([], 'SIM'), null);
  assert.equal(Calc.hits([], 'SIM'), 0);
});

test('um comentario igual a palavra "Fez" nao vira acerto no sistema', () => {
  // The range of the original formula covers the columns of comments, so the spreadsheet would
  // count such a comment. The system counts the answers only; its export counts item by item.
  const grid = {D2: 'Fez', F2: 'Fez', G2: 'Fez', H2: 'Não Fez'};
  assert.equal(evaluate('=(COUNTIF(F2:I2,"Fez"))*(IF(D2="Fez",1,0.5))', grid), 2);
  assert.equal(Calc.hits(['SIM', 'NAO'], 'SIM'), 1);
});

test('a planilha conta as respostas pelo texto que o sistema exporta, e mostra duas casas', () => {
  assert.deepEqual(Calc.SHEET_LABELS, {SIM: 'Fez', NAO: 'Não Fez'});
  assert.ok(SHEET.hits.includes('"' + Calc.SHEET_LABELS.SIM + '"'));
  assert.equal(Calc.shown(5 / 6), 0.83);
  assert.equal(Calc.shown(6 / 11), 0.55);
  assert.equal(Calc.shown(0.625), 0.63);
  assert.equal(Calc.shown(0.375), 0.38);
  assert.equal(Calc.shown(1), 1);
  assert.equal(Calc.shown(0), 0);
  assert.equal(Calc.shown(null), null);
});

test('nao existe nota de aprovacao, lista de melhores e piores nem comparacao entre rodadas', () => {
  assert.deepEqual(Object.keys(Calc).sort(), ['SHEET_LABELS', 'average', 'factor', 'grade', 'hits', 'shown']);
});
