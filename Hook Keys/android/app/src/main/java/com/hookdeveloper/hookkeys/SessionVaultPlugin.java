package com.hookdeveloper.hookkeys;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Guarda a sessão (token + conta) em SharedPreferences próprias, fora do
// localStorage da WebView: com allowBackup="true" no manifesto, o Android
// inclui essas preferências no backup automático da conta Google e restaura
// no reinstall, no mesmo aparelho ou em outro com a mesma conta.
@CapacitorPlugin(name = "SessionVault")
public class SessionVaultPlugin extends Plugin {
    private static final String PREFS_NAME = "com.hookdeveloper.hookkeys.session";
    private static final String KEY = "session";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void read(PluginCall call) {
        String value = prefs().getString(KEY, null);
        JSObject result = new JSObject();
        result.put("value", value);
        call.resolve(result);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String value = call.getString("value");
        if (value == null) {
            call.reject("value ausente");
            return;
        }
        prefs().edit().putString(KEY, value).apply();
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        prefs().edit().remove(KEY).apply();
        call.resolve();
    }
}
