'use strict';
// Throwaway self-signed certificate for tests, built with node:crypto alone.
// Generated at run time into a temporary folder: no key is ever stored in the repository.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function der(tag, ...parts) {
  const body = Buffer.concat(parts.map(part => (Buffer.isBuffer(part) ? part : Buffer.from(part))));
  const length =
    body.length < 128
      ? [body.length]
      : body.length < 256
        ? [0x81, body.length]
        : [0x82, body.length >> 8, body.length & 255];
  return Buffer.concat([Buffer.from([tag, ...length]), body]);
}
const seq = (...parts) => der(0x30, ...parts);
const oid = hex => der(0x06, Buffer.from(hex, 'hex'));
const utcTime = date => der(0x17, date.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z');
const pem = (label, bytes) =>
  `-----BEGIN ${label}-----\n${bytes
    .toString('base64')
    .match(/.{1,64}/g)
    .join('\n')}\n-----END ${label}-----\n`;

// Valid for one day, for "localhost" and 127.0.0.1 only.
function selfSignedCertificate() {
  const {publicKey, privateKey} = crypto.generateKeyPairSync('ec', {namedCurve: 'prime256v1'});
  const algorithm = seq(oid('2a8648ce3d040302')); // ecdsa-with-SHA256
  const name = seq(der(0x31, seq(oid('550403'), der(0x0c, 'localhost'))));
  const now = Date.now();
  const extensions = seq(
    seq(oid('551d13'), der(0x01, [0xff]), der(0x04, seq(der(0x01, [0xff])))), // basicConstraints CA:TRUE, so it can be its own trust anchor
    seq(oid('551d11'), der(0x04, seq(der(0x82, 'localhost'), der(0x87, [127, 0, 0, 1])))) // subjectAltName
  );
  const body = seq(
    der(0xa0, der(0x02, [2])), // v3
    der(0x02, [1], crypto.randomBytes(8)),
    algorithm,
    name,
    seq(utcTime(new Date(now - 3600e3)), utcTime(new Date(now + 24 * 3600e3))),
    name,
    publicKey.export({type: 'spki', format: 'der'}),
    der(0xa3, extensions)
  );
  const certificate = seq(body, algorithm, der(0x03, [0], crypto.sign('sha256', body, privateKey)));
  return {cert: pem('CERTIFICATE', certificate), key: privateKey.export({type: 'pkcs8', format: 'pem'})};
}

// Writes the pair into `dir` (a temporary folder) and returns the paths the server expects.
function writeCertificate(dir) {
  const {cert, key} = selfSignedCertificate();
  const files = {key: path.join(dir, 'chave-teste.pem'), cert: path.join(dir, 'certificado-teste.pem')};
  fs.writeFileSync(files.key, key, {mode: 0o600});
  fs.writeFileSync(files.cert, cert);
  return {...files, ca: cert};
}

module.exports = {selfSignedCertificate, writeCertificate};
