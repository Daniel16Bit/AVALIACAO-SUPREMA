'use strict';
const D = require('./domain');
function studentPeriod(value, role) {
  const empty = value === undefined || value === null || value === '';
  if (role !== 'ALUNO') {
    if (!empty) D.fail(400, 'O campo Per\u00edodo pertence exclusivamente ao perfil Aluno.');
    return null;
  }
  return empty ? null : D.period(value);
}
module.exports = {studentPeriod};
