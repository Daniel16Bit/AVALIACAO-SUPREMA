'use strict';
const crypto = require('node:crypto');
const express = require('express');
const {validateWorkbookArchive} = require('../../shared/spreadsheets/workbook-guard');
const ExcelJS = require('exceljs');
const D = require('../../core/domain');
const H = require('../../core/grade-history');
module.exports = function ({app, db, auth, can}) {
  const middle = [auth, can('assessment.own')];
  // Bounded native multipart parsing; the legacy Multer module is not loaded.
  const upload = express.raw({type: 'multipart/form-data', limit: '9mb'});
  const previews = new Map();
  const norm = s =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const textCell = c => {
    const v = c.value;
    if (v === null) return '';
    if (typeof v === 'object') {
      if (v.text !== undefined) return String(v.text);
      if (v.richText) return v.richText.map(t => t.text).join('');
      if (v.result !== undefined) return String(v.result);
      return '';
    }
    return String(v);
  };
  const scoreValue = c => {
    let v = c.value;
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'object') {
      if (v.result === undefined)
        D.fail(400, 'F\u00f3rmula sem resultado salvo em ' + c.address + '. Abra e salve a planilha no Excel.');
      v = v.result;
    }
    if (typeof v === 'string') v = v.trim().replace(',', '.');
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1000000) D.fail(400, 'Nota inv\u00e1lida em ' + c.address + '.');
    return n;
  };
  app.post('/api/assessment/:id/import', middle, upload, async (req, res, next) => {
    try {
      const a = D.requireAssessment(db, req.params.id, req.user);
      D.assertWritable(db, a);
      if (!Buffer.isBuffer(req.body) || !req.is('multipart/form-data')) D.fail(400, 'Envie uma planilha .xlsx.');
      let form;
      try {
        form = await new Response(req.body, {headers: {'content-type': req.headers['content-type']}}).formData();
      } catch {
        D.fail(400, 'Arquivo de envio invalido.');
      }
      const entries = [...form.entries()];
      if (entries.length !== 1 || entries[0][0] !== 'file') D.fail(400, 'Envie somente uma planilha por vez.');
      const file = entries[0][1];
      if (typeof file === 'string' || !file.name.toLowerCase().endsWith('.xlsx') || file.size > 8 * 1024 * 1024)
        D.fail(400, 'Envie uma planilha .xlsx com ate 8 MB.');
      const buffer = Buffer.from(await file.arrayBuffer());
      validateWorkbookArchive(buffer);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(buffer);
      const sheet = book.worksheets[0];
      if (!sheet || sheet.rowCount > 10000) D.fail(400, 'Planilha vazia ou maior que 10.000 linhas.');
      let header = null,
        map = {};
      for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
        const current = {};
        sheet.getRow(r).eachCell((c, col) => {
          const h = norm(textCell(c));
          if (['aluno', 'nomedoaluno', 'nome', 'estudante'].includes(h)) current.name = col;
          if (['matricula', 'registro', 'ra'].includes(h)) current.matricula = col;
          for (let i = 1; i <= 6; i++)
            if (h === `c${i}` || h.startsWith(`questao${i}`) || h === `q${i}`) current['c' + i] = col;
          for (let i = 1; i <= 4; i++) {
            if (h === `me${i}` || h.startsWith(`multiplaescolha${i}`) || h.startsWith(`mc${i}`))
              current['me' + i] = col;
            if (h === `osce${i}` || h === `osceestacao${i}` || h === `estacao${i}`) current['osce' + i] = col;
          }
          for (let i = 1; i <= 2; i++) if (h === `sai${i}` || h === `pbl${i}`) current['pbl' + i] = col;
          for (let i = 1; i <= 3; i++) if (h === `outros${i}`) current['q' + (i + 6)] = col;
          if (h === 'osce' || h === 'totalosce') current.osce = col;
          if (h.startsWith('trabalho')) current.trabalho = col;
          if (h === 'outrosfinal') current.outros_final = col;
        });
        if ((current.matricula || current.name) && D.scoreKeys.some(k => current[k])) {
          map = current;
          header = r;
          break;
        }
      }
      if (!header)
        D.fail(
          400,
          'Cabe\u00e7alho n\u00e3o reconhecido. Use a planilha exportada desta avalia\u00e7\u00e3o, com Matr\u00edcula e Quest\u00e3o 1 etc. Nenhuma nota foi alterada.'
        );
      // Students are matched by registration only: two students may share a name.
      if (!map.matricula)
        D.fail(
          400,
          'A planilha não tem a coluna Matrícula. Os alunos são identificados somente pela matrícula; use o modelo exportado desta avaliação. Nenhuma nota foi alterada.'
        );
      // Modelos exportados possuem identificacao da avaliacao, impedindo importacao cruzada A1/A2/A3.
      const control = book.getWorksheet('CONTROLE_AVALIACAO');
      if (control) {
        const id = Number(control.getCell('B2').value),
          tipo = String(control.getCell('B3').value || '');
        if (id !== a.id || tipo !== a.type)
          D.fail(400, 'Este modelo pertence a outra avaliacao. Baixe o modelo da A1, A2 ou A3 selecionada.');
      }
      const roster = D.roster(db, a),
        planned = [],
        changes = [],
        seen = new Set(),
        errors = [];
      const configured = new Map(
        [...D.config(db, a.id), ...D.instrumentConfig(db, a.id)].map(q => [q.field_key, q.max_value])
      );
      for (let r = header + 1; r <= sheet.rowCount; r++) {
        const matricula = map.matricula ? textCell(sheet.getCell(r, map.matricula)).trim() : '',
          name = map.name ? textCell(sheet.getCell(r, map.name)).trim() : '';
        if (!matricula && !name) continue;
        if (!matricula) {
          // A line without registration is ignored only when it carries no grade (titles, notes).
          if (D.scoreKeys.some(k => map[k] && textCell(sheet.getCell(r, map[k])).trim() !== ''))
            errors.push('Linha ' + r + ': matrícula não informada.');
          continue;
        }
        const matches = roster.filter(s => s.matricula.toLowerCase() === matricula.toLowerCase());
        if (matches.length !== 1) {
          errors.push('Linha ' + r + ': matr\u00edcula n\u00e3o encontrada nesta avalia\u00e7\u00e3o.');
          continue;
        }
        const previous = matches[0];
        if (seen.has(previous.id)) {
          errors.push('Linha ' + r + ': aluno repetido.');
          continue;
        }
        seen.add(previous.id);
        try {
          const input = {};
          for (const k of D.scoreKeys) {
            if (!map[k]) continue;
            const cell = sheet.getCell(r, map[k]);
            // Campos em branco nao apagam notas ja existentes.
            if (cell.value === null || cell.value === undefined || cell.value === '') continue;
            const val = scoreValue(cell);
            if (val === null) continue;
            const max = configured.get(k);
            if (max > 0 && val > max + 1e-8) D.fail(400, `Linha ${r}: ${k} excede o maximo ${max}.`);
            input[k] = val;
          }
          if (!Object.keys(input).length) continue;
          const row = D.normalizeScore(previous, input);
          planned.push(row);
          changes.push({
            id: previous.id,
            matricula: previous.matricula,
            name: previous.name,
            values: input,
            nota_final: row.nota_final
          });
        } catch (e) {
          errors.push(e.message);
        }
      }
      if (errors.length) D.fail(400, 'Importa\u00e7\u00e3o bloqueada: ' + errors.slice(0, 8).join(' '));
      if (!planned.length) D.fail(400, 'Nenhuma linha de aluno reconhecida.');
      const now = Date.now();
      for (const [k, p] of previews) if (p.expires < now) previews.delete(k);
      if (previews.size >= 30) D.fail(429, 'H\u00e1 muitas pr\u00e9vias abertas. Aguarde e tente novamente.');
      const token = crypto.randomBytes(24).toString('hex');
      previews.set(token, {
        user: req.user.id,
        aid: a.id,
        revision: a.revision,
        rows: planned,
        expires: now + 10 * 60000
      });
      res.json({
        preview: true,
        token,
        updated: planned.length,
        columns: Object.keys(map),
        changes,
        sample: planned
          .slice(0, 8)
          .map(r => ({name: r.name, matricula: r.matricula, nota_prova: r.nota_prova, nota_final: r.nota_final})),
        message: 'Notas verificadas. Nenhuma nota foi salva ou publicada.'
      });
    } catch (e) {
      next(e);
    }
  });
  app.post('/api/assessment/:id/import/confirm', middle, (req, res, next) => {
    try {
      const a = D.requireAssessment(db, req.params.id, req.user);
      D.assertWritable(db, a);
      const p = previews.get(req.body.token);
      if (!p || p.user !== req.user.id || p.aid !== a.id || p.expires < Date.now())
        D.fail(400, 'Pr\u00e9via expirada. Envie a planilha novamente.');
      D.assertRevision(a, p.revision);
      const current = new Map(D.roster(db, a).map(r => [r.id, r])),
        roster = current;
      if (p.rows.some(r => !roster.has(r.id))) D.fail(409, 'As matr\u00edculas mudaram. Gere outra pr\u00e9via.');
      const keys = [...D.scoreKeys, 'nota_prova', 'nota_final'],
        up = db.prepare(`UPDATE scores SET ${keys.map(k => k + '=?').join(',')} WHERE id=? AND assessment_id=?`);
      D.transaction(db, () => {
        for (const r of p.rows) up.run(...keys.map(k => r[k] ?? null), r.id, a.id);
        db.prepare('UPDATE assessments SET revision=revision+1 WHERE id=?').run(a.id);
        const changed = H.recordScoreChanges(db, {
          assessmentId: a.id,
          actorId: req.user.id,
          action: 'IMPORTAR_EXCEL',
          revision: a.revision + 1,
          pairs: p.rows.map(r => [current.get(r.id), r])
        });
        D.audit(db, req.user, 'IMPORTAR_EXCEL', {assessment_id: a.id, rows: p.rows.length, changed_cells: changed});
      });
      previews.delete(req.body.token);
      res.json({ok: true, updated: p.rows.length, draft: true});
    } catch (e) {
      next(e);
    }
  });
  app.get('/api/assessment/:id/export', middle, async (req, res, next) => {
    try {
      const a = D.requireAssessment(db, req.params.id, req.user),
        rows = D.roster(db, a),
        config = D.config(db, a.id),
        book = new ExcelJS.Workbook(),
        sheet = book.addWorksheet(a.type),
        isModel = req.query.modelo === '1';
      const fields = [
        ...D.questionKeys,
        'nota_prova',
        'pbl1',
        'pbl2',
        ...D.stationKeys,
        'osce',
        'q7',
        'q8',
        'q9',
        'trabalho',
        'outros_final',
        'nota_final'
      ];
      const labels = {
        nota_prova: 'Nota da Prova',
        pbl1: 'SAI 1',
        pbl2: 'SAI 2',
        osce1: 'OSCE Estacao 1',
        osce2: 'OSCE Estacao 2',
        osce3: 'OSCE Estacao 3',
        osce4: 'OSCE Estacao 4',
        osce: 'Total OSCE',
        q7: 'Outros 1',
        q8: 'Outros 2',
        q9: 'Outros 3',
        trabalho: 'Trabalho',
        outros_final: 'Outros final',
        nota_final: 'Nota Final'
      };
      sheet.addRow([
        'Aluno',
        'Matricula',
        ...fields.map(k => (D.questionKeys.includes(k) ? config.find(q => q.field_key === k).label : labels[k] || k))
      ]);
      for (const r of rows) sheet.addRow([r.name, r.matricula, ...fields.map(k => (isModel ? null : (r[k] ?? null)))]);
      if (isModel) {
        // Identificadores da avaliacao nao precisam ser editados pelo professor.
        const control = book.addWorksheet('CONTROLE_AVALIACAO', {state: 'veryHidden'});
        control.getCell('A1').value = 'Modelo de notas Avaliacao Suprema';
        control.getCell('A2').value = 'ID';
        control.getCell('B2').value = a.id;
        control.getCell('A3').value = 'Tipo';
        control.getCell('B3').value = a.type;
        control.getCell('A4').value = 'Ano';
        control.getCell('B4').value = a.year;
        control.getCell('A5').value = 'Semestre';
        control.getCell('B5').value = a.semester;
        control.getCell('A6').value = 'Periodo';
        control.getCell('B6').value = a.period;
        control.getCell('A7').value = 'Disciplina';
        control.getCell('B7').value = a.discipline;
        control.getCell('A8').value = 'Orientacao';
        control.getCell('B8').value = 'Nao altere matriculas, nomes ou cabecalhos.';
        const instructions = book.addWorksheet('INSTRUCOES');
        [
          ['AVALIACAO SUPREMA - MODELO DE LANCAMENTO'],
          ['Avaliacao', a.type],
          ['Disciplina', a.discipline],
          ['Ano / Semestre', `${a.year}.${a.semester}`],
          ['Preenchimento', 'Use a primeira aba. Identifique cada estudante pela matricula existente.'],
          ['Campos em branco', 'Nao alteram notas ja existentes no sistema.'],
          ['Totais', 'Nota da Prova, Total OSCE e Nota Final sao calculados pelo sistema.'],
          [
            'Ao importar',
            'As notas entram na tela para revisao, sem gravar. Clique em Salvar Rascunho e depois Publicar.'
          ],
          ['Seguranca', 'Nao altere a aba de controle, nem envie este arquivo como A1, A2 ou A3 diferente.']
        ].forEach(row => instructions.addRow(row));
        instructions.getColumn(1).width = 28;
        instructions.getColumn(2).width = 110;
        sheet.autoFilter = {
          from: {row: 1, column: 1},
          to: {row: Math.max(2, rows.length + 1), column: fields.length + 2}
        };
        for (let i = 3; i <= fields.length + 2; i++) {
          const col = sheet.getColumn(i);
          const field = fields[i - 3];
          if (['nota_prova', 'osce', 'nota_final', 'outros_final'].includes(field)) {
            col.eachCell({includeEmpty: true}, cell => {
              if (cell.row > 1) cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FFF1F5F9'}};
            });
          } else {
            col.eachCell({includeEmpty: true}, cell => {
              if (cell.row > 1) {
                cell.numFmt = '0.00';
                cell.font = {color: {argb: 'FF1D4ED8'}};
              }
            });
          }
        }
      }
      sheet.columns.forEach((c, i) => (c.width = i === 0 ? 36 : 20));
      sheet.getRow(1).font = {bold: true, color: {argb: 'FFFFFFFF'}};
      sheet.getRow(1).fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FF0B3F7B'}};
      sheet.views = [{state: 'frozen', ySplit: 1, xSplit: 2}];
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${isModel ? 'Modelo' : 'Avaliacao'}_${a.type}_${a.id}.xlsx"`
      );
      await book.xlsx.write(res);
      res.end();
    } catch (e) {
      next(e);
    }
  });
};
