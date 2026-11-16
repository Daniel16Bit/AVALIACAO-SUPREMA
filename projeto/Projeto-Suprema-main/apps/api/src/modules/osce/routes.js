'use strict';
// OSCE: the assessment unit builds and releases; shared station accounts answer about each
// student; the assessment unit follows the results. The grades are the ones of the spreadsheet
// the institution uses, and every formula of it lives in core/calculo/osce.js.
const ExcelJS = require('exceljs');
const D = require('../../core/domain');
const Forms = require('../../core/forms');
const Calc = require('../../core/calculo/osce');
const S = require('./store');

const MAX_STATIONS = 20;
const LABELS = Calc.SHEET_LABELS;
const GRADES_NOTE =
  'As notas seguem a planilha do OSCE da instituição. Em cada estação, os acertos são os itens marcados "Fez" e valem a metade quando o item de postura (a pergunta-chave) não é "Fez"; a nota é acertos dividido pelo total de itens, de 0 a 1. A nota final é a média das estações em que o aluno foi avaliado. A planilha não traz nota de aprovação, lista de melhores e piores nem comparação entre OSCE 1 e OSCE 2; eles só serão calculados se a instituição fornecer essa regra.';

module.exports = function installOsceRoutes({app, db, auth, can}) {
  const manage = [auth, can('osce.manage')];
  const results = [auth, can('osce.results')];
  const respond = [auth, can('osce.respond')];
  const wrap = fn => (req, res, next) => {
    try {
      const pending = fn(req, res);
      if (pending && pending.then) pending.catch(next);
    } catch (err) {
      next(err);
    }
  };

  const header = body => {
    const {year, semester} = D.term(body || {});
    const round = Number(body.round);
    if (!Number.isInteger(round) || round < 1 || round > 9) D.fail(400, 'Informe a rodada do OSCE (1, 2...).');
    return {year, semester, round, period: D.period(body.period)};
  };
  const eventOf = req => S.getEvent(db, D.id(req.params.id)) || D.fail(404, 'OSCE não encontrado.');
  const assertRevision = (event, revision) => {
    if (!Number.isInteger(revision) || revision !== event.revision)
      D.fail(409, 'Este OSCE mudou em outra sessão. Atualize a tela; suas alterações não foram gravadas.');
  };
  const summary = event => ({
    id: event.id,
    title: S.title(event),
    year: event.year,
    semester: event.semester,
    round: event.round,
    period: event.period,
    status: event.status,
    key_question: !!event.key_question,
    key_question_text: event.key_question_text,
    revision: event.revision,
    released_at: event.released_at,
    closed_at: event.closed_at
  });
  // The key question is kept apart from the ones the assessment unit writes.
  const structure = event =>
    S.stations(db, event.id).map(station => {
      const questions = Forms.questions(db, station.form_id);
      return {
        id: station.id,
        position: station.position,
        name: station.name,
        questions: questions.filter(q => !q.is_key).map(q => ({text: q.text})),
        total_questions: questions.length
      };
    });

  // ---- Assessment unit: building -------------------------------------------------------
  app.get(
    '/api/osce/events',
    manage,
    wrap((req, res) => {
      res.json(
        S.listEvents(db).map(event => ({
          ...summary(event),
          stations: event.stations,
          students: event.students,
          answered: event.answered
        }))
      );
    })
  );

  app.post(
    '/api/osce/events',
    manage,
    wrap((req, res) => {
      const id = D.transaction(db, () => {
        const created = S.createEvent(db, header(req.body), req.user.id);
        D.audit(db, req.user, 'OSCE_CRIAR', {event_id: created});
        return created;
      });
      res.status(201).json({ok: true, id});
    })
  );

  app.get(
    '/api/osce/events/:id',
    manage,
    wrap((req, res) => {
      const event = eventOf(req),
        selected = S.eventStudents(db, event.id),
        chosen = new Set(selected.map(s => s.id));
      // Candidates: the students of the period plus anyone already on the list.
      const candidates = [...selected, ...S.activeStudents(db, event.period).filter(s => !chosen.has(s.id))];
      res.json({
        event: summary(event),
        stations: structure(event),
        student_ids: [...chosen],
        candidates: candidates.map(s => ({id: s.id, name: s.name, matricula: s.matricula})),
        submissions: S.totalSubmissions(db, event.id)
      });
    })
  );

  app.put(
    '/api/osce/events/:id',
    manage,
    wrap((req, res) => {
      const event = eventOf(req),
        body = req.body || {};
      if (event.status !== 'RASCUNHO')
        D.fail(423, 'Este OSCE já foi liberado. A estrutura não pode mais ser alterada.');
      assertRevision(event, body.revision);
      if (!Array.isArray(body.stations) || !body.stations.length || body.stations.length > MAX_STATIONS)
        D.fail(400, `Informe de 1 a ${MAX_STATIONS} estações.`);
      const keyText = D.text(body.key_question_text, Forms.LIMITS.question) || S.DEFAULT_KEY_TEXT;
      const draft = {
        ...header(body),
        key_question: body.key_question ? 1 : 0,
        key_question_text: keyText,
        stations: body.stations.map((station, i) => ({
          name: D.text(station?.name, 80) || 'Estação ' + (i + 1),
          questions: Forms.cleanQuestions(station?.questions ?? [])
        }))
      };
      if (!Array.isArray(body.student_ids) || body.student_ids.length > 5000) D.fail(400, 'Lista de alunos inválida.');
      const allowed = new Set(S.activeStudents(db).map(s => s.id));
      draft.student_ids = [...new Set(body.student_ids.map(Number))];
      if (draft.student_ids.some(id => !allowed.has(id)))
        D.fail(400, 'A lista contém aluno inexistente ou com acesso inativo.');
      D.transaction(db, () => {
        S.saveDraft(db, event, draft, req.user.id);
        D.audit(db, req.user, 'OSCE_SALVAR', {
          event_id: event.id,
          stations: draft.stations.length,
          students: draft.student_ids.length
        });
      });
      res.json({ok: true, revision: event.revision + 1});
    })
  );

  app.post(
    '/api/osce/events/:id/release',
    manage,
    wrap((req, res) => {
      const event = eventOf(req);
      if (event.status !== 'RASCUNHO') D.fail(409, 'Este OSCE já foi liberado.');
      assertRevision(event, req.body?.revision);
      const pending = structure(event)
        .filter(station => !station.total_questions)
        .map(station => station.name + ' sem perguntas');
      if (!S.eventStudents(db, event.id).length) pending.push('nenhum aluno na lista');
      if (pending.length) D.fail(400, 'Liberação bloqueada: ' + pending.join('; ') + '.');
      D.transaction(db, () => {
        S.setStatus(db, event.id, 'LIBERADO');
        D.audit(db, req.user, 'OSCE_LIBERAR', {event_id: event.id});
      });
      res.json({ok: true, status: 'LIBERADO', revision: event.revision + 1});
    })
  );

  app.post(
    '/api/osce/events/:id/close',
    manage,
    wrap((req, res) => {
      const event = eventOf(req);
      if (event.status !== 'LIBERADO') D.fail(409, 'Só um OSCE liberado pode ser encerrado.');
      D.transaction(db, () => {
        S.setStatus(db, event.id, 'ENCERRADO');
        D.audit(db, req.user, 'OSCE_ENCERRAR', {event_id: event.id});
      });
      res.json({ok: true, status: 'ENCERRADO', revision: event.revision + 1});
    })
  );

  // Encerrado -> liberado reopens the collection. Liberado -> rascunho is possible only
  // while nobody has answered, because it lets the questions change.
  app.post(
    '/api/osce/events/:id/reopen',
    manage,
    wrap((req, res) => {
      const event = eventOf(req);
      if (event.status === 'RASCUNHO') D.fail(409, 'Este OSCE já está em rascunho.');
      const target = event.status === 'ENCERRADO' ? 'LIBERADO' : 'RASCUNHO';
      if (target === 'RASCUNHO' && S.totalSubmissions(db, event.id))
        D.fail(409, 'Este OSCE já recebeu respostas e não pode voltar a rascunho.');
      D.transaction(db, () => {
        S.setStatus(db, event.id, target);
        D.audit(db, req.user, 'OSCE_REABRIR', {event_id: event.id, status: target});
      });
      res.json({ok: true, status: target, revision: event.revision + 1});
    })
  );

  app.delete(
    '/api/osce/events/:id',
    manage,
    wrap((req, res) => {
      const event = eventOf(req);
      if (event.status !== 'RASCUNHO') D.fail(409, 'Só um OSCE em rascunho pode ser excluído.');
      D.transaction(db, () => {
        S.deleteEvent(db, event.id);
        D.audit(db, req.user, 'OSCE_EXCLUIR', {event_id: event.id});
      });
      res.json({ok: true});
    })
  );

  app.post(
    '/api/osce/submissions/:id/void',
    manage,
    wrap((req, res) => {
      const submissionId = D.id(req.params.id),
        station = S.submissionStation(db, submissionId);
      if (!station) D.fail(404, 'Resposta não encontrada.');
      D.transaction(db, () => {
        Forms.voidSubmission(db, {submissionId, userId: req.user.id, reason: req.body?.reason});
        D.audit(db, req.user, 'OSCE_ANULAR_RESPOSTA', {
          event_id: station.event_id,
          station_id: station.station_id,
          submission_id: submissionId
        });
      });
      res.json({ok: true});
    })
  );

  // ---- Assessment unit: results and grades ----------------------------------------------
  // Every station of an event with its questions, its valid answers and, for each student
  // evaluated, the hits and the grade of the institution's spreadsheet. The posture item is the
  // key question; a station built without it has no reduction.
  const graded = event =>
    S.stations(db, event.id).map(station => {
      const questions = Forms.questions(db, station.form_id),
        key = questions.find(q => q.is_key),
        items = questions.filter(q => !q.is_key),
        all = Forms.submissions(db, station.form_id),
        valid = new Map(all.filter(s => !s.voided_at).map(s => [s.student_id, s]));
      const marks = new Map(
        [...valid].map(([studentId, s]) => {
          const answers = items.map(q => s.answers[q.id]?.value ?? null),
            posture = key ? (s.answers[key.id]?.value ?? null) : undefined;
          return [studentId, {hits: Calc.hits(answers, posture), grade: Calc.grade(answers, posture)}];
        })
      );
      return {station, questions, key, items, all, valid, marks};
    });
  const gradesOf = (stations, student) => stations.map(st => st.marks.get(student.id)?.grade ?? null);

  app.get(
    '/api/osce/events/:id/results',
    results,
    wrap((req, res) => {
      const event = eventOf(req),
        students = S.eventStudents(db, event.id),
        byStation = graded(event);
      const stations = byStation.map(({station, questions, items, all, valid, marks}) => {
        const shape = s => ({id: s.id, created_at: s.created_at, account: s.account_name, answers: s.answers});
        return {
          id: station.id,
          name: station.name,
          position: station.position,
          total: students.length,
          answered: valid.size,
          items: items.length,
          average: Calc.shown(Calc.average([...marks.values()].map(mark => mark.grade))),
          questions: questions.map(q => {
            const values = [...valid.values()].map(s => s.answers[q.id]?.value);
            return {
              id: q.id,
              position: q.position,
              text: q.text,
              is_key: !!q.is_key,
              sim: values.filter(v => v === 'SIM').length,
              nao: values.filter(v => v === 'NAO').length
            };
          }),
          rows: students.map(student => ({
            student,
            submission: valid.has(student.id) ? shape(valid.get(student.id)) : null,
            hits: marks.get(student.id)?.hits ?? null,
            grade: Calc.shown(marks.get(student.id)?.grade)
          })),
          voided: all
            .filter(s => s.voided_at)
            .map(s => ({
              ...shape(s),
              student_id: s.student_id,
              voided_at: s.voided_at,
              voided_by: s.voided_by_name,
              reason: s.void_reason
            }))
        };
      });
      // "Resultado Final" of the spreadsheet: the averages are taken over the exact grades and
      // only then shown with two decimal places.
      const consolidated = {
        available: true,
        message: GRADES_NOTE,
        students: students.map(student => {
          const grades = gradesOf(byStation, student);
          return {
            student,
            grades: grades.map(Calc.shown),
            evaluated: grades.filter(grade => grade !== null).length,
            final: Calc.shown(Calc.average(grades))
          };
        }),
        average: Calc.shown(Calc.average(students.flatMap(student => gradesOf(byStation, student))))
      };
      res.json({event: summary(event), students: students.length, stations, consolidated});
    })
  );

  // The workbook of the institution: one tab per station with the answers and the formulas of
  // hits and grade, "Junção" with every grade and "Resultado Final" with the averages. Each
  // formula carries the result computed by core/calculo/osce.js. Differences from the original,
  // all on purpose: the hits are counted item by item, so that a comment that happens to be the
  // word "Fez" is never counted; "Resultado Final" is a table of averages instead of a pivot
  // table; the evaluator is the shared account, because the system never records a named teacher.
  app.get(
    '/api/osce/events/:id/results/export',
    results,
    wrap(async (req, res) => {
      const event = eventOf(req),
        students = S.eventStudents(db, event.id),
        byStation = graded(event),
        book = new ExcelJS.Workbook(),
        used = new Set(['junção', 'resultado final']);
      // A sheet name has at most 31 characters, none of \ / ? * [ ] : and cannot be repeated.
      const sheetName = label => {
        const clean =
          label
            .replace(/[\\/?*[\]:]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^[' ]+|[' ]+$/g, '') || 'Estação';
        for (let n = 1; ; n++) {
          const suffix = n === 1 ? '' : ` (${n})`,
            name = clean.slice(0, 31 - suffix.length).trim() + suffix;
          if (!used.has(name.toLowerCase())) {
            used.add(name.toLowerCase());
            return name;
          }
        }
      };
      const quoted = name => `'${name.replace(/'/g, "''")}'`;
      const tabs = byStation.map(({station, key, items, valid, marks}) => {
        const tab = book.addWorksheet(sheetName(station.name)),
          letter = column => tab.getColumn(column).letter,
          // A, B, C: moment, student, evaluator. D, E: posture item and its comment, kept (empty)
          // even without a key question so that every tab has the items in the same columns.
          itemColumn = i => 6 + i * 2,
          hitsColumn = 6 + items.length * 2,
          gradeColumn = hitsColumn + 1,
          nameColumn = hitsColumn + 2,
          evaluated = students.filter(student => valid.has(student.id)),
          totalRow = evaluated.length + 4;
        tab.addRow([
          'Carimbo de data/hora',
          'Aluno',
          'Avaliador',
          key ? key.text : null,
          key ? 'Comentários' : null,
          ...items.flatMap(q => [q.text, 'Comentários']),
          'Acertos',
          'NOTA',
          'Estação'
        ]);
        evaluated.forEach((student, i) => {
          const row = i + 2,
            s = valid.get(student.id),
            mark = marks.get(student.id),
            counted = items.map((q, n) => `COUNTIF(${letter(itemColumn(n))}${row},"${LABELS.SIM}")`).join('+') || '0',
            posture = key ? `*(IF(D${row}="${LABELS.SIM}",1,0.5))` : '';
          tab.addRow([
            new Date(String(s.created_at).replace(' ', 'T') + 'Z'),
            student.name,
            s.account_name,
            key ? LABELS[s.answers[key.id]?.value] || null : null,
            key ? s.answers[key.id]?.comment || null : null,
            ...items.flatMap(q => [LABELS[s.answers[q.id]?.value] || null, s.answers[q.id]?.comment || null])
          ]);
          tab.getCell(row, hitsColumn).value = {formula: `(${counted})${posture}`, result: mark.hits};
          if (items.length)
            tab.getCell(row, gradeColumn).value = {
              formula: `(${letter(hitsColumn)}${row})/C$${totalRow}`,
              result: mark.grade
            };
          tab.getCell(row, nameColumn).value = station.name;
        });
        tab.getCell(totalRow, 2).value = 'Total Questões';
        tab.getCell(totalRow, 3).value = items.length;
        tab.getRow(1).font = {bold: true};
        tab.getRow(totalRow).font = {bold: true};
        tab.getColumn(1).numFmt = 'dd/mm/yyyy hh:mm:ss';
        tab.columns.forEach((column, i) => {
          column.width = i < 3 ? 28 : 22;
        });
        return {
          station,
          tab,
          graded: !!items.length,
          rowOf: new Map(evaluated.map((student, i) => [student.id, i + 2])),
          students: letter(2),
          grades: letter(gradeColumn),
          names: letter(nameColumn),
          marks
        };
      });

      // "Junção": one row per grade, in the order of the stations.
      const joined = book.addWorksheet('Junção');
      joined.addRow(['Nome', 'Nota', 'Estação']);
      for (const t of tabs) {
        if (!t.graded) continue;
        for (const [studentId, row] of t.rowOf) {
          const at = column => `${quoted(t.tab.name)}!${column}${row}`,
            student = students.find(s => s.id === studentId);
          joined.addRow([
            {formula: at(t.students), result: student.name},
            {formula: at(t.grades), result: t.marks.get(studentId).grade},
            {formula: at(t.names), result: t.station.name}
          ]);
        }
      }
      joined.getRow(1).font = {bold: true};
      joined.getColumn(1).width = 40;
      joined.getColumn(3).width = 28;

      // "Resultado Final": students in rows, stations in columns, average of the grade. Only the
      // students with at least one grade appear, as in the pivot table of the institution.
      const final = book.addWorksheet('Resultado Final'),
        listed = students.filter(student => gradesOf(byStation, student).some(grade => grade !== null)),
        firstRow = 5,
        lastRow = firstRow + listed.length - 1,
        totalColumn = tabs.length + 2,
        letter = column => final.getColumn(column).letter,
        set = (row, column, value) => {
          const cell = final.getCell(row, column);
          cell.value = value;
          if (row >= firstRow && column > 1) cell.numFmt = '0.00';
        };
      set(3, 1, 'Média de Nota');
      set(4, 1, 'Aluno');
      tabs.forEach((t, i) => set(4, i + 2, t.station.name));
      set(4, totalColumn, 'Total Geral');
      listed.forEach((student, i) => {
        const row = firstRow + i,
          grades = gradesOf(byStation, student);
        set(row, 1, student.name);
        tabs.forEach((t, n) => {
          if (grades[n] !== null)
            set(row, n + 2, {
              formula: `${quoted(t.tab.name)}!${t.grades}${t.rowOf.get(student.id)}`,
              result: grades[n]
            });
        });
        set(row, totalColumn, {
          formula: `AVERAGE(B${row}:${letter(totalColumn - 1)}${row})`,
          result: Calc.average(grades)
        });
      });
      if (listed.length) {
        const bottom = lastRow + 1;
        set(bottom, 1, 'Total Geral');
        tabs.forEach((t, n) => {
          const column = letter(n + 2),
            average = Calc.average([...t.marks.values()].map(mark => mark.grade));
          if (average !== null)
            set(bottom, n + 2, {formula: `AVERAGE(${column}${firstRow}:${column}${lastRow})`, result: average});
        });
        set(bottom, totalColumn, {
          formula: `AVERAGE(B${firstRow}:${letter(totalColumn - 1)}${lastRow})`,
          result: Calc.average(listed.flatMap(student => gradesOf(byStation, student)))
        });
        final.getRow(bottom).font = {bold: true};
      }
      final.getRow(3).font = {bold: true};
      final.getRow(4).font = {bold: true};
      final.getColumn(1).width = 40;
      for (let column = 2; column <= totalColumn; column++) final.getColumn(column).width = 18;

      D.audit(db, req.user, 'OSCE_EXPORTAR', {event_id: event.id});
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="osce_${event.id}_notas.xlsx"`);
      await book.xlsx.write(res);
      res.end();
    })
  );

  // ---- Station accounts: answering -----------------------------------------------------
  const releasedStation = req => {
    const station = S.getStation(db, D.id(req.params.id)),
      event = station && S.getEvent(db, station.event_id);
    if (!station || event.status === 'RASCUNHO') D.fail(404, 'Estação não encontrada.');
    if (event.status !== 'LIBERADO') D.fail(423, 'Este OSCE foi encerrado e não recebe mais respostas.');
    return {station, event};
  };

  app.get(
    '/api/osce/respond/events',
    respond,
    wrap((req, res) => {
      res.json(
        S.listEvents(db, 'LIBERADO').map(event => ({
          id: event.id,
          title: S.title(event),
          year: event.year,
          semester: event.semester,
          round: event.round,
          period: event.period,
          students: event.students,
          stations: S.stations(db, event.id).map(station => ({
            id: station.id,
            name: station.name,
            answered: S.answeredIds(db, station.form_id).size
          }))
        }))
      );
    })
  );

  app.get(
    '/api/osce/respond/stations/:id',
    respond,
    wrap((req, res) => {
      const {station, event} = releasedStation(req),
        answered = S.answeredIds(db, station.form_id);
      res.json({
        event: {id: event.id, title: S.title(event)},
        station: {id: station.id, name: station.name},
        questions: Forms.questions(db, station.form_id).map(q => ({
          id: q.id,
          position: q.position,
          text: q.text,
          is_key: !!q.is_key
        })),
        students: S.eventStudents(db, event.id).map(student => ({...student, answered: answered.has(student.id)}))
      });
    })
  );

  app.post(
    '/api/osce/respond/stations/:id/submissions',
    respond,
    wrap((req, res) => {
      const {station, event} = releasedStation(req),
        studentId = D.id(req.body?.student_id);
      if (!S.inEvent(db, event.id, studentId)) D.fail(400, 'Aluno fora da lista deste OSCE.');
      const id = D.transaction(db, () => {
        const created = Forms.submit(db, {
          formId: station.form_id,
          studentId,
          userId: req.user.id,
          origin: req.user.origin,
          answers: req.body.answers
        });
        // Records the shared account, the station and the moment; never a named teacher.
        D.audit(db, req.user, 'OSCE_RESPONDER', {event_id: event.id, station_id: station.id, submission_id: created});
        return created;
      });
      res.status(201).json({ok: true, id});
    })
  );
};
