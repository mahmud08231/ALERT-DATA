const env = require('./env');

const ukCards = [
  { id: 'amazon-uk', name: 'Amazon UK', min: 5, max: 78.23 },
  { id: 'crypto-giftcard-gb', name: 'Crypto Giftcard GB', min: 5, max: 78.23 },
  { id: 'free-fire-530-53-gb', name: 'Free Fire 530 + 53 Diamond GB', min: 5, max: 78.23 },
  { id: 'free-fire-1080-108-gb', name: 'Free Fire 1080 + 108 Diamond GB', min: 5, max: 78.23 },
  { id: 'hm-uk', name: 'H&M UK', min: 5, max: 78.23 },
  { id: 'xbox-uk', name: 'Xbox UK', min: 5, max: 78.23 },
  { id: 'playstation-uk', name: 'PlayStation UK', min: 5, max: 78.23 }
];

function cardsForCountry(countryCode) {
  const code = String(countryCode || '').toUpperCase();
  if (code === 'GB') return ukCards;
  return [
    { id: `amazon-${code.toLowerCase()}`, name: `Amazon ${code}`, min: 5, max: 100 },
    { id: `apple-${code.toLowerCase()}`, name: `Apple Gift Card ${code}`, min: 5, max: 100 },
    { id: `google-play-${code.toLowerCase()}`, name: `Google Play ${code}`, min: 5, max: 100 }
  ];
}

function findCard(countryCode, cardId) {
  return cardsForCountry(countryCode).find((card) => card.id === cardId);
}

module.exports = { cardsForCountry, findCard, exchangeRate: env.giftCardExchangeRate };
