import Foundation
import Capacitor
import AVFAudio
import UIKit

@objc(HookKeysNativePlugin)
public final class HookKeysNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HookKeysNativePlugin"
    public let jsName = "HookKeysNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listMidiDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listAudioOutputDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAudioOutputDevice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMidiInputs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureModule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureModuleEffects", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureModuleEnvelope", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureSynth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendMidi", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTempo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureMetronome", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOutputGain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCompatibilityMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAllNotes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "performHaptic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginSoundFontUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendSoundFontChunk", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishSoundFontUpload", returnType: CAPPluginReturnPromise)
    ]

    private let engine = HookKeysNativeEngine()
    private let soundfontQueue = DispatchQueue(label: "com.hookdeveloper.hookkeys.soundfonts", qos: .userInitiated)
    private var uploads: [Int: (handle: FileHandle, temporary: URL, destination: URL)] = [:]

    public override func load() {
        engine.onMidiNote = { [weak self] _, deviceId, channel, note, velocity in
            self?.notifyListeners("midiNote", data: [
                "inputId": deviceId, "channel": channel,
                "noteNumber": note, "velocity": velocity
            ])
        }
        engine.onMidiControl = { [weak self] _, deviceId, channel, controller, value in
            self?.notifyListeners("midiControlChange", data: [
                "inputId": deviceId, "channel": channel,
                "controller": controller, "value": value
            ])
        }
        engine.onMidiDevicesChanged = { [weak self] in
            self?.notifyListeners("midiDevicesChanged", data: [:])
        }
        engine.onMidiPitch = { [weak self] _, deviceId, channel, value in
            self?.notifyListeners("midiPitchBend", data: [
                "inputId": deviceId, "channel": channel, "value": value
            ])
        }
    }

    deinit {
        engine.stop()
        for (_, upload) in uploads { try? upload.handle.close() }
    }

    @objc func initialize(_ call: CAPPluginCall) {
        if engine.start(withBufferFrames: call.getInt("bufferSize", 128)) {
            call.resolve(["ready": true])
        } else {
            call.reject("Não foi possível iniciar o áudio nativo.")
        }
    }

    @objc func listMidiDevices(_ call: CAPPluginCall) {
        call.resolve(["devices": engine.listMidiDevices()])
    }

    @objc func listAudioOutputDevices(_ call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        let maximum = max(1, min(32, session.maximumOutputNumberOfChannels))
        let devices: [[String: Any]] = session.currentRoute.outputs.map { output in
            let channelCount = output.channels?.count ?? maximum
            return [
                "id": output.uid,
                "name": output.portName,
                "channels": max(1, min(32, channelCount))
            ]
        }
        call.resolve(["devices": devices])
    }

    @objc func setAudioOutputDevice(_ call: CAPPluginCall) {
        let ok = engine.setAudioOutputDeviceId(
            call.getString("deviceId", ""),
            channels: min(32, max(1, call.getInt("channels", 2))),
            bufferFrames: min(512, max(32, call.getInt("bufferSize", 128)))
        )
        if ok { call.resolve() } else { call.reject("Não foi possível abrir o dispositivo de áudio selecionado.") }
    }

    @objc func setMidiInputs(_ call: CAPPluginCall) {
        engine.setMidiDeviceIds(call.getArray("deviceIds", []))
        call.resolve()
    }

    @objc func configureModule(_ call: CAPPluginCall) {
        let ok = engine.configureModule(
            call.getInt("moduleIndex", -1),
            enabled: call.getBool("enabled", true),
            inputSlot: call.getInt("inputSlot", 3),
            lowNote: call.getInt("lowNote", 0),
            highNote: call.getInt("highNote", 127),
            octave: call.getInt("octave", 0),
            sustain: call.getBool("sustain", true),
            modulation: call.getBool("modulation", true),
            volumeDb: call.getFloat("volumeDb", 0),
            polyphony: min(128, max(1, call.getInt("polyphony", 64))),
            velocityCurve0: min(127, max(0, call.getInt("velocityCurve0", 0))),
            velocityCurve1: min(127, max(0, call.getInt("velocityCurve1", 32))),
            velocityCurve2: min(127, max(0, call.getInt("velocityCurve2", 64))),
            velocityCurve3: min(127, max(0, call.getInt("velocityCurve3", 96))),
            velocityCurve4: min(127, max(0, call.getInt("velocityCurve4", 127))),
            outputChannelStart: min(31, max(0, call.getInt("outputChannelStart", 0))),
            outputChannelCount: call.getInt("outputChannelCount", 2) == 1 ? 1 : 2
        )
        if ok { call.resolve() } else { call.reject("O motor ainda não foi inicializado.") }
    }

    @objc func sendMidi(_ call: CAPPluginCall) {
        let ok = engine.sendMidi(
            fromSlot: call.getInt("inputSlot", 0),
            status: call.getInt("status", 0),
            data1: call.getInt("data1", 0),
            data2: call.getInt("data2", 0),
            timestamp: 0
        )
        if ok { call.resolve() } else { call.reject("A fila MIDI não está disponível.") }
    }

    @objc func configureModuleEffects(_ call: CAPPluginCall) {
        let ok = engine.configureModuleEffects(
            call.getInt("moduleIndex", -1),
            cutoffHz: call.getFloat("cutoffHz", 20_000),
            eqTypes: call.getArray("eqTypes", []).compactMap { $0 as? NSNumber },
            eqFrequencies: call.getArray("eqFrequencies", []).compactMap { $0 as? NSNumber },
            eqGains: call.getArray("eqGains", []).compactMap { $0 as? NSNumber },
            eqQualities: call.getArray("eqQualities", []).compactMap { $0 as? NSNumber },
            eqCutStages: call.getArray("eqCutStages", []).compactMap { $0 as? NSNumber },
            compressorThresholdDb: call.getFloat("compressorThresholdDb", -18),
            compressorRatio: call.getFloat("compressorRatio", 4),
            compressorAttackMs: call.getFloat("compressorAttackMs", 10),
            compressorReleaseMs: call.getFloat("compressorReleaseMs", 160),
            compressorGainDb: call.getFloat("compressorGainDb", 0),
            compressorMix: call.getFloat("compressorMix", 1),
            delaySync: call.getBool("delaySync", false),
            delayMs: call.getFloat("delayMs", 500),
            delayBeatMultiplier: call.getFloat("delayBeatMultiplier", 1),
            delayFeedback: call.getFloat("delayFeedback", 0.35),
            delayMix: call.getFloat("delayMix", 0.25),
            reverbDecay: call.getFloat("reverbDecay", 0.5),
            reverbDampen: call.getFloat("reverbDampen", 0.5),
            reverbSize: call.getFloat("reverbSize", 0.6),
            reverbMix: call.getFloat("reverbMix", 0.25),
            rotaryEnabled: call.getBool("rotaryEnabled", false),
            rotarySpeed: call.getInt("rotarySpeed", 1),
            rotarySlowHz: call.getFloat("rotarySlowHz", 0.8),
            rotaryFastHz: call.getFloat("rotaryFastHz", 6.4),
            rotaryRampSeconds: call.getFloat("rotaryRampSeconds", 1.2),
            rotaryDepth: call.getFloat("rotaryDepth", 0.7),
            rotaryMix: call.getFloat("rotaryMix", 1),
            rotaryModulationEnabled: call.getBool("rotaryModulationEnabled", false)
        )
        if ok { call.resolve() } else { call.reject("O motor ainda não foi inicializado.") }
    }

    @objc func configureModuleEnvelope(_ call: CAPPluginCall) {
        let ok = engine.configureModuleEnvelope(
            call.getInt("moduleIndex", -1),
            attackMs: call.getFloat("attackMs", 0),
            holdMs: call.getFloat("holdMs", 15000),
            decayMs: call.getFloat("decayMs", 25000),
            releaseMs: call.getFloat("releaseMs", 90)
        )
        if ok { call.resolve() } else { call.reject("O motor ainda não foi inicializado.") }
    }

    @objc func configureSynth(_ call: CAPPluginCall) {
        let ok = engine.configureSynth(
            call.getInt("oscillator1", 1),
            oscillator2: call.getInt("oscillator2", 2),
            oscillator1Enabled: call.getBool("oscillator1Enabled", true),
            oscillator2Enabled: call.getBool("oscillator2Enabled", true),
            voiceMode: call.getInt("voiceMode", 1),
            lfoTarget: call.getInt("lfoTarget", 0),
            oscillator1Volume: call.getFloat("oscillator1Volume", 1),
            oscillator2Volume: call.getFloat("oscillator2Volume", 1),
            detuneCents: call.getFloat("detuneCents", 7),
            attackMs: call.getFloat("attackMs", 0),
            holdMs: call.getFloat("holdMs", 15_000),
            decayMs: call.getFloat("decayMs", 25_000),
            sustain: call.getFloat("sustain", 1),
            releaseMs: call.getFloat("releaseMs", 90),
            filterCutoffHz: call.getFloat("filterCutoffHz", 20_000),
            filterResonance: call.getFloat("filterResonance", 0.12),
            filterEnvelope: call.getFloat("filterEnvelope", 0.35),
            lfoRateHz: call.getFloat("lfoRateHz", 4.5),
            lfoDepth: call.getFloat("lfoDepth", 0),
            glideMs: call.getFloat("glideMs", 80),
            oscillator1Octave: call.getInt("oscillator1Octave", 0),
            oscillator2Octave: call.getInt("oscillator2Octave", 0)
        )
        if ok { call.resolve() } else { call.reject("O motor ainda não foi inicializado.") }
    }

    @objc func setTempo(_ call: CAPPluginCall) {
        if engine.setTempo(call.getFloat("bpm", 120)) {
            call.resolve()
        } else {
            call.reject("O motor ainda não foi inicializado.")
        }
    }

    @objc func configureMetronome(_ call: CAPPluginCall) {
        let ok = engine.configureMetronomeEnabled(
            call.getBool("enabled", false),
            bpm: call.getFloat("bpm", 120),
            volume: min(1, max(0, call.getFloat("volume", 1))),
            clickSound: min(3, max(1, call.getInt("clickSound", 1))),
            accentEnabled: call.getBool("accentEnabled", false),
            doubleTimeEnabled: call.getBool("doubleTimeEnabled", false),
            timeSignatureNumerator: min(16, max(1, call.getInt("timeSignatureNumerator", 4)))
        )
        if ok { call.resolve() } else { call.reject("O motor ainda não foi inicializado.") }
    }

    @objc func stopAllNotes(_ call: CAPPluginCall) {
        engine.stopAllNotes()
        call.resolve()
    }

    @objc func performHaptic(_ call: CAPPluginCall) {
        let style: UIImpactFeedbackGenerator.FeedbackStyle = call.getString("strength", "light") == "medium" ? .medium : .light
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.prepare()
        generator.impactOccurred()
        call.resolve()
    }

    @objc func setOutputGain(_ call: CAPPluginCall) {
        if engine.setOutputGainDb(call.getFloat("db", 0), enabled: call.getBool("enabled", true)) {
            call.resolve()
        } else {
            call.reject("O motor ainda não foi inicializado.")
        }
    }

    @objc func setCompatibilityMode(_ call: CAPPluginCall) {
        engine.setCompatibilityMode(call.getBool("enabled", false))
        call.resolve()
    }

    @objc func beginSoundFontUpload(_ call: CAPPluginCall) {
        let moduleIndex = call.getInt("moduleIndex", -1)
        guard (0..<8).contains(moduleIndex) else { call.reject("Módulo inválido."); return }
        do {
            let directory = try soundfontDirectory()
            let temporary = directory.appendingPathComponent("module-\(moduleIndex).sf2.part")
            let destination = directory.appendingPathComponent("module-\(moduleIndex).sf2")
            if let old = uploads.removeValue(forKey: moduleIndex) { try? old.handle.close() }
            FileManager.default.createFile(atPath: temporary.path, contents: nil)
            uploads[moduleIndex] = (try FileHandle(forWritingTo: temporary), temporary, destination)
            call.resolve()
        } catch { call.reject("Não foi possível iniciar o carregamento do timbre.", nil, error) }
    }

    @objc func appendSoundFontChunk(_ call: CAPPluginCall) {
        let moduleIndex = call.getInt("moduleIndex", -1)
        guard let encoded = call.getString("base64"), let data = Data(base64Encoded: encoded),
              let upload = uploads[moduleIndex] else {
            call.reject("Carregamento de timbre inválido."); return
        }
        do { try upload.handle.write(contentsOf: data); call.resolve() }
        catch { call.reject("Falha ao gravar o timbre.", nil, error) }
    }

    @objc func finishSoundFontUpload(_ call: CAPPluginCall) {
        let moduleIndex = call.getInt("moduleIndex", -1)
        guard let upload = uploads.removeValue(forKey: moduleIndex) else {
            call.reject("Nenhum timbre está sendo carregado."); return
        }
        soundfontQueue.async { [weak self] in
            do {
                try upload.handle.close()
                if FileManager.default.fileExists(atPath: upload.destination.path) {
                    try FileManager.default.removeItem(at: upload.destination)
                }
                try FileManager.default.moveItem(at: upload.temporary, to: upload.destination)
                guard self?.engine.loadSoundFont(atPath: upload.destination.path, moduleIndex: moduleIndex) == true else {
                    throw NSError(domain: "HookKeysNative", code: 2,
                                  userInfo: [NSLocalizedDescriptionKey: "O arquivo SF2 não pôde ser carregado."])
                }
                DispatchQueue.main.async { call.resolve() }
            } catch {
                try? FileManager.default.removeItem(at: upload.temporary)
                DispatchQueue.main.async { call.reject("Falha ao finalizar o timbre.", nil, error) }
            }
        }
    }

    private func soundfontDirectory() throws -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let directory = base.appendingPathComponent("SoundFonts", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
}
