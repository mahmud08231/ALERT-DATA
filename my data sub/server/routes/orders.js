const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../store/db');
const env = require('../config/env');
const vtu = require('../services/vtu');
const notifications = require('../services/notifications');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
function amountValue(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : 0;
}
function statusValue(result) {
  const raw = result?.transaction?.status?.value ?? result?.transaction?.status ?? result?.status?.value ?? result?.status ?? '';
  const status = String(raw).toLowerCase();
  if (['failed', 'failure', 'declined', 'rejected', 'cancelled', 'canceled'].includes(status)) return 'failed';
  if (['success', 'successful', 'complete', 'completed'].includes(status)) return 'successful';
  return 'processing';
}
function providerReference(result) {
  return result?.transaction?.reference || result?.reference || result?.providerReference || null;
}
function describe(kind, details = {}) {
  return details.plan || details.phone || details.customer || details.accountId || details.platform || kind.replaceAll('_', ' ');
}
function notifyOrder(data, order, title, message) {
  notifications.add(data, order.userId, { type: 'purchase', title, message, reference: order.id });
}

async function chargeAndFulfil({ req, res, kind, amount, details, providerCall }) {
  if (env.nodeEnv === 'production' && !vtu.live()) {
    return res.status(503).json({ error: 'Live VTU service is not configured. Your wallet has not been charged.' });
  }
  const value = amountValue(amount);
  if (!value) return res.status(400).json({ error: 'Enter a valid amount.' });
  const pin = String(req.body?.pin || '');
  if (!(await bcrypt.compare(pin, req.user.walletPinHash))) return res.status(401).json({ error: 'Incorrect wallet PIN. Please try again.' });

  const data = db.read();
  const user = data.users.find((item) => item.id === req.user.id);
  if (user.walletBalance < value) {
    return res.status(402).json({ status: 'declined', code: 'INSUFFICIENT_BALANCE', error: 'Your wallet balance is too low for this purchase. Fund your wallet to continue.' });
  }

  const idempotencyKey = crypto.randomUUID();
  const order = {
    id: db.id('ord'), userId: user.id, kind, amount: value, status: 'processing', details,
    idempotencyKey, createdAt: new Date().toISOString()
  };
  user.walletBalance = Number((user.walletBalance - value).toFixed(2));
  data.orders.push(order);
  data.transactions.push({ id: db.id('tx'), userId: user.id, type: 'purchase', amount: -value, status: 'processing', reference: order.id, createdAt: order.createdAt, meta: { kind } });
  db.write(data);

  try {
    const result = await providerCall(idempotencyKey);
    const fresh = db.read();
    const savedOrder = fresh.orders.find((item) => item.id === order.id);
    const finalStatus = statusValue(result);
    savedOrder.status = finalStatus;
    savedOrder.providerReference = providerReference(result);
    savedOrder.providerStatus = result?.transaction?.status?.value || result?.status?.value || result?.status || finalStatus;
    const tx = fresh.transactions.find((item) => item.reference === order.id);
    tx.status = finalStatus;

    if (finalStatus === 'failed') {
      const freshUser = fresh.users.find((item) => item.id === user.id);
      freshUser.walletBalance = Number((freshUser.walletBalance + value).toFixed(2));
      tx.amount = value;
      tx.meta.refunded = true;
      notifyOrder(fresh, savedOrder, 'Purchase failed — wallet refunded', `${describe(kind, details)} was not completed. Your wallet was refunded.`);
    } else if (finalStatus === 'successful') {
      notifyOrder(fresh, savedOrder, 'Purchase successful', `${describe(kind, details)} completed successfully.`);
    } else {
      notifyOrder(fresh, savedOrder, 'Purchase processing', `${describe(kind, details)} was accepted and is still being processed. Check Transactions for updates.`);
    }
    db.write(fresh);
    const balance = fresh.users.find((item) => item.id === user.id).walletBalance;
    const message = finalStatus === 'failed'
      ? 'The provider could not complete this request. Your wallet was refunded.'
      : finalStatus === 'successful'
        ? 'Order completed successfully.'
        : 'The provider accepted your order and is still processing it. Check Transactions for updates.';
    return res.status(finalStatus === 'failed' ? 502 : finalStatus === 'processing' ? 202 : 201)
      .json({ status: finalStatus, message, order: savedOrder, balance });
  } catch (error) {
    const fresh = db.read();
    const savedOrder = fresh.orders.find((item) => item.id === order.id);
    const freshUser = fresh.users.find((item) => item.id === user.id);
    const tx = fresh.transactions.find((item) => item.reference === order.id);
    const providerRejected = Boolean(error.response && error.response.status >= 400 && error.response.status < 500);

    if (providerRejected) {
      savedOrder.status = 'failed';
      freshUser.walletBalance = Number((freshUser.walletBalance + value).toFixed(2));
      tx.status = 'failed';
      tx.amount = value;
      tx.meta.refunded = true;
      notifyOrder(fresh, savedOrder, 'Purchase failed — wallet refunded', `${describe(kind, details)} could not be processed. Your wallet was refunded.`);
      db.write(fresh);
      return res.status(502).json({ status: 'failed', error: 'The provider could not complete this request. Your wallet was refunded.', balance: freshUser.walletBalance });
    }

    // A timeout or provider 5xx can occur after the provider accepted the purchase.
    // Keep the debit reserved and the order processing until its status can be confirmed.
    savedOrder.status = 'processing';
    savedOrder.statusCheckAfter = Date.now() + 15000;
    savedOrder.providerMessage = 'Provider response is not yet confirmed.';
    notifyOrder(fresh, savedOrder, 'Purchase status being checked', `${describe(kind, details)} is awaiting provider confirmation. Do not submit the same order again yet.`);
    db.write(fresh);
    return res.status(202).json({
      status: 'processing',
      code: 'PROVIDER_STATUS_UNKNOWN',
      message: 'Your order is awaiting provider confirmation. Your wallet balance remains reserved. Check Transactions before trying again.',
      order: savedOrder,
      balance: freshUser.walletBalance
    });
  }
}

