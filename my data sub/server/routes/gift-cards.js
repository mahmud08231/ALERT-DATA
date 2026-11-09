const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../store/db');
const env = require('../config/env');
const giftCards = require('../config/gift-cards');
const manualOrders = require('../services/gift-cards');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/catalog', (req, res) => {
  const countryCode = String(req.query.country || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) return res.status(400).json({ error: 'Choose a valid country.' });
  res.json({ countryCode, currency: 'GBP', exchangeRate: giftCards.exchangeRate, cards: giftCards.cardsForCountry(countryCode) });
});

router.post('/purchase', requireAuth, async (req, res) => {
  const { countryCode, cardId, amount, quantity, pin } = req.body || {};
  const code = String(countryCode || '').toUpperCase();
  const card = giftCards.findCard(code, cardId);
  const gbpAmount = Number(amount);
  const units = Number(quantity);
  if (!/^[A-Z]{2}$/.test(code) || !card || !Number.isFinite(gbpAmount) || gbpAmount < card.min || gbpAmount > card.max || !Number.isInteger(units) || units < 1 || units > 20) {
    return res.status(400).json({ error: 'Check the country, gift card, amount and quantity.' });
  }
  if (!(await bcrypt.compare(String(pin || ''), req.user.walletPinHash))) return res.status(401).json({ error: 'Incorrect wallet PIN. Please try again.' });
  const total = Number((gbpAmount * units * giftCards.exchangeRate).toFixed(2));
  const data = db.read();
  const user = data.users.find((item) => item.id === req.user.id);
  if (user.walletBalance < total) {
    return res.status(402).json({ status: 'declined', code: 'INSUFFICIENT_BALANCE', error: `Declined — insufficient balance. You need ${total.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}.` });
  }
  const now = new Date().toISOString();
  const order = {
    id: db.id('gift'),
    userId: user.id,
    email: user.email,
    status: 'successful',
    fulfillment: 'manual',
    product: 'gift_card',
    countryCode: code,
    giftCard: card.name,
    amountGbp: gbpAmount,
    quantity: units,
    exchangeRate: giftCards.exchangeRate,
    totalNgn: total,
    createdAt: now
  };
  user.walletBalance = Number((user.walletBalance - total).toFixed(2));
  data.orders.push({ id: order.id, userId: user.id, kind: 'gift_card', amount: total, status: 'successful', fulfillment: 'manual', details: { countryCode: code, giftCard: card.name, amountGbp: gbpAmount, quantity: units }, createdAt: now });
  data.transactions.push({ id: db.id('tx'), userId: user.id, type: 'gift_card_purchase', amount: -total, status: 'successful', reference: order.id, createdAt: now, meta: { giftCard: card.name, fulfillment: 'manual' } });
  db.write(data);
  manualOrders.saveManualOrder(order);
  res.status(201).json({ status: 'successful', message: 'Order received - Manual fulfillment', order, balance: user.walletBalance });
});

module.exports = router;
