import Foundation
import Capacitor
import AVFAudio
import Foundation
import UIKit
import UniformTypeIdentifiers
import os

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
        CAPPluginMethod(name: "audioRouteLog", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "memoryUsage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "lockOrientation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "displayCutoutSide", returnType: CAPPluginReturnPromise),
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
        CAPPluginMethod(name: "configureOrgan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendMidi", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPadNote", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configurePadOutput", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTempo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setGlobalTranspose", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureMetronome", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMetronomeOutput", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOutputGain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCompatibilityMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSeamlessPresetSwitching", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAllNotes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "performHaptic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginSoundFontUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendSoundFontChunk", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishSoundFontUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cloneSoundFont", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unloadSoundFont", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveBackup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickAudioFiles", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releasePickedAudioFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "adoptPickedAudioFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteTrackFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginTrackUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendTrackChunk", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTrackUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadTrack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "controlTrack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "trackStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureTrackOutput", returnType: CAPPluginReturnPromise)
    ]

    private let engine = HookKeysNativeEngine()
    private let soundfontQueue = DispatchQueue(label: "com.hookdeveloper.hookkeys.soundfonts", qos: .userInitiated)
    private struct CachedAudioOutput {
        var name: String
        var channels: Int
    }
    private let audioOutputCacheLock = NSLock()
    private var cachedAudioOutputs: [String: CachedAudioOutput] = [:]
    private var audioRouteRecoveryWorkItem: DispatchWorkItem?
    // Últimos eventos de rota, exibidos em Dispositivo de áudio para
    // diagnosticar interfaces USB que somem no aparelho.
    private var audioRouteEvents: [String] = []
    private var activeBufferFrames = 128
    private var activeSampleRate = 48_000.0
    private var uploads: [Int: (handle: FileHandle, temporary: URL, destination: URL)] = [:]
    private var pendingBackupExport: (call: CAPPluginCall, temporary: URL)?

    public override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(audioRouteDidChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )
        cacheCurrentAudioOutputs()
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
        audioRouteRecoveryWorkItem?.cancel()
        NotificationCenter.default.removeObserver(self, name: AVAudioSession.routeChangeNotification, object: nil)
        engine.stop()
        for (_, upload) in uploads { try? upload.handle.close() }
    }

    @objc func initialize(_ call: CAPPluginCall) {
        let bufferFrames = call.getInt("bufferSize", 128)
        let sampleRate = call.getDouble("sampleRate", 48_000)
        soundfontQueue.async { [weak self] in
            guard let self else { return }
            if self.engine.start(withBufferFrames: bufferFrames, sampleRate: sampleRate) {
                self.activeBufferFrames = bufferFrames
                self.activeSampleRate = sampleRate
                call.resolve(["ready": true])
            } else {
                let detail = self.engine.lastAudioErrorMessage
                call.reject(detail.isEmpty
                    ? "Não foi possível iniciar o áudio nativo."
                    : "Não foi possível iniciar o áudio nativo (\(detail)).")
            }
        }
    }

    @objc func listMidiDevices(_ call: CAPPluginCall) {
        call.resolve(["devices": engine.listMidiDevices()])
    }

    @objc func listAudioOutputDevices(_ call: CAPPluginCall) {
        cacheCurrentAudioOutputs()
        audioOutputCacheLock.lock()
        let devices: [[String: Any]] = cachedAudioOutputs
            .map { id, output in [
                "id": id,
                "name": output.name,
                "channels": output.channels
            ] }
            .sorted { ($0["name"] as? String ?? "") < ($1["name"] as? String ?? "") }
        audioOutputCacheLock.unlock()
        call.resolve(["devices": devices])
    }

    private func cacheCurrentAudioOutputs() {
        let session = AVAudioSession.sharedInstance()
        let maximum = max(1, min(32, session.maximumOutputNumberOfChannels))
        let current = session.currentRoute.outputs.map { output -> (String, String, Int) in
            let channelCount = output.channels?.count ?? maximum
            return (output.uid, output.portName, max(1, min(32, channelCount)))
        }
        audioOutputCacheLock.lock()
        for (id, name, channels) in current {
            cachedAudioOutputs[id] = CachedAudioOutput(name: name, channels: channels)
        }
        audioOutputCacheLock.unlock()
    }

    @objc private func audioRouteDidChange(_ notification: Notification) {
        let session = AVAudioSession.sharedInstance()
        let rawReason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
        let reason = rawReason.flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
        let previousOutputs = (notification.userInfo?[AVAudioSessionRouteChangePreviousRouteKey]
            as? AVAudioSessionRouteDescription)?.outputs ?? []
        recordAudioRouteEvent(
            "\(Self.routeChangeReasonName(reason)): \(Self.describeOutputs(previousOutputs)) → "
                + Self.describeOutputs(session.currentRoute.outputs)
        )

        // Uma mudança de categoria/configuração pode expor Speaker por alguns
        // frames. Só remova a interface quando o iOS afirmar que o dispositivo
        // antigo realmente ficou indisponível (cabo retirado, energia perdida).
        if reason == .oldDeviceUnavailable,
           let previousRoute = notification.userInfo?[AVAudioSessionRouteChangePreviousRouteKey]
                as? AVAudioSessionRouteDescription {
            let currentIds = Set(session.currentRoute.outputs.map(\.uid))
            audioOutputCacheLock.lock()
            for output in previousRoute.outputs where !currentIds.contains(output.uid) {
                cachedAudioOutputs.removeValue(forKey: output.uid)
            }
            audioOutputCacheLock.unlock()
        }

        // O currentRoute da própria notificação ainda pode ser intermediário.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            guard let self else { return }
            self.cacheCurrentAudioOutputs()
            self.scheduleAudioRouteRecovery()
        }
    }

    private func recordAudioRouteEvent(_ text: String) {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        audioOutputCacheLock.lock()
        audioRouteEvents.append("\(formatter.string(from: Date())) \(text)")
        if audioRouteEvents.count > 12 { audioRouteEvents.removeFirst(audioRouteEvents.count - 12) }
        audioOutputCacheLock.unlock()
    }

    private static func describeOutputs(_ outputs: [AVAudioSessionPortDescription]) -> String {
        outputs.isEmpty ? "(nenhuma)" : outputs
            .map { "\($0.portName) [\($0.portType.rawValue), \($0.channels?.count ?? 0)ch]" }
            .joined(separator: " + ")
    }

    private static func routeChangeReasonName(_ reason: AVAudioSession.RouteChangeReason?) -> String {
        switch reason ?? .unknown {
        case .newDeviceAvailable: return "novo dispositivo"
        case .oldDeviceUnavailable: return "dispositivo saiu"
        case .categoryChange: return "categoria"
        case .override: return "override"
        case .wakeFromSleep: return "despertar"
        case .noSuitableRouteForCategory: return "sem rota"
        case .routeConfigurationChange: return "configuração"
        default: return "desconhecido"
        }
    }

    @objc func audioRouteLog(_ call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        audioOutputCacheLock.lock()
        let events = audioRouteEvents
        audioOutputCacheLock.unlock()
        let outputs = Self.describeOutputs(session.currentRoute.outputs)
        let rate = Int(session.sampleRate)
        let channels = "\(session.outputNumberOfChannels)/\(session.maximumOutputNumberOfChannels)ch"
        let engineState = engine.audioOutputReady() ? "motor ok" : "motor parado"
        // O Áudio Mono da Acessibilidade soma L+R no par principal (saídas 1-2)
        // de qualquer saída, inclusive de placas USB; as saídas 3+ ficam separadas.
        let monoAudio = UIAccessibility.isMonoAudioEnabled ? "Áudio Mono do iOS LIGADO" : "Áudio Mono do iOS desligado"
        call.resolve([
            "current": "\(outputs) · \(rate) Hz · \(channels) · \(engineState) · \(monoAudio) · \(engine.outputGraphDescription())",
            "events": events
        ])
    }

    // RAM do app contra o limite que o iOS dá a ele: é nesse teto que o sistema
    // fecha o app, então a porcentagem mostra quanto falta. phys_footprint é a
    // mesma conta que o Xcode e o iOS usam para esse limite.
    // Paisagem dos dois lados (USB para a esquerda ou para a direita). O plugin
    // de orientação só trava um lado; aqui a máscara libera os dois.
    @objc func lockOrientation(_ call: CAPPluginCall) {
        let landscape = call.getString("mode", "portrait") == "landscape"
        DispatchQueue.main.async { [weak self] in
            guard let controller = self?.bridge?.viewController as? CAPBridgeViewController else {
                call.resolve()
                return
            }
            controller.supportedOrientations = landscape
                ? [UIInterfaceOrientation.landscapeLeft.rawValue, UIInterfaceOrientation.landscapeRight.rawValue]
                : [UIInterfaceOrientation.portrait.rawValue]
            let mask: UIInterfaceOrientationMask = landscape ? .landscape : .portrait
            if #available(iOS 16.0, *) {
                controller.setNeedsUpdateOfSupportedInterfaceOrientations()
                let scene = controller.view.window?.windowScene
                    ?? UIApplication.shared.connectedScenes.first as? UIWindowScene
                let current = scene?.interfaceOrientation
                let alreadyThere = landscape
                    ? (current?.isLandscape ?? false)
                    : (current?.isPortrait ?? false)
                // Repetir o pedido de geometria prende a tela no lado atual e o
                // aparelho não gira mais; com a tela já no sentido certo basta
                // a lista de orientações aceitas e o sensor cuida do resto.
                if !alreadyThere {
                    scene?.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
                }
            } else {
                let deviceIsLandscape = UIDevice.current.orientation.isLandscape
                if !landscape || !deviceIsLandscape {
                    let target: UIInterfaceOrientation = landscape ? .landscapeRight : .portrait
                    UIDevice.current.setValue(target.rawValue, forKey: "orientation")
                }
                UIViewController.attemptRotationToDeviceOrientation()
            }
            call.resolve()
        }
    }

    // No iPhone, landscapeLeft coloca o recorte físico à esquerda e
    // landscapeRight à direita. Retornar o lado nativo evita a safe area
    // simétrica do Safari, que desperdiça também o lado da porta Lightning/USB.
    @objc func displayCutoutSide(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            let scene = self?.bridge?.viewController?.view.window?.windowScene
                ?? UIApplication.shared.connectedScenes.first as? UIWindowScene
            let side: String
            switch scene?.interfaceOrientation {
            case .landscapeLeft: side = "left"
            case .landscapeRight: side = "right"
            case .portrait, .portraitUpsideDown: side = "top"
            default: side = "none"
            }
            call.resolve(["side": side])
        }
    }

    // RAM do aparelho inteiro, não só a do app: páginas ativas, presas e
    // comprimidas contra a RAM instalada. As inativas são cache que o iOS
    // devolve para quem precisar, então não entram na conta.
    // mach_host_self() devolve um direito de envio a cada chamada: guardado uma
    // vez, a leitura a cada 2 s não vai empilhando portas.
    private lazy var hostPort: host_t = mach_host_self()

    private func deviceMemoryUsedBytes() -> Double? {
        var stats = vm_statistics64_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size)
        let status = withUnsafeMutablePointer(to: &stats) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(self.hostPort, host_flavor_t(HOST_VM_INFO64), $0, &count)
            }
        }
        guard status == KERN_SUCCESS else { return nil }
        let pageSize = Double(vm_kernel_page_size)
        let pages = Double(stats.active_count) + Double(stats.wire_count) + Double(stats.compressor_page_count)
        // Zero aqui significa leitura vazia: cai na reserva do app.
        return pages > 0 ? pages * pageSize : nil
    }

    // Reserva: se o sistema não responder, mostra a memória do próprio app.
    private func appMemoryUsedBytes() -> Double? {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
        let status = withUnsafeMutablePointer(to: &info) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        return status == KERN_SUCCESS ? Double(info.phys_footprint) : nil
    }

    @objc func memoryUsage(_ call: CAPPluginCall) {
        let total = Double(ProcessInfo.processInfo.physicalMemory)
        guard total > 0, let used = deviceMemoryUsedBytes() ?? appMemoryUsedBytes() else {
            call.reject("Não foi possível ler a memória do aparelho.")
            return
        }
        call.resolve([
            "usedBytes": used,
            "limitBytes": total,
            "percent": min(100, used / total * 100)
        ])
    }

    private func scheduleAudioRouteRecovery() {
        audioRouteRecoveryWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            guard let self, !self.engine.audioOutputReady() else { return }
            _ = self.engine.start(
                withBufferFrames: self.activeBufferFrames,
                sampleRate: self.activeSampleRate
            )
        }
        audioRouteRecoveryWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: workItem)
    }

    @objc func setAudioOutputDevice(_ call: CAPPluginCall) {
        let requestedId = call.getString("deviceId", "")
        let bufferFrames = min(512, max(64, call.getInt("bufferSize", 128)))
        let sampleRate = call.getDouble("sampleRate", 48_000)
        // "Padrão" (id vazio) é a rota que o iOS já escolheu: se o motor está
        // tocando nela, reabrir a sessão só serve para derrubar a interface USB.
        let alreadyActive = (requestedId.isEmpty
            || AVAudioSession.sharedInstance().currentRoute.outputs.contains { $0.uid == requestedId })
            && bufferFrames == activeBufferFrames
            && abs(sampleRate - activeSampleRate) < 1
            && engine.audioOutputReady()
        // Escolher a rota que o próprio iOS já ativou não deve derrubar e abrir
        // novamente o AVAudioEngine; isso causava o som de reconexão em ciclo.
        if alreadyActive {
            call.resolve()
            return
        }
        let channels = min(32, max(1, call.getInt("channels", 2)))
        let preserveEngine = call.getBool("preserveEngine", false)
        soundfontQueue.async { [weak self] in
            guard let self else { return }
            let ok = self.engine.setAudioOutputDeviceId(
                requestedId,
                channels: channels,
                bufferFrames: bufferFrames,
                sampleRate: sampleRate,
                preserveEngine: preserveEngine
            )
            if ok {
                self.activeBufferFrames = bufferFrames
                self.activeSampleRate = sampleRate
                call.resolve()
            } else {
                call.reject("Não foi possível abrir o dispositivo de áudio selecionado.")
            }
        }
    }

    @objc func audioOutputStatus(_ call: CAPPluginCall) {
        let ready = engine.audioOutputReady()
        call.resolve([
            "ready": ready,
            "failed": !ready,
            "error": ready ? "" : engine.lastAudioErrorMessage
        ])
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

    @objc func setPadNote(_ call: CAPPluginCall) {
        let note = call.getInt("note", -1)
        guard (60...71).contains(note) else {
            call.reject("A nota do Pad 1 precisa estar entre C3 e B3.")
            return
        }
        let bankIndex = call.getInt("bankIndex", -1)
        guard (0...1).contains(bankIndex) else {
            call.reject("Banco de Pads inválido.")
            return
        }
        if engine.setPadNote(note, bankIndex: bankIndex, enabled: call.getBool("enabled", false),
                             velocity: min(127, max(1, call.getInt("velocity", 127)))) {
            call.resolve()
        } else {
            call.reject("A fila de áudio dos Pads está ocupada.")
        }
    }

    @objc func configurePadOutput(_ call: CAPPluginCall) {
        if engine.setPadOutputGainDb(
            call.getFloat("db", 0), enabled: call.getBool("enabled", true),
            channelStart: min(31, max(0, call.getInt("channelStart", 0))),
            channelCount: call.getInt("channelCount", 2) == 1 ? 1 : 2,
            lowCutHz: min(20_000, max(20, call.getFloat("lowCutHz", 20))),
            highCutHz: min(20_000, max(20, call.getFloat("highCutHz", 20_000)))
        ) {
            call.resolve()
        } else {
            call.reject("O motor ainda não foi inicializado.")
        }
    }

    @objc func configureModule(_ call: CAPPluginCall) {
        let ok = engine.configureModule(
            call.getInt("moduleIndex", -1),
            enabled: call.getBool("enabled", true),
            inputSlot: call.getInt("inputSlot", 0xff),
            lowNote: call.getInt("lowNote", 0),
            highNote: call.getInt("highNote", 127),
            octave: call.getInt("octave", 0),
            sustain: call.getBool("sustain", true),
            modulation: call.getBool("modulation", true),
            gmDrumHiHatChoke: call.getBool("gmDrumHiHatChoke", false),
            drumZeroReleaseMask0: call.getInt("drumZeroReleaseMask0", 0),
            drumZeroReleaseMask1: call.getInt("drumZeroReleaseMask1", 0),
            drumZeroReleaseMask2: call.getInt("drumZeroReleaseMask2", 0),
            drumZeroReleaseMask3: call.getInt("drumZeroReleaseMask3", 0),
            volumeDb: call.getFloat("volumeDb", 0),
            polyphony: min(128, max(1, call.getInt("polyphony", 128))),
            velocityCurve0: min(127, max(0, call.getInt("velocityCurve0", 0))),
            velocityCurve1: min(127, max(0, call.getInt("velocityCurve1", 32))),
            velocityCurve2: min(127, max(0, call.getInt("velocityCurve2", 64))),
            velocityCurve3: min(127, max(0, call.getInt("velocityCurve3", 96))),
            velocityCurve4: min(127, max(0, call.getInt("velocityCurve4", 127))),
            noVelocitySensitivity: call.getBool("noVelocitySensitivity", false),
            mono: call.getBool("mono", false),
            legato: call.getBool("legato", false),
            outputChannelStart: min(31, max(0, call.getInt("outputChannelStart", 0))),
            outputChannelCount: call.getInt("outputChannelCount", 2) == 1 ? 1 : 2,
            outputDualMono: call.getBool("outputDualMono", false)
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
            beatMultiplier: call.getFloat("beatMultiplier", 0.25),
            measureBeats: call.getFloat("measureBeats", 0), gate: call.getFloat("gate", 0.5),
            depth: call.getFloat("depth", 1), attackMs: call.getFloat("attackMs", 3),
            releaseMs: call.getFloat("releaseMs", 3), swing: call.getFloat("swing", 0))
        if ok { call.resolve() } else { call.reject("Não foi possível configurar o Trance Gate.") }
    }

    @objc func configureOrgan(_ call: CAPPluginCall) {
        let drawbars = call.getArray("drawbars", []).compactMap { value -> NSNumber? in
            if let number = value as? NSNumber {
                return NSNumber(value: min(8, max(0, number.intValue)))
            }
            return nil
        }
        if drawbars.count != 9 {
            call.reject("A configuração do Organ precisa ter nove drawbars.")
            return
        }
        if engine.configureOrganDrawbars(drawbars) { call.resolve() }
        else { call.reject("O motor ainda não foi inicializado.") }
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
            cutoffFilterType: call.getInt("cutoffFilterType", 0),
            cutoffEnvelopeEnabled: call.getBool("cutoffEnvelopeEnabled", false),
            cutoffEnvelopeAttackMs: call.getFloat("cutoffEnvelopeAttackMs", 5),
            cutoffEnvelopeDecayMs: call.getFloat("cutoffEnvelopeDecayMs", 200),
            cutoffEnvelopeSustain: call.getFloat("cutoffEnvelopeSustain", 1),
            cutoffEnvelopeReleaseMs: call.getFloat("cutoffEnvelopeReleaseMs", 200),
            cutoffEnvelopeDepthOctaves: call.getFloat("cutoffEnvelopeDepthOctaves", 4),
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
            compressorMix: call.getFloat("compressorMix", 0),
            delaySync: call.getBool("delaySync", false),
            delayMs: call.getFloat("delayMs", 500),
            delayBeatMultiplier: call.getFloat("delayBeatMultiplier", 1),
            delayFeedback: call.getFloat("delayFeedback", 0.35),
            delayMix: call.getFloat("delayMix", 0),
            reverbDecay: call.getFloat("reverbDecay", 0.5),
            reverbDampen: call.getFloat("reverbDampen", 0.5),
            reverbMod: call.getFloat("reverbMod", 0),
            reverbSize: call.getFloat("reverbSize", 0.6),
            reverbMix: call.getFloat("reverbMix", 0),
            reverbImpulse: call.getInt("reverbImpulse", 0),
            rotaryEnabled: call.getBool("rotaryEnabled", false),
            rotarySpeed: call.getInt("rotarySpeed", 1),
            rotarySlowHz: call.getFloat("rotarySlowHz", 0.8),
            rotaryFastHz: call.getFloat("rotaryFastHz", 6.4),
            rotaryRampSeconds: call.getFloat("rotaryRampSeconds", 1.2),
            rotaryDepth: call.getFloat("rotaryDepth", 0.7),
            rotaryMix: call.getFloat("rotaryMix", 1),
            rotaryModulationEnabled: call.getBool("rotaryModulationEnabled", false),
            rotaryCabinetEnabled: call.getBool("rotaryCabinetEnabled", true),
            chorusEnabled: call.getBool("chorusEnabled", false),
            chorusRateHz: call.getFloat("chorusRateHz", 0.6),
            chorusDepth: call.getFloat("chorusDepth", 0.5),
            chorusMix: call.getFloat("chorusMix", 0.35),
            loFiEnabled: call.getBool("loFiEnabled", false),
            loFiBitDepth: call.getFloat("loFiBitDepth", 8),
            loFiSampleRateHz: call.getFloat("loFiSampleRateHz", 12000),
            loFiMix: call.getFloat("loFiMix", 0.5),
            autoFaderEnabled: call.getBool("autoFaderEnabled", false),
            autoFaderBeats: call.getFloat("autoFaderBeats", 4),
            autoFaderDepthDb: call.getFloat("autoFaderDepthDb", 6),
            inputGainDb: call.getFloat("inputGainDb", 0)
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
            glideMs: call.getFloat("glideMs", 0),
            sustainDb: call.getFloat("sustainDb", 0)
        )
        if ok { call.resolve() } else { call.reject("O motor ainda não foi inicializado.") }
    }

    @objc func configureModuleModulation(_ call: CAPPluginCall) {
        let moduleIndex = call.getInt("moduleIndex", -1)
        guard moduleIndex >= 0 && moduleIndex < 8 else {
            call.reject("Módulo inválido.")
            return
        }
        // mode: 0 User, 1 LFO de pitch, 2 Tremolo.
        if engine.configureModuleModulation(
            moduleIndex, mode: call.getInt("mode", 1), rateHz: call.getFloat("rateHz", 6.85),
            intensity: call.getFloat("intensity", 1)
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
            oscillator2Limit: min(127, max(0, call.getInt("oscillator2Limit", 127))),
            oscillator3Limit: min(127, max(0, call.getInt("oscillator3Limit", 127)))
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
            oscillator3: call.getInt("oscillator3", 1),
            oscillator1Enabled: call.getBool("oscillator1Enabled", true),
            oscillator2Enabled: call.getBool("oscillator2Enabled", true),
            oscillator3Enabled: call.getBool("oscillator3Enabled", true),
            voiceMode: call.getInt("voiceMode", 1),
            lfoTarget: call.getInt("lfoTarget", 0),
            oscillator1Volume: call.getFloat("oscillator1Volume", 1),
            oscillator2Volume: call.getFloat("oscillator2Volume", 1),
            oscillator3Volume: call.getFloat("oscillator3Volume", 1),
            oscillator1DetuneCents: call.getFloat("oscillator1DetuneCents", 0),
            oscillator2DetuneCents: call.getFloat("oscillator2DetuneCents", 7),
            oscillator3DetuneCents: call.getFloat("oscillator3DetuneCents", -7),
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
            oscillator2Octave: call.getInt("oscillator2Octave", 0),
            oscillator3Octave: call.getInt("oscillator3Octave", 0)
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

    @objc func setGlobalTranspose(_ call: CAPPluginCall) {
        if engine.setGlobalTranspose(call.getInt("semitones", 0)) {
            call.resolve()
        } else {
            call.reject("O motor ainda não foi inicializado.")
        }
    }

    @objc func setMetronomeOutput(_ call: CAPPluginCall) {
        let ok = engine.setMetronomeOutputChannelStart(
            min(31, max(0, call.getInt("channelStart", 0))),
            channelCount: call.getInt("channelCount", 2) == 1 ? 1 : 2
        )
        if ok { call.resolve() } else { call.reject("O motor ainda não foi inicializado.") }
    }

    @objc func configureMetronome(_ call: CAPPluginCall) {
        let ok = engine.configureMetronomeEnabled(
            call.getBool("enabled", false),
            bpm: call.getFloat("bpm", 120),
            volume: min(1, max(0, call.getFloat("volume", 1))),
            clickSound: min(4, max(1, call.getInt("clickSound", 1))),
            accentEnabled: call.getBool("accentEnabled", false),
            doubleTimeEnabled: call.getBool("doubleTimeEnabled", false),
            timeSignatureNumerator: min(16, max(1, call.getInt("timeSignatureNumerator", 4))),
            timeSignatureDenominator: [2, 4, 8, 16].contains(call.getInt("timeSignatureDenominator", 4))
                ? call.getInt("timeSignatureDenominator", 4) : 4,
            restart: call.getBool("restart", false)
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
              let data = content.data(using: .utf8), data.count <= 16 * 1024 * 1024 else {
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
        if engine.setOutputGainDb(call.getFloat("db", 0), enabled: call.getBool("enabled", true),
                                  channelStart: call.getInt("channelStart", 0),
                                  channelCount: call.getInt("channelCount", 2)) {
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

    @objc func unloadSoundFont(_ call: CAPPluginCall) {
        let moduleIndex = call.getInt("moduleIndex", -1)
        guard (0..<7).contains(moduleIndex) else {
            call.reject("Módulo de timbre inválido."); return
        }
        soundfontQueue.async { [weak self] in
            self?.engine.unloadSoundFont(fromModule: moduleIndex)
            DispatchQueue.main.async { call.resolve() }
        }
    }

    // MARK: - Seletor de músicas
    //
    // "Add música" abre direto o seletor de documentos do iOS, filtrado em
    // áudio e com várias músicas por vez. O campo de arquivo da web abria antes
    // um menu com câmera e fotos. As músicas escolhidas chegam como cópia do app.

    private let pickedAudioQueue = DispatchQueue(label: "com.hookdeveloper.hookkeys.pickedaudio", qos: .userInitiated)
    private var pendingAudioPick: (call: CAPPluginCall, delegate: HookKeysDocumentPickerDelegate)?

    @objc func pickAudioFiles(_ call: CAPPluginCall) {
        guard pendingAudioPick == nil else {
            call.reject("Já existe uma escolha de músicas aberta.")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self, let viewController = self.bridge?.viewController else {
                call.reject("A janela de arquivos não está disponível.")
                return
            }
            let types = [UTType.audio, UTType(filenameExtension: "flac"), UTType(filenameExtension: "ogg")].compactMap { $0 }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
            picker.allowsMultipleSelection = true
            let delegate = HookKeysDocumentPickerDelegate { [weak self] urls in self?.finishAudioPick(urls) }
            picker.delegate = delegate
            self.pendingAudioPick = (call, delegate)
            viewController.present(picker, animated: true)
        }
    }

    private func finishAudioPick(_ urls: [URL]) {
        guard let pending = pendingAudioPick else { return }
        pendingAudioPick = nil
        pickedAudioQueue.async {
            var files: [[String: Any]] = []
            for url in urls {
                let folder = FileManager.default.temporaryDirectory
                    .appendingPathComponent("HookKeysImport", isDirectory: true)
                    .appendingPathComponent(UUID().uuidString, isDirectory: true)
                let destination = folder.appendingPathComponent(url.lastPathComponent)
                let hasScopedAccess = url.startAccessingSecurityScopedResource()
                defer {
                    if hasScopedAccess { url.stopAccessingSecurityScopedResource() }
                }
                do {
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    // Alguns provedores do app Arquivos entregam a cópia em outro
                    // volume. copyItem funciona nesses casos; moveItem pode falhar e
                    // fazia a seleção chegar vazia ao JavaScript.
                    try FileManager.default.copyItem(at: url, to: destination)
                    let size = (try? destination.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                    files.append(["path": destination.path, "name": url.lastPathComponent, "size": size])
                } catch {
                    try? FileManager.default.removeItem(at: folder)
                }
            }
            DispatchQueue.main.async { pending.call.resolve(["files": files]) }
        }
    }

    @objc func releasePickedAudioFile(_ call: CAPPluginCall) {
        let path = call.getString("path", "")
        let importRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("HookKeysImport", isDirectory: true).standardizedFileURL.path
        let file = URL(fileURLWithPath: path).standardizedFileURL
        if file.path.hasPrefix(importRoot + "/") {
            try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
        }
        call.resolve()
    }

    // MARK: - Músicas no motor
    //
    // O motor lê a música direto do disco. Cada música fica uma vez em
    // Application Support/Tracks, pelo id da biblioteca: a do seletor já chega
    // no app e só muda de lugar; uma antiga do IndexedDB sobe em partes uma vez.

    private let trackQueue = DispatchQueue(label: "com.hookdeveloper.hookkeys.tracks", qos: .userInitiated)
    private var trackUploads: [String: (handle: FileHandle, temporary: URL, destination: URL)] = [:]

    @objc func adoptPickedAudioFile(_ call: CAPPluginCall) {
        guard let destination = try? trackFile(call) else { call.reject("Música inválida."); return }
        let importRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("HookKeysImport", isDirectory: true).standardizedFileURL.path
        let source = URL(fileURLWithPath: call.getString("path", "")).standardizedFileURL
        guard source.path.hasPrefix(importRoot + "/") else { call.reject("Arquivo fora da importação."); return }
        trackQueue.async {
            do {
                if !FileManager.default.fileExists(atPath: destination.path) {
                    try FileManager.default.moveItem(at: source, to: destination)
                }
                try? FileManager.default.removeItem(at: source.deletingLastPathComponent())
                DispatchQueue.main.async { call.resolve() }
            } catch {
                DispatchQueue.main.async { call.reject("Não foi possível guardar a música.", nil, error) }
            }
        }
    }

    @objc func beginTrackUpload(_ call: CAPPluginCall) {
        guard let destination = try? trackFile(call), let key = trackKey(call) else {
            call.reject("Música inválida."); return
        }
        if FileManager.default.fileExists(atPath: destination.path) { call.resolve(["cached": true]); return }
        do {
            let temporary = destination.appendingPathExtension("part")
            if let old = trackUploads.removeValue(forKey: key) { try? old.handle.close() }
            FileManager.default.createFile(atPath: temporary.path, contents: nil)
            trackUploads[key] = (try FileHandle(forWritingTo: temporary), temporary, destination)
            call.resolve(["cached": false])
        } catch { call.reject("Não foi possível preparar a música.", nil, error) }
    }

    @objc func deleteTrackFile(_ call: CAPPluginCall) {
        guard let file = try? trackFile(call) else { call.reject("Música inválida."); return }
        trackQueue.async {
            do {
                if FileManager.default.fileExists(atPath: file.path) {
                    try FileManager.default.removeItem(at: file)
                }
                DispatchQueue.main.async { call.resolve() }
            } catch {
                DispatchQueue.main.async { call.reject("Não foi possível apagar a música.", nil, error) }
            }
        }
    }

    @objc func appendTrackChunk(_ call: CAPPluginCall) {
        guard let key = trackKey(call), let upload = trackUploads[key],
              let encoded = call.getString("base64"), let data = Data(base64Encoded: encoded) else {
            call.reject("Envio de música inválido."); return
        }
        do { try upload.handle.write(contentsOf: data); call.resolve() }
        catch { call.reject("Falha ao gravar a música.", nil, error) }
    }

    @objc func finishTrackUpload(_ call: CAPPluginCall) {
        guard let key = trackKey(call), let upload = trackUploads.removeValue(forKey: key) else {
            call.reject("Nenhuma música está sendo enviada."); return
        }
        trackQueue.async {
            do {
                try upload.handle.close()
                if FileManager.default.fileExists(atPath: upload.destination.path) {
                    try FileManager.default.removeItem(at: upload.destination)
                }
                try FileManager.default.moveItem(at: upload.temporary, to: upload.destination)
                DispatchQueue.main.async { call.resolve() }
            } catch {
                try? FileManager.default.removeItem(at: upload.temporary)
                DispatchQueue.main.async { call.reject("Falha ao finalizar a música.", nil, error) }
            }
        }
    }

    @objc func loadTrack(_ call: CAPPluginCall) {
        let sourceId = call.getInt("sourceId", 0)
        guard sourceId > 0, let file = try? trackFile(call) else { call.reject("Música inválida."); return }
        guard FileManager.default.fileExists(atPath: file.path) else {
            call.reject("A música ainda não está no aparelho.", "track_file_missing"); return
        }
        trackQueue.async { [weak self] in
            let duration = self?.engine.loadTrackId(sourceId, path: file.path) ?? -1
            DispatchQueue.main.async {
                if duration > 0 { call.resolve(["durationSeconds": duration]) }
                else { call.reject("Não foi possível abrir essa música.") }
            }
        }
    }

    @objc func controlTrack(_ call: CAPPluginCall) {
        let ok = engine.controlTrackId(
            call.getInt("sourceId", 0),
            action: call.getString("action", ""),
            seconds: call.getDouble("seconds", 0),
            loop: call.getBool("loop", false),
            playbackRate: call.getDouble("playbackRate", 1)
        )
        if ok { call.resolve() } else { call.reject("A música não está carregada no motor.", "track_not_loaded") }
    }

    @objc func trackStatus(_ call: CAPPluginCall) {
        call.resolve(engine.trackStatus())
    }

    @objc func configureTrackOutput(_ call: CAPPluginCall) {
        let ok = engine.configureTrackOutputChannelStart(
            min(31, max(0, call.getInt("channelStart", 0))),
            channelCount: call.getInt("channelCount", 2) == 1 ? 1 : 2,
            gainDb: call.getFloat("db", 0),
            enabled: call.getBool("enabled", true)
        )
        if ok { call.resolve() } else { call.reject("O motor ainda não foi inicializado.") }
    }

    private func trackKey(_ call: CAPPluginCall) -> String? {
        let key = call.getString("key", "")
        guard (1...80).contains(key.count),
              key.allSatisfy({ ($0.isASCII && ($0.isLetter || $0.isNumber)) || $0 == "-" }) else { return nil }
        return key
    }

    private func trackFile(_ call: CAPPluginCall) throws -> URL {
        guard let key = trackKey(call) else {
            throw NSError(domain: "HookKeysNative", code: 3, userInfo: [NSLocalizedDescriptionKey: "Música inválida."])
        }
        let rawExtension = call.getString("extension", "").lowercased()
        let fileExtension = (1...8).contains(rawExtension.count) &&
            rawExtension.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) ? rawExtension : "audio"
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let directory = base.appendingPathComponent("Tracks", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("track-\(key).\(fileExtension)")
    }

    private func soundfontDirectory() throws -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let directory = base.appendingPathComponent("SoundFonts", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
}


// Delegate próprio: o plugin já é o delegate do seletor de exportar backup.
final class HookKeysDocumentPickerDelegate: NSObject, UIDocumentPickerDelegate {
    private let onFinish: ([URL]) -> Void

    init(onFinish: @escaping ([URL]) -> Void) {
        self.onFinish = onFinish
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        onFinish(urls)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        onFinish([])
    }
}
