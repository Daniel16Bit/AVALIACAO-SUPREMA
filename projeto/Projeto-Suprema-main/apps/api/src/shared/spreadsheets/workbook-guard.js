'use strict';
const {fail} = require('../../core/domain');
const zlib = require('node:zlib');
// Check ZIP central directory before ExcelJS inflates a workbook. ZIP64 is unnecessary for 8 MB imports.
function validateWorkbookArchive(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) fail(400, 'Planilha invalida ou incompleta.');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50 && i + 22 + buf.readUInt16LE(i + 20) === buf.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail(400, 'Formato XLSX nao reconhecido.');
  const disk = buf.readUInt16LE(eocd + 4),
    startDisk = buf.readUInt16LE(eocd + 6),
    count = buf.readUInt16LE(eocd + 10),
    size = buf.readUInt32LE(eocd + 12),
    start = buf.readUInt32LE(eocd + 16);
  if (disk || startDisk || count > 1500 || start + size > eocd) fail(400, 'Planilha fora dos limites de importacao.');
  let total = 0,
    pos = start,
    workbook = false;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > eocd || buf.readUInt32LE(pos) !== 0x02014b50) fail(400, 'Estrutura interna da planilha invalida.');
    const method = buf.readUInt16LE(pos + 10);
    const flag = buf.readUInt16LE(pos + 8),
      compressed = buf.readUInt32LE(pos + 20),
      plain = buf.readUInt32LE(pos + 24),
      nameLen = buf.readUInt16LE(pos + 28),
      extra = buf.readUInt16LE(pos + 30),
      comment = buf.readUInt16LE(pos + 32),
      offset = buf.readUInt32LE(pos + 42);
    const end = pos + 46 + nameLen + extra + comment;
    if (end > start + size || flag & 1 || offset + 30 > start || plain === 0xffffffff || compressed === 0xffffffff)
      fail(400, 'Planilha criptografada ou nao suportada.');
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    if (name === 'xl/workbook.xml') workbook = true;
    if (name.split(/[\\/]/).includes('..') || name.startsWith('/') || name.includes('\0'))
      fail(400, 'Caminho interno da planilha invalido.');
    total += plain;
    if (total > 64 * 1024 * 1024 || plain > 32 * 1024 * 1024)
      fail(400, 'A planilha descompactada e muito grande. Reduza linhas ou remova abas extras.');
    // Reject local entries with incompatible metadata and impossible compressed extents.
    if (buf.readUInt32LE(offset) !== 0x04034b50) fail(400, 'Entrada XLSX invalida.');
    const localName = buf.readUInt16LE(offset + 26),
      localExtra = buf.readUInt16LE(offset + 28),
      payload = offset + 30 + localName + localExtra;
    if (payload + compressed > start) fail(400, 'Planilha truncada.');
    let actual;
    try {
      const packed = buf.subarray(payload, payload + compressed);
      actual =
        method === 0
          ? packed
          : method === 8
            ? zlib.inflateRawSync(packed, {maxOutputLength: Math.max(1, plain)})
            : null;
    } catch {
      fail(400, 'Dados comprimidos invalidos ou acima do limite.');
    }
    if (!actual || actual.length !== plain) fail(400, 'O tamanho interno da planilha nao confere.');
    pos = end;
  }
  if (!workbook || pos !== start + size) fail(400, 'Arquivo nao e uma pasta de trabalho XLSX valida.');
  return {entries: count, uncompressedBytes: total};
}
module.exports = {validateWorkbookArchive};
