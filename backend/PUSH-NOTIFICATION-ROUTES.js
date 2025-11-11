// ====================================================================
// PUSH NOTIFICATIONS ROUTES
// Add these routes to backend/server.js before app.listen()
// ====================================================================

// Get VAPID public key
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
app.post('/api/push/subscribe', async (req, res) => {
  const { wallet_address, subscription, device_info } = req.body;

  try {
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        wallet_address,
        subscription: JSON.stringify(subscription),
        device_info,
        is_active: true,
        updated_at: new Date()
      }, {
        onConflict: 'wallet_address'
      });

    if (error) throw error;

    console.log(`✅ Push subscription saved for ${wallet_address}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unsubscribe from push notifications
app.post('/api/push/unsubscribe', async (req, res) => {
  const { wallet_address } = req.body;

  try {
    await supabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('wallet_address', wallet_address);

    console.log(`✅ Push subscription disabled for ${wallet_address}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to send raid notifications
async function sendRaidNotification(raid) {
  try {
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('is_active', true);

    if (!subscriptions || subscriptions.length === 0) {
      console.log('⚠️  No active push subscriptions');
      return;
    }

    const payload = JSON.stringify({
      type: 'raid',
      raid_id: raid.id,
      raid_name: raid.name,
      creator_name: raid.creator_name,
      timestamp: new Date().toISOString()
    });

    const promises = subscriptions.map(async sub => {
      try {
        await webpush.sendNotification(
          JSON.parse(sub.subscription),
          payload
        );
      } catch (error) {
        console.error(`Failed to send to ${sub.wallet_address}:`, error.message);
        // If subscription is invalid, mark as inactive
        if (error.statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('wallet_address', sub.wallet_address);
        }
      }
    });

    await Promise.allSettled(promises);
    console.log(`✅ Sent raid notifications to ${subscriptions.length} users`);

  } catch (error) {
    console.error('Error sending raid notifications:', error);
  }
}

// Test notification endpoint
app.post('/api/push/test', async (req, res) => {
  const { wallet_address } = req.body;

  try {
    const { data: sub } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('is_active', true)
      .single();

    if (!sub) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const payload = JSON.stringify({
      title: '🐻 Test Notification',
      body: 'If you see this, push notifications are working! 🎉',
      type: 'test'
    });

    await webpush.sendNotification(JSON.parse(sub.subscription), payload);

    res.json({ success: true, message: 'Test notification sent!' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// To call this when a raid is created, add this to your existing raid creation endpoint:
//
// Example (add to existing /api/raids POST endpoint):
// await sendRaidNotification({
//   id: raid.id,
//   name: raid.name,
//   creator_name: raid.creator_display_name || 'A BEAR'
// });
