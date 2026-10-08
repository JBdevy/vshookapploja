import Foundation

enum MixerScale {
    static func decibels(_ ratio: Double, max: Double = 12) -> Double {
        let safe = min(1, Swift.max(0, ratio))
        if safe <= 0 { return -.infinity }
        if safe <= 0.76 { return -90 + pow(safe / 0.76, 1 / 1.35) * 90 }
        return (safe - 0.76) / 0.24 * max
    }
    static func ratio(_ item: JSON, max: Double = 12) -> Double {
        // Timeline `ratio` can describe geometry, not item volume.
        let explicit = max == 24 ? item.first("volumeRatio", "volume_ratio") : item.first("volumeRatio", "volume_ratio", "ratio")
        if explicit.exists { return min(1, Swift.max(0, explicit.double)) }
        var db = item.first("db", "volumeDb", "volume_db")
        if !db.exists && item["volume"].exists { db = .number(item["volume"].double > 0 ? 20 * log10(item["volume"].double) : -150) }
        guard db.exists else { return 0.76 }
        if db.double <= -90 { return 0 }
        if db.double <= 0 { return 0.76 * pow((db.double + 90) / 90, 1.35) }
        return min(1, 0.76 + (db.double / max) * 0.24)
    }
    static func visible(_ item: JSON) -> Bool {
        // Match the desktop/Web client technical-track names exactly. Dropping
        // digits hid ordinary audio tracks such as MEDIA 2 or TELEPROMPT 3.
        // For an item, its take name must not override the owning track name.
        let trackNames = ["trackName", "track_name", "trackLabel", "track"].compactMap { key -> String? in
            guard case .string(let value) = item[key], !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            return value
        }
        return !(trackNames.isEmpty ? [item.name] : trackNames).contains { raw in
            let name = raw.folding(options: .diacriticInsensitive, locale: Locale(identifier: "en_US_POSIX"))
                .uppercased().unicodeScalars.filter { (65...90).contains($0.value) || (48...57).contains($0.value) }
            return ["TELEPROMPT1", "TELEPROMPT2", "CIFRAS", "MEDIA", "TIMECODE"].contains(String(String.UnicodeScalarView(name)))
        }
    }
}
