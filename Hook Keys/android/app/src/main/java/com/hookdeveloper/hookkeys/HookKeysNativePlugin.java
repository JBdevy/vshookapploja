package com.hookdeveloper.hookkeys;

import android.content.Context;
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
import android.util.Base64;
import android.view.HapticFeedbackConstants;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "HookKeysNative")
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
    public void listMidiDevices(PluginCall call) {
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
    public void configureModule(PluginCall call) {
        int moduleIndex = call.getInt("moduleIndex", -1);
        if (moduleIndex < 0 || moduleIndex >= MODULE_COUNT) {
            call.reject("Módulo inválido.");
            return;
        }
        boolean ok = nativeConfigureModule(
            moduleIndex,
            call.getBoolean("enabled", true),
            Math.max(0, Math.min(3, call.getInt("inputSlot", 3))),
            Math.max(0, Math.min(127, call.getInt("lowNote", 0))),
            Math.max(0, Math.min(127, call.getInt("highNote", 127))),
            Math.max(-3, Math.min(3, call.getInt("octave", 0))),
            call.getBoolean("sustain", true),
            call.getBoolean("modulation", true),
            call.getFloat("volumeDb", 0.0f)
        );
        if (ok) call.resolve();
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
            call.getFloat("reverbMix", 0.25f)
        );
        if (ok) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void configureModuleEnvelope(PluginCall call) {
        boolean ok = nativeConfigureModuleEnvelope(
            call.getInt("moduleIndex", -1),
            call.getFloat("attackMs", 0.0f),
            call.getFloat("holdMs", 0.0f),
            call.getFloat("decayMs", 0.0f),
            call.getFloat("releaseMs", 0.0f)
        );
        if (ok) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void sendMidi(PluginCall call) {
        boolean ok = nativeSendMidi(
            Math.max(0, Math.min(2, call.getInt("inputSlot", 0))),
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
    public void setOutputGain(PluginCall call) {
        if (nativeSetOutputGain(call.getFloat("db", 0.0f), call.getBoolean("enabled", true))) call.resolve();
        else call.reject("O motor ainda não foi inicializado.");
    }

    @PluginMethod
    public void setCompatibilityMode(PluginCall call) {
        compatibilityMode = call.getBoolean("enabled", false);
        call.resolve();
    }

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
        File destination = new File(directory, "module-" + moduleIndex + ".sf2");
        try {
            uploads.put(moduleIndex, new UploadSession(temporary, destination, new FileOutputStream(temporary, false)));
            call.resolve();
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
                 data1 == 32 || data1 == 100 || data1 == 101);
            if (!blockedCompatibilityCc) nativeSendMidi(inputSlot, status, data1, data2, timestamp);
            if (type == 0x80 || type == 0x90) {
                JSObject event = new JSObject();
                event.put("channel", (status & 0x0f) + 1);
                event.put("inputId", deviceId);
                event.put("noteNumber", data1);
                event.put("velocity", type == 0x90 ? data2 : 0);
                notifyListeners("midiNote", event, true);
            } else if (type == 0xb0) {
                JSObject event = new JSObject();
                event.put("channel", (status & 0x0f) + 1);
                event.put("inputId", deviceId);
                event.put("controller", data1);
                event.put("value", data2);
                notifyListeners("midiControlChange", event, true);
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
    private static native void nativeStop();
    private static native boolean nativeLoadSoundFont(int moduleIndex, String path);
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
        float volumeDb
    );
    private static native boolean nativeConfigureModuleEffects(
        int moduleIndex,
        float cutoffHz,
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
        float reverbMix
    );
    private static native boolean nativeConfigureModuleEnvelope(
        int moduleIndex, float attackMs, float holdMs, float decayMs, float releaseMs
    );
    private static native boolean nativeSetTempo(float bpm);
    private static native boolean nativeSetOutputGain(float db, boolean enabled);
    private static native void nativeStopAllNotes();
}
