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

    typealias ModuleEnvelope = BronzeEnvelope

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

    struct UserSoundFont: Identifiable, Hashable, Sendable {
        let url: URL
        var id: String { url.path }
        var name: String { url.deletingPathExtension().lastPathComponent }
    }

    struct BundledLoop: Identifiable, Sendable {
        let id: Int
        let name: String
        let fileName: String
        let numerator: Int
        let denominator: Int
    }

    let bundledLoops = [
        BundledLoop(id: 1, name: "Beat 4/4", fileName: "Beat 4-4", numerator: 4, denominator: 4),
        BundledLoop(id: 2, name: "Beat 4/4 - 2", fileName: "Beat 4-4 2", numerator: 4, denominator: 4),
        BundledLoop(id: 3, name: "Beat 6/8", fileName: "Beat 6-8", numerator: 6, denominator: 8)
    ]
    @Published private(set) var selectedLoop: BundledLoop? { didSet { scheduleSessionSave() } }
    @Published private(set) var loadingLoop = false
    @Published private(set) var loopPlaying = false
    @Published private(set) var loopPosition = 0.0
    @Published private(set) var loopDuration = 0.0
    private var loopDurations: [Int: Double] = [:]
    private var trackStatusPending = false

    let engine = HookKeysNativeEngine()
    @Published private(set) var engineState: EngineState = .idle
    @Published private(set) var midiDevices: [MidiDevice] = []
    @Published var selectedModule = 0 { didSet { scheduleSessionSave() } }
    @Published var page: Page = .modules
    @Published var tempo = 120.0 { didSet { scheduleSessionSave() } }
    @Published private(set) var metronomeEnabled = false
    @Published private(set) var metronomeClickSound = 1 { didSet { scheduleSessionSave() } }
    @Published private(set) var timeSignatureNumerator = 4 { didSet { scheduleSessionSave() } }
    @Published private(set) var timeSignatureDenominator = 4 { didSet { scheduleSessionSave() } }
    @Published var moduleLevels = Array(repeating: 0.0, count: 8)
    @Published var moduleFaders = Array(repeating: 1.0, count: 8) { didSet { scheduleSessionSave() } }
    @Published private(set) var moduleEnabled = [false, false, false, false, false, false, true, false] { didSet { scheduleSessionSave() } }
    @Published private(set) var soloModule: Int? { didSet { scheduleSessionSave() } }
    @Published var controlError: String?
    @Published private(set) var userSoundFonts: [UserSoundFont] = []
    @Published private(set) var loadingSoundFontModule: Int?
    @Published private(set) var moduleSoundFonts: [UserSoundFont?] = Array(repeating: nil, count: 6) { didSet { scheduleSessionSave() } }
    @Published private(set) var moduleEnvelopes = Array(repeating: ModuleEnvelope(), count: 8) { didSet { scheduleSessionSave() } }
    @Published private(set) var moduleEqualizers = Array(repeating: BronzeEqualizer(), count: 8) { didSet { scheduleSessionSave() } }
    @Published private(set) var moduleReverbs = Array(repeating: BronzeReverb(), count: 8)
    @Published private(set) var updatingReverb = false
    private var committedReverbs = Array(repeating: BronzeReverb(), count: 8)
    private var pendingReverbs: [Int: BronzeReverb] = [:]
    @Published private(set) var moduleDelays = Array(repeating: BronzeDelay(), count: 8)
    @Published private(set) var updatingDelay = false
    private var committedDelays = Array(repeating: BronzeDelay(), count: 8)
    private var pendingDelays: [Int: BronzeDelay] = [:]
    @Published private(set) var moduleSoundEffects = Array(repeating: BronzeSoundEffects(), count: 8)
    @Published private(set) var synth = BronzeSynth()
    @Published private(set) var modulePulses = Array(repeating: BronzePulse(), count: 8) { didSet { scheduleSessionSave() } }
    @Published private(set) var updatingSoundEffects = false
    private var committedSoundEffects = Array(repeating: BronzeSoundEffects(), count: 8)
    private var pendingSoundEffects: [Int: BronzeSoundEffects] = [:]
    var updatingEffects: Bool { updatingReverb || updatingDelay || updatingSoundEffects }
    @Published private(set) var padFilterLow = 0.0 { didSet { scheduleSessionSave() } }
    @Published private(set) var padFilterHigh = 1.0 { didSet { scheduleSessionSave() } }
    @Published private(set) var selectedPadBank = 0 { didSet { scheduleSessionSave() } }
    private var activePadBank = 0
    private var pressedEffects = Set<Int>()
    @Published var activePad: Int?
    @Published var activeEffect: Int?
    @Published var organDrawbars = [1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0] { didSet { scheduleSessionSave() } }
    @Published private(set) var organRotaryFast = false { didSet { scheduleSessionSave() } }
    @Published private(set) var organCabinetEnabled = true { didSet { scheduleSessionSave() } }
    @Published private(set) var bundledEffectsReady = false
    private var heldKeyboardNotes = Set<Int>()
    @Published private(set) var presets = BronzeNativeSession().presets
    @Published private(set) var presetBank = 0
    @Published private(set) var activePreset: Int?
    @Published private(set) var isApplyingSnapshot = false
    @Published private(set) var persistenceAvailable = false
    private var pendingSessionSave: DispatchWorkItem?
    private let persistenceQueue = DispatchQueue(label: "app.bronzekeys.native.session", qos: .utility)

    enum Page: String, CaseIterable, Identifiable {
        case modules = "Módulos"
        case organ = "Bronze B3"
        case pads = "Pads / FX"
        case presets = "Presets"
        case loops = "Loops"
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
                    self.refreshUserSoundFonts()
                    self.restoreSession()
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
        guard normalized.isFinite else { return }
        let normalized = min(1, max(0, normalized))
        // Curva útil na região baixa: 0 é silêncio e o restante cobre -36…0 dB.
        let db = normalized <= 0 ? -90 : -36 + Float(normalized) * 36
        guard engine.setModuleGainDb(db, moduleIndex: moduleIndex) else {
            controlError = "Não foi possível alterar o volume. Tente novamente."
            return
        }
        moduleFaders[moduleIndex] = normalized
    }

    func selectModule(_ index: Int) {
        guard moduleEnabled.indices.contains(index) else { return }
        selectedModule = index
        page = .modules
    }

    func moduleReceivesNotes(_ index: Int) -> Bool {
        guard moduleEnabled.indices.contains(index) else { return false }
        return soloModule.map { $0 == index } ?? moduleEnabled[index]
    }

    func toggleModuleEnabled(_ index: Int) {
        guard moduleEnabled.indices.contains(index) else { return }
        var next = moduleEnabled
        // OFF no módulo em Solo encerra o Solo e desliga esse módulo.
        if soloModule == index {
            next[index] = false
            applyModuleActivation(next, solo: nil)
        } else {
            next[index].toggle()
            applyModuleActivation(next, solo: soloModule)
        }
    }

    func toggleModuleSolo(_ index: Int) {
        guard moduleEnabled.indices.contains(index) else { return }
        // O Solo não altera os ON/OFF memorizados: ao sair, eles voltam.
        applyModuleActivation(moduleEnabled, solo: soloModule == index ? nil : index)
    }

    private func applyModuleActivation(_ enabled: [Bool], solo: Int?) {
        let mask = enabled.indices.reduce(0) { result, index in
            let receivesNotes = solo.map { $0 == index } ?? enabled[index]
            return receivesNotes ? result | (1 << index) : result
        }
        guard engine.setModuleEnabledMask(mask) else {
            controlError = "Não foi possível alterar ON/OFF ou Solo. Tente novamente."
            return
        }
        moduleEnabled = enabled
        soloModule = solo
    }

    func refreshUserSoundFonts() {
        audioQueue.async { [weak self] in
            do {
                let entries = try Self.readUserSoundFonts()
                DispatchQueue.main.async { self?.userSoundFonts = entries }
            } catch {
                DispatchQueue.main.async {
                    self?.controlError = "Não foi possível abrir a biblioteca local: \(error.localizedDescription)"
                }
            }
        }
    }

    func importSoundFont(_ source: URL, moduleIndex: Int) {
        guard (0..<6).contains(moduleIndex), loadingSoundFontModule == nil, !isApplyingSnapshot, engineState == .ready else { return }
        guard source.pathExtension.lowercased() == "sf2" else {
            controlError = "Selecione um arquivo .sf2."
            return
        }
        loadingSoundFontModule = moduleIndex
        let engine = self.engine
        let scoped = source.startAccessingSecurityScopedResource()
        audioQueue.async { [weak self] in
            defer { if scoped { source.stopAccessingSecurityScopedResource() } }
            var createdDirectory: URL?
            do {
                let directory = try Self.soundFontDirectory().appendingPathComponent(UUID().uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                createdDirectory = directory
                let destination = directory.appendingPathComponent(source.lastPathComponent)
                try FileManager.default.copyItem(at: source, to: destination)
                guard engine.loadSoundFont(atPath: destination.path, moduleIndex: moduleIndex) else {
                    throw NSError(domain: "BronzeSoundFont", code: 1, userInfo: [
                        NSLocalizedDescriptionKey: "O arquivo SF2 está inválido ou não pôde ser carregado."
                    ])
                }
                let entry = UserSoundFont(url: destination)
                DispatchQueue.main.async {
                    self?.finishSoundFontLoad(entry, moduleIndex: moduleIndex)
                    self?.refreshUserSoundFonts()
                }
            } catch {
                // Só remove a cópia recém-criada, nunca o documento original.
                if let createdDirectory { try? FileManager.default.removeItem(at: createdDirectory) }
                let message = error.localizedDescription
                DispatchQueue.main.async {
                    self?.loadingSoundFontModule = nil
                    self?.controlError = "Falha ao importar: \(message)"
                }
            }
        }
    }

    func selectUserSoundFont(_ entry: UserSoundFont, moduleIndex: Int) {
        guard (0..<6).contains(moduleIndex), loadingSoundFontModule == nil,
              !isApplyingSnapshot, engineState == .ready, userSoundFonts.contains(entry) else { return }
        loadingSoundFontModule = moduleIndex
        let engine = self.engine
        audioQueue.async { [weak self] in
            let loaded = engine.loadSoundFont(atPath: entry.url.path, moduleIndex: moduleIndex)
            DispatchQueue.main.async {
                guard let self else { return }
                if loaded {
                    self.finishSoundFontLoad(entry, moduleIndex: moduleIndex)
                } else {
                    self.loadingSoundFontModule = nil
                    self.controlError = "Não foi possível carregar \(entry.name). O timbre anterior foi mantido."
                }
            }
        }
    }

    private func finishSoundFontLoad(_ entry: UserSoundFont, moduleIndex: Int) {
        moduleSoundFonts[moduleIndex] = entry
        loadingSoundFontModule = nil
        var next = moduleEnabled
        next[moduleIndex] = true
        applyModuleActivation(next, solo: soloModule)
    }

    nonisolated private static func soundFontDirectory() throws -> URL {
        try BronzeSessionStore.applicationStore().soundFontDirectory
    }

    nonisolated private static func readUserSoundFonts() throws -> [UserSoundFont] {
        let root = try soundFontDirectory()
        guard FileManager.default.fileExists(atPath: root.path) else { return [] }
        let directories = try FileManager.default.contentsOfDirectory(at: root,
            includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])
        var entries: [UserSoundFont] = []
        for directory in directories where UUID(uuidString: directory.lastPathComponent) != nil {
            let files = try FileManager.default.contentsOfDirectory(at: directory,
                includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles])
            for file in files where file.pathExtension.lowercased() == "sf2" {
                if try file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
                    entries.append(UserSoundFont(url: file))
                }
            }
        }
        return entries.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
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
        guard moduleEnvelopes.indices.contains(moduleIndex), rawValue.isFinite else { return }
        let normalized = min(1, max(0, rawValue))
        var envelope = moduleEnvelopes[moduleIndex]
        switch parameter {
        case .attack: envelope.attackMs = normalized * 15_000
        case .release: envelope.releaseMs = normalized * 25_000
        case .hold: envelope.holdMs = normalized * 15_000
        case .decay: envelope.decayMs = normalized * 25_000
        case .sustain: envelope.sustainDb = -60 + normalized * 60
        }
        guard engine.configureModuleEnvelope(
            moduleIndex,
            attackMs: Float(envelope.attackMs),
            holdMs: Float(envelope.holdMs),
            decayMs: Float(envelope.decayMs),
            releaseMs: Float(envelope.releaseMs),
            glideMs: 0,
            sustainDb: Float(envelope.sustainDb)
        ) else {
            controlError = "Não foi possível ajustar o envelope."
            return
        }
        moduleEnvelopes[moduleIndex] = envelope
    }

    func setTempo(_ value: Double) {
        guard value.isFinite, !loadingLoop else { return }
        tempo = min(300, max(60, value))
        _ = engine.setTempo(Float(tempo))
        refreshPulseClock()
        if let selectedLoop {
            _ = engine.controlTrackId(selectedLoop.id, action: "rate", seconds: 0,
                                      loop: true, playbackRate: tempo / 120, syncMetronome: false)
        }
        applyMetronome(restart: false)
    }

    func setEqualizer(_ equalizer: BronzeEqualizer, moduleIndex: Int) {
        guard moduleEqualizers.indices.contains(moduleIndex), !isApplyingSnapshot else { return }
        do { try equalizer.validate() } catch { return }
        guard Self.sendEqualizer(equalizer, moduleIndex: moduleIndex, engine: engine) else {
            controlError = "Não foi possível ajustar o equalizador."
            return
        }
        moduleEqualizers[moduleIndex] = equalizer
    }

    func editEQBand(_ index: Int, moduleIndex: Int, edit: (inout BronzeEQBand) -> Void) {
        guard moduleEqualizers.indices.contains(moduleIndex), (0..<5).contains(index) else { return }
        var eq = moduleEqualizers[moduleIndex]
        edit(&eq.bands[index])
        setEqualizer(eq, moduleIndex: moduleIndex)
    }

    nonisolated private static func sendEqualizer(_ eq: BronzeEqualizer, moduleIndex: Int,
                                                  engine: HookKeysNativeEngine) -> Bool {
        engine.configureEqualizer(moduleIndex, enabled: eq.enabled,
            types: eq.bands.map { NSNumber(value: $0.type) },
            frequencies: eq.bands.map { NSNumber(value: $0.frequency) },
            gains: eq.bands.map { NSNumber(value: $0.gain) },
            qualities: eq.bands.map { NSNumber(value: $0.quality) },
            cutStages: eq.bands.map { NSNumber(value: $0.cutStages) })
    }

    func toggleMetronome() {
        metronomeEnabled.toggle()
        applyMetronome(restart: metronomeEnabled && !loopPlaying)
    }

    func setReverb(_ reverb: BronzeReverb, moduleIndex: Int) {
        guard moduleReverbs.indices.contains(moduleIndex), !isApplyingSnapshot, engineState == .ready else { return }
        do { try reverb.validate() } catch { return }
        guard moduleReverbs[moduleIndex] != reverb else { return }
        moduleReverbs[moduleIndex] = reverb
        // Only the newest drag value waits behind an IR preparation. No long
        // FIFO of obsolete Mix positions and no convolution allocation on main.
        pendingReverbs[moduleIndex] = reverb
        if !updatingReverb { sendNextReverb() }
    }

    private func sendNextReverb() {
        guard let index = pendingReverbs.keys.min(), let next = pendingReverbs.removeValue(forKey: index) else {
            updatingReverb = false
            scheduleSessionSave()
            return
        }
        updatingReverb = true
        let engine = self.engine
        audioQueue.async { [weak self] in
            let success = engine.configureReverb(index, enabled: next.enabled, impulse: next.impulse,
                mix: Float(next.mix), decay: Float(next.decay))
            DispatchQueue.main.async {
                guard let self else { return }
                if success {
                    self.committedReverbs[index] = next
                } else if self.pendingReverbs[index] == nil {
                    self.moduleReverbs[index] = self.committedReverbs[index]
                    self.controlError = "Não foi possível preparar o reverb. O ajuste anterior foi mantido."
                }
                self.sendNextReverb()
            }
        }
    }

    func setDelay(_ delay: BronzeDelay, moduleIndex: Int) {
        guard moduleDelays.indices.contains(moduleIndex), !isApplyingSnapshot, engineState == .ready else { return }
        do { try delay.validate() } catch { return }
        guard moduleDelays[moduleIndex] != delay else { return }
        moduleDelays[moduleIndex] = delay
        pendingDelays[moduleIndex] = delay
        if !updatingDelay { sendNextDelay() }
    }

    private func sendNextDelay() {
        guard let index = pendingDelays.keys.min(), let next = pendingDelays.removeValue(forKey: index) else {
            updatingDelay = false
            scheduleSessionSave()
            return
        }
        updatingDelay = true
        let engine = self.engine
        audioQueue.async { [weak self] in
            let success = Self.sendDelay(next, moduleIndex: index, engine: engine)
            DispatchQueue.main.async {
                guard let self else { return }
                if success {
                    self.committedDelays[index] = next
                } else if self.pendingDelays[index] == nil {
                    self.moduleDelays[index] = self.committedDelays[index]
                    self.controlError = "Não foi possível preparar o Delay. O ajuste anterior foi mantido."
                }
                self.sendNextDelay()
            }
        }
    }

    nonisolated private static func sendDelay(_ delay: BronzeDelay, moduleIndex: Int, engine: HookKeysNativeEngine) -> Bool {
        engine.configureDelay(moduleIndex, enabled: delay.enabled, sync: delay.sync,
            milliseconds: Float(delay.milliseconds), beatMultiplier: Float(delay.beatMultiplier),
            feedback: Float(delay.feedback), mix: Float(delay.mix))
    }

    func setSoundEffects(_ effects: BronzeSoundEffects, moduleIndex: Int) {
        guard moduleSoundEffects.indices.contains(moduleIndex), !isApplyingSnapshot, engineState == .ready else { return }
        do { try effects.validate(moduleIndex: moduleIndex) } catch { return }
        guard moduleSoundEffects[moduleIndex] != effects else { return }
        moduleSoundEffects[moduleIndex] = effects
        pendingSoundEffects[moduleIndex] = effects
        if !updatingSoundEffects { sendNextSoundEffects() }
    }

    private func sendNextSoundEffects() {
        guard let index = pendingSoundEffects.keys.min(), let next = pendingSoundEffects.removeValue(forKey: index) else {
            updatingSoundEffects = false
            scheduleSessionSave()
            return
        }
        updatingSoundEffects = true
        let engine = self.engine
        audioQueue.async { [weak self] in
            let success = Self.sendSoundEffects(next, moduleIndex: index, engine: engine)
            DispatchQueue.main.async {
                guard let self else { return }
                if success { self.committedSoundEffects[index] = next }
                else if self.pendingSoundEffects[index] == nil {
                    self.moduleSoundEffects[index] = self.committedSoundEffects[index]
                    self.controlError = "Não foi possível ajustar o efeito. O ajuste anterior foi mantido."
                }
                self.sendNextSoundEffects()
            }
        }
    }

    nonisolated private static func sendSoundEffects(_ effects: BronzeSoundEffects, moduleIndex: Int,
                                                     engine: HookKeysNativeEngine) -> Bool {
        engine.configureSoundEffects(moduleIndex,
            compressorEnabled: effects.compressor.enabled, compressor: effects.compressor.values.map { NSNumber(value: $0) },
            chorusEnabled: effects.chorus.enabled, chorus: effects.chorus.values.map { NSNumber(value: $0) },
            vibesEnabled: effects.vibes.enabled, vibes: effects.vibes.values.map { NSNumber(value: $0) },
            vinylEnabled: effects.vibes.vinylEnabled)
    }

    func setSynth(_ next: BronzeSynth) {
        guard engineState == .ready, !isApplyingSnapshot else { return }
        do { try next.validate() } catch { return }
        guard Self.sendSynth(next, envelope: moduleEnvelopes[7], engine: engine) else {
            controlError = "Não foi possível ajustar o synth."
            return
        }
        synth = next
        scheduleSessionSave()
    }

    nonisolated private static func sendSynth(_ s: BronzeSynth, envelope e: BronzeEnvelope,
                                              engine: HookKeysNativeEngine) -> Bool {
        let a = s.oscillators[0], b = s.oscillators[1], c = s.oscillators[2]
        return engine.configureSynth(a.shape, oscillator2: b.shape, oscillator3: c.shape,
            oscillator1Enabled: a.enabled, oscillator2Enabled: b.enabled, oscillator3Enabled: c.enabled,
            voiceMode: s.mode, lfoTarget: s.lfoTarget,
            oscillator1Volume: Float(a.volume), oscillator2Volume: Float(b.volume), oscillator3Volume: Float(c.volume),
            oscillator1DetuneCents: Float(a.detune), oscillator2DetuneCents: Float(b.detune), oscillator3DetuneCents: Float(c.detune),
            attackMs: Float(e.attackMs), holdMs: Float(e.holdMs), decayMs: Float(e.decayMs), sustain: 1, releaseMs: Float(e.releaseMs),
            filterCutoffHz: Float(s.cutoff), filterResonance: Float(s.resonance), filterEnvelope: Float(s.filterEnvelope),
            lfoRateHz: Float(s.lfoRate), lfoDepth: Float(s.lfoDepth), glideMs: Float(s.glide),
            oscillator1Octave: a.octave, oscillator2Octave: b.octave, oscillator3Octave: c.octave)
    }

    func selectMetronomeClick(_ sound: Int) {
        metronomeClickSound = min(5, max(1, sound))
        applyMetronome(restart: false)
    }

    func setTimeSignature(numerator: Int, denominator: Int) {
        timeSignatureNumerator = min(16, max(1, numerator))
        timeSignatureDenominator = [2, 4, 8, 16].contains(denominator) ? denominator : 4
        refreshPulseClock()
        applyMetronome(restart: metronomeEnabled && !loopPlaying)
    }

    func setPulse(_ pulse: BronzePulse, moduleIndex: Int) {
        guard modulePulses.indices.contains(moduleIndex), !isApplyingSnapshot, engineState == .ready else { return }
        do { try pulse.validate() } catch { return }
        guard Self.sendPulse(pulse, moduleIndex: moduleIndex, tempo: tempo,
            numerator: timeSignatureNumerator, denominator: timeSignatureDenominator, engine: engine) else {
            controlError = "Não foi possível ajustar o Pulse."
            return
        }
        modulePulses[moduleIndex] = pulse
    }

    private func refreshPulseClock() {
        for index in modulePulses.indices where modulePulses[index].enabled {
            if !Self.sendPulse(modulePulses[index], moduleIndex: index, tempo: tempo,
                numerator: timeSignatureNumerator, denominator: timeSignatureDenominator, engine: engine) {
                controlError = "Não foi possível sincronizar o Pulse. Tente novamente."
            }
        }
    }

    nonisolated private static func sendPulse(_ pulse: BronzePulse, moduleIndex: Int, tempo: Double,
        numerator: Int, denominator: Int, engine: HookKeysNativeEngine) -> Bool {
        engine.configureTranceGate(moduleIndex, enabled: pulse.enabled, steps: pulse.steps, length: pulse.length,
            beatMultiplier: Float(pulse.beatMultiplier(bpm: tempo)),
            measureBeats: Float(pulse.measureBeats(numerator: numerator, denominator: denominator)),
            gate: Float(pulse.gate), depth: Float(pulse.depth), attackMs: Float(pulse.attack),
            releaseMs: Float(pulse.release), swing: Float(pulse.swing))
    }

    func selectLoop(_ loop: BundledLoop) {
        guard !loadingLoop, engineState == .ready else { return }
        guard selectedLoop?.id != loop.id else { return }
        guard let url = Bundle.main.url(forResource: loop.fileName, withExtension: "mp3",
                                        subdirectory: "loops") else {
            controlError = "O arquivo de \(loop.name) não foi encontrado no app."
            return
        }
        let previousID = selectedLoop?.id
        loadingLoop = true
        let engine = self.engine
        let cachedDuration = loopDurations[loop.id]
        audioQueue.async { [weak self] in
            let duration = cachedDuration ?? engine.loadTrackId(loop.id, path: url.path)
            if duration > 0, let previousID {
                _ = engine.controlTrackId(previousID, action: "pause", seconds: 0,
                                          loop: true, playbackRate: 1, syncMetronome: false)
            }
            DispatchQueue.main.async {
                guard let self else { return }
                self.loadingLoop = false
                guard duration > 0 else {
                    self.controlError = "Não foi possível carregar \(loop.name)."
                    return
                }
                self.loopDurations[loop.id] = duration
                self.selectedLoop = loop
                self.loopDuration = duration
                self.loopPosition = 0
                self.loopPlaying = false
                self.setTimeSignature(numerator: loop.numerator, denominator: loop.denominator)
            }
        }
    }

    func toggleLoopPlayback() {
        guard let selectedLoop, !loadingLoop else { return }
        if loopPlaying {
            guard engine.controlTrackId(selectedLoop.id, action: "pause", seconds: 0,
                                        loop: true, playbackRate: 1, syncMetronome: false) else { return }
            loopPlaying = false
            loopPosition = 0
            applyMetronome(restart: false)
            return
        }
        // Cada Play começa do início. O runtime reinicia o click no mesmo
        // callback de áudio que começa a reproduzir o loop.
        let id = selectedLoop.id
        guard engine.controlTrackId(id, action: "loop", seconds: 0, loop: true,
                                    playbackRate: 1, syncMetronome: false),
              engine.controlTrackId(id, action: "rate", seconds: 0, loop: true,
                                    playbackRate: tempo / 120, syncMetronome: false),
              engine.controlTrackId(id, action: "seek", seconds: 0, loop: true,
                                    playbackRate: 1, syncMetronome: false) else {
            controlError = "Não foi possível preparar o loop."
            return
        }
        loopPlaying = true
        applyMetronome(restart: false)
        guard engine.controlTrackId(id, action: "play", seconds: 0, loop: true,
                                    playbackRate: tempo / 120, syncMetronome: true) else {
            loopPlaying = false
            applyMetronome(restart: false)
            controlError = "Não foi possível iniciar o loop."
            return
        }
    }

    private func refreshLoopPosition() {
        guard loopPlaying, !loadingLoop, !trackStatusPending, let id = selectedLoop?.id else { return }
        trackStatusPending = true
        let engine = self.engine
        audioQueue.async { [weak self] in
            let status = engine.trackStatus()
            let sourceID = (status["activeId"] as? NSNumber)?.intValue
            let position = (status["positionSeconds"] as? NSNumber)?.doubleValue ?? 0
            DispatchQueue.main.async {
                guard let self else { return }
                self.trackStatusPending = false
                if self.loopPlaying && self.selectedLoop?.id == id && sourceID == id {
                    self.loopPosition = position
                }
            }
        }
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
        saveSessionNow()
        stopPerformanceNotes()
        endEffectTouches()
        engine.stopAllNotes()
    }

    func togglePad(_ index: Int) {
        guard (0..<12).contains(index), engineState == .ready else { return }
        let stopping = activePad == index && activePadBank == selectedPadBank
        if let previous = activePad {
            guard engine.setPadNote(60 + previous, bankIndex: activePadBank, enabled: false, velocity: 127) else {
                controlError = "Não foi possível liberar o pad anterior."
                return
            }
        }
        activePad = nil
        guard !stopping else { return }
        guard engine.setPadNote(60 + index, bankIndex: selectedPadBank, enabled: true, velocity: 127) else {
            controlError = "Não foi possível iniciar o pad."
            return
        }
        activePadBank = selectedPadBank
        activePad = index
    }

    func selectPadBank(_ bank: Int) {
        guard (0..<2).contains(bank) else { return }
        selectedPadBank = bank
    }

    func isPadActive(_ index: Int) -> Bool {
        activePad == index && activePadBank == selectedPadBank
    }

    func padFilterText(_ normalized: Double) -> String {
        let hz = 20 * pow(1000, normalized)
        return hz >= 1000 ? String(format: "%.1f kHz", hz / 1000) : String(format: "%.0f Hz", hz)
    }

    func setPadFilter(low: Bool, normalized: Double) {
        guard normalized.isFinite else { return }
        let value = min(1, max(0, normalized))
        let nextLow = low ? value : padFilterLow
        let nextHigh = low ? padFilterHigh : value
        guard engine.setPadOutputGainDb(0, enabled: true, channelStart: 0, channelCount: 2,
            lowCutHz: Float(20 * pow(1000, nextLow)), highCutHz: Float(20 * pow(1000, nextHigh))) else {
            controlError = "Não foi possível ajustar o filtro dos pads."
            return
        }
        padFilterLow = nextLow
        padFilterHigh = nextHigh
    }

    func triggerEffect(_ index: Int, pressed: Bool) {
        guard (0..<12).contains(index), bundledEffectsReady else { return }
        if pressed {
            guard !pressedEffects.contains(index) else { return }
            guard engine.triggerEffect(bankIndex: 0, itemIndex: index, enabled: true, gainDb: 0) else {
                controlError = "Não foi possível tocar o efeito."
                return
            }
            pressedEffects.insert(index)
            activeEffect = index
        } else {
            // FX 1 é momentâneo, mas o arquivo continua até o fim (Infinite
            // Release); soltar só encerra o estado visual do botão.
            pressedEffects.remove(index)
            if activeEffect == index { activeEffect = pressedEffects.sorted().last }
        }
    }

    func endEffectTouches() {
        pressedEffects.removeAll()
        activeEffect = nil
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
            self.refreshLoopPosition()
        }
        RunLoop.main.add(meterTimer!, forMode: .common)
    }

    private func applyMetronome(restart: Bool) {
        _ = engine.configureMetronomeEnabled(
            metronomeEnabled || loopPlaying,
            bpm: Float(tempo),
            volume: metronomeEnabled ? 1 : 0,
            clickSound: metronomeClickSound,
            accentEnabled: !loopPlaying,
            doubleTimeEnabled: false,
            timeSignatureNumerator: timeSignatureNumerator,
            timeSignatureDenominator: timeSignatureDenominator,
            restart: restart
        )
    }

    private func loadBundledEffects() {
        let urls = Bundle.main.urls(
            forResourcesWithExtension: "mp3",
            subdirectory: "fx-1"
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

    private func moduleSnapshot() -> [BronzeModuleSnapshot] {
        (0..<8).map { index in
            let url = index < 6 ? moduleSoundFonts[index]?.url : nil
            let key = url.map { $0.deletingLastPathComponent().lastPathComponent + "/" + $0.lastPathComponent }
            return BronzeModuleSnapshot(soundFontKey: key, enabled: moduleEnabled[index],
                fader: moduleFaders[index], envelope: moduleEnvelopes[index], equalizer: moduleEqualizers[index],
                reverb: moduleReverbs[index], delay: moduleDelays[index], soundEffects: moduleSoundEffects[index],
                synth: index == 7 ? synth : nil, pulse: modulePulses[index])
        }
    }

    private func sessionSnapshot() -> BronzeNativeSession {
        var session = BronzeNativeSession()
        session.modules = moduleSnapshot()
        session.presets = presets
        session.bank = presetBank
        session.activePreset = activePreset
        session.selectedModule = selectedModule
        session.soloModule = soloModule
        session.organDrawbars = organDrawbars.map { Int(($0 * 8).rounded()) }
        session.organRotaryFast = organRotaryFast
        session.organCabinetEnabled = organCabinetEnabled
        session.tempo = tempo
        session.clickSound = metronomeClickSound
        session.numerator = timeSignatureNumerator
        session.denominator = timeSignatureDenominator
        session.padBank = selectedPadBank
        session.padLow = padFilterLow
        session.padHigh = padFilterHigh
        session.loopID = selectedLoop?.id
        return session
    }

    private func scheduleSessionSave() {
        guard persistenceAvailable, !isApplyingSnapshot, !updatingEffects else { return }
        pendingSessionSave?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.saveSessionNow() }
        pendingSessionSave = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: work)
    }

    private func saveSessionNow() {
        pendingSessionSave?.cancel()
        pendingSessionSave = nil
        guard persistenceAvailable, !isApplyingSnapshot, !updatingEffects else { return }
        let session = sessionSnapshot()
        persistenceQueue.async { [weak self] in
            do { try BronzeSessionStore.applicationStore().save(session) }
            catch {
                let message = error.localizedDescription
                DispatchQueue.main.async {
                    self?.persistenceAvailable = false
                    self?.controlError = "Falha ao salvar a sessão: \(message). O último arquivo salvo foi mantido."
                }
            }
        }
    }

    private func restoreSession() {
        isApplyingSnapshot = true
        let engine = self.engine
        audioQueue.async { [weak self] in
            do {
                let store = try BronzeSessionStore.applicationStore()
                let session = try store.load()
                var fonts: [UserSoundFont?] = Array(repeating: nil, count: 6)
                if let session {
                    fonts = try Self.applySnapshot(session.modules, previous: [],
                        solo: session.soloModule, tempo: session.tempo, numerator: session.numerator,
                        denominator: session.denominator, engine: engine, store: store)
                }
                DispatchQueue.main.async {
                    guard let self else { return }
                    if let session {
                        self.adoptModules(session.modules, fonts: fonts, solo: session.soloModule)
                        self.presets = session.presets
                        self.presetBank = session.bank
                        self.activePreset = session.activePreset
                        self.selectedModule = session.selectedModule
                        self.organDrawbars = session.organDrawbars.map { Double($0) / 8 }
                        _ = engine.configureOrganDrawbars(session.organDrawbars.map { NSNumber(value: $0) })
                        self.organRotaryFast = session.organRotaryFast
                        self.organCabinetEnabled = session.organCabinetEnabled
                        _ = engine.setOrganRotaryFast(session.organRotaryFast)
                        _ = engine.setOrganCabinetEnabled(session.organCabinetEnabled)
                        self.setTempo(session.tempo)
                        self.selectMetronomeClick(session.clickSound)
                        self.setTimeSignature(numerator: session.numerator, denominator: session.denominator)
                        self.selectPadBank(session.padBank)
                        self.setPadFilter(low: true, normalized: session.padLow)
                        self.setPadFilter(low: false, normalized: session.padHigh)
                    }
                    self.isApplyingSnapshot = false
                    self.persistenceAvailable = true
                    // Restore selection, never autoplay a loop, pad, FX or click.
                    if let id = session?.loopID, let loop = self.bundledLoops.first(where: { $0.id == id }) {
                        self.selectLoop(loop)
                    }
                }
            } catch {
                let message = error.localizedDescription
                DispatchQueue.main.async {
                    self?.isApplyingSnapshot = false
                    self?.persistenceAvailable = false
                    self?.controlError = "Não foi possível restaurar a sessão: \(message) O salvamento automático está suspenso para preservar seus dados."
                }
            }
        }
    }

    func selectPresetBank(_ bank: Int) {
        guard (0..<6).contains(bank), !isApplyingSnapshot else { return }
        presetBank = bank
        scheduleSessionSave()
    }

    func savePreset(_ index: Int, name: String, color: Int) {
        guard presets.indices.contains(index), !isApplyingSnapshot, loadingSoundFontModule == nil,
              !updatingEffects, persistenceAvailable else { return }
        let name = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        presets[index] = BronzePresetSlot(name: name.isEmpty ? "Preset \(index % 16 + 1)" : name,
            color: min(7, max(0, color)), modules: moduleSnapshot())
        activePreset = index
        saveSessionNow()
    }

    func renamePreset(_ index: Int, name: String, color: Int) {
        guard presets.indices.contains(index), presets[index].modules != nil,
              persistenceAvailable, !isApplyingSnapshot else { return }
        let trimmed = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        if !trimmed.isEmpty { presets[index].name = trimmed }
        presets[index].color = min(7, max(0, color))
        saveSessionNow()
    }

    func recallPreset(_ index: Int) {
        guard presets.indices.contains(index), let modules = presets[index].modules,
              !isApplyingSnapshot, !updatingEffects, loadingSoundFontModule == nil, engineState == .ready else { return }
        isApplyingSnapshot = true
        let previous = moduleSnapshot()
        let engine = self.engine
        let bpm = tempo
        let numerator = timeSignatureNumerator, denominator = timeSignatureDenominator
        audioQueue.async { [weak self] in
            do {
                let fonts = try Self.applySnapshot(modules, previous: previous, solo: nil, tempo: bpm,
                    numerator: numerator, denominator: denominator,
                    engine: engine, store: BronzeSessionStore.applicationStore())
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.adoptModules(modules, fonts: fonts, solo: nil)
                    self.activePreset = index
                    self.isApplyingSnapshot = false
                    self.saveSessionNow()
                }
            } catch {
                let message = error.localizedDescription
                DispatchQueue.main.async {
                    self?.isApplyingSnapshot = false
                    self?.controlError = "Não foi possível abrir o preset: \(message) O preset anterior continua ativo."
                }
            }
        }
    }

    private func adoptModules(_ modules: [BronzeModuleSnapshot], fonts: [UserSoundFont?], solo: Int?) {
        moduleSoundFonts = fonts
        moduleEnabled = modules.map(\.enabled)
        moduleFaders = modules.map(\.fader)
        moduleEnvelopes = modules.map(\.envelope)
        moduleEqualizers = modules.map(\.equalizer)
        moduleReverbs = modules.map(\.reverb)
        committedReverbs = moduleReverbs
        moduleDelays = modules.map(\.delay)
        committedDelays = moduleDelays
        moduleSoundEffects = modules.map { $0.soundEffects ?? BronzeSoundEffects() }
        committedSoundEffects = moduleSoundEffects
        synth = modules[7].synth ?? BronzeSynth()
        modulePulses = modules.map { $0.pulse ?? BronzePulse() }
        soloModule = solo
        // The B3 generator is shared, so change its envelope only after commit.
        let envelope = modules[6].envelope
        _ = engine.configureModuleEnvelope(6, attackMs: Float(envelope.attackMs), holdMs: Float(envelope.holdMs),
            decayMs: Float(envelope.decayMs), releaseMs: Float(envelope.releaseMs), glideMs: 0,
            sustainDb: Float(envelope.sustainDb))
    }

    nonisolated private static func applySnapshot(_ modules: [BronzeModuleSnapshot],
        previous: [BronzeModuleSnapshot], solo: Int?, tempo: Double, numerator: Int, denominator: Int,
        engine: HookKeysNativeEngine, store: BronzeSessionStore) throws -> [UserSoundFont?] {
        try BronzeNativeSession.validateModules(modules)
        let fonts: [UserSoundFont?] = try modules.prefix(6).map { module in
            guard let key = module.soundFontKey else { return nil }
            let url = try store.soundFontURL(for: key)
            guard FileManager.default.fileExists(atPath: url.path) else {
                throw NSError(domain: "BronzePreset", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: "SF2 ausente: \(url.lastPathComponent)."
                ])
            }
            return UserSoundFont(url: url)
        }
        guard engine.beginNativePresetTransition() else {
            throw NSError(domain: "BronzePreset", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Aguarde as notas anteriores terminarem e tente novamente."
            ])
        }
        var committed = false
        defer { if !committed { engine.cancelPresetTransition() } }
        for index in 0..<8 {
            if index < 6 {
                if let font = fonts[index] {
                    if previous.count != 8 || previous[index].soundFontKey != modules[index].soundFontKey {
                        guard engine.loadSoundFont(atPath: font.url.path, moduleIndex: index) else { throw BronzeSessionError.invalid }
                    }
                } else { engine.unloadSoundFont(fromModule: index) }
            }
            let module = modules[index]
            let db = module.fader <= 0 ? Float(-90) : Float(-36 + module.fader * 36)
            guard engine.setModuleGainDb(db, moduleIndex: index) else { throw BronzeSessionError.invalid }
            guard Self.sendEqualizer(module.equalizer, moduleIndex: index, engine: engine) else { throw BronzeSessionError.invalid }
            guard engine.configureReverb(index, enabled: module.reverb.enabled,
                impulse: module.reverb.impulse, mix: Float(module.reverb.mix),
                decay: Float(module.reverb.decay)) else { throw BronzeSessionError.invalid }
            guard Self.sendDelay(module.delay, moduleIndex: index, engine: engine) else { throw BronzeSessionError.invalid }
            guard Self.sendSoundEffects(module.soundEffects ?? BronzeSoundEffects(), moduleIndex: index, engine: engine)
            else { throw BronzeSessionError.invalid }
            guard Self.sendPulse(module.pulse ?? BronzePulse(), moduleIndex: index, tempo: tempo,
                numerator: numerator, denominator: denominator, engine: engine) else { throw BronzeSessionError.invalid }
            if index != 6 {
                let e = module.envelope
                guard engine.configureModuleEnvelope(index, attackMs: Float(e.attackMs), holdMs: Float(e.holdMs),
                    decayMs: Float(e.decayMs), releaseMs: Float(e.releaseMs), glideMs: 0,
                    sustainDb: Float(e.sustainDb)) else { throw BronzeSessionError.invalid }
            }
        }
        guard Self.sendSynth(modules[7].synth ?? BronzeSynth(), envelope: modules[7].envelope, engine: engine)
        else { throw BronzeSessionError.invalid }
        let mask = modules.indices.reduce(0) { mask, index in
            (solo.map { $0 == index } ?? modules[index].enabled) ? mask | (1 << index) : mask
        }
        guard engine.setModuleEnabledMask(mask), engine.setTempo(Float(tempo)), engine.commitPresetTransition() else {
            throw BronzeSessionError.invalid
        }
        committed = true
        return fonts
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
