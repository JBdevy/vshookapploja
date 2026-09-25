import Foundation
import Combine

// Current Director: getMixerTrackColor / getMixerWaveformVolumeScale.
enum TCPAppearance {
    static func trackColor(_ track: JSON) -> String {
        let value = track.first("displayColor", "display_color", "trackColor", "track_color", "color", "colorHex").string
        return value.isEmpty ? "334155" : value
    }
    static func waveScale(_ item: JSON) -> Double {
        let ratio = MixerScale.ratio(item, max: 24)
        return ratio <= 0.76 ? max(0.04, ratio / 0.76) : 1 + ((ratio - 0.76) / 0.24) * 0.35
    }
    static func listFraction(_ preferred: Double, tracks: Double) -> Double {
        max(0.34, min(preferred, min(0.75, 1 - tracks)))
    }
}

struct TCPRange: Equatable {
    let start: Double
    let end: Double
    var duration: Double { max(0.0005, end - start) }
    func span(_ item: JSON) -> (left: Double, width: Double)? {
        let a = max(start, item.first("startPos", "start_pos", "position").double)
        let b = min(end, item.first("endPos", "end_pos").double)
        guard b > a else { return nil }
        return ((a - start) / duration, (b - a) / duration)
    }
}
struct TCPLoopOverlayGeometry {
    let left: Double
    let width: Double
    let startMarker: Double?
    let endMarker: Double?
    var slot = 0
    static func all(_ data: JSON, visible: TCPRange, songRange: TCPRange? = nil) -> [Self] {
        let song = songRange ?? visible
        var ranges = data["tcpMultiLoopRanges"].array
        // Same marker catalog already used by the transport Grid panel.
        // It is available on existing bridges, before Repeat is engaged.
        for slot in 1...4 where !data["tcpMultiLoopRanges"].exists {
            let points = data["markers"].array.filter {
                $0.name.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("*\(slot)")
            }.map { $0.first("pos", "position", "startPos").double }
                .filter { $0 >= song.start && $0 <= song.end + 0.0005 }.sorted()
            if points.count >= 2, points[1] > points[0] {
                ranges.append(["slot": .number(Double(slot)), "startPos": .number(points[0]), "endPos": .number(points[1])])
            }
        }
        var result: [Self] = []
        for range in ranges {
            guard (1...4).contains(range["slot"].int) else { continue }
            var shape = make(["loopEnabled": true, "loopStartPos": range["startPos"], "loopEndPos": range["endPos"]], visible: visible)
            shape?.slot = range["slot"].int
            if let shape, !result.contains(where: { $0.slot == shape.slot && $0.left == shape.left && $0.width == shape.width && $0.startMarker == shape.startMarker && $0.endMarker == shape.endMarker }) { result.append(shape) }
        }
        if let active = make(data, visible: visible), !result.contains(where: {
            abs($0.left - active.left) < 0.00001 && abs($0.width - active.width) < 0.00001 && $0.startMarker == active.startMarker && $0.endMarker == active.endMarker
        }) { result.append(active) }
        return result
    }
    static func make(_ data: JSON, visible: TCPRange) -> Self? {
        guard data.first("loopEnabled", "loopActive", "loop").bool else { return nil }
        let start = data.first("loopStartPos", "loopStart", "loopSelectionStart", "timeSelectionStart")
        let end = data.first("loopEndPos", "loopEnd", "loopSelectionEnd", "timeSelectionEnd")
        guard start.exists, end.exists, start.double.isFinite, end.double.isFinite,
              end.double > start.double, end.double >= visible.start, start.double <= visible.end else { return nil }
        let a = (start.double - visible.start) / visible.duration
        let b = (end.double - visible.start) / visible.duration
        return Self(left: max(0, a), width: max(0, min(1, b) - max(0, a)),
                    startMarker: (0...1).contains(a) ? a : nil,
                    endMarker: (0...1).contains(b) ? b : nil)
    }
}
struct TCPTrackRow: Identifiable {
    let id: String
    let track: JSON
    let items: [JSON]
    let shadow: Bool
}
enum TCPTrackRows {
    // Index once per snapshot, rather than re-filtering the complete timeline
    // for every visible row and every child of a folder while scrolling.
    static func make(tracks: [JSON], items: [JSON], focused: Bool) -> [TCPTrackRow] {
        var lookup: [String: Set<Int>] = [:]
        for (index, track) in tracks.enumerated() {
            for key in trackKeys(track) { lookup[key, default: []].insert(index) }
        }
        var own = Array(repeating: [JSON](), count: tracks.count)
        if focused {
            for item in items {
                var matches = Set<Int>()
                for key in itemKeys(item) { matches.formUnion(lookup[key] ?? []) }
                for index in matches { own[index].append(item) }
            }
        }
        return tracks.enumerated().map { index, track in
            let shadow = own[index].isEmpty && (track["group"].bool || track["folderDepth"].int > 0)
            var displayed = own[index]
            if shadow && focused {
                var depth = max(1, track["folderDepth"].int)
                for child in (index + 1)..<tracks.count {
                    guard depth > 0 else { break }
                    displayed += own[child]
                    depth += tracks[child]["folderDepth"].int
                }
            }
            let identity = track.first("id", "guid", "trackId").string
            return TCPTrackRow(id: identity.isEmpty ? "index:\(index)" : identity, track: track, items: displayed, shadow: shadow)
        }
    }
    private static func trackKeys(_ track: JSON) -> [String] {
        var keys = ["id", "guid", "trackId"].map { track[$0].string }.filter { !$0.isEmpty }.map { "id:" + $0 }
        let index = track.first("trackIndex", "index")
        if index.exists { keys.append("index:\(index.int)") }
        if !track.name.isEmpty { keys.append("name:" + track.name.lowercased()) }
        return keys
    }
    private static func itemKeys(_ item: JSON) -> [String] {
        var keys: [String] = []
        let id = item.first("trackId", "trackGuid", "track_id").string
        if !id.isEmpty { keys.append("id:" + id) }
        let index = item.first("trackIndex", "track_index")
        if index.exists { keys.append("index:\(index.int)") }
        let name = item.first("trackName", "track_name", "track").string
        if !name.isEmpty { keys.append("name:" + name.lowercased()) }
        return keys
    }
}
// Transport positions change more often than the arrangement. Keep the row index
// until its actual inputs change, including folder order and item volume previews.
final class TCPRowCache {
    private var tracks: [JSON] = []
    private var items: [JSON] = []
    private var focused = false
    private var cached: [TCPTrackRow] = []
    func rows(tracks: [JSON], items: [JSON], focused: Bool) -> [TCPTrackRow] {
        if self.tracks != tracks || self.items != items || self.focused != focused {
            self.tracks = tracks; self.items = items; self.focused = focused
            cached = TCPTrackRows.make(tracks: tracks, items: items, focused: focused)
        }
        return cached
    }
}
@MainActor final class TCPModel: ObservableObject {
    @Published private(set) var items: [JSON] = []
    @Published private(set) var loading = false
    let rowCache = TCPRowCache()
    private var projectKey = ""
    func load(session: HookSession) async {
        let data = session.snapshot
        let key = data.first("currentProjectId", "projectId", "projectPath").string + session.project.projectID
        if key != projectKey { items = []; projectKey = key }
        loading = true
        defer { loading = false }
        var loaded: [JSON] = []
        if data["mixerTimelineCatalogRevision"].int > 0 {
            if let catalog = try? await BridgeHTTP.shared.request(session.base, "/mixer-timeline-cache", timeout: 6) {
                let projects = catalog["projects"].array
                let id = data.first("currentProjectId", "projectId").string
                let index = data.first("activeProjectTabIndex", "currentProjectIndex")
                let match = projects.first { p in
                    let pid = p.first("id", "projectId").string
                    return (!pid.isEmpty && (pid == id || pid == session.project.projectID)) || (index.exists && p.first("index", "projectIndex") == index) || (!data["projectPath"].string.isEmpty && p["projectPath"] == data["projectPath"])
                } ?? (projects.count == 1 ? projects.first : nil)
                loaded = match?["items"].array ?? []
            }
        }
        guard !Task.isCancelled else { return }
        if loaded.isEmpty, data["mixerTimelineRevision"].int > 0,
           let live = try? await BridgeHTTP.shared.request(session.base, "/mixer-timeline", timeout: 3) { loaded = live["items"].array }
        guard !Task.isCancelled, projectKey == key else { return }
        if !loaded.isEmpty {
            session.reconcileTCPItemVolumes(session.tcpItems + loaded)
            items = loaded.filter(MixerScale.visible)
        }
    }
    static func matches(_ item: JSON, track: JSON) -> Bool {
        let ids = [track["id"].string, track["guid"].string, track["trackId"].string].filter { !$0.isEmpty }
        let itemTrack = item.first("trackId", "trackGuid", "track_id").string
        if !itemTrack.isEmpty && ids.contains(itemTrack) { return true }
        let a = item.first("trackIndex", "track_index"), b = track.first("trackIndex", "index")
        if a.exists && b.exists && a.int == b.int { return true }
        let name = item.first("trackName", "track_name", "track").string
        return !name.isEmpty && name.caseInsensitiveCompare(track.name) == .orderedSame
    }
}
@MainActor extension HookSession {
    var tcpFocus: JSON {
        let ids = playing || snapshot["transportPaused"].bool
            ? [playingID, snapshot["selectedRegionId"].string, snapshot["selectedPlaylistSongId"].string]
            : [snapshot["selectedRegionId"].string, snapshot["selectedPlaylistSongId"].string, playingID]
        for id in ids {
            let item = song(withID: id)
            if item.exists && !item.isSongBlock && item.songDuration > 0 { return item }
        }
        if playing || snapshot["transportPaused"].bool {
            let position = snapshot.first("playPosition", "currentPlayPosition", "position")
            if position.exists {
                return snapshot["regions"].array.filter {
                    !$0.isSongBlock && $0.songDuration > 0 && $0.first("startPos", "start_pos").double <= position.double && $0.first("endPos", "end_pos").double > position.double
                }.min { $0.songDuration < $1.songDuration } ?? .null
            }
        }
        return .null
    }
    var tcpItems: [JSON] {
        let premix = snapshot["premix"]
        let timeline = premix["timelineItems"].exists ? premix["timelineItems"].array : snapshot["premixTimelineItems"].array
        let sections = premix.first("songSections", "sections").array.flatMap { $0.first("items", "itemRows").array }
        var seen = Set<String>()
        return (timeline + sections + premix.first("items", "itemRows").array).filter {
            MixerScale.visible($0) && seen.insert($0.first("itemId", "id", "guid").string).inserted
        }
    }
}
