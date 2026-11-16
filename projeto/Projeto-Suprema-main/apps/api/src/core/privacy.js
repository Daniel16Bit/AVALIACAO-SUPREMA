'use strict';
// Smallest group for which class figures are shown to a student (S9).
// With two or three published results, the mean, the median or the position
// is enough for one student to work out a classmate's grade.

// Provisional default, pending an institutional decision.
const DEFAULT_MINIMUM = 5;

// Read on every request so the operator's setting applies without code changes.
// An invalid value falls back to the default instead of disabling the protection.
function minimumGroup(env = process.env) {
  const raw = String(env.SUPREMA_MIN_AGGREGATE_STUDENTS ?? '').trim();
  const value = Number(raw);
  return raw !== '' && Number.isInteger(value) && value >= 1 && value <= 1000 ? value : DEFAULT_MINIMUM;
}

// Keeps what belongs to the student or to the assessment itself (count, maximum values)
// and removes everything computed from other students' grades.
function withoutClassFigures(stats) {
  return {
    ...stats,
    avgProva: null,
    stdProva: null,
    avgFinal: null,
    stdFinal: null,
    median: null,
    above: null,
    below: null,
    rank: null,
    meansByKey: Object.fromEntries(Object.keys(stats.meansByKey || {}).map(key => [key, null])),
    questionStats: (stats.questionStats || []).map(question => ({...question, mean: null})),
    instrumentStats: (stats.instrumentStats || []).map(instrument => ({...instrument, mean: null}))
  };
}

module.exports = {DEFAULT_MINIMUM, minimumGroup, withoutClassFigures};
