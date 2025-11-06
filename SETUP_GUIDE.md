# BEAR Park Setup Guide

## 🎮 NEW: User Profiles & Game Leaderboards Setup

### What's Been Added:
- ✅ **User Profiles**: Display name + NFT avatar selection
- ✅ **Game Leaderboards**: Track high scores for all games
- ✅ **API Endpoints**: Full REST API for profiles and leaderboards
- ✅ **Database Schema**: PostgreSQL tables with Supabase

### Quick Setup (10 minutes):

#### 1. Create Supabase Account (if you haven't already)
1. Go to https://supabase.com
2. Click "Start your project"
3. Sign in with GitHub
4. Create a new project:
   - Name: `bearpark`
   - Database Password: (save this somewhere safe!)
   - Region: Choose closest to you
   - Wait 2-3 minutes for project to initialize

#### 2. Run Database Schema
1. Open your Supabase project dashboard
2. Click "SQL Editor" in the left sidebar
3. Click "New Query"
4. Open [supabase-schema.sql](supabase-schema.sql) and copy ALL contents
5. Paste into SQL Editor
6. Click "Run" (or press Ctrl+Enter)
7. You should see "Success. No rows returned" - that's perfect!

#### 3. Get Your Supabase Credentials
1. In Supabase, go to: Settings → API
2. Copy these two values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

#### 4. Update Your .env File
1. Open `.env` file in your project
2. Add these lines (replace with your actual values):
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
```

#### 5. Start Your Server
```bash
node server.js
```

You should see:
```
🚀 BEAR Park API Server running on http://localhost:3000
✅ XAMAN authentication: ENABLED
✅ Database (Supabase): CONNECTED
```

#### 6. Test It!
1. Open your website
2. Connect your wallet
3. Click "VIEW ULTRA RARES" or "VIEW PIXEL BEARS"
4. Select an NFT avatar
5. Enter a display name
6. Click "SAVE PROFILE"
7. It should work! 🎉

---

## ✅ Previous Setup - Twitter Integration:

## What's Been Completed:

### 1. **Database Schema** ✅
- Created [supabase-schema.sql](supabase-schema.sql) with all necessary tables:
  - `users` - Wallet to Twitter mapping
  - `tweets` - Track point-earning tweets
  - `raids` - Discord raid tracking
  - `point_transactions` - Detailed point history
  - `pending_tweets` - Tweets before wallet connection

### 2. **Frontend UI** ✅
- Updated [main.html](main.html#L496-L608):
  - ✅ Removed Dexscreener chart
  - ✅ Added "My $BEAR Portfolio" section
  - ✅ Added "Points & Rewards" section
  - ✅ Styled with new CSS
  - ✅ Shows wallet balance, USD value, XRP value
  - ✅ Twitter connect/disconnect buttons
  - ✅ Activity feed display
  - ✅ Active raids notification

### 3. **Portfolio Loading** ✅
- Created `loadPortfolioData()` function
- Automatically loads when drawer opens
- Shows real-time $BEAR balance from XRPL
- Calculates USD and XRP values

---

## 🚀 Next Steps (To Complete Twitter Integration):

### **STEP 1: Set up Supabase Database** (5 minutes)

1. Go to your Supabase project: https://supabase.com/dashboard
2. Click on your project
3. Go to "SQL Editor" in the left sidebar
4. Click "New Query"
5. Copy ALL the contents of [supabase-schema.sql](supabase-schema.sql)
6. Paste into the query editor
7. Click "Run" button
8. You should see success messages!

---

### **STEP 2: Get Twitter API Access** (15-30 minutes)

1. **Go to Twitter Developer Portal:**
   - Visit: https://developer.twitter.com/en/portal/dashboard
   - Sign in with your Twitter account

2. **Create Developer Account:**
   - Click "Sign up for Free Account"
   - Fill out the form:
     - **How will you use the Twitter API?**
       - "I'm building a community engagement system to track mentions of @bearxrpl and reward community members with points"
     - **Will you make Twitter content available to a government entity?** → No

3. **Create a Project:**
   - Name: "BEAR Park Points System"
   - Use case: "Exploring the API"

4. **Create an App:**
   - App name: "BEARpark-rewards"
   - Get your keys:
     - **API Key**
     - **API Secret**
     - **Bearer Token**
   - Save these! You'll need them later

5. **Set up OAuth 2.0:**
   - In App settings → "User authentication settings"
   - Enable "OAuth 2.0"
   - Callback URL: `https://bearpark.xyz/api/auth/twitter/callback`
   - Website URL: `https://bearpark.xyz`

