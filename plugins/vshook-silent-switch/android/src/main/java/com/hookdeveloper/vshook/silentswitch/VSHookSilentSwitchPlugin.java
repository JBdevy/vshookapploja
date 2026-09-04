package com.hookdeveloper.vshook.silentswitch;

import android.content.Context;
import android.media.AudioManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Le o modo de toque do aparelho. No Android o proprio sistema separa os tres
 * estados, entao nao ha truque nenhum: silencioso nao faz nada, vibrar so
 * vibra e normal libera som e vibracao.
 */
@CapacitorPlugin(name = "VSHookSilentSwitch")
public class VSHookSilentSwitchPlugin extends Plugin {

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        try {
            AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) {
                result.put("mode", "normal");
                result.put("supported", false);
                call.resolve(result);
                return;
            }
            int ringerMode = audio.getRingerMode();
            String mode = "normal";
            if (ringerMode == AudioManager.RINGER_MODE_SILENT) mode = "silent";
            else if (ringerMode == AudioManager.RINGER_MODE_VIBRATE) mode = "vibrate";
            result.put("mode", mode);
            result.put("supported", true);
        } catch (Exception error) {
            result.put("mode", "normal");
            result.put("supported", false);
        }
        call.resolve(result);
    }
}
