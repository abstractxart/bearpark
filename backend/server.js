require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { XummSdk } = require('xumm-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// XAMAN API Credentials from environment variables (trim any whitespace)
const XAMAN_API_KEY = process.env.XAMAN_API_KEY?.trim();
const XAMAN_API_SECRET = process.env.XAMAN_API_SECRET?.trim();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

// Validate required environment variables
if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
  console.error('❌ ERROR: XAMAN_API_KEY and XAMAN_API_SECRET must be set in environment variables');
  process.exit(1);
}

// Initialize XAMAN SDK
console.log('Initializing XAMAN SDK...');
console.log('API Key length:', XAMAN_API_KEY?.length);
console.log('API Secret length:', XAMAN_API_SECRET?.length);
console.log('API Key (first 10 chars):', XAMAN_API_KEY?.substring(0, 10));
console.log('API Secret (first 10 chars):', XAMAN_API_SECRET?.substring(0, 10));
const xumm = new XummSdk(XAMAN_API_KEY, XAMAN_API_SECRET);
console.log('XAMAN SDK initialized successfully');

// Middleware
app.use(cors({
  origin: [FRONTEND_URL, 'https://bearpark.xyz', 'https://www.bearpark.xyz', 'http://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true
}));
app.use(express.json());

// Create XAMAN Payload
app.post('/api/xaman/payload', async (req, res) => {
  try {
    console.log('Creating XAMAN payload...');
    const transaction = { TransactionType: 'SignIn' };
    // Use returnErrors: true to throw error instead of returning null
    const payload = await xumm.payload.create(transaction, true);
    console.log('Payload created:', payload);

    res.json(payload);
  } catch (error) {
    console.error('Error creating payload:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message, stack: error.stack });
  }
});

// Get Payload Status
app.get('/api/xaman/payload/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const payload = await xumm.payload.get(uuid);
    res.json(payload);
  } catch (error) {
    console.error('Error getting payload status:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'XAMAN proxy server running' });
});

// Debug endpoint to check environment variables
app.get('/debug/env', (req, res) => {
  res.json({
    apiKeyLength: XAMAN_API_KEY?.length,
    apiSecretLength: XAMAN_API_SECRET?.length,
    apiKeyFirst10: XAMAN_API_KEY?.substring(0, 10),
    apiSecretFirst10: XAMAN_API_SECRET?.substring(0, 10),
    apiKeyLast4: XAMAN_API_KEY?.substring(XAMAN_API_KEY.length - 4)
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 XAMAN Proxy Server running on http://localhost:${PORT}`);
  console.log(`✅ Ready to handle XAMAN authentication requests\n`);
});
