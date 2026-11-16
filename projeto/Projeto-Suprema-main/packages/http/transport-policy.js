'use strict';
// Transport policy: a service that other machines can reach must not speak plain HTTP,
// otherwise passwords and the session cookie cross the network in clear text.
// Both servers call this before opening their port and refuse to start when it throws.
const net = require('node:net');
const {normalize, isLoopback} = require('./client-address');

// One year, this host only (no includeSubDomains: other hosts of the domain are not ours).
const HSTS = 'max-age=31536000';

const flag = value => String(value ?? '').trim() === '1';
// Declared by the operator: an HTTPS proxy (nginx, Caddy) terminates TLS in front of the web server.
const behindHttpsProxy = (env = process.env) => flag(env.SUPREMA_BEHIND_HTTPS_PROXY);
// Declared by the operator: the link between web server and API is a protected network.
const apiPrivateNetwork = (env = process.env) => flag(env.SUPREMA_API_PRIVATE_NETWORK);

// True only for addresses that never leave this machine.
function isLocalHost(host) {
  const value = normalize(host)
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1');
  return value === 'localhost' || (net.isIP(value) !== 0 && isLoopback(value));
}

function webTransport({host, tls = false, behindHttpsProxy: proxied = false, trustedProxies} = {}) {
  const listed = !!trustedProxies && (trustedProxies.loopback || trustedProxies.addresses.size > 0);
  // Without the list every user would look like the proxy and share one login limit.
  if (proxied && !listed)
    throw Error(
      'SUPREMA_BEHIND_HTTPS_PROXY=1 exige SUPREMA_WEB_TRUSTED_PROXIES com o endereco do proxy HTTPS (ou "loopback" se ele estiver nesta maquina).'
    );
  if (!isLocalHost(host) && !tls && !proxied)
    throw Error(
      'HOST=' +
        host +
        ' expoe a interface na rede sem HTTPS. Configure SUPREMA_TLS_KEY e SUPREMA_TLS_CERT, ou declare o proxy HTTPS com SUPREMA_BEHIND_HTTPS_PROXY=1, ou use HOST=127.0.0.1.'
    );
  return {https: !!tls || proxied};
}

function apiTransport({host, privateNetwork = false} = {}) {
  if (!isLocalHost(host) && !privateNetwork)
    throw Error(
      'API_HOST=' +
        host +
        ' expoe a API na rede e ela nao usa HTTPS. Use API_HOST=127.0.0.1, ou declare SUPREMA_API_PRIVATE_NETWORK=1 se a ligacao com a interface web for uma rede protegida.'
    );
  return {exposed: !isLocalHost(host)};
}

module.exports = {HSTS, isLocalHost, webTransport, apiTransport, behindHttpsProxy, apiPrivateNetwork};
