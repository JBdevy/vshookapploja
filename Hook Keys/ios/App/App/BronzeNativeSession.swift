import Foundation

// Pure Foundation data: shared by the Apple hosts, with no UI/audio dependency.
struct BronzeEnvelope: Codable, Equatable, Sendable {
    var attackMs = 0.0
    var releaseMs = 300.0
    var holdMs = 15_000.0
    var decayMs = 25_000.0
    var sustainDb = 0.0

    func validate() throws {
        for (value, range) in [(attackMs, 0.0...15_000), (holdMs, 0.0...15_000),
                               (decayMs, 0.0...25_000), (releaseMs, 0.0...25_000),
                               (sustainDb, -60.0...0)] {
            guard value.isFinite, range.contains(value) else { throw BronzeSessionError.invalid }
        }
    }
}

enum BronzeEQParameter: String, CaseIterable, Identifiable {
    case frequency = "Frequência", gain = "Gain", quality = "Q"
    var id: String { rawValue }
}

struct BronzeEQBand: Codable, Equatable, Sendable {
    // Same codes as EqBandType in the C++ engine.
    var type = 2
    var frequency = 1000.0
    var gain = 0.0
    var quality = 0.7071
    var cutStages = 1
    var isCut: Bool { type == 0 || type == 4 }

    func normalized(_ parameter: BronzeEQParameter) -> Double {
        switch parameter {
        case .frequency: return log(frequency / 20) / log(1000)
        case .gain: return (gain + 24) / 48
        case .quality: return log(quality / 0.1) / log(120)
        }
    }

    mutating func setNormalized(_ parameter: BronzeEQParameter, _ value: Double) {
        guard value.isFinite else { return }
        let value = min(1, max(0, value))
        switch parameter {
        case .frequency: frequency = 20 * pow(1000, value)
        case .gain: gain = -24 + value * 48
        case .quality: quality = 0.1 * pow(120, value)
        }
    }

    mutating func step(_ parameter: BronzeEQParameter, direction: Int) {
        let direction = direction < 0 ? -1.0 : 1.0
        switch parameter {
        case .frequency:
            // Crossing 1 kHz remains reversible: 990, 1000, 1100…
            let increment = (direction > 0 ? frequency >= 1000 : frequency > 1000) ? 100.0 : 10.0
            frequency = min(20000, max(20, (frequency + direction * increment).rounded()))
        case .gain: gain = min(24, max(-24, (gain * 10 + direction).rounded() / 10))
        case .quality: quality = min(12, max(0.1, (quality * 10 + direction).rounded() / 10))
        }
    }

    func text(_ parameter: BronzeEQParameter) -> String {
        switch parameter {
        case .frequency: return frequency >= 1000 ? String(format: "%.1f kHz", frequency / 1000) : String(format: "%.0f Hz", frequency)
        case .gain: return String(format: "%.1f dB", gain)
        case .quality: return String(format: "%.2f", quality)
        }
    }
}

struct BronzeEqualizer: Codable, Equatable, Sendable {
    var enabled = false
    var bands = [BronzeEQBand(type: 1, frequency: 80), BronzeEQBand(frequency: 250),
                 BronzeEQBand(frequency: 1000), BronzeEQBand(frequency: 4000),
                 BronzeEQBand(type: 3, frequency: 12000)]

    func validate() throws {
        guard bands.count == 5 else { throw BronzeSessionError.invalid }
        for band in bands {
            guard (0...4).contains(band.type), (1...8).contains(band.cutStages),
                  band.frequency.isFinite, (20...20000).contains(band.frequency),
                  band.gain.isFinite, (-24...24).contains(band.gain),
                  band.quality.isFinite, (0.1...12).contains(band.quality) else { throw BronzeSessionError.invalid }
        }
    }
}

struct BronzeReverb: Codable, Equatable, Sendable {
    static let names = ["Room 1", "Room 2", "Hall 1", "Hall 2"]
    var enabled = false
    var impulse = 0
    var mixes = [0.2, 0.2, 0.2, 0.2]
    var decays = [1.0, 1.0, 1.0, 1.0]
    var mix: Double { mixes[impulse] }
    var decay: Double { decays[impulse] }

    mutating func select(_ index: Int) {
        guard mixes.indices.contains(index) else { return }
        impulse = index
    }

    mutating func setMix(_ value: Double) {
        guard value.isFinite, mixes.indices.contains(impulse) else { return }
        mixes[impulse] = min(1, max(0, value))
    }

