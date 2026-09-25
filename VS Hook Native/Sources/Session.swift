import Foundation
import Combine

enum HookMode: String, CaseIterable, Identifiable {
    case director, musician, recados, chat, drop
    var id: String { rawValue }
    var title: String { switch self { case .director: return "Diretor"; case .musician: return "Músico"; case .recados: return "Recados"; case .chat: return "Chat Hook"; case .drop: return "Drop Hook" } }
    var icon: String { switch self { case .director: return "slider.horizontal.3"; case .musician: return "music.mic"; case .recados: return "megaphone.fill"; case .chat: return "bubble.left.and.bubble.right.fill"; case .drop: return "arrow.up.arrow.down" } }
}

@MainActor final class HookSession: ObservableObject {
    let project: HookProject
    let mode: HookMode
    let tablet: Bool
    @Published var snapshot: JSON = [:] { didSet { liveMarkedIDs = DirectorLiveMarks.ids(snapshot) } }
    private(set) var liveMarkedIDs: Set<String> = []
    @Published var connected = false
    @Published var authenticated = false
    @Published var message = ""
    @Published var page = "playlist"
    @Published var panel = ""
    @Published var query = ""
    @Published var searchScrollRequest: DirectorSearchScrollRequest?
    @Published var dismissed = false
    var lastUpdate = Date()
    @Published var openFamilies: Set<String> = []
    private var loop: Task<Void, Never>?
    private var generation = UUID()
    private var drawerHoldUntil = Date.distantPast
    private var pageHoldUntil = Date.distantPast
    private var claimed = false
    private var projectSelected = false
    private let http: BridgeHTTP
    private var sessionHash = ""
    private var authRevision = ""
    private var lastHeartbeat = Date.distantPast
    private struct PendingValue {
        let value: JSON
        let before: JSON
        let until: Date
        let revision: Int
        var accepted = false
    }
    private var pending: [String: PendingValue] = [:]
    private var commandRevision = 0
    private var commandTail: Task<Void, Never>?
    private final class CursorCommandGroup { var latestRevision = 0 }
    private var cursorCommandGroup: CursorCommandGroup?
    private var lastCursorPost = Date.distantPast
    private var remoteSnapshot: JSON = [:]
    var playbackClock = DirectorPlaybackClock()
    var fadeoutClock = DirectorFadeoutClock()
    private var transportAnchor: (position: Double, date: Date, playing: Bool, revision: Int)?
    private var partArrival: (id: String, target: Double, previous: Double, revision: Int)?
    private var consumedPartID = ""
    private var volumeTasks: [String: Task<Void, Never>] = [:]
    @Published private(set) var itemVolumePreviews: [String: Double] = [:]
    private var volumeRevisions: [String: UUID] = [:]
    private var acceptedItemVolumes: [String: Double] = [:]
    private var itemVolumeBaselines: [String: Double] = [:]
    var base: URL { mode == .musician ? project.musicians : project.director }
    var readOnly: Bool { mode != .director }
    var playing: Bool {
        let flag = snapshot.first("playing", "isPlaying", "transportPlaying")
        return flag.exists ? flag.bool : !playingID.isEmpty
    }
    var playingID: String { snapshot.first("playingId", "playingSongId", "playingRegionId", "currentRegionId").string }
    var rawQueueID: String { snapshot.first("queuedSongId", "queuedRegionId").string }
    var queueID: String {
        guard autoBlockEnabled && playing && !rawQueueID.isEmpty else { return rawQueueID }
        let candidate = automaticQueueCandidate(nextBlockOnly: true)
        return candidate.crossedBlock && candidate.id == rawQueueID ? "" : rawQueueID
    }
    var selectedID: String { snapshot[page == "regions" ? "selectedRegionId" : "selectedPlaylistSongId"].string }
    var projectName: String { let name = snapshot.first("currentProjectName", "projectName").string; return name.isEmpty ? project.name : name }
    var playlists: [JSON] { snapshot["playlists"].array }
    var activePlaylist: JSON { playlists.first { $0.first("id", "playlistId").string == snapshot["activePlaylistId"].string } ?? playlists.first { $0.name == snapshot["currentPlaylistName"].string } ?? playlists.first ?? .null }
    var playlistItems: [JSON] { expandedItems(activePlaylist.first("songs", "items", "tracks").array) }
    var allItems: [JSON] { page == "regions" ? expandedItems(snapshot["regions"].array) : playlistItems }
    func expandedItems(_ source: [JSON]) -> [JSON] {
        let existing = Set(source.map(\.identifier))
        return source.flatMap { item -> [JSON] in
            guard item.isFamilyParent else { return [item] }
            return [item] + DirectorFamily.children(of: item, data: snapshot).filter { !existing.contains($0.identifier) }
        }
    }
    var visibleItems: [JSON] { songEntries.map(\.item) }
    var authHash: String { snapshot.first("directorAuthHash", "authHash", "accessAuthHash", "directorPasswordHash", "appDirectorAuthHash").string.uppercased() }
    var requiresAuth: Bool { !readOnly && !authHash.isEmpty && snapshot.first("directorAuthEnabled", "authEnabled", "accessAuthEnabled") != false }
    var target: JSON { targetPayload(allItems.first { $0.identifier == selectedID } ?? allItems.first { $0.identifier == playingID } ?? .null) }
    init(project: HookProject, mode: HookMode, tablet: Bool, http: BridgeHTTP = .shared) { self.project = project; self.mode = mode; self.tablet = tablet; self.http = http }
    deinit { loop?.cancel(); volumeTasks.values.forEach { $0.cancel() } }
    func start() {
        guard loop == nil else { return }
        let token = UUID(); generation = token
        loop = Task {
            while !Task.isCancelled, generation == token {
                await refresh(token)
                try? await Task.sleep(nanoseconds: 300_000_000)
            }
        }
    }
    func suspend() { generation = UUID(); loop?.cancel(); loop = nil; commandTail?.cancel(); commandTail = nil; cursorCommandGroup = nil; lastCursorPost = .distantPast; pending = [:]; transportAnchor = nil; playbackClock = DirectorPlaybackClock(); fadeoutClock = DirectorFadeoutClock(); partArrival = nil; consumedPartID = ""; volumeTasks.values.forEach { $0.cancel() }; volumeTasks = [:]; itemVolumePreviews = acceptedItemVolumes; volumeRevisions = [:]; connected = false }
    private func refresh(_ token: UUID) async {
        do {
            if !readOnly && !projectSelected {
                _ = try await http.request(base, "/command", body: ["type": "set_project_tab", "payload": ["projectTabIndex": .number(Double(project.tab)), "index": .number(Double(project.tab))]])
                guard !Task.isCancelled, generation == token else { return }
                projectSelected = true
            }
            let readRevision = commandRevision
            var data = normalizedState(try await http.request(base, "/state", timeout: 2.8))
            guard !Task.isCancelled, generation == token else { return }
            guard data["connected"] != false, data["reaperOnline"] != false else { throw BridgeError(message: "O Hook Center está aberto, mas o projeto está desconectado.") }
            let previousProject = snapshot.first("currentProjectId", "projectId", "projectPath").string
            let incomingProject = data.first("currentProjectId", "projectId", "projectPath").string
            if !previousProject.isEmpty && !incomingProject.isEmpty && previousProject != incomingProject {
                volumeTasks.values.forEach { $0.cancel() }
                volumeTasks = [:]; volumeRevisions = [:]
                acceptedItemVolumes = [:]; itemVolumeBaselines = [:]; itemVolumePreviews = [:]
                pending = [:]; transportAnchor = nil; playbackClock = DirectorPlaybackClock(); fadeoutClock = DirectorFadeoutClock(); remoteSnapshot = [:]; partArrival = nil; consumedPartID = ""
            }
            if let arrival = partArrival, readRevision >= arrival.revision, data["playing"].bool {
                let position = data["playPosition"].double
                let moved = abs(position - arrival.previous) > 0.02
                let nearTarget = position >= arrival.target - 0.04 && position <= arrival.target + 0.8
                let crossed = arrival.previous < arrival.target - 0.04 || position < arrival.previous - 0.05
                if moved && nearTarget && crossed {
                    if pending["partsArmedMarkerId"]?.revision == arrival.revision { pending["partsArmedMarkerId"] = nil }
                    if pending["selectedMarkerId"]?.revision == arrival.revision { pending["selectedMarkerId"] = nil }
                    consumedPartID = arrival.id; partArrival = nil
                } else { partArrival?.previous = position }
            }
            if !consumedPartID.isEmpty {
                let repeatsArmed = data["partsArmedMarkerId"].string == consumedPartID
                let repeatsSelected = data["selectedMarkerId"].string == consumedPartID
                if repeatsArmed { data["partsArmedMarkerId"] = "" }
                if repeatsSelected { data["selectedMarkerId"] = "" }
                if !repeatsArmed && !repeatsSelected { consumedPartID = "" }
            }
            remoteSnapshot = remoteSnapshot.merging(data)
            var next = snapshot.merging(data)
            // Confirm related fields together, and never acknowledge a local
            // action with a poll that started before that action was sent.
            let confirmed = Set(Dictionary(grouping: pending, by: { $0.value.revision }).compactMap { revision, fields -> Int? in
                guard revision <= readRevision, fields.allSatisfy({ key, held in
                    held.accepted && (data[key] == held.value || (held.value == "" && !data[key].exists))
                }) else { return nil }
                return revision
            })
            for (key, held) in pending {
                if confirmed.contains(held.revision) || Date() > held.until { pending[key] = nil }
                else { next[key] = held.value }
            }
            if let anchor = transportAnchor {
                if pending["playing"]?.revision == anchor.revision {
                    next["playPosition"] = .number(anchor.position + (anchor.playing ? max(0, Date().timeIntervalSince(anchor.date)) : 0))
                } else { transportAnchor = nil }
            }
            let receivedAt = Date()
            playbackClock.update(next, at: receivedAt)
            fadeoutClock.update(next, at: receivedAt)
            lastUpdate = receivedAt
            if snapshot != next { snapshot = next }
            reconcileTCPItemVolumes(tcpItems)
            if !connected { connected = true }
            if message == "Conexão interrompida. Tentando reconectar…" { message = "" }
            let remotePage = data.first("activePage", "activeTab", "currentPage").string
            if Date() > pageHoldUntil, ["playlist", "regions"].contains(remotePage) { if page != remotePage { page = remotePage } }
            if Date() > drawerHoldUntil {
                let drawers = data.first("openDrawerIds", "familyDrawerOpenIds")
                if drawers.exists {
                    let families = Set(drawers.array.isEmpty ? drawers.string.split(separator: "|").map(String.init) : drawers.array.map(\.string))
                    if openFamilies != families { openFamilies = families }
                }
            }
            let revision = data.first("directorAuthRevision", "authRevision", "accessAuthRevision").string
            let authorized = !requiresAuth || (!sessionHash.isEmpty && sessionHash == authHash && (revision.isEmpty || revision == authRevision))
            if authenticated != authorized { authenticated = authorized }
            if !authenticated { claimed = false }
            if !readOnly && ["forceDirectorLogout", "directorLogoutRequested", "logoutDirector"].contains(where: { data[$0].bool }) {
                try? await post("director_force_logout_ack", ["logoutToken": data["directorLogoutToken"]], bypassAuth: true)
                sessionHash = ""; authenticated = false; dismissed = true; suspend(); return
            }
            if !readOnly && authenticated && (!claimed || Date().timeIntervalSince(lastHeartbeat) > 2) {
                try await post(claimed ? "app_heartbeat" : "director_enter", ["sessionActive": true, "authenticated": true, "directorActive": true, "appActive": true, "heartbeat": .bool(claimed)])
                claimed = true; lastHeartbeat = Date()
            }
        } catch {
            guard !Task.isCancelled, generation == token else { return }
            connected = false
            message = "Conexão interrompida. Tentando reconectar…"
        }
    }
    func login(_ password: String) {
        guard bridgePasswordHash(password) == authHash else { message = "Senha inválida."; return }
        sessionHash = authHash; authRevision = snapshot.first("directorAuthRevision", "authRevision", "accessAuthRevision").string
        authenticated = true; message = ""
    }
    func post(_ type: String, _ payload: JSON = [:], bypassAuth: Bool = false) async throws {
        guard mode == .director else { throw BridgeError(message: "O modo Músico acompanha o computador sem enviar comandos.") }
        guard bypassAuth || (authenticated && connected) else { throw BridgeError(message: "Conecte-se e entre como Diretor para controlar o projeto.") }
        var identity: JSON = ["role": "director", "clientRole": "director", "appRole": "director", "source": "director", "mode": "director", "controlMode": "director", "clientCommandId": .string(UUID().uuidString), "activeTab": .string(page), "page": .string(page)]
        identity = identity.merging(payload)
        _ = try await http.request(project.director, "/command", body: ["type": .string(type), "payload": identity])
    }
    func command(_ type: String, _ payload: JSON = [:], optimistic: JSON = [:]) {
        guard !readOnly else { return }
        guard connected && authenticated else { message = "Conecte-se e entre como Diretor para controlar o projeto."; return }
        let projection = localCommandState(type, payload: payload)
        let changes = projection.state.merging(optimistic)
        let outgoing: JSON = JSON.object(["page": .string(page), "activeTab": .string(page)]).merging(projection.payload)
        commandRevision += 1
        let revision = commandRevision
        let token = generation
        let cursorGroup: CursorCommandGroup?
        if type == "edit_cursor_move" {
            let group = cursorCommandGroup ?? CursorCommandGroup()
            group.latestRevision = revision
            cursorCommandGroup = group
            cursorGroup = group
        } else {
            // PLAY/selection form a boundary: later drags must never erase the
            // final cursor move that precedes a transport command.
            cursorCommandGroup = nil
            cursorGroup = nil
        }
        if type == "marker_go", playing {
            partArrival = (payload.first("markerId", "id").string, payload.first("pos", "position", "startPos", "start_pos").double, playbackPosition(at: Date()), revision)
            consumedPartID = ""
        } else if changes["partsArmedMarkerId"].exists {
            partArrival = nil; consumedPartID = ""
        }
        var next = snapshot
        for (key, value) in changes.object {
            pending[key] = PendingValue(value: value, before: pending[key]?.before ?? snapshot[key], until: Date().addingTimeInterval(5), revision: revision)
            next[key] = value
        }
        if let position = projection.position {
            transportAnchor = (position, Date(), changes["playing"].bool, revision)
            next["playPosition"] = .number(position)
            lastUpdate = Date()
            playbackClock.update(next, at: lastUpdate, force: true)
        }
        fadeoutClock.update(next, at: Date(), restart: changes["manualStopFadeoutActive"] == true)
        if next != snapshot { snapshot = next }
        // An earlier successful request must not erase a newer command failure.
        message = ""
        let previous = commandTail
        commandTail = Task {
            await previous?.value
            guard !Task.isCancelled, generation == token else { return }
            if let cursorGroup {
                guard cursorGroup.latestRevision == revision else { return }
                let delay = max(0, 0.04 - Date().timeIntervalSince(lastCursorPost))
                if delay > 0 { try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000)) }
                guard !Task.isCancelled, generation == token, cursorGroup.latestRevision == revision else { return }
                lastCursorPost = Date()
            }
            do {
                try await post(type, outgoing)
                guard generation == token else { return }
                for key in changes.object.keys where pending[key]?.revision == revision { pending[key]?.accepted = true }
            }
            catch {
                guard generation == token else { return }
                var restored = snapshot
                for key in changes.object.keys where pending[key]?.revision == revision {
                    restored[key] = remoteSnapshot.object[key] ?? pending[key]!.before
                    pending[key] = nil
                }
                if transportAnchor?.revision == revision {
                    transportAnchor = nil
                    restored["playPosition"] = remoteSnapshot["playPosition"]
                    lastUpdate = Date()
                    playbackClock.update(restored, at: lastUpdate, force: true)
                }
                if partArrival?.revision == revision { partArrival = nil }
                fadeoutClock.update(restored, at: Date())
                if restored != snapshot { snapshot = restored }
                message = error.localizedDescription
            }
        }
    }
    private func normalizedState(_ data: JSON) -> JSON {
        var value = data
        let fade = data["manualStopFadeout"]
        value["manualStopFadeoutActive"] = .bool(fade["active"].bool || fade["fading"].bool || data["manualStopFadeoutActive"].bool)
        if fade["enabled"].exists { value["manualStopFadeoutEnabled"] = fade["enabled"] }
        let duration = fade.first("durationSec", "duration").exists ? fade.first("durationSec", "duration") : data.first("manualStopFadeoutDurationSec", "manualStopFadeoutDuration")
        if duration.exists { value["manualStopFadeoutDurationSec"] = duration }
        if fade["selectedTrackIds"].exists { value["manualStopFadeoutTrackIds"] = fade["selectedTrackIds"] }
        for (key, aliases) in [
            ("playing", ["playing", "isPlaying", "transportPlaying"]),
            ("playingId", ["playingId", "playingSongId", "playingRegionId", "currentRegionId"]),
            ("queuedSongId", ["queuedSongId", "queuedRegionId"]),
            ("autoBlocoEnabled", ["autoBlocoEnabled", "autoBlocoArmed", "autoblockEnabled"]),
            ("queuedManual", ["queuedManual", "queueManual", "queuedByManual"]),
            ("loopEnabled", ["loopEnabled", "loopActive", "repeatEnabled", "loop"]),
            ("partsArmedMarkerId", ["partsArmedMarkerId", "armedMarkerId", "markerGoId"]),
            ("editCursorPosition", ["editCursorPosition", "cursorPosition"]),
            ("playPosition", ["playPosition", "currentPlayPosition", "currentPosition", "playbackPosition", "position"])
        ] {
            if let alias = aliases.first(where: { data.object[$0] != nil }) { value[key] = data[alias] }
        }
        return value
    }
    func moveEditCursor(to position: Double, song: JSON) {
        guard !playing, !readOnly, song.exists, position.isFinite else { return }
        let start = song.first("startPos", "start_pos").double
        let end = song.first("endPos", "end_pos").double
        guard end > start else { return }
        let point = max(start, min(end, position))
        command("edit_cursor_move", targetPayload(song).merging([
            "position": .number(point), "targetPosition": .number(point),
            "minPos": .number(start), "maxPos": .number(end),
            "noPlay": true, "preservePlayback": true, "noSeek": true,
            "cursorMoveSeq": .number(Date().timeIntervalSince1970 * 1_000_000)
        ]))
    }
    func setPage(_ next: String) { guard !readOnly else { return }; page = next; pageHoldUntil = Date().addingTimeInterval(2); query = ""; command("set_page", ["page": .string(next), "activeTab": .string(next)]) }
    func toggleFamily(_ id: String) {
        guard !readOnly else { return }
        drawerHoldUntil = Date().addingTimeInterval(2)
        if openFamilies.contains(id) { openFamilies.remove(id) } else { openFamilies.insert(id) }
        command("director_family_drawers_sync", ["openDrawerIds": .array(openFamilies.sorted().map(JSON.string))])
    }
    func targetPayload(_ item: JSON, sourcePage: String? = nil) -> JSON {
        let page = sourcePage ?? self.page
        let id = item.identifier
        let start = item.first("startPos", "start_pos", "pos", "rgnstart", "regionStart")
        let end = item.first("endPos", "end_pos", "rgnend", "regionEnd")
        var payload: JSON = ["id": .string(id), "targetId": .string(id), "songId": .string(id), "regionId": .string(id), "selectedRegionId": .string(id), "selectedPlaylistSongId": .string(id), "activeTab": .string(page), "page": .string(page)]
        if start.exists { payload["startPos"] = start; payload["selectedStartPos"] = start }
        if end.exists { payload["endPos"] = end; payload["selectedEndPos"] = end }
        if start.exists && end.exists && end.double > start.double { payload["queueExactPosition"] = true }
        if item["source_number"].exists { payload["source_number"] = item["source_number"] }
        if item["sourceNumber"].exists { payload["sourceNumber"] = item["sourceNumber"] }
        if page == "playlist" {
            let order = item.first("playlistOrder", "order", "playlistItemIndex", "playlistSongIndex", "index")
            if order.int > 0 { payload["playlistOrder"] = .number(Double(order.int)); payload["playlistItemIndex"] = .number(Double(order.int)) }
            let entry = item.first("playlistEntryId", "playlist_entry_id")
            if entry.exists { payload["playlistEntryId"] = .string(entry.string) }
        }
        return payload
    }
    func select(_ item: JSON, queue: Bool = false, sourcePage: String? = nil) {
        let page = sourcePage ?? self.page
        let items = page == "playlist" ? playlistItems : expandedItems(snapshot["regions"].array)
        guard !item.identifier.isEmpty, !readOnly else { return }
        if item.isSongBlock, let index = items.firstIndex(of: item) {
            for candidate in items.dropFirst(index + 1) {
                if candidate.isSongBlock { break }
                if candidate["isPlayable"] != false { select(candidate, queue: queue, sourcePage: sourcePage); return }
            }
            return
        }
        let selectedKey = page == "regions" ? "selectedRegionId" : "selectedPlaylistSongId"
        if queue && rawQueueID == item.identifier { command("clear_queue", targetPayload(item, sourcePage: sourcePage), optimistic: ["queuedSongId": "", "queuedManual": false]); return }
        let payload = queue ? targetPayload(item, sourcePage: sourcePage).merging(["queued": true, "manual": true, "queuedManual": true, "auto": false, "autoQueue": false]) : targetPayload(item, sourcePage: sourcePage)
        var selection: JSON = .object([queue ? "queuedSongId" : selectedKey: .string(item.identifier)])
        if queue { selection["queuedManual"] = true }
        if !queue { selection[page == "regions" ? "selectedPlaylistSongId" : "selectedRegionId"] = "" }
        command(queue ? (page == "regions" ? "queue_region_song" : "queue_playlist_song") : (page == "regions" ? "select_region" : "select_playlist_song"), payload, optimistic: selection)
    }
    func toggleAuto(_ mode: Int) {
        guard page == "playlist" else { message = "AUTO disponível apenas em Repertórios."; return }
        let next = !autoEnabled(mode)
        let local: JSON = ["autoplayEnabled": .bool(next), "autoplayMode": .number(next ? Double(mode) : 0), "autoplay1Enabled": .bool(next && mode == 1), "autoplay2Enabled": .bool(next && mode == 2)]
        command(mode == 2 ? "autoplay2_set" : "autoplay_set", ["desiredState": .string(next ? "on" : "off"), "autoplayEnabled": .bool(next), "autoPlayEnabled": .bool(next), "autoplayMode": .number(next ? Double(mode) : 0), mode == 2 ? "desiredAutoplay2" : "desiredAutoplay": .bool(next)], optimistic: local.merging(immediateAutoQueueState(mode: next ? mode : 0)))
    }
    var autoBlockEnabled: Bool { snapshot.first("autoBlocoEnabled", "autoBlocoArmed", "autoblockEnabled").bool }
    func toggleAutoBlock() {
        let next = !autoBlockEnabled
        var local: JSON = ["autoBlocoEnabled": .bool(next)]
        // Keep the real queued target. The visible boundary queue is hidden
        // locally while AT/BL is armed, and restored immediately when disabled.
        if !next && rawQueueID.isEmpty && (autoEnabled(1) || autoEnabled(2)) {
            local = local.merging(immediateAutoQueueState(mode: autoEnabled(2) ? 2 : 1, blockEnabled: false))
        }
        command("auto_bloco_set", ["desiredAutoBloco": .bool(next), "autoBlocoEnabled": .bool(next), "desiredState": .string(next ? "on" : "off")], optimistic: local)
    }
    var fadeoutActive: Bool { snapshot["manualStopFadeoutActive"].bool }
    var fadeoutConfigured: Bool {
        let tracks = snapshot["manualStopFadeoutTrackIds"]
        return snapshot["manualStopFadeoutEnabled"].bool &&
            (tracks.exists ? !tracks.array.isEmpty : snapshot["manualStopFadeout"]["selectedCount"].int > 0)
    }
    func toggleLoop() {
        let next = !snapshot.first("loopEnabled", "loopActive", "loop").bool
        command("loop_toggle", ["enabled": .bool(next), "active": .bool(next), "desiredState": .string(next ? "on" : "off")], optimistic: ["loopEnabled": .bool(next)])
    }
    func setVolume(_ item: JSON, ratio: Double, view: String = "tracks", premix: Bool = false, song: JSON? = nil) {
        let id = (premix ? item.first("itemId", "mediaItemId", "id", "guid") : item.first("id", "guid", "targetId", "trackId", "trackGuid")).string
        guard !id.isEmpty, !readOnly, connected, authenticated else { return }
        let key = (premix ? "item:" : "track:") + id
        let revision = UUID()
        volumeRevisions[key] = revision
        if premix {
            if itemVolumeBaselines[id] == nil {
                let remote = tcpItems.first { $0.first("itemId", "mediaItemId", "id", "guid").string == id } ?? item
                itemVolumeBaselines[id] = MixerScale.ratio(remote, max: 24)
            }
            itemVolumePreviews[id] = min(1, max(0, ratio))
        }
        volumeTasks[key]?.cancel()
        volumeTasks[key] = Task {
            do {
                try await Task.sleep(nanoseconds: 70_000_000)
                var payload = (premix ? (song.map { targetPayload($0) } ?? target) : [:]).merging(["targetId": .string(id), "ratio": .number(min(1, max(0, ratio))), "volumeRatio": .number(min(1, max(0, ratio))), "view": .string(view)])
                if premix {
                    payload["itemId"] = .string(id); payload["mediaItemId"] = .string(id)
                    if item["trackId"].exists { payload["trackId"] = item["trackId"] }
                } else { payload["id"] = .string(id); payload["trackId"] = .string(id) }
                try await post(premix ? "premix_item_set_volume" : "mixer_set_volume", payload)
                if volumeRevisions[key] == revision {
                    // Catalog snapshots can remain unchanged after a successful command.
                    // Keep the accepted value across modal reopenings until fresh volume
                    // data arrives, instead of dropping it after an arbitrary timeout.
                    if premix { acceptedItemVolumes[id] = min(1, max(0, ratio)) }
                    volumeRevisions[key] = nil; volumeTasks[key] = nil
                }
            } catch is CancellationError {} catch {
                if !Task.isCancelled && volumeRevisions[key] == revision {
                    if premix {
                        itemVolumePreviews[id] = acceptedItemVolumes[id]
                        if acceptedItemVolumes[id] == nil { itemVolumeBaselines[id] = nil }
                    }
                    volumeRevisions[key] = nil; volumeTasks[key] = nil
                    message = error.localizedDescription
                }
            }
        }
    }
    func reconcileTCPItemVolumes(_ items: [JSON]) {
        guard !itemVolumePreviews.isEmpty else { return }
        var seen = Set<String>()
        for item in items {
            let id = item.first("itemId", "mediaItemId", "id", "guid").string
            guard seen.insert(id).inserted else { continue }
            guard volumeRevisions["item:" + id] == nil,
                  let accepted = acceptedItemVolumes[id], let baseline = itemVolumeBaselines[id],
                  item.first("volumeRatio", "volume_ratio", "db", "volumeDb", "volume_db", "volume").exists else { continue }
            let remote = MixerScale.ratio(item, max: 24)
            // Matching data acknowledges our command; a changed remote value is a
            // subsequent edit from the computer. Unchanged stale data cannot reset it.
            if abs(remote - accepted) < 0.0001 || abs(remote - baseline) > 0.0001 {
                itemVolumePreviews[id] = nil; acceptedItemVolumes[id] = nil; itemVolumeBaselines[id] = nil
            }
        }
    }
    func displayedTCPItem(_ item: JSON) -> JSON {
        let id = item.first("itemId", "mediaItemId", "id", "guid").string
        guard let ratio = itemVolumePreviews[id] else { return item }
        return item.merging(["volumeRatio": .number(ratio)])
    }
    func choosePlaylist(_ item: JSON) {
        let id = item.first("playlistId", "id").string
        page = "playlist"
        command("select_playlist", item.merging(["id": .string(id), "playlistId": .string(id), "activePlaylistId": .string(id), "playlistName": .string(item.name), "currentPlaylistName": .string(item.name)]), optimistic: ["activePlaylistId": .string(id), "currentPlaylistName": .string(item.name), "selectedRegionId": "", "selectedPlaylistSongId": "", "selectedMarkerId": ""])
    }
    func mediaURL(_ value: String) -> URL? {
        guard !value.isEmpty else { return nil }
        if value.hasPrefix("http://") || value.hasPrefix("https://") { return URL(string: value) }
        return try? BridgeHTTP.shared.url(base, "/media", query: ["path": value])
    }
    var noticeIdentity: JSON { ["source": "director", "sessionHash": .string(sessionHash)] }
}
