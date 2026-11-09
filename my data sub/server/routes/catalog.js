const express = require('express');
const env = require('../config/env');
const vtu = require('../services/vtu');

const router = express.Router();

function catalogueError(error) {
  const status = error.response?.status;
  if (status === 403) return 'VTU.ng denied access to its plan catalogue (HTTP 403). Ask VTU.ng to enable the bills:read permission for this API key, and check that the live/sandbox API URL matches the key.';
  if (status === 401) return 'VTU.ng did not accept this API key (HTTP 401). Check the key in your hosting environment and confirm the API URL matches the key type.';
  return error.message || 'Could not load the current data plans.';
}

router.get('/data-plans', async (req, res) => {
  try {
    const network = String(req.query.network || '');
    const result = await vtu.listDataPlans(network);
    res.json({ network, source: result.source, canPurchase: result.source !== 'static', plans: result.plans });
  } catch (error) {
    res.status(error.status || error.response?.status || 502).json({ error: catalogueError(error) });
  }
});

router.get('/', (req, res) => res.json(env.catalog));

module.exports = router;
