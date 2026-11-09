const express = require('express');
const db = require('../store/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const data = db.read();
  const notifications = (data.notifications || [])
    .filter((item) => item.userId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 40);
  res.json({ notifications, unreadCount: notifications.filter((item) => !item.readAt).length });
});

router.post('/read', requireAuth, (req, res) => {
  const data = db.read();
  const ids = Array.isArray(req.body?.ids) ? new Set(req.body.ids.map(String)) : null;
  const now = new Date().toISOString();
  let updated = 0;
  for (const item of data.notifications || []) {
    if (item.userId === req.user.id && !item.readAt && (!ids || ids.has(item.id))) {
      item.readAt = now;
      updated += 1;
    }
  }
  db.write(data);
  res.json({ updated });
});

module.exports = router;
