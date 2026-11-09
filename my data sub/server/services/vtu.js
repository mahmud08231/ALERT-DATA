const axios = require('axios');
const env = require('../config/env');

function live() {
  return !env.vtuMockMode && Boolean(env.vtuApiKey && !/replace|paste_your/i.test(env.vtuApiKey));
}

function apiBase() {
  const base = String(env.vtuBaseUrl || 'https://api.vtu.ng').replace(/\/+$/, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

function providerNetwork(network) {
  const key = String(network || '').trim().toLowerCase();
  const aliases = { '9mobile': 't2mobile', t2: 't2mobile' };
  return aliases[key] || key;
}

function ensureCanUseLive() {
  if (live()) return;
  if (env.nodeEnv === 'production') {
    const error = new Error('Live VTU service is not configured. Set a valid VTU_API_KEY and VTU_MOCK_MODE=false.');
    error.status = 503;
    throw error;
  }
}

async function request(method, path, { params, payload, idempotencyKey } = {}) {
  if (!live()) {
    ensureCanUseLive();
    return { demo: true, status: 'success', providerReference: `DEMO-${Date.now()}` };
  }
  const headers = { Authorization: `Bearer ${env.vtuApiKey}`, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await axios({ method, url: `${apiBase()}${path}`, params, data: payload, headers, timeout: 20000 });
  return response.data;
}

function unwrapPlans(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.plans)) return body.plans;
  if (Array.isArray(body?.data?.plans)) return body.data.plans;
  return [];
}

function addMarkup(amount) {
  const base = Number(amount);
  const percent = Math.max(0, Number(env.vtuDataMarkupPercent || 0));
  return Number.isFinite(base) ? Number((base * (1 + percent / 100)).toFixed(2)) : 0;
}

async function listDataPlans(network) {
  if (!env.catalog.networks.includes(network)) throw new Error('Choose a supported network.');
  if (env.vtuPlanSource === 'static') {
    return {
      source: 'static',
      plans: env.catalog.dataPlans.filter((plan) => plan.network === network).map((plan) => ({ ...plan, sourceAmount: plan.amount }))
    };
  }
  if (!live()) {
    ensureCanUseLive();
    return {
      source: 'demo',
      plans: env.catalog.dataPlans.filter((plan) => plan.network === network).map((plan) => ({ ...plan, sourceAmount: plan.amount }))
    };
  }
  const response = await axios.get(`${apiBase()}/bills/data-plans`, {
    params: { network: providerNetwork(network) },
    headers: { Authorization: `Bearer ${env.vtuApiKey}` },
    timeout: 20000
  });
  const plans = unwrapPlans(response.data).map((item) => {
    const id = String(item.variation_code || item.variationCode || item.id || '');
    const label = String(item.name || item.label || id).trim();
    const amount = Number(item.amount ?? item.price);
    if (!id || !Number.isFinite(amount) || amount <= 0) return null;
    return { id, label, amount: addMarkup(amount), sourceAmount: amount, network, fixedPrice: item.fixed_price !== false };
  }).filter(Boolean);
  return { source: 'vtu.ng', plans };
}

async function buyData({ network, plan, phone, idempotencyKey }) {
  if (!live()) {
    ensureCanUseLive();
    return { demo: true, status: 'success', providerReference: `DEMO-${Date.now()}` };
  }
  return request('POST', '/bills/data', {
    payload: { network: providerNetwork(network), phone, variation_code: plan },
    idempotencyKey
  });
}

async function buyAirtime({ network, phone, amount, idempotencyKey }) {
  if (!live()) {
    ensureCanUseLive();
    return { demo: true, status: 'success', providerReference: `DEMO-${Date.now()}` };
  }
  return request('POST', '/bills/airtime', {
    payload: { network: providerNetwork(network), phone, amount },
    idempotencyKey
  });
}

async function buyBill({ service, provider, customer, amount, metadata, idempotencyKey }) {
  return request('POST', '/bills/purchase', { payload: { service, provider, customer, amount, ...metadata }, idempotencyKey });
}

async function verifyBettingAccount({ platform, accountId }) {
  if (live()) return request('POST', '/betting/verify', { payload: { platform, accountId } });
  ensureCanUseLive();
  const valid = env.demoBettingIds.includes(String(accountId)) || /8$/.test(String(accountId));
  return valid
    ? { demo: true, status: 'success', accountName: 'Demo verified account' }
    : { demo: true, status: 'failed', message: 'This account ID is not registered with the selected betting platform.' };
}

async function fundBettingAccount({ platform, accountId, amount, idempotencyKey }) {
  return request('POST', '/betting/fund', { payload: { platform, accountId, amount }, idempotencyKey });
}

async function getTransaction(idempotencyKey, type = 'bill_payment') {
  if (!live()) return null;
  const response = await axios.get(`${apiBase()}/transactions/${encodeURIComponent(idempotencyKey)}`, {
    params: { type },
    headers: { Authorization: `Bearer ${env.vtuApiKey}` },
    timeout: 15000
  });
  return response.data;
}

module.exports = { live, listDataPlans, buyData, buyAirtime, buyBill, verifyBettingAccount, fundBettingAccount, getTransaction };
