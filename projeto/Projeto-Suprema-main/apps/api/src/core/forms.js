'use strict';
// Forms core: questions, submissions and raw answers (tables of migration 005).
// It knows nothing about OSCE or any other module: each module decides who may build,
// who may answer and who may read, and calls these functions inside its own transaction.
// All SQL of the forms tables lives in this file, so a change of database touches one place.
const crypto = require('node:crypto');
const D = require('./domain');

const ANSWERS = {SIM_NAO: ['SIM', 'NAO'], SIM_NAO_NA: ['SIM', 'NAO', 'NA']};
const LIMITS = {title: 160, question: 300, comment: 500, questions: 60, reason: 300};

function createForm(db, {module, title, createdBy}) {
  const result = db
    .prepare('INSERT INTO forms(module,title,created_by) VALUES(?,?,?)')
    .run(module, D.text(title, LIMITS.title) || module, createdBy);
  return Number(result.lastInsertRowid);
}

const renameForm = (db, formId, title) =>
  db.prepare('UPDATE forms SET title=? WHERE id=?').run(D.text(title, LIMITS.title), formId);

// Answers of both kinds: identified (migration 005) and anonymous (migration 007).
const submissionCount = (db, formId) =>
  db
    .prepare(
      'SELECT (SELECT count(*) FROM form_submissions WHERE form_id=?) + (SELECT count(*) FROM anon_submissions WHERE form_id=?) n'
    )
    .get(formId, formId).n;

// Normalises what a builder typed. Throws 400 with a message that names the problem.
function cleanQuestions(list, {answerType = 'SIM_NAO'} = {}) {
  if (!Array.isArray(list) || list.length > LIMITS.questions) D.fail(400, 'Lista de perguntas inválida.');
  if (!ANSWERS[answerType]) D.fail(400, 'Tipo de resposta inválido.');
  return list.map((question, i) => {
    const text = D.text(question?.text, LIMITS.question);
    if (!text) D.fail(400, `Pergunta ${i + 1} sem texto.`);
    return {text, answer_type: answerType, is_key: question.is_key ? 1 : 0};
  });
}

// Replaces every question. Allowed only while nobody has answered: afterwards the
// questions are what gives meaning to the stored answers.
function replaceQuestions(db, formId, questions) {
  if (submissionCount(db, formId))
    D.fail(409, 'O formulário já recebeu respostas e não pode ter as perguntas alteradas.');
  db.prepare('DELETE FROM form_questions WHERE form_id=?').run(formId);
  const insert = db.prepare('INSERT INTO form_questions(form_id,position,text,answer_type,is_key) VALUES(?,?,?,?,?)');
  questions.forEach((question, i) => insert.run(formId, i + 1, question.text, question.answer_type, question.is_key));
}

const questions = (db, formId) =>
  db
    .prepare('SELECT id,position,text,answer_type,is_key FROM form_questions WHERE form_id=? ORDER BY position')
    .all(formId);

function deleteForm(db, formId) {
  if (submissionCount(db, formId)) D.fail(409, 'O formulário já recebeu respostas e não pode ser excluído.');
  db.prepare('DELETE FROM forms WHERE id=?').run(formId);
}

// One answer for every question of the form, each within the values its type accepts.
function cleanAnswers(db, formId, answers) {
  const list = questions(db, formId);
  if (!list.length) D.fail(409, 'O formulário não tem perguntas.');
  if (!Array.isArray(answers) || answers.length !== list.length) D.fail(400, 'Responda todas as perguntas.');
  const given = new Map();
  for (const answer of answers) {
    const id = Number(answer?.question_id);
    if (given.has(id)) D.fail(400, 'Pergunta respondida mais de uma vez.');
    given.set(id, answer);
  }
  return list.map(question => {
    const answer = given.get(question.id);
    if (!answer) D.fail(400, 'Responda todas as perguntas.');
    if (!ANSWERS[question.answer_type].includes(answer.value))
      D.fail(400, `Resposta inválida na pergunta ${question.position}.`);
    return {
      question_id: question.id,
      value: answer.value,
      comment: D.text(answer.comment ?? '', LIMITS.comment) || null
    };
  });
}

// Stores a submission about a student. Refuses a second valid one for the same form.
function submit(db, {formId, studentId, userId, origin, answers}) {
  const clean = cleanAnswers(db, formId, answers);
  let id;
  try {
    id = Number(
      db
        .prepare('INSERT INTO form_submissions(form_id,subject_student_id,submitted_by,origin) VALUES(?,?,?,?)')
        .run(formId, studentId, userId, origin ? String(origin).slice(0, 64) : null).lastInsertRowid
    );
  } catch (err) {
    if (/UNIQUE constraint failed/i.test(err.message))
      D.fail(
        409,
        'Este aluno já foi avaliado neste formulário. Uma nova resposta só é aceita depois que a anterior for anulada.'
      );
    throw err;
  }
  const insert = db.prepare('INSERT INTO form_answers(submission_id,question_id,value,comment) VALUES(?,?,?,?)');
  for (const answer of clean) insert.run(id, answer.question_id, answer.value, answer.comment);
  return id;
}

