'use strict';
// Resolves the address of the real client when requests arrive through a proxy.
// X-Forwarded-For is honoured only when the direct peer is a trusted proxy;
// otherwise any client could forge it and evade or poison the login limiter.
const net = require('node:net');

function normalize(address) {
  let value = String(address ?? '').trim();
  if (value.toLowerCase().startsWith('::ffff:') && net.isIPv4(value.slice(7))) value = value.slice(7);
  return value;
}

const isLoopback = address => address === '::1' || /^127\./.test(address);

// Accepts a comma-separated list of IP addresses and the keyword "loopback".
function parseTrustedProxies(value, fallback = '') {
  const source = value === undefined || value === null ? fallback : value;
  const entries = String(source)
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  const addresses = new Set();
  let loopback = false;
  for (const entry of entries) {
    if (entry === 'loopback') {
      loopback = true;
      continue;
    }
    const address = normalize(entry);
    if (!net.isIP(address)) throw Error('Proxy confiavel invalido: ' + entry + '. Use enderecos IP ou "loopback".');
    addresses.add(address);
  }
  return {loopback, addresses};
}

function isTrusted(trusted, address) {
  return !!trusted && ((trusted.loopback && isLoopback(address)) || trusted.addresses.has(address));
}

function clientAddress(req, trusted) {
  const peer = normalize(req.socket?.remoteAddress);
  if (!isTrusted(trusted, peer)) return peer;
  const header = req.headers['x-forwarded-for'];
  // The right-most entry is the one appended by the trusted proxy itself.
  const last = String(Array.isArray(header) ? header[header.length - 1] : (header ?? ''))
    .split(',')
    .pop();
  const forwarded = normalize(last);
  return net.isIP(forwarded) ? forwarded : peer;
}

module.exports = {clientAddress, parseTrustedProxies, isLoopback, normalize};
