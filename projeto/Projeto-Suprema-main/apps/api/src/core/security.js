'use strict';
const crypto = require('node:crypto');
const {fail, audit, transaction} = require('./domain');
const {clientAddress, parseTrustedProxies} = require('../../../../packages/http/client-address');
const {isRole, roleLabel} = require('./roles');
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128)
    fail(400, 'Use uma senha entre 8 e 128 caracteres.');
}
function hashPassword(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}
function hashPasswordAsync(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(salt + ':' + key.toString('hex'))))
  );
}
function verifyPassword(password, stored) {
  try {
    if (typeof password !== 'string' || password.length > 128) return false;
    const [salt, hash] = String(stored || '').split(':');
    if (!/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(hash)) return false;
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(password, salt, 64));
  } catch {
    return false;
  }
}
// Provisional passwords are typed by hand from a printed list: no look-alike characters.
const PROVISIONAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function provisionalPassword() {
  const group = () =>
    Array.from({length: 4}, () => PROVISIONAL_ALPHABET[crypto.randomInt(PROVISIONAL_ALPHABET.length)]).join('');
  return [group(), group(), group()].join('-');
}
// While a password change is pending, a session may only read itself and change the password.
const PASSWORD_CHANGE_ROUTES = new Set(['GET /api/me', 'POST /api/me/password']);
const WINDOW = 5 * 60000;

