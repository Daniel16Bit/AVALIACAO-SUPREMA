'use strict';
// Read-only BIFF8 / CFB reader for student roster cells A:C. No formulas or macros
// are executed. Legacy BIFF2-5, encrypted files and HTML masquerading as XLS fail
// explicitly. The reader is additionally isolated in a bounded worker thread.
// References: Microsoft MS-CFB and MS-XLS (see import documentation).
function bad(message = 'Arquivo .xls inv\u00e1lido ou incompleto.') {
  throw Error(message);
}
const END = 0xfffffffe,
  FREE = 0xffffffff;
function workbookStream(buf) {
  if (buf.length < 512 || buf.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1')
    bad('Use .xls Excel 97-2003 ou .xlsx. Arquivos HTML renomeados n\u00e3o s\u00e3o aceitos.');
  const major = buf.readUInt16LE(26),
    shift = buf.readUInt16LE(30),
    miniShift = buf.readUInt16LE(32);
  if (buf.readUInt16LE(28) !== 0xfffe || ![3, 4].includes(major) || shift !== (major === 3 ? 9 : 12) || miniShift !== 6)
    bad('Formato de arquivo .xls n\u00e3o suportado. Salve como .xlsx.');
  const sectorSize = 2 ** shift,
    sectorCount = Math.floor(buf.length / sectorSize) - 1;
  if (sectorCount < 1 || sectorCount > 65536 || buf.length % sectorSize) bad();
  function sector(n) {
    if (!Number.isInteger(n) || n < 0 || n >= sectorCount) bad();
    return buf.subarray((n + 1) * sectorSize, (n + 2) * sectorSize);
  }
  const fatCount = buf.readUInt32LE(44),
    difCount = buf.readUInt32LE(72);
  if (fatCount > sectorCount || difCount > sectorCount) bad();
  const fatIds = [];
  for (let i = 0; i < 109; i++) {
    const id = buf.readUInt32LE(76 + i * 4);
    if (id !== FREE) fatIds.push(id);
  }
  let next = buf.readUInt32LE(68);
  const visited = new Set();
  for (let i = 0; i < difCount; i++) {
    if (visited.has(next)) bad();
    visited.add(next);
    const s = sector(next);
    for (let j = 0; j < sectorSize / 4 - 1; j++) {
      const id = s.readUInt32LE(j * 4);
      if (id !== FREE) fatIds.push(id);
    }
    next = s.readUInt32LE(sectorSize - 4);
  }
  if (fatIds.length !== fatCount || new Set(fatIds).size !== fatIds.length) bad();
  const fat = [];
  for (const id of fatIds) {
    const s = sector(id);
    for (let i = 0; i < s.length; i += 4) fat.push(s.readUInt32LE(i));
  }
  function chain(start, table, get, max, size = null) {
    const seen = new Set(),
      parts = [];
    let n = start,
      total = 0;
    while (n !== END) {
      if (seen.size >= max || seen.has(n) || n >= table.length) bad('Cadeia de setores .xls inconsistente.');
      seen.add(n);
      const part = get(n);
      parts.push(part);
      total += part.length;
      if (total > 16 * 1024 * 1024) bad('Arquivo .xls fora do limite de leitura.');
      n = table[n];
    }
    if (size !== null && total < size) bad();
    const all = Buffer.concat(parts);
    return size === null ? all : all.subarray(0, size);
  }
  const dir = chain(buf.readUInt32LE(48), fat, sector, sectorCount);
  const entries = [];
  for (let p = 0; p + 128 <= dir.length; p += 128) {
    const type = dir[p + 66];
    if (!type) continue;
    const len = dir.readUInt16LE(p + 64);
    if (len < 2 || len > 64 || len % 2) bad();
    const name = dir.subarray(p, p + len - 2).toString('utf16le');
    const big = dir.readBigUInt64LE(p + 120);
    if (big > BigInt(buf.length)) bad();
    entries.push({name, type, start: dir.readUInt32LE(p + 116), size: Number(big), offset: p});
  }
  if (entries.some(e => e.name === 'EncryptedPackage' || e.name === 'EncryptionInfo'))
    bad('Planilha protegida por senha. Salve uma c\u00f3pia sem criptografia.');
  const roots = entries.filter(e => e.type === 5 && e.offset === 0),
    books = entries.filter(e => e.type === 2 && /^(Workbook|Book)$/i.test(e.name));
  if (roots.length !== 1 || books.length !== 1) bad('Pasta de trabalho .xls n\u00e3o encontrada.');
  const book = books[0],
    cut = buf.readUInt32LE(56);
  if (cut !== 4096 || book.size < 4) bad();
  if (book.size >= cut) return chain(book.start, fat, sector, sectorCount, book.size);
  const root = roots[0],
    mini = chain(root.start, fat, sector, sectorCount, root.size);
  const mfCount = buf.readUInt32LE(64);
  if (mfCount > sectorCount) bad();
  const mfBuf = chain(buf.readUInt32LE(60), fat, sector, sectorCount, mfCount * sectorSize),
    mf = [];
  for (let i = 0; i < mfBuf.length; i += 4) mf.push(mfBuf.readUInt32LE(i));
  const miniSector = n => {
    if (n * 64 + 64 > mini.length) bad();
    return mini.subarray(n * 64, n * 64 + 64);
  };
  return chain(book.start, mf, miniSector, Math.ceil(mini.length / 64), book.size);
}
function recordAt(buf, p) {
  if (p + 4 > buf.length) bad();
  const id = buf.readUInt16LE(p),
    len = buf.readUInt16LE(p + 2);
  if (len > 8224 || p + 4 + len > buf.length) bad('Registro .xls truncado ou fora do limite.');
  return {id, data: buf.subarray(p + 4, p + 4 + len), next: p + 4 + len};
}
class StringChunks {
  constructor(chunks) {
    this.chunks = chunks;
    this.i = 0;
    this.p = 0;
  }
  move() {
    while (this.i < this.chunks.length && this.p === this.chunks[this.i].length) {
      this.i++;
      this.p = 0;
    }
    if (this.i >= this.chunks.length) bad('Tabela de textos .xls incompleta.');
  }
  bytes(n) {
    const out = [];
    if (n > 16 * 1024 * 1024) bad();
    while (n) {
      this.move();
      const c = this.chunks[this.i],
        take = Math.min(n, c.length - this.p);
      out.push(c.subarray(this.p, this.p + take));
      this.p += take;
      n -= take;
    }
    return Buffer.concat(out);
  }
  u8() {
    return this.bytes(1)[0];
  }
  u16() {
    return this.bytes(2).readUInt16LE(0);
  }
  u32() {
    return this.bytes(4).readUInt32LE(0);
  }
  text(n, wide) {
    let value = '';
    while (n) {
      if (this.p === this.chunks[this.i].length) {
        this.i++;
        this.p = 0;
        if (this.i >= this.chunks.length) bad();
        wide = !!(this.u8() & 1);
      }
      const c = this.chunks[this.i],
        width = wide ? 2 : 1,
        take = Math.min(n, Math.floor((c.length - this.p) / width));
      if (!take) bad('Texto .xls malformado.');
      value += c.subarray(this.p, this.p + take * width).toString(wide ? 'utf16le' : 'latin1');
      this.p += take * width;
      n -= take;
    }
    return value;
  }
  string() {
    const n = this.u16(),
      flags = this.u8(),
      runs = flags & 8 ? this.u16() : 0,
      ext = flags & 4 ? this.u32() : 0;
    const text = this.text(n, !!(flags & 1));
    this.bytes(runs * 4 + ext);
    return text;
  }
}
function unicode(data, p = 0, short = false) {
  if (p + (short ? 2 : 3) > data.length) bad();
  const n = short ? data[p] : data.readUInt16LE(p),
    f = data[p + (short ? 1 : 2)],
    start = p + (short ? 2 : 3),
    end = start + n * (f & 1 ? 2 : 1);
  if (end > data.length) bad();
  return data.subarray(start, end).toString(f & 1 ? 'utf16le' : 'latin1');
}
function rk(value) {
  let n;
  if (value & 2) n = value >> 2;
  else {
    const b = Buffer.alloc(8);
    b.writeUInt32LE((value & 0xfffffffc) >>> 0, 4);
    n = b.readDoubleLE(0);
  }
  return value & 1 ? n / 100 : n;
}
function readXls(input) {
  const buf = workbookStream(input),
    first = recordAt(buf, 0);
  if (
    first.id !== 0x809 ||
    first.data.length < 4 ||
    first.data.readUInt16LE(0) !== 0x600 ||
    first.data.readUInt16LE(2) !== 5
  )
    bad('Use o formato .xls Excel 97-2003 (BIFF8) ou salve como .xlsx.');
  const sheets = [],
    formats = new Map(),
    xf = [],
    strings = [];
  let p = 0,
    records = 0,
    ended = false;
  while (p < buf.length) {
    if (++records > 100000) bad();
    const r = recordAt(buf, p);
    p = r.next;
    const b = r.data;
    if (r.id === 0x2f) bad('Planilha .xls criptografada. Salve uma c\u00f3pia sem senha.');
    if (r.id === 0xa) {
      ended = true;
      break;
    }
    if (r.id === 0x85) {
      if (b.length < 8) bad();
      if (sheets.length >= 100) bad('M\u00e1ximo de 100 abas por arquivo.');
      sheets.push({
        name: unicode(b, 6, true),
        offset: b.readUInt32LE(0),
        kind: b[5],
        hidden: b[4],
        cells: new Map(),
        maxRow: 0
      });
    }
    if (r.id === 0xe0) {
      if (b.length < 4) bad();
      xf.push(b.readUInt16LE(2));
    }
    if (r.id === 0x41e) {
      if (b.length < 5) bad();
      formats.set(b.readUInt16LE(0), unicode(b, 2));
    }
    if (r.id === 0xfc) {
      const chunks = [b];
      while (p + 4 <= buf.length && buf.readUInt16LE(p) === 0x3c) {
        const c = recordAt(buf, p);
        chunks.push(c.data);
        p = c.next;
      }
      const s = new StringChunks(chunks);
      s.u32();
      const n = s.u32();
      if (n > 150000) bad('Tabela de textos excessiva.');
      for (let i = 0; i < n; i++) strings.push(s.string());
    }
  }
  if (!ended || !sheets.length) bad();
  let totalCells = 0;
  for (const sheet of sheets) {
    if (sheet.kind !== 0) continue;
    let q = sheet.offset,
      depth = 0,
      end = false,
      started = false;
    function put(row, col, value, format, formula = false, error = false) {
      if (col > 2) return;
      if (++totalCells > 150000) bad('Planilha extensa demais. Divida o arquivo.');
      if (row > 50000) bad('M\u00e1ximo de 50 mil linhas por aba.');
      sheet.maxRow = Math.max(sheet.maxRow, row + 1);
      sheet.cells.set(`${row + 1}:${col + 1}`, {value, numFmt: formats.get(xf[format]) || 'General', formula, error});
    }
    while (q < buf.length) {
      if (++records > 300000) bad();
      const r = recordAt(buf, q);
      q = r.next;
      const b = r.data;
      if (r.id === 0x809) {
        depth++;
        if (!started) {
          if (b.length < 4 || b.readUInt16LE(0) !== 0x600 || b.readUInt16LE(2) !== 0x10) bad('Aba .xls inv\u00e1lida.');
          started = true;
        }
        continue;
      }
      if (!started) bad();
      if (r.id === 0xa) {
        depth--;
        if (!depth) {
          end = true;
          break;
        }
        continue;
      }
      if (depth !== 1) continue;
      if (r.id === 0x2f) bad('Planilha protegida por senha.');
      if ([0xfd, 0x203, 0x27e, 0x204, 0x6, 0x205].includes(r.id)) {
        if (b.length < 6) bad();
        const row = b.readUInt16LE(0),
          col = b.readUInt16LE(2),
          fmt = b.readUInt16LE(4);
        if (r.id === 0xfd) {
          if (b.length < 10) bad();
          const n = b.readUInt32LE(6);
          if (n >= strings.length) bad('Refer\u00eancia de texto .xls inv\u00e1lida.');
          put(row, col, strings[n], fmt);
        }
        if (r.id === 0x203) {
          if (b.length < 14) bad();
          put(row, col, b.readDoubleLE(6), fmt);
        }
        if (r.id === 0x27e) {
          if (b.length < 10) bad();
          put(row, col, rk(b.readUInt32LE(6)), fmt);
        }
        if (r.id === 0x204) put(row, col, unicode(b, 6), fmt);
        if (r.id === 0x6) put(row, col, '', fmt, true);
        if (r.id === 0x205) {
          if (b.length < 8) bad();
          put(row, col, b[7] ? '' : !!b[6], fmt, false, !!b[7]);
        }
      }
      if (r.id === 0xbd) {
        if (b.length < 12 || (b.length - 6) % 6) bad();
        const row = b.readUInt16LE(0),
          start = b.readUInt16LE(2),
          last = b.readUInt16LE(b.length - 2);
        if (last - start + 1 !== (b.length - 6) / 6) bad();
        for (let j = 4, c = start; j < b.length - 2; j += 6, c++)
          put(row, c, rk(b.readUInt32LE(j + 2)), b.readUInt16LE(j));
      }
    }
    if (!end) bad('Fim de aba .xls n\u00e3o encontrado.');
  }
  return sheets;
}
module.exports = {readXls, workbookStream, StringChunks, rk};
