'use strict';
const {HSTS, behindHttpsProxy} = require('./transport-policy');

function securityHeaders(req, res, next) {
  // Only when the browser reached us over HTTPS: TLS terminated here or at the declared proxy.
  if (req.socket?.encrypted || behindHttpsProxy()) res.setHeader('Strict-Transport-Security', HSTS);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
  );
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) {
        res.writeHead(403, {'Content-Type': 'application/json; charset=utf-8'});
        res.end(JSON.stringify({error: 'Origem da requisicao nao autorizada.'}));
        return;
      }
    } catch {
      res.writeHead(403, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(JSON.stringify({error: 'Origem invalida.'}));
      return;
    }
  }
  next();
}

module.exports = {securityHeaders};
