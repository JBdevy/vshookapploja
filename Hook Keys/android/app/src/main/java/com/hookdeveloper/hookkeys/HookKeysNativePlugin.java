package com.hookdeveloper.hookkeys;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.midi.MidiDevice;
import android.media.midi.MidiDeviceInfo;
import android.media.midi.MidiDeviceStatus;
import android.media.midi.MidiManager;
import android.media.midi.MidiOutputPort;
import android.media.midi.MidiReceiver;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.net.Uri;
import android.util.Base64;
import android.view.HapticFeedbackConstants;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.Permission;
import androidx.activity.result.ActivityResult;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(
    name = "HookKeysNative",
    permissions = {
        @Permission(
            alias = "bluetoothMidi",
            strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN }
        )
    }
)
public class HookKeysNativePlugin extends Plugin {
    private static final int MIDI_SLOT_COUNT = 3;
    private static final int MODULE_COUNT = 8;

    static {
        System.loadLibrary("hook_keys_native");
    }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final MidiDevice[] openDevices = new MidiDevice[MIDI_SLOT_COUNT];
    private final MidiOutputPort[] openPorts = new MidiOutputPort[MIDI_SLOT_COUNT];
    private final Map<Integer, UploadSession> uploads = new HashMap<>();
    private MidiManager midiManager;
    private String[] selectedDeviceIds = new String[MIDI_SLOT_COUNT];
    private int connectionGeneration = 0;
    private volatile boolean compatibilityMode = false;
    private int currentBufferSize = 128;

    private final MidiManager.DeviceCallback deviceCallback = new MidiManager.DeviceCallback() {
        @Override
        public void onDeviceAdded(MidiDeviceInfo device) {
            notifyMidiDevicesChanged();
        }

        @Override
        public void onDeviceRemoved(MidiDeviceInfo device) {
            notifyMidiDevicesChanged();
            reconnectSelectedDevices();
        }

        @Override
        public void onDeviceStatusChanged(MidiDeviceStatus status) {
            notifyMidiDevicesChanged();
        }
    };

    @Override
    public void load() {
        midiManager = (MidiManager) getContext().getSystemService(Context.MIDI_SERVICE);
        if (midiManager != null) midiManager.registerDeviceCallback(deviceCallback, mainHandler);
    }

    @Override
    protected void handleOnDestroy() {
        if (midiManager != null) midiManager.unregisterDeviceCallback(deviceCallback);
        closeMidiConnections();
        closeUploads();
        nativeStop();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        int bufferSize = Math.max(64, Math.min(512, call.getInt("bufferSize", 128)));
        currentBufferSize = bufferSize;
        if (!nativeStart(bufferSize)) {
            call.reject("Não foi possível iniciar o áudio nativo.");
            return;
        }
        reconnectSelectedDevices();
        JSObject result = new JSObject();
        result.put("ready", true);
        call.resolve(result);
    }

    @PluginMethod
    public void setAudioOutputDevice(PluginCall call) {
        String requestedId = call.getString("deviceId", "");
        int deviceId = 0;
        if (requestedId != null && !requestedId.isBlank()) {
            try { deviceId = Integer.parseInt(requestedId); }
            catch (NumberFormatException error) { call.reject("Dispositivo de áudio inválido."); return; }
        }
        currentBufferSize = Math.max(64, Math.min(512, call.getInt("bufferSize", currentBufferSize)));
        int channels = Math.max(1, Math.min(32, call.getInt("channels", 2)));
        boolean preserveEngine = Boolean.TRUE.equals(call.getBoolean("preserveEngine", false));
        if (nativeRestart(currentBufferSize, deviceId, channels, preserveEngine)) call.resolve();
        else call.reject("Não foi possível abrir o dispositivo de áudio selecionado.");
    }

    @PluginMethod
    public void audioOutputStatus(PluginCall call) {
        boolean ready = nativeAudioOutputReady();
        JSObject result = new JSObject();
        result.put("ready", ready);
        result.put("failed", !ready);
        call.resolve(result);
    }

    @PluginMethod
    public void setMidiInputEnabled(PluginCall call) {
        nativeSetMidiInputEnabled(call.getBoolean("enabled", false));
        call.resolve();
    }

