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
        init(url: URL) { self.url = url.resolvingSymlinksInPath().standardizedFileURL }
        var id: String { BronzeSessionStore.soundFontIdentity(url) }
        var name: String { url.deletingPathExtension().lastPathComponent }
    }

    struct BundledLoop: Identifiable, Sendable {
        let id: Int
        let name: String
        let fileName: String
        let numerator: Int
        let denominator: Int
        var isLoop = true
        var mediaKey: String?
        var playlistID: UUID?
        var trackID: UUID?
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
    @Published private(set) var loopClickEnabled = true { didSet { scheduleSessionSave() } }
    @Published private(set) var metronomeClickSound = 1 { didSet { scheduleSessionSave() } }
    @Published private(set) var metronomeAccent = false { didSet { scheduleSessionSave() } }
    @Published private(set) var metronomeDoubleTime = false { didSet { scheduleSessionSave() } }
    @Published private(set) var timeSignatureNumerator = 4 { didSet { scheduleSessionSave() } }
    @Published private(set) var timeSignatureDenominator = 4 { didSet { scheduleSessionSave() } }
    @Published var moduleLevels = Array(repeating: 0.0, count: 8)
    @Published private(set) var outputLevels = Array(repeating: 0.0, count: 5)
    @Published private(set) var catalogDownloadTotal = 0
    @Published private(set) var catalogDownloadCompleted = 0
    @Published private(set) var catalogDownloadName: String?
    @Published private(set) var catalogDownloadID: String?
    @Published private(set) var catalogDownloadProgress = BronzeDownloadProgress()
    @Published private(set) var catalogDownloadInstalling = false
    @Published private(set) var catalogDownloadError: String?
    var catalogDownloadOverall: Double {
        min(1, (Double(catalogDownloadCompleted) + (catalogDownloadProgress.fraction ?? 0)) / Double(max(1, catalogDownloadTotal)))
    }
    private var catalogDownloadTask: Task<Void, Never>?
    @Published private(set) var memoryMB = 0
    @Published private(set) var memoryPercent: Int?
    private var meterFrame = 0
    private var lastMeterTime = ProcessInfo.processInfo.systemUptime
    var compressorMeterModule: Int?
    @Published private(set) var compressorLevels = [0.0, 0.0]
    @Published var moduleFaders = Array(repeating: 1.0, count: 8) { didSet { scheduleSessionSave() } }
    @Published private(set) var moduleEnabled = [false, false, false, false, false, false, true, false] { didSet { scheduleSessionSave() } }
    @Published private(set) var soloModule: Int? { didSet { scheduleSessionSave() } }
    @Published var controlError: String?
    @Published private(set) var userSoundFonts: [UserSoundFont] = []
    @Published private(set) var downloadedSoundID: String?
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
    @Published private(set) var moduleArpeggiators = Array(repeating: BronzeArpeggiator(), count: 8) { didSet { scheduleSessionSave() } }
    @Published private(set) var modulePerformance = (0..<8).map({ BronzeModulePerformance.initial($0) }) { didSet { scheduleSessionSave() } }
    @Published private(set) var moduleTones = Array(repeating: BronzeTone(), count: 8) { didSet { scheduleSessionSave() } }
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
    @Published private(set) var organRotary = BronzeOrganRotary() { didSet { scheduleSessionSave() } }
    @Published private(set) var organRotaryFast = false { didSet { scheduleSessionSave() } }
    @Published private(set) var organCabinetEnabled = true { didSet { scheduleSessionSave() } }
    @Published private(set) var bundledEffectsReady = false
    @Published private(set) var workspace = BronzeUserWorkspace() { didSet { scheduleSessionSave() } }
    @Published private(set) var importingMedia = false
    @Published private(set) var loadingFXBank = false
    @Published private(set) var effectLevels = Array(repeating: 0.0, count: 12)
    private var readyFX = Set<Int>()
    private var heldKeyboardNotes = Set<Int>()
    private var keyboardNoteRoutes: [Int: Int] = [:]
    private var keyboardPitchRoute: Int?
    private var keyboardModulationRoute: Int?
    private var midiKeyboard = BronzeMIDIKeyboardState()
    @Published private(set) var midiKeyboardNotes = Set<Int>()
    @Published private(set) var presets = BronzeNativeSession().presets
    @Published private(set) var presetBank = 0
    @Published private(set) var activePreset: Int?
    @Published private(set) var moduleSettingsSources = Array(repeating: "default", count: 8)
    private var moduleDefaultSettings: [BronzeModuleSettings?] = Array(repeating: nil, count: 8)
    private var moduleUserSettings: [BronzeModuleSettings?] = Array(repeating: nil, count: 8)
    private let presetWarmQueue = DispatchQueue(label: "bronze.preset.warm", qos: .utility)
    private var presetWarmTask: Task<Void, Never>?
    @Published private(set) var isApplyingSnapshot = false
    @Published private(set) var persistenceAvailable = false
    struct BackupExport: Identifiable { let url: URL; var id: String { url.path } }
    @Published var backupExport: BackupExport?
    @Published private(set) var backupBusy = false
    @Published var learningTarget: String?
    @Published var rangeLearnModule: Int?
    @Published var rangeLearnLow = true
    private var tempoTaps: [TimeInterval] = []
    var mixer: BronzeMixerSettings { workspace.mixer ?? BronzeMixerSettings() }

    func setMixerLevel(_ index: Int, value: Double) {
        guard (0..<5).contains(index), value.isFinite, !isApplyingSnapshot else { return }
        var next = mixer; next.levels[index] = min(1, max(0, value))
        workspace.mixer = next; applyMixer()
    }

    func toggleMixerOutput(_ index: Int) {
        guard (0..<5).contains(index), !isApplyingSnapshot else { return }
        var next = mixer; next.enabled[index].toggle(); workspace.mixer = next; applyMixer()
    }

    func shiftGlobalPitch(octave: Int = 0, transpose: Int = 0) {
        guard !isApplyingSnapshot else { return }
        var next = mixer
        next.octave = min(3, max(-3, next.octave + octave))
        next.transpose = min(12, max(-12, next.transpose + transpose))
        guard engine.setGlobalTranspose(next.octave * 12 + next.transpose) else { return }
        workspace.mixer = next
    }

    func toggleGlobalMono() {
        guard !isApplyingSnapshot else { return }
        var next = mixer; next.mono.toggle()
        for index in 0..<8 {
            var config = modulePerformance[index]; config.dualMono = next.mono
            setPerformance(config, moduleIndex: index)
        }
        workspace.mixer = next
    }

    func tapTempo() {
        let now = ProcessInfo.processInfo.systemUptime
        if let previous = tempoTaps.last, now - previous > 2 { tempoTaps.removeAll() }
        tempoTaps.append(now); tempoTaps = Array(tempoTaps.suffix(5))
        if tempoTaps.count > 1 { setTempo(60 * Double(tempoTaps.count - 1) / (now - tempoTaps[0])) }
    }

    func learnRange(module: Int, low: Bool) {
        if rangeLearnModule == module && rangeLearnLow == low { rangeLearnModule = nil }
        else { rangeLearnModule = module; rangeLearnLow = low }
    }

    private func acceptRangeNote(_ note: Int) {
        guard let index = rangeLearnModule, (0..<8).contains(index), (0...127).contains(note) else { return }
        var config = modulePerformance[index]
        if rangeLearnLow { config.lowNote = note; config.highNote = max(note, config.highNote) }
        else { config.highNote = note; config.lowNote = min(note, config.lowNote) }
        setPerformance(config, moduleIndex: index); rangeLearnModule = nil
    }

    func pastePreset(_ preset: BronzePresetSlot, at index: Int) {
        guard presets.indices.contains(index), preset.modules != nil, persistenceAvailable,
              !isApplyingSnapshot, !updatingEffects, loadingSoundFontModule == nil else { return }
        storeActivePreset()
        recallPreset(index, replacement: preset)
    }

    private func outputDb(_ index: Int) -> Float {
        mixer.levels[index] <= 0 ? -90 : Float(-90 + mixer.levels[index] * 90)
    }

    func setMixerRoute(_ index: Int, start: Int, count: Int) {
        guard (0..<5).contains(index) else { return }
        var next = mixer
        if next.channelStarts == nil { next.channelStarts = Array(repeating: 0, count: 5) }
        if next.channelCounts == nil { next.channelCounts = Array(repeating: 2, count: 5) }
        next.channelStarts?[index] = start; next.channelCounts?[index] = count
        guard (try? next.validate()) != nil else { return }
        workspace.mixer = next; applyMixer()
        if index == 4 {
            for module in modulePerformance.indices where modulePerformance[module].usesDefaultOutput {
                var config = modulePerformance[module]; config.outputUsesDefault = true
                config.outputStart = start; config.outputCount = count
                setPerformance(config, moduleIndex: module)
            }
            // Presets that follow the shared output must not restore an old route.
            for preset in presets.indices {
                guard var modules = presets[preset].modules else { continue }
                for module in modules.indices {
                    var config = modules[module].performance ?? BronzeModulePerformance()
                    if config.usesDefaultOutput {
                        config.outputUsesDefault = true; config.outputStart = start; config.outputCount = count
                        modules[module].performance = config
                    }
                }
                presets[preset].modules = modules
            }
        }
    }

    func panic() {
        stopPerformanceNotes(); endEffectTouches(); engine.stopAllNotes(); activePad = nil
        midiKeyboard.clear(); publishMIDIKeyboard()
    }

    private func applyMixer() {
        applyLoopChannelMode()
        _ = engine.configureTrackOutputChannelStart(mixer.channelStart(0), channelCount: mixer.channelCount(0), gainDb: outputDb(0), enabled: mixer.enabled[0])
        _ = engine.setPadOutputGainDb(outputDb(1), enabled: mixer.enabled[1], channelStart: mixer.channelStart(1), channelCount: mixer.channelCount(1),
            lowCutHz: Float(20 * pow(1000, padFilterLow)), highCutHz: Float(20 * pow(1000, padFilterHigh)))
        _ = engine.setEffectOutputGainDb(outputDb(2), enabled: mixer.enabled[2], channelStart: mixer.channelStart(2), channelCount: mixer.channelCount(2))
        _ = engine.setOutputGainDb(outputDb(4), enabled: mixer.enabled[4], channelStart: mixer.channelStart(4), channelCount: mixer.channelCount(4))
        _ = engine.setGlobalTranspose(mixer.octave * 12 + mixer.transpose)
        _ = engine.setMetronomeOutputChannelStart(mixer.channelStart(3), channelCount: mixer.channelCount(3))
        engine.setSeamlessPresetSwitching(UserDefaults.standard.bool(forKey: "bronze.seamless") && !UserDefaults.standard.bool(forKey: "bronze.lite"))
        applyMetronome(restart: false)
    }
    @Published var midiLearnMessage = ""
    private var ccPrevious: [String: (Int, Double)] = [:]
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
    private var disconnectObserver: NSObjectProtocol?
    private let audioQueue = DispatchQueue(
        label: "app.bronzekeys.native.audio-start",
        qos: .userInitiated
    )

    init() {
        engine.onMidiControl = { [weak self] _, device, channel, cc, value in
            DispatchQueue.main.async { self?.receiveControl(device: device, channel: channel, cc: cc, value: value) }
        }
        engine.onMidiNote = { [weak self] _, device, channel, note, velocity in
            DispatchQueue.main.async {
                guard let self else { return }
                self.midiKeyboard.receive(device: device, channel: channel, note: note, velocity: velocity)
                self.publishMIDIKeyboard()
                self.receiveLearnNote(channel: channel, note: note, velocity: velocity)
            }
        }
        engine.onMidiDevicesChanged = { [weak self] in
            DispatchQueue.main.async { self?.refreshMidiDevices() }
        }
        lifecycleObserver = NotificationCenter.default.addObserver(
            forName: .bronzeKeysReleaseTouches,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.prepareForBackground() }
        }
        disconnectObserver = NotificationCenter.default.addObserver(forName: .bronzeKeysStopAllNotes, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.panic() }
        }
    }

    deinit {
        meterTimer?.invalidate()
        if let disconnectObserver { NotificationCenter.default.removeObserver(disconnectObserver) }
        if let lifecycleObserver { NotificationCenter.default.removeObserver(lifecycleObserver) }
        engine.stop()
    }

    func start() {
        guard engineState == .idle else { return }
        engineState = .starting
        let engine = self.engine
        audioQueue.async { [weak self] in
            let savedBuffer = UserDefaults.standard.integer(forKey: "bronze.audioBuffer")
            let savedRate = UserDefaults.standard.integer(forKey: "bronze.sampleRate")
            let started = engine.start(withBufferFrames: [64, 128, 256, 512].contains(savedBuffer) ? savedBuffer : 256, sampleRate: savedRate == 44100 ? 44100 : 48000)
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

    func suspendForLogout() {
        presetWarmTask?.cancel()
        catalogDownloadTask?.cancel()
        saveSessionNow(); stopSelectedTrack(); stopPerformanceNotes(); engine.stopAllNotes()
        midiKeyboard.clear(); publishMIDIKeyboard()
        meterTimer?.invalidate(); meterTimer = nil
        engine.setMidiInputEnabled(false)
        // Keep the allocated runtime until its queued control work finishes.
        let engine = self.engine
        audioQueue.async { [weak self] in
            engine.stop()
            DispatchQueue.main.async {
                self?.engineState = .idle; self?.readyFX.removeAll(); self?.loopDurations.removeAll()
                self?.bundledEffectsReady = false
            }
        }
    }

    func refreshMidiDevices() {
        // Reconnecting inputs can discard a pending note-off from the old source.
        midiKeyboard.clear(); publishMIDIKeyboard()
        let values = engine.listMidiDevices()
        midiDevices = values.compactMap { value in
            guard let id = value["id"], let name = value["name"] else { return nil }
            return MidiDevice(id: id, name: name)
        }
        let selected: [Any] = UserDefaults.standard.stringArray(forKey: "bronze.midiDevices") ?? Array(midiDevices.prefix(3).map(\.id))
        engine.setMidiDeviceIds(selected)
    }

    func midiSlotName(_ slot: Int) -> String {
        let selected = UserDefaults.standard.stringArray(forKey: "bronze.midiDevices") ?? Array(midiDevices.prefix(3).map(\.id))
        guard selected.indices.contains(slot), !selected[slot].isEmpty else { return "Nenhum" }
        return midiDevices.first(where: { $0.id == selected[slot] })?.name ?? "Não conectado"
    }

    func clearSoundFont(_ index: Int) {
        guard (0..<6).contains(index), !isApplyingSnapshot, loadingSoundFontModule == nil, !updatingEffects else { return }
        if moduleEnabled[index] { toggleModuleEnabled(index) }
        engine.unloadSoundFont(fromModule: index)
        moduleSoundFonts[index] = nil
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

    func importSoundFont(_ source: URL, moduleIndex: Int, catalogSound: BronzeCatalogSound? = nil, completion: @escaping () -> Void = {}) {
        guard (0..<6).contains(moduleIndex), loadingSoundFontModule == nil, !isApplyingSnapshot,
              !backupBusy, !updatingEffects, engineState == .ready else {
            if catalogSound != nil { controlError = "Aguarde a operação atual antes de importar o timbre." }
            completion(); return
        }
        guard source.pathExtension.lowercased() == "sf2" else {
            controlError = "Selecione um arquivo .sf2."
            completion()
            return
        }
        loadingSoundFontModule = moduleIndex
        let engine = self.engine
        let scoped = source.startAccessingSecurityScopedResource()
        audioQueue.async { [weak self] in
            defer { if scoped { source.stopAccessingSecurityScopedResource() } }
            defer { DispatchQueue.main.async(execute: completion) }
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
                    self?.finishSoundFontLoad(entry, moduleIndex: moduleIndex, catalogSound: catalogSound)
                    if let catalogSound, let self {
                        var downloads = self.workspace.catalogDownloads ?? [:]
                        downloads[catalogSound.id] = destination.deletingLastPathComponent().lastPathComponent + "/" + destination.lastPathComponent
                        self.workspace.catalogDownloads = downloads
                        var installs = self.workspace.catalogInstalls ?? [:]
                        installs[catalogSound.id] = BronzeCatalogInstall(version: catalogSound.version, objectKey: catalogSound.objectKey)
                        self.workspace.catalogInstalls = installs
                        self.downloadedSoundID = catalogSound.id
                    }
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

    func selectUserSoundFont(_ entry: UserSoundFont, moduleIndex: Int, catalogSound: BronzeCatalogSound? = nil) {
        guard (0..<6).contains(moduleIndex), loadingSoundFontModule == nil,
              !isApplyingSnapshot, engineState == .ready, userSoundFonts.contains(entry) else { return }
        loadingSoundFontModule = moduleIndex
        downloadedSoundID = nil
        let engine = self.engine
        audioQueue.async { [weak self] in
            let loaded = engine.loadSoundFont(atPath: entry.url.path, moduleIndex: moduleIndex)
            DispatchQueue.main.async {
                guard let self else { return }
                if loaded {
                    self.finishSoundFontLoad(entry, moduleIndex: moduleIndex, catalogSound: catalogSound)
                } else {
                    self.loadingSoundFontModule = nil
                    self.controlError = "Não foi possível carregar \(entry.name). O timbre anterior foi mantido."
                }
            }
        }
    }

    private func finishSoundFontLoad(_ entry: UserSoundFont, moduleIndex: Int, catalogSound: BronzeCatalogSound? = nil) {
        moduleSoundFonts[moduleIndex] = entry
        loadingSoundFontModule = nil
        var next = moduleEnabled
        next[moduleIndex] = true
        applyModuleActivation(next, solo: soloModule)
        moduleDefaultSettings[moduleIndex] = catalogSound?.nativeDefaults(moduleIndex: moduleIndex) ?? BronzeModuleSettings.factory(moduleIndex)
        if moduleSettingsSources[moduleIndex] == "default" { setModuleSettingsSource(moduleIndex, source: "default", force: true) }
    }

    nonisolated private static func soundFontDirectory() throws -> URL {
        try BronzeSessionStore.applicationStore().soundFontDirectory
    }

    func catalogFont(_ id: String) -> UserSoundFont? {
        guard let key = workspace.catalogDownloads?[id], (try? BronzeSessionStore.validateSoundFontKey(key)) != nil else { return nil }
        // Sandbox URLs may use /var or /private/var and may change after install.
        // The persisted UUID/file key is the identity, not URL representation.
        return userSoundFonts.first(where: { $0.id == key })
    }

    func catalogNeedsUpdate(_ sound: BronzeCatalogSound) -> Bool {
        workspace.catalogInstalls?[sound.id]?.matches(sound) != true
    }

    func downloadCatalogSounds(_ sounds: [BronzeCatalogSound], account: BronzeNativeAccount) {
        guard catalogDownloadTask == nil else { return }
        catalogDownloadError = nil
        guard !backupBusy else { catalogDownloadError = "Aguarde o backup terminar para baixar os timbres."; return }
        guard persistenceAvailable else {
            catalogDownloadError = controlError ?? "O salvamento da sessão está indisponível. Feche e abra o app para tentar novamente; os timbres salvos serão mantidos."
            return
        }
        let remaining = sounds.filter { catalogFont($0.id) == nil || catalogNeedsUpdate($0) }
        guard !remaining.isEmpty else { return }
        catalogDownloadTotal = remaining.count; catalogDownloadCompleted = 0
        catalogDownloadName = remaining.first?.name
        catalogDownloadID = remaining.first?.id
        catalogDownloadProgress = BronzeDownloadProgress(expected: Int64(remaining.first?.byteSize ?? 0))
        catalogDownloadTask = Task {
            defer { catalogDownloadName = nil; catalogDownloadID = nil; catalogDownloadInstalling = false; catalogDownloadTask = nil }
            do {
                for sound in remaining {
                    try Task.checkCancellation()
                    catalogDownloadName = sound.name; catalogDownloadID = sound.id
                    catalogDownloadInstalling = false
                    catalogDownloadProgress = BronzeDownloadProgress(expected: Int64(sound.byteSize ?? 0))
                    let url = try await account.download(sound) { [weak self] received, expected in
                        guard let self, self.catalogDownloadID == sound.id, !self.catalogDownloadInstalling else { return }
                        self.catalogDownloadProgress.record(received: received, expected: expected)
                    }
                    defer { account.discardDownload(url) }
                    try Task.checkCancellation()
                    catalogDownloadInstalling = true
                    try await installCatalogDownload(url, sound: sound)
                    catalogDownloadCompleted += 1
                    catalogDownloadProgress = BronzeDownloadProgress()
                }
            } catch is CancellationError { }
            catch { if !Task.isCancelled { catalogDownloadError = "\(catalogDownloadName ?? "Timbre"): \(error.localizedDescription)" } }
        }
    }

    func cancelCatalogDownload() { catalogDownloadTask?.cancel() }

    private func installCatalogDownload(_ source: URL, sound: BronzeCatalogSound) async throws {
        guard !backupBusy else { throw BronzeSessionError.invalid }
        // Downloading a library never loads a bank or changes the current sound.
        let directory = try Self.soundFontDirectory().appendingPathComponent(UUID().uuidString, isDirectory: true)
        let destination = directory.appendingPathComponent(source.lastPathComponent)
        do {
            try await Task.detached(priority: .utility) {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try FileManager.default.copyItem(at: source, to: destination)
            }.value
            try Task.checkCancellation()
            guard !backupBusy else { throw BronzeSessionError.invalid }
            var downloads = workspace.catalogDownloads ?? [:]
            downloads[sound.id] = directory.lastPathComponent + "/" + destination.lastPathComponent
            var installs = workspace.catalogInstalls ?? [:]
            installs[sound.id] = BronzeCatalogInstall(version: sound.version, objectKey: sound.objectKey)
            workspace.catalogDownloads = downloads; workspace.catalogInstalls = installs
            userSoundFonts.append(UserSoundFont(url: destination))
            downloadedSoundID = sound.id
            saveSessionNow()
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw error
        }
    }

    func clearDownloadHighlight() { downloadedSoundID = nil }

    var userOnlySoundFonts: [UserSoundFont] {
        let fixed = Set((workspace.catalogDownloads ?? [:]).values)
        return userSoundFonts.filter { !fixed.contains($0.url.deletingLastPathComponent().lastPathComponent + "/" + $0.url.lastPathComponent) }
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
            glideMs: Float(modulePerformance[moduleIndex].glideTime(bpm: tempo)),
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
        if let selectedLoop, selectedLoop.isLoop {
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
        guard !loopPlaylistSelected, !(loopPlaying && selectedLoop?.isLoop == true) else { return }
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

    func setMetronomeOptions(accent: Bool, doubleTime: Bool) {
        metronomeAccent = accent
        metronomeDoubleTime = doubleTime
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
        for index in 0..<6 where modulePerformance[index].glideSync {
            if !Self.sendPerformanceGlide(modulePerformance[index], envelope: moduleEnvelopes[index],
                moduleIndex: index, tempo: tempo, engine: engine) { controlError = "Não foi possível sincronizar o Glide." }
        }
        for index in moduleArpeggiators.indices where moduleArpeggiators[index].enabled {
            if !Self.sendArpeggiator(moduleArpeggiators[index], moduleIndex: index, tempo: tempo,
                numerator: timeSignatureNumerator, denominator: timeSignatureDenominator, engine: engine) {
                controlError = "Não foi possível sincronizar o Arpeggiator."
            }
        }
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

    func setArpeggiator(_ arp: BronzeArpeggiator, moduleIndex: Int) {
        guard moduleArpeggiators.indices.contains(moduleIndex), moduleIndex != 6,
              engineState == .ready, !isApplyingSnapshot else { return }
        do { try arp.validate(moduleIndex: moduleIndex) } catch { return }
        guard Self.sendArpeggiator(arp, moduleIndex: moduleIndex, tempo: tempo,
            numerator: timeSignatureNumerator, denominator: timeSignatureDenominator, engine: engine) else {
            controlError = "Não foi possível ajustar o Arpeggiator."
            return
        }
        moduleArpeggiators[moduleIndex] = arp
    }

    func setPerformance(_ value: BronzeModulePerformance, moduleIndex: Int) {
        guard modulePerformance.indices.contains(moduleIndex), engineState == .ready, !isApplyingSnapshot else { return }
        var value = value
        if value.usesDefaultOutput {
            value.outputUsesDefault = true
            value.outputStart = mixer.channelStart(4); value.outputCount = mixer.channelCount(4)
        }
        if moduleIndex < 6 {
            if value.mode != modulePerformance[moduleIndex].mode { value.portamento = value.mode == 1 }
            else if value.portamento != modulePerformance[moduleIndex].portamento { value.mode = value.portamento ? 1 : 0 }
        }
        do { try value.validate() } catch { return }
        guard Self.sendPerformance(value, moduleIndex: moduleIndex, engine: engine),
              Self.sendPerformanceGlide(value, envelope: moduleEnvelopes[moduleIndex], moduleIndex: moduleIndex,
                tempo: tempo, engine: engine) else {
            controlError = "Não foi possível ajustar a configuração do módulo."
            return
        }
        modulePerformance[moduleIndex] = value
        if moduleIndex == 6 {
            _ = engine.configureModuleModulation(6, mode: value.modulationMode,
                rateHz: Float(value.modulationRate), intensity: Float(value.modulationIntensity))
        }
    }

    nonisolated private static func sendPerformance(_ value: BronzeModulePerformance,
        moduleIndex: Int, engine: HookKeysNativeEngine) -> Bool {
        guard engine.configurePerformance(moduleIndex, routing: value.routingValues.map { NSNumber(value: $0) },
            velocity: value.velocityValues.map { NSNumber(value: $0) }, sustain: value.sustain,
            modulation: value.modulation, noSens: value.noSens, dualMono: value.dualMono) else { return false }
        if moduleIndex == 6 || moduleIndex == 7 { return true }
        return engine.configureModuleModulation(moduleIndex, mode: value.modulationMode,
            rateHz: Float(value.modulationRate), intensity: Float(value.modulationIntensity))
    }

    nonisolated private static func sendPerformanceGlide(_ value: BronzeModulePerformance, envelope: BronzeEnvelope,
        moduleIndex: Int, tempo: Double, engine: HookKeysNativeEngine) -> Bool {
        if moduleIndex == 6 || moduleIndex == 7 { return true }
        guard engine.configureGlide(moduleIndex, portamento: value.portamento,
            velocityGateEnabled: value.glideVelocityGate, velocityGateInverted: value.glideVelocityInverted,
            velocityThreshold: value.glideVelocityThreshold) else { return false }
        return engine.configureModuleEnvelope(moduleIndex, attackMs: Float(envelope.attackMs), holdMs: Float(envelope.holdMs),
            decayMs: Float(envelope.decayMs), releaseMs: Float(envelope.releaseMs),
            glideMs: Float(value.glideTime(bpm: tempo)), sustainDb: Float(envelope.sustainDb))
    }

    func setTone(_ value: BronzeTone, moduleIndex: Int) {
        guard moduleTones.indices.contains(moduleIndex), engineState == .ready, !isApplyingSnapshot else { return }
        do { try value.validate(moduleIndex: moduleIndex) } catch { return }
        guard Self.sendTone(value, moduleIndex: moduleIndex, engine: engine) else {
            controlError = "Não foi possível ajustar o filtro/Gain."
            return
        }
        moduleTones[moduleIndex] = value
    }

    nonisolated private static func sendTone(_ value: BronzeTone, moduleIndex: Int, engine: HookKeysNativeEngine) -> Bool {
        engine.configureTone(moduleIndex, enabled: value.enabled, type: value.type,
            values: value.values.map { NSNumber(value: $0) }, velocity: value.velocity.map { NSNumber(value: $0) },
            envelopeEnabled: value.envelopeEnabled)
    }

    nonisolated private static func sendArpeggiator(_ arp: BronzeArpeggiator, moduleIndex: Int, tempo: Double,
        numerator: Int, denominator: Int, engine: HookKeysNativeEngine) -> Bool {
        engine.configureArpeggiator(moduleIndex, enabled: arp.enabled, mode: arp.mode, octaves: arp.octaves,
            beatMultiplier: Float(arp.beatMultiplier(bpm: tempo)),
            measureBeats: arp.sync ? Float(arp.measureBeats(numerator: numerator, denominator: denominator)) : 0,
            gate: Float(arp.gate), swing: Float(arp.swing), autoFaderEnabled: arp.enabled && arp.autoFaderEnabled,
            autoFaderBeats: Float(arp.autoFaderBeats(numerator: numerator, denominator: denominator)),
            autoFaderDepthDb: Float(arp.autoFaderDepthDb))
    }

    func selectLoop(_ loop: BundledLoop, autoplay: Bool = false) {
        guard !loadingLoop, engineState == .ready else { return }
        guard selectedLoop?.id != loop.id || selectedLoop?.mediaKey != loop.mediaKey ||
              selectedLoop?.playlistID != loop.playlistID || selectedLoop?.isLoop != loop.isLoop else { return }
        let mediaURL = loop.mediaKey.flatMap { try? BronzeUserMediaStore(session: BronzeSessionStore.applicationStore()).url($0) }
        guard let url = mediaURL ?? Bundle.main.url(forResource: loop.fileName, withExtension: "mp3",
                                        subdirectory: "loops") else {
            controlError = "O arquivo de \(loop.name) não foi encontrado no app."
            return
        }
        let previousID = selectedLoop?.id
        loadingLoop = true
        let engine = self.engine
        let cachedDuration = loop.mediaKey == nil ? loopDurations[loop.id] : nil
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
                if loop.mediaKey == nil { self.loopDurations[loop.id] = duration }
                self.selectedLoop = loop
                self.applyLoopChannelMode()
                self.loopDuration = duration
                self.loopPosition = 0
                self.loopPlaying = false
                if loop.isLoop { self.setTimeSignature(numerator: loop.numerator, denominator: loop.denominator) }
                self.applyMetronome(restart: false)
                if autoplay { self.toggleLoopPlayback() }
            }
        }
    }

    func seekLoop(to seconds: Double) {
        guard let selectedLoop, !loadingLoop, !loopPlaying, seconds.isFinite else { return }
        let position = min(loopDuration, max(0, seconds))
        if engine.controlTrackId(selectedLoop.id, action: "seek", seconds: position,
            loop: true, playbackRate: 1, syncMetronome: false) { loopPosition = position }
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
        // O click dos loops vem do arquivo, sem sincronizar o metrônomo.
        applyLoopChannelMode()
        let id = selectedLoop.id
        let shouldRepeat = selectedLoop.isLoop || (workspace.playlistSidebar?.scope == "all" ? playlistSidebar.repeatEnabled : workspace.playlists.first(where: { $0.id == selectedLoop.playlistID })?.repeatEnabled == true)
        guard engine.controlTrackId(id, action: "loop", seconds: 0, loop: shouldRepeat,
                                    playbackRate: 1, syncMetronome: false),
              engine.controlTrackId(id, action: "rate", seconds: 0, loop: true,
                                    playbackRate: selectedLoop.isLoop ? tempo / 120 : 1, syncMetronome: false),
              engine.controlTrackId(id, action: "seek", seconds: loopPosition, loop: true,
                                    playbackRate: 1, syncMetronome: false) else {
            controlError = "Não foi possível preparar o loop."
            return
        }
        loopPlaying = true
        applyMetronome(restart: false)
        guard engine.controlTrackId(id, action: "play", seconds: 0, loop: true,
                                    playbackRate: selectedLoop.isLoop ? tempo / 120 : 1, syncMetronome: false) else {
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
            let ended = (status["ended"] as? NSNumber)?.boolValue ?? false
            DispatchQueue.main.async {
                guard let self else { return }
                self.trackStatusPending = false
                if self.loopPlaying && self.selectedLoop?.id == id && sourceID == id {
                    self.loopPosition = position
                    if ended {
                        self.loopPlaying = false
                        self.applyMetronome(restart: false)
                        self.advanceUserTrack()
                    }
                }
            }
        }
    }

    @Published private(set) var keyboardPitch = 0.5
    @Published private(set) var keyboardModulation = 0.0

    private var keyboardInputSlot: Int {
        midiDevices.isEmpty ? 3 : min(2, max(0, UserDefaults.standard.integer(forKey: "bronze.keyboardMidiSlot") - 1))
    }

    func selectKeyboardMidiSlot(_ slot: Int) {
        stopPerformanceNotes()
        setKeyboardPitch(0.5)
        setKeyboardModulation(0)
        UserDefaults.standard.set(min(3, max(1, slot)), forKey: "bronze.keyboardMidiSlot")
        publishMIDIKeyboard()
    }

    func setKeyboardPitch(_ normalized: Double) {
        guard normalized.isFinite else { return }
        keyboardPitch = min(1, max(0, normalized))
        let route = keyboardPitchRoute ?? keyboardInputSlot
        let value = Int((keyboardPitch * 16383).rounded())
        _ = engine.sendMidi(fromSlot: route, status: 0xE0, data1: value & 0x7F, data2: (value >> 7) & 0x7F, timestamp: 0)
        keyboardPitchRoute = keyboardPitch == 0.5 ? nil : route
    }

    func setKeyboardModulation(_ normalized: Double) {
        guard normalized.isFinite else { return }
        keyboardModulation = min(1, max(0, normalized))
        let route = keyboardInputSlot
        if let previous = keyboardModulationRoute, previous != route {
            _ = engine.sendMidi(fromSlot: previous, status: 0xB0, data1: 1, data2: 0, timestamp: 0)
        }
        _ = engine.sendMidi(fromSlot: route, status: 0xB0, data1: 1, data2: Int((keyboardModulation * 127).rounded()), timestamp: 0)
        keyboardModulationRoute = keyboardModulation == 0 ? nil : route
    }

    private func publishMIDIKeyboard() {
        let selected = UserDefaults.standard.stringArray(forKey: "bronze.midiDevices") ?? Array(midiDevices.prefix(3).map(\.id))
        let slot = keyboardInputSlot
        let device = selected.indices.contains(slot) ? selected[slot] : ""
        let notes = midiKeyboard.notes(forDevice: device)
        if notes != midiKeyboardNotes { midiKeyboardNotes = notes }
    }

    func setKeyboardNote(_ note: Int, pressed: Bool, velocity: Int) {
        guard (0...127).contains(note) else { return }
        if pressed {
            acceptRangeNote(note)
            guard heldKeyboardNotes.insert(note).inserted else { return }
            let route = keyboardInputSlot
            keyboardNoteRoutes[note] = route
            _ = engine.sendMidi(fromSlot: route, status: 0x90, data1: note, data2: min(127, max(1, velocity)), timestamp: 0)
        } else {
            guard heldKeyboardNotes.remove(note) != nil else { return }
            let route = keyboardNoteRoutes.removeValue(forKey: note) ?? keyboardInputSlot
            _ = engine.sendMidi(fromSlot: route, status: 0x80, data1: note, data2: 0, timestamp: 0)
        }
    }

    func stopPerformanceNotes() {
        for note in heldKeyboardNotes {
            _ = engine.sendMidi(fromSlot: keyboardNoteRoutes[note] ?? keyboardInputSlot, status: 0x80, data1: note, data2: 0, timestamp: 0)
        }
        heldKeyboardNotes.removeAll()
        keyboardNoteRoutes.removeAll()
    }

    func prepareForBackground() {
        setKeyboardPitch(0.5)
        saveSessionNow()
        stopPerformanceNotes()
        // Only release screen touches. Continuous pads and one-shot FX keep
        // rendering through the playback audio session while the app is hidden.
        endEffectTouches()
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
        guard engine.setPadOutputGainDb(outputDb(1), enabled: mixer.enabled[1], channelStart: mixer.channelStart(1), channelCount: mixer.channelCount(1),
            lowCutHz: Float(20 * pow(1000, nextLow)), highCutHz: Float(20 * pow(1000, nextHigh))) else {
            controlError = "Não foi possível ajustar o filtro dos pads."
            return
        }
        padFilterLow = nextLow
        padFilterHigh = nextHigh
    }

    var selectedUserPlaylist: BronzeUserPlaylist? { workspace.playlist(workspace.selectedPlaylist) }

    var loopPlaylistSelected: Bool {
        if let scope = workspace.playlistSidebar?.scope {
            return scope == "bundled" || workspace.playlists.first(where: { $0.id.uuidString == scope })?.isLoop == true
        }
        return selectedUserPlaylist?.isLoop == true
    }

    func setLoopClickEnabled(_ enabled: Bool) {
        loopClickEnabled = enabled
        applyLoopChannelMode()
    }

    private func applyLoopChannelMode() {
        guard let track = selectedLoop else { return }
        _ = engine.controlTrackId(track.id, action: "right-mono", seconds: 0,
            loop: track.isLoop && !loopClickEnabled, playbackRate: 1, syncMetronome: false)
    }

    var playlistSidebar: BronzePlaylistSidebarSettings { workspace.playlistSidebar ?? BronzePlaylistSidebarSettings() }

    func editPlaylistSidebar(_ change: (inout BronzePlaylistSidebarSettings) -> Void) {
        var next = playlistSidebar
        change(&next)
        guard (try? next.validate()) != nil else { return }
        workspace.playlistSidebar = next
        applyMetronome(restart: false)
        if let track = selectedLoop, !track.isLoop {
            let repeatTrack = next.scope == "all" ? next.repeatEnabled : workspace.playlists.first(where: { $0.id == track.playlistID })?.repeatEnabled == true
            _ = engine.controlTrackId(track.id, action: "loop", seconds: 0, loop: repeatTrack, playbackRate: 1, syncMetronome: false)
        }
    }

    var allSidebarTracks: [(playlist: BronzeUserPlaylist, track: BronzeUserTrack)] {
        let library = workspace.playlist(BronzeUserWorkspace.libraryPlaylistID)!
        let tracks = library.tracks.map { (playlist: library, track: $0) }
        let order = playlistSidebar.order["all"] ?? []
        let ranks = Dictionary(uniqueKeysWithValues: order.enumerated().map { ($0.element, $0.offset) })
        return tracks.enumerated().sorted {
            (ranks[$0.element.track.id.uuidString] ?? (order.count + $0.offset)) < (ranks[$1.element.track.id.uuidString] ?? (order.count + $1.offset))
        }.map(\.element)
    }

    func selectPlaylist(_ id: UUID?, preserveSidebarScope: Bool = false) {
        guard !loadingLoop, !importingMedia else { return }
        workspace.selectedPlaylist = id
        workspace.selectedTrack = nil
        if !preserveSidebarScope {
            var sidebar = playlistSidebar
            sidebar.scope = id == BronzeUserWorkspace.libraryPlaylistID ? "all" : id?.uuidString ?? "bundled"
            workspace.playlistSidebar = sidebar
        }
        applyMetronome(restart: false)
    }

    func createPlaylist(name: String, loop: Bool) {
        guard workspace.playlists.count < 256 else { return }
        let list = BronzeUserPlaylist(name: BronzeUserWorkspace.name(name, fallback: loop ? "Playlist de loop" : "Normal Playlist"), isLoop: loop)
        workspace.playlists.append(list)
        selectPlaylist(list.id)
    }

    func editPlaylist(_ next: BronzeUserPlaylist) {
        guard let index = workspace.playlists.firstIndex(where: { $0.id == next.id }), !importingMedia else { return }
        var edited = workspace
        edited.playlists[index] = next
        guard (try? edited.validate()) != nil else { return }
        workspace = edited
        applyMetronome(restart: false)
        if selectedLoop?.playlistID == next.id, let track = selectedLoop {
            _ = engine.controlTrackId(track.id, action: "loop", seconds: 0, loop: next.isLoop || next.repeatEnabled,
                playbackRate: 1, syncMetronome: false)
        }
    }

    func savePlaylist(_ id: UUID?, name: String, loop: Bool, trackIDs: Set<UUID>) {
        guard !importingMedia, !loadingLoop, id != BronzeUserWorkspace.libraryPlaylistID else { return }
        let library = workspace.allLibraryTracks
        let old = workspace.playlist(id)
        var next = old ?? BronzeUserPlaylist(name: "Playlist")
        next.name = BronzeUserWorkspace.name(String(name.prefix(40)), fallback: "Playlist")
        next.isLoop = loop
        if loop { next.repeatEnabled = false; next.autoAdvance = false }
        let selected = library.filter { trackIDs.contains($0.id) }
        let selectedKeys = Set(selected.map(\.key))
        next.tracks = (old?.tracks ?? []).filter { selectedKeys.contains($0.key) }
        let retained = Set(next.tracks.map(\.key))
        next.tracks += selected.filter { !retained.contains($0.key) }.map { BronzeUserTrack(name: $0.name, key: $0.key) }
        guard next.tracks.count <= 2000 else { controlError = "Limite de 2000 músicas por playlist."; return }
        workspace.libraryTracks = library
        var candidate = workspace
        if let position = candidate.playlists.firstIndex(where: { $0.id == next.id }) { candidate.playlists[position] = next }
        else { candidate.playlists.append(next) }
        candidate.selectedPlaylist = next.id; candidate.selectedTrack = nil
        guard (try? candidate.validate()) != nil else { return }
        workspace = candidate
        if selectedLoop?.playlistID == next.id && !next.tracks.contains(where: { $0.id == selectedLoop?.trackID }) { stopSelectedTrack() }
        editPlaylist(next)
        selectPlaylist(next.id)
    }

    func removeLibraryTrack(_ id: UUID) {
        guard !importingMedia, !loadingLoop, let track = workspace.allLibraryTracks.first(where: { $0.id == id }) else { return }
        workspace.libraryTracks = workspace.allLibraryTracks.filter { $0.key != track.key }
        if selectedLoop?.mediaKey == track.key { stopSelectedTrack() }
        for index in workspace.playlists.indices { workspace.playlists[index].tracks.removeAll { $0.key == track.key } }
        if let selected = workspace.selectedTrack, workspace.playlist(workspace.selectedPlaylist)?.tracks.contains(where: { $0.id == selected }) != true { workspace.selectedTrack = nil }
    }

    func deletePlaylist(_ id: UUID) {
        guard !importingMedia, !loadingLoop else { return }
        if selectedLoop?.playlistID == id { stopSelectedTrack() }
        workspace.libraryTracks = workspace.allLibraryTracks
        workspace.playlists.removeAll { $0.id == id }
        if workspace.selectedPlaylist == id { workspace.selectedPlaylist = nil; workspace.selectedTrack = nil }
        // Original documents and private audio files remain recoverable in backup.
    }

    func removeTrack(_ id: UUID, playlistID: UUID) {
        guard let list = workspace.playlists.firstIndex(where: { $0.id == playlistID }), !importingMedia, !loadingLoop else { return }
        if selectedLoop?.trackID == id { stopSelectedTrack() }
        workspace.libraryTracks = workspace.allLibraryTracks
        workspace.playlists[list].tracks.removeAll { $0.id == id }
        if workspace.selectedTrack == id { workspace.selectedTrack = nil }
    }

    private func stopSelectedTrack() {
        if let track = selectedLoop {
            _ = engine.controlTrackId(track.id, action: "pause", seconds: 0, loop: false, playbackRate: 1, syncMetronome: false)
        }
        loopPlaying = false; selectedLoop = nil; loopPosition = 0; loopDuration = 0
        applyMetronome(restart: false)
    }

    func selectUserTrack(_ id: UUID, autoplay: Bool = false) {
        guard let list = selectedUserPlaylist, let track = list.tracks.first(where: { $0.id == id }), !loadingLoop else { return }
        workspace.selectedTrack = id
        selectLoop(BundledLoop(id: 100, name: track.name, fileName: "", numerator: list.numerator,
            denominator: list.denominator, isLoop: list.isLoop, mediaKey: track.key, playlistID: list.id, trackID: id), autoplay: autoplay)
    }

    private func advanceUserTrack() {
        if workspace.playlistSidebar?.scope == "all" {
            guard playlistSidebar.autoAdvance, selectedLoop?.isLoop == false else { return }
            let tracks = allSidebarTracks
            guard let index = tracks.firstIndex(where: { $0.track.id == selectedLoop?.trackID }), tracks.indices.contains(index + 1) else { return }
            selectPlaylist(tracks[index + 1].playlist.id, preserveSidebarScope: true)
            selectUserTrack(tracks[index + 1].track.id, autoplay: true)
            return
        }
        guard let current = selectedLoop, let list = workspace.playlist(current.playlistID),
              !list.isLoop, list.autoAdvance, let index = list.tracks.firstIndex(where: { $0.id == current.trackID }),
              list.tracks.indices.contains(index + 1) else { return }
        workspace.selectedPlaylist = list.id
        selectUserTrack(list.tracks[index + 1].id, autoplay: true)
    }

    func importTracks(_ urls: [URL], playlistID: UUID) {
        guard !importingMedia, !isApplyingSnapshot, workspace.playlist(playlistID) != nil,
              urls.count <= 2000 else { return }
        guard workspace.allLibraryTracks.count + urls.count <= 10000 else {
            controlError = "Limite de 10000 músicas na biblioteca."; return
        }
        importingMedia = true
        let access = urls.map { $0.startAccessingSecurityScopedResource() }
        audioQueue.async { [weak self] in
            defer { for (url, scoped) in zip(urls, access) where scoped { url.stopAccessingSecurityScopedResource() } }
            var imported: [BronzeUserTrack] = []
            var failures = 0
            for url in urls {
                do {
                    let store = try BronzeUserMediaStore(session: BronzeSessionStore.applicationStore())
                    let key = try store.importFile(url)
                    imported.append(BronzeUserTrack(name: BronzeUserWorkspace.name(url.deletingPathExtension().lastPathComponent, fallback: "Audio"), key: key))
                } catch { failures += 1 }
            }
            let results = imported, rejected = failures
            DispatchQueue.main.async {
                guard let self else { return }
                var library = self.workspace.allLibraryTracks
                library.append(contentsOf: results)
                self.workspace.libraryTracks = library
                if let index = self.workspace.playlists.firstIndex(where: { $0.id == playlistID }) {
                    let available = max(0, 2000 - self.workspace.playlists[index].tracks.count)
                    self.workspace.playlists[index].tracks.append(contentsOf: results.prefix(available))
                    if results.count > available { self.controlError = "Limite de 2000 músicas por playlist." }
                }
                self.importingMedia = false
                if rejected > 0 { self.controlError = "\(rejected) arquivo(s) não foram importados. Use MP3, WAV, M4A, AIFF ou CAF." }
            }
        }
    }

    func saveSynthPreset(_ index: Int, name: String, color: Int) {
        guard workspace.synthPresets.indices.contains(index), persistenceAvailable, !isApplyingSnapshot else { return }
        workspace.synthPresets[index] = BronzeSynthPreset(name: BronzeUserWorkspace.name(name, fallback: "Synth \(index + 1)"),
            sound: synth, envelope: moduleEnvelopes[7], color: min(7, max(0, color)))
        workspace.activeSynthPreset = index
    }

    func recallSynthPreset(_ index: Int) {
        guard workspace.synthPresets.indices.contains(index), !isApplyingSnapshot else { return }
        let stored = workspace.synthPresets[index]
        let preset = stored.sound == nil ? BronzeSynthPreset.factory(index) : stored
        guard let preset, let next = preset.sound else { return }
        let envelope = preset.envelope
        guard Self.sendSynth(next, envelope: envelope, engine: engine) else { controlError = "Não foi possível abrir o preset do Synth."; return }
        synth = next; moduleEnvelopes[7] = envelope; workspace.activeSynthPreset = index
    }

    func isFXReady(_ index: Int) -> Bool {
        workspace.fxBank == 0 ? bundledEffectsReady : readyFX.contains(workspace.fxBank * 12 + index)
    }

    func selectFXBank(_ bank: Int) {
        guard (0..<8).contains(bank), !loadingFXBank, !importingMedia else { return }
        endEffectTouches(); effectLevels = Array(repeating: 0, count: 12)
        workspace.fxBank = bank
        loadSelectedFXBank()
    }

    private func loadSelectedFXBank() {
        guard !loadingFXBank else { return }
        let mapped = Set(midiSettings.notes.filter { $0.kind == 2 }.map { $0.bank * 12 + $0.item })
        let requested = workspace.fxBanks.enumerated().flatMap { bankIndex, bank in
            bank.pads.enumerated().compactMap { index, pad -> (Int, Int, String)? in
                guard bankIndex != 0, bankIndex == self.workspace.fxBank || mapped.contains(bankIndex * 12 + index),
                      let key = pad.key else { return nil }
                return (bankIndex, index, key)
            }
        }
        guard !requested.isEmpty else { return }
        loadingFXBank = true
        let alreadyLoaded = readyFX
        let engine = self.engine
        audioQueue.async { [weak self] in
            var loaded = Set<Int>(), missing = 0
            for (bank, index, key) in requested where !alreadyLoaded.contains(bank * 12 + index) {
                if let url = try? BronzeUserMediaStore(session: BronzeSessionStore.applicationStore()).url(key),
                   engine.loadEffect(path: url.path, bankIndex: bank, itemIndex: index) { loaded.insert(bank * 12 + index) }
                else { missing += 1 }
            }
            let ready = loaded, failed = missing
            DispatchQueue.main.async {
                self?.readyFX.formUnion(ready)
                self?.loadingFXBank = false
                if failed > 0 { self?.controlError = "\(failed) efeito(s) não puderam ser carregados." }
            }
        }
    }

    func setEffectPadGain(bank: Int, index: Int, gain: Double) {
        guard (0..<8).contains(bank), (0..<12).contains(index), gain.isFinite, !importingMedia else { return }
        let value = min(0, max(-36, gain))
        guard engine.setEffectPadGainDb(Float(value), bankIndex: bank, itemIndex: index) else { return }
        workspace.fxBanks[bank].pads[index].gainDb = value
        applyMIDISettings()
    }

    func editFX(bank: Int, index: Int, name: String, gain: Double, color: Int, triggerMode: String? = nil, gateRelease: String? = nil) {
        guard (0..<8).contains(bank), (0..<12).contains(index), gain.isFinite, !importingMedia else { return }
        workspace.fxBanks[bank].pads[index].name = BronzeUserWorkspace.name(name, fallback: "FX \(index + 1)")
        workspace.fxBanks[bank].pads[index].gainDb = min(0, max(-36, gain))
        workspace.fxBanks[bank].pads[index].color = min(7, max(0, color))
        if bank != 0 {
            if let triggerMode, ["toggle", "gate"].contains(triggerMode) { workspace.fxBanks[bank].pads[index].triggerMode = triggerMode }
            if let gateRelease, ["infinite", "continue-press"].contains(gateRelease) { workspace.fxBanks[bank].pads[index].gateRelease = gateRelease }
        }
        applyMIDISettings()
    }

    func renameFXBank(_ bank: Int, name: String) {
        guard (1..<8).contains(bank) else { return }
        workspace.fxBanks[bank].name = BronzeUserWorkspace.name(name, fallback: "FX \(bank + 1)")
    }

    func importFX(_ source: URL, bank: Int, index: Int) {
        guard (1..<8).contains(bank), (0..<12).contains(index), !importingMedia, !loadingFXBank, !isApplyingSnapshot else { return }
        importingMedia = true
        let scoped = source.startAccessingSecurityScopedResource()
        let engine = self.engine
        audioQueue.async { [weak self] in
            defer { if scoped { source.stopAccessingSecurityScopedResource() } }
            do {
                let store = try BronzeUserMediaStore(session: BronzeSessionStore.applicationStore())
                let key = try store.importFile(source)
                guard engine.loadEffect(path: try store.url(key).path, bankIndex: bank, itemIndex: index) else {
                    store.discardImport(key); throw BronzeSessionError.invalid
                }
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.workspace.fxBanks[bank].pads[index].key = key
                    self.workspace.fxBanks[bank].pads[index].name = BronzeUserWorkspace.name(source.deletingPathExtension().lastPathComponent, fallback: "FX \(index + 1)")
                    self.readyFX.insert(bank * 12 + index)
                    self.importingMedia = false
                }
            } catch {
                DispatchQueue.main.async { self?.importingMedia = false; self?.controlError = "Não foi possível importar o efeito. O anterior foi mantido." }
            }
        }
    }

    func triggerEffect(_ index: Int, pressed: Bool) {
        guard (0..<12).contains(index), isFXReady(index), !loadingFXBank else { return }
        if pressed {
            guard !pressedEffects.contains(index) else { return }
            let mode = workspace.fxBanks[workspace.fxBank].pads[index].mode(bank: workspace.fxBank)
            let active = engine.effectActivity()[workspace.fxBank * 12 + index].boolValue
            guard engine.triggerEffect(bankIndex: workspace.fxBank, itemIndex: index, enabled: mode != 1 || !active,
                gainDb: Float(workspace.fxBanks[workspace.fxBank].pads[index].gainDb)) else {
                controlError = "Não foi possível tocar o efeito."
                return
            }
            pressedEffects.insert(index)
            activeEffect = index
        } else {
            if workspace.fxBanks[workspace.fxBank].pads[index].mode(bank: workspace.fxBank) == 2 {
                _ = engine.triggerEffect(bankIndex: workspace.fxBank, itemIndex: index, enabled: false, gainDb: 0)
            }
            pressedEffects.remove(index)
            if activeEffect == index { activeEffect = pressedEffects.sorted().last }
        }
    }

    func endEffectTouches() {
        for index in pressedEffects where workspace.fxBanks[workspace.fxBank].pads[index].mode(bank: workspace.fxBank) == 2 {
            _ = engine.triggerEffect(bankIndex: workspace.fxBank, itemIndex: index, enabled: false, gainDb: 0)
        }
        pressedEffects.removeAll()
        activeEffect = nil
    }

    func setOrganDrawbar(_ index: Int, normalized: Double) {
        guard organDrawbars.indices.contains(index) else { return }
        organDrawbars[index] = normalized
        let positions = organDrawbars.map { NSNumber(value: Int(($0 * 8).rounded())) }
        _ = engine.configureOrganDrawbars(positions)
    }

    func setOrganRotary(_ value: BronzeOrganRotary) {
        guard (try? value.validate()) != nil,
              engine.setOrganRotaryParameters(value.speed, slowHz: Float(value.slowHz), fastHz: Float(value.fastHz), rampSeconds: Float(value.rampSeconds), depth: Float(value.depth)) else { return }
        organRotary = value
        organRotaryFast = value.speed == 2
    }

    func toggleOrganRotarySpeed() {
        var next = organRotary; next.speed = organRotaryFast ? 1 : 2; setOrganRotary(next)
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
            let now = ProcessInfo.processInfo.systemUptime
            let elapsed = now - self.lastMeterTime
            self.lastMeterTime = now
            let values = self.engine.moduleMeterLevels()
            var nextLevels = Array(repeating: 0.0, count: self.moduleLevels.count)
            for index in nextLevels.indices {
                let left = index * 2 < values.count ? values[index * 2].doubleValue : 0
                let right = index * 2 + 1 < values.count ? values[index * 2 + 1].doubleValue : 0
                nextLevels[index] = BronzeMeterDisplay.smooth(peak: max(left, right), previous: self.moduleLevels[index], elapsed: elapsed)
            }
            // Só publicar alterações: silêncio não precisa reconstruir os controles.
            if self.moduleLevels != nextLevels { self.moduleLevels = nextLevels }
            func peak(_ offset: Int) -> Double {
                guard values.count > offset + 1 else { return 0 }
                return max(values[offset].doubleValue, values[offset + 1].doubleValue)
            }
            let fx = self.engine.effectMeterLevels().map(\.doubleValue).max() ?? 0
            let peaks = [peak(18), peak(22), fx, peak(20), peak(16)]
            let nextOutputs = peaks.indices.map { BronzeMeterDisplay.smooth(peak: peaks[$0], previous: self.outputLevels[$0], elapsed: elapsed) }
            if self.outputLevels != nextOutputs { self.outputLevels = nextOutputs }
            if let module = self.compressorMeterModule {
                let analysis = self.engine.moduleAnalysis(module)
                let next = (0..<2).map { BronzeMeterDisplay.smooth(peak: $0 < analysis.count ? analysis[$0].doubleValue : 0, previous: self.compressorLevels[$0], elapsed: elapsed) }
                if next != self.compressorLevels { self.compressorLevels = next }
            }
            self.meterFrame += 1
            if self.meterFrame % 60 == 0 {
                var stats = vm_statistics64()
                var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.size / MemoryLayout<integer_t>.size)
                let result = withUnsafeMutablePointer(to: &stats) { pointer in
                    pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                        host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &count)
                    }
                }
                if result == KERN_SUCCESS {
                    let used = (UInt64(stats.active_count) + UInt64(stats.wire_count) + UInt64(stats.compressor_page_count)) * UInt64(vm_kernel_page_size)
                    let percent = min(100, Int((100 * Double(used) / Double(ProcessInfo.processInfo.physicalMemory)).rounded()))
                    if self.memoryPercent != percent { self.memoryPercent = percent }
                }
            }
            if self.page == .pads {
                let levels = self.engine.effectActivity()
                let start = self.workspace.fxBank * 12
                let nextLevels = (0..<12).map { start + $0 < levels.count ? levels[start + $0].doubleValue : 0 }
                if self.effectLevels != nextLevels { self.effectLevels = nextLevels }
            }
            self.refreshLoopPosition()
        }
        RunLoop.main.add(meterTimer!, forMode: .common)
    }

    private func applyMetronome(restart: Bool) {
        if loopPlaylistSelected || (loopPlaying && selectedLoop?.isLoop == true) { metronomeEnabled = false }
        _ = engine.configureMetronomeEnabled(
            metronomeEnabled,
            bpm: Float(tempo),
            volume: metronomeEnabled && mixer.enabled[3] ? pow(10, outputDb(3) / 20) : 0,
            clickSound: metronomeClickSound,
            accentEnabled: metronomeAccent,
            doubleTimeEnabled: metronomeDoubleTime,
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
            return BronzeModuleSnapshot(settingsSource: moduleSettingsSources[index], defaultSettings: moduleDefaultSettings[index], userSettings: moduleUserSettings[index], soundFontKey: key, enabled: moduleEnabled[index],
                fader: moduleFaders[index], envelope: moduleEnvelopes[index], equalizer: moduleEqualizers[index],
                reverb: moduleReverbs[index], delay: moduleDelays[index], soundEffects: moduleSoundEffects[index],
                synth: index == 7 ? synth : nil, pulse: modulePulses[index], arpeggiator: moduleArpeggiators[index],
                performance: modulePerformance[index], tone: moduleTones[index])
        }
    }

    private func storeActivePreset() {
        guard !isApplyingSnapshot else { return }
        // A legacy session can have an unslotted current sound. Adopt a free slot
        // before switching so that sound is never silently discarded.
        if activePreset == nil {
            activePreset = presets.indices.first { presets[$0].modules == nil }
        }
        guard let index = activePreset else { return }
        if presets[index].modules == nil && presets[index].name == "Empty" { presets[index].color = BronzePresetPalette.order[index % 16] }
        presets[index].modules = moduleSnapshot()
        if presets[index].name == "Empty" { presets[index].name = "Preset" }
    }

    private func sessionSnapshot() -> BronzeNativeSession {
        storeActivePreset()
        var session = BronzeNativeSession()
        session.workspace = workspace
        session.modules = moduleSnapshot()
        session.presets = presets
        session.bank = presetBank
        session.activePreset = activePreset
        session.selectedModule = selectedModule
        session.soloModule = soloModule
        session.organDrawbars = organDrawbars.map { Int(($0 * 8).rounded()) }
        session.organRotaryFast = organRotaryFast
        session.organRotary = organRotary
        session.organCabinetEnabled = organCabinetEnabled
        session.tempo = tempo
        session.clickSound = metronomeClickSound
        session.metronomeAccent = metronomeAccent
        session.metronomeDoubleTime = metronomeDoubleTime
        session.loopClickEnabled = loopClickEnabled
        session.numerator = timeSignatureNumerator
        session.denominator = timeSignatureDenominator
        session.padBank = selectedPadBank
        session.padLow = padFilterLow
        session.padHigh = padFilterHigh
        session.loopID = selectedLoop?.mediaKey == nil ? selectedLoop?.id : nil
        return session
    }

    private func scheduleSessionSave() {
        guard persistenceAvailable, !isApplyingSnapshot, !updatingEffects, !backupBusy else { return }
        pendingSessionSave?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.saveSessionNow() }
        pendingSessionSave = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: work)
    }

    private func saveSessionNow() {
        pendingSessionSave?.cancel()
        pendingSessionSave = nil
        guard persistenceAvailable, !isApplyingSnapshot, !updatingEffects, !backupBusy else { return }
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
                        self.workspace = session.workspace ?? BronzeUserWorkspace()
                        self.workspace.restoreChurchNames()
                        self.adoptModules(session.modules, fonts: fonts, solo: session.soloModule)
                        self.presets = session.presets
                        self.presetBank = session.bank
                        self.activePreset = session.activePreset
                        self.selectedModule = session.selectedModule
                        self.organDrawbars = session.organDrawbars.map { Double($0) / 8 }
                        _ = engine.configureOrganDrawbars(session.organDrawbars.map { NSNumber(value: $0) })
                        self.organRotaryFast = session.organRotaryFast
                        self.organCabinetEnabled = session.organCabinetEnabled
                        self.setOrganRotary(session.organRotary ?? BronzeOrganRotary(speed: session.organRotaryFast ? 2 : 1))
                        _ = engine.setOrganCabinetEnabled(session.organCabinetEnabled)
                        self.setTempo(session.tempo)
                        self.selectMetronomeClick(session.clickSound)
                        self.setMetronomeOptions(accent: session.metronomeAccent ?? false, doubleTime: session.metronomeDoubleTime ?? false)
                        self.setLoopClickEnabled(session.loopClickEnabled ?? true)
                        self.setTimeSignature(numerator: session.numerator, denominator: session.denominator)
                        self.selectPadBank(session.padBank)
                        self.setPadFilter(low: true, normalized: session.padLow)
                        self.setPadFilter(low: false, normalized: session.padHigh)
                    }
                    self.isApplyingSnapshot = false
                    self.applyMixer()
                    self.persistenceAvailable = true
                    // Restore selection, never autoplay a loop, pad, FX or click.
                    if let id = session?.loopID, let loop = self.bundledLoops.first(where: { $0.id == id }) {
                        self.selectLoop(loop)
                    } else if let trackID = self.workspace.selectedTrack {
                        self.selectUserTrack(trackID)
                    }
                    self.loadSelectedFXBank()
                    self.applyMIDISettings()
                    self.preparePresetSounds()
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

    func exportBackup(userName: String) {
        guard persistenceAvailable, !backupBusy, !isApplyingSnapshot, !updatingEffects,
              !importingMedia, !loadingFXBank, loadingSoundFontModule == nil else { return }
        backupBusy = true
        pendingSessionSave?.cancel()
        let session = sessionSnapshot()
        persistenceQueue.async { [weak self] in
            do {
                let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let url = directory.appendingPathComponent(BronzeNativeBackup.fileName(user: userName))
                do { try BronzeNativeBackup.export(session: session, store: BronzeSessionStore.applicationStore(), destination: url) }
                catch { try? FileManager.default.removeItem(at: directory); throw error }
                DispatchQueue.main.async { self?.backupBusy = false; self?.backupExport = BackupExport(url: url) }
            } catch {
                DispatchQueue.main.async { self?.backupBusy = false; self?.controlError = "Falha ao criar backup: \(error.localizedDescription)" }
            }
        }
    }

    func finishBackupExport() {
        if let url = backupExport?.url {
            // This UUID folder was created solely for the export, not the chosen destination.
            try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
        }
        backupExport = nil
        scheduleSessionSave()
    }

    func restoreBackup(_ source: URL) {
        guard !backupBusy, !isApplyingSnapshot, !updatingEffects, !importingMedia,
              !loadingFXBank, !loadingLoop, loadingSoundFontModule == nil, engineState == .ready else { return }
        backupBusy = true; isApplyingSnapshot = true
        pendingSessionSave?.cancel()
        let scoped = source.startAccessingSecurityScopedResource()
        let previous = moduleSnapshot(), engine = self.engine
        let audioWorker = audioQueue
        // Finish any earlier autosave before restoring a different session.
        persistenceQueue.async { [weak self] in
            guard let self else { if scoped { source.stopAccessingSecurityScopedResource() }; return }
            audioWorker.async { [weak self] in
                defer { if scoped { source.stopAccessingSecurityScopedResource() } }
                do {
                    let staged = try BronzeNativeBackup.stage(source)
                    defer { try? FileManager.default.removeItem(at: staged.directory) }
                    guard let session = try staged.load() else { throw BronzeSessionError.invalid }
                    let live = try BronzeSessionStore.applicationStore()
                    try BronzeNativeBackup.installAssets(from: staged, into: live)
                    // Keep a recoverable copy of the exact pre-restore settings.
                    if FileManager.default.fileExists(atPath: live.sessionURL.path) {
                        let recovery = live.directory.appendingPathComponent("BeforeRestore-" + UUID().uuidString + ".json")
                        try FileManager.default.copyItem(at: live.sessionURL, to: recovery)
                    }
                    let fonts = try Self.applySnapshot(session.modules, previous: previous, solo: session.soloModule,
                        tempo: session.tempo, numerator: session.numerator, denominator: session.denominator, engine: engine, store: live)
                    var saveError: String?
                    do { try live.save(session) } catch { saveError = error.localizedDescription }
                    let persistenceError = saveError
                    DispatchQueue.main.async {
                        guard let self else { return }
                        self.stopSelectedTrack(); self.stopPerformanceNotes(); self.endEffectTouches(); engine.stopAllNotes()
                        self.metronomeEnabled = false
                        self.adoptModules(session.modules, fonts: fonts, solo: session.soloModule)
                        self.adoptSessionSettings(session)
                        self.readyFX.removeAll()
                        self.isApplyingSnapshot = false; self.backupBusy = false
                        self.persistenceAvailable = persistenceError == nil
                        self.refreshUserSoundFonts(); self.loadSelectedFXBank()
                        self.applyMIDISettings()
                        self.restoreTrackSelection(session)
                        if let persistenceError { self.controlError = "Backup carregado no áudio, mas não foi salvo: \(persistenceError). A sessão anterior foi preservada." }
                    }
                } catch {
                    DispatchQueue.main.async {
                        self?.backupBusy = false; self?.isApplyingSnapshot = false
                        self?.controlError = "Backup não restaurado: \(error.localizedDescription) A sessão anterior continua ativa."
                    }
                }
            }
        }
    }

    private func adoptSessionSettings(_ session: BronzeNativeSession) {
        workspace = session.workspace ?? BronzeUserWorkspace()
        applyMixer()
        presets = session.presets; presetBank = session.bank; activePreset = session.activePreset
        selectedModule = session.selectedModule
        organDrawbars = session.organDrawbars.map { Double($0) / 8 }
        _ = engine.configureOrganDrawbars(session.organDrawbars.map { NSNumber(value: $0) })
        organRotaryFast = session.organRotaryFast; organCabinetEnabled = session.organCabinetEnabled
        setOrganRotary(session.organRotary ?? BronzeOrganRotary(speed: session.organRotaryFast ? 2 : 1)); _ = engine.setOrganCabinetEnabled(session.organCabinetEnabled)
        setTempo(session.tempo); selectMetronomeClick(session.clickSound)
        setMetronomeOptions(accent: session.metronomeAccent ?? false, doubleTime: session.metronomeDoubleTime ?? false)
        setLoopClickEnabled(session.loopClickEnabled ?? true)
        setTimeSignature(numerator: session.numerator, denominator: session.denominator)
        selectPadBank(session.padBank)
        setPadFilter(low: true, normalized: session.padLow); setPadFilter(low: false, normalized: session.padHigh)
    }

    private func restoreTrackSelection(_ session: BronzeNativeSession) {
        if let id = session.loopID, let loop = bundledLoops.first(where: { $0.id == id }) { selectLoop(loop) }
        else if let track = workspace.selectedTrack { selectUserTrack(track) }
    }

    var midiSettings: BronzeMIDISettings { workspace.midi ?? BronzeMIDISettings() }

    func setCompatibility(_ enabled: Bool) {
        var next = midiSettings; next.compatibility = enabled; workspace.midi = next
        learningTarget = nil; ccPrevious.removeAll()
        engine.setCompatibilityMode(enabled)
    }

    @Published private(set) var midiLearnCandidate: BronzeCCMapping?
    @Published private(set) var midiLearnNoteCandidate: Int?
    private var midiLearnDraftTarget: String?

    func beginMIDILearnDraft(_ target: String) {
        beginMIDILearn(target)
        guard learningTarget == target else { return }
        midiLearnDraftTarget = target
        midiLearnCandidate = midiSettings.controls[target]
        let parts = target.split(separator: ":").dropFirst().compactMap { Int($0) }
        midiLearnNoteCandidate = parts.count == 3 ? midiSettings.notes.first(where: { $0.kind == parts[0] && $0.bank == parts[1] && $0.item == parts[2] })?.note : nil
    }

    func cancelMIDILearnDraft() {
        learningTarget = nil; midiLearnDraftTarget = nil
        midiLearnCandidate = nil; midiLearnNoteCandidate = nil
    }

    func commitMIDILearnDraft(_ target: String, minimum: Double, maximum: Double, inverted: Bool) {
        guard midiLearnDraftTarget == target else { return }
        var next = midiSettings
        if target.hasPrefix("note:"), let note = midiLearnNoteCandidate {
            let parts = target.split(separator: ":").dropFirst().compactMap { Int($0) }
            guard parts.count == 3 else { return }
            next.notes.removeAll { $0.note == note || ($0.kind == parts[0] && $0.bank == parts[1] && $0.item == parts[2]) }
            next.notes.append(BronzeMIDINoteMapping(note: note, kind: parts[0], bank: parts[1], item: parts[2]))
        } else if var map = midiLearnCandidate {
            map.minimum = min(1, max(0, minimum)); map.maximum = min(1, max(map.minimum, maximum)); map.inverted = inverted
            next.controls[target] = map
        } else { return }
        guard (try? next.validate()) != nil else { return }
        workspace.midi = next; cancelMIDILearnDraft(); applyMIDISettings()
        if target.hasPrefix("note:") { loadSelectedFXBank() }
    }

    func beginMIDILearn(_ target: String) {
        cancelMIDILearnDraft()
        if midiSettings.compatibility && target.hasPrefix("preset:") {
            midiLearnMessage = "Desative o modo compatibilidade."; return
        }
        learningTarget = target
        midiLearnMessage = target.hasPrefix("note:") ? "Toque a nota no canal MIDI 10." : "Mova o controle CC no teclado."
    }

    func clearMIDIMapping(_ target: String) {
        if midiSettings.compatibility && target.hasPrefix("preset:") { midiLearnMessage = "Desative o modo compatibilidade."; return }
        var next = midiSettings
        if target.hasPrefix("note:") {
            let parts = target.split(separator: ":").dropFirst().compactMap { Int($0) }
            if parts.count == 3 { next.notes.removeAll { $0.kind == parts[0] && $0.bank == parts[1] && $0.item == parts[2] } }
        } else { next.controls.removeValue(forKey: target) }
        workspace.midi = next; learningTarget = nil; applyMIDISettings()
    }

    func setCCRange(_ target: String, minimum: Double, maximum: Double, inverted: Bool) {
        guard var map = midiSettings.controls[target], minimum.isFinite, maximum.isFinite else { return }
        map.minimum = min(1, max(0, minimum)); map.maximum = min(1, max(map.minimum, maximum)); map.inverted = inverted
        var next = midiSettings; next.controls[target] = map; workspace.midi = next
    }

    private func applyMIDISettings() {
        engine.setCompatibilityMode(midiSettings.compatibility)
        engine.clearPerformanceMappings()
        for mapping in midiSettings.notes {
            let gain = mapping.kind == 2 ? workspace.fxBanks[mapping.bank].pads[mapping.item].gainDb : 0
            engine.setPerformanceMapping(note: mapping.note, kind: mapping.kind, bankIndex: mapping.bank,
                itemIndex: mapping.item, mode: mapping.kind == 2 ? workspace.fxBanks[mapping.bank].pads[mapping.item].mode(bank: mapping.bank) : 0, gainDb: Float(gain))
        }
    }

    private func receiveLearnNote(channel: Int, note: Int, velocity: Int) {
        if velocity > 0 { acceptRangeNote(note) }
        guard let target = learningTarget, target.hasPrefix("note:"), velocity > 0 else { return }
        guard channel == 10 else { midiLearnMessage = "Use o canal MIDI 10 para Pads e FX."; return }
        let parts = target.split(separator: ":").dropFirst().compactMap { Int($0) }
        guard parts.count == 3 else { return }
        if midiLearnDraftTarget == target {
            midiLearnNoteCandidate = note; midiLearnMessage = "Nota \(note) recebida · CH 10"
            return
        }
        var next = midiSettings
        next.notes.removeAll { $0.note == note || ($0.kind == parts[0] && $0.bank == parts[1] && $0.item == parts[2]) }
        next.notes.append(BronzeMIDINoteMapping(note: note, kind: parts[0], bank: parts[1], item: parts[2]))
        guard (try? next.validate()) != nil else { return }
        workspace.midi = next; learningTarget = nil; midiLearnMessage = "Nota \(note), canal 10, mapeada."
        applyMIDISettings()
        loadSelectedFXBank()
    }

    private func receiveControl(device: String, channel: Int, cc: Int, value: Int) {
        if cc == 120 || cc == 123 {
            midiKeyboard.clear(device: device, channel: channel); publishMIDIKeyboard()
        }
        guard !backupBusy, !isApplyingSnapshot, engineState == .ready else { return }
        let settings = midiSettings
        if settings.compatibility {
            if cc == 91, (1...16).contains(value) { recallPreset(presetBank * 16 + value - 1); return }
            if [0, 6, 7, 10, 16, 32, 91, 100, 101].contains(cc) { return }
        }
        if let target = learningTarget, !target.hasPrefix("note:"), BronzeMIDITarget.all.contains(where: { $0.id == target }) {
            if midiLearnDraftTarget == target {
                midiLearnCandidate = BronzeCCMapping(device: device, channel: channel, controller: cc)
                midiLearnMessage = "CC \(cc) recebido · Canal \(channel)"
                return
            }
            var next = settings
            next.controls[target] = BronzeCCMapping(device: device, channel: channel, controller: cc)
            workspace.midi = next; learningTarget = nil; midiLearnMessage = "CC \(cc), canal \(channel), mapeado."
            return
        }
        let key = "\(device):\(channel):\(cc)", now = ProcessInfo.processInfo.systemUptime
        let previous = ccPrevious[key]
        ccPrevious[key] = (value, now)
        let pressed = value >= 64 && (previous == nil || previous!.0 < 64 || now - previous!.1 >= 0.16)
        for target in BronzeMIDITarget.all {
            guard let mapping = settings.controls[target.id], mapping.device == device,
                  mapping.channel == channel, mapping.controller == cc,
                  target.continuous || pressed, !(settings.compatibility && target.id.hasPrefix("preset:")) else { continue }
            applyMappedControl(target.id, normalized: mapping.normalized(value))
        }
    }

    private func applyMappedControl(_ target: String, normalized n: Double) {
        let parts = target.split(separator: ":").map(String.init)
        let module = parts.count > 1 ? Int(parts[1]) ?? 0 : 0
        let parameter = parts.count > 2 ? Int(parts[2]) ?? 0 : 0
        switch parts[0] {
        case "tempo": setTempo(tempo + (parts[1] == "+" ? 0.5 : -0.5))
        case "click": toggleMetronome()
        case "transport": toggleLoopPlayback()
        case "output": setMixerLevel(module, value: n)
        case "fader": setModuleFader(module, normalized: n)
        case "on": toggleModuleEnabled(module)
        case "solo": toggleModuleSolo(module)
        case "preset": recallPreset(module)
        case "bank": selectPresetBank(module)
        case "padLow": setPadFilter(low: true, normalized: n)
        case "padHigh": setPadFilter(low: false, normalized: n)
        case "drawbar": setOrganDrawbar(module, normalized: n)
        case "rotary": toggleOrganRotarySpeed()
        case "cabinet": toggleOrganCabinet()
        case "performance":
            var next = modulePerformance[module]
            switch parts[2] {
            case "velocity": next.velocityIgnoreAbove = Int((n * 127).rounded())
            case "modRate": next.modulationRate = 0.1 + n * 19.9
            case "modDepth": next.modulationIntensity = n
            default: next.glideMs = n * 5000
            }
            setPerformance(next, moduleIndex: module)
        case "arp":
            var next = moduleArpeggiators[module]
            switch parts[2] {
            case "rate": next.rateMs = 20 + n * 1980
            case "gate": next.gate = 0.1 + n * 0.9
            case "swing": next.swing = n * 0.75
            default: next.autoFaderDepthDb = n * 40
            }
            setArpeggiator(next, moduleIndex: module)
        case "pulse":
            var next = modulePulses[module]
            if parts[2] == "rate" { next.rateMs = 20 + n * 1980 }
            else if let p = BronzePulseParameter(rawValue: parts[2]) { next[p] = p.definition.value(n) }
            setPulse(next, moduleIndex: module)
        case "rotaryParam":
            var next = organRotary
            switch parts[2] {
            case "Slow": next.slowHz = 0.2 + n * 1.8
            case "Fast": next.fastHz = 2 + n * 8
            case "Acceleration": next.rampSeconds = 0.1 + n * 9.9
            default: next.depth = n
            }
            setOrganRotary(next)
        case "env": setEnvelopeValue(EnvelopeParameter.allCases[parameter], moduleIndex: module, normalized: n)
        case "eq":
            let p = BronzeEQParameter.allCases[Int(parts[3]) ?? 0]
            editEQBand(parameter, moduleIndex: module) { $0.setNormalized(p, n) }
        case "reverb":
            var r = moduleReverbs[module]; if parameter == 0 { r.setMix(n) } else { r.setDecay(0.1 + n * 0.9) }; setReverb(r, moduleIndex: module)
        case "delay":
            var d = moduleDelays[module]; d.setNormalized(BronzeDelayParameter.allCases[parameter], n); setDelay(d, moduleIndex: module)
        case "tone":
            let p = BronzeToneParameter.allCases[parameter]; var t = moduleTones[module]; t[p] = p.definition.value(n); setTone(t, moduleIndex: module)
        case "fx":
            guard let kind = BronzeProcessorKind(rawValue: parts[2]), let p = Int(parts[3]) else { return }
            var effects = moduleSoundEffects[module]; effects[kind].values[p] = kind.parameters[p].value(n); setSoundEffects(effects, moduleIndex: module)
        case "synth":
            guard let p = BronzeSynthParameter(rawValue: parts[1]) else { return }; var next = synth; next[p] = p.definition.value(n); setSynth(next)
        case "osc":
            var next = synth
            if parts[2] == "Volume" { next.oscillators[module].volume = n }
            else if parts[2] == "Detune" { next.oscillators[module].detune = -100 + n * 200 }
            else { next.oscillators[module].octave = Int((-3 + n * 6).rounded()) }
            setSynth(next)
        case "eqOn": var e = moduleEqualizers[module]; e.enabled.toggle(); setEqualizer(e, moduleIndex: module)
        case "reverbOn": var e = moduleReverbs[module]; e.enabled.toggle(); setReverb(e, moduleIndex: module)
        case "delayOn": var e = moduleDelays[module]; e.enabled.toggle(); setDelay(e, moduleIndex: module)
        case "pulseOn": var e = modulePulses[module]; e.enabled.toggle(); setPulse(e, moduleIndex: module)
        case "arpOn": var e = moduleArpeggiators[module]; e.enabled.toggle(); setArpeggiator(e, moduleIndex: module)
        case "chorusOn", "compressorOn", "vibesOn":
            let kind: BronzeProcessorKind = parts[0] == "chorusOn" ? .chorus : parts[0] == "vibesOn" ? .vibes : .compressor
            var e = moduleSoundEffects[module]; e[kind].enabled.toggle(); setSoundEffects(e, moduleIndex: module)
        default: break
        }
    }

    func setModuleSettingsSource(_ index: Int, source: String, force: Bool = false) {
        guard (0..<6).contains(index), ["default", "user"].contains(source),
              (moduleSettingsSources[index] != source || force), !isApplyingSnapshot,
              !updatingEffects, loadingSoundFontModule == nil, engineState == .ready else { return }
        let previous = moduleSnapshot()
        var modules = previous
        if source == "default" && moduleSettingsSources[index] == "user" { modules[index].userSettings = BronzeModuleSettings(previous[index]) }
        let defaults = modules[index].defaultSettings ?? BronzeModuleSettings.factory(index)
        let settings = source == "default" ? defaults : modules[index].userSettings ?? defaults
        modules[index] = settings.applying(to: modules[index])
        modules[index].settingsSource = source
        let target = modules, engine = self.engine, bpm = tempo, solo = soloModule
        let numerator = timeSignatureNumerator, denominator = timeSignatureDenominator
        isApplyingSnapshot = true
        audioQueue.async { [weak self] in
            do {
                let fonts = try Self.applySnapshot(target, previous: previous, solo: solo, tempo: bpm,
                    numerator: numerator, denominator: denominator, engine: engine, store: BronzeSessionStore.applicationStore())
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.adoptModules(target, fonts: fonts, solo: solo)
                    self.isApplyingSnapshot = false; self.saveSessionNow()
                }
            } catch {
                DispatchQueue.main.async { self?.isApplyingSnapshot = false; self?.controlError = error.localizedDescription }
            }
        }
    }

    func presetBankName(_ bank: Int) -> String { workspace.presetBankNames?[bank] ?? ["A", "B", "C", "D", "E", "F"][bank] }
    func renamePresetBank(_ bank: Int, name: String) {
        guard (0..<6).contains(bank) else { return }
        var names = workspace.presetBankNames ?? ["A", "B", "C", "D", "E", "F"]
        names[bank] = String(BronzeUserWorkspace.name(name, fallback: ["A", "B", "C", "D", "E", "F"][bank]).prefix(12))
        workspace.presetBankNames = names
    }

    func selectPresetBank(_ bank: Int) {
        guard (0..<6).contains(bank), !isApplyingSnapshot else { return }
        presetBank = bank
        scheduleSessionSave()
        preparePresetSounds()
    }

    func savePreset(_ index: Int, name: String, color: Int) {
        guard presets.indices.contains(index), !isApplyingSnapshot, loadingSoundFontModule == nil,
              !updatingEffects, persistenceAvailable else { return }
        storeActivePreset()
        let name = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        presets[index] = BronzePresetSlot(name: name.isEmpty ? "Preset \(index % 16 + 1)" : name,
            color: min(15, max(0, color)), modules: moduleSnapshot())
        activePreset = index
        saveSessionNow()
        preparePresetSounds()
    }

    func preparePresetSounds() {
        presetWarmTask?.cancel()
        guard engineState == .ready, !isApplyingSnapshot,
              UserDefaults.standard.bool(forKey: "bronze.seamless"),
              !UserDefaults.standard.bool(forKey: "bronze.lite"),
              let store = try? BronzeSessionStore.applicationStore() else { return }
        var seen = Set<String>()
        let paths = presets.dropFirst(presetBank * 16).prefix(16).flatMap { $0.modules ?? [] }
            .compactMap(\.soundFontKey).filter { seen.insert($0).inserted }
            .compactMap { try? store.soundFontURL(for: $0).path }
        let engine = self.engine, queue = presetWarmQueue
        presetWarmTask = Task {
            for path in paths {
                guard !Task.isCancelled else { return }
                // Optional work uses a separate queue: it cannot sit ahead of
                // preset recall on audioQueue. Runtime admits only banks that fit.
                await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                    queue.async {
                        _ = engine.preloadSoundFont(atPath: path)
                        continuation.resume()
                    }
                }
            }
        }
    }

    func renamePreset(_ index: Int, name: String, color: Int) {
        guard presets.indices.contains(index),
              persistenceAvailable, !isApplyingSnapshot else { return }
        let trimmed = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        if !trimmed.isEmpty { presets[index].name = trimmed }
        presets[index].color = min(15, max(0, color))
        saveSessionNow()
    }

    func recallPreset(_ index: Int, replacement: BronzePresetSlot? = nil) {
        guard presets.indices.contains(index),
              !isApplyingSnapshot, !updatingEffects, loadingSoundFontModule == nil, engineState == .ready else { return }
        storeActivePreset()
        guard activePreset != index || replacement != nil else { saveSessionNow(); return }
        let target = replacement ?? presets[index]
        let modules = target.modules ?? BronzeModuleSnapshot.defaults.map { module in
            var empty = module; empty.enabled = false; return empty
        }
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
                    self.presets[index] = target
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
        moduleSettingsSources = modules.map { $0.settingsSource ?? "user" }
        moduleDefaultSettings = modules.map(\.defaultSettings)
        moduleUserSettings = modules.map(\.userSettings)
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
        moduleArpeggiators = modules.map { $0.arpeggiator ?? BronzeArpeggiator() }
        modulePerformance = modules.enumerated().map { $0.element.performance ?? BronzeModulePerformance.initial($0.offset) }
        moduleTones = modules.map { $0.tone ?? BronzeTone() }
        let organMod = modulePerformance[6]
        _ = engine.configureModuleModulation(6, mode: organMod.modulationMode,
            rateHz: Float(organMod.modulationRate), intensity: Float(organMod.modulationIntensity))
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
            guard Self.sendPerformance(module.performance ?? BronzeModulePerformance.initial(index), moduleIndex: index, engine: engine)
            else { throw BronzeSessionError.invalid }
            guard Self.sendPerformanceGlide(module.performance ?? BronzeModulePerformance.initial(index), envelope: module.envelope,
                moduleIndex: index, tempo: tempo, engine: engine),
                Self.sendTone(module.tone ?? BronzeTone(), moduleIndex: index, engine: engine) else { throw BronzeSessionError.invalid }
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
            guard Self.sendArpeggiator(module.arpeggiator ?? BronzeArpeggiator(), moduleIndex: index, tempo: tempo,
                numerator: numerator, denominator: denominator, engine: engine) else { throw BronzeSessionError.invalid }
            if index != 6 {
                let e = module.envelope
                guard engine.configureModuleEnvelope(index, attackMs: Float(e.attackMs), holdMs: Float(e.holdMs),
                    decayMs: Float(e.decayMs), releaseMs: Float(e.releaseMs),
                    glideMs: Float((module.performance ?? BronzeModulePerformance.initial(index)).glideTime(bpm: tempo)),
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
    static let bronzeKeysReleaseTouches = Notification.Name("BronzeKeysReleaseTouches")
    static let bronzeKeysStopAllNotes = Notification.Name("BronzeKeysStopAllNotes")
}

#if DEBUG && targetEnvironment(macCatalyst)
extension BronzeNativeAppModel {
    func runMIDILearnSmoke() async {
        guard ProcessInfo.processInfo.environment["BRONZE_UI_TEST"] == "1" else { return }
        let originalFrames = engine.effectiveBufferFrames
        for frames in [64, 128, 256, 512] {
            let accepted = engine.setAudioOutputDeviceId("", channels: 2, bufferFrames: frames,
                sampleRate: engine.effectiveSampleRate, preserveEngine: true)
            NSLog("[BronzeMacSmoke] BUFFER requested=%d actual=%d accepted=%d", frames,
                  engine.effectiveBufferFrames, accepted ? 1 : 0)
            precondition(accepted && engine.effectiveBufferFrames == frames)
            try? await Task.sleep(nanoseconds: 150_000_000)
        }
        _ = engine.setAudioOutputDeviceId("", channels: 2, bufferFrames: originalFrames,
            sampleRate: engine.effectiveSampleRate, preserveEngine: true)
        NSLog("[BronzeMacSmoke] BUFFER_HARDWARE_ROUNDTRIP_OK")
        let target = "env:0:0"
        let previous = midiSettings.controls[target]
        beginMIDILearnDraft(target)
        engine.onMidiControl?(0, "smoke-midi", 1, 74, 100)
        try? await Task.sleep(nanoseconds: 30_000_000)
        precondition(midiLearnCandidate?.controller == 74 && midiSettings.controls[target] == previous)
        cancelMIDILearnDraft()
        precondition(midiSettings.controls[target] == previous)
        beginMIDILearnDraft(target)
        engine.onMidiControl?(0, "smoke-midi", 1, 71, 100)
        try? await Task.sleep(nanoseconds: 30_000_000)
        commitMIDILearnDraft(target, minimum: 0.2, maximum: 0.8, inverted: true)
        precondition(midiSettings.controls[target]?.controller == 71)
        precondition(abs((midiSettings.controls[target]?.normalized(127) ?? -1) - 0.2) < 0.001)
        engine.onMidiControl?(0, "smoke-midi", 1, 71, 127)
        try? await Task.sleep(nanoseconds: 30_000_000)
        precondition(abs(envelopeValue(.attack, moduleIndex: 0) - 0.2) < 0.001)
        let notes = midiSettings.notes
        beginMIDILearnDraft("note:1:0:0")
        engine.onMidiNote?(0, "smoke-midi", 10, 60, 100)
        try? await Task.sleep(nanoseconds: 30_000_000)
        precondition(midiLearnNoteCandidate == 60 && midiSettings.notes == notes)
        cancelMIDILearnDraft()
        precondition(midiSettings.notes == notes)
        NSLog("[BronzeMacSmoke] MIDI_DRAFT_CANCEL_CONFIRM_RANGE_AND_ROUTING_OK")
        beginMIDILearnDraft(target)
    }
}
#endif
