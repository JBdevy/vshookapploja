import Foundation
import SwiftUI

@MainActor
final class BronzeNativeAppModel: ObservableObject {
    enum EnvelopeParameter: String, CaseIterable, Identifiable {
        case attack = "Attack"
        case release = "Release"
        case hold = "Hold"
        case decay = "Decay"
        case sustain = "Sustain"

        var id: String { rawValue }
    }

    struct ModuleEnvelope {
        var attackMs = 0.0
        var releaseMs = 300.0
        var holdMs = 15_000.0
        var decayMs = 25_000.0
        var sustainDb = 0.0
    }

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
    @Published private(set) var metronomeEnabled = false
    @Published private(set) var metronomeClickSound = 1
    @Published private(set) var timeSignatureNumerator = 4
    @Published private(set) var timeSignatureDenominator = 4
    @Published var moduleLevels = Array(repeating: 0.0, count: 8)
    @Published var moduleFaders = Array(repeating: 0.75, count: 8)
    @Published private(set) var moduleEnvelopes = Array(repeating: ModuleEnvelope(), count: 8)
    @Published var padFilterLow = 0.0
    @Published var padFilterHigh = 1.0
    @Published var activePad: Int?
    @Published var activeEffect: Int?
    @Published var organDrawbars = [1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    @Published private(set) var organRotaryFast = false
    @Published private(set) var organCabinetEnabled = true
    @Published private(set) var bundledEffectsReady = false
    private var heldKeyboardNotes = Set<Int>()

    enum Page: String, CaseIterable, Identifiable {
        case modules = "Módulos"
        case organ = "Bronze B3"
        case pads = "Pads / FX"
        case presets = "Presets"
        var id: String { rawValue }
    }

    private var meterTimer: Timer?
    private var lifecycleObserver: NSObjectProtocol?
    private let audioQueue = DispatchQueue(
        label: "app.bronzekeys.native.audio-start",
        qos: .userInitiated
    )

    init() {
        engine.onMidiDevicesChanged = { [weak self] in
            DispatchQueue.main.async { self?.refreshMidiDevices() }
        }
        lifecycleObserver = NotificationCenter.default.addObserver(
            forName: .bronzeKeysStopAllNotes,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.silenceForBackground() }
        }
    }

