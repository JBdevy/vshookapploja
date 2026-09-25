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
    @Published var snapshot: JSON = [:]
    @Published var connected = false
    @Published var authenticated = false
    @Published var message = ""
    @Published var page = "playlist"
    @Published var panel = ""
    @Published var query = ""
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
    private var pending: [String: (value: JSON, until: Date)] = [:]
    private var volumeTasks: [String: Task<Void, Never>] = [:]
    @Published private(set) var itemVolumePreviews: [String: Double] = [:]
    private var volumeRevisions: [String: UUID] = [:]
    var base: URL { mode == .musician ? project.musicians : project.director }
    var readOnly: Bool { mode != .director }
    var playing: Bool {
        let flag = snapshot.first("playing", "isPlaying", "transportPlaying")
        return flag.exists ? flag.bool : !playingID.isEmpty
    }
    var playingID: String { snapshot.first("playingId", "playingSongId", "playingRegionId", "currentRegionId").string }
    var queueID: String { snapshot.first("queuedSongId", "queuedRegionId").string }
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
    func suspend() { generation = UUID(); loop?.cancel(); loop = nil; volumeTasks.values.forEach { $0.cancel() }; volumeTasks = [:]; itemVolumePreviews = [:]; volumeRevisions = [:]; connected = false }
    private func refresh(_ token: UUID) async {
        do {
            if !readOnly && !projectSelected {
                _ = try await http.request(base, "/command", body: ["type": "set_project_tab", "payload": ["projectTabIndex": .number(Double(project.tab)), "index": .number(Double(project.tab))]])
                guard !Task.isCancelled, generation == token else { return }
                projectSelected = true
            }
            let data = try await http.request(base, "/state", timeout: 2.8)
            guard !Task.isCancelled, generation == token else { return }
            guard data["connected"] != false, data["reaperOnline"] != false else { throw BridgeError(message: "O Hook Center está aberto, mas o projeto está desconectado.") }
            var next = snapshot.merging(data)
            for (key, held) in pending {
                if data[key] == held.value || Date() > held.until { pending[key] = nil }
                else { next[key] = held.value }
            }
            lastUpdate = Date()
            if snapshot != next { snapshot = next }
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
        let before = snapshot
        for (key, value) in optimistic.object { pending[key] = (value, Date().addingTimeInterval(5)); snapshot[key] = value }
        // An earlier successful request must not erase a newer command failure.
        message = ""
        Task {
            do { try await post(type, payload) }
            catch {
                for (key, value) in optimistic.object where pending[key]?.value == value { pending[key] = nil; snapshot[key] = before[key] }
                message = error.localizedDescription
            }
        }
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
        if queue && queueID == item.identifier { command("clear_queue", targetPayload(item, sourcePage: sourcePage), optimistic: ["queuedSongId": ""]); return }
        let payload = queue ? targetPayload(item, sourcePage: sourcePage).merging(["queued": true, "manual": true, "queuedManual": true, "auto": false, "autoQueue": false]) : targetPayload(item, sourcePage: sourcePage)
        var selection: JSON = .object([queue ? "queuedSongId" : selectedKey: .string(item.identifier)])
        if !queue { selection[page == "regions" ? "selectedPlaylistSongId" : "selectedRegionId"] = "" }
        command(queue ? (page == "regions" ? "queue_region_song" : "queue_playlist_song") : (page == "regions" ? "select_region" : "select_playlist_song"), payload, optimistic: selection)
    }
    func toggleAuto(_ mode: Int) {
        guard page == "playlist" else { message = "AUTO disponível apenas em Repertórios."; return }
        let next = !autoEnabled(mode)
        command(mode == 2 ? "autoplay2_set" : "autoplay_set", ["desiredState": .string(next ? "on" : "off"), "autoplayEnabled": .bool(next), "autoPlayEnabled": .bool(next), "autoplayMode": .number(next ? Double(mode) : 0), mode == 2 ? "desiredAutoplay2" : "desiredAutoplay": .bool(next)], optimistic: ["autoplayEnabled": .bool(next), "autoplayMode": .number(next ? Double(mode) : 0), "autoplay1Enabled": .bool(next && mode == 1), "autoplay2Enabled": .bool(next && mode == 2)])
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
        if premix { itemVolumePreviews[id] = min(1, max(0, ratio)) }
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
                // Keep the visual response while the bridge publishes its next snapshot.
                if premix { try await Task.sleep(nanoseconds: 2_000_000_000) }
                if volumeRevisions[key] == revision { if premix { itemVolumePreviews[id] = nil }; volumeRevisions[key] = nil; volumeTasks[key] = nil }
            } catch is CancellationError {} catch {
                if !Task.isCancelled && volumeRevisions[key] == revision {
                    if premix { itemVolumePreviews[id] = nil }; volumeRevisions[key] = nil; volumeTasks[key] = nil
                    message = error.localizedDescription
                }
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