    mutating func setDecay(_ value: Double) {
        guard value.isFinite, decays.indices.contains(impulse) else { return }
        decays[impulse] = min(1, max(0.1, value))
    }

    func validate() throws {
        guard (0..<4).contains(impulse), mixes.count == 4, decays.count == 4,
              mixes.allSatisfy({ $0.isFinite && (0...1).contains($0) }),
              decays.allSatisfy({ $0.isFinite && (0.1...1).contains($0) }) else { throw BronzeSessionError.invalid }
    }
}

enum BronzeDelayParameter: String, CaseIterable, Identifiable {
    case milliseconds = "Tempo", feedback = "Feedback", mix = "Mix"
    var id: String { rawValue }
}

struct BronzeDelay: Codable, Equatable, Sendable {
    static let divisions = ["1/1", "1/2", "1/4", "1/8", "1/16", "1/8 D", "1/8 T"]
    static let multipliers = [4.0, 2, 1, 0.5, 0.25, 0.75, 1.0 / 3]
    var enabled = false
    var sync = false
    var division = 2
    var milliseconds = 500.0
    var feedback = 0.35
    var mix = 0.25
    var beatMultiplier: Double { Self.multipliers[division] }

    func effectiveMilliseconds(bpm: Double) -> Double {
        let beat = sync ? 60000 / min(300, max(60, bpm)) : milliseconds
        // Match the C++ delay-line capacity, including long manual divisions.
        return min(4000, beat * beatMultiplier)
    }

    func normalized(_ parameter: BronzeDelayParameter) -> Double {
        switch parameter {
        case .milliseconds: return log(milliseconds) / log(2000)
        case .feedback: return feedback / 0.95
        case .mix: return mix
        }
    }

    mutating func setNormalized(_ parameter: BronzeDelayParameter, _ value: Double) {
        guard value.isFinite else { return }
        let value = min(1, max(0, value))
        switch parameter {
        case .milliseconds: if !sync { milliseconds = pow(2000, value) }
        case .feedback: feedback = value * 0.95
        case .mix: mix = value
        }
    }

    mutating func step(_ parameter: BronzeDelayParameter, direction: Int) {
        let sign = direction < 0 ? -1.0 : 1.0
        switch parameter {
        case .milliseconds:
            guard !sync else { return }
            let increment = (sign > 0 ? milliseconds >= 1000 : milliseconds > 1000) ? 100.0 : 10.0
            milliseconds = min(2000, max(1, (milliseconds + sign * increment).rounded()))
        case .feedback: feedback = min(0.95, max(0, (feedback * 100 + sign).rounded() / 100))
        case .mix: mix = min(1, max(0, (mix * 100 + sign).rounded() / 100))
        }
    }

    func text(_ parameter: BronzeDelayParameter, bpm: Double) -> String {
        switch parameter {
        case .milliseconds:
            if sync { return String(format: "%.1f BPM", bpm) }
            return milliseconds >= 1000 ? String(format: "%.1f s", milliseconds / 1000) : String(format: "%.0f ms", milliseconds)
        case .feedback: return String(format: "%.0f%%", feedback * 100)
        case .mix: return String(format: "%.0f%%", mix * 100)
        }
    }

    func validate() throws {
        guard Self.divisions.indices.contains(division), milliseconds.isFinite, (1...2000).contains(milliseconds),
              feedback.isFinite, (0...0.95).contains(feedback), mix.isFinite, (0...1).contains(mix)
        else { throw BronzeSessionError.invalid }
    }
}

// Transient gesture state, never saved in a preset/session. Timestamps are monotonic.
struct BronzeDelayTap {
    private var previous: Double?
    mutating func reset() { previous = nil }
    mutating func tap(at timestamp: Double) -> Double? {
        guard timestamp.isFinite else { return nil }
        defer { previous = timestamp }
        guard let previous else { return nil }
        let interval = (timestamp - previous) * 1000
        guard (1...2000).contains(interval) else { return nil }
        return interval.rounded()
    }
}

struct BronzeModuleSnapshot: Codable, Equatable, Sendable {
    // Relative UUID/file.sf2; absolute sandbox paths change after reinstall/update.
    var soundFontKey: String?
    var enabled = false
    var fader = 1.0
    var envelope = BronzeEnvelope()
    var equalizer = BronzeEqualizer()
    var reverb = BronzeReverb()
    var delay = BronzeDelay()

    static var defaults: [Self] {
        (0..<8).map { index in
            var module = Self()
            module.enabled = index == 6
            return module
        }
    }
}