router.post('/data', requireAuth, async (req, res) => {
  const { network, planId, phone } = req.body || {};
  if (env.vtuPlanSource === 'static') {
    return res.status(503).json({ error: 'These video plans are for display only. Add the matching supplier variation codes and enable live VTU purchases before selling them. Your wallet has not been charged.' });
  }
  if (!env.catalog.networks.includes(network) || !/^0\d{10}$/.test(String(phone || ''))) {
    return res.status(400).json({ error: 'Choose a supported network and enter an 11-digit Nigerian phone number.' });
  }
  let plan;
  try {
    const catalogue = await vtu.listDataPlans(network);
    plan = catalogue.plans.find((item) => item.id === String(planId));
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message || 'Could not verify the selected data plan. Please try again.' });
  }
  if (!plan) return res.status(400).json({ error: 'That plan is no longer available. Reload the plans and choose another.' });
  return chargeAndFulfil({
    req, res, kind: 'data', amount: plan.amount,
    details: { network, planId: plan.id, plan: plan.label, phone, supplierAmount: plan.sourceAmount },
    providerCall: (idempotencyKey) => vtu.buyData({ network, plan: plan.id, phone, idempotencyKey })
  });
});

router.post('/airtime', requireAuth, async (req, res) => {
  const { network, phone, amount } = req.body || {};
  if (!env.catalog.networks.includes(network) || !/^0\d{10}$/.test(String(phone || ''))) return res.status(400).json({ error: 'Choose a network and enter an 11-digit Nigerian phone number.' });
  return chargeAndFulfil({ req, res, kind: 'airtime', amount, details: { network, phone }, providerCall: (idempotencyKey) => vtu.buyAirtime({ network, phone, amount: amountValue(amount), idempotencyKey }) });
});

router.post('/bills', requireAuth, async (req, res) => {
  if (vtu.live()) return res.status(503).json({ error: 'This bill type is not enabled for live VTU.ng purchases yet. Your wallet has not been charged.' });
  const { service, provider, customer, amount, metadata = {} } = req.body || {};
  if (!service || !customer) return res.status(400).json({ error: 'Select a service and enter the customer or meter number.' });
  return chargeAndFulfil({ req, res, kind: service, amount, details: { provider, customer, ...metadata }, providerCall: (idempotencyKey) => vtu.buyBill({ service, provider, customer, amount: amountValue(amount), metadata, idempotencyKey }) });
});

