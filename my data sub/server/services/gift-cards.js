const fs = require('fs');
const path = require('path');

const ordersFile = path.join(process.cwd(), 'orders.json');

function ensureFile() {
  if (!fs.existsSync(ordersFile)) fs.writeFileSync(ordersFile, '[]\n');
}

function readOrders() {
  ensureFile();
  try { return JSON.parse(fs.readFileSync(ordersFile, 'utf8')); } catch (_) { return []; }
}

function saveManualOrder(order) {
  const orders = readOrders();
  orders.push(order);
  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
  return order;
}

module.exports = { ordersFile, readOrders, saveManualOrder };