// The row stays, marked: what was answered and who voided it remain on record.
function voidSubmission(db, {submissionId, userId, reason}) {
  const text = D.text(reason, LIMITS.reason);
  if (!text) D.fail(400, 'Informe o motivo da anulação.');
  const row = db.prepare('SELECT id,voided_at FROM form_submissions WHERE id=?').get(submissionId);
  if (!row) D.fail(404, 'Resposta não encontrada.');
  if (row.voided_at) D.fail(409, 'Esta resposta já foi anulada.');
  db.prepare('UPDATE form_submissions SET voided_at=CURRENT_TIMESTAMP,voided_by=?,void_reason=? WHERE id=?').run(
    userId,
    text,
    submissionId
  );
}

// Every submission of a form, voided ones included, each with its answers by question id.
function submissions(db, formId) {
  const rows = db
    .prepare(
      `SELECT s.id,s.subject_student_id student_id,s.created_at,s.voided_at,s.void_reason,
      u.name account_name,u.matricula account_login,v.name voided_by_name
    FROM form_submissions s LEFT JOIN users u ON u.id=s.submitted_by LEFT JOIN users v ON v.id=s.voided_by
    WHERE s.form_id=? ORDER BY s.id`
    )
    .all(formId);
  const byId = new Map(rows.map(row => [row.id, {...row, answers: {}}]));
  for (const answer of db
    .prepare(
      'SELECT a.submission_id,a.question_id,a.value,a.comment FROM form_answers a JOIN form_submissions s ON s.id=a.submission_id WHERE s.form_id=?'
    )
    .all(formId))
    byId.get(answer.submission_id).answers[answer.question_id] = {value: answer.value, comment: answer.comment};
  return [...byId.values()];
}

// ---- Anonymous path (migration 007) ---------------------------------------------------------
// `subjectKey` names what is being evaluated and is chosen by the module (for example
// "target:12"). The participation row and the submission are written by the same call and
// share nothing: no student in the submission, no submission in the participation, a random
// identifier and only the day on both.

const today = () => new Date().toISOString().slice(0, 10);

const hasParticipated = (db, formId, subjectKey, studentId) =>
  !!db
    .prepare('SELECT 1 FROM anon_participation WHERE form_id=? AND subject_key=? AND student_id=?')
    .get(formId, subjectKey, studentId);

const participationCount = (db, formId, subjectKey) =>
  db.prepare('SELECT count(*) n FROM anon_participation WHERE form_id=? AND subject_key=?').get(formId, subjectKey).n;

// Subjects of a form this student has already answered about.
const participatedSubjects = (db, formId, studentId) =>
  new Set(
    db
      .prepare('SELECT subject_key FROM anon_participation WHERE form_id=? AND student_id=?')
      .all(formId, studentId)
      .map(row => row.subject_key)
  );

// Stores an anonymous answer. The caller owns the transaction, so both rows exist or neither.
// Nothing is returned that could be kept as a handle to the stored answer.
function submitAnonymous(db, {formId, subjectKey, studentId, answers}) {
  const clean = cleanAnswers(db, formId, answers);
  const day = today();
  try {
    db.prepare('INSERT INTO anon_participation(form_id,subject_key,student_id,answered_on) VALUES(?,?,?,?)').run(
      formId,
      subjectKey,
      studentId,
      day
    );
  } catch (err) {
    if (/UNIQUE constraint failed|PRIMARY KEY/i.test(err.message))
      D.fail(409, 'Você já respondeu esta avaliação. Respostas anônimas não podem ser alteradas.');
    throw err;
  }
  const id = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO anon_submissions(id,form_id,subject_key,answered_on) VALUES(?,?,?,?)').run(
    id,
    formId,
    subjectKey,
    day
  );
  const insert = db.prepare('INSERT INTO anon_answers(submission_id,question_id,value,comment) VALUES(?,?,?,?)');
  for (const answer of clean) insert.run(id, answer.question_id, answer.value, answer.comment);
}

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Counts per question and the comments of each question in a fresh random order on every
// read, without date or identifier: two comments of one person cannot be paired by position.
function anonymousResults(db, formId, subjectKey) {
  const rows = db
    .prepare(
      `SELECT a.question_id,a.value,a.comment FROM anon_answers a JOIN anon_submissions s ON s.id=a.submission_id
    WHERE s.form_id=? AND s.subject_key=?`
    )
    .all(formId, subjectKey);
  const responses = db
    .prepare('SELECT count(*) n FROM anon_submissions WHERE form_id=? AND subject_key=?')
    .get(formId, subjectKey).n;
  return {
    responses,
    questions: questions(db, formId).map(question => {
      const own = rows.filter(row => row.question_id === question.id),
        count = value => own.filter(row => row.value === value).length;
      return {
        id: question.id,
        position: question.position,
        text: question.text,
        sim: count('SIM'),
        nao: count('NAO'),
        na: count('NA'),
        comments: shuffled(own.map(row => row.comment).filter(Boolean))
      };
    })
  };
}

module.exports = {
  ANSWERS,
  LIMITS,
  createForm,
  renameForm,
  cleanQuestions,
  replaceQuestions,
  questions,
  deleteForm,
  submissionCount,
  submit,
  voidSubmission,
  submissions,
  hasParticipated,
  participationCount,
  participatedSubjects,
  submitAnonymous,
  anonymousResults
};
