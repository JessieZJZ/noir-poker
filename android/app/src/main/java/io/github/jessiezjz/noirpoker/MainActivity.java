package io.github.jessiezjz.noirpoker;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.net.Uri;
import android.view.View;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private final Handler launchHandler = new Handler(Looper.getMainLooper());
    private boolean launchReady = false;
    private boolean launchDestroyed = false;
    private final Runnable launchProbe = this::checkLaunchReady;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> !launchReady);
        // Do not let the system's exit zoom reveal another loading cover.
        splash.setOnExitAnimationListener(provider -> provider.remove());
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                launchHandler.removeCallbacks(launchProbe);
                checkLaunchReady();
            }
        });
        super.onCreate(savedInstanceState);
        // The emulator compositor can repeat WebView raster tiles. Use a
        // software layer on virtual hardware; phones keep hardware acceleration.
        if (getBridge() != null && ("ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE))) {
            getBridge().getWebView().setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        }
        updateOrientation(getResources().getConfiguration());
    }

    private void checkLaunchReady() {
        if (launchDestroyed || launchReady || getBridge() == null) return;
        WebView view = getBridge().getWebView();
        Uri url = Uri.parse(view.getUrl() == null ? "" : view.getUrl());
        if (!"localhost".equals(url.getHost())) return;
        view.evaluateJavascript("document.documentElement.dataset.appReady === 'true' || document.documentElement.dataset.startupStage === 'failed'", value -> {
            if (launchDestroyed || launchReady) return;
            if ("true".equals(value)) {
                // The callback fences the WebView's renderer state, so the
                // first app draw is already the table (or startup error UI).
                view.postVisualStateCallback(0, new WebView.VisualStateCallback() {
                    @Override
                    public void onComplete(long requestId) {
                        if (!launchDestroyed) {
                            launchReady = true;
                            view.invalidate();
                        }
                    }
                });
            } else launchHandler.postDelayed(launchProbe, 32);
        });
    }

    @Override
    public void onDestroy() {
        launchDestroyed = true;
        launchHandler.removeCallbacks(launchProbe);
        super.onDestroy();
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        updateOrientation(configuration);
    }

    private void updateOrientation(Configuration configuration) {
        int orientation = configuration.smallestScreenWidthDp >= 600
            ? ActivityInfo.SCREEN_ORIENTATION_USER
            : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
        if (getRequestedOrientation() != orientation) setRequestedOrientation(orientation);
    }
}
