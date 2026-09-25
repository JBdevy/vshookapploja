import Foundation
import CoreFoundation

struct BronzeCatalogSound: Identifiable, Sendable {
    let id: String
    let name: String
    let objectKey: String
    let version: Int
    let byteSize: Int?
    let sha256: String?
    var color: UInt32 = 0x35d273
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
                let value = BronzeCatalogSound(id: soundID, name: try text(sound["name"], limit: 120), objectKey: key,
                    version: try positiveInteger(sound["assetVersion"], fallback: revision), byteSize: bytes, sha256: sha, color: color(sound["color"], fallback: 0x35d273))
                sounds.append((try positiveInteger(sound["order"], fallback: soundIndex + 1), soundIndex, value))
            }
            sounds.sort { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }
            sortedCategories.append((order, categoryIndex, BronzeCatalogCategory(id: id, name: name, visibleModule: visible, sounds: sounds.map { $0.2 }, color: color(category["color"], fallback: 0xcd7f32))))
        }
        sortedCategories.sort { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }
        return sortedCategories.map { $0.2 }
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