function installSecurity(app, db, {secureCookie = false, trustedProxies} = {}) {
  const attempts = new Map();
  const TTL = 8 * 60 * 60 * 1000;
  // Sessions are rows in the database, keyed by a hash of the cookie token (see migration 001).
  const hashToken = token => crypto.createHash('sha256').update(String(token)).digest('hex');
  const findSession = db.prepare('SELECT user_id,role,session_version,expires_at FROM sessions WHERE token_hash=?');
  const addSession = db.prepare(
    'INSERT INTO sessions(token_hash,user_id,role,session_version,created_at,expires_at) VALUES(?,?,?,?,?,?)'
  );
  const dropSession = db.prepare('DELETE FROM sessions WHERE token_hash=?');
  const dropUserSessions = db.prepare('DELETE FROM sessions WHERE user_id=?');
  const dropExpired = db.prepare('DELETE FROM sessions WHERE expires_at<?');
  // The web proxy runs on the same host by default, so loopback peers may state the client address.
  const trusted = parseTrustedProxies(trustedProxies ?? process.env.SUPREMA_API_TRUSTED_PROXIES, 'loopback');
  // Verifying against a throwaway hash keeps the response time equal for unknown logins.
  const decoyHash = hashPassword(crypto.randomBytes(24).toString('hex'));
  const tokenOf = req =>
    (req.headers.cookie || '')
      .split(';')
      .map(x => x.trim())
      .find(x => x.startsWith('as_session='))
      ?.slice(11);
  const cookie = (token, age) =>
    `as_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookie ? '; Secure' : ''}`;
  const publicUser = u => ({
    id: u.id,
    name: u.name,
    role: u.role,
    roleLabel: roleLabel(u.role),
    studentId: u.student_id || null,
    mustChangePassword: !!u.must_change_password
  });
  const blockedFor = (key, limit) => {
    const a = attempts.get(key);
    return a && a.until > Date.now() && a.count >= limit ? Math.ceil((a.until - Date.now()) / 1000) : 0;
  };
  const recordFailure = key => {
    const a = attempts.get(key),
      live = a && a.until > Date.now();
    attempts.set(key, {count: live ? a.count + 1 : 1, until: live ? a.until : Date.now() + WINDOW});
  };
  const tooMany = (res, seconds) => {
    res.setHeader('Retry-After', String(seconds));
    return res.status(429).json({error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'});
  };
  const auth = (req, res, next) => {
    const token = tokenOf(req),
      hash = token ? hashToken(token) : null,
      s = hash ? findSession.get(hash) : null;
    if (!s || s.expires_at < Date.now()) {
      if (s) dropSession.run(hash);
      return res.status(401).json({error: 'Sessão expirada. Entre novamente.'});
    }
    const u = db
      .prepare('SELECT id,name,role,student_id,active,session_version,must_change_password FROM users WHERE id=?')
      .get(s.user_id);
    if (!u || !u.active || u.role !== s.role || u.session_version !== s.session_version) {
      dropSession.run(hash);
      return res.status(401).json({error: 'Sessão encerrada. Entre novamente.'});
    }
    req.user = publicUser(u);
    // Carried to the audit log with the actor; not enumerable, so it never leaks into a response.
    Object.defineProperty(req.user, 'origin', {value: clientAddress(req, trusted), enumerable: false});
    if (
      u.must_change_password &&
      !PASSWORD_CHANGE_ROUTES.has(req.method + ' ' + String(req.originalUrl || '').split('?')[0])
    )
      return res.status(403).json({error: 'Defina uma nova senha para continuar.', code: 'PASSWORD_CHANGE_REQUIRED'});
    next();
  };
  // Authorization by permission, read from role_permissions on every request. A profile
  // with no rows there is denied everywhere: new profiles never inherit access by default.
  const permissionRow = db.prepare('SELECT 1 FROM role_permissions WHERE role=? AND permission=?');
  const hasPermission = (role, permission) => !!permissionRow.get(String(role), String(permission));
  const can =
    (...permissions) =>
    (req, res, next) =>
      permissions.some(p => hasPermission(req.user.role, p))
        ? next()
        : res.status(403).json({error: 'Seu perfil n\u00e3o tem permiss\u00e3o para esta opera\u00e7\u00e3o.'});
  const cleanup = setInterval(() => {
    const now = Date.now();
    try {
      dropExpired.run(now);
    } catch {}
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  }, 60000);
  cleanup.unref();
  app.post('/api/login', (req, res) => {
    const login = String(req.body?.login || '')
        .trim()
        .toLowerCase()
        .slice(0, 240),
      password = req.body?.password;
    // Counted per real client. Behind the web proxy the socket peer is the proxy itself.
    const address = clientAddress(req, trusted),
      key = address + '|' + login,
      ipKey = 'ip|' + address;
    for (const [k, limit] of [
      [key, 6],
      [ipKey, 80]
    ]) {
      const wait = blockedFor(k, limit);
      if (wait) return tooMany(res, wait);
    }
    const u = login
      ? db.prepare('SELECT * FROM users WHERE lower(email)=? OR lower(matricula)=?').get(login, login)
      : null;
    const passwordMatches = verifyPassword(password, u ? u.password_hash : decoyHash);
    if (!u || !u.active || !isRole(u.role) || !passwordMatches) {
      for (const k of [key, ipKey]) recordFailure(k);
      return res
        .status(401)
        .json({error: 'Acesso não autorizado. Confira usuário, senha ou situação do cadastro com o administrador.'});
    }
    attempts.delete(key);
    const old = tokenOf(req);
    if (old) dropSession.run(hashToken(old));
    const token = crypto.randomBytes(32).toString('hex'),
      now = Date.now();
    addSession.run(hashToken(token), u.id, u.role, u.session_version, now, now + TTL);
    db.prepare('UPDATE users SET invalid_attempts=0 WHERE id=?').run(u.id);
    audit(db, {id: u.id, origin: address}, 'LOGIN', {role: u.role});
    res.setHeader('Set-Cookie', cookie(token, TTL / 1000));
    res.json({ok: true, user: publicUser(u)});
  });
  app.post('/api/logout', (req, res) => {
    const token = tokenOf(req);
    if (token) dropSession.run(hashToken(token));
    res.setHeader('Set-Cookie', cookie('', 0));
    res.json({ok: true});
  });
  app.get('/api/me', auth, (req, res) => res.json(req.user));
  // Every profile changes its own password here. The current password is always required.
  app.post('/api/me/password', auth, (req, res, next) => {
    try {
      const uid = req.user.id,
        key = 'pw|' + uid,
        wait = blockedFor(key, 6);
      if (wait) return tooMany(res, wait);
      const current = req.body?.current_password,
        next_ = req.body?.new_password;
      const stored = db.prepare('SELECT password_hash FROM users WHERE id=?').get(uid).password_hash;
      if (!verifyPassword(current, stored)) {
        recordFailure(key);
        fail(400, 'A senha atual não confere.');
      }
      validatePassword(next_);
      if (verifyPassword(next_, stored)) fail(400, 'A nova senha deve ser diferente da senha atual.');
      const hash = hashPassword(next_);
      const mine = hashToken(tokenOf(req));
      transaction(db, () => {
        db.prepare(
          'UPDATE users SET password_hash=?,must_change_password=0,invalid_attempts=0,session_version=session_version+1 WHERE id=?'
        ).run(hash, uid);
        audit(db, req.user, 'ALTERAR_PROPRIA_SENHA', {id: uid});
        // Keep only the session that made the change; every other session of this account ends.
        db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(uid, mine);
        db.prepare(
          'UPDATE sessions SET session_version=(SELECT session_version FROM users WHERE id=?) WHERE token_hash=?'
        ).run(uid, mine);
      });
      attempts.delete(key);
      res.json({ok: true, user: {...req.user, mustChangePassword: false}});
    } catch (e) {
      next(e);
    }
  });
  const clearLoginAttempts = logins => {
    for (const k of [...attempts.keys()])
      if (logins.some(login => k.endsWith('|' + String(login).toLowerCase()))) attempts.delete(k);
  };
  const revokeUserSessions = uid => {
    dropUserSessions.run(uid);
  };
  return {auth, can, hasPermission, revokeUserSessions, clearLoginAttempts, close: () => clearInterval(cleanup)};
}
module.exports = {
  hashPassword,
  hashPasswordAsync,
  validatePassword,
  verifyPassword,
  provisionalPassword,
  installSecurity
};
