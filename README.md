# 🐻 BEAR Park - XAMAN Wallet Gated Website

Welcome to BEAR Park! A Web3-gated website using XAMAN wallet authentication on the XRP Ledger.

## 🎯 Features

- ✅ **XAMAN Wallet Integration** - QR code + deep link authentication
- ✅ **Token Verification** - Checks for 10,000+ $BEAR tokens
- ✅ **NFT Verification** - Detects Ultra Rare & Pixel BEAR NFTs
- ✅ **Session Management** - Remembers authenticated users
- ✅ **Beautiful UI** - Purple, green, yellow themed gate page
- ✅ **Auto-Redirect** - Seamless access to main site after verification

## 📁 Project Structure

```
BEARpark/
├── index.html          # Authentication gate (entry point)
├── main.html           # Main BEAR Park website
├── server.js           # Backend XAMAN API proxy
├── package.json        # Node.js dependencies
├── .env.example        # Environment variables template
├── DEPLOYMENT.md       # Deployment instructions
└── README.md           # This file
```

## 🚀 Local Development

### Prerequisites
- Node.js 18+ installed
- XAMAN API credentials from https://apps.xaman.dev/

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

3. **Add your XAMAN credentials to `.env`:**
   ```env
   XAMAN_API_KEY=your-api-key-here
   XAMAN_API_SECRET=your-api-secret-here
   ```

4. **Start backend server:**
   ```bash
   npm start
   ```
   Backend runs on: http://localhost:3000

5. **Start frontend server** (in another terminal):
   ```bash
   npx http-server -p 8080
   ```
   Frontend runs on: http://127.0.0.1:8080

6. **Test the gate:**
   - Open http://127.0.0.1:8080
   - Click "Connect XAMAN Wallet"
   - Scan QR code with XAMAN app
   - Sign in and verify!

## 📦 Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy Summary:

1. **Deploy Backend** to Railway/Vercel/Heroku
2. **Update** `PROXY_API_URL` in `index.html` with your backend URL
3. **Deploy Frontend** to your domain (bearpark.xyz)

## 🔧 Configuration

### Access Requirements

Users need at least ONE of the following to access the site:
- **10,000+ $BEAR tokens**
- **1+ Ultra Rare BEAR NFT**
- **1+ Pixel BEAR NFT**

### Token & NFT Details

- **$BEAR Token Issuer:** `rBEARGUAsyu7tUw53rufQzFdWmJHpJEqFW`
- **NFT Issuer (Both collections):** `rBEARbo4Prn33894evmvYcAf9yAQjp4VJF`

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML/CSS/JavaScript
- **Backend:** Node.js + Express
- **Blockchain:** XRP Ledger (xrpl.js)
- **Wallet:** XAMAN (formerly Xumm)
- **Verification:** Real-time on-chain data checks

## 📝 License

All rights reserved © BEAR Park

## 🤝 Support

For issues or questions, check the XAMAN developer docs: https://docs.xaman.dev/

---

**Built with ❤️ for the $BEAR community** 🐻🚀
