const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const bool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
};

module.exports = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  cookieSecret: process.env.COOKIE_SECRET || 'replace-me-in-production',
  // Public Preview is HTTPS; set COOKIE_SECURE=false only for plain-HTTP local development.
  cookieSecure: bool(process.env.COOKIE_SECURE, true),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  paystackSecret: process.env.PAYSTACK_SECRET_KEY || '',
  paystackCurrency: process.env.PAYSTACK_CURRENCY || 'NGN',
  giftCardExchangeRate: Number(process.env.GIFTCARD_GBP_NGN_RATE || 2118),
  vtuBaseUrl: process.env.VTU_API_BASE_URL || 'https://api.vtu.ng/v1',
  vtuApiKey: process.env.VTU_API_KEY || '',
  vtuMockMode: bool(process.env.VTU_MOCK_MODE, true),
  vtuPlanSource: String(process.env.VTU_PLAN_SOURCE || 'static').trim().toLowerCase(),
  vtuDataMarkupPercent: Number(process.env.VTU_DATA_MARKUP_PERCENT || 0),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    secure: bool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'ALERT DATA <no-reply@alertdata.ng>'
  },
  admin: {
    email: (process.env.ADMIN_EMAIL || 'admin@alertdata.ng').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'ChangeMe_Admin_123!',
    pin: process.env.ADMIN_PIN || '2468'
  },
  demoBettingIds: (process.env.DEMO_BETTING_IDS || '12345678,87654328')
    .split(',').map((item) => item.trim()).filter(Boolean)
};

module.exports.catalog = {
  networks: ['MTN', 'Glo', 'Airtel', '9mobile'],
  dataPlans: require('./data-plans'),
  bettingPlatforms: ['YX Bet', 'Bank Bet', 'Bet Ninja', 'Bet King', 'Bet Land', 'Bet Lion', 'Way Bet', 'Cloud Bet', 'Life Score Bet', 'Mary Bet', 'Bet Naira', 'SportyBet', 'Super Bet'],
  tvProviders: ['DSTV', 'GOTV'],
  examPins: ['JAMB', 'WAEC', 'NECO'],
  electricity: ['NEPA / IKEDC', 'IBEDC']
};
