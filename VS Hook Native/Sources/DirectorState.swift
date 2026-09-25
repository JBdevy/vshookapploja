import Foundation

struct DirectorFadeoutClock {
    private var anchor: Date?
    private var trackVolumes: [String: Double] = [:]
    private(set) var duration = 1.0
    mutating func update(_ data: JSON, at date: Date, restart: Bool = false) {
        guard data["manualStopFadeoutActive"].bool else { anchor = nil; trackVolumes = [:]; return }
        guard anchor == nil || restart else { return }
        duration = min(5, max(1, data["manualStopFadeoutDurationSec"].double))
        let progress = restart ? 0 : min(1, max(0, data["manualStopFadeout"]["progress"].double))
        anchor = date.addingTimeInterval(-progress * duration)
        trackVolumes = [:]
        let selected = Set(data["manualStopFadeoutTrackIds"].array.map(\.string))
        let tracks = data["mixerTracks"].array + data["mixer"]["tracks"].array + data["mixerGroups"].array + data["mixer"]["groups"].array + [data["mixerMaster"], data["mixer"]["master"]]
        for track in tracks {
            let ids = ["guid", "id", "trackId"].map { track[$0].string }.filter { !$0.isEmpty }
            guard ids.contains(where: selected.contains) else { continue }
            let db = MixerScale.decibels(MixerScale.ratio(track))
            let volume = track["volume"].exists ? max(0, track["volume"].double) : db.isFinite ? pow(10, db / 20) : 0
            let original = progress < 1 ? volume / max(0.0001, 1 - progress) : 0
            for id in ids { trackVolumes[id] = original }
        }
    }
    func remaining(at date: Date) -> Double {
        guard let anchor else { return 0 }
        return max(0, min(1, 1 - date.timeIntervalSince(anchor) / duration))
    }
    func trackRatio(_ track: JSON, at date: Date) -> Double? {
        guard anchor != nil, let volume = ["guid", "id", "trackId"].compactMap({ trackVolumes[track[$0].string] }).first else { return nil }
        // The engine fades linear gain, not the logarithmic slider position.
        return MixerScale.ratio(["volume": .number(volume * remaining(at: date))])
    }
}

// One continuous clock for song time, progress and PARTS. Polls acknowledge
// playback; ordinary network jitter must not restart the visual clock.
struct DirectorPlaybackClock {
    private var anchor: (position: Double, date: Date, playing: Bool, song: String)?
    private var lastRemote: Double?
    private var loopStart = 0.0
    private var loopEnd = 0.0
    private var loopEnabled = false

    mutating func update(_ data: JSON, at date: Date, force: Bool = false) {
        let sample = data.first("playPosition", "currentPlayPosition", "currentPosition", "playbackPosition", "position")
        guard sample.exists, sample.double.isFinite else { return }
        let remote = sample.double
        let playing = data.first("playing", "isPlaying", "transportPlaying").bool
        let song = data.first("playingId", "playingSongId", "playingRegionId", "currentRegionId").string
        loopStart = data["loopStartPos"].double
        loopEnd = data["loopEndPos"].double
        loopEnabled = data.first("loopEnabled", "loopActive", "loop").bool && loopEnd > loopStart
        let expected = position(at: date, fallback: data)
        let changedSample = lastRemote == nil || abs(remote - lastRemote!) > 0.0005
        // Preserve the anchor for repeated or slightly delayed samples. A real
        // seek, PARTS jump, song change, stop or resume establishes a new one.
        if force || anchor == nil || anchor?.playing != playing || anchor?.song != song ||
            (changedSample && (!playing || abs(remote - expected) > 0.85)) {
            anchor = (remote, date, playing, song)
        }
        lastRemote = remote
    }

