require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// XAMAN API Credentials from environment variables
const XAMAN_API_KEY = process.env.XAMAN_API_KEY;
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET;
const XAMAN_API_URL = 'https://xumm.app/api/v1/platform';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

// Validate required environment variables
if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
  console.error('❌ ERROR: XAMAN_API_KEY and XAMAN_API_SECRET must be set in environment variables');
  process.exit(1);
}

// Middleware
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true
}));
app.use(express.json());

// Create XAMAN Payload
app.post('/api/xaman/payload', async (req, res) => {
  try {
    const response = await fetch(`${XAMAN_API_URL}/payload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': XAMAN_API_KEY,
        'X-API-Secret': XAMAN_API_SECRET
      },
      body: JSON.stringify({
        txjson: {
          TransactionType: 'SignIn'
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to create payload', details: data });
    }

    res.json(data);
  } catch (error) {
    console.error('Error creating payload:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Get Payload Status
app.get('/api/xaman/payload/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;

    const response = await fetch(`${XAMAN_API_URL}/payload/${uuid}`, {
      headers: {
        'X-API-Key': XAMAN_API_KEY,
        'X-API-Secret': XAMAN_API_SECRET
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to get payload status', details: data });
    }

    res.json(data);
  } catch (error) {
    console.error('Error getting payload status:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'XAMAN proxy server running' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 XAMAN Proxy Server running on http://localhost:${PORT}`);
  console.log(`✅ Ready to handle XAMAN authentication requests\n`);
});
