# 🐻 BEAR Park PWA & Push Notifications Setup Guide

## What You Get

✅ **Install as App** - Users can add BEAR Park to their home screen (works like a native app!)
✅ **Push Notifications** - Send raid alerts to users' phones even when the site is closed
✅ **Offline Support** - Basic functionality works without internet
✅ **App Shortcuts** - Quick access to Games, Raids, and Leaderboards

---

## Step 1: Add to Your HTML

Add these lines to the `<head>` section of [main.html](main.html):

```html
<!-- PWA Manifest -->
<link rel="manifest" href="/site.webmanifest">

<!-- Theme colors for mobile browsers -->
<meta name="theme-color" content="#8b5cf6">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="BEAR Park">

<!-- Push Notifications Script -->
<script src="/frontend/push-notifications.js"></script>
```

---

## Step 2: Add Install & Notification Buttons

Add this HTML somewhere in your main.html (maybe in the header or after wallet connection):

```html
<!-- PWA Install & Notifications -->
<div id="pwaControls" style="display: none; position: fixed; bottom: 20px; right: 20px; z-index: 10000;">
  <!-- Install App Button -->
  <button id="installAppBtn" class="pwa-btn" style="display: none; margin-bottom: 10px;">
    📱 Install BEAR Park App
  </button>

  <!-- Enable Notifications Button -->
  <button id="enableNotificationsBtn" class="pwa-btn">
    🔔 Enable Raid Alerts
  </button>
</div>

<style>
.pwa-btn {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.5);
  display: block;
  width: 100%;
  margin-bottom: 8px;
}

.pwa-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(139, 92, 246, 0.7);
}

.pwa-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

<script>
// PWA Install Prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installAppBtn').style.display = 'block';
  document.getElementById('pwaControls').style.display = 'block';
});

document.getElementById('installAppBtn')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  console.log(`User response: ${outcome}`);
  deferredPrompt = null;
  document.getElementById('installAppBtn').style.display = 'none';
});

// Notifications Button
document.getElementById('enableNotificationsBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('enableNotificationsBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Requesting permission...';

  const granted = await window.bearPushNotifications.requestPermission();

  if (granted) {
    btn.textContent = '✅ Notifications Enabled!';
    setTimeout(() => {
      btn.style.display = 'none';
    }, 2000);
  } else {
    btn.textContent = '🔔 Enable Raid Alerts';
    btn.disabled = false;
  }
});

// Check if already enabled on load
window.addEventListener('load', async () => {
  const subscribed = await window.bearPushNotifications.isSubscribed();
  if (subscribed) {
    document.getElementById('enableNotificationsBtn').style.display = 'none';
  } else {
    document.getElementById('pwaControls').style.display = 'block';
  }
});
</script>
```

---

## Step 3: Generate VAPID Keys (for push notifications)

Run this to generate VAPID keys:

```bash
npm install -g web-push
web-push generate-vapid-keys
```

This will give you:
- **Public Key** (share with frontend)
- **Private Key** (keep secret on server!)

Add them to your `.env`:

```env
VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
VAPID_SUBJECT=mailto:your-email@example.com
```

---

## Step 4: Add Backend Routes

Add these routes to [backend/server.js](backend/server.js):

```javascript
const webpush = require('web-push');

// Configure web-push with VAPID keys
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@bearpark.xyz',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Get VAPID public key
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
app.post('/api/push/subscribe', async (req, res) => {
  const { wallet_address, subscription, device_info } = req.body;

  try {
    // Save to database
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        wallet_address,
        subscription: JSON.stringify(subscription),
        device_info,
        created_at: new Date(),
        is_active: true
      }, {
        onConflict: 'wallet_address'
      });

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unsubscribe
app.post('/api/push/unsubscribe', async (req, res) => {
  const { wallet_address } = req.body;

  try {
    await supabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('wallet_address', wallet_address);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send push notification (call this when raid is created)
async function sendRaidNotification(raid) {
  try {
    // Get all active subscriptions
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('is_active', true);

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No active push subscriptions');
      return;
    }

    const payload = JSON.stringify({
      type: 'raid',
      raid_id: raid.id,
      raid_name: raid.name,
      creator_name: raid.creator_name,
      timestamp: new Date().toISOString()
    });

    // Send to all subscribers
    const promises = subscriptions.map(sub => {
      try {
        return webpush.sendNotification(
          JSON.parse(sub.subscription),
          payload
        );
      } catch (error) {
        console.error('Error sending to subscription:', error);
        return Promise.resolve();
      }
    });

    await Promise.all(promises);
    console.log(`✅ Sent ${promises.length} push notifications for raid`);

  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
}

// Example: Call this when a raid is created
app.post('/api/raids', async (req, res) => {
  // ... your existing raid creation code ...

  // After creating raid, send notifications
  await sendRaidNotification({
    id: raid.id,
    name: raid.name,
    creator_name: raid.creator_display_name
  });

  res.json({ success: true, raid });
});
```

---

## Step 5: Create Database Table

Run this in Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  wallet_address VARCHAR(255) PRIMARY KEY,
  subscription JSONB NOT NULL,
  device_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_push_subscriptions_active ON push_subscriptions(is_active);
```

---

## Step 6: Install Dependencies

```bash
cd Desktop/BEARpark
npm install web-push
```

---

## Step 7: Test Locally

1. **Start your server:**
   ```bash
   pm2 restart bearpark-api
   ```

2. **Visit https://localhost:8080 (MUST be HTTPS for push notifications!)**
   - Note: For local testing with HTTPS, you'll need to set up SSL certs or use ngrok

3. **Click "Install BEAR Park App"**
   - Should show install prompt on mobile

4. **Click "Enable Raid Alerts"**
   - Should request notification permission

5. **Create a test raid**
   - All subscribed users should get a notification!

---

## Step 8: Deploy to Production (bearpark.xyz)

Once deployed to HTTPS (bearpark.xyz), everything will work automatically!

Users on mobile will see:
- ✅ "Add to Home Screen" prompt
- ✅ Notification permission request
- ✅ Push notifications when raids happen

---

## Testing Push Notifications

To test sending a notification manually:

```javascript
// In browser console
fetch('http://localhost:3000/api/push/test-notification', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet_address: localStorage.getItem('bearpark_wallet')
  })
}).then(r => r.json()).then(console.log);
```

---

## 🎉 Done!

Your users can now:
1. **Install the app** - Works offline, feels like a native app
2. **Get raid notifications** - Even when the site is closed!
3. **Quick shortcuts** - Jump straight to Games, Raids, or Leaderboard

---

## Troubleshooting

**"Service worker not registering"**
- Must be served over HTTPS (or localhost)
- Check browser console for errors

**"Push notifications not working"**
- Check VAPID keys are correct
- Ensure user granted permission
- Check browser console for errors
- Verify subscription saved to database

**"Install prompt not showing"**
- Only shows on mobile browsers (Android Chrome, iOS Safari 16.4+)
- Only shows once per domain
- Check manifest.json is valid

---

Need help? Let me know!
