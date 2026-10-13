package io.github.jessiezjz.noirpoker;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The emulator compositor can repeat WebView raster tiles. Use a
        // software layer on virtual hardware; phones keep hardware acceleration.
        if (getBridge() != null && ("ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE))) {
            getBridge().getWebView().setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        }
        updateOrientation(getResources().getConfiguration());
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
