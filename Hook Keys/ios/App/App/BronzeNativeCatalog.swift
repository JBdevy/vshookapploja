import Foundation
import CoreFoundation

struct BronzeCatalogSound: Identifiable, Sendable {
    let id: String
    let name: String
    let objectKey: String
    let version: Int
    let byteSize: Int?
    let sha256: String?
    var previewObjectKey: String?
    var publishedAt: String?
    var color: UInt32 = 0x35d273
    var defaultsData: Data?
}

struct BronzeCatalogCategory: Identifiable, Sendable {
    let id: String
    let name: String
    let visibleModule: Int?
    let sounds: [BronzeCatalogSound]
    var color: UInt32 = 0xcd7f32
}

struct BronzeCatalogInstall: Codable, Equatable, Sendable {
    let version: Int
    let objectKey: String
    func matches(_ sound: BronzeCatalogSound) -> Bool {
        version == sound.version && objectKey == sound.objectKey
    }
}

// Foundation-only parsing keeps catalog validation testable on Linux and macOS.
enum BronzeNativeCatalog {
    enum Invalid: LocalizedError {
        case payload
        var errorDescription: String? { "O catálogo de timbres contém dados inválidos." }
    }
    static func parse(_ data: Data) throws -> [BronzeCatalogCategory] {
        guard data.count <= 16 * 1024 * 1024,
              let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let categories = payload["categories"] as? [[String: Any]], categories.count <= 256 else { throw Invalid.payload }
        let revision = try positiveInteger(payload["revision"], fallback: 1)
        var categoryIDs = Set<String>(), soundIDs = Set<String>()
        var sortedCategories: [(Int, Int, BronzeCatalogCategory)] = []
        for (categoryIndex, category) in categories.enumerated() {
            let id = try text(category["id"], limit: 120), name = try text(category["name"], limit: 80)
            guard categoryIDs.insert(id).inserted else { throw Invalid.payload }
            let order = try positiveInteger(category["order"], fallback: categoryIndex + 1)
            let visible: Int?
            if category["visibleModule"] == nil || category["visibleModule"] is NSNull { visible = nil }
            else {
                let value = try positiveInteger(category["visibleModule"], fallback: 1)
                guard (1...8).contains(value) else { throw Invalid.payload }; visible = value
            }
            let rawSounds: [[String: Any]]
            if category["sounds"] == nil { rawSounds = [] }
            else if let values = category["sounds"] as? [[String: Any]] { rawSounds = values }
            else { throw Invalid.payload }
            guard rawSounds.count <= 10000 - soundIDs.count else { throw Invalid.payload }
            var sounds: [(Int, Int, BronzeCatalogSound)] = []
            for (soundIndex, sound) in rawSounds.enumerated() {
                let soundID = try text(sound["id"], limit: 120)
                guard soundIDs.insert(soundID).inserted else { throw Invalid.payload }
                let primary = (sound["sf2ObjectKey"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
                let reference: Any? = primary?.isEmpty == false ? primary : sound["sf2Url"]
                let key = try text(reference, limit: 2048)
                let bytes: Int?
                if sound["byteSize"] == nil || sound["byteSize"] is NSNull { bytes = nil }
                else { bytes = try positiveInteger(sound["byteSize"], fallback: 1) }
                var sha: String?
                if let raw = sound["sha256"], !(raw is NSNull) {
                    let hash = try text(raw, limit: 64).lowercased()
                    guard hash.count == 64, hash.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else { throw Invalid.payload }
                    sha = hash
                }
                var value = BronzeCatalogSound(id: soundID, name: try text(sound["name"], limit: 120), objectKey: key,
                    version: try positiveInteger(sound["assetVersion"], fallback: revision), byteSize: bytes, sha256: sha, color: color(sound["color"], fallback: 0x35d273))
                let previewKey = (sound["previewObjectKey"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
                let previewURL = (sound["previewUrl"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
                if let preview = previewKey?.isEmpty == false ? previewKey : previewURL, !preview.isEmpty {
                    value.previewObjectKey = try text(preview, limit: 2048)
                }
                value.publishedAt = sound["publishedAt"] as? String
                let global = (payload["defaultSettings"] as? [String: Any])?["modules1To6"] as? [String: Any] ?? [:]
                let categoryDefaults = (category["defaultSettings"] as? [String: Any])?["modules1To6"] as? [String: Any] ?? [:]
                let soundDefaults = (sound["moduleSettings"] as? [String: Any])?["modules1To6"] as? [String: Any] ?? [:]
                value.defaultsData = try JSONSerialization.data(withJSONObject: merge(merge(global, categoryDefaults), soundDefaults))
                sounds.append((try positiveInteger(sound["order"], fallback: soundIndex + 1), soundIndex, value))
            }
            sounds.sort { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }
            sortedCategories.append((order, categoryIndex, BronzeCatalogCategory(id: id, name: name, visibleModule: visible, sounds: sounds.map { $0.2 }, color: color(category["color"], fallback: 0xcd7f32))))
        }
        sortedCategories.sort { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }
        return sortedCategories.map { $0.2 }
    }
    private static func merge(_ base: [String: Any], _ overrides: [String: Any]) -> [String: Any] {
        base.merging(overrides) { old, new in
            if let old = old as? [String: Any], let new = new as? [String: Any] { return merge(old, new) }
            return new
        }
    }
    private static func color(_ value: Any?, fallback: UInt32) -> UInt32 {
        guard let raw = value as? String, raw.count == 7, raw.first == "#",
              let hex = UInt32(raw.dropFirst(), radix: 16) else { return fallback }
        return hex
    }
    private static func text(_ value: Any?, limit: Int) throws -> String {
        guard let raw = value as? String else { throw Invalid.payload }
        let result = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !result.isEmpty, result.count <= limit, !result.contains("\0") else { throw Invalid.payload }
        return result
    }
    private static func positiveInteger(_ value: Any?, fallback: Int) throws -> Int {
        guard let value, !(value is NSNull) else { return fallback }
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { throw Invalid.payload }
        let n = number.doubleValue
        guard n.isFinite, n >= 1, n <= 9_007_199_254_740_991, n.rounded() == n else { throw Invalid.payload }
        return Int(n)
    }
}

extension BronzeCatalogSound {
    func nativeDefaults(moduleIndex: Int) -> BronzeModuleSettings {
        var settings = BronzeModuleSettings.factory(moduleIndex)
        guard let defaultsData, let values = try? JSONSerialization.jsonObject(with: defaultsData) as? [String: Any] else { return settings }
        func number(_ dictionary: [String: Any], _ key: String, _ fallback: Double, _ range: ClosedRange<Double>) -> Double {
            guard let n = dictionary[key] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite else { return fallback }
            return min(range.upperBound, max(range.lowerBound, n.doubleValue))
        }
        settings.envelope.attackMs = number(values, "attackMs", settings.envelope.attackMs, 0...15000)
        settings.envelope.holdMs = number(values, "holdMs", settings.envelope.holdMs, 0...15000)
        settings.envelope.decayMs = number(values, "decayMs", settings.envelope.decayMs, 0...25000)
        settings.envelope.releaseMs = number(values, "releaseMs", settings.envelope.releaseMs, 0...25000)
        settings.envelope.sustainDb = number(values, "sustainDb", settings.envelope.sustainDb, -60...0)
        settings.equalizer.enabled = values["eqEnabled"] as? Bool ?? settings.equalizer.enabled
        var performance = settings.performance ?? BronzeModulePerformance.initial(moduleIndex)
        performance.polyphony = Int(number(values, "polyphony", Double(performance.polyphony), 1...128))
        performance.mode = values["voiceMode"] as? String == "mono" ? 1 : 0
        performance.glideMs = number(values, "glideMs", performance.glideMs, 0...5000)
        performance.glideSync = values["glideSync"] as? Bool ?? performance.glideSync
        performance.portamento = values["glideMode"] as? String == "portamento"
        if performance.portamento { performance.mode = 1 }
        performance.glideVelocityGate = values["glideVelocityEnabled"] as? Bool ?? false
        performance.glideVelocityInverted = values["glideVelocityInverted"] as? Bool ?? false
        performance.glideVelocityThreshold = Int(number(values, "glideVelocityThreshold", 64, 0...127))
        performance.noSens = values["noVelocitySensitivity"] as? Bool ?? performance.noSens
        performance.modulationIntensity = number(values, values["modulationMode"] as? String == "pan" ? "panIntensity" : "tremoloIntensity", 100, 0...100) / 100
        performance.velocityCeiling = Int(number(values, "velocityCeiling", 127, 1...127))
        performance.velocityIgnoreAbove = Int(number(values, "velocityLimit", 127, 0...127))
        performance.modulationMode = ["user", "lfo", "tremolo", "pan", "rotary"].firstIndex(of: values["modulationMode"] as? String ?? "user") ?? 0
        performance.modulationRate = number(values, "modulationRateHz", performance.modulationRate, 0.1...20)
        if let curve = values["velocityCurve"] as? [String: Any] {
            if let points = curve["points"] as? [Double], points.count == 5, points.allSatisfy({ $0.isFinite }) {
                performance.velocityCurve = points.map { Int(min(127, max(0, $0)).rounded()) }
            }
            performance.velocityMode = ["soft", "middle", "hard", "fixed", "user"].firstIndex(of: curve["mode"] as? String ?? "")
            if let points = curve["userPoints"] as? [Double], points.count == 5, points.allSatisfy({ $0.isFinite }) {
                performance.velocityUserCurve = points.map { Int(min(127, max(0, $0)).rounded()) }
            } else if performance.velocityMode == 4 { performance.velocityUserCurve = performance.velocityCurve }
            performance.velocityFixedValue = Int(number(curve, "fixedValue", 100, 0...127))
        }
        settings.performance = performance
        var tone = settings.tone ?? BronzeTone()
        tone[.gain] = number(values, "gainDb", tone[.gain], -36...12)
        tone[.cutoff] = number(values, "cutoffHz", tone[.cutoff], 20...20000)
        tone.type = ["lowpass2", "lowpass4", "highpass2", "highpass4"].firstIndex(of: values["cutoffFilterType"] as? String ?? "lowpass2") ?? 0
        tone.velocityEnabled = values["filterVelocityEnabled"] as? Bool ?? false
        tone.velocityCutoffHz = number(values, "filterVelocityCutoffHz", 100, 20...20000)
        if let curve = values["filterVelocityCurve"] as? [String: Any] {
            tone.velocityMode = ["soft", "middle", "hard", "fixed", "user"].firstIndex(of: curve["mode"] as? String ?? "")
            if let points = curve["points"] as? [Double], points.count == 5, points.allSatisfy({ $0.isFinite }) {
                tone.velocity = points.map { Int(min(127, max(0, $0)).rounded()) }
            }
            if let points = curve["userPoints"] as? [Double], points.count == 5, points.allSatisfy({ $0.isFinite }) {
                tone.velocityUserCurve = points.map { Int(min(127, max(0, $0)).rounded()) }
            }
            tone.velocityFixedValue = Int(number(curve, "fixedValue", 127, 0...127))
        }
        if let env = values["cutoffEnvelope"] as? [String: Any] {
            tone.envelopeEnabled = env["enabled"] as? Bool ?? false
            tone[.attack] = number(env, "attackMs", 5, 0...15000)
            tone[.decay] = number(env, "decayMs", 200, 0...25000)
            tone[.sustain] = number(env, "sustain", 100, 0...100) / 100
            tone[.release] = number(env, "releaseMs", 200, 0...25000)
            tone[.depth] = number(env, "depthOctaves", 4, 0...8)
        }
        if let bands = values["eqBands"] as? [[String: Any]], bands.count == 5 {
            for (index, band) in bands.enumerated() {
                settings.equalizer.bands[index].type = ["low-cut", "low-shelf", "band", "high-shelf", "high-cut"].firstIndex(of: band["type"] as? String ?? "band") ?? 2
                settings.equalizer.bands[index].frequency = number(band, "frequency", settings.equalizer.bands[index].frequency, 20...20000)
                settings.equalizer.bands[index].gain = number(band, "gain", 0, -24...24)
                settings.equalizer.bands[index].quality = number(band, "q", 1, 0.1...12)
                settings.equalizer.bands[index].cutStages = Int(number(band, "cutStages", 1, 1...8))
            }
        }
        if let delay = values["delay"] as? [String: Any] {
            settings.delay.enabled = delay["enabled"] as? Bool ?? false
            settings.delay.sync = delay["sync"] as? Bool ?? false
            settings.delay.division = BronzeDelay.divisions.firstIndex(of: delay["division"] as? String ?? "1/4") ?? 2
            settings.delay.milliseconds = number(delay, "milliseconds", 500, 1...2000)
            settings.delay.feedback = number(delay, "feedback", 35, 0...95) / 100
            settings.delay.mix = number(delay, "mix", 25, 0...100) / 100
        }
        if let raw = values["arpeggiator"] as? [String: Any] {
            var arp = settings.arpeggiator ?? BronzeArpeggiator()
            arp.enabled = moduleIndex != 6 && (raw["enabled"] as? Bool ?? false)
            arp.sync = raw["sync"] as? Bool ?? true
            arp.mode = ["up", "down", "up-down", "played", "random"].firstIndex(of: raw["mode"] as? String ?? "up") ?? 0
            arp.division = BronzePulse.divisions.firstIndex(of: raw["division"] as? String ?? "1/16") ?? 2
            arp.rateMs = number(raw, "rateMs", 125, 20...2000)
            arp.octaves = Int(number(raw, "octaves", 1, 1...4))
            arp.gate = number(raw, "gate", 72, 10...100) / 100
            arp.swing = number(raw, "swing", 0, 0...75) / 100
            arp.autoFaderEnabled = raw["autoFaderEnabled"] as? Bool ?? false
            arp.autoFaderHalf = raw["autoFaderDivision"] as? String == "1/2"
            arp.autoFaderDepthDb = number(raw, "autoFaderDepthDb", 5, 0...40)
            settings.arpeggiator = arp
        }
        if let raw = values["tranceGate"] as? [String: Any] {
            var pulse = settings.pulse ?? BronzePulse()
            pulse.enabled = raw["enabled"] as? Bool ?? false
            pulse.sync = raw["sync"] as? Bool ?? true
            pulse.division = BronzePulse.divisions.firstIndex(of: raw["division"] as? String ?? "1/16") ?? 2
            pulse.rateMs = number(raw, "rateMs", 125, 20...2000)
            pulse.length = Int(number(raw, "length", 16, 1...16))
            pulse.gate = number(raw, "gate", 50, 5...100) / 100
            pulse.depth = number(raw, "depth", 100, 0...100) / 100
            pulse.attack = number(raw, "attackMs", 3, 0.1...100)
            pulse.release = number(raw, "releaseMs", 3, 0.1...100)
            pulse.swing = number(raw, "swing", 0, 0...75) / 100
            if let steps = raw["steps"] as? [Bool], steps.count == 16 {
                pulse.steps = steps.enumerated().reduce(0) { $0 | ($1.element ? 1 << $1.offset : 0) }
            }
            settings.pulse = pulse
        }
        let reverb = values["reverb"] as? [String: Any] ?? [:]
        settings.reverb.enabled = reverb["enabled"] as? Bool ?? settings.reverb.enabled
        let spaces = ["room1", "room2", "hall1", "hall2"]
        settings.reverb.impulse = spaces.firstIndex(of: values["reverbSpace"] as? String ?? "room1") ?? 0
        let savedSpaces = values["reverbSpaces"] as? [String: [String: Any]] ?? [:]
        for (index, space) in spaces.enumerated() {
            settings.reverb.decays[index] = number(savedSpaces[space] ?? [:], "decay", 100, 10...100) / 100
            settings.reverb.mixes[index] = number(savedSpaces[space] ?? [:], "mix", number(reverb, "mix", 50, 0...100), 0...100) / 100
        }
        var effects = settings.soundEffects ?? BronzeSoundEffects()
        for (kind, key, names) in [(BronzeProcessorKind.compressor, "compressor", ["thresholdDb", "ratio", "attackMs", "releaseMs", "gainDb", "mix"]), (.chorus, "chorus", ["rateHz", "depth", "mix"]), (.vibes, "lofi", ["rateHz", "amountSemitones", "noiseDb"])] {
            guard let raw = values[key] as? [String: Any] else { continue }
            var processor = effects[kind]
            processor.enabled = raw["enabled"] as? Bool ?? processor.enabled
            processor.vinylEnabled = raw["vinylEnabled"] as? Bool ?? processor.vinylEnabled
            for (index, name) in names.enumerated() {
                let parameter = kind.parameters[index]
                let multiplier = (name == "mix" || name == "depth") ? 100.0 : 1.0
                processor.values[index] = number(raw, name, processor.values[index] * multiplier, (parameter.minimum * multiplier)...(parameter.maximum * multiplier)) / multiplier
            }
            effects[kind] = processor
        }
        settings.soundEffects = effects
        settings.tone = tone
        return settings
    }
}

struct BronzeDownloadProgress: Equatable, Sendable {
    var received: Int64 = 0
    var expected: Int64 = 0
    var fraction: Double? {
        guard expected > 0 else { return nil }
        return min(1, max(0, Double(received) / Double(expected)))
    }
    mutating func record(received: Int64, expected: Int64) {
        self.received = max(self.received, received)
        if expected > 0 { self.expected = expected }
    }
}