    private static native boolean nativeBeginPresetTransition();
    private static native boolean nativeCommitPresetTransition();
    @PluginMethod
    public void commitPresetTransition(PluginCall call) {
        if (nativeCommitPresetTransition()) call.resolve();
        else call.reject("Não foi possível aplicar o novo preset.");
    }
    @PluginMethod
    public void beginPresetTransition(PluginCall call) {
        if (nativeBeginPresetTransition()) call.resolve();
        else call.reject("Não foi possível preparar o preset sem interromper as notas anteriores.");
    }

    @PluginMethod
    public void moduleMeterLevels(PluginCall call) {
        JSArray levels = new JSArray();
        for (float peak : nativeModuleMeterLevels()) levels.put((double) peak);
        JSObject result = new JSObject();
        result.put("levels", levels);
        call.resolve(result);
    }

    @PluginMethod
    public void moduleAnalysis(PluginCall call) {
        int moduleIndex = call.getInt("moduleIndex", -1);
        if (moduleIndex < 0 || moduleIndex >= 8) {
            call.reject("Módulo inválido.");
            return;
        }
        JSArray values = new JSArray();
        for (float value : nativeModuleAnalysis(moduleIndex)) values.put((double) value);
        JSObject result = new JSObject();
        result.put("values", values);
        call.resolve(result);
    }

    @PluginMethod
    public void listMidiDevices(PluginCall call) {
        // MIDI USB e MIDI virtual não podem depender da autorização de busca
        // Bluetooth. O sistema já expõe aqui somente endpoints disponíveis;
        // pedir BLUETOOTH_SCAN antes da enumeração fazia controladores com fio
        // desaparecerem quando essa permissão era negada.
        resolveMidiDevices(call);
    }

