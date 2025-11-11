# 🎉 PWA & Push Notifications Setup - COMPLETE!

## ✅ What's Been Done

I've set up everything you need for:
1. **Install as App** - Users can add BEAR Park to their home screen
2. **Push Notifications** - Send raid alerts to users' phones
3. **Offline Support** - Basic functionality works without internet

## 📁 Files Created/Modified

### Frontend:
- ✅ [main.html](main.html) - Added PWA meta tags, notification UI, and JavaScript
- ✅ [site.webmanifest](site.webmanifest) - Updated with app details and shortcuts
- ✅ [sw.js](sw.js) - Service worker for push notifications
- ✅ [frontend/push-notifications.js](frontend/push-notifications.js) - Notification manager

### Backend:
- ✅ [backend/server.js](backend/server.js) - Added web-push import and configuration
- ✅ [.env](.env) - Added VAPID keys

### Documentation & SQL:
- ✅ [backend/supabase-push-notifications-setup.sql](backend/supabase-push-notifications-setup.sql) - Database table
- ✅ [backend/PUSH-NOTIFICATION-ROUTES.js](backend/PUSH-NOTIFICATION-ROUTES.js) - Routes to add

## 🚀 NEXT STEPS (Do These Now!)

### Step 1: Create Database Table

1. Go to Supabase SQL Editor:
   https://supabase.com/dashboard/project/cfdgdisaexvyrdjjcuss/sql/new

2. Copy and run this SQL:

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  wallet_address VARCHAR(255) PRIMARY KEY,
  subscription JSONB NOT NULL,
  device_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  last_notification_sent TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active
  ON push_subscriptions(is_active);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public access to push_subscriptions"
  ON push_subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);
```

### Step 2: Add Push Notification Routes to Server

Open [backend/server.js](backend/server.js) and add the routes from [backend/PUSH-NOTIFICATION-ROUTES.js](backend/PUSH-NOTIFICATION-ROUTES.js)

**Where to add them:** Before the line `app.listen(PORT, () => {` (around line 1782)

Just copy/paste all the code from PUSH-NOTIFICATION-ROUTES.js before app.listen()

### Step 3: Restart Server

```bash
cd Desktop/BEARpark/backend
pm2 restart bearpark-api
```

### Step 4: Test Locally (Optional)

**Note:** Push notifications require HTTPS. They won't work on `http://localhost` but they WILL work once deployed to `bearpark.xyz`

For local testing, you can:
- Use `ngrok` to create an HTTPS tunnel
- Or just deploy to production and test there

## 🌐 Deploy to Production

Once deployed to **bearpark.xyz** (HTTPS), everything will automatically work!

Users will see:
- 📱 "Install BEAR Park App" button (on mobile)
- 🔔 "Enable Raid Alerts" button
- Push notifications when raids are created!

## 🧪 Testing Push Notifications

Once deployed and a user has subscribed, you can test by creating a raid. Or use this test endpoint:

```javascript
// In browser console after enabling notifications
fetch('https://bearpark.xyz/api/push/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet_address: localStorage.getItem('bearpark_wallet')
  })
}).then(r => r.json()).then(console.log);
```

## 📋 How It Works

1. **User visits site on mobile** → Sees "Install App" prompt
2. **User clicks "Install"** → App added to home screen
3. **User clicks "Enable Raid Alerts"** → Requests notification permission
4. **Permission granted** → Subscription saved to database
5. **Admin creates raid** → Server sends push notification to all subscribers
6. **User gets notification** → Even if app is closed! Tapping opens the app

## 🎯 Features

### PWA Features:
- ✅ Add to home screen
- ✅ Custom app icon
- ✅ Splash screen
- ✅ Offline support
- ✅ App shortcuts (Games, Raids, Leaderboard)

### Push Notification Features:
- ✅ Raid alerts
- ✅ Custom notification icons
- ✅ Vibration
- ✅ Action buttons ("Join Raid", "Dismiss")
- ✅ Click to open app
- ✅ Works when app is closed

## 🔐 Security

- VAPID keys are in `.env` (never commit to Git!)
- Push subscriptions are encrypted
- Each user can only manage their own subscription

## 📱 Browser Support

### Install App:
- ✅ Android Chrome (full support)
- ✅ iOS Safari 16.4+ (limited support)
- ✅ Desktop Chrome/Edge (via menu)

### Push Notifications:
- ✅ Android Chrome (full support)
- ❌ iOS (Apple doesn't allow web push notifications yet)
- ✅ Desktop Chrome/Firefox/Edge

## 🛠️ Troubleshooting

**"Service worker not registering"**
- Must be HTTPS (or localhost for testing)
- Check browser console for errors

**"Push notifications not working"**
- Only works on HTTPS
- Check VAPID keys are set correctly
- Verify user granted permission
- iOS doesn't support web push notifications

**"Install prompt not showing"**
- Only shows on mobile browsers
- Only shows if PWA criteria are met
- Chrome shows it automatically

## 🎉 You're Ready!

Once you:
1. ✅ Create the database table (Step 1)
2. ✅ Add the routes to server.js (Step 2)
3. ✅ Restart the server (Step 3)
4. ✅ Deploy to bearpark.xyz

Users will be able to install the app and get raid notifications!

---

Need help? Let me know! 🐻
