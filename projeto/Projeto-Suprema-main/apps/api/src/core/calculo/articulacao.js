'use strict';
// Report of the Interdisciplinary Articulation, as computed by the final workbook the institution
// uses (one tab per tutor, one row per student and three rows of totals; received filled in on
// 2026-11-16). This file is the only place where those formulas live. They were read from the
// cells:
//   respondents           =COUNTA(C2:C14)          students listed in the tab
//   grade from 0 to 10    =SUM(F$2:F$14)/$B$15     then =MAX(F$2:F$14) and =MIN(F$2:F$14)
//   yes, partially, no    =COUNTIF(H$2:H$14,"Sim")/$B$15, then "Parcialmente", then "Não"
// The divisor is always the number of respondents of the group, never the number of answers
// to the question. The workbook shows the shares as whole percentages and sets no number of
// decimals for the average, which is shown here with two.
// Nothing else is computed: the workbook has no single performance figure per tutor and no
// ranking, and the institution has no later step of calculation.
const SHEET_LABELS = {SIM: 'Sim', NAO: 'Não', PARCIAL: 'Parcialmente'};
// The three rows of totals, in the order of the workbook. They count the same three answers in
// every yes/no column, including the questions that do not offer "Parcialmente".
const SHEET_SHARES = ['SIM', 'PARCIAL', 'NAO'];
const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;
const numbers = values => values.filter(v => v !== null && v !== undefined && v !== '').map(Number);

// =SUM(range)/respondents, without rounding. Null where the sheet shows #DIV/0!.
const average = (values, respondents) =>
  respondents ? numbers(values).reduce((sum, v) => sum + v, 0) / respondents : null;
// =MIN(range) and =MAX(range). Null when there is no grade.
const lowest = values => (numbers(values).length ? Math.min(...numbers(values)) : null);
const highest = values => (numbers(values).length ? Math.max(...numbers(values)) : null);
// =COUNTIF(range, answer)/respondents, without rounding.
const share = (values, respondents, choice) =>
  respondents ? values.filter(v => v === choice).length / respondents : null;
// The whole percentage the sheet displays (number format "0%").
const wholePercent = ratio => (ratio === null ? null : Math.round(ratio * 100));

// What the screens show for one question of one group. `choices` are the answers the question
// offers; list questions (period, tutor, station) have no figures in the sheet.
function figures(kind, values, respondents, choices) {
  if (kind === 'NOTA_0_10') {
    const mean = average(values, respondents);
    return {average: mean === null ? null : round2(mean), lowest: lowest(values), highest: highest(values)};
  }
  if (choices) return {shares: Object.fromEntries(choices.map(c => [c, wholePercent(share(values, respondents, c))]))};
  return {};
}

module.exports = {SHEET_LABELS, SHEET_SHARES, average, lowest, highest, share, wholePercent, figures};
