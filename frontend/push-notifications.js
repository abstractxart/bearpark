/**
 * 🐻 BEAR Park Push Notifications System
 * Handles PWA push notifications for raids and other events
 */

const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://bearpark.xyz';

class BearPushNotifications {
  constructor() {
    this.registration = null;
    this.subscription = null;
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
  }

  /**
   * Initialize push notifications
   */
  async init() {
    if (!this.isSupported) {
      console.warn('🐻 Push notifications not supported on this device');
      return false;
    }

    try {
      // Register service worker
      this.registration = await navigator.serviceWorker.register('/sw.js');
      console.log('🐻 Service Worker registered:', this.registration);

      // Check if already subscribed
      this.subscription = await this.registration.pushManager.getSubscription();

      if (this.subscription) {
        console.log('🐻 Already subscribed to push notifications');
        // Send subscription to server (in case it's not saved)
        await this.saveSubscription(this.subscription);
      }

      return true;
    } catch (error) {
      console.error('🐻 Service Worker registration failed:', error);
      return false;
    }
  }

  /**
   * Request permission and subscribe to push notifications
   */
  async requestPermission() {
    if (!this.isSupported) {
      alert('⚠️ Push notifications are not supported on your device');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        console.log('🐻 Notification permission granted!');
        await this.subscribe();
        return true;
      } else if (permission === 'denied') {
        console.warn('🐻 Notification permission denied');
        alert('⚠️ You denied notification permissions. You won\'t receive raid alerts!');
        return false;
      } else {
        console.log('🐻 Notification permission dismissed');
        return false;
      }
    } catch (error) {
      console.error('🐻 Error requesting permission:', error);
      return false;
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe() {
    if (!this.registration) {
      await this.init();
    }

    try {
      // You'll need to get VAPID keys from your server
      // For now, we'll use a public key (you need to generate this)
      const response = await fetch(`${API_BASE_URL}/api/push/vapid-public-key`);
      const { publicKey } = await response.json();

      this.subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey)
      });

      console.log('🐻 Subscribed to push notifications:', this.subscription);

      // Save subscription to server
      await this.saveSubscription(this.subscription);

      return this.subscription;
    } catch (error) {
      console.error('🐻 Failed to subscribe:', error);
      // Fallback: still save that they want notifications (we'll use Web API polling)
      return null;
    }
  }

  /**
   * Save subscription to server
   */
  async saveSubscription(subscription) {
    const walletAddress = localStorage.getItem('bearpark_wallet');
    if (!walletAddress) {
      console.warn('🐻 No wallet connected, cannot save subscription');
      return;
    }

    try {
      await fetch(`${API_BASE_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddress,
          subscription: subscription,
          device_info: {
            userAgent: navigator.userAgent,
            platform: navigator.platform
          }
        })
      });

      console.log('🐻 Subscription saved to server');
      localStorage.setItem('bearpark_push_enabled', 'true');
    } catch (error) {
      console.error('🐻 Failed to save subscription:', error);
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe() {
    if (!this.subscription) {
      return;
    }

    try {
      await this.subscription.unsubscribe();
      console.log('🐻 Unsubscribed from push notifications');

      // Remove from server
      const walletAddress = localStorage.getItem('bearpark_wallet');
      if (walletAddress) {
        await fetch(`${API_BASE_URL}/api/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet_address: walletAddress })
        });
      }

      localStorage.removeItem('bearpark_push_enabled');
      this.subscription = null;
    } catch (error) {
      console.error('🐻 Failed to unsubscribe:', error);
    }
  }

  /**
   * Check if subscribed
   */
  async isSubscribed() {
    if (!this.registration) {
      await this.init();
    }

    this.subscription = await this.registration?.pushManager.getSubscription();
    return !!this.subscription;
  }

  /**
   * Show install prompt for PWA
   */
  showInstallPrompt() {
    // This is handled by browser automatically
    // We can show a custom UI to encourage it
    console.log('🐻 Install prompt triggered');
  }

  /**
   * Helper: Convert VAPID key
   */
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

// Export global instance
window.bearPushNotifications = new BearPushNotifications();

// Auto-initialize on load
window.addEventListener('load', () => {
  window.bearPushNotifications.init();
});

console.log('🐻 Push Notifications module loaded!');