    private void resolveMidiDevices(PluginCall call) {
        JSArray devices = new JSArray();
        if (midiManager != null) {
            for (MidiDeviceInfo info : midiManager.getDevices()) {
                if (info.getOutputPortCount() <= 0) continue;
                JSObject device = new JSObject();
                device.put("id", Integer.toString(info.getId()));
                device.put("name", midiDeviceName(info));
                devices.put(device);
            }
        }
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    @PluginMethod
    public void listAudioOutputDevices(PluginCall call) {
        JSArray devices = new JSArray();
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null) {
            for (AudioDeviceInfo info : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
                int channels = 0;
                for (int count : info.getChannelCounts()) channels = Math.max(channels, count);
                if (channels <= 0) channels = 2;
                JSObject device = new JSObject();
                device.put("id", Integer.toString(info.getId()));
                CharSequence productName = info.getProductName();
                device.put("name", productName == null || productName.length() == 0 ? "Saída de áudio" : productName.toString());
                device.put("channels", Math.min(32, channels));
                devices.put(device);
            }
        }
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    @PluginMethod
    public void setMidiInputs(PluginCall call) {
        JSArray ids = call.getArray("deviceIds", new JSArray());
        String[] next = new String[MIDI_SLOT_COUNT];
        for (int index = 0; index < MIDI_SLOT_COUNT && index < ids.length(); index++) {
            try {
                String id = ids.getString(index);
                next[index] = id == null || id.isBlank() ? null : id;
            } catch (Exception ignored) {
                next[index] = null;
            }
        }
        selectedDeviceIds = next;
        reconnectSelectedDevices();
        call.resolve();
    }

    @PluginMethod
    public void performHaptic(PluginCall call) {
        final String strength = call.getString("strength", "light");
        getActivity().runOnUiThread(() -> {
            int feedback = "medium".equals(strength)
                ? HapticFeedbackConstants.LONG_PRESS
                : HapticFeedbackConstants.CLOCK_TICK;
            getActivity().getWindow().getDecorView().performHapticFeedback(feedback);
            call.resolve();
        });
    }

    @PluginMethod
    public void saveBackup(PluginCall call) {
        String content = call.getString("content");
        if (content == null || content.isEmpty()
                || content.getBytes(StandardCharsets.UTF_8).length > 1024 * 1024) {
            call.reject("O arquivo de backup é inválido ou muito grande.");
            return;
        }
        String fileName = safeBackupFileName(call.getString("fileName", "Hook Keys Backup.json"));
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        startActivityForResult(call, intent, "saveBackupResult");
    }

    @ActivityCallback
    private void saveBackupResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject response = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            response.put("saved", false);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData().getData();
        String content = call.getString("content");
        if (uri == null || content == null) {
            call.reject("O destino do backup é inválido.");
            return;
        }
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new IOException("Não foi possível abrir o arquivo selecionado.");
            output.write(content.getBytes(StandardCharsets.UTF_8));
            output.flush();
            response.put("saved", true);
            call.resolve(response);
        } catch (IOException error) {
            call.reject("Não foi possível salvar o backup.", error);
        }
    }

    private static String safeBackupFileName(String value) {
        String name = value == null ? "" : value.trim().replaceAll("(?i)\\.json$", "");
        name = name.replaceAll("[^A-Za-z0-9 _-]", "-").replaceAll("^[ _-]+|[ _-]+$", "");
        return (name.isEmpty() ? "Hook Keys Backup" : name) + ".json";
    }

    @PluginMethod
    public void configureModule(PluginCall call) {
        int moduleIndex = call.getInt("moduleIndex", -1);
        if (moduleIndex < 0 || moduleIndex >= MODULE_COUNT) {
            call.reject("Módulo inválido.");
            return;
        }
        boolean ok = nativeConfigureModule(
            moduleIndex,
            call.getBoolean("enabled", true),
            Math.max(0, Math.min(5, call.getInt("inputSlot", 3))),
            Math.max(0, Math.min(127, call.getInt("lowNote", 0))),
            Math.max(0, Math.min(127, call.getInt("highNote", 127))),
            Math.max(-3, Math.min(3, call.getInt("octave", 0))),
            call.getBoolean("sustain", true),
            call.getBoolean("modulation", true),
            call.getFloat("volumeDb", 0.0f),
            Math.max(1, Math.min(128, call.getInt("polyphony", 128))),
            Math.max(0, Math.min(127, call.getInt("velocityCurve0", 0))),
            Math.max(0, Math.min(127, call.getInt("velocityCurve1", 32))),
            Math.max(0, Math.min(127, call.getInt("velocityCurve2", 64))),
            Math.max(0, Math.min(127, call.getInt("velocityCurve3", 96))),
            Math.max(0, Math.min(127, call.getInt("velocityCurve4", 127))),
            Math.max(0, Math.min(31, call.getInt("outputChannelStart", 0))),
            call.getInt("outputChannelCount", 2) == 1 ? 1 : 2
        );
        if (ok) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void setModuleGain(PluginCall call) {
        int moduleIndex = call.getInt("moduleIndex", -1);
        if (moduleIndex < 0 || moduleIndex >= MODULE_COUNT) {
            call.reject("Módulo inválido.");
            return;
        }
        if (nativeSetModuleGain(moduleIndex, call.getFloat("db", 0.0f))) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void configureModuleEffects(PluginCall call) {
        int moduleIndex = call.getInt("moduleIndex", -1);
        if (moduleIndex < 0 || moduleIndex >= MODULE_COUNT) {
            call.reject("Módulo inválido.");
            return;
        }
        boolean ok = nativeConfigureModuleEffects(
            moduleIndex,
            call.getFloat("cutoffHz", 20000.0f),
            new int[] {
                call.getInt("cutoffVelocity0", 127), call.getInt("cutoffVelocity1", 127),
                call.getInt("cutoffVelocity2", 127), call.getInt("cutoffVelocity3", 127),
                call.getInt("cutoffVelocity4", 127)
            },
            intArray(call.getArray("eqTypes", new JSArray()), 5, 2),
            floatArray(call.getArray("eqFrequencies", new JSArray()), 5, 1000.0f),
            floatArray(call.getArray("eqGains", new JSArray()), 5, 0.0f),
            floatArray(call.getArray("eqQualities", new JSArray()), 5, 0.7071f),
            intArray(call.getArray("eqCutStages", new JSArray()), 5, 1),
            call.getFloat("compressorThresholdDb", -18.0f),
            call.getFloat("compressorRatio", 4.0f),
            call.getFloat("compressorAttackMs", 10.0f),
            call.getFloat("compressorReleaseMs", 160.0f),
            call.getFloat("compressorGainDb", 0.0f),
            call.getFloat("compressorMix", 1.0f),
            call.getBoolean("delaySync", false),
            call.getFloat("delayMs", 500.0f),
            call.getFloat("delayBeatMultiplier", 1.0f),
            call.getFloat("delayFeedback", 0.35f),
            call.getFloat("delayMix", 0.25f),
            call.getFloat("reverbDecay", 0.5f),
            call.getFloat("reverbDampen", 0.5f),
            call.getFloat("reverbSize", 0.6f),
            call.getFloat("reverbMix", 0.25f),
            call.getBoolean("rotaryEnabled", false),
            call.getInt("rotarySpeed", 1),
            call.getFloat("rotarySlowHz", 0.8f),
            call.getFloat("rotaryFastHz", 6.4f),
            call.getFloat("rotaryRampSeconds", 1.2f),
            call.getFloat("rotaryDepth", 0.7f),
            call.getFloat("rotaryMix", 1.0f),
            call.getBoolean("rotaryModulationEnabled", false)
        );
        if (ok) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void configureModuleEnvelope(PluginCall call) {
        boolean ok = nativeConfigureModuleEnvelope(
            call.getInt("moduleIndex", -1),
            call.getFloat("attackMs", 0.0f),
            call.getFloat("holdMs", 15000.0f),
            call.getFloat("decayMs", 25000.0f),
            call.getFloat("releaseMs", 300.0f),
            call.getFloat("glideMs", 0.0f)
        );
        if (ok) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void configureModuleModulation(PluginCall call) {
        int moduleIndex = call.getInt("moduleIndex", -1);
        if (moduleIndex < 0 || moduleIndex >= 8) {
            call.reject("Módulo inválido.");
            return;
        }
        if (nativeConfigureModuleModulation(
                moduleIndex, call.getBoolean("lfo", true), call.getFloat("rateHz", 6.85f))) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void configureVelocityLimits(PluginCall call) {
        int moduleIndex = call.getInt("moduleIndex", -1);
        if (moduleIndex < 0 || moduleIndex >= 8) {
            call.reject("Módulo inválido.");
            return;
        }
        if (nativeConfigureVelocityLimits(
                moduleIndex,
                Math.max(0, Math.min(127, call.getInt("ignoreAbove", 127))),
                Math.max(0, Math.min(127, call.getInt("ceiling", 127))),
                Math.max(0, Math.min(127, call.getInt("oscillator1Limit", 127))),
                Math.max(0, Math.min(127, call.getInt("oscillator2Limit", 127))))) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void configureGlide(PluginCall call) {
        int moduleIndex = call.getInt("moduleIndex", -1);
        if (moduleIndex < 0 || moduleIndex >= 8) {
            call.reject("Módulo inválido.");
            return;
        }
        if (nativeConfigureGlide(
                moduleIndex,
                Boolean.TRUE.equals(call.getBoolean("portamento", false)),
                Boolean.TRUE.equals(call.getBoolean("velocityGateEnabled", false)),
                Boolean.TRUE.equals(call.getBoolean("velocityGateInverted", false)),
                Math.max(0, Math.min(127, call.getInt("velocityThreshold", 64))))) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void configureSynth(PluginCall call) {
        boolean ok = nativeConfigureSynth(
            Math.max(0, Math.min(3, call.getInt("oscillator1", 1))),
            Math.max(0, Math.min(3, call.getInt("oscillator2", 2))),
            call.getBoolean("oscillator1Enabled", true),
            call.getBoolean("oscillator2Enabled", true),
            Math.max(0, Math.min(2, call.getInt("voiceMode", 1))),
            Math.max(0, Math.min(2, call.getInt("lfoTarget", 1))),
            call.getFloat("oscillator1Volume", 1.0f),
            call.getFloat("oscillator2Volume", 1.0f),
            call.getFloat("detuneCents", 7.0f),
            call.getFloat("attackMs", 0.0f),
            call.getFloat("holdMs", 15000.0f),
            call.getFloat("decayMs", 25000.0f),
            call.getFloat("sustain", 1.0f),
            call.getFloat("releaseMs", 300.0f),
            call.getFloat("filterCutoffHz", 20000.0f),
            call.getFloat("filterResonance", 0.18f),
            call.getFloat("filterEnvelope", 0.24f),
            call.getFloat("lfoRateHz", 4.0f),
            call.getFloat("lfoDepth", 0.0f),
            call.getFloat("glideMs", 45.0f),
            call.getInt("oscillator1Octave", 0),
            call.getInt("oscillator2Octave", 0)
        );
        if (ok) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void sendMidi(PluginCall call) {
        boolean ok = nativeSendMidi(
            Math.max(0, Math.min(5, call.getInt("inputSlot", 0))),
            call.getInt("status", 0),
            call.getInt("data1", 0),
            call.getInt("data2", 0),
            0L
        );
        if (ok) call.resolve();
        else call.reject("A fila MIDI não está disponível.");
    }

    @PluginMethod
    public void setTempo(PluginCall call) {
        if (nativeSetTempo(call.getFloat("bpm", 120.0f))) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void configureMetronome(PluginCall call) {
        boolean ok = nativeConfigureMetronome(
            call.getBoolean("enabled", false),
            call.getFloat("bpm", 120.0f),
            Math.max(0.0f, Math.min(1.0f, call.getFloat("volume", 1.0f))),
            Math.max(1, Math.min(3, call.getInt("clickSound", 1))),
            call.getBoolean("accentEnabled", false),
            call.getBoolean("doubleTimeEnabled", false),
            Math.max(1, Math.min(16, call.getInt("timeSignatureNumerator", 4)))
        );
        if (ok) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void setOutputGain(PluginCall call) {
        if (nativeSetOutputGain(call.getFloat("db", 0.0f), call.getBoolean("enabled", true))) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void setCompatibilityMode(PluginCall call) {
        compatibilityMode = call.getBoolean("enabled", false);
        nativeSetCompatibilityMode(compatibilityMode);
        call.resolve();
    }

    private static native void nativeSetCompatibilityMode(boolean enabled);

    @PluginMethod
    public void setSeamlessPresetSwitching(PluginCall call) {
        nativeSetSeamlessPresetSwitching(call.getBoolean("enabled", false));
        call.resolve();
    }

    private static native void nativeSetSeamlessPresetSwitching(boolean enabled);

    @PluginMethod
    public void stopAllNotes(PluginCall call) {
        nativeStopAllNotes();
        call.resolve();
    }

    @PluginMethod
    public synchronized void beginSoundFontUpload(PluginCall call) {
        int moduleIndex = call.getInt("moduleIndex", -1);
        if (moduleIndex < 0 || moduleIndex >= MODULE_COUNT) {
            call.reject("Módulo inválido.");
            return;
        }
        closeUpload(moduleIndex, true);
        File directory = new File(getContext().getFilesDir(), "soundfonts");
        if (!directory.exists() && !directory.mkdirs()) {
            call.reject("Não foi possível preparar o armazenamento do timbre.");
            return;
        }
        File temporary = new File(directory, "module-" + moduleIndex + ".sf2.part");
        String assetKey = call.getString("assetKey", "");
        if (assetKey == null || !assetKey.matches("[a-fA-F0-9]{64}")) {
            call.reject("Identificador de timbre inválido.");
            return;
        }
        File destination = new File(directory, "asset-" + assetKey + ".sf2");
        if (destination.exists()) {
            new Thread(() -> {
                if (nativeLoadSoundFont(moduleIndex, destination.getAbsolutePath())) {
                    JSObject result = new JSObject();
                    result.put("cached", true);
                    call.resolve(result);
                } else {
                    // Rebuild an incomplete/invalid cache from the original
                    // file instead of making every later selection fail.
                    synchronized (HookKeysNativePlugin.this) {
                        try {
                            uploads.put(moduleIndex, new UploadSession(temporary, destination, new FileOutputStream(temporary, false)));
                            JSObject result = new JSObject();
                            result.put("cached", false);
                            call.resolve(result);
                        } catch (IOException error) {
                            call.reject("Não foi possível iniciar o carregamento do timbre.", error);
                        }
                    }
                }
            }, "HookKeys-SF2-Cache").start();
            return;
        }
        try {
            uploads.put(moduleIndex, new UploadSession(temporary, destination, new FileOutputStream(temporary, false)));
            JSObject result = new JSObject();
            result.put("cached", false);
            call.resolve(result);
        } catch (IOException error) {
            call.reject("Não foi possível iniciar o carregamento do timbre.", error);
        }
    }

    @PluginMethod
    public synchronized void appendSoundFontChunk(PluginCall call) {
        int moduleIndex = call.getInt("moduleIndex", -1);
        UploadSession session = uploads.get(moduleIndex);
        String encoded = call.getString("base64", "");
        if (session == null || encoded.isEmpty()) {
            call.reject("Carregamento de timbre inválido.");
            return;
        }
        try {
            session.output.write(Base64.decode(encoded, Base64.NO_WRAP));
            call.resolve();
        } catch (IOException | IllegalArgumentException error) {
            closeUpload(moduleIndex, true);
            call.reject("Falha ao gravar o timbre.", error);
        }
    }

    @PluginMethod
    public synchronized void finishSoundFontUpload(PluginCall call) {
        int moduleIndex = call.getInt("moduleIndex", -1);
        UploadSession session = uploads.remove(moduleIndex);
        if (session == null) {
            call.reject("Nenhum timbre está sendo carregado.");
            return;
        }
        try {
            session.output.flush();
            session.output.close();
            if (session.destination.exists() && !session.destination.delete()) {
                throw new IOException("Falha ao substituir o timbre anterior.");
            }
            if (!session.temporary.renameTo(session.destination)) {
                throw new IOException("Falha ao finalizar o arquivo do timbre.");
            }
        } catch (IOException error) {
            session.temporary.delete();
            call.reject("Falha ao finalizar o timbre.", error);
            return;
        }
        new Thread(() -> {
            boolean loaded = nativeLoadSoundFont(moduleIndex, session.destination.getAbsolutePath());
            if (loaded) call.resolve();
            else call.reject("O arquivo SF2 não pôde ser carregado.");
        }, "HookKeys-SF2-Loader").start();
    }

    @PluginMethod
    public void cloneSoundFont(PluginCall call) {
        int sourceModuleIndex = call.getInt("sourceModuleIndex", -1);
        int targetModuleIndex = call.getInt("targetModuleIndex", -1);
        if (sourceModuleIndex < 0 || sourceModuleIndex >= 7 || targetModuleIndex < 0 ||
            targetModuleIndex >= 7 || sourceModuleIndex == targetModuleIndex) {
            call.reject("Módulos de timbre inválidos.");
            return;
        }
        new Thread(() -> {
            if (nativeCloneSoundFont(sourceModuleIndex, targetModuleIndex)) call.resolve();
            else call.reject("O timbre compartilhado não pôde ser preparado.");
        }, "HookKeys-SF2-Cloner").start();
    }

    private void notifyMidiDevicesChanged() {
        notifyListeners("midiDevicesChanged", new JSObject(), true);
    }

    private void reconnectSelectedDevices() {
        closeMidiConnections();
        final int generation = connectionGeneration;
        if (midiManager == null) return;
        Map<String, MidiDeviceInfo> available = new HashMap<>();
        for (MidiDeviceInfo info : midiManager.getDevices()) available.put(Integer.toString(info.getId()), info);
        for (int slot = 0; slot < MIDI_SLOT_COUNT; slot++) {
            MidiDeviceInfo info = available.get(selectedDeviceIds[slot]);
            if (info == null || info.getOutputPortCount() <= 0) continue;
            final int inputSlot = slot;
            midiManager.openDevice(info, device -> {
                if (generation != connectionGeneration || device == null ||
                    !Integer.toString(info.getId()).equals(selectedDeviceIds[inputSlot])) {
                    closeQuietly(device);
                    return;
                }
                MidiOutputPort port = device.openOutputPort(0);
                if (port == null) {
                    closeQuietly(device);
                    return;
                }
                openDevices[inputSlot] = device;
                openPorts[inputSlot] = port;
                port.connect(new HookKeysMidiReceiver(inputSlot, Integer.toString(info.getId())));
            }, mainHandler);
        }
    }

    private void closeMidiConnections() {
        connectionGeneration++;
        for (int slot = 0; slot < MIDI_SLOT_COUNT; slot++) {
            closeQuietly(openPorts[slot]);
            closeQuietly(openDevices[slot]);
            openPorts[slot] = null;
            openDevices[slot] = null;
        }
    }

    private void closeUploads() {
        for (Integer moduleIndex : new ArrayList<>(uploads.keySet())) closeUpload(moduleIndex, true);
    }

    private synchronized void closeUpload(int moduleIndex, boolean deleteTemporary) {
        UploadSession session = uploads.remove(moduleIndex);
        if (session == null) return;
        closeQuietly(session.output);
        if (deleteTemporary) session.temporary.delete();
    }

    private String midiDeviceName(MidiDeviceInfo info) {
        Object name = info.getProperties().get(MidiDeviceInfo.PROPERTY_NAME);
        Object manufacturer = info.getProperties().get(MidiDeviceInfo.PROPERTY_MANUFACTURER);
        String result = name == null ? "" : name.toString().trim();
        if (result.isEmpty() && manufacturer != null) result = manufacturer.toString().trim();
        return result.isEmpty() ? "Controlador MIDI" : result;
    }

    private static int[] intArray(JSArray source, int length, int fallback) {
        int[] result = new int[length];
        for (int index = 0; index < length; index++) result[index] = source.optInt(index, fallback);
        return result;
    }

    private static float[] floatArray(JSArray source, int length, float fallback) {
        float[] result = new float[length];
        for (int index = 0; index < length; index++) {
            result[index] = (float) source.optDouble(index, fallback);
        }
        return result;
    }

    private static void closeQuietly(AutoCloseable closeable) {
        if (closeable == null) return;
        try {
            closeable.close();
        } catch (Exception ignored) {}
    }

    private final class HookKeysMidiReceiver extends MidiReceiver {
        private final int inputSlot;
        private final String deviceId;
        private int runningStatus = 0;
        private int firstData = -1;

        HookKeysMidiReceiver(int inputSlot, String deviceId) {
            this.inputSlot = inputSlot;
            this.deviceId = deviceId;
        }

        @Override
        public void onSend(byte[] data, int offset, int count, long timestamp) {
            int end = Math.min(data.length, offset + count);
            for (int index = Math.max(0, offset); index < end; index++) parseByte(data[index] & 0xff, timestamp);
        }

        private void parseByte(int value, long timestamp) {
            if (value >= 0xf8) return;
            if ((value & 0x80) != 0) {
                runningStatus = value < 0xf0 ? value : 0;
                firstData = -1;
                return;
            }
            if (runningStatus == 0) return;
            int type = runningStatus & 0xf0;
            int required = type == 0xc0 || type == 0xd0 ? 1 : 2;
            if (required == 1) {
                dispatchMidi(runningStatus, value, 0, timestamp);
                return;
            }
            if (firstData < 0) {
                firstData = value;
                return;
            }
            dispatchMidi(runningStatus, firstData, value, timestamp);
            firstData = -1;
        }

        private void dispatchMidi(int status, int data1, int data2, long timestamp) {
            int type = status & 0xf0;
            boolean blockedCompatibilityCc = compatibilityMode && type == 0xb0 &&
                (data1 == 0 || data1 == 6 || data1 == 7 || data1 == 10 || data1 == 16 ||
                 data1 == 32 || data1 == 91 || data1 == 100 || data1 == 101);
            if (!blockedCompatibilityCc) nativeSendMidi(inputSlot, status, data1, data2, timestamp);
            if (type == 0x80 || type == 0x90) {
                JSObject event = new JSObject();
                event.put("channel", (status & 0x0f) + 1);
                event.put("inputId", deviceId);
                event.put("noteNumber", data1);
                event.put("velocity", type == 0x90 ? data2 : 0);
                notifyListeners("midiNote", event, false);
            } else if (type == 0xb0) {
                JSObject event = new JSObject();
                event.put("channel", (status & 0x0f) + 1);
                event.put("inputId", deviceId);
                event.put("controller", data1);
                event.put("value", data2);
                notifyListeners("midiControlChange", event, false);
            } else if (type == 0xe0) {
                JSObject event = new JSObject();
                event.put("channel", (status & 0x0f) + 1);
                event.put("inputId", deviceId);
                event.put("value", (data1 & 0x7f) | ((data2 & 0x7f) << 7));
                notifyListeners("midiPitchBend", event, false);
            }
        }
    }

    private static final class UploadSession {
        final File temporary;
        final File destination;
        final FileOutputStream output;

        UploadSession(File temporary, File destination, FileOutputStream output) {
            this.temporary = temporary;
            this.destination = destination;
            this.output = output;
        }
    }

    private static native boolean nativeStart(int bufferFrames);
    private static native boolean nativeRestart(
        int bufferFrames, int deviceId, int channels, boolean preserveEngine
    );
    private static native void nativeStop();
    private static native void nativeSetMidiInputEnabled(boolean enabled);
    private static native boolean nativeAudioOutputReady();
    private static native float[] nativeModuleMeterLevels();
    private static native float[] nativeModuleAnalysis(int moduleIndex);
    private static native boolean nativeLoadSoundFont(int moduleIndex, String path);
    private static native boolean nativeCloneSoundFont(int sourceModuleIndex, int targetModuleIndex);
    private static native boolean nativeSendMidi(int inputSlot, int status, int data1, int data2, long timestamp);
    private static native boolean nativeConfigureModule(
        int moduleIndex,
        boolean enabled,
        int inputSlot,
        int lowNote,
        int highNote,
        int octave,
        boolean sustain,
        boolean modulation,
        float volumeDb,
        int polyphony,
        int velocityCurve0,
        int velocityCurve1,
        int velocityCurve2,
        int velocityCurve3,
        int velocityCurve4,
        int outputChannelStart,
        int outputChannelCount
    );
    private static native boolean nativeSetModuleGain(int moduleIndex, float db);
    private static native boolean nativeConfigureModuleEffects(
        int moduleIndex,
        float cutoffHz,
        int[] cutoffVelocity,
        int[] eqTypes,
        float[] eqFrequencies,
        float[] eqGains,
        float[] eqQualities,
        int[] eqCutStages,
        float compressorThresholdDb,
        float compressorRatio,
        float compressorAttackMs,
        float compressorReleaseMs,
        float compressorGainDb,
        float compressorMix,
        boolean delaySync,
        float delayMs,
        float delayBeatMultiplier,
        float delayFeedback,
        float delayMix,
        float reverbDecay,
        float reverbDampen,
        float reverbSize,
        float reverbMix, boolean rotaryEnabled, int rotarySpeed,
        float rotarySlowHz, float rotaryFastHz, float rotaryRampSeconds,
        float rotaryDepth, float rotaryMix, boolean rotaryModulationEnabled
    );
    private static native boolean nativeConfigureModuleEnvelope(
        int moduleIndex, float attackMs, float holdMs, float decayMs, float releaseMs, float glideMs
    );
    private static native boolean nativeConfigureModuleModulation(int moduleIndex, boolean lfo, float rateHz);
    private static native boolean nativeConfigureVelocityLimits(
        int moduleIndex, int ignoreAbove, int ceiling, int oscillator1Limit, int oscillator2Limit
    );
    private static native boolean nativeConfigureGlide(
        int moduleIndex, boolean portamento, boolean velocityGateEnabled,
        boolean velocityGateInverted, int velocityThreshold
    );
    private static native boolean nativeConfigureSynth(
        int oscillator1, int oscillator2, boolean oscillator1Enabled,
        boolean oscillator2Enabled, int voiceMode, int lfoTarget,
        float oscillator1Volume, float oscillator2Volume, float detuneCents, float attackMs, float holdMs,
        float decayMs, float sustain, float releaseMs, float filterCutoffHz,
        float filterResonance, float filterEnvelope, float lfoRateHz,
        float lfoDepth, float glideMs, int oscillator1Octave, int oscillator2Octave
    );
    private static native boolean nativeSetTempo(float bpm);
    private static native boolean nativeConfigureTranceGate(int moduleIndex, boolean enabled, int steps,
        int length, float beatMultiplier, float gate, float depth, float attackMs, float releaseMs, float swing);

    @PluginMethod
    public void configureTranceGate(PluginCall call) {
        boolean ok = nativeConfigureTranceGate(call.getInt("moduleIndex", -1), call.getBoolean("enabled", false),
            call.getInt("steps", 65535), call.getInt("length", 16), call.getFloat("beatMultiplier", 0.25f),
            call.getFloat("gate", 0.5f), call.getFloat("depth", 1.0f), call.getFloat("attackMs", 3.0f),
            call.getFloat("releaseMs", 3.0f), call.getFloat("swing", 0.0f));
        if (ok) call.resolve(); else call.reject("Não foi possível configurar o Trance Gate.");
    }
    private static native boolean nativeConfigureMetronome(
        boolean enabled, float bpm, float volume, int clickSound,
        boolean accentEnabled, boolean doubleTimeEnabled, int timeSignatureNumerator
    );
    private static native boolean nativeSetOutputGain(float db, boolean enabled);
    private static native void nativeStopAllNotes();
}
