'use strict';
// Data access of the teacher evaluation module. All SQL about its tables and about the
// academic links it reads is here; the routes hold only rules.
const Forms = require('../../core/forms');

const MODULE = 'AVALIACAO_DOCENTE';
const subjectKey = targetId => 'target:' + targetId;

const getCampaign = (db, id) => db.prepare('SELECT * FROM teacher_eval_campaigns WHERE id=?').get(id);

const title = campaign =>
  `${campaign.round_name} · ${campaign.year}.${campaign.semester} · ${campaign.period}º período`;

function listCampaigns(db, status = null) {
  return db
    .prepare(
      `SELECT c.*, (SELECT count(*) FROM teacher_eval_targets t WHERE t.campaign_id=c.id) targets
    FROM teacher_eval_campaigns c WHERE (? IS NULL OR c.status=?)
    ORDER BY c.year DESC, c.semester DESC, c.id DESC`
    )
    .all(status, status);
}

// Active discipline offers of the period, in the campaign's year and semester.
function candidateOffers(db, campaign) {
  return db
    .prepare(
      `SELECT t.id assignment_id, t.professor_id, u.name professor_name, d.name discipline_name, t.class_name
    FROM teaching_assignments t JOIN academic_disciplines d ON d.id=t.discipline_id JOIN academic_courses c ON c.id=d.course_id JOIN users u ON u.id=t.professor_id
    WHERE t.active=1 AND d.active=1 AND c.active=1 AND u.active=1 AND t.year=? AND t.semester=? AND d.period=?
    ORDER BY d.name COLLATE NOCASE, u.name COLLATE NOCASE, t.id`
    )
    .all(campaign.year, campaign.semester, campaign.period);
}

const targets = (db, campaignId) =>
  db
    .prepare(
      `SELECT t.id, t.campaign_id, t.assignment_id, t.professor_id, u.name professor_name, t.discipline_name, t.class_name
  FROM teacher_eval_targets t JOIN users u ON u.id=t.professor_id WHERE t.campaign_id=? ORDER BY t.discipline_name COLLATE NOCASE, u.name COLLATE NOCASE, t.id`
    )
    .all(campaignId);

const getTarget = (db, id) =>
  db
    .prepare(
      `SELECT t.id, t.campaign_id, t.assignment_id, t.professor_id, u.name professor_name, t.discipline_name, t.class_name
  FROM teacher_eval_targets t JOIN users u ON u.id=t.professor_id WHERE t.id=?`
    )
    .get(id);

// Students who may answer about an offer: enrolled in it, with an active account.
const ELIGIBLE = `FROM teaching_assignments t JOIN academic_enrollments e ON e.discipline_id=t.discipline_id AND e.year=t.year AND e.semester=t.semester AND e.class_name=t.class_name AND e.active=1
  JOIN users u ON u.student_id=e.student_id AND u.role='ALUNO' AND u.active=1`;
const eligibleCount = (db, assignmentId) =>
  db.prepare(`SELECT count(DISTINCT e.student_id) n ${ELIGIBLE} WHERE t.id=?`).get(assignmentId).n;
const isEligible = (db, assignmentId, studentId) =>
  !!db.prepare(`SELECT 1 ${ELIGIBLE} WHERE t.id=? AND e.student_id=?`).get(assignmentId, studentId);

// Targets of released campaigns in which this student is enrolled.
function studentTargets(db, studentId) {
  return db
    .prepare(
      `SELECT x.id, x.campaign_id, x.assignment_id, x.discipline_name, x.class_name, p.name professor_name, c.form_id, c.year, c.semester, c.round_name, c.period
    FROM teacher_eval_targets x JOIN teacher_eval_campaigns c ON c.id=x.campaign_id AND c.status='LIBERADO' JOIN users p ON p.id=x.professor_id
    WHERE EXISTS(SELECT 1 ${ELIGIBLE} WHERE t.id=x.assignment_id AND e.student_id=?)
    ORDER BY c.id DESC, x.discipline_name COLLATE NOCASE, p.name COLLATE NOCASE`
    )
    .all(studentId);
}

const participation = (db, campaign) =>
  targets(db, campaign.id).reduce(
    (sum, target) => sum + Forms.participationCount(db, campaign.form_id, subjectKey(target.id)),
    0
  );

