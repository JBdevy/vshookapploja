import Foundation

struct BronzeSynthPreset: Codable, Equatable, Sendable {
    var name = "Empty"
    var sound: BronzeSynth?
    var envelope = BronzeEnvelope()
    var color = 0
}

struct BronzeUserTrack: Codable, Equatable, Sendable, Identifiable {
    var id = UUID()
    var name: String
    var key: String
}

struct BronzeUserPlaylist: Codable, Equatable, Sendable, Identifiable {
    var id = UUID()
    var name: String
    var isLoop = false
    var tracks: [BronzeUserTrack] = []
    var repeatEnabled = false
    var autoAdvance = false
    var numerator = 4
    var denominator = 4
}

struct BronzeUserFX: Codable, Equatable, Sendable {
    var name = "Empty"
    var key: String?
    var gainDb = 0.0
    var color = 0
}

struct BronzeFXBank: Codable, Equatable, Sendable {
    var name: String
    var pads = (0..<12).map { BronzeUserFX(name: "FX \($0 + 1)", color: $0 % 8) }
}

struct BronzeUserWorkspace: Codable, Equatable, Sendable {
    var catalogDownloads: [String: String]?
    var midi: BronzeMIDISettings?
    var synthPresets = (0..<16).map { BronzeSynthPreset(color: $0 % 8) }
    var activeSynthPreset: Int?
    var playlists: [BronzeUserPlaylist] = []
    // nil is the immutable bundled playlist. IDs survive reordering/removal.
    var selectedPlaylist: UUID?
    var selectedTrack: UUID?
    var fxBanks = (0..<8).map { BronzeFXBank(name: $0 == 0 ? "Church" : "FX \($0 + 1)") }
    var fxBank = 0