    deinit {
        meterTimer?.invalidate()
        if let lifecycleObserver { NotificationCenter.default.removeObserver(lifecycleObserver) }
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

    func envelopeValue(_ parameter: EnvelopeParameter, moduleIndex: Int) -> Double {
        guard moduleEnvelopes.indices.contains(moduleIndex) else { return 0 }
        let envelope = moduleEnvelopes[moduleIndex]
        switch parameter {
        case .attack: return envelope.attackMs / 15_000
        case .release: return envelope.releaseMs / 25_000
        case .hold: return envelope.holdMs / 15_000
        case .decay: return envelope.decayMs / 25_000
        case .sustain: return (envelope.sustainDb + 60) / 60
        }
    }

    func envelopeValueText(_ parameter: EnvelopeParameter, moduleIndex: Int) -> String {
        guard moduleEnvelopes.indices.contains(moduleIndex) else { return "—" }
        let envelope = moduleEnvelopes[moduleIndex]
        switch parameter {
        case .attack: return Self.formatMilliseconds(envelope.attackMs)
        case .release: return Self.formatMilliseconds(envelope.releaseMs)
        case .hold: return Self.formatMilliseconds(envelope.holdMs)
        case .decay: return Self.formatMilliseconds(envelope.decayMs)
        case .sustain:
            return envelope.sustainDb <= -60 ? "−∞ dB" : String(format: "%.1f dB", envelope.sustainDb)
        }
    }

    func setEnvelopeValue(
        _ parameter: EnvelopeParameter,
        moduleIndex: Int,
        normalized rawValue: Double
    ) {
        guard moduleEnvelopes.indices.contains(moduleIndex) else { return }
        let normalized = min(1, max(0, rawValue))
        var envelope = moduleEnvelopes[moduleIndex]
        switch parameter {
        case .attack: envelope.attackMs = normalized * 15_000
        case .release: envelope.releaseMs = normalized * 25_000
        case .hold: envelope.holdMs = normalized * 15_000
        case .decay: envelope.decayMs = normalized * 25_000
        case .sustain: envelope.sustainDb = -60 + normalized * 60
        }
        moduleEnvelopes[moduleIndex] = envelope
        _ = engine.configureModuleEnvelope(
            moduleIndex,
            attackMs: Float(envelope.attackMs),
            holdMs: Float(envelope.holdMs),
            decayMs: Float(envelope.decayMs),
            releaseMs: Float(envelope.releaseMs),
            glideMs: 0,
            sustainDb: Float(envelope.sustainDb)
        )
    }

    func setTempo(_ value: Double) {
        tempo = min(300, max(60, value))
        _ = engine.setTempo(Float(tempo))
        applyMetronome(restart: false)
    }

    func toggleMetronome() {
        metronomeEnabled.toggle()
        applyMetronome(restart: metronomeEnabled)
    }

    func selectMetronomeClick(_ sound: Int) {
        metronomeClickSound = min(5, max(1, sound))
        applyMetronome(restart: false)
    }

    func setTimeSignature(numerator: Int, denominator: Int) {
        timeSignatureNumerator = min(16, max(1, numerator))
        timeSignatureDenominator = [2, 4, 8, 16].contains(denominator) ? denominator : 4
        applyMetronome(restart: metronomeEnabled)
    }

    func setKeyboardNote(_ note: Int, pressed: Bool, velocity: Int) {
        guard (0...127).contains(note) else { return }
        if pressed {
            guard heldKeyboardNotes.insert(note).inserted else { return }
            _ = engine.sendMidi(
                fromSlot: 3, status: 0x90, data1: note,
                data2: min(127, max(1, velocity)), timestamp: 0
            )
        } else {
            guard heldKeyboardNotes.remove(note) != nil else { return }
            _ = engine.sendMidi(
                fromSlot: 3, status: 0x80, data1: note, data2: 0, timestamp: 0
            )
        }
    }

    func stopPerformanceNotes() {
        for note in heldKeyboardNotes {
            _ = engine.sendMidi(
                fromSlot: 3, status: 0x80, data1: note, data2: 0, timestamp: 0
            )
        }
        heldKeyboardNotes.removeAll()
    }

    func silenceForBackground() {
        stopPerformanceNotes()
        engine.stopAllNotes()
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

    func toggleOrganRotarySpeed() {
        let next = !organRotaryFast
        guard engine.setOrganRotaryFast(next) else { return }
        organRotaryFast = next
    }

    func toggleOrganCabinet() {
        let next = !organCabinetEnabled
        guard engine.setOrganCabinetEnabled(next) else { return }
        organCabinetEnabled = next
    }

    private func startMeters() {
        meterTimer?.invalidate()
        meterTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            let values = self.engine.moduleMeterLevels()
            var nextLevels = Array(repeating: 0.0, count: self.moduleLevels.count)
            for index in nextLevels.indices {
                let left = index * 2 < values.count ? values[index * 2].doubleValue : 0
                let right = index * 2 + 1 < values.count ? values[index * 2 + 1].doubleValue : 0
                nextLevels[index] = max(left, right)
            }
            // Uma publicação por frame evita oito reconstruções consecutivas
            // da árvore SwiftUI quando todos os meters estão visíveis.
            self.moduleLevels = nextLevels
        }
        RunLoop.main.add(meterTimer!, forMode: .common)
    }

    private func applyMetronome(restart: Bool) {
        _ = engine.configureMetronomeEnabled(
            metronomeEnabled,
            bpm: Float(tempo),
            volume: 1,
            clickSound: metronomeClickSound,
            accentEnabled: true,
            doubleTimeEnabled: false,
            timeSignatureNumerator: timeSignatureNumerator,
            timeSignatureDenominator: timeSignatureDenominator,
            restart: restart
        )
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

    private static func formatMilliseconds(_ value: Double) -> String {
        if value >= 1_000 {
            return String(format: "%.1f s", value / 1_000)
        }
        return String(format: "%.0f ms", value)
    }
}

extension Notification.Name {
    static let bronzeKeysStopAllNotes = Notification.Name("BronzeKeysStopAllNotes")
}
