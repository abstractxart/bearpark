package com.bearpark.app;

import android.app.ActivityManager;
import android.content.ComponentCallbacks2;
import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

/**
 * 🐻❄️ COCAINE BEAR MODE - MAXIMUM FUCKING SPEED
 * Optimized for LOW-END Android devices
 */
public class MainActivity extends BridgeActivity implements ComponentCallbacks2 {

    private boolean isLowEndDevice = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 🐻❄️ COCAINE: Thread priority to the fucking MAX
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO); // Even higher than URGENT_DISPLAY

        super.onCreate(savedInstanceState);

        // Detect low-end device
        isLowEndDevice = detectLowEndDevice();

        // 🐻❄️ COCAINE: Window flags for speed
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        // Transparent status bar
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            );
        }

        // 🐻❄️ COCAINE: Disable window animations for instant transitions
        getWindow().setWindowAnimations(0);
    }

    private boolean detectLowEndDevice() {
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo memInfo = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(memInfo);
        // Low-end = less than 2GB RAM
        return memInfo.totalMem < 2L * 1024 * 1024 * 1024;
    }

    @Override
    public void onStart() {
        super.onStart();
        configureWebViewCocaineBearMode();
    }

    private void configureWebViewCocaineBearMode() {
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        WebSettings s = webView.getSettings();

        // ===== 🐻❄️ COCAINE BEAR CORE =====
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportMultipleWindows(false);

        // ===== 🐻❄️ COCAINE BEAR RENDERING =====
        // Use SOFTWARE rendering on low-end devices (GPU sucks on cheap phones)
        if (isLowEndDevice) {
            webView.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        } else {
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        }

        // ===== 🐻❄️ COCAINE BEAR CACHING - FUCKING AGGRESSIVE =====
        // Load from cache ONLY if available, otherwise network
        s.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        s.setDatabaseEnabled(true);

        // ===== 🐻❄️ COCAINE BEAR MEDIA =====
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadsImagesAutomatically(true);
        s.setBlockNetworkImage(false);

        // 🐻❄️ COCAINE: Load images AFTER page renders (faster perceived load)
        if (isLowEndDevice) {
            s.setBlockNetworkImage(true); // Block images initially
            // Unblock after a delay via JavaScript in the page
        }

        // ===== 🐻❄️ COCAINE BEAR LAYOUT - ZERO OVERHEAD =====
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        // Use NORMAL layout - no text resizing overhead
        s.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL);

        // 🐻❄️ COCAINE: Fixed viewport = no reflow calculations
        s.setDefaultZoom(WebSettings.ZoomDensity.MEDIUM);

        // ===== 🐻❄️ COCAINE BEAR ZOOM/SCROLL - ALL DISABLED =====
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setScrollBarStyle(View.SCROLLBARS_OUTSIDE_OVERLAY);

        // 🐻❄️ COCAINE: Disable scroll physics (faster scrolling)
        webView.setVerticalScrollbarPosition(View.SCROLLBAR_POSITION_RIGHT);
        webView.setNestedScrollingEnabled(false);

        // ===== 🐻❄️ COCAINE BEAR MIXED CONTENT =====
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // ===== 🐻❄️ COCAINE BEAR DISABLE ALL OVERHEAD =====
        s.setAllowFileAccess(false); // Don't need file access
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false);
        s.setNeedInitialFocus(false);
        s.setSaveFormData(false);
        s.setSavePassword(false);

        // 🐻❄️ COCAINE: Disable accessibility overhead
        s.setJavaScriptCanOpenWindowsAutomatically(false);

        // 🐻❄️ COCAINE: Faster text encoding
        s.setDefaultTextEncodingName("UTF-8");

        // ===== 🐻❄️ COCAINE BEAR WEBVIEW FLAGS =====
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setHapticFeedbackEnabled(false);
        webView.setSoundEffectsEnabled(false);

        // 🐻❄️ COCAINE: Disable drawing cache (memory hog)
        webView.setDrawingCacheEnabled(false);
        webView.setWillNotCacheDrawing(true);

        // 🐻❄️ COCAINE: Disable animation cache
        webView.setAnimationCacheEnabled(false);

        // 🐻❄️ COCAINE: Disable long click (faster touch response)
        webView.setLongClickable(false);

        // 🐻❄️ COCAINE: Set background to avoid overdraw
        webView.setBackgroundColor(Color.parseColor("#6B1FA8"));

        // 🐻❄️ COCAINE: If low-end device, unblock images after short delay
        if (isLowEndDevice) {
            webView.postDelayed(() -> {
                s.setBlockNetworkImage(false);
            }, 500); // Load images 500ms after page starts
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // 🐻❄️ COCAINE: MAX CPU priority when active
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO);

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        // 🐻❄️ COCAINE: Lower priority when backgrounded
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        // 🐻❄️ COCAINE: Aggressive memory cleanup
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.freeMemory();
                webView.clearCache(false);
            }
        }
    }

    @Override
    public void onLowMemory() {
        super.onLowMemory();
        // 🐻❄️ COCAINE: EMERGENCY - clear everything
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.freeMemory();
            webView.clearCache(true); // Clear disk cache too
            webView.clearHistory();
        }
        System.gc();
        System.runFinalization();
        System.gc();
    }

    @Override
    public void onDestroy() {
        // 🐻❄️ COCAINE: Clean up WebView completely
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.stopLoading();
            webView.clearCache(true);
            webView.clearHistory();
            webView.destroy();
        }
        super.onDestroy();
    }
}
