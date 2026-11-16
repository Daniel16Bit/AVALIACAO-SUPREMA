'use strict';
// Formulas of the OSCE spreadsheet the institution uses, received on 2026-11-16. Nothing here was
// designed by the system: each function is one formula of that workbook.
//
// One tab per station, one row per student evaluated:
//   Acertos  =(COUNTIF(<items>,"Fez"))*(IF(<posture item>="Fez",1,0.5))
//   NOTA     =(Acertos)/<Total Questões>
// "Total Questões" counts the items of the station; the posture item (the first column of the
// tab, the "pergunta-chave" of the system) is not one of them: it only halves the hits.
//
// "Resultado Final" is a pivot table with the average of NOTA: per student over the stations the
// student was evaluated in, per station over its students, and over every grade of the event.
// A station without an evaluation is left out of the student's average; it is not a zero.
//
// The workbook has no pass mark, no list of best and worst students and no comparison between
// two OSCE rounds, so none of them exists here.

// The text of each answer in the spreadsheet; the formulas count "Fez".
const SHEET_LABELS = {SIM: 'Fez', NAO: 'Não Fez'};
const DONE = 'SIM';

// IF(<posture item>="Fez",1,0.5). A station built without the posture item has no reduction.
const factor = key => (key === undefined || key === DONE ? 1 : 0.5);

// (COUNTIF(<items>,"Fez"))*(IF(<posture item>="Fez",1,0.5))
const hits = (items, key) => items.filter(value => value === DONE).length * factor(key);

// (Acertos)/<Total Questões>. Without items the spreadsheet shows a division by zero: no grade.
const grade = (items, key) => (items.length ? hits(items, key) / items.length : null);

// Average of the pivot table: the grades that exist, added and divided by how many they are.
function average(grades) {
  const present = grades.filter(value => value !== null && value !== undefined);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

// The pivot table shows its numbers with two decimal places (format 0.00).
const shown = value =>
  value === null || value === undefined ? null : Math.round((value + Number.EPSILON) * 100) / 100;

module.exports = {SHEET_LABELS, factor, hits, grade, average, shown};
