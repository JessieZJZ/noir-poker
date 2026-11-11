package io.github.jessiezjz.noirpoker;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLSurface;
import android.opengl.GLES20;
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
        // WebView alone stops text at 8px, which leaves long localized style
        // tags overflowing their badges. Let the shared fitting shrink them.
        if (getBridge() != null) getBridge().getWebView().getSettings().setMinimumFontSize(1);
        // The software layer avoids repeated raster tiles on SwiftShader,
        // but can distort transformed seats on the Apple host GPU.
        boolean emulator = "ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE);
        if (getBridge() != null && emulator && !usesAppleHostGpu()) {
            getBridge().getWebView().setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        }
        updateOrientation(getResources().getConfiguration());
    }

    private static boolean usesAppleHostGpu() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.BAKLAVA) return false;
        EGLDisplay display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
        if (display == EGL14.EGL_NO_DISPLAY) return false;
        int[] version = new int[2];
        if (!EGL14.eglInitialize(display, version, 0, version, 1)) return false;
        EGLContext context = EGL14.EGL_NO_CONTEXT;
        EGLSurface surface = EGL14.EGL_NO_SURFACE;
        try {
            int[] configAttributes = {
                EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT,
                EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
                EGL14.EGL_NONE
            };
            EGLConfig[] configs = new EGLConfig[1];
            int[] count = new int[1];
            if (!EGL14.eglChooseConfig(display, configAttributes, 0, configs, 0, 1, count, 0)
                    || count[0] == 0) return false;
            int[] contextAttributes = {EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE};
            context = EGL14.eglCreateContext(display, configs[0], EGL14.EGL_NO_CONTEXT,
                    contextAttributes, 0);
            if (context == EGL14.EGL_NO_CONTEXT) return false;
            int[] surfaceAttributes = {EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE};
            surface = EGL14.eglCreatePbufferSurface(display, configs[0], surfaceAttributes, 0);
            if (surface == EGL14.EGL_NO_SURFACE
                    || !EGL14.eglMakeCurrent(display, surface, surface, context)) return false;
            String renderer = GLES20.glGetString(GLES20.GL_RENDERER);
            return renderer != null && renderer.contains("Apple")
                    && !renderer.contains("SwiftShader");
        } finally {
            if (EGL14.eglGetCurrentContext().equals(context) && context != EGL14.EGL_NO_CONTEXT) {
                EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE,
                        EGL14.EGL_NO_CONTEXT);
            }
            if (surface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, surface);
            if (context != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, context);
            EGL14.eglTerminate(display);
        }
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
