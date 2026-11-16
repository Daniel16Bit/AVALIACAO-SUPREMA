'use strict';
// Synthetic-only fixtures. The XLS writer is deliberately separate from the reader.
// CFB + BIFF8 streams exercise real binary XLS, not renamed XLSX files.
const ExcelJS = require('exceljs');
const fs = require('node:fs');
const path = require('node:path');
const record = (id, data = Buffer.alloc(0)) => {
  const h = Buffer.alloc(4);
  h.writeUInt16LE(id);
  h.writeUInt16LE(data.length, 2);
  return Buffer.concat([h, data]);
};
const eof = () => record(0xa);
const bof = type => {
  const b = Buffer.alloc(16);
  b.writeUInt16LE(0x600);
  b.writeUInt16LE(type, 2);
  b.writeUInt16LE(0x0dbb, 4);
  b.writeUInt16LE(1997, 6);
  return record(0x809, b);
};
function wide(s, short = false) {
  const b = Buffer.alloc(short ? 2 : 3);
  short ? b.writeUInt8(s.length) : b.writeUInt16LE(s.length);
  b[short ? 1 : 2] = 1;
  return Buffer.concat([b, Buffer.from(s, 'utf16le')]);
}
function makeSst(strings, limit = 8000) {
  const chunks = [];
  let parts = [],
    size = 0;
  const append = b => {
      parts.push(b);
      size += b.length;
    },
    flush = () => {
      chunks.push(Buffer.concat(parts));
      parts = [];
      size = 0;
    };
  const head = Buffer.alloc(8);
  head.writeUInt32LE(strings.length);
  head.writeUInt32LE(strings.length, 4);
  append(head);
  for (const str of strings) {
    const h = Buffer.alloc(3);
    h.writeUInt16LE(str.length);
    h[2] = 1;
    if (limit - size < 3) flush();
    append(h);
    let offset = 0;
    const chars = Buffer.from(str, 'utf16le');
    while (offset < chars.length) {
      let n = Math.min(chars.length - offset, Math.floor((limit - size) / 2) * 2);
      if (!n) {
        flush();
        append(Buffer.from([1]));
        continue;
      }
      append(chars.subarray(offset, offset + n));
      offset += n;
    }
  }
  if (size) flush();
  return Buffer.concat(chunks.map((c, i) => record(i ? 0x3c : 0xfc, c)));
}
function ole(workbook, {mini = false} = {}) {
  const FREE = 0xffffffff,
    END = 0xfffffffe,
    FAT = 0xfffffffd,
    header = Buffer.alloc(512, 0);
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(header);
  header.writeUInt16LE(0x3e, 24);
  header.writeUInt16LE(3, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30);
  header.writeUInt16LE(6, 32);
  header.writeUInt32LE(0, 48);
  header.writeUInt32LE(4096, 56);
  header.writeUInt32LE(END, 68);
  for (let i = 0; i < 109; i++) header.writeUInt32LE(FREE, 76 + i * 4);
  const directory = Buffer.alloc(512);
  function dir(at, name, type, start, size) {
    const b = Buffer.from(name + '\0', 'utf16le');
    b.copy(directory, at);
    directory.writeUInt16LE(b.length, at + 64);
    directory[at + 66] = type;
    directory[at + 67] = 1;
    directory.writeUInt32LE(FREE, at + 68);
    directory.writeUInt32LE(FREE, at + 72);
    directory.writeUInt32LE(type === 5 ? 1 : FREE, at + 76);
    directory.writeUInt32LE(start, at + 116);
    directory.writeBigUInt64LE(BigInt(size), at + 120);
  }
  if (mini && workbook.length < 4096) {
    const count = Math.ceil(workbook.length / 64),
      miniLength = count * 64,
      dataSectors = Math.ceil(miniLength / 512),
      fat = Buffer.alloc(512, 255),
      mf = Buffer.alloc(512, 255),
      data = Buffer.alloc(dataSectors * 512);
    workbook.copy(data);
    header.writeUInt32LE(1, 44);
    header.writeUInt32LE(2, 60);
    header.writeUInt32LE(1, 64);
    header.writeUInt32LE(1, 76);
    fat.writeUInt32LE(END, 0);
    fat.writeUInt32LE(FAT, 4);
    fat.writeUInt32LE(END, 8);
    for (let i = 0; i < dataSectors; i++) fat.writeUInt32LE(i === dataSectors - 1 ? END : i + 4, (i + 3) * 4);
    for (let i = 0; i < count; i++) mf.writeUInt32LE(i === count - 1 ? END : i + 1, i * 4);
    dir(0, 'Root Entry', 5, 3, miniLength);
    dir(128, 'Workbook', 2, 0, workbook.length);
    return Buffer.concat([header, directory, fat, mf, data]);
  }
  const size = Math.max(4096, workbook.length),
    n = Math.ceil(size / 512);
  let f = 1;
  while (Math.ceil((1 + f + n) / 128) > f) f++;
  if (f > 109) throw Error('Fixture too large');
  const fat = Buffer.alloc(f * 512, 255),
    data = Buffer.alloc(n * 512);
  workbook.copy(data);
  header.writeUInt32LE(f, 44);
  header.writeUInt32LE(END, 60);
  fat.writeUInt32LE(END, 0);
  for (let i = 0; i < f; i++) {
    header.writeUInt32LE(i + 1, 76 + i * 4);
    fat.writeUInt32LE(FAT, (i + 1) * 4);
  }
  for (let i = 0; i < n; i++) fat.writeUInt32LE(i === n - 1 ? END : 2 + f + i, (1 + f + i) * 4);
  dir(0, 'Root Entry', 5, END, 0);
  dir(128, 'Workbook', 2, 1 + f, size);
  return Buffer.concat([header, directory, fat, data]);
}
function xls(sheets, {sstLimit = 8000, mini = false} = {}) {
  const strings = [],
    positions = new Map();
  function idx(s) {
    if (!positions.has(s)) {
      positions.set(s, strings.length);
      strings.push(s);
    }
    return positions.get(s);
  }
  const data = sheets.map(sheet => {
    const parts = [bof(0x10)];
    for (let r = 0; r < sheet.rows.length; r++)
      for (let c = 0; c < (sheet.rows[r] || []).length; c++) {
        let value = sheet.rows[r][c];
        if (value === undefined || value === null) continue;
        const obj = typeof value === 'object' ? value : {value};
        value = obj.value;
        const head = Buffer.alloc(6);
        head.writeUInt16LE(r);
        head.writeUInt16LE(c, 2);
        head.writeUInt16LE(obj.zeroPad ? 1 : 0, 4);
        if (obj.formula) {
          parts.push(record(0x6, Buffer.concat([head, Buffer.alloc(16)])));
        } else if (typeof value === 'number') {
          if (obj.rk) {
            const v = Buffer.alloc(4);
            v.writeInt32LE((value << 2) | 2);
            parts.push(record(0x27e, Buffer.concat([head, v])));
          } else {
            const v = Buffer.alloc(8);
            v.writeDoubleLE(value);
            parts.push(record(0x203, Buffer.concat([head, v])));
          }
        } else {
          const v = Buffer.alloc(4);
          v.writeUInt32LE(idx(String(value)));
          parts.push(record(0xfd, Buffer.concat([head, v])));
        }
      }
    parts.push(eof());
    return Buffer.concat(parts);
  });
  const xf0 = Buffer.alloc(20),
    xf1 = Buffer.alloc(20);
  xf1.writeUInt16LE(164, 2);
  const fi = Buffer.alloc(2);
  fi.writeUInt16LE(164);
  const style = Buffer.concat([
    record(0x41e, Buffer.concat([fi, wide('000000')])),
    record(0xe0, xf0),
    record(0xe0, xf1)
  ]);
  const boundaries = sheets.map(s => {
    const h = Buffer.alloc(6);
    h[4] = s.hidden ? 1 : 0;
    return record(0x85, Buffer.concat([h, wide(s.name, true)]));
  });
  const shared = makeSst(strings, sstLimit);
  const globalSize =
    bof(5).length + style.length + boundaries.reduce((a, b) => a + b.length, 0) + shared.length + eof().length;
  let offset = globalSize;
  boundaries.forEach((b, i) => {
    b.writeUInt32LE(offset, 4);
    offset += data[i].length;
  });
  return ole(Buffer.concat([bof(5), style, ...boundaries, shared, eof(), ...data]), {mini});
}
async function xlsx(sheets) {
  const w = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = w.addWorksheet(s.name, {state: s.hidden ? 'hidden' : 'visible'});
    s.rows.forEach((row, i) =>
      (row || []).forEach((v, j) => {
        if (v === undefined || v === null) return;
        const c = ws.getCell(i + 1, j + 1);
        if (typeof v === 'object') {
          if (v.formula) c.value = {formula: v.formula, result: v.value};
          else c.value = v.value;
          if (v.zeroPad) c.numFmt = '000000';
        } else c.value = v;
      })
    );
  }
  return Buffer.from(await w.xlsx.writeBuffer());
}
const headers = ['Qunt.', 'Matr\u00edcula', 'Aluno'];
const roster = (name, rows) => ({name, rows: [[name + ' PERIODO'], [], headers, ...rows]});
async function makeUiFixtures(directory) {
  fs.mkdirSync(directory, {recursive: true});
  const input = [
    roster('1\u00ba', [
      [1, '000101', 'Ana Modelo'],
      [2, '000102', 'Bruno Modelo'],
      [3, 'DUP-01', 'Carla Modelo'],
      [4, 'DUP-01', 'Carla Outra Linha'],
      [5, '', 'Nome Sem Matricula'],
      [6, 'ID-SEM-NOME', '']
    ]),
    roster('2\u00b0', [
      [1, '000201', 'Diego Modelo'],
      [2, 'EXISTENTE-UI', 'Aluno Existente']
    ]),
    roster('Revisar', [[1, '000301', 'Elisa Modelo']]),
    {name: 'Docente', rows: [[], ['Codigo', 'Chama', 'Docente'], [1, 10, 'Docente Exemplo']]},
    {name: '2026.2', rows: [[], [], ['PER', 'COD. DISC.', 'DISCIPLINA'], [1, 'BIO', 'Bioquimica']]}
  ];
  fs.writeFileSync(path.join(directory, 'ALUNOS_EXEMPLO.xlsx'), await xlsx(input));
  fs.writeFileSync(path.join(directory, 'ALUNOS_EXEMPLO.xls'), xls(input, {sstLimit: 70}));
}
module.exports = {xlsx, xls, roster, headers, makeUiFixtures, ole, makeSst};
if (require.main === module)
  makeUiFixtures(process.argv[2] || __dirname).catch(e => {
    console.error(e);
    process.exitCode = 1;
  });