    func validate() throws {
        for (id, key) in catalogDownloads ?? [:] {
            guard !id.isEmpty, id.count <= 120 else { throw BronzeSessionError.invalid }
            try BronzeSessionStore.validateSoundFontKey(key)
        }
        try midi?.validate()
        guard synthPresets.count == 16, activeSynthPreset.map({ (0..<16).contains($0) }) ?? true,
              fxBanks.count == 8, fxBanks[0].name == "Church", (0..<8).contains(fxBank),
              playlists.count <= 256, Set(playlists.map(\.id)).count == playlists.count,
              selectedPlaylist.map({ id in playlists.contains { $0.id == id } }) ?? true else { throw BronzeSessionError.invalid }
        for preset in synthPresets {
            try Self.validateName(preset.name); try preset.sound?.validate(); try preset.envelope.validate()
            guard (0..<8).contains(preset.color) else { throw BronzeSessionError.invalid }
        }
        var trackIDs = Set<UUID>()
        for list in playlists {
            try Self.validateName(list.name)
            guard list.tracks.count <= 2000, (1...16).contains(list.numerator), [2, 4, 8, 16].contains(list.denominator),
                  !list.isLoop || (!list.repeatEnabled && !list.autoAdvance) else { throw BronzeSessionError.invalid }
            for track in list.tracks {
                try Self.validateName(track.name); try BronzeUserMediaStore.validateKey(track.key)
                guard trackIDs.insert(track.id).inserted else { throw BronzeSessionError.invalid }
            }
        }
        if let selectedTrack {
            guard let list = playlists.first(where: { $0.id == selectedPlaylist }),
                  list.tracks.contains(where: { $0.id == selectedTrack }) else { throw BronzeSessionError.invalid }
        }
        for (bankIndex, bank) in fxBanks.enumerated() {
            try Self.validateName(bank.name)
            guard bank.pads.count == 12 else { throw BronzeSessionError.invalid }
            for pad in bank.pads {
                try Self.validateName(pad.name)
                guard pad.gainDb.isFinite, (-36...0).contains(pad.gainDb), (0..<8).contains(pad.color) else { throw BronzeSessionError.invalid }
                if let key = pad.key {
                    guard bankIndex != 0 else { throw BronzeSessionError.invalid }
                    try BronzeUserMediaStore.validateKey(key)
                }
            }
        }
    }
    static func validateName(_ name: String) throws {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 120,
              !name.contains("\0") else { throw BronzeSessionError.invalid }
    }
    static func name(_ value: String, fallback: String) -> String {
        let clean = String(value.replacingOccurrences(of: "\0", with: "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(120))
        return clean.isEmpty ? fallback : clean
    }
}

struct BronzeCCMapping: Codable, Equatable, Sendable {
    var device: String
    var channel: Int
    var controller: Int
    var minimum = 0.0
    var maximum = 1.0
    var inverted = false
    func normalized(_ value: Int) -> Double {
        let n = Double(min(127, max(0, value))) / 127
        return minimum + (inverted ? 1 - n : n) * (maximum - minimum)
    }
}

struct BronzeMIDINoteMapping: Codable, Equatable, Sendable {
    var note: Int
    var kind: Int // 1 continuous pad; 2 FX (channel 10, all connected inputs).
    var bank: Int
    var item: Int
}

struct BronzeMIDISettings: Codable, Equatable, Sendable {
    var compatibility = false
    var controls: [String: BronzeCCMapping] = [:]
    var notes: [BronzeMIDINoteMapping] = []
    func validate() throws {
        let allowed = Set(BronzeMIDITarget.all.map(\.id))
        guard controls.count <= allowed.count, notes.count <= 128,
              Set(notes.map(\.note)).count == notes.count else { throw BronzeSessionError.invalid }
        for (target, map) in controls {
            guard allowed.contains(target), map.device.count <= 256, (1...16).contains(map.channel), (0...127).contains(map.controller),
                  map.minimum.isFinite, map.maximum.isFinite, (0...1).contains(map.minimum), (map.minimum...1).contains(map.maximum) else { throw BronzeSessionError.invalid }
        }
        for note in notes {
            guard (0...127).contains(note.note), (1...2).contains(note.kind), (0..<12).contains(note.item),
                  (0..<(note.kind == 1 ? 2 : 8)).contains(note.bank) else { throw BronzeSessionError.invalid }
        }
    }
}

struct BronzeMIDITarget: Identifiable, Equatable {
    let id: String
    let name: String
    var continuous = false
    static let all: [Self] = {
        var result: [Self] = [Self(id: "tempo:-", name: "BPM −0,5"), Self(id: "tempo:+", name: "BPM +0,5"),
            Self(id: "click", name: "Metrônomo ON/OFF"), Self(id: "transport", name: "Play / Stop"),
            Self(id: "padLow", name: "Pads · Low", continuous: true), Self(id: "padHigh", name: "Pads · High", continuous: true)]
        for module in 0..<8 {
            let prefix = "Módulo \(module + 1) · "
            for (key, title, continuous) in [("fader", "Volume", true), ("on", "ON/OFF", false), ("solo", "Solo", false)] {
                result.append(Self(id: "\(key):\(module)", name: prefix + title, continuous: continuous))
            }
            for (index, title) in ["Attack", "Release", "Hold", "Decay", "Sustain"].enumerated() {
                result.append(Self(id: "env:\(module):\(index)", name: prefix + title, continuous: true))
            }
            for band in 0..<5 { for parameter in 0..<3 {
                result.append(Self(id: "eq:\(module):\(band):\(parameter)", name: prefix + "EQ \(band + 1) · \(["Freq", "Gain", "Q"][parameter])", continuous: true))
            } }
            for parameter in 0..<2 {
                result.append(Self(id: "reverb:\(module):\(parameter)", name: prefix + "Reverb · \(parameter == 0 ? "Mix" : "Decay")", continuous: true))
            }
            for parameter in 0..<3 {
                result.append(Self(id: "delay:\(module):\(parameter)", name: prefix + "Delay · \(["Tempo", "Feedback", "Mix"][parameter])", continuous: true))
            }
            for kind in BronzeProcessorKind.allCases where module != 6 || kind == .chorus {
                for (parameter, spec) in kind.parameters.enumerated() {
                    result.append(Self(id: "fx:\(module):\(kind.rawValue):\(parameter)", name: prefix + kind.rawValue + " · " + spec.name, continuous: true))
                }
            }
            for parameter in BronzeToneParameter.allCases where module < 6 || parameter == .gain {
                result.append(Self(id: "tone:\(module):\(parameter.index)", name: prefix + "Filter · " + parameter.rawValue, continuous: true))
            }
            for effect in ["eqOn", "reverbOn", "delayOn", "chorusOn", "pulseOn"] + (module == 6 ? [] : ["compressorOn", "vibesOn", "arpOn"]) {
                result.append(Self(id: "\(effect):\(module)", name: prefix + effect))
            }
        }
        for index in 0..<96 { result.append(Self(id: "preset:\(index)", name: "Preset \(["A", "B", "C", "D", "E", "F"][index / 16])\(index % 16 + 1)")) }
        for index in 0..<6 { result.append(Self(id: "bank:\(index)", name: "Banco \(["A", "B", "C", "D", "E", "F"][index])")) }
        for index in 0..<9 { result.append(Self(id: "drawbar:\(index)", name: "B3 · Drawbar \(index + 1)", continuous: true)) }
        result.append(Self(id: "rotary", name: "B3 · Slow/Fast")); result.append(Self(id: "cabinet", name: "B3 · Gabinet"))
        for parameter in BronzeSynthParameter.allCases { result.append(Self(id: "synth:\(parameter.rawValue)", name: "Synth · " + parameter.rawValue, continuous: true)) }
        for oscillator in 0..<3 { for parameter in ["Volume", "Detune", "Octave"] {
            result.append(Self(id: "osc:\(oscillator):\(parameter)", name: "OSC \(oscillator + 1) · " + parameter, continuous: true))
        } }
        return result
    }()
}

struct BronzeUserMediaStore: Sendable {
    let session: BronzeSessionStore
    static let extensions = ["mp3", "wav", "m4a", "aif", "aiff", "caf"]
    var directory: URL { session.directory.appendingPathComponent("UserMedia", isDirectory: true) }
    static func validateKey(_ key: String) throws {
        let parts = key.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2, UUID(uuidString: String(parts[0])) != nil,
              !parts[1].isEmpty, !key.contains("\\"), !key.contains(":"), !key.contains("\0"),
              extensions.contains(URL(fileURLWithPath: String(parts[1])).pathExtension.lowercased()) else { throw BronzeSessionError.invalid }
    }
    func url(_ key: String) throws -> URL {
        try Self.validateKey(key)
        let root = directory.resolvingSymlinksInPath().standardizedFileURL
        let file = directory.appendingPathComponent(key).resolvingSymlinksInPath().standardizedFileURL
        guard file.path.hasPrefix(root.path + "/") else { throw BronzeSessionError.invalid }
        return file
    }
    func importFile(_ source: URL) throws -> String {
        let key = UUID().uuidString + "/" + source.lastPathComponent
        let destination = try url(key)
        let info = try source.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard info.isRegularFile == true, (info.fileSize ?? 0) > 0 else { throw BronzeSessionError.invalid }
        try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        do { try FileManager.default.copyItem(at: source, to: destination) }
        catch { try? FileManager.default.removeItem(at: destination.deletingLastPathComponent()); throw error }
        return key
    }
    // Only for a just-imported file rejected by the decoder, never a source document.
    func discardImport(_ key: String) { if let file = try? url(key) { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) } }
}
