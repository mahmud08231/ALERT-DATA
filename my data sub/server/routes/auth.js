const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../store/db');
const env = require('../config/env');
const email = require('../services/email');
const notifications = require('../services/notifications');
const { issueSession, clearSession, requireAuth } = require('../middleware/auth');

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const now = () => Date.now();
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified, walletBalance: user.walletBalance });

router.post('/register', async (req, res) => {
  const { name, email: rawEmail, password, pin } = req.body || {};
  const emailAddress = String(rawEmail || '').trim().toLowerCase();
  if (!name || !emailPattern.test(emailAddress) || String(password || '').length < 8 || !/^\d{4,6}$/.test(String(pin || ''))) {
    return res.status(400).json({ error: 'Enter your name, a valid email, a password of at least 8 characters and a 4–6 digit wallet PIN.' });
  }
  const data = db.read();
  if (data.users.some((user) => user.email === emailAddress)) return res.status(409).json({ error: 'An account with this email already exists.' });
  const user = { id: db.id('usr'), name: String(name).trim(), email: emailAddress, passwordHash: await bcrypt.hash(password, 12), walletPinHash: await bcrypt.hash(String(pin), 12), walletBalance: 0, role: 'user', emailVerified: false, createdAt: new Date().toISOString() };
  const code = String(Math.floor(100000 + Math.random() * 900000));
  data.users.push(user);
  data.verificationCodes.push({ id: db.id('verify'), userId: user.id, email: emailAddress, code, expiresAt: now() + 15 * 60 * 1000, lastSentAt: now() });
  db.write(data);
  const mail = await email.sendVerificationCode({ to: user.email, name: user.name, code });
  const response = { message: 'Account created. Check your email for the verification code.', email: user.email, resendAvailableIn: 60 };
  if (!mail.sent && env.nodeEnv !== 'production') response.devCode = code;
  res.status(201).json(response);
});

router.post('/verify-email', (req, res) => {
  const { email: rawEmail, code } = req.body || {};
  const emailAddress = String(rawEmail || '').trim().toLowerCase();
  const data = db.read();
  const record = data.verificationCodes.find((item) => item.email === emailAddress && item.code === String(code || ''));
  if (!record || record.expiresAt < now()) return res.status(400).json({ error: 'That code is invalid or has expired. Request a new one.' });
  const user = data.users.find((item) => item.id === record.userId);
  if (!user) return res.status(400).json({ error: 'Account not found.' });
  user.emailVerified = true;
  data.verificationCodes = data.verificationCodes.filter((item) => item.id !== record.id);
  notifications.add(data, user.id, { type: 'login', title: 'New sign-in', message: 'Your ALERT DATA account was signed in after email verification.' });
  db.write(data);
  issueSession(res, user);
  email.sendLoginAlert({ to: user.email, name: user.name, loggedInAt: new Date().toISOString() }).catch((error) => console.error('Login alert email failed:', error.message));
  res.json({ message: 'Email verified. Your account is ready.', user: publicUser(user) });
});

router.post('/resend-code', async (req, res) => {
  const emailAddress = String(req.body?.email || '').trim().toLowerCase();
  const data = db.read();
  const user = data.users.find((item) => item.email === emailAddress);
  const existing = data.verificationCodes.find((item) => item.email === emailAddress);
  if (!user || user.emailVerified) return res.json({ message: 'If the account needs verification, a new code will be sent.' });
  const wait = existing ? Math.max(0, Math.ceil((existing.lastSentAt + 60000 - now()) / 1000)) : 0;
  if (wait > 0) return res.status(429).json({ error: `Please wait ${wait} seconds before requesting another code.`, resendAvailableIn: wait });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  if (existing) Object.assign(existing, { code, expiresAt: now() + 15 * 60 * 1000, lastSentAt: now() });
  else data.verificationCodes.push({ id: db.id('verify'), userId: user.id, email: user.email, code, expiresAt: now() + 15 * 60 * 1000, lastSentAt: now() });
  db.write(data);
  const mail = await email.sendVerificationCode({ to: user.email, name: user.name, code });
  const response = { message: 'A new verification code has been sent.', resendAvailableIn: 60 };
  if (!mail.sent && env.nodeEnv !== 'production') response.devCode = code;
  res.json(response);
});