router.post('/betting/verify', requireAuth, async (req, res) => {
  if (vtu.live()) return res.status(503).json({ error: 'Live betting-account verification is not mapped for this VTU.ng account yet.' });
  const { platform, accountId } = req.body || {};
  if (!env.catalog.bettingPlatforms.includes(platform) || !/^[A-Za-z0-9-]{5,20}$/.test(String(accountId || ''))) return res.status(400).json({ error: 'Choose a betting platform and enter a valid account ID.' });
  const result = await vtu.verifyBettingAccount({ platform, accountId });
  if (result.status === 'success') return res.json({ verified: true, accountName: result.accountName || 'Verified betting account', message: 'Account verified. You can now choose an amount.' });
  return res.status(422).json({ verified: false, error: result.message || 'This account ID is not registered with the selected betting platform.' });
});

router.post('/betting/fund', requireAuth, async (req, res) => {
  if (vtu.live()) return res.status(503).json({ error: 'Live betting funding is not mapped for this VTU.ng account yet. Your wallet has not been charged.' });
  const { platform, accountId, amount } = req.body || {};
  if (!env.catalog.bettingPlatforms.includes(platform) || !/^[A-Za-z0-9-]{5,20}$/.test(String(accountId || ''))) return res.status(400).json({ error: 'Verify a valid betting account before funding.' });
  return chargeAndFulfil({ req, res, kind: 'betting_funding', amount, details: { platform, accountId }, providerCall: (idempotencyKey) => vtu.fundBettingAccount({ platform, accountId, amount: amountValue(amount), idempotencyKey }) });
});

async function syncPendingOrders(userId) {
  if (!vtu.live()) return;
  const snapshot = db.read();
  const due = (snapshot.orders || [])
    .filter((order) => order.userId === userId && order.status === 'processing' && order.idempotencyKey && (!order.statusCheckAfter || order.statusCheckAfter <= Date.now()))
    .slice(0, 5)
    .map((order) => ({ id: order.id, userId: order.userId, idempotencyKey: order.idempotencyKey }));
  if (!due.length) return;

  // Persist a short backoff before any external I/O; then re-read the store after each call.
  for (const candidate of due) {
    const order = snapshot.orders.find((item) => item.id === candidate.id);
    order.statusCheckAfter = Date.now() + 30000;
  }
  db.write(snapshot);

  await Promise.all(due.map(async (candidate) => {
    try {
      const result = await vtu.getTransaction(candidate.idempotencyKey, 'bill_payment');
      const status = statusValue(result);
      if (status === 'processing') return;
      const fresh = db.read();
      const order = (fresh.orders || []).find((item) => item.id === candidate.id && item.userId === userId);
      if (!order || order.status !== 'processing') return;
      order.status = status;
      order.providerReference = providerReference(result) || order.providerReference;
      const tx = (fresh.transactions || []).find((item) => item.reference === order.id);
      if (tx) tx.status = status;
      if (status === 'failed') {
        const user = fresh.users.find((item) => item.id === order.userId);
        if (user) user.walletBalance = Number((user.walletBalance + order.amount).toFixed(2));
        if (tx) { tx.amount = order.amount; tx.meta = { ...(tx.meta || {}), refunded: true }; }
        notifyOrder(fresh, order, 'Purchase failed — wallet refunded', `${describe(order.kind, order.details)} was not completed. Your wallet was refunded.`);
      } else {
        notifyOrder(fresh, order, 'Purchase successful', `${describe(order.kind, order.details)} completed successfully.`);
      }
      db.write(fresh);
    } catch (_) {
      // The order remains pending until the provider can be reached.
    }
  }));
}

router.get('/transactions', requireAuth, async (req, res) => {
  await syncPendingOrders(req.user.id);
  const data = db.read();
  const orders = (data.orders || []).filter((item) => item.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
  const transactions = (data.transactions || []).filter((item) => item.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
  res.json({ orders, transactions });
});

module.exports = router;
