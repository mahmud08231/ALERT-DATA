const jwt = require('jsonwebtoken');
const env = require('../config/env');

function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, env.cookieSecret, { expiresIn: '7d' });
  res.cookie('ad_session', token, {
    httpOnly: true,
    sameSite: env.cookieSecure ? 'none' : 'lax',
    secure: env.cookieSecure,
    signed: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

function readUser(req) {
  const token = req.signedCookies?.ad_session;
  if (!token) return null;
  try {
    return jwt.verify(token, env.cookieSecret);
  } catch (_) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const identity = readUser(req);
  if (!identity) return res.status(401).json({ error: 'Please log in to continue.' });
  const data = require('../store/db').read();
  const user = data.users.find((item) => item.id === identity.sub);
  if (!user) return res.status(401).json({ error: 'Your session is no longer active.' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access is required.' });
  next();
}

function clearSession(res) {
  res.clearCookie('ad_session', { httpOnly: true, sameSite: env.cookieSecure ? 'none' : 'lax', secure: env.cookieSecure, signed: true, path: '/' });
}

module.exports = { issueSession, readUser, requireAuth, requireAdmin, clearSession };