    func position(at date: Date, fallback: JSON) -> Double {
        guard let anchor else { return fallback.first("playPosition", "currentPlayPosition", "currentPosition", "playbackPosition", "position").double }
        let elapsed = anchor.playing ? max(0, date.timeIntervalSince(anchor.date)) : 0
        let current = anchor.position + elapsed
        if loopEnabled && anchor.position < loopEnd && current >= loopEnd {
            return loopStart + (current - loopStart).truncatingRemainder(dividingBy: loopEnd - loopStart)
        }
        return current
    }
}

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
struct DirectorSearchScrollRequest: Equatable {
    let id = UUID()
    let page: String
    let songID: String
    let playlistEntryID: String

    func rowID(in rows: [DirectorSongEntry], page: String) -> String? {
        guard self.page == page else { return nil }
        return rows.first {
            $0.item.identifier == songID && (playlistEntryID.isEmpty || $0.item["playlistEntryId"].string == playlistEntryID)
        }?.id
    }
}
@MainActor extension HookSession {
    func localCommandState(_ type: String, payload: JSON) -> (payload: JSON, state: JSON, position: Double?) {
        var outgoing = payload
        var state: JSON = [:]
        if !playing && ["edit_cursor_move", "select_playlist_song", "select_region"].contains(type) {
            let point = type == "edit_cursor_move" ? payload.first("position", "pos", "startPos") : payload.first("startPos", "start_pos", "selectedStartPos")
            if point.exists && point.double.isFinite {
                var position = max(0, point.double)
                if type == "edit_cursor_move", payload["minPos"].exists, payload["maxPos"].exists {
                    position = max(payload["minPos"].double, min(payload["maxPos"].double, position))
                }
                state["editCursorPosition"] = .number(position)
            }
        }
        let toggles = ["play_button", "director_play_button", "play_toggle"]
        let starts = ["play_start", "play", "director_play_no_seek"]
        let stops = ["play_stop", "stop", "director_stop_no_seek", "director_stop_break", "stop_break", "play_stop_no_seek", "transport_stop_no_seek"]
        if toggles.contains(type) || starts.contains(type) || stops.contains(type) || type == "director_pause" {
            let pause = type == "director_pause"
            let willPlay = starts.contains(type) || (toggles.contains(type) && !playing)
            state = ["playing": .bool(willPlay), "transportPaused": .bool(pause), "partsArmedMarkerId": "", "selectedMarkerId": ""]
            if toggles.contains(type) { outgoing["desiredPlaying"] = .bool(willPlay) }
            let stopBreak = ["director_stop_break", "stop_break"].contains(type) || payload["ignoreFadeout"].bool || payload["stopBreak"].bool
            if !willPlay && !pause && !stopBreak && playing && (fadeoutActive || fadeoutConfigured) {
                // A second STOP cancels the fade and restores volume. Neither
                // action stops the song before the audio engine finishes.
                return (outgoing, ["playing": true, "transportPaused": false, "manualStopFadeoutActive": .bool(!fadeoutActive)], nil)
            }
            state["manualStopFadeoutActive"] = false
            let resume = type == "director_play_no_seek" || payload["noSeek"].bool || payload["transportOnly"].bool
            if willPlay {
                let explicit = payload.first("targetId", "songId", "selectedPlaylistSongId", "selectedRegionId", "id").string
                var song = song(withID: explicit.isEmpty ? selectedID : explicit)
                if resume { song = self.song(withID: playingID).exists ? self.song(withID: playingID) : song }
                if song.isSongBlock, let index = allItems.firstIndex(of: song) {
                    song = allItems.dropFirst(index + 1).prefix(while: { !$0.isSongBlock }).first(where: { $0["isPlayable"] != false }) ?? .null
                }
                let cursor = snapshot.first("editCursorPosition", "cursorPosition")
                let explicitStart = payload.first("startPos", "start_pos")
                let useCursor = resume || (toggles.contains(type) && !explicitStart.exists)
                if song.isFamilyParent {
                    let children = DirectorFamily.children(of: song, data: snapshot)
                    song = (useCursor && cursor.exists ? children.first(where: { cursor.double >= $0.first("startPos", "start_pos").double && cursor.double < $0.first("endPos", "end_pos").double }) : nil) ?? children.first ?? song
                }
                if !song.exists { song = self.song(withID: playingID) }
                state["playingId"] = .string(song.identifier)
                if autoEnabled(1) || autoEnabled(2) {
                    state = state.merging(immediateAutoQueueState(mode: autoEnabled(2) ? 2 : 1, preferredPlayingID: song.identifier))
                }
                // Resolve the same target locally and remotely even if a
                // selection command has not reached the bridge yet.
                if !resume && song.exists { outgoing = targetPayload(song).merging(outgoing) }
                let insideSong = cursor.exists && cursor.double.isFinite && cursor.double >= song.first("startPos", "start_pos").double && cursor.double < song.first("endPos", "end_pos").double
                let preserveCursor = useCursor && insideSong
                if preserveCursor {
                    // Selection/marker/cursor commands are serialized before PLAY.
                    // Keep their edit position while retaining the song metadata
                    // needed by tuner and automatic queue handling.
                    outgoing["noSeek"] = true
                    outgoing["preserveCursor"] = true
                }
                let position = preserveCursor ? cursor.double : resume ? playbackPosition(at: Date()) : explicitStart.exists ? explicitStart.double : song.first("startPos", "start_pos").double
                return (outgoing, state, position)
            }
            if pause { return (outgoing, state, playbackPosition(at: Date())) }
            let nextID = !queueID.isEmpty ? queueID : snapshot.first("autoBlocoTargetSongId", "autoBlocoTargetPlaylistSongId").string
            let stoppedID = nextID.isEmpty ? playingID : nextID
            let sourcePage = payload.first("activeTab", "page").string
            let selectionPage = ["regions", "playlist"].contains(sourcePage) ? sourcePage : page
            state["playingId"] = ""
            state["queuedSongId"] = ""
            state["queuedManual"] = false
            state[selectionPage == "regions" ? "selectedRegionId" : "selectedPlaylistSongId"] = .string(stoppedID)
            state[selectionPage == "regions" ? "selectedPlaylistSongId" : "selectedRegionId"] = ""
            return (outgoing, state, playbackPosition(at: Date()))
        }
        if type == "marker_cancel" || type == "marker_select" {
            state["partsArmedMarkerId"] = ""
            state["selectedMarkerId"] = type == "marker_cancel" ? "" : payload.first("markerId", "id")
        } else if type == "marker_go" {
            state["selectedMarkerId"] = payload.first("markerId", "id")
            state["partsArmedMarkerId"] = playing ? payload.first("markerId", "id") : ""
            if !playing {
                let position = payload.first("pos", "position", "startPos", "start_pos")
                if position.exists && position.double.isFinite { state["editCursorPosition"] = position }
                let songID = payload.first("songId", "targetId").string
                if !songID.isEmpty {
                    state[page == "regions" ? "selectedRegionId" : "selectedPlaylistSongId"] = .string(songID)
                    state[page == "regions" ? "selectedPlaylistSongId" : "selectedRegionId"] = ""
                }
            }
        }
        return (outgoing, state, nil)
    }
    func playbackPosition(at date: Date) -> Double {
        playbackClock.position(at: connected ? date : lastUpdate, fallback: snapshot)
    }
    func selectPart(_ marker: JSON, song: JSON) {
        let confirm = !playing || snapshot["selectedMarkerId"].string == marker.identifier
        let payload = marker.merging(["id": .string(marker.identifier), "markerId": .string(marker.identifier), "songId": .string(song.identifier), "targetId": .string(song.identifier), "activeTab": "markers", "page": "markers", "confirm": .bool(confirm), playing ? "armed" : "stopped": .bool(confirm)])
        command(confirm ? "marker_go" : "marker_select", payload)
    }
    func immediateAutoQueueState(mode: Int, preferredPlayingID: String = "", blockEnabled: Bool? = nil) -> JSON {
        let manual = snapshot.first("queuedManual", "queueManual", "queuedByManual").bool
        if !rawQueueID.isEmpty && manual { return ["queuedSongId": .string(rawQueueID), "queuedManual": true] }
        let empty: JSON = ["queuedSongId": "", "queuedManual": false]
        guard mode != 0 else { return empty }
        if !rawQueueID.isEmpty && preferredPlayingID.isEmpty { return ["queuedSongId": .string(rawQueueID), "queuedManual": false] }
        guard playing || !preferredPlayingID.isEmpty else { return empty }
        let candidate = automaticQueueCandidate(preferredPlayingID: preferredPlayingID)
        if candidate.crossedBlock && (blockEnabled ?? autoBlockEnabled) { return empty }
        return ["queuedSongId": .string(candidate.id), "queuedManual": false]
    }
    func automaticQueueCandidate(preferredPlayingID: String = "", nextBlockOnly: Bool = false) -> (id: String, crossedBlock: Bool) {
        let id = preferredPlayingID.isEmpty ? playingID : preferredPlayingID
        guard !id.isEmpty else { return ("", false) }
        let items = activePlaylist.first("songs", "items", "tracks").array
        let current = song(withID: id)
        let parent = current.isFamilyChild ? current.familyParentID : ""
        let currentIndex = items.firstIndex { item in
            (!parent.isEmpty && item.isFamilyParent && (item.identifier == parent || item.first("sourceNumber", "source_number").string == parent)) ||
            (parent.isEmpty && (item.identifier == id || item.first("playlistEntryId", "playlist_entry_id").string == id))
        } ?? items.firstIndex { item in
            item.isFamilyParent && current.exists && item.first("startPos", "start_pos").double <= current.first("startPos", "start_pos").double && item.first("endPos", "end_pos").double >= current.first("endPos", "end_pos").double
        }
        guard let currentIndex else { return ("", false) }
        var crossedBlock = false
        for candidate in items.dropFirst(currentIndex + 1) {
            if candidate.isSongBlock {
                if nextBlockOnly && crossedBlock { return ("", true) }
                crossedBlock = true; continue
            }
            if nextBlockOnly && !crossedBlock { continue }
            guard !candidate.isFamilyChild, candidate["isPlayable"] != false, !candidate.identifier.isEmpty,
                  candidate.first("endPos", "end_pos").double > candidate.first("startPos", "start_pos").double + 0.0005 else { continue }
            return (candidate.identifier, crossedBlock)
        }
        return ("", crossedBlock)
    }
    func selectSearchResult(_ result: JSON) {
        guard !readOnly, !result.identifier.isEmpty else { return }
        // Use the actual playlist entry, retaining its order and entry ID.
        let playlistItem = playlistItems.first { $0.identifier == result.identifier }
        let destination = playlistItem == nil ? "regions" : "playlist"
        let item = playlistItem ?? expandedItems(snapshot["regions"].array).first { $0.identifier == result.identifier } ?? result
        setPage(destination)
        panel = ""
        let items = allItems
        var parent = item.familyParentID
        if item.isFamilyChild && parent.isEmpty, let index = items.firstIndex(of: item) {
            parent = items.prefix(index).last(where: { $0.isFamilyParent })?.identifier ?? ""
        }
        if !parent.isEmpty && !openFamilies.contains(parent) { toggleFamily(parent) }
        // Search queues during playback; choosing an already queued result
        // should reveal it again without toggling the queue off.
        if !playing || queueID != item.identifier {
            select(item, queue: playing, sourcePage: destination)
        }
        // A new request also scrolls when the same song is chosen again.
        searchScrollRequest = DirectorSearchScrollRequest(page: destination, songID: item.identifier, playlistEntryID: item["playlistEntryId"].string)
    }
    func swipeTransport(right: Bool) {
        if panel == "tp" { if !right { panel = "" } }
        else if panel == "parts" { if right { panel = "" } }
        else if right { panel = "tp" }
        else if !readOnly { panel = "parts" }
    }
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
        return allItems.first { $0.identifier == id } ?? expandedItems(snapshot["regions"].array).first { $0.identifier == id } ?? playlistItems.first { $0.identifier == id } ?? .null
    }
    func progress(at date: Date) -> Double {
        guard playing || snapshot["transportPaused"].bool else { return 0 }
        let item = song(withID: playingID)
        guard item.songDuration > 0 else { return 0 }
        let elapsed = playbackPosition(at: date) - item.first("startPos", "start_pos").double
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
    static func remainingFraction(_ data: JSON, song: JSON, position: Double) -> Double {
        let start = song.first("startPos", "start_pos").double
        let end = song.first("endPos", "end_pos").double
        guard end > start, position < end else { return 0 }
        let boundaries = markers(data, song: song).map { $0.first("pos", "position", "startPos", "start_pos").double }.filter { $0 > start && $0 < end }.sorted()
        let segmentStart = boundaries.last(where: { $0 <= position + 0.0005 }) ?? start
        let segmentEnd = boundaries.first(where: { $0 > position + 0.0005 }) ?? end
        return min(1, max(0, (segmentEnd - position) / max(0.0005, segmentEnd - segmentStart)))
    }
    static func markers(_ data: JSON, song: JSON) -> [JSON] {
        guard song.exists, !song.isFamilyParent, !song.isSongBlock else { return [] }
        let start = song.first("startPos", "start_pos").double, end = song.first("endPos", "end_pos").double
        let initial: JSON = ["id": .string("start:" + song.identifier), "name": .string(song.name), "markerLabel": .string(song.name), "partsDisplayName": .string(song.name), "partsSongStart": true, "songStart": true, "songId": .string(song.identifier), "position": .number(start), "startPos": .number(start), "targetPosition": .number(start)]
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

// Region flags are canonical, so resetting LIVE cannot retain old playlist flags.
enum DirectorLiveMarks {
    static func ids(_ data: JSON) -> Set<String> {
        guard data.first("liveModeEnabled", "liveEnabled", "live").bool else { return [] }
        var canonical: [String: JSON] = [:]
        for item in data["regions"].array + data["playlists"].array.flatMap({ $0.first("songs", "items", "tracks").array }) where !item.identifier.isEmpty && canonical[item.identifier] == nil {
            canonical[item.identifier] = item
        }
        var marked = Set(canonical.values.filter { !$0.isSongBlock && ($0["liveExecuted"].bool || $0["liveMarked"].bool) }.map(\.identifier))
        let children = Dictionary(grouping: canonical.values.filter { $0.isFamilyChild && !$0.familyParentID.isEmpty }, by: \.familyParentID)
        for item in canonical.values where item.isFamilyParent {
            if let family = children[item.identifier], !family.isEmpty {
                if family.allSatisfy({ marked.contains($0.identifier) }) { marked.insert(item.identifier) }
                else { marked.remove(item.identifier) }
            }
        }
        return marked
    }
    static func colors(_ data: JSON) -> (background: String, border: String) {
        let mode = data.first("liveMarkColorMode", "liveMarkColor", "live_mark_color_mode").string.lowercased()
        let palette = ["yellow": ("D8CD2F", "FFF02E"), "green": ("1DD951", "1AFF57"), "blue": ("3182DA", "3394FF"), "purple": ("9E4CDA", "B852FF"), "red": ("991B1B", "FF382E"), "orange": ("D8751A", "FF8514"), "cyan": ("21C9DA", "1FEBFF"), "white": ("C8CFDA", "EBF2FF"), "gray": ("7D8693", "8F99A8")]
        let fallback = palette[mode] ?? palette["red"]!
        let background = data.first("liveMarkBackgroundHex", "live_mark_background_hex").string
        let border = data.first("liveMarkBorderHex", "live_mark_border_hex").string
        return (background.isEmpty ? fallback.0 : background, border.isEmpty ? fallback.1 : border)
    }
}
