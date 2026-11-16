'use strict';
// Teacher evaluation by the students, anonymous.
//  - CSTI builds a campaign for a period, releases it, follows adherence by counts and closes it.
//  - A student answers once about each teacher of the disciplines he or she is enrolled in.
//  - Results exist only after the campaign is closed and only for a target that reached the
//    minimum of answers: a result seen during the collection, or for a tiny group, would be
//    somebody's answer. Closing is final for the same reason.
//  - A teacher reads his or her own results; the coordination reads everyone's.
// No "average" or grade of a teacher is computed: what such an average means is undefined.
const D = require('../../core/domain');
const Forms = require('../../core/forms');
const Receipts = require('../../core/receipts');
const S = require('./store');

const MIN_RESPONSES = {floor: 3, default: 5, ceiling: 1000};
const MAX_TARGETS = 500;

module.exports = function installTeacherEvalRoutes({app, db, auth, can}) {
  const manage = [auth, can('teacher_eval.manage')];
  const answer = [
    auth,
    can('teacher_eval.answer'),
    (req, res, next) =>
      req.user.studentId
        ? next()
        : res.status(403).json({error: 'Conta de aluno sem cadastro acadêmico. Procure o administrador.'})
  ];
  const own = [auth, can('teacher_eval.own')];
  const all = [auth, can('teacher_eval.all')];
  const wrap = fn => (req, res, next) => {
    try {
      fn(req, res);
    } catch (err) {
      next(err);
    }
  };

  const header = body => {
    const {year, semester} = D.term(body || {});
    const round_name = D.text(body.round_name, 60);
    if (!round_name) D.fail(400, 'Informe o nome da rodada (por exemplo: Fim do semestre).');
    return {year, semester, round_name, period: D.period(body.period)};
  };
  const campaignOf = req => S.getCampaign(db, D.id(req.params.id)) || D.fail(404, 'Avaliação não encontrada.');
  const assertRevision = (campaign, revision) => {
    if (!Number.isInteger(revision) || revision !== campaign.revision)
      D.fail(409, 'Esta avaliação mudou em outra sessão. Atualize a tela; suas alterações não foram gravadas.');
  };
  const summary = campaign => ({
    id: campaign.id,
    title: S.title(campaign),
    year: campaign.year,
    semester: campaign.semester,
    round_name: campaign.round_name,
    period: campaign.period,
    status: campaign.status,
    min_responses: campaign.min_responses,
    revision: campaign.revision,
    released_at: campaign.released_at,
    closed_at: campaign.closed_at
  });
  // Adherence is always a pair of counts; no route ever lists who answered.
  const adherence = (campaign, target) => ({
    eligible: S.eligibleCount(db, target.assignment_id),
    answered: Forms.participationCount(db, campaign.form_id, S.subjectKey(target.id))
  });

  // ---- CSTI: building and following ----------------------------------------------------
  app.get(
    '/api/teacher-eval/campaigns',
    manage,
    wrap((req, res) => {
      res.json(
        S.listCampaigns(db).map(campaign => ({
          ...summary(campaign),
          targets: campaign.targets,
          answered: S.participation(db, campaign)
        }))
      );
    })
  );

  app.post(
    '/api/teacher-eval/campaigns',
    manage,
    wrap((req, res) => {
      const id = D.transaction(db, () => {
        const created = S.createCampaign(db, header(req.body), req.user.id, D);
        D.audit(db, req.user, 'DOCENTE_CRIAR', {campaign_id: created});
        return created;
      });
      res.status(201).json({ok: true, id});
    })
  );

  app.get(
    '/api/teacher-eval/campaigns/:id',
    manage,
    wrap((req, res) => {
      const campaign = campaignOf(req),
        chosen = S.targets(db, campaign.id);
      // While it is a draft the candidates follow the current offers; afterwards the list is the saved one.
      const offers = campaign.status === 'RASCUNHO' ? S.candidateOffers(db, campaign) : chosen;
      res.json({
        campaign: summary(campaign),
        questions: Forms.questions(db, campaign.form_id).map(q => ({text: q.text})),
        assignment_ids: chosen.map(target => target.assignment_id),
        candidates: offers.map(offer => ({
          assignment_id: offer.assignment_id,
          professor_name: offer.professor_name,
          discipline_name: offer.discipline_name,
          class_name: offer.class_name,
          eligible: S.eligibleCount(db, offer.assignment_id)
        })),
        adherence:
          campaign.status === 'RASCUNHO'
            ? []
            : chosen.map(target => ({
                professor_name: target.professor_name,
                discipline_name: target.discipline_name,
                class_name: target.class_name,
                ...adherence(campaign, target)
              }))
      });
    })
  );

  app.put(
    '/api/teacher-eval/campaigns/:id',
    manage,
    wrap((req, res) => {
      const campaign = campaignOf(req),
        body = req.body || {};
      if (campaign.status !== 'RASCUNHO')
        D.fail(423, 'Esta avaliação já foi liberada. A estrutura não pode mais ser alterada.');
      assertRevision(campaign, body.revision);
      const min = body.min_responses;
      if (!Number.isInteger(min) || min < MIN_RESPONSES.floor || min > MIN_RESPONSES.ceiling)
        D.fail(400, `O mínimo de respostas deve ser um número inteiro a partir de ${MIN_RESPONSES.floor}.`);
      const draft = {
        ...header(body),
        min_responses: min,
        questions: Forms.cleanQuestions(body.questions ?? [], {answerType: 'SIM_NAO_NA'})
      };
      if (!Array.isArray(body.assignment_ids) || body.assignment_ids.length > MAX_TARGETS)
        D.fail(400, 'Lista de professores inválida.');
      draft.assignment_ids = [...new Set(body.assignment_ids.map(Number))];
      const offered = new Set(S.candidateOffers(db, {...campaign, ...draft}).map(offer => offer.assignment_id));
      if (draft.assignment_ids.some(id => !offered.has(id)))
        D.fail(400, 'A lista contém vínculo de docência que não pertence a este período, ano e semestre.');
      D.transaction(db, () => {
        S.saveDraft(db, campaign, draft, D);
        D.audit(db, req.user, 'DOCENTE_SALVAR', {
          campaign_id: campaign.id,
          questions: draft.questions.length,
          targets: draft.assignment_ids.length
        });
      });
      res.json({ok: true, revision: campaign.revision + 1});
    })
  );

  app.post(
    '/api/teacher-eval/campaigns/:id/release',
    manage,
    wrap((req, res) => {
      const campaign = campaignOf(req);
      if (campaign.status !== 'RASCUNHO') D.fail(409, 'Esta avaliação já foi liberada.');
      assertRevision(campaign, req.body?.revision);
      const pending = [];
      if (!Forms.questions(db, campaign.form_id).length) pending.push('nenhuma pergunta');
      if (!S.targets(db, campaign.id).length) pending.push('nenhum professor na lista');
      if (pending.length) D.fail(400, 'Liberação bloqueada: ' + pending.join('; ') + '.');
      D.transaction(db, () => {
        S.setStatus(db, campaign.id, 'LIBERADO');
        D.audit(db, req.user, 'DOCENTE_LIBERAR', {campaign_id: campaign.id});
      });
      res.json({ok: true, status: 'LIBERADO', revision: campaign.revision + 1});
    })
  );

  // Final: results appear after this, and reopening would let a later answer be told apart.
  app.post(
    '/api/teacher-eval/campaigns/:id/close',
    manage,
    wrap((req, res) => {
      const campaign = campaignOf(req);
      if (campaign.status !== 'LIBERADO') D.fail(409, 'Só uma avaliação liberada pode ser encerrada.');
      D.transaction(db, () => {
        S.setStatus(db, campaign.id, 'ENCERRADO');
        D.audit(db, req.user, 'DOCENTE_ENCERRAR', {campaign_id: campaign.id});
      });
      res.json({ok: true, status: 'ENCERRADO', revision: campaign.revision + 1});
    })
  );

  app.post(
    '/api/teacher-eval/campaigns/:id/reopen',
    manage,
    wrap((req, res) => {
      const campaign = campaignOf(req);
      if (campaign.status === 'ENCERRADO')
        D.fail(
          409,
          'Uma avaliação encerrada não pode ser reaberta: os resultados já estão visíveis e novas respostas poderiam ser identificadas.'
        );
      if (campaign.status !== 'LIBERADO') D.fail(409, 'Esta avaliação já está em rascunho.');
      if (S.participation(db, campaign))
        D.fail(409, 'Esta avaliação já recebeu respostas e não pode voltar a rascunho.');
      D.transaction(db, () => {
        S.setStatus(db, campaign.id, 'RASCUNHO');
        D.audit(db, req.user, 'DOCENTE_REABRIR', {campaign_id: campaign.id});
      });
      res.json({ok: true, status: 'RASCUNHO', revision: campaign.revision + 1});
    })
  );

  app.delete(
    '/api/teacher-eval/campaigns/:id',
    manage,
    wrap((req, res) => {
      const campaign = campaignOf(req);
      if (campaign.status !== 'RASCUNHO') D.fail(409, 'Só uma avaliação em rascunho pode ser excluída.');
      D.transaction(db, () => {
        S.deleteCampaign(db, campaign);
        D.audit(db, req.user, 'DOCENTE_EXCLUIR', {campaign_id: campaign.id});
      });
      res.json({ok: true});
    })
  );

  // ---- Student: answering --------------------------------------------------------------
  app.get(
    '/api/teacher-eval/pending',
    answer,
    wrap((req, res) => {
      const list = S.studentTargets(db, req.user.studentId),
        done = new Map();
      res.json(
        list.map(target => {
          if (!done.has(target.form_id))
            done.set(target.form_id, Forms.participatedSubjects(db, target.form_id, req.user.studentId));
          return {
            id: target.id,
            campaign: S.title(target),
            professor_name: target.professor_name,
            discipline_name: target.discipline_name,
            class_name: target.class_name,
            answered: done.get(target.form_id).has(S.subjectKey(target.id))
          };
        })
      );
    })
  );

  // A target the student may answer about now; anything else looks the same as "not found".
  const answerable = req => {
    const target = S.getTarget(db, D.id(req.params.id)),
      campaign = target && S.getCampaign(db, target.campaign_id);
    if (!target || campaign.status !== 'LIBERADO' || !S.isEligible(db, target.assignment_id, req.user.studentId))
      D.fail(404, 'Avaliação não disponível.');
    return {target, campaign};
  };

  app.get(
    '/api/teacher-eval/targets/:id',
    answer,
    wrap((req, res) => {
      const {target, campaign} = answerable(req);
      if (Forms.hasParticipated(db, campaign.form_id, S.subjectKey(target.id), req.user.studentId))
        D.fail(409, 'Você já respondeu esta avaliação. Respostas anônimas não podem ser alteradas.');
      res.json({
        id: target.id,
        campaign: S.title(campaign),
        professor_name: target.professor_name,
        discipline_name: target.discipline_name,
        class_name: target.class_name,
        questions: Forms.questions(db, campaign.form_id).map(q => ({id: q.id, position: q.position, text: q.text}))
      });
    })
  );

  app.post(
    '/api/teacher-eval/targets/:id/answers',
    answer,
    wrap((req, res) => {
      const {target, campaign} = answerable(req);
      const code = D.transaction(db, () => {
        Forms.submitAnonymous(db, {
          formId: campaign.form_id,
          subjectKey: S.subjectKey(target.id),
          studentId: req.user.studentId,
          answers: req.body?.answers
        });
        // Only "a student answered in this campaign": neither the teacher nor the content.
        D.audit(db, req.user, 'DOCENTE_RESPONDER', {campaign_id: campaign.id});
        // The receipt proves that this student took part, and in what. It holds no answer and
        // no reference to the stored answers, which stay unlinked to the student.
        return Receipts.issue(db, {
          user: req.user,
          studentId: req.user.studentId,
          kind: 'AVALIACAO_DOCENTE',
          title: 'Avaliação Docente respondida',
          detail: `${S.title(campaign)} · ${target.discipline_name} · ${target.professor_name}`
        });
      });
      res.status(201).json({ok: true, receipt: {code}});
    })
  );

  // ---- Results: teacher (own) and coordination (all) -----------------------------------
  // A target below the minimum yields no count per answer and no comment.
  function result(target, withTeacher) {
    const data = Forms.anonymousResults(db, target.form_id, S.subjectKey(target.id)),
      sufficient = data.responses >= target.min_responses;
    const base = {
      target_id: target.id,
      campaign_id: target.campaign_id,
      campaign: S.title(target),
      year: target.year,
      semester: target.semester,
      round_name: target.round_name,
      period: target.period,
      discipline_name: target.discipline_name,
      class_name: target.class_name,
      responses: data.responses,
      min_responses: target.min_responses,
      sufficient,
      ...(withTeacher ? {professor_id: target.professor_id, professor_name: target.professor_name} : {})
    };
    if (!sufficient) return {...base, questions: [], total: null};
    const questions = data.questions.map(q => ({
      position: q.position,
      text: q.text,
      sim: q.sim,
      nao: q.nao,
      na: q.na,
      comments: q.comments
    }));
    // "Sim" over "Sim + Nao" of all questions together. "Nao se aplica" is counted apart.
    return {
      ...base,
      questions,
      total: questions.reduce((sum, q) => ({sim: sum.sim + q.sim, nao: sum.nao + q.nao, na: sum.na + q.na}), {
        sim: 0,
        nao: 0,
        na: 0
      })
    };
  }

  app.get(
    '/api/teacher-eval/mine',
    own,
    wrap((req, res) => {
      res.json(S.closedTargets(db, req.user.id).map(target => result(target, false)));
    })
  );

  app.get(
    '/api/teacher-eval/results',
    all,
    wrap((req, res) => {
      const targets = S.closedTargets(db).map(target => result(target, true)),
        campaigns = new Map();
      for (const item of targets) {
        if (!campaigns.has(item.campaign_id))
          campaigns.set(item.campaign_id, {
            campaign_id: item.campaign_id,
            campaign: item.campaign,
            year: item.year,
            semester: item.semester,
            round_name: item.round_name,
            period: item.period,
            targets: 0,
            insufficient: 0,
            total: {sim: 0, nao: 0, na: 0}
          });
        const group = campaigns.get(item.campaign_id);
        group.targets++;
        // The general figure adds only targets that reached the minimum: otherwise a small
        // group could be recovered by subtraction.
        if (item.sufficient) for (const key of ['sim', 'nao', 'na']) group.total[key] += item.total[key];
        else group.insufficient++;
      }
      res.json({campaigns: [...campaigns.values()], targets});
    })
  );
};
