# Twitter Integration & Points System - Implementation Plan

## 🎯 Feature Requirements

### Core Features:
1. **Twitter Mention Tracking** - 10 points per @bearxrpl mention
2. **Discord Raid Integration** - Track raid participation
3. **Points Database** - Per-wallet point storage
4. **Twitter ↔ Wallet Linking** - Connect Twitter account to XRP wallet
5. **Offline Point Accumulation** - Earn points even when not logged in
6. **Portfolio Display** - Show $BEAR holdings with USD/XRP values
7. **Rewards UI** - New drawer section for points & rewards

---

## 🏗️ Architecture Options

### **Option A: Full Backend Solution (RECOMMENDED)**

```
┌─────────────────┐
│   Frontend      │
│  (index.html)   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐      ┌──────────────┐
│   Backend API   │ ←──→ │   Database   │
│  (Node.js/      │      │ (PostgreSQL/ │
│   Express)      │      │  MongoDB)    │
└────────┬────────┘      └──────────────┘
         │
         ├──→ Twitter API (track mentions)
         ├──→ Discord Webhook (raid tracking)
         └──→ Price API (USD/XRP conversion)
```

**Tech Stack:**
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (or Supabase for easy hosting)
- **Hosting:** Vercel/Railway/Render (free tier available)
- **Twitter:** Twitter API v2
- **Discord:** Discord Webhooks
- **Price:** DEX API (like xrpl.services or Bitrue)

**Pros:**
- ✅ Real-time automatic tracking
- ✅ Secure point storage
- ✅ Scalable
- ✅ Offline point accumulation works perfectly

**Cons:**
- ❌ Requires backend development
- ❌ Needs hosting (though free options exist)
- ❌ More complex setup

---

### **Option B: Firebase + Cloud Functions**

```
┌─────────────────┐
│   Frontend      │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│    Firebase     │
│  - Firestore    │ ←─── Twitter API
│  - Functions    │ ←─── Discord Webhook
│  - Auth         │
└─────────────────┘
```

**Pros:**
- ✅ No server management
- ✅ Free tier generous
- ✅ Real-time database
- ✅ Built-in auth

**Cons:**
- ❌ Firebase-specific learning curve
- ❌ Still needs Twitter API setup

---

### **Option C: Simplified Client-Side (NOT RECOMMENDED)**

**Pros:**
- ✅ No backend needed
- ✅ Very simple

**Cons:**
- ❌ No automatic tracking
- ❌ Manual point verification
- ❌ Can't track offline activity
- ❌ Points stored in localStorage (easily manipulated)

---

## 📊 Database Schema (Recommended)

### **Table: users**
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(50) UNIQUE NOT NULL,
  twitter_username VARCHAR(50) UNIQUE,
  twitter_user_id VARCHAR(50) UNIQUE,
  total_points INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### **Table: tweets**
