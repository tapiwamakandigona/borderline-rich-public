package com.borderlinerich.game;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Full-screen game shell. The SystemBars plugin hides the status and navigation bars at start
 * (capacitor.config.ts); here a swipe from the edge shows them only transiently, and they are
 * hidden again whenever the game window regains focus (after a dialog or an app switch).
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bars().setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) bars().hide(WindowInsetsCompat.Type.systemBars());
    }

    private WindowInsetsControllerCompat bars() {
        return WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    }
}
