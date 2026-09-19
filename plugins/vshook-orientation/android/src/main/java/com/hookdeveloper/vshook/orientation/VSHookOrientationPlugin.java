package com.hookdeveloper.vshook.orientation;

import android.content.pm.ActivityInfo;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Mantém o telefone em retrato e libera os dois lados da paisagem no Tablet. */
@CapacitorPlugin(name = "VSHookOrientation")
public class VSHookOrientationPlugin extends Plugin {

    @PluginMethod
    public void setMode(PluginCall call) {
        final boolean tablet = "tablet".equals(call.getString("mode", "phone"));
        getActivity().runOnUiThread(() -> {
            // SENSOR_LANDSCAPE aceita 90° e 270°. SCREEN_ORIENTATION_LANDSCAPE,
            // usado pelo plugin padrão, prende a Activity em apenas um deles.
            getActivity().setRequestedOrientation(
                tablet
                    ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            );
            call.resolve();
        });
    }
}
