package com.bearpark.app;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Make status bar transparent so purple background shows through
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            getWindow().setStatusBarColor(0x00000000); // Transparent
            getWindow().getDecorView().setSystemUiVisibility(
                android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            );
        }

        // 🚀 PERFORMANCE: Keep screen on to prevent sleep during use
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    public void onStart() {
        super.onStart();

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();

            // === CORE SETTINGS ===
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setSupportMultipleWindows(false);

            // === 🚀 PERFORMANCE OPTIMIZATIONS ===

            // Enable hardware acceleration for WebView
            webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);

            // Caching - CRITICAL for performance
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setDatabaseEnabled(true);

            // Rendering optimizations
            settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
            settings.setEnableSmoothTransition(true);

            // Media & content settings
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setLoadsImagesAutomatically(true);
            settings.setBlockNetworkImage(false);

            // Layout optimizations
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);

            // Text & zoom
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);

            // Mixed content (HTTP in HTTPS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }

            // Disable slow scroll check for better scrolling performance
            webView.setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);

            // Enable smooth scrolling
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Resume WebView when app comes back
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Pause WebView when app goes to background (saves battery)
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
    }
}