```sql
CREATE TABLE tweets (
  id SERIAL PRIMARY KEY,
  tweet_id VARCHAR(50) UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id),
  twitter_username VARCHAR(50),
  tweet_text TEXT,
  points_awarded INTEGER DEFAULT 10,
  is_raid BOOLEAN DEFAULT FALSE,
  raid_id INTEGER REFERENCES raids(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### **Table: raids**
```sql
CREATE TABLE raids (
  id SERIAL PRIMARY KEY,
  raid_url VARCHAR(500),
  raid_description TEXT,
  target_account VARCHAR(50),
  points_per_participation INTEGER DEFAULT 10,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### **Table: transactions** (for rewards redemption later)
```sql
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  points_change INTEGER,
  transaction_type VARCHAR(50), -- 'earned', 'redeemed', 'bonus'
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 System Flows

### **Flow 1: User Connects Wallet + Twitter**

```
1. User clicks "Connect Twitter" in drawer
   ↓
2. Frontend → OAuth to Twitter
   ↓
3. Twitter redirects back with access token
   ↓
4. Frontend → Backend: { wallet_address, twitter_token }
   ↓
5. Backend gets Twitter user info
   ↓
6. Backend saves to database:
   - wallet_address ↔ twitter_username
   ↓
7. Backend checks for historical tweets (last 7 days)
   ↓
8. Awards retroactive points
   ↓
9. Returns total points to frontend
```

### **Flow 2: User Posts Tweet with @bearxrpl**

**Option A: Webhook (Real-time)**
```
1. User tweets "@bearxrpl is awesome!"
   ↓
2. Twitter webhook → Backend
   ↓
3. Backend checks:
   - Does tweet mention @bearxrpl? ✓
   - Is user registered? → Check by twitter_user_id
   ↓
4. If registered:
   - Add 10 points to user
   - Save tweet to database
   ↓
5. If NOT registered:
   - Save tweet temporarily with twitter_username
   - Award points when they connect wallet later
```

**Option B: Polling (Every 5-15 minutes)**
```
1. Cron job runs every 15 minutes
   ↓
2. Backend → Twitter API: Search "@bearxrpl"
   ↓
3. Get all mentions since last check
   ↓
4. For each tweet:
   - Check if already processed
   - Check if user registered
   - Award points
   ↓
5. Update last_checked timestamp
```

### **Flow 3: Discord Raid**

```
1. Admin runs /raid in Discord
   ↓
2. BEAR-bot creates raid announcement
   ↓
3. Bot sends webhook to our backend:
   {
     raid_url: "https://twitter.com/...",
     target: "@someaccount",
     description: "Like and retweet!"
   }
   ↓
4. Backend creates raid in database
   ↓
5. Frontend polls for active raids
   ↓
6. Shows raid notification in website
   ↓
7. Users participate on Twitter
   ↓
8. Backend tracks participation:
   - Check if user replied/retweeted raid target
   - Award points (maybe 20 for raids vs 10 for regular)
```

### **Flow 4: Viewing Points (Frontend)**

```
1. User opens drawer menu
   ↓
2. Frontend → Backend: GET /api/points/:wallet_address
   ↓
3. Backend returns:
   {
     total_points: 450,
     recent_activity: [
       { type: "tweet", points: 10, date: "..." },
       { type: "raid", points: 20, date: "..." }
     ]
   }
   ↓
4. Display in "Points & Rewards" section
```

---

## 🎨 Frontend UI Changes

### **Drawer Menu Structure (New)**

```
┌─────────────────────────────────┐
│  MY $BEAR PORTFOLIO             │
│  💰 125,000 $BEAR               │
│  💵 $3,125 USD                  │
│  🔷 6,875 XRP                   │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  POINTS & REWARDS               │
│  ⭐ Total Points: 450           │
│                                 │
│  [Connect Twitter] (if not yet) │
│                                 │
│  Recent Activity:               │
│  • +10 pts - Tweet (2h ago)     │
│  • +20 pts - Raid (5h ago)      │
│  • +10 pts - Tweet (1d ago)     │
│                                 │
│  🎯 Active Raids: 1             │
│  [View Raid →]                  │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  WALLET INFO                    │
│  rU2AviY...                     │
│  [Disconnect]                   │
└─────────────────────────────────┘
```

### **Changes to Drawer:**
1. ❌ Remove chart/iframe
2. ✅ Add "My $BEAR Portfolio" at top
3. ✅ Add "Points & Rewards" section
4. ✅ Twitter connect button
5. ✅ Active raids notification

---

## 📝 API Endpoints Needed

### **Authentication**
```
POST   /api/auth/connect-twitter
  Body: { wallet_address, twitter_oauth_token }
  Returns: { success, user_id, total_points }

GET    /api/auth/verify-twitter/:wallet_address
  Returns: { connected: true/false, twitter_username }
```

### **Points**
```
GET    /api/points/:wallet_address
  Returns: { total_points, breakdown, recent_activity }

GET    /api/points/leaderboard
  Returns: [{ rank, twitter_username, points }]
```

### **Tweets**
```
POST   /api/tweets/webhook (called by Twitter)
  Body: { tweet data from Twitter }

GET    /api/tweets/check/:wallet_address
  Returns: { new_points_since_last_check }
```

### **Raids**
```
GET    /api/raids/active
  Returns: [{ raid_id, url, description, points }]

POST   /api/raids/create (webhook from Discord bot)
  Body: { raid_url, target, description }

POST   /api/raids/participate
  Body: { wallet_address, raid_id, tweet_url }
```

### **Portfolio**
```
GET    /api/portfolio/:wallet_address
  Returns: {
    bear_balance: 125000,
    usd_value: 3125,
    xrp_value: 6875,
    price_data: { bear_usd, bear_xrp }
  }
```

---

## 🔐 Security Considerations

1. **Twitter OAuth:** Use OAuth 2.0 with PKCE
2. **API Rate Limiting:** Max 100 requests/min per wallet
3. **Point Validation:**
   - Max 100 points per day from tweets (10 tweets)
   - Prevent duplicate tweet submissions
4. **Database:** Sanitize all inputs, use parameterized queries
5. **Wallet Verification:** Require signature proof for linking

---

## 💰 Cost Estimate

### **Free Tier Options:**
- **Vercel/Netlify:** Free hosting (serverless functions)
- **Supabase:** Free PostgreSQL database (500MB)
- **Twitter API:** Free tier (10,000 tweets/month)
- **Total:** $0/month

### **Paid (Better Performance):**
- **Railway/Render:** $5-10/month
- **PostgreSQL:** $5-15/month
- **Twitter API Pro:** $100/month (higher limits)
- **Total:** $10-125/month

---

## ⚡ Quick Start Implementation Plan

### **Phase 1: Setup (Day 1)**
1. Set up backend (Node.js + Express)
2. Set up database (Supabase recommended)
3. Get Twitter API credentials
4. Create basic API endpoints

### **Phase 2: Twitter Integration (Day 2-3)**
1. Implement Twitter OAuth flow
2. Set up tweet tracking (polling or webhook)
3. Test point awarding system

### **Phase 3: Frontend UI (Day 4)**
1. Modify drawer menu
2. Remove chart
3. Add portfolio display
4. Add points/rewards section
5. Add Twitter connect button

### **Phase 4: Discord Integration (Day 5)**
1. Create webhook endpoint for raids
2. Test raid creation
3. Implement raid participation tracking

### **Phase 5: Testing & Polish (Day 6-7)**
1. Test all flows
2. Fix bugs
3. Add error handling
4. Deploy to production

---

## 🚀 Recommended Next Steps

**Tell me:**
1. Do you have backend/database infrastructure already?
2. Do you have Twitter API access?
3. Do you have Discord bot access?
4. What's your preferred hosting solution?
5. What's your budget for this?

**Then I'll:**
1. Set up the exact infrastructure you need
2. Create the backend API
3. Modify the frontend
4. Connect everything together

Ready to start? Let me know what infrastructure you have!
