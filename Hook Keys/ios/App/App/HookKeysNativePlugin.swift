import Foundation
import Capacitor
import AVFAudio
import UIKit
import UniformTypeIdentifiers

@objc(HookKeysNativePlugin)
public final class HookKeysNativePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "HookKeysNativePlugin"
    public let jsName = "HookKeysNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listMidiDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listAudioOutputDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAudioOutputDevice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "audioOutputStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMidiInputEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "moduleMeterLevels", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "moduleAnalysis", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMidiInputs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureModule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setModuleGain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureModuleEffects", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureTranceGate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginPresetTransition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "commitPresetTransition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureModuleEnvelope", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureModuleModulation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureGlide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureVelocityLimits", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureSynth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendMidi", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTempo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureMetronome", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOutputGain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCompatibilityMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSeamlessPresetSwitching", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAllNotes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "performHaptic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginSoundFontUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendSoundFontChunk", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishSoundFontUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cloneSoundFont", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveBackup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fileBrowserRoots", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addFileBrowserFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeFileBrowserFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listFileBrowserDirectory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importFileBrowserFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releaseFileBrowserImport", returnType: CAPPluginReturnPromise)
    ]

    private let engine = HookKeysNativeEngine()
    private let soundfontQueue = DispatchQueue(label: "com.hookdeveloper.hookkeys.soundfonts", qos: .userInitiated)
    private var uploads: [Int: (handle: FileHandle, temporary: URL, destination: URL)] = [:]
    private var pendingBackupExport: (call: CAPPluginCall, temporary: URL)?

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
            bufferFrames: min(512, max(32, call.getInt("bufferSize", 128))),
            preserveEngine: call.getBool("preserveEngine", false)
        )
        if ok { call.resolve() } else { call.reject("Não foi possível abrir o dispositivo de áudio selecionado.") }
    }

    @objc func audioOutputStatus(_ call: CAPPluginCall) {
        let ready = engine.audioOutputReady()
        call.resolve(["ready": ready, "failed": !ready])
    }

    @objc func setMidiInputEnabled(_ call: CAPPluginCall) {
        engine.setMidiInputEnabled(call.getBool("enabled", false))
        call.resolve()
    }

    @objc func moduleMeterLevels(_ call: CAPPluginCall) {
        call.resolve(["levels": engine.moduleMeterLevels()])
    }

    @objc func moduleAnalysis(_ call: CAPPluginCall) {
        let moduleIndex = call.getInt("moduleIndex", -1)
        guard moduleIndex >= 0 && moduleIndex < 8 else {
            call.reject("Módulo inválido.")
            return
        }
        call.resolve(["values": engine.moduleAnalysis(moduleIndex)])
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
            polyphony: min(128, max(1, call.getInt("polyphony", 128))),
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

    @objc func setModuleGain(_ call: CAPPluginCall) {
        let ok = engine.setModuleGainDb(
            call.getFloat("db", 0),
            moduleIndex: call.getInt("moduleIndex", -1)
        )
        if ok { call.resolve() } else { call.reject("O motor ainda não foi inicializado.") }
    }

    @objc func beginPresetTransition(_ call: CAPPluginCall) {
        if engine.beginPresetTransition() { call.resolve() }
        else { call.reject("Não foi possível preparar o preset sem interromper as notas anteriores.") }
    }

    @objc func commitPresetTransition(_ call: CAPPluginCall) {
        if engine.commitPresetTransition() { call.resolve() }
        else { call.reject("Não foi possível aplicar o novo preset.") }
    }

    @objc func configureTranceGate(_ call: CAPPluginCall) {
        let ok = engine.configureTranceGate(call.getInt("moduleIndex", -1), enabled: call.getBool("enabled", false),
            steps: call.getInt("steps", 65535), length: call.getInt("length", 16),
            beatMultiplier: call.getFloat("beatMultiplier", 0.25), gate: call.getFloat("gate", 0.5),
            depth: call.getFloat("depth", 1), attackMs: call.getFloat("attackMs", 3),
            releaseMs: call.getFloat("releaseMs", 3), swing: call.getFloat("swing", 0))
        if ok { call.resolve() } else { call.reject("Não foi possível configurar o Trance Gate.") }
    }

    @objc func configureModuleEffects(_ call: CAPPluginCall) {
        let ok = engine.configureModuleEffects(
            call.getInt("moduleIndex", -1),
            cutoffHz: call.getFloat("cutoffHz", 20_000),
            cutoffVelocity: [
                call.getInt("cutoffVelocity0", 127), call.getInt("cutoffVelocity1", 127),
                call.getInt("cutoffVelocity2", 127), call.getInt("cutoffVelocity3", 127),
                call.getInt("cutoffVelocity4", 127)
            ].map { NSNumber(value: $0) },
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
            releaseMs: call.getFloat("releaseMs", 300),
            glideMs: call.getFloat("glideMs", 0)
        )
        if ok { call.resolve() } else { call.reject("O motor ainda não foi inicializado.") }
    }

    @objc func configureModuleModulation(_ call: CAPPluginCall) {
        let moduleIndex = call.getInt("moduleIndex", -1)
        guard moduleIndex >= 0 && moduleIndex < 8 else {
            call.reject("Módulo inválido.")
            return
        }
        if engine.configureModuleModulation(
            moduleIndex, lfo: call.getBool("lfo", true), rateHz: call.getFloat("rateHz", 6.85)
        ) { call.resolve() }
        else { call.reject("O motor ainda não foi inicializado.") }
    }

    @objc func configureVelocityLimits(_ call: CAPPluginCall) {
        let moduleIndex = call.getInt("moduleIndex", -1)
        guard moduleIndex >= 0 && moduleIndex < 8 else {
            call.reject("Módulo inválido.")
            return
        }
        if engine.configureVelocityLimits(
            moduleIndex,
            ignoreAbove: min(127, max(0, call.getInt("ignoreAbove", 127))),
            ceiling: min(127, max(0, call.getInt("ceiling", 127))),
            oscillator1Limit: min(127, max(0, call.getInt("oscillator1Limit", 127))),
            oscillator2Limit: min(127, max(0, call.getInt("oscillator2Limit", 127)))
        ) { call.resolve() }
        else { call.reject("O motor ainda não foi inicializado.") }
    }

    @objc func configureGlide(_ call: CAPPluginCall) {
        let moduleIndex = call.getInt("moduleIndex", -1)
        guard moduleIndex >= 0 && moduleIndex < 8 else {
            call.reject("Módulo inválido.")
            return
        }
        if engine.configureGlide(
            moduleIndex,
            portamento: call.getBool("portamento", false),
            velocityGateEnabled: call.getBool("velocityGateEnabled", false),
            velocityGateInverted: call.getBool("velocityGateInverted", false),
            velocityThreshold: min(127, max(0, call.getInt("velocityThreshold", 64)))
        ) { call.resolve() }
        else { call.reject("O motor ainda não foi inicializado.") }
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
            releaseMs: call.getFloat("releaseMs", 300),
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

    @objc func saveBackup(_ call: CAPPluginCall) {
        guard pendingBackupExport == nil else {
            call.reject("Já existe um backup aguardando destino.")
            return
        }
        guard let content = call.getString("content"), !content.isEmpty,
              let data = content.data(using: .utf8), data.count <= 1024 * 1024 else {
            call.reject("O arquivo de backup é inválido ou muito grande.")
            return
        }
        let fileName = safeBackupFileName(call.getString("fileName", "Hook Keys Backup.json"))
        let temporary = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
            .appendingPathComponent(fileName)
        do {
            try FileManager.default.createDirectory(
                at: temporary.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: temporary, options: .atomic)
        } catch {
            call.reject("Não foi possível preparar o backup.", nil, error)
            return
        }
        pendingBackupExport = (call, temporary)
        DispatchQueue.main.async { [weak self] in
            guard let self, let viewController = self.bridge?.viewController else {
                self?.finishBackupExport(saved: false, error: "A janela de arquivos não está disponível.")
                return
            }
            let picker = UIDocumentPickerViewController(forExporting: [temporary], asCopy: true)
            picker.delegate = self
            viewController.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController,
                               didPickDocumentsAt urls: [URL]) {
        finishBackupExport(saved: !urls.isEmpty)
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finishBackupExport(saved: false)
    }

    private func finishBackupExport(saved: Bool, error: String? = nil) {
        guard let pending = pendingBackupExport else { return }
        pendingBackupExport = nil
        try? FileManager.default.removeItem(at: pending.temporary.deletingLastPathComponent())
        if let error { pending.call.reject(error) }
        else { pending.call.resolve(["saved": saved]) }
    }

    private func safeBackupFileName(_ value: String) -> String {
        let withoutExtension = value.replacingOccurrences(
            of: "(?i)\\.json$", with: "", options: .regularExpression)
        let cleaned = withoutExtension.replacingOccurrences(
            of: "[^A-Za-z0-9 _-]", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: " _-"))
        return (cleaned.isEmpty ? "Hook Keys Backup" : cleaned) + ".json"
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

    @objc func setSeamlessPresetSwitching(_ call: CAPPluginCall) {
        engine.setSeamlessPresetSwitching(call.getBool("enabled", false))
        call.resolve()
    }

    @objc func beginSoundFontUpload(_ call: CAPPluginCall) {
        let moduleIndex = call.getInt("moduleIndex", -1)
        guard (0..<8).contains(moduleIndex) else { call.reject("Módulo inválido."); return }
        do {
            let directory = try soundfontDirectory()
            let temporary = directory.appendingPathComponent("module-\(moduleIndex).sf2.part")
            let assetKey = call.getString("assetKey", "")
            guard assetKey.count == 64, assetKey.allSatisfy({ $0.isHexDigit }) else {
                call.reject("Identificador de timbre inválido."); return
            }
            let destination = directory.appendingPathComponent("asset-\(assetKey).sf2")
            if FileManager.default.fileExists(atPath: destination.path) {
                soundfontQueue.async { [weak self] in
                    let loaded = self?.engine.loadSoundFont(atPath: destination.path, moduleIndex: moduleIndex) == true
                    DispatchQueue.main.async {
                        if loaded { call.resolve(["cached": true]) }
                        else {
                            guard let self else { call.reject("Motor indisponível."); return }
                            do {
                                if let old = self.uploads.removeValue(forKey: moduleIndex) { try? old.handle.close() }
                                FileManager.default.createFile(atPath: temporary.path, contents: nil)
                                self.uploads[moduleIndex] = (try FileHandle(forWritingTo: temporary), temporary, destination)
                                call.resolve(["cached": false])
                            } catch { call.reject("Não foi possível iniciar o carregamento do timbre.", nil, error) }
                        }
                    }
                }
                return
            }
            if let old = uploads.removeValue(forKey: moduleIndex) { try? old.handle.close() }
            FileManager.default.createFile(atPath: temporary.path, contents: nil)
            uploads[moduleIndex] = (try FileHandle(forWritingTo: temporary), temporary, destination)
            call.resolve(["cached": false])
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

    @objc func cloneSoundFont(_ call: CAPPluginCall) {
        let source = call.getInt("sourceModuleIndex", -1)
        let target = call.getInt("targetModuleIndex", -1)
        guard (0..<7).contains(source), (0..<7).contains(target), source != target else {
            call.reject("Módulos de timbre inválidos."); return
        }
        soundfontQueue.async { [weak self] in
            let copied = self?.engine.cloneSoundFont(fromModule: source, toModule: target) == true
            DispatchQueue.main.async {
                if copied { call.resolve() }
                else { call.reject("O timbre compartilhado não pôde ser preparado.") }
            }
        }
    }

    // MARK: - Gerenciador de arquivos
    //
    // O iOS só deixa um app ler fora do próprio contêiner com permissão do
    // usuário. A pasta escolhida uma vez no seletor do sistema vira um bookmark
    // guardado; dali em diante o app navega por ela sem abrir o seletor de novo.
    // A pasta "Hook Keys" (Documents) aparece no app Arquivos e aceita AirDrop.

    private static let fileBrowserFoldersKey = "hookkeys.fileBrowser.folders"
    private static let fileBrowserAudioExtensions: Set<String> = ["mp3", "wav", "wave", "m4a", "aac", "flac", "ogg", "aif", "aiff"]
    private let fileBrowserQueue = DispatchQueue(label: "com.hookdeveloper.hookkeys.filebrowser", qos: .userInitiated)
    private var pendingFolderPick: (call: CAPPluginCall, delegate: HookKeysFolderPickerDelegate)?

    @objc func fileBrowserRoots(_ call: CAPPluginCall) {
        var roots: [[String: Any]] = [["id": "app", "name": "Hook Keys", "removable": false]]
        for folder in fileBrowserFolderRecords() {
            guard let id = folder["id"] as? String, let name = folder["name"] as? String else { continue }
            roots.append(["id": id, "name": name, "removable": true])
        }
        call.resolve(["roots": roots])
    }

    @objc func addFileBrowserFolder(_ call: CAPPluginCall) {
        guard pendingFolderPick == nil else {
            call.reject("Já existe uma escolha de pasta aberta.")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self, let viewController = self.bridge?.viewController else {
                call.reject("A janela de arquivos não está disponível.")
                return
            }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
            let delegate = HookKeysFolderPickerDelegate { [weak self] url in self?.finishFolderPick(url) }
            picker.delegate = delegate
            picker.allowsMultipleSelection = false
            self.pendingFolderPick = (call, delegate)
            viewController.present(picker, animated: true)
        }
    }

    private func finishFolderPick(_ url: URL?) {
        guard let pending = pendingFolderPick else { return }
        pendingFolderPick = nil
        guard let url else {
            pending.call.resolve(["added": false])
            return
        }
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        do {
            let bookmark = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
            let id = UUID().uuidString
            let name = url.lastPathComponent
            var folders = fileBrowserFolderRecords()
            folders.append(["id": id, "name": name, "bookmark": bookmark])
            UserDefaults.standard.set(folders, forKey: Self.fileBrowserFoldersKey)
            pending.call.resolve(["added": true, "root": ["id": id, "name": name, "removable": true]])
        } catch {
            pending.call.reject("Não foi possível guardar o acesso a essa pasta.", nil, error)
        }
    }

    @objc func removeFileBrowserFolder(_ call: CAPPluginCall) {
        let id = call.getString("rootId", "")
        let folders = fileBrowserFolderRecords().filter { ($0["id"] as? String) != id }
        UserDefaults.standard.set(folders, forKey: Self.fileBrowserFoldersKey)
        call.resolve()
    }

    @objc func listFileBrowserDirectory(_ call: CAPPluginCall) {
        let rootId = call.getString("rootId", "app")
        let path = call.getString("path", "")
        fileBrowserQueue.async { [weak self] in
            guard let self else { return }
            do {
                let root = try self.openFileBrowserRoot(rootId)
                defer { root.stop() }
                let directory = try self.fileBrowserURL(root.url, path)
                let keys: [URLResourceKey] = [.isDirectoryKey, .fileSizeKey, .ubiquitousItemDownloadingStatusKey]
                let contents = try FileManager.default.contentsOfDirectory(
                    at: directory, includingPropertiesForKeys: keys, options: [.skipsPackageDescendants])
                var entries: [[String: Any]] = []
                for item in contents {
                    var name = item.lastPathComponent
                    var inCloud = false
                    // Arquivos do iCloud ainda não baixados: ".Nome.mp3.icloud".
                    if name.hasPrefix(".") && name.hasSuffix(".icloud") {
                        name = String(name.dropFirst().dropLast(".icloud".count))
                        inCloud = true
                    } else if name.hasPrefix(".") {
                        continue
                    }
                    let values = try? item.resourceValues(forKeys: Set(keys))
                    if values?.ubiquitousItemDownloadingStatus == .notDownloaded { inCloud = true }
                    if values?.isDirectory == true {
                        entries.append(["name": name, "isDirectory": true])
                    } else if Self.fileBrowserAudioExtensions.contains((name as NSString).pathExtension.lowercased()) {
                        entries.append(["name": name, "isDirectory": false, "size": values?.fileSize ?? 0, "inCloud": inCloud])
                    }
                }
                DispatchQueue.main.async { call.resolve(["entries": entries]) }
            } catch {
                DispatchQueue.main.async { call.reject("Não foi possível abrir essa pasta.", nil, error) }
            }
        }
    }

    @objc func importFileBrowserFile(_ call: CAPPluginCall) {
        let rootId = call.getString("rootId", "app")
        let path = call.getString("path", "")
        fileBrowserQueue.async { [weak self] in
            guard let self else { return }
            do {
                let root = try self.openFileBrowserRoot(rootId)
                defer { root.stop() }
                let source = try self.fileBrowserURL(root.url, path)
                let name = source.lastPathComponent
                let folder = FileManager.default.temporaryDirectory
                    .appendingPathComponent("HookKeysImport", isDirectory: true)
                    .appendingPathComponent(UUID().uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let destination = folder.appendingPathComponent(name)
                try? FileManager.default.startDownloadingUbiquitousItem(at: source)
                // O coordenador espera o iCloud terminar de baixar antes de copiar.
                var coordinationError: NSError?
                var copyError: Error?
                NSFileCoordinator(filePresenter: nil).coordinate(
                    readingItemAt: source, options: [.withoutChanges], error: &coordinationError) { readable in
                    do { try FileManager.default.copyItem(at: readable, to: destination) } catch { copyError = error }
                }
                if let coordinationError { throw coordinationError }
                if let copyError { throw copyError }
                let size = (try? destination.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                DispatchQueue.main.async {
                    call.resolve(["path": destination.path, "name": name, "size": size])
                }
            } catch {
                DispatchQueue.main.async { call.reject("Não foi possível ler essa música.", nil, error) }
            }
        }
    }

    @objc func releaseFileBrowserImport(_ call: CAPPluginCall) {
        let path = call.getString("path", "")
        let importRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("HookKeysImport", isDirectory: true).standardizedFileURL.path
        let file = URL(fileURLWithPath: path).standardizedFileURL
        if file.path.hasPrefix(importRoot + "/") {
            try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
        }
        call.resolve()
    }

    private func fileBrowserFolderRecords() -> [[String: Any]] {
        UserDefaults.standard.array(forKey: Self.fileBrowserFoldersKey) as? [[String: Any]] ?? []
    }

    private func openFileBrowserRoot(_ rootId: String) throws -> (url: URL, stop: () -> Void) {
        if rootId == "app" {
            let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            try FileManager.default.createDirectory(at: documents, withIntermediateDirectories: true)
            return (documents, {})
        }
        var folders = fileBrowserFolderRecords()
        guard let index = folders.firstIndex(where: { ($0["id"] as? String) == rootId }),
              let bookmark = folders[index]["bookmark"] as? Data else {
            throw NSError(domain: "HookKeysFiles", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Essa pasta não está mais disponível."])
        }
        var stale = false
        let url = try URL(resolvingBookmarkData: bookmark, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
        let accessing = url.startAccessingSecurityScopedResource()
        if stale, let refreshed = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
            folders[index]["bookmark"] = refreshed
            UserDefaults.standard.set(folders, forKey: Self.fileBrowserFoldersKey)
        }
        return (url, { if accessing { url.stopAccessingSecurityScopedResource() } })
    }

    private func fileBrowserURL(_ base: URL, _ path: String) throws -> URL {
        let components = path.split(separator: "/").map(String.init)
        guard !components.contains(where: { $0 == ".." || $0 == "." }) else {
            throw NSError(domain: "HookKeysFiles", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "Caminho inválido."])
        }
        return components.reduce(base) { $0.appendingPathComponent($1) }
    }

    private func soundfontDirectory() throws -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let directory = base.appendingPathComponent("SoundFonts", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
}


// Delegate próprio: o plugin já é o delegate do seletor de exportar backup.
final class HookKeysFolderPickerDelegate: NSObject, UIDocumentPickerDelegate {
    private let onFinish: (URL?) -> Void

    init(onFinish: @escaping (URL?) -> Void) {
        self.onFinish = onFinish
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        onFinish(urls.first)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        onFinish(nil)
    }
}
