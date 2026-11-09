const express = require('express');
const db = require('../store/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth, requireAdmin);
router.get('/summary', (req, res) => {
  const data = db.read();
  const successful = data.orders.filter((item) => item.status === 'successful');
  res.json({ users: data.users.filter((item) => item.role !== 'admin').length, orders: data.orders.length, successfulOrders: successful.length, revenue: successful.reduce((sum, item) => sum + item.amount, 0), pending: data.orders.filter((item) => item.status === 'processing').length });
});
router.get('/users', (req, res) => {
  const data = db.read();
  res.json({ users: data.users.map(({ passwordHash, walletPinHash, ...user }) => user).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});
router.get('/orders', (req, res) => {
  const data = db.read();
  const users = new Map(data.users.map((user) => [user.id, user]));
  const orders = data.orders.map((order) => ({ ...order, user: users.get(order.userId)?.email || 'Unknown' })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ orders });
});
module.exports = router;
