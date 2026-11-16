'use strict';
// Data access of the interdisciplinary articulation module: all its SQL is here.
const LISTS = ['PERIODO', 'TUTOR', 'ESTACAO'];
const KINDS = ['NOTA_0_10', 'SIM_NAO', 'SIM_NAO_PARCIAL', ...LISTS];
const CHOICES = {SIM_NAO: ['SIM', 'NAO'], SIM_NAO_PARCIAL: ['SIM', 'NAO', 'PARCIAL']};

// The questions of the form the institution used until now. Each new form starts with them
// and the CSTI may change, add or remove any question while the form is a draft.
const TEMPLATE = [
  ['Identificação', 'Período do curso', 'PERIODO', 0],
  ['Identificação', 'Nome do Tutor', 'TUTOR', 0],
  [
    'Identificação',
    '1 – Como você avalia o conjunto de atividades (Abertura, Estações de Apoio e Fechamento) da semana de Articulação Interdisciplinar?',
    'NOTA_0_10',
    1
  ],
  ['2 – Abertura do caso', '2.1 - O tutor foi pontual para o início das atividades?', 'SIM_NAO', 0],
  ['2 – Abertura do caso', '2.2 O tutor seguiu de forma correta os passos do processo tutorial?', 'SIM_NAO_PARCIAL', 1],
  ['2 – Abertura do caso', '2.3 O Tutor apresentou cada passo do processo tutorial?', 'SIM_NAO_PARCIAL', 0],
  ['2 – Abertura do caso', '2.4 Qual a sua nota para o tutor na abertura do caso?', 'NOTA_0_10', 0],
  ['Estações de apoio', '3.1 As estações de apoio estavam adequadas ao caso?', 'SIM_NAO_PARCIAL', 1],
  ['Estações de apoio', '3.2 As estações de apoio iniciaram no horário marcado?', 'SIM_NAO_PARCIAL', 1],
  [
    'Estações de apoio',
    '3.3 As estações de apoio contribuíram para a construção do conhecimento e para responder aos objetivos de aprendizagem?',
    'SIM_NAO_PARCIAL',
    1
  ],
  ['Estações de apoio', '3.4 Qual a estação de apoio você mais gostou?', 'ESTACAO', 1],
  ['Estações de apoio', '3.5 Qual a estação de apoio você menos gostou?', 'ESTACAO', 1],
  ['4 – Fechamento do caso', '4.1 O tutor foi pontual para o início das atividades?', 'SIM_NAO', 0],
  [
    '4 – Fechamento do caso',
    '4.2 O tutor seguiu de forma correta os passos do processo tutorial?',
    'SIM_NAO_PARCIAL',
    1
  ],
  ['4 – Fechamento do caso', '4.3 O Tutor apresentou cada passo do processo tutorial?', 'SIM_NAO_PARCIAL', 0],
  ['4 – Fechamento do caso', '4.4 Qual a sua nota para o tutor no fechamento do caso?', 'NOTA_0_10', 0],
  [
    '4 – Fechamento do caso',
    '5 – Como você avalia o seu aprendizado nessa semana de articulação interdisciplinar?',
    'NOTA_0_10',
    0
  ]
].map(([section, text, kind, justify]) => ({section, text, kind, justify}));

const getForm = (db, id) => db.prepare('SELECT * FROM articulation_forms WHERE id=?').get(id);

const listForms = (db, statuses = null) =>
  db
    .prepare(
      `SELECT f.*, (SELECT count(*) FROM articulation_responses r WHERE r.form_id=f.id) responses
  FROM articulation_forms f ORDER BY f.year DESC, f.semester DESC, f.id DESC`
    )
    .all()
    .filter(form => !statuses || statuses.includes(form.status));

const questions = (db, formId) =>
  db
    .prepare(
      'SELECT id,position,section,text,kind,justify FROM articulation_questions WHERE form_id=? ORDER BY position'
    )
    .all(formId);

function options(db, formId) {
  const out = Object.fromEntries(LISTS.map(list => [list, []]));
  for (const row of db
    .prepare(
      `SELECT o.id,o.list,o.label,o.professor_id,u.name professor_name FROM articulation_options o LEFT JOIN users u ON u.id=o.professor_id
    WHERE o.form_id=? ORDER BY o.list,o.position`
    )
    .all(formId))
    out[row.list].push(row);
  return out;
}

function defaults(db) {
  const out = Object.fromEntries(LISTS.map(list => [list, []]));
  for (const row of db
    .prepare('SELECT list,label,professor_id FROM articulation_default_options ORDER BY list,position')
    .all())
    out[row.list].push(row);
  return out;
}

function saveDefaults(db, lists) {
  db.prepare('DELETE FROM articulation_default_options').run();
  const insert = db.prepare(
    'INSERT INTO articulation_default_options(list,position,label,professor_id) VALUES(?,?,?,?)'
  );
  for (const list of LISTS)
    lists[list].forEach((option, i) => insert.run(list, i + 1, option.label, option.professor_id));
}

