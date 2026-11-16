'use strict';
// Interdisciplinary articulation.
//  - CSTI builds a form (free title, questions, lists of periods, tutors and stations),
//    releases it, finishes the collection and then releases the results.
//  - Every student answers once, identified, and receives a receipt.
//  - CSTI reads and exports the identified answers at any time; the coordination reads them
//    once the results are released; a tutor linked to a teacher account reads only his or her
//    own consolidated figures, without student names.
// What is shown are the counts per answer and the figures of the report the institution uses
// (core/calculo/articulacao.js): average, highest and lowest grade and the share of each answer,
// per tutor. A single performance figure per tutor and a ranking are NOT computed: the final
// workbook of the institution has neither.
const ExcelJS = require('exceljs');
const D = require('../../core/domain');
const Receipts = require('../../core/receipts');
const Privacy = require('../../core/privacy');
const Calc = require('../../core/calculo/articulacao');
const S = require('./store');

const LIMITS = {questions: 80, options: 300, title: 160, text: 300, label: 120, justification: 1000};
// The report follows the final workbook of the institution, received filled in on 16/11/2026:
// one tab per tutor with the answers and three rows of totals, and nothing after it. There is no
// figure that sums a tutor up and no ranking of tutors, so the system has neither.
const NO_SINGLE_FIGURE = {
  available: false,
  message:
    'Os números seguem a planilha de resultado final da instituição: média, maior e menor nota e percentual de cada resposta, por tutor. A instituição não usa um número único de desempenho por tutor nem uma lista dos mais e dos menos bem avaliados; por isso eles não existem aqui.'
};
const LABELS = Calc.SHEET_LABELS;

