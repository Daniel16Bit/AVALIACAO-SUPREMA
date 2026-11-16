'use strict';
// Data access of the OSCE module. Every SQL statement about OSCE tables is here, so the
// routes hold only rules and the database can change without touching them.
const D = require('../../core/domain');
const Forms = require('../../core/forms');

const DEFAULT_KEY_TEXT = 'O aluno cumprimentou o paciente?';
const DEFAULT_STATIONS = 4;

const getEvent = (db, id) => db.prepare('SELECT * FROM osce_events WHERE id=?').get(id);

function listEvents(db, status = null) {
  return db
    .prepare(
      `SELECT e.*,
      (SELECT count(*) FROM osce_stations s WHERE s.event_id=e.id) stations,
      (SELECT count(*) FROM osce_event_students x WHERE x.event_id=e.id) students,
      (SELECT count(*) FROM osce_stations s JOIN form_submissions f ON f.form_id=s.form_id AND f.voided_at IS NULL WHERE s.event_id=e.id) answered
    FROM osce_events e WHERE (? IS NULL OR e.status=?)
    ORDER BY e.year DESC, e.semester DESC, e.round DESC, CAST(e.period AS INTEGER)`
    )
    .all(status, status);
}

const stations = (db, eventId) =>
  db.prepare('SELECT id,position,name,form_id FROM osce_stations WHERE event_id=? ORDER BY position').all(eventId);

const getStation = (db, id) =>
  db.prepare('SELECT s.id,s.position,s.name,s.form_id,s.event_id FROM osce_stations s WHERE s.id=?').get(id);

const eventStudents = (db, eventId) =>
  db
    .prepare(
      `SELECT st.id,st.name,st.matricula FROM osce_event_students x JOIN students st ON st.id=x.student_id
  WHERE x.event_id=? ORDER BY st.name COLLATE NOCASE, st.id`
    )
    .all(eventId);

const inEvent = (db, eventId, studentId) =>
  !!db.prepare('SELECT 1 FROM osce_event_students WHERE event_id=? AND student_id=?').get(eventId, studentId);

// Students with an active account. `period` narrows to the students registered in it.
function activeStudents(db, period = null) {
  return db
    .prepare(
      `SELECT st.id,st.name,st.matricula,st.period FROM students st JOIN users u ON u.student_id=st.id AND u.role='ALUNO' AND u.active=1
    WHERE (? IS NULL OR st.period=?) ORDER BY st.name COLLATE NOCASE, st.id`
    )
    .all(period, period);
}

const answeredIds = (db, formId) =>
  new Set(
    db
      .prepare('SELECT subject_student_id id FROM form_submissions WHERE form_id=? AND voided_at IS NULL')
      .all(formId)
      .map(row => row.id)
  );

const totalSubmissions = (db, eventId) =>
  db
    .prepare('SELECT count(*) n FROM osce_stations s JOIN form_submissions f ON f.form_id=s.form_id WHERE s.event_id=?')
    .get(eventId).n;

const title = event => `OSCE ${event.round} · ${event.year}.${event.semester} · ${event.period}º período`;

// Writes the stations of a draft from scratch: a draft has no answers to preserve.
// With the key question on, it is stored as the first question of every station.
function writeStations(db, event, list, userId) {
  for (const station of stations(db, event.id)) {
    db.prepare('DELETE FROM osce_stations WHERE id=?').run(station.id);
    Forms.deleteForm(db, station.form_id);
  }
  list.forEach((station, i) => {
    const formId = Forms.createForm(db, {
      module: 'OSCE',
      title: `${title(event)} · ${station.name}`,
      createdBy: userId
    });
    const key = event.key_question ? [{text: event.key_question_text, answer_type: 'SIM_NAO', is_key: 1}] : [];
    Forms.replaceQuestions(db, formId, [...key, ...station.questions]);
    db.prepare('INSERT INTO osce_stations(event_id,position,name,form_id) VALUES(?,?,?,?)').run(
      event.id,
      i + 1,
      station.name,
      formId
    );
  });
}

function writeStudents(db, eventId, ids) {
  db.prepare('DELETE FROM osce_event_students WHERE event_id=?').run(eventId);
  const insert = db.prepare('INSERT INTO osce_event_students(event_id,student_id) VALUES(?,?)');
  for (const id of ids) insert.run(eventId, id);
}

function uniqueContext(err) {
  if (/UNIQUE constraint failed: osce_events/i.test(err.message))
    D.fail(409, 'Já existe um OSCE para este ano, semestre, rodada e período.');
  throw err;
}

// A new draft starts with the usual four stations and the students of the period,
// for the assessment unit to review.
function createEvent(db, header, userId) {
  let id;
  try {
    id = Number(
      db
        .prepare('INSERT INTO osce_events(year,semester,round,period,key_question_text,created_by) VALUES(?,?,?,?,?,?)')
        .run(header.year, header.semester, header.round, header.period, DEFAULT_KEY_TEXT, userId).lastInsertRowid
    );
  } catch (err) {
    uniqueContext(err);
  }
  const event = getEvent(db, id);
  writeStations(
    db,
    event,
    Array.from({length: DEFAULT_STATIONS}, (_, i) => ({name: 'Estação ' + (i + 1), questions: []})),
    userId
  );
  writeStudents(
    db,
    id,
    activeStudents(db, header.period).map(student => student.id)
  );
  return id;
}

function saveDraft(db, event, draft, userId) {
  try {
    db.prepare(
      'UPDATE osce_events SET year=?,semester=?,round=?,period=?,key_question=?,key_question_text=?,revision=revision+1 WHERE id=?'
    ).run(draft.year, draft.semester, draft.round, draft.period, draft.key_question, draft.key_question_text, event.id);
  } catch (err) {
    uniqueContext(err);
  }
  writeStations(db, getEvent(db, event.id), draft.stations, userId);
  writeStudents(db, event.id, draft.student_ids);
}

function setStatus(db, eventId, status) {
  const stamp =
    status === 'LIBERADO'
      ? ',released_at=COALESCE(released_at,CURRENT_TIMESTAMP),closed_at=NULL'
      : status === 'ENCERRADO'
        ? ',closed_at=CURRENT_TIMESTAMP'
        : ',released_at=NULL,closed_at=NULL';
  db.prepare(`UPDATE osce_events SET status=?,revision=revision+1${stamp} WHERE id=?`).run(status, eventId);
}

function deleteEvent(db, eventId) {
  const forms = stations(db, eventId).map(station => station.form_id);
  db.prepare('DELETE FROM osce_events WHERE id=?').run(eventId); // stations and student list go with it
  for (const formId of forms) Forms.deleteForm(db, formId);
}

// The OSCE station a submission belongs to, or undefined when it is not an OSCE submission.
const submissionStation = (db, submissionId) =>
  db
    .prepare(
      'SELECT s.id station_id,s.event_id,s.name FROM form_submissions f JOIN osce_stations s ON s.form_id=f.form_id WHERE f.id=?'
    )
    .get(submissionId);

module.exports = {
  DEFAULT_KEY_TEXT,
  getEvent,
  listEvents,
  stations,
  getStation,
  eventStudents,
  inEvent,
  activeStudents,
  answeredIds,
  totalSubmissions,
  title,
  createEvent,
  saveDraft,
  setStatus,
  deleteEvent,
  submissionStation
};
