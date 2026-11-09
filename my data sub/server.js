const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const env = require('./server/config/env');
const db = require('./server/store/db');

const authRoutes = require('./server/routes/auth');
const walletRoutes = require('./server/routes/wallet');
const catalogRoutes = require('./server/routes/catalog');
const orderRoutes = require('./server/routes/orders');
const giftCardRoutes = require('./server/routes/gift-cards');
const adminRoutes = require('./server/routes/admin');
const notificationRoutes = require('./server/routes/notifications');

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cookieParser(env.cookieSecret));
app.use('/api/wallet/paystack/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false, skip: (req) => req.path === '/api/health' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'ALERT DATA', time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/gift-cards', giftCardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(express.static('public', { extensions: ['html'] }));
app.get('/manus-routes.json', (req, res) => res.sendFile(require('path').join(process.cwd(), 'public/manus-routes.json')));
app.use((req, res) => res.status(404).json({ error: 'Page not found.' }));
app.use((error, req, res, next) => { console.error(error); res.status(500).json({ error: 'Something went wrong. Please try again.' }); });

db.seed().then(() => {
  app.listen(env.port, '0.0.0.0', () => console.log(`ALERT DATA listening on ${env.port}`));
}).catch((error) => { console.error('Could not seed store', error); process.exit(1); });

module.exports = app;
