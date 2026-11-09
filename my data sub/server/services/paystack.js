const axios = require('axios');
const crypto = require('crypto');
const env = require('../config/env');

function live() {
  return Boolean(env.paystackSecret && !env.paystackSecret.includes('replace'));
}

async function initialize({ email, amount, reference, callbackUrl }) {
  if (!live()) return { demo: true, authorization_url: callbackUrl, reference };
  const response = await axios.post('https://api.paystack.co/transaction/initialize', {
    email,
    amount: Math.round(amount * 100),
    currency: env.paystackCurrency,
    reference,
    callback_url: callbackUrl,
    metadata: { source: 'ALERT DATA wallet funding' }
  }, { headers: { Authorization: `Bearer ${env.paystackSecret}` } });
  return { demo: false, ...response.data.data };
}

async function verify(reference) {
  if (!live()) return { demo: true, status: 'success', reference };
  const response = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${env.paystackSecret}` } });
  return { demo: false, ...response.data.data };
}

function validWebhook(rawBody, signature) {
  if (!live() || !signature) return false;
  const hash = crypto.createHmac('sha512', env.paystackSecret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

module.exports = { live, initialize, verify, validWebhook };