router.post('/login', async (req, res) => {
  const emailAddress = String(req.body?.email || '').trim().toLowerCase();
  const data = db.read();
  const user = data.users.find((item) => item.email === emailAddress);
  if (!user || !(await bcrypt.compare(String(req.body?.password || ''), user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  if (!user.emailVerified) return res.status(403).json({ error: 'Please verify your email before logging in.', needsVerification: true, email: user.email });
  notifications.add(data, user.id, { type: 'login', title: 'New sign-in', message: 'A successful sign-in to your ALERT DATA account was recorded.' });
  db.write(data);
  issueSession(res, user);
  email.sendLoginAlert({ to: user.email, name: user.name, loggedInAt: new Date().toISOString() }).catch((error) => console.error('Login alert email failed:', error.message));
  res.json({ message: 'Welcome back.', user: publicUser(user) });
});

router.post('/forgot-password', async (req, res) => {
  const emailAddress = String(req.body?.email || '').trim().toLowerCase();
  const data = db.read();
  const user = data.users.find((item) => item.email === emailAddress);
  if (!user) return res.json({ message: 'If that email is registered, a reset code will be sent.' });
  const token = crypto.randomBytes(3).toString('hex').toUpperCase();
  data.resetTokens = data.resetTokens.filter((item) => item.userId !== user.id);
  data.resetTokens.push({ id: db.id('reset'), userId: user.id, email: user.email, token, expiresAt: now() + 15 * 60 * 1000 });
  db.write(data);
  const mail = await email.sendResetCode({ to: user.email, name: user.name, token });
  const response = { message: 'If that email is registered, a reset code will be sent.' };
  if (!mail.sent && env.nodeEnv !== 'production') response.devToken = token;
  res.json(response);
});

router.post('/reset-password', async (req, res) => {
  const emailAddress = String(req.body?.email || '').trim().toLowerCase();
  const token = String(req.body?.token || '').trim().toUpperCase();
  const password = String(req.body?.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'Use a password with at least 8 characters.' });
  const data = db.read();
  const reset = data.resetTokens.find((item) => item.email === emailAddress && item.token === token && item.expiresAt > now());
  if (!reset) return res.status(400).json({ error: 'That reset code is invalid or has expired.' });
  const user = data.users.find((item) => item.id === reset.userId);
  user.passwordHash = await bcrypt.hash(password, 12);
  data.resetTokens = data.resetTokens.filter((item) => item.id !== reset.id);
  db.write(data);
  res.json({ message: 'Password reset successfully. You can now log in.' });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 8) return res.status(400).json({ error: 'Use a new password with at least 8 characters.' });
  if (currentPassword === newPassword) return res.status(400).json({ error: 'Choose a new password that is different from your current password.' });
  const data = db.read();
  const user = data.users.find((item) => item.id === req.user.id);
  if (!user) return res.status(401).json({ error: 'Your account could not be found.' });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(400).json({ error: 'Your current password is incorrect.' });
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  db.write(data);
  res.json({ message: 'Your password has been updated.' });
});

router.post('/change-pin', requireAuth, async (req, res) => {
  const currentPin = String(req.body?.currentPin || '');
  const newPin = String(req.body?.newPin || '');
  if (!/^\d{4,6}$/.test(newPin)) return res.status(400).json({ error: 'Your new payment PIN must be 4–6 digits.' });
  if (!/^\d{4,6}$/.test(currentPin)) return res.status(400).json({ error: 'Enter your current 4–6 digit payment PIN.' });
  if (currentPin === newPin) return res.status(400).json({ error: 'Choose a new payment PIN that is different from your current PIN.' });
  const data = db.read();
  const user = data.users.find((item) => item.id === req.user.id);
  if (!user) return res.status(401).json({ error: 'Your account could not be found.' });
  if (!user.walletPinHash || !(await bcrypt.compare(currentPin, user.walletPinHash))) return res.status(400).json({ error: 'Your current payment PIN is incorrect.' });
  user.walletPinHash = await bcrypt.hash(newPin, 12);
  db.write(data);
  res.json({ message: 'Your wallet payment PIN has been updated.' });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
router.post('/logout', (req, res) => { clearSession(res); res.json({ message: 'Logged out.' }); });

module.exports = router;