const activeTeachers = db =>
  db.prepare("SELECT id,name FROM users WHERE role='PROFESSOR' AND active=1 ORDER BY name COLLATE NOCASE").all();

const responseCount = (db, formId) =>
  db.prepare('SELECT count(*) n FROM articulation_responses WHERE form_id=?').get(formId).n;

function writeStructure(db, formId, draft) {
  db.prepare('DELETE FROM articulation_questions WHERE form_id=?').run(formId);
  db.prepare('DELETE FROM articulation_options WHERE form_id=?').run(formId);
  const question = db.prepare(
    'INSERT INTO articulation_questions(form_id,position,section,text,kind,justify) VALUES(?,?,?,?,?,?)'
  );
  draft.questions.forEach((q, i) => question.run(formId, i + 1, q.section, q.text, q.kind, q.justify));
  const option = db.prepare(
    'INSERT INTO articulation_options(form_id,list,position,label,professor_id) VALUES(?,?,?,?,?)'
  );
  for (const list of LISTS)
    draft.options[list].forEach((o, i) => option.run(formId, list, i + 1, o.label, o.professor_id));
}

function createForm(db, header, userId) {
  const id = Number(
    db
      .prepare('INSERT INTO articulation_forms(title,year,semester,created_by) VALUES(?,?,?,?)')
      .run(header.title, header.year, header.semester, userId).lastInsertRowid
  );
  writeStructure(db, id, {questions: TEMPLATE.map(q => ({...q})), options: defaults(db)});
  return id;
}

function saveDraft(db, form, draft) {
  db.prepare('UPDATE articulation_forms SET title=?,year=?,semester=?,revision=revision+1 WHERE id=?').run(
    draft.title,
    draft.year,
    draft.semester,
    form.id
  );
  writeStructure(db, form.id, draft);
}

const STAMPS = {
  LIBERADO: ',released_at=COALESCE(released_at,CURRENT_TIMESTAMP),finished_at=NULL',
  FINALIZADO: ',finished_at=CURRENT_TIMESTAMP,results_released_at=NULL',
  RESULTADOS_LIBERADOS: ',results_released_at=CURRENT_TIMESTAMP',
  RASCUNHO: ',released_at=NULL'
};
const setStatus = (db, formId, status) =>
  db
    .prepare(`UPDATE articulation_forms SET status=?,revision=revision+1${STAMPS[status]} WHERE id=?`)
    .run(status, formId);

const deleteForm = (db, formId) => db.prepare('DELETE FROM articulation_forms WHERE id=?').run(formId); // questions and options go with it

const hasAnswered = (db, formId, studentId) =>
  !!db.prepare('SELECT 1 FROM articulation_responses WHERE form_id=? AND student_id=?').get(formId, studentId);

function saveResponse(db, {formId, studentId, user, answers}) {
  const id = Number(
    db
      .prepare('INSERT INTO articulation_responses(form_id,student_id,user_id,origin) VALUES(?,?,?,?)')
      .run(formId, studentId, user.id, user.origin ? String(user.origin).slice(0, 64) : null).lastInsertRowid
  );
  const insert = db.prepare(
    'INSERT INTO articulation_answers(response_id,question_id,value,option_id,justification) VALUES(?,?,?,?,?)'
  );
  for (const answer of answers)
    insert.run(id, answer.question_id, answer.value, answer.option_id, answer.justification);
  return id;
}

// Every response of a form with who answered and the answers by question id.
function responses(db, formId) {
  const rows = db
    .prepare(
      `SELECT r.id,r.created_at,s.name student_name,s.matricula student_matricula,u.email student_email
    FROM articulation_responses r JOIN students s ON s.id=r.student_id JOIN users u ON u.id=r.user_id WHERE r.form_id=? ORDER BY r.id`
    )
    .all(formId);
  const byId = new Map(rows.map(row => [row.id, {...row, answers: {}}]));
  for (const a of db
    .prepare(
      'SELECT a.response_id,a.question_id,a.value,a.option_id,a.justification FROM articulation_answers a JOIN articulation_responses r ON r.id=a.response_id WHERE r.form_id=?'
    )
    .all(formId))
    byId.get(a.response_id).answers[a.question_id] = {
      value: a.value,
      option_id: a.option_id,
      justification: a.justification
    };
  return [...byId.values()];
}

// Tutor options linked to this teacher account, in forms whose results were released.
const releasedTutorOptions = (db, professorId) =>
  db
    .prepare(
      `SELECT o.id,o.form_id,o.label FROM articulation_options o JOIN articulation_forms f ON f.id=o.form_id
  WHERE o.list='TUTOR' AND o.professor_id=? AND f.status='RESULTADOS_LIBERADOS' ORDER BY f.year,f.semester,f.id`
    )
    .all(professorId);

module.exports = {
  LISTS,
  KINDS,
  CHOICES,
  TEMPLATE,
  getForm,
  listForms,
  questions,
  options,
  defaults,
  saveDefaults,
  activeTeachers,
  responseCount,
  createForm,
  saveDraft,
  setStatus,
  deleteForm,
  hasAnswered,
  saveResponse,
  responses,
  releasedTutorOptions
};
