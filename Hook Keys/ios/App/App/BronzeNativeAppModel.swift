import Foundation
import SwiftUI

@MainActor
final class BronzeNativeAppModel: ObservableObject {
    enum EngineState: Equatable {
        case idle
        case starting
        case ready
        case failed(String)
    }

    struct MidiDevice: Identifiable, Hashable {
        let id: String
        let name: String
    }

    let engine = HookKeysNativeEngine()
    @Published private(set) var engineState: EngineState = .idle
    @Published private(set) var midiDevices: [MidiDevice] = []
    @Published var selectedModule = 0
    @Published var page: Page = .modules
    @Published var tempo = 120.0
    @Published var moduleLevels = Array(repeating: 0.0, count: 8)
    @Published var moduleFaders = Array(repeating: 0.75, count: 8)
    @Published var padFilterLow = 0.0
    @Published var padFilterHigh = 1.0
    @Published var activePad: Int?
    @Published var activeEffect: Int?
    @Published var organDrawbars = [1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    @Published private(set) var bundledEffectsReady = false

    enum Page: String, CaseIterable, Identifiable {
        case modules = "Módulos"
        case organ = "Bronze B3"
        case pads = "Pads / FX"
        case presets = "Presets"
        var id: String { rawValue }
    }

    private var meterTimer: Timer?
    private let audioQueue = DispatchQueue(
        label: "app.bronzekeys.native.audio-start",
        qos: .userInitiated
    )

    init() {
        engine.onMidiDevicesChanged = { [weak self] in
            DispatchQueue.main.async { self?.refreshMidiDevices() }
        }
    }

    deinit {
        meterTimer?.invalidate()
        engine.stop()
    }

    func start() {
        guard engineState == .idle else { return }
        engineState = .starting
        let engine = self.engine
        audioQueue.async { [weak self] in
            let started = engine.start(withBufferFrames: 128, sampleRate: 48_000)
            let message = engine.lastAudioErrorMessage
            DispatchQueue.main.async {
                guard let self else { return }
                if started {
                    self.engineState = .ready
                    _ = engine.applyOrganFactoryDefaults()
                    engine.setMidiInputEnabled(true)
                    self.refreshMidiDevices()
                    self.startMeters()
                    self.loadBundledEffects()
                } else {
                    self.engineState = .failed(message.isEmpty
                        ? "Não foi possível iniciar o áudio nativo."
                        : message)
                }
            }
        }
    }

    func retry() {
        engine.stop()
        engineState = .idle
        start()
    }

    func refreshMidiDevices() {
        let values = engine.listMidiDevices()
        midiDevices = values.compactMap { value in
            guard let id = value["id"], let name = value["name"] else { return nil }
            return MidiDevice(id: id, name: name)
        }
        let selected: [Any] = midiDevices.prefix(3).map(\.id)
        engine.setMidiDeviceIds(selected)
    }

    func setModuleFader(_ moduleIndex: Int, normalized: Double) {
        guard moduleFaders.indices.contains(moduleIndex) else { return }
        moduleFaders[moduleIndex] = normalized
        // Curva útil na região baixa: 0 é silêncio e o restante cobre -36…0 dB.
        let db = normalized <= 0 ? -90 : -36 + Float(normalized) * 36
        _ = engine.setModuleGainDb(db, moduleIndex: moduleIndex)
    }

    func setTempo(_ value: Double) {
        tempo = min(300, max(60, value))
        _ = engine.setTempo(Float(tempo))
    }

    func togglePad(_ index: Int) {
        guard (0..<12).contains(index) else { return }
        if let previous = activePad {
            _ = engine.setPadNote(60 + previous, bankIndex: 0, enabled: false, velocity: 127)
        }
        if activePad == index {
            activePad = nil
        } else {
            activePad = index
            _ = engine.setPadNote(60 + index, bankIndex: 0, enabled: true, velocity: 127)
        }
    }

    func triggerEffect(_ index: Int, pressed: Bool) {
        guard (0..<12).contains(index) else { return }
        if pressed {
            activeEffect = index
            _ = engine.triggerEffect(bankIndex: 0, itemIndex: index, enabled: true, gainDb: 0)
        } else {
            // FX 1 é momentâneo, mas o arquivo continua até o fim (Infinite
            // Release); soltar só encerra o estado visual do botão.
            activeEffect = nil
        }
    }

    func setOrganDrawbar(_ index: Int, normalized: Double) {
        guard organDrawbars.indices.contains(index) else { return }
        organDrawbars[index] = normalized
        let positions = organDrawbars.map { NSNumber(value: Int(($0 * 8).rounded())) }
        _ = engine.configureOrganDrawbars(positions)
    }

    private func startMeters() {
        meterTimer?.invalidate()
        meterTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            let values = self.engine.moduleMeterLevels()
            for index in self.moduleLevels.indices {
                let left = index * 2 < values.count ? values[index * 2].doubleValue : 0
                let right = index * 2 + 1 < values.count ? values[index * 2 + 1].doubleValue : 0
                self.moduleLevels[index] = max(left, right)
            }
        }
        RunLoop.main.add(meterTimer!, forMode: .common)
    }

    private func loadBundledEffects() {
        let urls = Bundle.main.urls(
            forResourcesWithExtension: "mp3",
            subdirectory: "public/assets/fx/fx-1"
        )?.sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending } ?? []
        let engine = self.engine
        audioQueue.async { [weak self] in
            var loaded = 0
            for (index, url) in urls.prefix(12).enumerated() {
                if engine.loadEffect(path: url.path, bankIndex: 0, itemIndex: index) { loaded += 1 }
            }
            DispatchQueue.main.async {
                self?.bundledEffectsReady = loaded == 12
            }
        }
    }
}
