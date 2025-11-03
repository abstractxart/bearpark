# BEAR Park Deployment Guide

## Overview
Your BEAR Park website consists of two parts:
1. **Backend Server** (server.js) - XAMAN API proxy
2. **Frontend** (index.html, main.html) - Static website files

## Quick Start - Deploy Backend to Railway (Recommended)

### Option 1: Railway (Easiest - Free tier available)

1. **Go to Railway**: https://railway.app/
2. **Sign up** with GitHub
3. **Click "New Project"**
4. **Select "Deploy from GitHub repo"**
5. **Create a new GitHub repo** for your backend:
   - Go to https://github.com/new
   - Name it: `bearpark-backend`
   - Upload these files:
     - `server.js`
     - `package.json`
     - `.env.example` (rename to `.env` and add your keys)

6. **Configure Railway**:
   - Select your `bearpark-backend` repo
   - Railway will auto-detect Node.js
   - Go to **Variables** tab
   - Add environment variables:
     ```
     XAMAN_API_KEY=99f1cbca-056b-45b5-a895-162b1ca2735a
     XAMAN_API_SECRET=97ac301f-19d0-4646-a139-6706609548d1
     FRONTEND_URL=https://bearpark.xyz
     PORT=3000
     ```

7. **Deploy**:
   - Railway will automatically deploy
   - Copy your deployment URL (e.g., `https://bearpark-backend-production.up.railway.app`)

### Option 2: Vercel (Also Free)

1. **Go to Vercel**: https://vercel.com
2. **Import your GitHub repo** with backend files
3. **Configure**:
   - Framework Preset: Other
   - Build Command: `npm install`
   - Output Directory: `.`
   - Install Command: `npm install`

4. **Add Environment Variables** in Vercel dashboard:
   ```
   XAMAN_API_KEY=99f1cbca-056b-45b5-a895-162b1ca2735a
   XAMAN_API_SECRET=97ac301f-19d0-4646-a139-6706609548d1
   FRONTEND_URL=https://bearpark.xyz
   ```

5. **Deploy** - Vercel will give you a URL

## Deploy Frontend

### Update index.html with Production Backend URL

In `index.html`, line 432, change:
```javascript
const PROXY_API_URL = 'http://localhost:3000/api/xaman';
```

To your production backend URL:
```javascript
const PROXY_API_URL = 'https://YOUR-BACKEND-URL.railway.app/api/xaman';
```

### Upload Frontend Files

Upload these files to your web hosting:
- `index.html` (authentication gate)
- `main.html` (main website)
- Any other assets (images, CSS, etc.)

**For GitHub Pages / Netlify / Vercel:**
1. Create a new repo with just frontend files
2. Deploy to your domain (bearpark.xyz)

**For cPanel / Traditional Hosting:**
1. FTP upload `index.html` and `main.html` to your public_html folder
2. Make sure `index.html` is the entry point

## Testing Production

1. Visit your website
2. Click "Connect XAMAN Wallet"
3. QR code should appear
4. Scan with XAMAN app
5. Sign in
6. Should redirect to main.html after verification

## Troubleshooting

**CORS Errors?**
- Make sure `FRONTEND_URL` in backend matches your actual domain
- Check backend logs in Railway/Vercel dashboard

**QR Code Not Showing?**
- Check browser console (F12)
- Verify backend URL is correct in index.html
- Check that backend is running (visit https://YOUR-BACKEND-URL.railway.app/health)

**Verification Failing?**
- NFT/Token checks use live XRP Ledger data
- Make sure wallet has required holdings

## Files to Upload

**Backend (Railway/Vercel):**
- server.js
- package.json

**Frontend (Your domain):**
- index.html
- main.html

**Do NOT upload:**
- node_modules/
- .env (use environment variables in hosting dashboard)
- server.js (to frontend hosting)

## Need Help?

Check the `/health` endpoint on your backend to verify it's running:
`https://YOUR-BACKEND-URL.railway.app/health`

Should return: `{"status":"ok","message":"XAMAN proxy server running"}`
