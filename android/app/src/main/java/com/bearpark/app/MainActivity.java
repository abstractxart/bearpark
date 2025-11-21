package com.bearpark.app;

import android.app.ActivityManager;
import android.content.ComponentCallbacks2;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity implements ComponentCallbacks2 {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 🔥 GODMODE: Set thread priority to max BEFORE anything else
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_DISPLAY);

        super.onCreate(savedInstanceState);

        // 🔥 GODMODE: Window optimizations
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );

        // Transparent status bar
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(0x00000000);
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            );
        }

        // 🔥 GODMODE: Decor view optimizations
        View decorView = getWindow().getDecorView();
        decorView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    }

    @Override
    public void onStart() {
        super.onStart();
        configureWebViewGodMode();
    }

    private void configureWebViewGodMode() {
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        WebSettings s = webView.getSettings();

        // ===== 🔥 GODMODE CORE =====
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportMultipleWindows(false);

        // ===== 🔥 GODMODE RENDERING =====
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        s.setRenderPriority(WebSettings.RenderPriority.HIGH);
        s.setEnableSmoothTransition(true);

        // ===== 🔥 GODMODE CACHING - AGGRESSIVE AF =====
        s.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK); // Cache first, network second
        s.setDatabaseEnabled(true);
        // Note: AppCache APIs removed in API 33+, using standard cache instead

        // ===== 🔥 GODMODE MEDIA =====
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadsImagesAutomatically(true);
        s.setBlockNetworkImage(false);

        // ===== 🔥 GODMODE LAYOUT =====
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.TEXT_AUTOSIZING);

        // ===== 🔥 GODMODE ZOOM/SCROLL - DISABLED =====
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);

        // ===== 🔥 GODMODE MIXED CONTENT =====
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // ===== 🔥 GODMODE EXTRA SETTINGS =====
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setGeolocationEnabled(false); // Disable GPS overhead
        s.setNeedInitialFocus(false);
        s.setSaveFormData(false);
        s.setSavePassword(false);

        // ===== 🔥 GODMODE WEBVIEW FLAGS =====
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setHapticFeedbackEnabled(false); // Disable vibration overhead
        webView.setSoundEffectsEnabled(false);

        // 🔥 GODMODE: Force hardware acceleration on WebView
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // 🔥 GODMODE: Max priority when active
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_DISPLAY);

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
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        // 🔥 GODMODE: Aggressive memory management
        if (level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.freeMemory();
            }
        }
    }

    @Override
    public void onLowMemory() {
        super.onLowMemory();
        // 🔥 GODMODE: Emergency memory cleanup
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.freeMemory();
            webView.clearCache(false);
        }
        System.gc();
    }
}
