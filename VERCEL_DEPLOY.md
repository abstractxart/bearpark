# 🚀 Deploy BEAR Park to Vercel

## Step 1: Deploy Backend to Vercel

### Option A: Deploy via Vercel CLI (Fastest)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy the backend:**
   ```bash
   cd c:\Users\Oz\Desktop\BEARpark
   vercel
   ```

4. **Follow the prompts:**
   - Set up and deploy? **Y**
   - Which scope? (Select your account)
   - Link to existing project? **N**
   - What's your project's name? **bearpark-backend**
   - In which directory is your code located? **./**
   - Want to override settings? **N**

5. **Set Environment Variables:**
   ```bash
   vercel env add XAMAN_API_KEY
   ```
   Paste: `99f1cbca-056b-45b5-a895-162b1ca2735a`

   ```bash
   vercel env add XAMAN_API_SECRET
   ```
   Paste: `97ac301f-19d0-4646-a139-6706609548d1`

   ```bash
   vercel env add FRONTEND_URL
   ```
   Paste: `https://bearpark.xyz`

6. **Deploy to production:**
   ```bash
   vercel --prod
   ```

7. **Copy your deployment URL** (e.g., `https://bearpark-backend.vercel.app`)

### Option B: Deploy via Vercel Dashboard

1. **Go to:** https://vercel.com/new
2. **Import Git Repository** or **Deploy without Git**
3. **Upload these files:**
   - `server.js`
   - `package.json`
   - `vercel.json`

4. **Configure Project:**
   - Framework Preset: **Other**
   - Build Command: (leave empty)
   - Output Directory: (leave empty)
   - Install Command: `npm install`

5. **Add Environment Variables** in Settings:
   - `XAMAN_API_KEY` = `99f1cbca-056b-45b5-a895-162b1ca2735a`
   - `XAMAN_API_SECRET` = `97ac301f-19d0-4646-a139-6706609548d1`
   - `FRONTEND_URL` = `https://bearpark.xyz`

6. **Click Deploy**

7. **Copy your deployment URL** (shown on success page)

## Step 2: Update Frontend with Backend URL

Once backend is deployed, update `index.html` **line 432**:

**Change from:**
```javascript
const PROXY_API_URL = 'http://localhost:3000/api/xaman';
```

**Change to:**
```javascript
const PROXY_API_URL = 'https://YOUR-BACKEND-URL.vercel.app/api/xaman';
```

Replace `YOUR-BACKEND-URL.vercel.app` with your actual Vercel URL.

## Step 3: Test Backend

Visit your backend health endpoint:
```
https://YOUR-BACKEND-URL.vercel.app/health
```

Should return:
```json
{"status":"ok","message":"XAMAN proxy server running"}
```

## Step 4: Deploy Frontend

Upload these files to your domain (bearpark.xyz):
- `index.html` (updated with backend URL)
- `main.html`

### For cPanel/FTP:
1. Login to your hosting
2. Upload to `public_html/` or your web root
3. Make sure `index.html` is the entry point

### For Vercel (if hosting frontend there too):
1. Create new Vercel project for frontend
2. Upload `index.html` and `main.html`
3. Set custom domain to `bearpark.xyz`

## Step 5: Test Everything

1. Visit `https://bearpark.xyz`
2. Click "Connect XAMAN Wallet"
3. QR code should appear
4. Scan with XAMAN app
5. Sign in
6. Verify and redirect to main site ✅

## Troubleshooting

**"Failed to fetch" error?**
- Check backend URL is correct in index.html
- Make sure environment variables are set in Vercel
- Check CORS settings allow your frontend domain

**Backend not responding?**
- Visit `/health` endpoint to check if it's running
- Check Vercel function logs in dashboard
- Verify environment variables are set

**XAMAN not connecting?**
- Check API credentials in Vercel environment variables
- Make sure FRONTEND_URL matches your actual domain

## Files to Deploy

**Backend (Vercel):**
- ✅ server.js
- ✅ package.json
- ✅ vercel.json

**Frontend (bearpark.xyz):**
- ✅ index.html (with updated backend URL)
- ✅ main.html

**Do NOT upload to Vercel:**
- ❌ node_modules/
- ❌ .env (use environment variables instead)
- ❌ Frontend files to backend project

---

**Need help?** Check Vercel logs in the dashboard or test the `/health` endpoint!
