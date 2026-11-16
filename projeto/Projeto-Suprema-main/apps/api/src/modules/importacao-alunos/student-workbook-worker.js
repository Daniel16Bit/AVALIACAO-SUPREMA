'use strict';
const {parentPort, workerData} = require('node:worker_threads');
const {validateWorkbookArchive} = require('../../shared/spreadsheets/workbook-guard');
const {readXls} = require('../../shared/spreadsheets/xls-reader');
const ExcelJS = require('exceljs');
const norm = v =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
function periodFromSheet(name) {
  const s = norm(name);
  const m = s.match(/^(?:periodo\s*)?(\d{1,2})\s*[\u00ba\u00b0o]?\s*(?:periodo)?$/i);
  return m && +m[1] >= 1 && +m[1] <= 30 ? String(+m[1]) : null;
}
function cellData(c, identity = false) {
  const errors = [];
  let v = c?.value;
  if (c?.formula || (v && typeof v === 'object' && (v.formula !== undefined || v.sharedFormula !== undefined)))
    return {value: '', errors: ['C\u00e9lula com f\u00f3rmula: copie e cole como valores antes de importar.']};
  if (c?.error || (v && typeof v === 'object' && v.error))
    return {value: '', errors: ['C\u00e9lula cont\u00e9m um erro do Excel.']};
  if (v instanceof Date)
    return {value: '', errors: ['Data em campo de identifica\u00e7\u00e3o. Confira a formata\u00e7\u00e3o.']};
  if (v && typeof v === 'object') {
    if (v.richText) v = v.richText.map(r => r.text).join('');
    else if (typeof v.text === 'string') v = v.text;
    else if (v !== null) return {value: '', errors: ['Tipo de c\u00e9lula n\u00e3o suportado.']};
  }
  if (v === null || v === undefined) v = '';
  if (identity && typeof v === 'number') {
    if (!Number.isSafeInteger(v) || v < 0)
      errors.push('Matr\u00edcula num\u00e9rica inv\u00e1lida ou imprecisa. Use texto no Excel.');
    const fmt = c?.numFmt || '';
    v = /^0{2,70}$/.test(fmt) && Number.isSafeInteger(v) ? String(v).padStart(fmt.length, '0') : String(v);
  }
  return {value: String(v).trim(), errors};
}
async function parse() {
  const buf = Buffer.from(workerData.bytes),
    ext = workerData.extension;
  let sheets = [];
  if (buf.length > 8 * 1024 * 1024 || buf.length < 8)
    throw Error('O arquivo deve ser um Excel v\u00e1lido de at\u00e9 8 MB.');
  if (ext === '.xlsx') {
    validateWorkbookArchive(buf);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    sheets = wb.worksheets.map(s => ({
      name: s.name,
      hidden: s.state !== 'visible',
      kind: 0,
      maxRow: s.rowCount,
      get: (r, c) => s.getCell(r, c)
    }));
  } else if (ext === '.xls') sheets = readXls(buf).map(s => ({...s, get: (r, c) => s.cells.get(`${r}:${c}`)}));
  else throw Error('Envie um arquivo .xlsx ou .xls.');
  if (!sheets.length || sheets.length > 100) throw Error('O arquivo deve ter entre 1 e 100 abas.');
  const rows = [],
    sheetInfo = [];
  let blankRows = 0;
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i],
      base = {id: String(i + 1), name: s.name, detected_period: periodFromSheet(s.name), hidden: !!s.hidden};
    if (s.kind !== 0) {
      sheetInfo.push({...base, accepted: false, reason: 'Aba n\u00e3o tabular.', rows: 0});
      continue;
    }
    if (s.maxRow > 50000) throw Error('Uma aba excede 50 mil linhas. Divida o arquivo; nenhuma linha foi importada.');
    const b = cellData(s.get(3, 2)),
      c = cellData(s.get(3, 3));
    if (norm(b.value) !== 'matricula' || norm(c.value) !== 'aluno' || b.errors.length || c.errors.length) {
      sheetInfo.push({
        ...base,
        accepted: false,
        reason: 'Cabe\u00e7alhos B3/C3 diferentes de Matr\u00edcula / Aluno.',
        rows: 0
      });
      continue;
    }
    let count = 0;
    for (let n = 4; n <= s.maxRow; n++) {
      const id = cellData(s.get(n, 2), true),
        name = cellData(s.get(n, 3));
      if (!id.value && !name.value && !id.errors.length && !name.errors.length) {
        blankRows++;
        continue;
      }
      if (rows.length >= 2000)
        throw Error('M\u00e1ximo de 2.000 registros por arquivo. Divida o arquivo; nenhuma conta foi criada.');
      const errors = [...id.errors, ...name.errors];
      rows.push({
        row_id: `${i + 1}:${n}`,
        sheet_id: base.id,
        sheet: s.name,
        excel_row: n,
        matricula: id.value,
        name: name.value,
        period: base.detected_period,
        parse_errors: errors
      });
      count++;
    }
    sheetInfo.push({...base, accepted: true, rows: count, reason: count ? '' : 'Aba sem alunos a partir da linha 4.'});
  }
  if (!rows.length)
    throw Error(
      'Nenhum aluno encontrado. Confira Matr\u00edcula em B3, Aluno em C3 e os registros a partir da linha 4.'
    );
  return {rows, sheets: sheetInfo, blank_rows: blankRows, format: ext};
}
parse()
  .then(result => parentPort.postMessage({ok: true, result}))
  .catch(e => parentPort.postMessage({ok: false, error: e.message || 'N\u00e3o foi poss\u00edvel ler a planilha.'}));