module.exports = function installArticulationRoutes({app, db, auth, can, hasPermission}) {
  const manage = [auth, can('articulation.manage')];
  const answer = [
    auth,
    can('articulation.answer'),
    (req, res, next) =>
      req.user.studentId
        ? next()
        : res.status(403).json({error: 'Conta de aluno sem cadastro acadêmico. Procure o administrador.'})
  ];
  const read = [auth, can('articulation.manage', 'articulation.results')];
  const own = [auth, can('articulation.own')];
  const wrap = fn => (req, res, next) => {
    try {
      const p = fn(req, res);
      if (p && p.then) p.catch(next);
    } catch (err) {
      next(err);
    }
  };

  const header = body => {
    const {year, semester} = D.term(body || {}),
      title = D.text(body.title, LIMITS.title);
    if (!title)
      D.fail(400, 'Informe o nome da avaliação (por exemplo: Avaliação Caso 6 - Articulação Interdisciplinar).');
    return {title, year, semester};
  };
  const formOf = req => S.getForm(db, D.id(req.params.id)) || D.fail(404, 'Avaliação não encontrada.');
  const assertRevision = (form, revision) => {
    if (!Number.isInteger(revision) || revision !== form.revision)
      D.fail(409, 'Esta avaliação mudou em outra sessão. Atualize a tela; suas alterações não foram gravadas.');
  };
  const summary = form => ({
    id: form.id,
    title: form.title,
    year: form.year,
    semester: form.semester,
    status: form.status,
    revision: form.revision,
    released_at: form.released_at,
    finished_at: form.finished_at,
    results_released_at: form.results_released_at
  });

  // Lists as typed by the CSTI: trimmed, without blanks or repeated labels, tutors optionally linked to a teacher.
  function cleanLists(input) {
    const teachers = new Set(S.activeTeachers(db).map(t => t.id)),
      out = {};
    for (const list of S.LISTS) {
      const items = input?.[list];
      if (!Array.isArray(items) || items.length > LIMITS.options) D.fail(400, 'Lista inválida.');
      const seen = new Set();
      out[list] = [];
      for (const item of items) {
        const label = D.text(String(item?.label ?? ''), LIMITS.label),
          key = label.toLowerCase();
        if (!label || seen.has(key)) continue;
        seen.add(key);
        const professor = list === 'TUTOR' && item.professor_id ? Number(item.professor_id) : null;
        if (professor !== null && !teachers.has(professor))
          D.fail(400, 'Conta de professor inválida na lista de tutores.');
        out[list].push({label, professor_id: professor});
      }
    }
    return out;
  }
  function cleanQuestions(input) {
    if (!Array.isArray(input) || input.length > LIMITS.questions) D.fail(400, 'Lista de perguntas inválida.');
    return input.map((q, i) => {
      const text = D.text(q?.text, LIMITS.text);
      if (!text) D.fail(400, `Pergunta ${i + 1} sem texto.`);
      if (!S.KINDS.includes(q.kind)) D.fail(400, `Pergunta ${i + 1} com tipo de resposta inválido.`);
      return {section: D.text(String(q.section ?? ''), 80), text, kind: q.kind, justify: q.justify ? 1 : 0};
    });
  }

  // ---- CSTI: building ------------------------------------------------------------------
  app.get(
    '/api/articulation/forms',
    manage,
    wrap((req, res) => {
      res.json(S.listForms(db).map(form => ({...summary(form), responses: form.responses})));
    })
  );

  app.post(
    '/api/articulation/forms',
    manage,
    wrap((req, res) => {
      const id = D.transaction(db, () => {
        const created = S.createForm(db, header(req.body), req.user.id);
        D.audit(db, req.user, 'ARTICULACAO_CRIAR', {form_id: created});
        return created;
      });
      res.status(201).json({ok: true, id});
    })
  );

  app.get(
    '/api/articulation/forms/:id',
    manage,
    wrap((req, res) => {
      const form = formOf(req),
        lists = S.options(db, form.id);
      res.json({
        form: summary(form),
        questions: S.questions(db, form.id).map(q => ({
          section: q.section,
          text: q.text,
          kind: q.kind,
          justify: !!q.justify
        })),
        options: Object.fromEntries(
          S.LISTS.map(list => [list, lists[list].map(o => ({label: o.label, professor_id: o.professor_id}))])
        ),
        teachers: S.activeTeachers(db),
        responses: S.responseCount(db, form.id)
      });
    })
  );

  app.put(
    '/api/articulation/forms/:id',
    manage,
    wrap((req, res) => {
      const form = formOf(req),
        body = req.body || {};
      if (form.status !== 'RASCUNHO')
        D.fail(423, 'Esta avaliação já foi liberada. A estrutura não pode mais ser alterada.');
      assertRevision(form, body.revision);
      const draft = {...header(body), questions: cleanQuestions(body.questions), options: cleanLists(body.options)};
      D.transaction(db, () => {
        S.saveDraft(db, form, draft);
        D.audit(db, req.user, 'ARTICULACAO_SALVAR', {form_id: form.id, questions: draft.questions.length});
      });
      res.json({ok: true, revision: form.revision + 1});
    })
  );

  // The lists of this form become the starting point of the next ones.
  app.put(
    '/api/articulation/defaults',
    manage,
    wrap((req, res) => {
      const lists = cleanLists(req.body?.options);
      D.transaction(db, () => {
        S.saveDefaults(db, lists);
        D.audit(db, req.user, 'ARTICULACAO_LISTA_PADRAO', {
          periods: lists.PERIODO.length,
          tutors: lists.TUTOR.length,
          stations: lists.ESTACAO.length
        });
      });
      res.json({ok: true});
    })
  );

  const move = (route, from, to, action, check) =>
    app.post(
      `/api/articulation/forms/:id/${route}`,
      manage,
      wrap((req, res) => {
        const form = formOf(req);
        if (!from.includes(form.status)) D.fail(409, 'Esta ação não se aplica à situação atual da avaliação.');
        const target = typeof to === 'function' ? to(form) : to;
        if (check) check(form, req, target);
        D.transaction(db, () => {
          S.setStatus(db, form.id, target);
          D.audit(db, req.user, action, {form_id: form.id, status: target});
        });
        res.json({ok: true, status: target, revision: form.revision + 1});
      })
    );

  move('release', ['RASCUNHO'], 'LIBERADO', 'ARTICULACAO_LIBERAR', (form, req) => {
    assertRevision(form, req.body?.revision);
    const questions = S.questions(db, form.id),
      lists = S.options(db, form.id),
      pending = [];
    if (!questions.length) pending.push('nenhuma pergunta');
    if (questions.filter(q => q.kind === 'TUTOR').length !== 1)
      pending.push('é preciso exatamente uma pergunta do tipo Tutor');
    for (const [list, name] of [
      ['PERIODO', 'períodos'],
      ['TUTOR', 'tutores'],
      ['ESTACAO', 'estações de apoio']
    ])
      if (questions.some(q => q.kind === list) && !lists[list].length) pending.push('lista de ' + name + ' vazia');
    if (pending.length) D.fail(400, 'Liberação bloqueada: ' + pending.join('; ') + '.');
  });
  move('finish', ['LIBERADO'], 'FINALIZADO', 'ARTICULACAO_FINALIZAR');
  move('publish', ['FINALIZADO'], 'RESULTADOS_LIBERADOS', 'ARTICULACAO_LIBERAR_RESULTADOS');
  // One step back at a time. A released form returns to draft only while nobody has answered.
  move(
    'reopen',
    ['LIBERADO', 'FINALIZADO', 'RESULTADOS_LIBERADOS'],
    form => ({LIBERADO: 'RASCUNHO', FINALIZADO: 'LIBERADO', RESULTADOS_LIBERADOS: 'FINALIZADO'})[form.status],
    'ARTICULACAO_REABRIR',
    (form, req, target) => {
      if (target === 'RASCUNHO' && S.responseCount(db, form.id))
        D.fail(409, 'Esta avaliação já recebeu respostas e não pode voltar a rascunho.');
    }
  );

  app.delete(
    '/api/articulation/forms/:id',
    manage,
    wrap((req, res) => {
      const form = formOf(req);
      if (form.status !== 'RASCUNHO') D.fail(409, 'Só uma avaliação em rascunho pode ser excluída.');
      D.transaction(db, () => {
        S.deleteForm(db, form.id);
        D.audit(db, req.user, 'ARTICULACAO_EXCLUIR', {form_id: form.id});
      });
      res.json({ok: true});
    })
  );

  // ---- Student: answering --------------------------------------------------------------
  app.get(
    '/api/articulation/open',
    answer,
    wrap((req, res) => {
      res.json(
        S.listForms(db, ['LIBERADO']).map(form => ({
          id: form.id,
          title: form.title,
          year: form.year,
          semester: form.semester,
          answered: S.hasAnswered(db, form.id, req.user.studentId)
        }))
      );
    })
  );

  const answerable = req => {
    const form = S.getForm(db, D.id(req.params.id));
    if (!form || form.status !== 'LIBERADO') D.fail(404, 'Avaliação não disponível.');
    if (S.hasAnswered(db, form.id, req.user.studentId)) D.fail(409, 'Você já respondeu esta avaliação.');
    return form;
  };

  app.get(
    '/api/articulation/open/:id',
    answer,
    wrap((req, res) => {
      const form = answerable(req),
        lists = S.options(db, form.id);
      res.json({
        id: form.id,
        title: form.title,
        questions: S.questions(db, form.id).map(q => ({
          id: q.id,
          section: q.section,
          text: q.text,
          kind: q.kind,
          justify: !!q.justify,
          ...(S.LISTS.includes(q.kind) ? {options: lists[q.kind].map(o => ({id: o.id, label: o.label}))} : {})
        }))
      });
    })
  );

  app.post(
    '/api/articulation/open/:id/answers',
    answer,
    wrap((req, res) => {
      const form = answerable(req),
        questions = S.questions(db, form.id),
        lists = S.options(db, form.id);
      const given = new Map(
        (Array.isArray(req.body?.answers) ? req.body.answers : []).map(a => [Number(a?.question_id), a])
      );
      if (given.size !== questions.length) D.fail(400, 'Responda todas as perguntas.');
      const answers = questions.map(q => {
        const a = given.get(q.id);
        if (!a) D.fail(400, 'Responda todas as perguntas.');
        const justification = q.justify ? D.text(String(a.justification ?? ''), LIMITS.justification) || null : null;
        if (S.LISTS.includes(q.kind)) {
          const option = lists[q.kind].find(o => o.id === Number(a.option_id));
          if (!option) D.fail(400, `Escolha uma opção da lista na pergunta ${q.position}.`);
          return {question_id: q.id, value: option.label, option_id: option.id, justification};
        }
        if (q.kind === 'NOTA_0_10') {
          const grade = Number(a.value);
          if (a.value === '' || a.value === null || !Number.isInteger(grade) || grade < 0 || grade > 10)
            D.fail(400, `Informe uma nota de 0 a 10 na pergunta ${q.position}.`);
          return {question_id: q.id, value: String(grade), option_id: null, justification};
        }
        if (!S.CHOICES[q.kind].includes(a.value)) D.fail(400, `Resposta inválida na pergunta ${q.position}.`);
        return {question_id: q.id, value: a.value, option_id: null, justification};
      });
      const code = D.transaction(db, () => {
        const id = S.saveResponse(db, {formId: form.id, studentId: req.user.studentId, user: req.user, answers});
        D.audit(db, req.user, 'ARTICULACAO_RESPONDER', {form_id: form.id, response_id: id});
        return Receipts.issue(db, {
          user: req.user,
          studentId: req.user.studentId,
          kind: 'ARTICULACAO',
          title: 'Articulação Interdisciplinar respondida',
          detail: `${form.title} · ${form.year}.${form.semester}`
        });
      });
      res.status(201).json({ok: true, receipt: {code}});
    })
  );

  // ---- Results -------------------------------------------------------------------------
  // Figures of a set of responses: counts per answer, distribution of the grades, choices of the
  // lists, the justifications and the totals of the institution's report, always divided by the
  // respondents of the set. `named` keeps the students' identification.
  function consolidate(questions, list, named) {
    return questions.map(q => {
      const answers = list.map(r => ({response: r, answer: r.answers[q.id]})).filter(x => x.answer);
      const totals = Calc.figures(
        q.kind,
        list.map(r => r.answers[q.id]?.value ?? null),
        list.length,
        S.CHOICES[q.kind]
      );
      const base = {
        position: q.position,
        section: q.section,
        text: q.text,
        kind: q.kind,
        answered: answers.length,
        justifications: answers
          .filter(x => x.answer.justification)
          .map(x =>
            named
              ? {student_name: x.response.student_name, text: x.answer.justification}
              : {text: x.answer.justification}
          )
      };
      if (q.kind === 'NOTA_0_10')
        return {
          ...base,
          distribution: Array.from(
            {length: 11},
            (_, grade) => answers.filter(x => Number(x.answer.value) === grade).length
          ),
          ...totals
        };
      if (S.CHOICES[q.kind])
        return {
          ...base,
          counts: Object.fromEntries(
            S.CHOICES[q.kind].map(value => [value, answers.filter(x => x.answer.value === value).length])
          ),
          ...totals
        };
      const tally = new Map();
      for (const x of answers) tally.set(x.answer.value, (tally.get(x.answer.value) || 0) + 1);
      return {
        ...base,
        choices: [...tally]
          .map(([label, count]) => ({label, count}))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
      };
    });
  }

  // The institution keeps one sheet per tutor and period. The responses of each tutor, and inside
  // them the responses of each period, in the order of the lists. A form with no period question,
  // or with more than one, is not divided by period.
  function tutorGroups(form, questions, all) {
    const lists = S.options(db, form.id),
      tutorQuestion = questions.find(q => q.kind === 'TUTOR'),
      periodQuestions = questions.filter(q => q.kind === 'PERIODO'),
      periodQuestion = periodQuestions.length === 1 ? periodQuestions[0] : null;
    return lists.TUTOR.map(option => {
      const mine = tutorQuestion ? all.filter(r => r.answers[tutorQuestion.id]?.option_id === option.id) : [];
      const periods = periodQuestion
        ? lists.PERIODO.map(period => ({
            period: period.label,
            responses: mine.filter(r => r.answers[periodQuestion.id]?.option_id === period.id)
          })).filter(group => group.responses.length)
        : [];
      return {option, responses: mine, periods};
    });
  }

  function report(form, named) {
    const questions = S.questions(db, form.id),
      all = S.responses(db, form.id),
      ofTutor = questions.filter(q => q.kind !== 'TUTOR'),
      ofGroup = ofTutor.filter(q => q.kind !== 'PERIODO');
    const tutors = tutorGroups(form, questions, all).map(({option, responses, periods}) => ({
      option_id: option.id,
      label: option.label,
      professor_name: option.professor_name || null,
      responses: responses.length,
      questions: consolidate(ofTutor, responses, named),
      periods: periods.map(group => ({
        period: group.period,
        responses: group.responses.length,
        questions: consolidate(ofGroup, group.responses, named)
      }))
    }));
    return {
      form: summary(form),
      responses: all.length,
      general: consolidate(questions, all, named),
      tutors,
      performance: NO_SINGLE_FIGURE
    };
  }

  const readable = (req, form) => {
    if (!hasManage(req) && form.status !== 'RESULTADOS_LIBERADOS') D.fail(404, 'Avaliação não encontrada.');
  };
  const hasManage = req => hasPermission(req.user.role, 'articulation.manage');

  app.get(
    '/api/articulation/results',
    read,
    wrap((req, res) => {
      const visible = hasManage(req) ? ['LIBERADO', 'FINALIZADO', 'RESULTADOS_LIBERADOS'] : ['RESULTADOS_LIBERADOS'];
      res.json(S.listForms(db, visible).map(form => ({...summary(form), responses: form.responses})));
    })
  );

  app.get(
    '/api/articulation/results/:id',
    read,
    wrap((req, res) => {
      const form = formOf(req);
      readable(req, form);
      const questions = S.questions(db, form.id);
      res.json({
        ...report(form, true),
        questions: questions.map(q => ({
          id: q.id,
          position: q.position,
          text: q.text,
          kind: q.kind,
          justify: !!q.justify
        })),
        rows: S.responses(db, form.id).map(r => ({
          student_name: r.student_name,
          student_matricula: r.student_matricula,
          created_at: r.created_at,
          answers: Object.fromEntries(
            questions.map(q => [
              q.id,
              r.answers[q.id] ? {value: r.answers[q.id].value, justification: r.answers[q.id].justification} : null
            ])
          )
        }))
      });
    })
  );

  // The final workbook of the institution: one tab per tutor, named after the tutor, with the
  // answers about that tutor and three rows of totals. The last tab, which the institution's
  // workbook does not have, lists every answer of the evaluation.
  app.get(
    '/api/articulation/results/:id/export',
    read,
    wrap(async (req, res) => {
      const form = formOf(req);
      readable(req, form);
      const questions = S.questions(db, form.id),
        responses = S.responses(db, form.id),
        book = new ExcelJS.Workbook(),
        ALL = 'Todas as respostas',
        FIXED = 3; // moment, e-mail and name come before the questions
      let justify = 0;
      const columns = questions.flatMap(q => [
        {q, justification: false},
        ...(q.justify
          ? [{q, justification: true, title: ++justify === 1 ? 'Justifique' : 'Justifique ' + justify}]
          : [])
      ]);
      // One row per student, as the form the institution used: who answered and the answers.
      const fill = (target, rows) => {
        target.addRow([
          'Carimbo de data/hora',
          'Endereço de e-mail',
          'Nome do aluno:',
          ...columns.map(c => (c.justification ? c.title : c.q.text))
        ]);
        for (const r of rows) {
          target.addRow([
            new Date(String(r.created_at).replace(' ', 'T') + 'Z'),
            r.student_email,
            r.student_name,
            ...columns.map(c => {
              const a = r.answers[c.q.id];
              if (!a) return null;
              if (c.justification) return a.justification;
              return c.q.kind === 'NOTA_0_10' ? Number(a.value) : LABELS[a.value] || a.value;
            })
          ]);
        }
        target.getRow(1).font = {bold: true};
        target.getColumn(1).numFmt = 'dd/mm/yyyy hh:mm:ss';
        target.columns.forEach((column, i) => {
          column.width = i < FIXED ? 28 : 22;
        });
      };

      // The three rows of totals right below the answers, as in the institution's workbook, which
      // does not name them: average, highest and lowest grade; share of "Sim", "Parcialmente" and
      // "Não". The cells carry the formulas of the original and the result computed by
      // core/calculo/articulacao.js.
      const totals = (target, rows) => {
        const first = 2,
          last = rows.length + 1,
          total = last + 1,
          set = (row, column, value, numFmt) => {
            const cell = target.getCell(row, column);
            cell.value = value;
            if (numFmt) cell.numFmt = numFmt;
          };
        set(total, 1, 'Total');
        set(total, 2, {formula: `COUNTA(C${first}:C${last})`, result: rows.length});
        columns.forEach((c, i) => {
          if (c.justification) return;
          const column = i + FIXED + 1,
            letter = target.getColumn(column).letter,
            range = `${letter}$${first}:${letter}$${last}`,
            values = rows.map(r => r.answers[c.q.id]?.value ?? null);
          if (c.q.kind === 'NOTA_0_10') {
            set(
              total,
              column,
              {formula: `SUM(${range})/$B$${total}`, result: Calc.average(values, rows.length)},
              '0.00'
            );
            set(total + 1, column, {formula: `MAX(${range})`, result: Calc.highest(values)});
            set(total + 2, column, {formula: `MIN(${range})`, result: Calc.lowest(values)});
          } else if (S.CHOICES[c.q.kind]) {
            Calc.SHEET_SHARES.forEach((code, n) =>
              set(
                total + n,
                column,
                {
                  formula: `COUNTIF(${range},"${LABELS[code]}")/$B$${total}`,
                  result: Calc.share(values, rows.length, code)
                },
                '0%'
              )
            );
          } else if (c.q.kind === 'TUTOR' || c.q.kind === 'PERIODO') {
            // As in the original, the period shown is the one of the first answer of the tab.
            set(total, column, {formula: `${letter}${first}`, result: values[0]});
          }
        });
        for (let row = total; row < total + 3; row++) target.getRow(row).font = {bold: true};
      };
      // A sheet name has at most 31 characters, none of \ / ? * [ ] : and cannot be repeated.
      const used = new Set([ALL.toLowerCase()]);
      const sheetName = label => {
        const clean =
          label
            .replace(/[\\/?*[\]:]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^[' ]+|[' ]+$/g, '') || 'Relatório';
        for (let n = 1; ; n++) {
          const suffix = n === 1 ? '' : ` (${n})`,
            name = clean.slice(0, 31 - suffix.length).trim() + suffix;
          if (!used.has(name.toLowerCase())) {
            used.add(name.toLowerCase());
            return name;
          }
        }
      };
      const tutors = tutorGroups(form, questions, responses)
        .filter(group => group.responses.length)
        .sort((a, b) => a.option.label.localeCompare(b.option.label, 'pt-BR'));
      for (const {option, responses: mine} of tutors) {
        const tab = book.addWorksheet(sheetName(option.label));
        fill(tab, mine);
        totals(tab, mine);
      }
      fill(book.addWorksheet(ALL), responses);
      D.audit(db, req.user, 'ARTICULACAO_EXPORTAR', {form_id: form.id});
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="articulacao_${form.id}_respostas.xlsx"`);
      await book.xlsx.write(res);
      res.end();
    })
  );

  // A tutor's own consolidated figures: no student name, no other tutor. A group smaller than
  // the minimum the system already uses for class figures shows only how many answered, so
  // that an answer cannot be traced to a student by elimination (provisional default).
  app.get(
    '/api/articulation/mine',
    own,
    wrap((req, res) => {
      const minimum = Privacy.minimumGroup();
      res.json(
        S.releasedTutorOptions(db, req.user.id).map(option => {
          const form = S.getForm(db, option.form_id),
            full = report(form, false),
            mine = full.tutors.find(t => t.option_id === option.id);
          const withheld = mine.responses < minimum;
          // The division by period is shown only when every period reaches the minimum: with one
          // period hidden, its figures could be worked out from the total and the others.
          const divided = !withheld && mine.periods.every(group => group.responses >= minimum);
          return {
            form: full.form,
            tutor: mine.label,
            responses: mine.responses,
            minimum,
            withheld,
            questions: withheld ? [] : mine.questions,
            periods: divided ? mine.periods : [],
            performance: NO_SINGLE_FIGURE
          };
        })
      );
    })
  );
};
