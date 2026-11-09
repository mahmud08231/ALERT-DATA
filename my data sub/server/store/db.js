const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

const file = path.join(__dirname, 'data.json');

function emptyData() {
  return { users: [], orders: [], transactions: [], notifications: [], verificationCodes: [], resetTokens: [] };
}

function ensureFile() {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(emptyData(), null, 2));
  }
}

function read() {
  ensureFile();
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data.notifications)) data.notifications = [];
    return data;
  } catch (error) {
    throw new Error(`Could not read store: ${error.message}`);
  }
}

function write(data) {
  ensureFile();
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, file);
}

function id(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function seed() {
  const data = read();
  const exists = data.users.some((user) => user.email === env.admin.email);
  if (!exists) {
    data.users.push({
      id: id('usr'),
      name: 'ALERT DATA Admin',
      email: env.admin.email,
      passwordHash: await bcrypt.hash(env.admin.password, 12),
      walletPinHash: await bcrypt.hash(env.admin.pin, 12),
      walletBalance: 0,
      role: 'admin',
      emailVerified: true,
      createdAt: new Date().toISOString()
    });
    write(data);
  }
}

module.exports = { file, read, write, seed, id };
