'use strict';
// Grouping by modality used by the web charts (apps/web/public/shared/ui.js).
// A percentage exists only where every component in use has a declared maximum (AT-12).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../apps/web/public/shared/ui.js'), 'utf8'), {window});
// Values created inside the vm context have other prototypes; a JSON round trip brings plain ones.
const modalities = (stats, row) => JSON.parse(JSON.stringify(window.SupremaUI.modalities(stats, row)));

const question = (field_key, mean, max_value, used = true) => ({field_key, mean, max_value, used});
const byLabel = list => Object.fromEntries(list.map(item => [item.label, item]));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('cada modalidade e a soma das medias sobre a soma dos maximos', () => {
  const stats = {
    questionStats: [
      question('c1', 1, 2),
      question('c2', 1.5, 2),
      question('c3', null, null, false),
      question('me1', 0.4, 0.5),
      question('me2', 0.3, 0.5)
    ],
    instrumentStats: [
      question('osce', 2, 4),
      question('pbl1', 1, 2),
      question('pbl2', 2, 2),
      question('trabalho', 0.5, 1),
      question('q7', null, null, false)
    ]
  };
  const groups = byLabel(modalities(stats, null));
  assert.deepEqual(Object.keys(groups), [
    'Teórica discursiva',
    'Múltipla escolha',
    'Prática (OSCE)',
    'SAI',
    'Trabalho'
  ]);
  close(groups['Teórica discursiva'].classPct, 2.5 / 4);
  close(groups['Múltipla escolha'].classPct, 0.7);
  close(groups['Prática (OSCE)'].classPct, 0.5);
  close(groups.SAI.classPct, 0.75);
  assert.ok(Object.values(groups).every(group => group.studentPct === null));
});

test('modalidade com componente em uso sem valor maximo nao gera percentual', () => {
  const stats = {
    questionStats: [question('c1', 1, 2), question('c2', 1.5, null), question('me1', 0.4, 0.5)],
    instrumentStats: [question('osce', 2, null), question('pbl1', 1, 2), question('pbl2', 2, null)]
  };
  assert.deepEqual(
    modalities(stats, null).map(group => group.label),
    ['Múltipla escolha']
  );
});

test('estudante: nota ausente nao vale zero; sem nenhuma nota no grupo nao ha percentual', () => {
  const stats = {
    questionStats: [question('c1', 1, 2), question('c2', 1.5, 2), question('me1', 0.4, 0.5)],
    instrumentStats: [question('osce', 2, 4)]
  };
  const groups = byLabel(modalities(stats, {c1: 2, c2: null, me1: 0.25, osce: ''}));
  close(groups['Teórica discursiva'].studentPct, 1); // only c1 was graded: 2 of 2
  close(groups['Múltipla escolha'].studentPct, 0.5);
  assert.equal(groups['Prática (OSCE)'].studentPct, null);
});

test('sem estatisticas publicadas nao ha modalidades', () => {
  assert.deepEqual(modalities(null, null), []);
  assert.deepEqual(modalities({questionStats: [], instrumentStats: []}, {c1: 1}), []);
});
