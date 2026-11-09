const nodemailer = require('nodemailer');
const env = require('../config/env');

function configured() {
  return Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);
}

function transporter() {
  if (!configured()) return null;
  return nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: { user: env.smtp.user, pass: env.smtp.pass }
  });
}

async function sendMail(to, subject, html) {
  const client = transporter();
  if (!client) return { sent: false, reason: 'SMTP is not configured' };
  await client.sendMail({ from: env.smtp.from, to, subject, html });
  return { sent: true };
}

async function sendVerificationCode({ to, name, code }) {
  return sendMail(to, 'Your ALERT DATA verification code', `<div style="font-family:Arial,sans-serif"><h2>Confirm your ALERT DATA account</h2><p>Hi ${name || 'there'},</p><p>Your verification code is:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 15 minutes.</p></div>`);
}

async function sendResetCode({ to, name, token }) {
  return sendMail(to, 'Reset your ALERT DATA password', `<div style="font-family:Arial,sans-serif"><h2>Password reset request</h2><p>Hi ${name || 'there'},</p><p>Use this reset code on the forgot-password page:</p><p style="font-size:26px;font-weight:700;letter-spacing:4px">${token}</p><p>This code expires in 15 minutes. If you did not request this, you can ignore this email.</p></div>`);
}

async function sendLoginAlert({ to, name, loggedInAt }) {
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const safeName = escapeHtml(name || 'there');
  const safeTime = escapeHtml(loggedInAt || new Date().toISOString());
  return sendMail(to, 'New sign-in to ALERT DATA', `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17151f"><h2>New sign-in to ALERT DATA</h2><p>Hi ${safeName},</p><p>Your ALERT DATA account was just signed in successfully.</p><p><strong>Time:</strong> ${safeTime} (UTC)</p><p>If this was you, no action is needed. If you do not recognize this sign-in, change your password and contact ALERT DATA support.</p></div>`);
}

module.exports = { configured, sendVerificationCode, sendResetCode, sendLoginAlert };