function uniqueContext(err, D) {
  if (/UNIQUE constraint failed: teacher_eval_campaigns/i.test(err.message))
    D.fail(409, 'Já existe uma avaliação com este nome para este ano, semestre e período.');
  throw err;
}

function writeTargets(db, campaign, assignmentIds) {
  db.prepare('DELETE FROM teacher_eval_targets WHERE campaign_id=?').run(campaign.id);
  const offers = new Map(candidateOffers(db, campaign).map(offer => [offer.assignment_id, offer]));
  const insert = db.prepare(
    'INSERT INTO teacher_eval_targets(campaign_id,assignment_id,professor_id,discipline_name,class_name) VALUES(?,?,?,?,?)'
  );
  for (const id of assignmentIds) {
    const offer = offers.get(id);
    insert.run(campaign.id, id, offer.professor_id, offer.discipline_name, offer.class_name);
  }
}

// A new draft starts with every teacher of the period, for the CSTI to review.
function createCampaign(db, header, userId, D) {
  const formId = Forms.createForm(db, {module: MODULE, title: title(header), createdBy: userId});
  let id;
  try {
    id = Number(
      db
        .prepare(
          'INSERT INTO teacher_eval_campaigns(year,semester,round_name,period,form_id,created_by) VALUES(?,?,?,?,?,?)'
        )
        .run(header.year, header.semester, header.round_name, header.period, formId, userId).lastInsertRowid
    );
  } catch (err) {
    uniqueContext(err, D);
  }
  const campaign = getCampaign(db, id);
  writeTargets(
    db,
    campaign,
    candidateOffers(db, campaign).map(offer => offer.assignment_id)
  );
  return id;
}

function saveDraft(db, campaign, draft, D) {
  try {
    db.prepare(
      'UPDATE teacher_eval_campaigns SET year=?,semester=?,round_name=?,period=?,min_responses=?,revision=revision+1 WHERE id=?'
    ).run(draft.year, draft.semester, draft.round_name, draft.period, draft.min_responses, campaign.id);
  } catch (err) {
    uniqueContext(err, D);
  }
  const saved = getCampaign(db, campaign.id);
  Forms.renameForm(db, saved.form_id, title(saved));
  Forms.replaceQuestions(db, saved.form_id, draft.questions);
  writeTargets(db, saved, draft.assignment_ids);
}

function setStatus(db, campaignId, status) {
  const stamp =
    status === 'LIBERADO'
      ? ',released_at=CURRENT_TIMESTAMP'
      : status === 'ENCERRADO'
        ? ',closed_at=CURRENT_TIMESTAMP'
        : ',released_at=NULL';
  db.prepare(`UPDATE teacher_eval_campaigns SET status=?,revision=revision+1${stamp} WHERE id=?`).run(
    status,
    campaignId
  );
}

function deleteCampaign(db, campaign) {
  db.prepare('DELETE FROM teacher_eval_campaigns WHERE id=?').run(campaign.id); // targets go with it
  Forms.deleteForm(db, campaign.form_id);
}

// Closed campaigns with their targets; `professorId` narrows to one teacher's own targets.
function closedTargets(db, professorId = null) {
  return db
    .prepare(
      `SELECT t.id, t.campaign_id, t.professor_id, u.name professor_name, t.discipline_name, t.class_name,
      c.form_id, c.year, c.semester, c.round_name, c.period, c.min_responses, c.closed_at
    FROM teacher_eval_targets t JOIN teacher_eval_campaigns c ON c.id=t.campaign_id AND c.status='ENCERRADO' JOIN users u ON u.id=t.professor_id
    WHERE (? IS NULL OR t.professor_id=?)
    ORDER BY c.year, c.semester, c.id, t.discipline_name COLLATE NOCASE, u.name COLLATE NOCASE`
    )
    .all(professorId, professorId);
}

module.exports = {
  MODULE,
  subjectKey,
  getCampaign,
  title,
  listCampaigns,
  candidateOffers,
  targets,
  getTarget,
  eligibleCount,
  isEligible,
  studentTargets,
  participation,
  createCampaign,
  saveDraft,
  setStatus,
  deleteCampaign,
  closedTargets
};
