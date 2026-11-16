'use strict';
// A synthetic class on top of tests/fixtures/api.js: one teacher, one discipline,
// enrolled students and the A1/A2/A3 the system creates for the offer.
const assert = require('node:assert/strict');

async function createClass(api, {students = 3, tag = 'T', names = []} = {}) {
  const admin = await api.adminSession();
  const post = async (route, body) => {
    const response = await api.call('/api/admin/' + route, {method: 'POST', cookie: admin, body});
    assert.ok(response.status < 300, `POST ${route}: ${JSON.stringify(response.data)}`);
    return response.data;
  };
  const teacher = await api.createUser(admin, 'PROFESSOR', 'PROF-' + tag);
  const pupils = [];
  for (let n = 1; n <= students; n++) {
    pupils.push(
      await api.createUser(admin, 'ALUNO', `ALU-${tag}-${n}`, {
        period: '3',
        ...(names[n - 1] ? {name: names[n - 1]} : {})
      })
    );
  }
  const course = await post('courses', {name: 'Curso Ficticio ' + tag});
  const discipline = await post('disciplines', {course_id: course.id, name: 'Disciplina Ficticia ' + tag, period: '3'});
  const offer = {discipline_id: discipline.id, year: 2026, semester: '2', class_name: ''};
  await post('assignments', {...offer, professor_id: teacher.id});
  for (const pupil of pupils) await post('enrollments', {...offer, student_id: pupil.studentId});

  const cookie = teacher.cookie;
  const list = (await api.call('/api/assessments', {cookie, expected: 200})).data;
  const ids = Object.fromEntries(list.map(a => [a.type, a.id]));
  const detail = async type => (await api.call('/api/assessment/' + ids[type], {cookie, expected: 200})).data;

  // `values` maps a registration to the grades of that student, e.g. {'ALU-T-1': {c1: 2}}.
  async function setScores(type, values, expected = 200) {
    const d = await detail(type);
    const rows = d.rows.filter(r => values[r.matricula]).map(r => ({id: r.id, ...values[r.matricula]}));
    return api.call(`/api/assessment/${ids[type]}/scores`, {
      method: 'PUT',
      cookie,
      body: {revision: d.assessment.revision, rows},
      expected
    });
  }
  async function configureQuestion(type, key, area, max, expected = 200) {
    const d = await detail(type);
    return api.call(`/api/assessment/${ids[type]}/question-config`, {
      method: 'PUT',
      cookie,
      body: {revision: d.assessment.revision, field_key: key, area, max_value: max},
      expected
    });
  }
  async function publish(type, expected = 200) {
    const d = await detail(type);
    return api.call(`/api/assessment/${ids[type]}/publish`, {
      method: 'POST',
      cookie,
      body: {revision: d.assessment.revision},
      expected
    });
  }
  const stats = async type => (await api.call(`/api/assessment/${ids[type]}/stats`, {cookie, expected: 200})).data;
  const studentResult = (pupil, type, expected = 200) =>
    api.call('/api/student/assessment/' + ids[type], {cookie: pupil.cookie, expected});

  return {
    admin,
    teacher,
    cookie,
    students: pupils,
    course,
    discipline,
    ids,
    detail,
    setScores,
    configureQuestion,
    publish,
    stats,
    studentResult
  };
}

module.exports = {createClass};
