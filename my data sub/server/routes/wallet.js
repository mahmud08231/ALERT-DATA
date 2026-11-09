const express = require('express');
const crypto = require('crypto');
const db = require('../store/db');
const env = require('../config/env');
const paystack = require('../services/paystack');
const notifications = require('../services/notifications');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
function getUser(data, id) { return data.users.find((user) => user.id === id); }
function credit(data, userId, amount, reference, meta = {}) {
  const user = getUser(data, userId);
  const existing = data.transactions.find((tx) => tx.reference === reference && tx.type === 'wallet_funding');
  if (!user || existing?.status === 'success') return false;
  if (existing) {
    existing.status = 'success';
    existing.meta = { ...(existing.meta || {}), ...meta };
  }
  user.walletBalance = Number((user.walletBalance + amount).toFixed(2));
  if (!existing) data.transactions.push({ id: db.id('tx'), userId, type: 'wallet_funding', amount, status: 'success', reference, createdAt: new Date().toISOString(), meta });
  notifications.add(data, userId, { type: 'wallet', title: 'Wallet funded', message: `Your wallet was credited with ₦${amount.toFixed(2)}.`, reference });
  return true;
}

router.get('/balance', requireAuth, (req, res) => res.json({ balance: Number(req.user.walletBalance || 0).toFixed(2) }));

router.post('/paystack/initialize', requireAuth, async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 100 || amount > 1000000) return res.status(400).json({ error: 'Enter an amount between ₦100 and ₦1,000,000.' });
  const reference = `AD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const data = db.read();
  data.transactions.push({ id: db.id('tx'), userId: req.user.id, type: 'wallet_funding', amount, status: 'pending', reference, createdAt: new Date().toISOString() });
  db.write(data);
  try {
    const result = await paystack.initialize({ email: req.user.email, amount, reference, callbackUrl: `${env.appBaseUrl}/pages/dashboard.html?reference=${reference}` });
    res.json({ ...result, amount, reference, demo: Boolean(result.demo) });
  } catch (error) {
    const latest = db.read();
    const tx = latest.transactions.find((item) => item.reference === reference);
    if (tx) tx.status = 'failed';
    db.write(latest);
    res.status(502).json({ error: 'Paystack could not start the funding session.', detail: error.response?.data?.message || error.message });
  }
});

router.get('/paystack/verify/:reference', requireAuth, async (req, res) => {
  const reference = req.params.reference;
  const data = db.read();
  const transaction = data.transactions.find((item) => item.reference === reference && item.userId === req.user.id && item.type === 'wallet_funding');
  if (!transaction) return res.status(404).json({ error: 'Funding transaction not found.' });
  try {
    const result = await paystack.verify(reference);
    if (result.status !== 'success') return res.status(400).json({ error: 'Payment has not completed yet.' });
    const fresh = db.read();
    credit(fresh, req.user.id, transaction.amount, reference, { provider: 'paystack', channel: result.channel });
    db.write(fresh);
    res.json({ message: 'Wallet funded successfully.', amount: transaction.amount, balance: getUser(fresh, req.user.id).walletBalance });
  } catch (error) {
    res.status(502).json({ error: 'Paystack verification failed.', detail: error.response?.data?.message || error.message });
  }
});

router.post('/demo-credit', requireAuth, (req, res) => {
  if (env.nodeEnv === 'production') return res.status(404).end();
  const amount = Number(req.body?.amount);
  const reference = String(req.body?.reference || '');
  if (!amount || !reference) return res.status(400).json({ error: 'Demo funding details are missing.' });
  const data = db.read();
  if (!data.transactions.some((item) => item.reference === reference && item.userId === req.user.id)) return res.status(404).json({ error: 'Funding transaction not found.' });
  credit(data, req.user.id, amount, reference, { provider: 'demo' });
  db.write(data);
  res.json({ message: 'Demo wallet funding completed.', balance: getUser(data, req.user.id).walletBalance });
});

async function handleWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  if (!paystack.validWebhook(raw, req.headers['x-paystack-signature'])) return res.status(401).json({ error: 'Invalid webhook signature.' });
  const event = JSON.parse(raw.toString('utf8'));
  if (event.event === 'charge.success') {
    const reference = event.data?.reference;
    const data = db.read();
    const tx = data.transactions.find((item) => item.reference === reference && item.type === 'wallet_funding');
    if (tx) { credit(data, tx.userId, tx.amount, reference, { provider: 'paystack_webhook', channel: event.data.channel }); db.write(data); }
  }
  res.json({ received: true });
}
router.post('/paystack/webhook', handleWebhook);

module.exports = router;
