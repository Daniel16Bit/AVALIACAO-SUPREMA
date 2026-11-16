'use strict';
// Append-only grade history (tables created by migration 003). Callers own the transaction:
// a history row is written in the same transaction as the change it describes, so neither
// can exist without the other.
const D = require('./domain');
const {VALUE_KEYS} = require('./migrations/003-grade-history');

const same = (a, b) => (a ?? null) === (b ?? null);

// `pairs` is a list of [rowBefore, rowAfter] for the same score row.
function recordScoreChanges(db, {assessmentId, actorId, action, revision, pairs}) {
  const insert = db.prepare(
    'INSERT INTO score_changes(assessment_id,score_id,student_id,field_key,old_value,new_value,actor_id,action,revision) VALUES(?,?,?,?,?,?,?,?,?)'
  );
  let count = 0;
  for (const [before, after] of pairs) {
    for (const key of D.scoreKeys) {
      if (same(before[key], after[key])) continue;
      insert.run(
        assessmentId,
        before.id,
        before.student_id,
        key,
        before[key] ?? null,
        after[key] ?? null,
        actorId,
        action,
        revision
      );
      count++;
    }
  }
  return count;
}

function recordPublication(db, {eventId, assessmentId, row, metadata}) {
  const values = {};
  for (const key of VALUE_KEYS) values[key] = row[key] ?? null;
  db.prepare(
    "INSERT INTO publication_snapshots(publication_event_id,assessment_id,score_id,student_id,values_json,metadata_json,source) VALUES(?,?,?,?,?,?,'PUBLICACAO')"
  ).run(eventId, assessmentId, row.id, row.student_id, JSON.stringify(values), metadata ?? null);
}

function fieldLabels(db, assessmentId) {
  const labels = {};
  for (const q of D.config(db, assessmentId)) labels[q.field_key] = q.label;
  const headers = D.headers(db, assessmentId);
  for (const key of ['q7', 'q8', 'q9', 'pbl1', 'pbl2', 'trabalho']) labels[key] = headers[key];
  D.stationKeys.forEach((key, index) => {
    labels[key] = 'OSCE — Estação ' + (index + 1);
  });
  labels.osce = 'Total OSCE';
  labels.outros_final = 'Outros final';
  labels.q10 = 'Campo legado (q10)';
  return labels;
}

// Everything recorded about one assessment's grades, newest first.
function assessmentHistory(db, assessmentId, {changeLimit = 1000, publicationLimit = 50} = {}) {
  const labels = fieldLabels(db, assessmentId);
  const changes = db
    .prepare(
      `SELECT c.id,c.created_at,c.action,c.revision,c.field_key,c.old_value,c.new_value,
      s.name student_name,s.matricula,u.name actor_name
    FROM score_changes c JOIN students s ON s.id=c.student_id LEFT JOIN users u ON u.id=c.actor_id
    WHERE c.assessment_id=? ORDER BY c.id DESC LIMIT ?`
    )
    .all(assessmentId, changeLimit + 1);
  const changesTruncated = changes.length > changeLimit;
  if (changesTruncated) changes.pop();
  for (const change of changes) change.field_label = labels[change.field_key] || change.field_key;

  const snapshots = db
    .prepare(
      `SELECT p.id,p.publication_event_id,p.source,p.created_at,p.values_json,
      s.name student_name,s.matricula,e.revision,e.created_at event_at,u.name actor_name
    FROM publication_snapshots p JOIN students s ON s.id=p.student_id
    LEFT JOIN publication_events e ON e.id=p.publication_event_id LEFT JOIN users u ON u.id=e.actor_id
    WHERE p.assessment_id=? ORDER BY p.id DESC`
    )
    .all(assessmentId);
  const groups = new Map();
  for (const snap of snapshots) {
    const key = snap.publication_event_id === null ? 'migracao' : 'evento:' + snap.publication_event_id;
    let group = groups.get(key);
    if (!group) {
      if (groups.size >= publicationLimit) continue;
      group = {
        source: snap.source,
        created_at: snap.event_at || snap.created_at,
        actor_name: snap.actor_name || null,
        revision: snap.revision ?? null,
        students: []
      };
      groups.set(key, group);
    }
    let values = {};
    try {
      values = JSON.parse(snap.values_json) || {};
    } catch {}
    group.students.push({
      student_name: snap.student_name,
      matricula: snap.matricula,
      nota_prova: values.nota_prova ?? null,
      nota_final: values.nota_final ?? null,
      values
    });
  }
  const publications = [...groups.values()];
  for (const group of publications)
    group.students.sort((a, b) => String(a.student_name).localeCompare(String(b.student_name), 'pt-BR'));
  return {changes, changes_truncated: changesTruncated, publications, labels};
}

// How much history hangs on an account, as its author, its subject or its assessments' owner.
function historyCount(db, userId, studentId) {
  const count = (sql, ...params) => Number(db.prepare(sql).get(...params).n);
  const owned = 'assessment_id IN(SELECT id FROM assessments WHERE professor_id=?)';
  return (
    count(
      `SELECT count(*) n FROM score_changes WHERE actor_id=? OR student_id=? OR ${owned}`,
      userId,
      studentId,
      userId
    ) + count(`SELECT count(*) n FROM publication_snapshots WHERE student_id=? OR ${owned}`, studentId, userId)
  );
}

module.exports = {recordScoreChanges, recordPublication, assessmentHistory, historyCount};
