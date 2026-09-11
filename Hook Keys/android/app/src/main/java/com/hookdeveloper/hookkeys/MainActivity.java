package com.hookdeveloper.hookkeys;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HookKeysNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
