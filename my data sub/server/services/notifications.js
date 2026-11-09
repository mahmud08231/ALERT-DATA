const db = require('../store/db');

function add(data, userId, { type, title, message, reference = null }) {
  if (!Array.isArray(data.notifications)) data.notifications = [];
  const item = {
    id: db.id('ntf'),
    userId,
    type,
    title,
    message,
    reference,
    createdAt: new Date().toISOString(),
    readAt: null
  };
  data.notifications.unshift(item);
  const userItems = data.notifications.filter((notification) => notification.userId === userId);
  const remove = new Set(userItems.slice(60).map((notification) => notification.id));
  data.notifications = data.notifications.filter((notification) => !remove.has(notification.id));
  return item;
}

module.exports = { add };