struct BronzePresetSlot: Codable, Equatable, Sendable {
    var name = "Empty"
    var color = 0
    var modules: [BronzeModuleSnapshot]?
}

struct BronzeNativeSession: Codable, Equatable, Sendable {
    var modules = BronzeModuleSnapshot.defaults
    var presets = (0..<96).map { BronzePresetSlot(color: $0 % 8) }
    var bank = 0
    var activePreset: Int?
    var selectedModule = 0
    var soloModule: Int?
    // Organ performance state is global, deliberately outside preset slots.
    var organDrawbars = [8, 8, 8, 0, 0, 0, 0, 0, 0]
    var organRotaryFast = false
    var organCabinetEnabled = true
    var tempo = 120.0
    var clickSound = 1
    var numerator = 4
    var denominator = 4
    var padBank = 0
    var padLow = 0.0
    var padHigh = 1.0
    var loopID: Int?

    func validate() throws {
        guard presets.count == 96, (0..<6).contains(bank),
              (0..<8).contains(selectedModule), soloModule.map({ (0..<8).contains($0) }) ?? true,
              activePreset.map({ (0..<96).contains($0) }) ?? true,
              organDrawbars.count == 9, organDrawbars.allSatisfy({ (0...8).contains($0) }),
              tempo.isFinite, (60...300).contains(tempo), (1...5).contains(clickSound),
              (1...16).contains(numerator), [2, 4, 8, 16].contains(denominator),
              (0..<2).contains(padBank), padLow.isFinite, (0...1).contains(padLow),
              padHigh.isFinite, (0...1).contains(padHigh),
              loopID.map({ (1...3).contains($0) }) ?? true else { throw BronzeSessionError.invalid }
        try Self.validateModules(modules)
        for preset in presets {
            guard !preset.name.isEmpty, preset.name.count <= 40, (0..<8).contains(preset.color) else {
                throw BronzeSessionError.invalid
            }
            if let modules = preset.modules { try Self.validateModules(modules) }
        }
    }

    static func validateModules(_ modules: [BronzeModuleSnapshot]) throws {
        guard modules.count == 8 else { throw BronzeSessionError.invalid }
        for (index, module) in modules.enumerated() {
            guard module.fader.isFinite, (0...1).contains(module.fader) else { throw BronzeSessionError.invalid }
            try module.envelope.validate()
            try module.equalizer.validate()
            try module.reverb.validate()
            try module.delay.validate()
            if let key = module.soundFontKey {
                guard index < 6 else { throw BronzeSessionError.invalid }
                try BronzeSessionStore.validateSoundFontKey(key)
            }
        }
    }
}

enum BronzeSessionError: LocalizedError {
    case invalid
    var errorDescription: String? { "A sessão nativa contém dados inválidos. O arquivo original foi preservado." }
}

struct BronzeSessionStore: Sendable {
    let directory: URL
    var sessionURL: URL { directory.appendingPathComponent("native-session.json") }
    var soundFontDirectory: URL { directory.appendingPathComponent("UserSoundFonts", isDirectory: true) }

    static func applicationStore() throws -> Self {
        let root = try FileManager.default.url(for: .applicationSupportDirectory,
            in: .userDomainMask, appropriateFor: nil, create: true)
        return Self(directory: root.appendingPathComponent("BronzeKeys", isDirectory: true))
    }

    static func validateSoundFontKey(_ key: String) throws {
        let parts = key.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2, UUID(uuidString: String(parts[0])) != nil,
              !parts[1].isEmpty, !key.contains("\\"), !key.contains(":"), !key.contains("\0"),
              String(parts[1]).lowercased().hasSuffix(".sf2") else { throw BronzeSessionError.invalid }
    }

    func soundFontURL(for key: String) throws -> URL {
        try Self.validateSoundFontKey(key)
        let root = soundFontDirectory.resolvingSymlinksInPath().standardizedFileURL
        let url = soundFontDirectory.appendingPathComponent(key).resolvingSymlinksInPath().standardizedFileURL
        guard url.path.hasPrefix(root.path + "/") else { throw BronzeSessionError.invalid }
        return url
    }

    func load() throws -> BronzeNativeSession? {
        guard FileManager.default.fileExists(atPath: sessionURL.path) else { return nil }
        let data = try Data(contentsOf: sessionURL)
        let session = try JSONDecoder().decode(BronzeNativeSession.self, from: data)
        try session.validate()
        return session
    }

    func save(_ session: BronzeNativeSession) throws {
        try session.validate()
        let data = try JSONEncoder().encode(session)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: sessionURL, options: .atomic)
    }
}