**Save these credentials somewhere safe!**

---

### **STEP 3: Create Vercel Serverless API** (20 minutes)

We need to create API endpoints for the backend. Since you have Vercel, we'll use Vercel Serverless Functions.

1. **In your project folder, create this structure:**
   ```
   BEARpark/
   ├── api/
   │   ├── points/
   │   │   └── [wallet].js
   │   ├── tweets/
   │   │   └── check.js
   │   ├── raids/
   │   │   └── active.js
   │   └── auth/
   │       └── twitter.js
   ├── index.html
   ├── main.html
   └── ...
   ```

2. **I'll create these API files for you next!**

---

### **STEP 4: Environment Variables** (5 minutes)

You'll need to add these environment variables in Vercel:

1. Go to your Vercel project dashboard
2. Click "Settings" → "Environment Variables"
3. Add these variables:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your_supabase_anon_key
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
TWITTER_BEARER_TOKEN=your_twitter_bearer_token
```

**Where to find Supabase credentials:**
- Go to Supabase Dashboard → Project Settings → API
- Copy "Project URL" → That's your `SUPABASE_URL`
- Copy "anon public" key → That's your `SUPABASE_KEY`

---

## 💰 Cost Breakdown:

✅ **FREE TIER (Current Setup):**
- Supabase: FREE (500MB database, 2GB bandwidth)
- Vercel: FREE (100GB bandwidth, unlimited serverless functions)
- Twitter API: FREE (10,000 tweet reads/month, 50 tweets posted/month)
- **Total: $0/month** ✨

⚠️ **If you outgrow free tier:**
- Supabase Pro: $25/month (8GB database, 250GB bandwidth)
- Vercel Pro: $20/month (1TB bandwidth)
- Twitter API Basic: $100/month (100K tweets/month)
- **Total if you scale: $145/month**

**You won't need paid tiers unless you get THOUSANDS of users!**

---

## 📝 What You Can Test Right Now:

1. **Open your website:** https://bearpark.xyz/main.html
2. **Click the $BEAR button** (bottom right)
3. **You should see:**
   - ✅ "My $BEAR Portfolio" section (shows your balance!)
   - ✅ "Points & Rewards" section (with "Connect Twitter" button)
   - ✅ NO more chart!
   - ✅ Price info still there
   - ✅ Buy links still there

4. **If you're authenticated:**
   - Portfolio should show your actual $BEAR balance
   - USD and XRP values calculated

---

## 🎯 What Still Needs Building:

### Phase 1: Backend API (I'll help you build this!)
- [ ] `/api/points/[wallet].js` - Get points for wallet
- [ ] `/api/auth/twitter.js` - Twitter OAuth flow
- [ ] `/api/tweets/check.js` - Check for new tweets
- [ ] `/api/raids/active.js` - Get active raids
- [ ] `/api/raids/create.js` - Create raid (admin)

### Phase 2: Twitter Tracking
- [ ] Set up tweet polling or webhook
- [ ] Track @bearxrpl mentions
- [ ] Award points automatically

### Phase 3: Discord Integration
- [ ] Create admin panel for raid creation
- [ ] OR give webhook URL to Discord admin
- [ ] Track raid participation

---

## 🤔 Questions for You:

Before I build the backend API, I need to know:

1. **Did you complete STEP 1** (Supabase schema)? ✅ or ❌
2. **Are you working on STEP 2** (Twitter API)? ✅ or ❌
3. **Do you want me to create the Vercel API files?** ✅ or ❌

Let me know and I'll continue building!

---

## 📚 Helpful Resources:

- **Supabase Docs:** https://supabase.com/docs
- **Vercel Serverless Functions:** https://vercel.com/docs/functions/serverless-functions
- **Twitter API Docs:** https://developer.twitter.com/en/docs/twitter-api
- **XRPL.js Docs:** https://js.xrpl.org/

---

## 🆘 If You Get Stuck:

1. **Supabase Issues:** Check the SQL Editor for error messages
2. **Twitter API Issues:** Make sure you applied for "Elevated" access if needed
3. **Vercel Issues:** Check the deployment logs in Vercel dashboard

**Just let me know what step you're on and I'll help!** 🚀
