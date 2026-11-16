'use strict';
// Receipts of student actions (table of migration 009) and the PDF produced from them.
// A module issues a receipt inside the same transaction that stores the action, so a receipt
// exists if and only if the action was really recorded. All SQL about receipts is here.
const crypto = require('node:crypto');
const D = require('./domain');

// Crockford base32: no I, L, O or U, so a code read aloud or typed by hand is unambiguous.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUPS = 4,
  GROUP_SIZE = 4; // 16 symbols = 80 random bits
const PREFIX = 'AS';

function newCode() {
  const symbols = Array.from(crypto.randomBytes(GROUPS * GROUP_SIZE), byte => ALPHABET[byte % 32]);
  const groups = Array.from({length: GROUPS}, (_, i) => symbols.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE).join(''));
  return [PREFIX, ...groups].join('-');
}

// Accepts what a person may type: lower case, spaces, missing dashes, O for 0, I or L for 1.
// Returns the canonical code, or null when it cannot be one.
function normalizeCode(input) {
  let raw = String(input ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  if (raw.startsWith(PREFIX)) raw = raw.slice(PREFIX.length);
  raw = raw.replace(/O/g, '0').replace(/[IL]/g, '1');
  if (raw.length !== GROUPS * GROUP_SIZE || [...raw].some(symbol => !ALPHABET.includes(symbol))) return null;
  return [PREFIX, ...raw.match(new RegExp(`.{${GROUP_SIZE}}`, 'g'))].join('-');
}

// `title` says what was done; `detail` gives the context. Neither may carry answers.
function issue(db, {user, studentId, kind, title, detail = ''}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    try {
      db.prepare('INSERT INTO receipts(code,student_id,user_id,kind,title,detail,origin) VALUES(?,?,?,?,?,?,?)').run(
        code,
        studentId,
        user.id,
        kind,
        D.text(title, 160),
        D.text(detail, 400),
        user.origin ? String(user.origin).slice(0, 64) : null
      );
      return code;
    } catch (err) {
      if (!/UNIQUE constraint failed: receipts\.code/i.test(err.message)) throw err;
    }
  }
  throw Error('Nao foi possivel gerar o codigo do comprovante.');
}

const SELECT = `SELECT r.code,r.kind,r.title,r.detail,r.issued_at,r.student_id,s.name student_name,s.matricula student_matricula
  FROM receipts r JOIN students s ON s.id=r.student_id`;

const findByCode = (db, code) => (code ? db.prepare(SELECT + ' WHERE r.code=?').get(code) : undefined);

const listForStudent = (db, studentId) =>
  db.prepare(SELECT + ' WHERE r.student_id=? ORDER BY r.id DESC').all(studentId);

// Newest first. `search` matches the student's name or registration, or part of a code.
function listAll(db, {search = '', limit = 200} = {}) {
  const term = '%' + String(search).trim().replace(/[%_]/g, '') + '%';
  return db
    .prepare(SELECT + ' WHERE s.name LIKE ? OR s.matricula LIKE ? OR r.code LIKE ? ORDER BY r.id DESC LIMIT ?')
    .all(term, term, term, Math.min(Math.max(Number(limit) || 200, 1), 1000));
}

// ---- PDF ------------------------------------------------------------------------------------
// One A4 page of text in the standard Helvetica fonts, written by hand: no PDF library and
// nothing fetched from outside. Text is encoded as WinAnsi, which covers Portuguese.

// Anything outside the 0-255 range has no WinAnsi byte here and becomes "?".
const pdfText = value =>
  [...String(value ?? '')]
    .map(char => (char.charCodeAt(0) > 255 ? '?' : char))
    .join('')
    .replace(/[\\()]/g, '\\$&');

// Breaks a long line at spaces so it fits the page width at the given font size.
function wrap(value, size, width = 480) {
  const limit = Math.max(20, Math.floor(width / (size * 0.5))),
    lines = [];
  let current = '';
  for (const word of String(value ?? '')
    .split(/\s+/)
    .filter(Boolean)) {
    if (current && (current + ' ' + word).length > limit) {
      lines.push(current);
      current = word;
    } else current = current ? current + ' ' + word : word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function localDateTime(utc) {
  const date = new Date(String(utc).replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return String(utc);
  return (
    date.toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', dateStyle: 'long', timeStyle: 'short'}) +
    ' (horário de Brasília)'
  );
}

function pdf(receipt) {
  const content = [];
  let y = 800;
  // Each line first moves down by its own height, so a large line never climbs over the
  // small one above it; `gap` is the space left after the whole block.
  const write = (value, {size = 11, bold = false, gap = 6} = {}) => {
    wrap(value, bold ? size * 1.1 : size).forEach((row, i) => {
      y -= size + (i ? 4 : 0);
      content.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf 56 ${y} Td (${pdfText(row)}) Tj ET`);
    });
    y -= gap;
  };
  const field = (label, value) => {
    write(label, {size: 9, gap: 4});
    write(value, {size: 12, bold: true, gap: 14});
  };
  const rule = () => {
    y -= 4;
    content.push(`0.75 w 56 ${y} m 539 ${y} l S`);
    y -= 12;
  };

  write('SUPREMA · Avaliação Suprema', {size: 10, gap: 8});
  write('Comprovante', {size: 22, bold: true, gap: 12});
  rule();
  field('O que foi feito', receipt.title);
  if (receipt.detail) field('Referência', receipt.detail);
  field('Aluno', receipt.student_name);
  field('Matrícula', receipt.student_matricula);
  field('Registrado em', localDateTime(receipt.issued_at));
  rule();
  write('Código de verificação', {size: 9, gap: 6});
  write(receipt.code, {size: 20, bold: true, gap: 18});
  write(
    'Este documento comprova que a ação acima foi registrada no sistema Avaliação Suprema. Ele não contém as respostas dadas.',
    {size: 10}
  );
  write(
    'A autenticidade é conferida pela equipe do CSTI no próprio sistema, a partir do código de verificação: vale o registro do sistema, não este arquivo.',
    {size: 10}
  );

  const stream = Buffer.from(content.join('\n'), 'latin1');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'),
      stream,
      Buffer.from('\nendstream', 'latin1')
    ])
  ];
  // Header, then the customary comment line of four high bytes that marks the file as binary.
  const parts = [Buffer.concat([Buffer.from('%PDF-1.4\n%', 'latin1'), Buffer.from([0xe2, 0xe3, 0xcf, 0xd3, 0x0a])])],
    offsets = [];
  let position = parts[0].length;
  objects.forEach((object, i) => {
    const body = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, 'latin1'),
      Buffer.isBuffer(object) ? object : Buffer.from(object, 'latin1'),
      Buffer.from('\nendobj\n', 'latin1')
    ]);
    offsets.push(position);
    parts.push(body);
    position += body.length;
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  parts.push(
    Buffer.from(
      `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`,
      'latin1'
    )
  );
  return Buffer.concat(parts);
}

module.exports = {issue, findByCode, listForStudent, listAll, normalizeCode, newCode, pdf};
