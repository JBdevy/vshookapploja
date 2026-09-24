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
    @Published private(set) var selectedLoop: BundledLoop?
    @Published private(set) var loadingLoop = false
    @Published private(set) var loopPlaying = false
    @Published private(set) var loopPosition = 0.0
    @Published private(set) var loopDuration = 0.0
    private var loopDurations: [Int: Double] = [:]
    private var trackStatusPending = false

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
    @Published var moduleFaders = Array(repeating: 1.0, count: 8)
    @Published private(set) var moduleEnabled = [false, false, false, false, false, false, true, false]
    @Published private(set) var soloModule: Int?
    @Published var controlError: String?
    @Published private(set) var userSoundFonts: [UserSoundFont] = []
    @Published private(set) var loadingSoundFontModule: Int?
    @Published private(set) var moduleSoundFonts: [UserSoundFont?] = Array(repeating: nil, count: 6)
    @Published private(set) var moduleEnvelopes = Array(repeating: ModuleEnvelope(), count: 8)
    @Published private(set) var padFilterLow = 0.0
    @Published private(set) var padFilterHigh = 1.0
    @Published private(set) var selectedPadBank = 0
    private var activePadBank = 0
    private var pressedEffects = Set<Int>()
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
        guard (0..<6).contains(moduleIndex), loadingSoundFontModule == nil, engineState == .ready else { return }
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
              engineState == .ready, userSoundFonts.contains(entry) else { return }
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
        try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                    appropriateFor: nil, create: true)
            .appendingPathComponent("BronzeKeys/UserSoundFonts", isDirectory: true)
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
        guard value.isFinite, !loadingLoop else { return }
        tempo = min(300, max(60, value))
        _ = engine.setTempo(Float(tempo))
        if let selectedLoop {
            _ = engine.controlTrackId(selectedLoop.id, action: "rate", seconds: 0,
                                      loop: true, playbackRate: tempo / 120, syncMetronome: false)
        }
        applyMetronome(restart: false)
    }

    func toggleMetronome() {
        metronomeEnabled.toggle()
        applyMetronome(restart: metronomeEnabled && !loopPlaying)
    }

    func selectMetronomeClick(_ sound: Int) {
        metronomeClickSound = min(5, max(1, sound))
        applyMetronome(restart: false)
    }

    func setTimeSignature(numerator: Int, denominator: Int) {
        timeSignatureNumerator = min(16, max(1, numerator))
        timeSignatureDenominator = [2, 4, 8, 16].contains(denominator) ? denominator : 4
        applyMetronome(restart: metronomeEnabled && !loopPlaying)
    }

    func selectLoop(_ loop: BundledLoop) {
        guard !loadingLoop, engineState == .ready else { return }
        guard selectedLoop?.id != loop.id else { return }
        guard let url = Bundle.main.url(forResource: loop.fileName, withExtension: "mp3",
                                        subdirectory: "public/assets/loops") else {
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
