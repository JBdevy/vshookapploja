import Foundation

enum DirectorNumberOrder {
    static func number(_ item: JSON) -> Double { abs(item.first("sourceNumber", "source_number", "number", "id").double) }
    static func ascending(_ items: [JSON], localDirection: String = "") -> Bool {
        if !localDirection.isEmpty { return localDirection == "asc" }
        let values = items.filter { !$0.isSongBlock }.map(number)
        return values.count > 1 && zip(values, values.dropFirst()).allSatisfy { $0 <= $1 }
    }
    static func sorted(_ entries: [DirectorSongEntry], descending: Bool) -> [DirectorSongEntry] {
        entries.sorted { lhs, rhs in
            let a = number(lhs.item), b = number(rhs.item)
            if a == b { return lhs.position < rhs.position }
            return descending ? a > b : a < b
        }
    }
}

extension JSON {
    var isSongBlock: Bool {
        self["isBlock"].bool || self["block"].bool || ["block", "bloco", "playlist_block", "song_block"].contains(first("itemType", "type", "kind").string.lowercased()) || first("source_number", "sourceNumber", "number").double < 0
    }
    var isFamilyChild: Bool {
        self["isHashChild"].bool || self["isRegionChild"].bool || ["child", "hash_child"].contains(first("familyRole", "itemType", "type").string.lowercased())
    }
    var isFamilyParent: Bool {
        self["isHashParent"].bool || self["isParent"].bool || name.hasPrefix("--") || name.hasSuffix("--") || ["parent", "hash_parent"].contains(first("familyRole", "itemType", "type").string.lowercased())
    }
    var songDuration: Double {
        let value = first("durationSec", "duration").double
        return value > 0 ? value : max(0, first("endPos", "end_pos").double - first("startPos", "start_pos").double)
    }
    var songBPM: Double { first("bpmValue", "detectedBpm", "bpm", "tempo", "originalBpm").double }
    var songTuner: Double { first("tunerValue", "tunerSemitones", "semitones", "transpose", "tuner").double }
}
struct DirectorSongEntry: Identifiable {
    let item: JSON
    let ordinal: String
    let parent: String
    let position: Int
    var id: String { "\(position):\(item.first("playlistEntryId", "id").string)" }
}
@MainActor extension HookSession {
    var songEntries: [DirectorSongEntry] { songEntries(for: allItems) }
    func songEntries(for items: [JSON]) -> [DirectorSongEntry] {
        var block = 0, song = 0
        var currentParent = ""
        return items.enumerated().compactMap { index, item in
            if item.isSongBlock { block += 1 } else { song += 1 }
            if item.isFamilyParent { currentParent = item.identifier }
            let explicit = item.first("parentId", "parentRegionId", "parentSourceNumber", "parent_source_number", "parent_region_number").string
            let parent = item.isFamilyChild ? (explicit.isEmpty ? currentParent : explicit) : ""
            guard query.isEmpty || item.name.localizedStandardContains(query) else { return nil }
            guard parent.isEmpty || openFamilies.contains(parent) || !query.isEmpty else { return nil }
            return DirectorSongEntry(item: item, ordinal: item.isSongBlock ? "\(block)°" : String(format: "%02d", song), parent: parent, position: index)
        }
    }
    var bypassActive: Bool { snapshot["multiloops"]["bypassActive"].bool }
    var liveEnabled: Bool { snapshot.first("liveModeEnabled", "liveEnabled", "live").bool }
    func autoEnabled(_ mode: Int) -> Bool {
        let direct = snapshot[mode == 1 ? "autoplay1Enabled" : "autoplay2Enabled"]
        return direct.exists ? direct.bool : snapshot["autoplayMode"].int == mode && snapshot["autoplayEnabled"].bool
    }
    func toggleBypass() {
        let next = !bypassActive
        command("multiloop_bypass_set", ["enabled": .bool(next), "desiredState": .string(next ? "on" : "off")], optimistic: ["multiloops": snapshot["multiloops"].merging(["bypassActive": .bool(next)])])
    }
    func timerText(at date: Date) -> String {
        let delta = snapshot["timerRunning"].bool && connected ? max(0, date.timeIntervalSince(lastUpdate)) : 0
        let anchor = snapshot.first("timerDisplaySec", "timerAccumulatedSec").double
        let total = anchor + (snapshot["timerMode"].string == "countdown" ? -delta : delta)
        let seconds = Int(min(Double(Int.max / 2), abs(total)))
        return String(format: "%@%02d:%02d:%02d", total < 0 ? "−" : "", seconds / 3600, (seconds % 3600) / 60, seconds % 60)
    }
    func song(withID id: String) -> JSON {
        guard !id.isEmpty else { return .null }
        return allItems.first { $0.identifier == id } ?? snapshot["regions"].array.first { $0.identifier == id } ?? .null
    }
    func progress(at date: Date) -> Double {
        guard playing || snapshot["transportPaused"].bool else { return 0 }
        let item = song(withID: playingID)
        guard item.songDuration > 0 else { return 0 }
        let age = playing && connected ? min(3, max(0, date.timeIntervalSince(lastUpdate))) : 0
        let position = snapshot.first("playPosition", "currentPlayPosition", "currentPosition", "playbackPosition", "position")
        let elapsed: Double
        if position.exists {
            var current = position.double + age
            let loopStart = snapshot["loopStartPos"].double, loopEnd = snapshot["loopEndPos"].double
            if snapshot["loopActive"].bool && loopEnd > loopStart && position.double >= loopStart && position.double < loopEnd && current >= loopEnd {
                current = loopStart + (current - loopStart).truncatingRemainder(dividingBy: loopEnd - loopStart)
            }
            elapsed = current - item.first("startPos", "start_pos").double
        } else { elapsed = item["elapsedSec"].double + age }
        return min(1, max(0, elapsed / item.songDuration))
    }
    func adjustSong(_ item: JSON, tool: String, delta: Double, reset: Bool = false) {
        guard !item.isSongBlock && !item.isFamilyParent else { return }
        if tool == "bpm" {
            guard !(playing && item.identifier == playingID) else { message = "NÃO É POSSÍVEL ALTERAR O BPM DA MÚSICA TOCANDO"; return }
            guard item.songBPM > 0, item["bpmAvailable"] != false, item["bpmControllable"] != false else { message = "BPM NÃO ENCONTRADO"; return }
        }
        let value = tool == "tuner" ? min(12, max(-12, reset ? 0 : item.songTuner + delta)) : min(960, max(10, item.songBPM + delta))
        var payload = targetPayload(item).merging(["value": .number(value), tool == "tuner" ? "semitones" : "bpm": .number(value)])
        let number = item.first("sourceNumber", "source_number", "number")
        if number.exists { payload["sourceNumber"] = number; payload["regionNumber"] = number }
        command(tool + "_set", payload)
    }
}
func directorTime(_ value: Double) -> String {
    let seconds = Int(min(Double(Int.max / 2), max(0, value.isFinite ? value : 0)))
    if seconds >= 3600 { return String(format: "%d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60) }
    return String(format: "%d:%02d", seconds / 60, seconds % 60)
}

// Search is global, independent of the selected playlist or open drawers.
enum DirectorSearch {
    static func entries(_ data: JSON, query: String) -> [JSON] {
        func normalized(_ value: String) -> String { value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pt_BR")) }
        let words = normalized(query).split(whereSeparator: \.isWhitespace)
        let regions = data["regions"].array
        let playlists = data["playlists"].array.flatMap { $0.first("songs", "items", "tracks").array }
        var seen = Set<String>()
        let families = regions.filter { !$0.isSongBlock && !$0.isFamilyChild }.flatMap { DirectorFamily.children(of: $0, data: data) }
        return (regions + families + playlists).compactMap { item in
            guard !item.isSongBlock, !item.identifier.isEmpty, seen.insert(item.identifier).inserted else { return nil }
            let parent = item.familyParentID
            let name = regions.first { $0.identifier == parent }?.name ?? ""
            let searchable = normalized(item.name + " " + name)
            guard words.allSatisfy({ searchable.contains($0) }) else { return nil }
            return item.merging(["parentId": .string(parent), "parentName": .string(name)])
        }
    }
}

enum DirectorParts {
    static func markers(_ data: JSON, song: JSON) -> [JSON] {
        guard song.exists, !song.isFamilyParent, !song.isSongBlock else { return [] }
        let start = song.first("startPos", "start_pos").double, end = song.first("endPos", "end_pos").double
        let initial: JSON = ["id": .string("__parts_song_start__:" + song.identifier), "name": .string(song.name), "partsDisplayName": .string(song.name), "partsSongStart": true, "songStart": true, "songId": .string(song.identifier), "position": .number(start), "startPos": .number(start), "targetPosition": .number(start)]
        return [initial] + data["markers"].array.compactMap { marker in
            let position = marker.first("pos", "position", "startPos", "start_pos").double
            guard position >= start - 0.0005, position < end - 0.0005 else { return nil }
            let raw = marker.first("rawName", "originalName", "name", "label", "markerName").string.trimmingCharacters(in: .whitespaces)
            let prefix: String
            if raw.hasPrefix("$") { prefix = "$" }
            else if raw.count >= 2 && raw.first == "*" && "1234".contains(raw[raw.index(after: raw.startIndex)]) { prefix = String(raw.prefix(2)) }
            else { return nil }
            let name = String(raw.dropFirst(prefix.count)).trimmingCharacters(in: CharacterSet(charactersIn: "-–—: "))
            return marker.merging(["partsPrefix": .string(prefix), "partsDisplayName": .string(name.isEmpty ? "MARKER" : name)])
        }
    }
}

// Current bridges publish native child regions; marker children are the fallback
// used by the current desktop interface for sessions that still use song markers.
extension JSON {
    var familyParentID: String { first("parentId", "parentRegionId", "parentSourceNumber", "parent_source_number", "parent_region_number").string }
}
enum DirectorFamily {
    static func children(of parent: JSON, data: JSON) -> [JSON] {
        let start = parent.first("startPos", "start_pos").double, end = parent.first("endPos", "end_pos").double
        guard end > start else { return [] }
        let candidates = data["regions"].array + data["playlists"].array.flatMap { $0.first("songs", "items", "tracks").array }
        var seen = Set<String>()
        let native = candidates.filter { child in
            guard child.isFamilyChild, child.familyParentID == parent.identifier,
                  child.first("endPos", "end_pos").double > child.first("startPos", "start_pos").double + 0.0005 else { return false }
            let number = child.first("sourceNumber", "source_number", "number")
            let markerChild = data["markers"].array.contains { marker in
                let raw = marker.first("rawName", "originalName", "name", "label").string
                return !raw.isEmpty && !"$*!".contains(raw.first!) && number.exists && marker.first("number", "sourceNumber", "source_number") == number && abs(marker.first("pos", "position", "startPos", "start_pos").double - child.first("startPos", "start_pos").double) <= 0.001
            }
            return (child["isRegionChild"].bool || child["sourceKind"] == "region" || !markerChild) && seen.insert(child.identifier).inserted
        }.sorted { $0.first("startPos", "start_pos").double < $1.first("startPos", "start_pos").double }
        if !native.isEmpty { return native }
        let markers = data["markers"].array.filter { marker in
            let raw = marker.first("rawName", "originalName", "name", "label").string
            let position = marker.first("pos", "position", "startPos", "start_pos").double
            return !raw.isEmpty && !"$*!".contains(raw.first!) && position >= start - 0.0005 && position < end - 0.0005
        }.sorted { $0.first("pos", "position", "startPos", "start_pos").double < $1.first("pos", "position", "startPos", "start_pos").double }
        return markers.enumerated().compactMap { index, marker in
            let position = marker.first("pos", "position", "startPos", "start_pos").double
            let limit = index + 1 < markers.count ? markers[index + 1].first("pos", "position", "startPos", "start_pos").double : end
            guard limit > position + 0.0005 else { return nil }
            let number = marker.first("number", "sourceNumber", "source_number").exists ? marker.first("number", "sourceNumber", "source_number") : .number(Double(index + 1))
            let id = marker.identifier.hasPrefix("m") ? marker.identifier : "m" + number.string
            return marker.merging(["id": .string(id), "isHashChild": true, "itemType": "hash_child", "familyRole": "child", "parentId": .string(parent.identifier), "startPos": .number(position), "endPos": .number(limit), "durationSec": .number(limit - position), "sourceNumber": number, "markerEnumIndex": marker.first("enumIndex", "markerEnumIndex").exists ? marker.first("enumIndex", "markerEnumIndex") : .number(Double(index))])
        }
    }
}

enum DirectorPlaylistCopy {
    static func text(_ playlist: JSON, data: JSON, includeChildren: Bool) -> String {
        let songs = playlist.first("songs", "items", "tracks").array
        let parentIDs = Set(songs.filter(\.isFamilyParent).map(\.identifier))
        var expanded: [JSON] = []
        for song in songs {
            if song.isFamilyChild && parentIDs.contains(song.familyParentID) { continue }
            expanded.append(song)
            if includeChildren && parentIDs.contains(song.identifier) { expanded += DirectorFamily.children(of: song, data: data) }
        }
        guard !expanded.isEmpty else { return "" }
        let seconds = Int(min(Double(Int.max / 2), max(0, DirectorPlaylistTiming.seconds(playlist))))
        let duration = seconds >= 3600 ? String(format: "%02d:%02d:%02d", seconds / 3600, seconds % 3600 / 60, seconds % 60) : String(format: "%02d:%02d", seconds / 60, seconds % 60)
        var lines = [playlist.name, "", "Tempo total: " + duration, ""]
        for (index, song) in expanded.enumerated() {
            if song.isSongBlock {
                if lines.last != "" { lines.append("") }
                let trimmed = song.name.trimmingCharacters(in: CharacterSet(charactersIn: " \t\n=:><-"))
                let number = abs(song.first("blockNumber", "block_number", "sourceNumber", "source_number").int)
                lines.append("[" + (trimmed.isEmpty ? String(format: "BLOCO %02d", number > 0 ? number : index + 1) : trimmed.uppercased()) + "]")
            } else { lines.append(song.name) }
        }
        return lines.joined(separator: "\n")
    }
}

enum DirectorPlaylistTiming {
    static func seconds(_ playlist: JSON) -> Double {
        for key in ["activePlaylistTotalSec", "currentPlaylistTotalSec", "playlistTotalSec", "totalPlaylistSec", "repertorioTotalSec", "repertoryTotalSec", "totalDurationSec", "total_duration_sec", "totalSec", "durationTotalSec", "durationSec"] {
            if playlist[key].exists, let number = Double(playlist[key].string), number.isFinite, number >= 0 { return number }
        }
        return playlist.first("songs", "items", "tracks").array.filter { !$0.isSongBlock && !$0.isFamilyChild }.reduce(0) { $0 + $1.songDuration }
    }
    static func text(_ playlist: JSON) -> String {
        for key in ["activePlaylistTotalText", "currentPlaylistTotalText", "playlistTotalText", "totalPlaylistText", "repertorioTotalText", "repertoryTotalText", "totalText", "durationText"] {
            let raw = playlist[key].string.replacingOccurrences(of: "(?i)^total\\s*:\\s*", with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces)
            let parts = raw.split(separator: ":").compactMap { Double($0) }
            if (parts.count == 2 || parts.count == 3) && parts.allSatisfy({ $0.isFinite && $0 >= 0 }) { return formatted(parts.reduce(0) { $0 * 60 + $1 }) }
        }
        return formatted(seconds(playlist))
    }
    private static func formatted(_ number: Double) -> String {
        let value = Int(min(Double(Int.max / 2), max(0, (number + 0.5).rounded(.down))))
        return String(format: "%02d:%02d:%02d", value / 3600, value % 3600 / 60, value % 60)
    }
}
