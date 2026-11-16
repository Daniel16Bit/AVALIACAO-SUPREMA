'use strict';
// Native HTTP only: this side can start even if API dependencies are broken.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {securityHeaders} = require('../../packages/http/security-headers');
const {clientAddress, parseTrustedProxies} = require('../../packages/http/client-address');
const {webTransport, behindHttpsProxy} = require('../../packages/http/transport-policy');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function cleanHeaders(headers) {
  const out = {...headers};
  const named = String(out.connection || '')
    .split(',')
    .map(s => s.trim().toLowerCase());
  for (const key of [
    ...named,
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
  ])
    delete out[key];
  return out;
}

function createWebServer(options = {}) {
  const root = path.resolve(options.publicDir || path.join(__dirname, 'public'));
  const target = new URL(options.apiUrl || process.env.API_URL || 'http://127.0.0.1:3003');
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  )
    throw Error('API_URL deve ser uma origem HTTP(S), sem caminho ou credenciais.');
  const timeout = options.proxyTimeout ?? 30000;
  // Empty by default: browsers connect directly. List an external HTTPS proxy here.
  const trustedProxies = parseTrustedProxies(options.trustedProxies ?? process.env.SUPREMA_WEB_TRUSTED_PROXIES, '');
  const send = (res, status, data) => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(data));
  };
  const handler = (req, res) =>
    securityHeaders(req, res, () => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      } catch {
        return send(res, 400, {error: 'Endereco invalido.'});
      }
      if (pathname === '/health') return send(res, 200, {ok: true, service: 'suprema-web'});
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        // Preserve the public Host: API same-origin checks compare it to Origin.
        const headers = cleanHeaders(req.headers);
        delete headers['x-forwarded-host'];
        delete headers['x-forwarded-proto'];
        // Replace whatever the client sent: the API limits login attempts per real client.
        headers['x-forwarded-for'] = clientAddress(req, trustedProxies);
        const upstream = (target.protocol === 'https:' ? https : http).request(
          target,
          {
            method: req.method,
            path: req.url,
            headers
          },
          response => {
            res.writeHead(response.statusCode, cleanHeaders(response.headers));
            response.on('error', () => res.destroy());
            response.pipe(res);
          }
        );
        const timer = setTimeout(() => upstream.destroy(new Error('API timeout')), timeout);
        timer.unref();
        upstream.once('close', () => clearTimeout(timer));
        upstream.on('error', () =>
          send(res, 503, {
            error:
              'Servidor de dados indisponivel. Tente novamente em instantes. Nenhuma confirmacao de salvamento foi recebida.',
            code: 'API_UNAVAILABLE'
          })
        );
        res.on('close', () => {
          if (!res.writableEnded) upstream.destroy();
        });
        req.on('error', () => upstream.destroy());
        req.pipe(upstream);
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, {error: 'Metodo nao permitido.'});
      const parts = pathname.split('/');
      if (parts.some(p => p.startsWith('.')) || pathname.includes('\\') || pathname.includes('\0'))
        return send(res, 404, {error: 'Arquivo nao encontrado.'});
      const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!filename.startsWith(root + path.sep) || !TYPES[path.extname(filename)])
        return send(res, 404, {error: 'Arquivo nao encontrado.'});
      void (async () => {
        try {
          const real = await fsp.realpath(filename);
          if (!real.startsWith((await fsp.realpath(root)) + path.sep))
            return send(res, 404, {error: 'Arquivo nao encontrado.'});
          const stat = await fsp.stat(real);
          if (!stat.isFile()) return send(res, 404, {error: 'Arquivo nao encontrado.'});
          res.writeHead(200, {
            'Content-Type':
              TYPES[path.extname(filename)] + (/\.(html|js|css)$/.test(filename) ? '; charset=utf-8' : ''),
            'Content-Length': stat.size
          });
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          const stream = fs.createReadStream(real);
          stream.on('error', () => res.destroy());
          res.on('close', () => stream.destroy());
          stream.pipe(res);
        } catch (err) {
          send(res, ['ENOENT', 'ENOTDIR'].includes(err.code) ? 404 : 500, {error: 'Arquivo indisponivel.'});
        }
      })();
    });
  const key = process.env.SUPREMA_TLS_KEY,
    cert = process.env.SUPREMA_TLS_CERT;
  if (!!key !== !!cert) throw Error('Configure chave e certificado TLS juntos.');
  const server = key
    ? https.createServer({key: fs.readFileSync(key), cert: fs.readFileSync(cert)}, handler)
    : http.createServer(handler);
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}

function start(options = {}) {
  const port = options.port ?? Number(process.env.PORT || 3002);
  const host = options.host || process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('PORT invalida.');
  // Refuse before opening the port: never serve the login over plain HTTP on the network.
  webTransport({
    host,
    tls: !!(process.env.SUPREMA_TLS_KEY && process.env.SUPREMA_TLS_CERT),
    behindHttpsProxy: behindHttpsProxy(),
    trustedProxies: parseTrustedProxies(options.trustedProxies ?? process.env.SUPREMA_WEB_TRUSTED_PROXIES, '')
  });
  const server = createWebServer(options);
  server.on('error', err => {
    console.error('[web]', err.message);
    if (require.main === module) process.exitCode = 1;
  });
  server.listen(port, host, () =>
    console.log(`[web] ${process.env.SUPREMA_TLS_KEY ? 'https' : 'http'}://${host}:${server.address().port}`)
  );
  if (require.main === module) {
    const stop = () => {
      server.close();
      setTimeout(() => server.closeAllConnections(), 5000).unref();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
  return server;
}
if (require.main === module) {
  try {
    start();
  } catch (err) {
    console.error('[web]', err.message);
    process.exitCode = 1;
  }
}
module.exports = {createWebServer, start};
