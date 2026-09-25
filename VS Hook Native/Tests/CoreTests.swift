import Foundation

final class MockBridge: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    private static var snapshot: JSON = [:]
    private static var commands: [JSON] = []
    private static var rejected = ""
    static func reset(_ value: JSON) { lock.lock(); defer { lock.unlock() }; snapshot = value; commands = []; rejected = "" }
    static func state(_ value: JSON) { lock.lock(); defer { lock.unlock() }; snapshot = value }
    static func reject(_ type: String) { lock.lock(); defer { lock.unlock() }; rejected = type }
    static var sent: [JSON] { lock.lock(); defer { lock.unlock() }; return commands }
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "fixture.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock()
        var response = Self.snapshot
        var status = 200
        if request.url?.path == "/command" {
            var data = request.httpBody ?? Data()
            if let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var bytes = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable { let count = stream.read(&bytes, maxLength: bytes.count); if count <= 0 { break }; data.append(contentsOf: bytes.prefix(count)) }
            }
            let command = (try? JSONDecoder().decode(JSON.self, from: data)) ?? .null
            Self.commands.append(command)
            if command["type"].string == Self.rejected { status = 503; response = ["ok": false, "error": "fixture rejection"] }
            else { response = ["ok": true] }
        }
        Self.lock.unlock()
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONEncoder().encode(response))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
@main struct CoreTests {
    static func check(_ value: @autoclosure () throws -> Bool, _ message: String) rethrows { let result = try value(); precondition(result, message) }
    @MainActor static func until(_ condition: () -> Bool, line: Int = #line) async throws {
        let deadline = Date().addingTimeInterval(4)
        while !condition() { if Date() > deadline { fatalError("timed out at test line \(line)") }; try await Task.sleep(nanoseconds: 10_000_000) }
    }
    @MainActor static func main() async throws {
        check(bridgePasswordHash("") == "045DB710", "empty legacy hash")
        check(bridgePasswordHash("1234") == "F16CD45C", "desktop password compatibility")
        check(bridgePasswordHash("ação🎹") == "663AA018", "UTF-16 compatibility")
        let data = try JSONDecoder().decode(JSON.self, from: Data(#"{"id":12,"name":"Música","enabled":false,"ratio":0.76,"unknown":{"future":[1,true,null]}}"#.utf8))
        try check(JSONDecoder().decode(JSON.self, from: JSONEncoder().encode(data)) == data, "preserve unknown bridge fields")
        check(data["id"].string == "12" && data["enabled"] == false, "numeric IDs and explicit booleans")
        check(JSON.string("NaN").int == 0 && JSON.string("1e100").int == 0, "malformed numeric values cannot crash the app")
        let raw: JSON = ["app": "VS Hook", "computerId": "pc1", "computerName": "Palco", "projects": [["name": "Show A", "index": 3, "id": "a", "active": true], ["name": "demo"], ["name": "Show B", "projectTabIndex": 7]]]
        let projects = HookProject.parse(raw, base: raw, host: "192.168.77.10")
        check(projects.count == 2 && projects[0].tab == 3 && projects[1].tab == 7, "real projects and original tab IDs")
        check(projects[0].director.port == 47831 && projects[0].musicians.port == 47832, "separate director/musician bridges")
        check(HookProject.parse(raw.merging(["reaperOnline": false]), base: raw, host: "192.168.77.10").isEmpty, "offline desktop must not appear as active")
        let hosts = LocalNetwork.candidates([LocalNetwork(address: "192.168.77.42", prefix: 24)], saved: ["10.0.0.1", "192.168.77.88"])
        check(hosts.count == 253 && hosts.first == "192.168.77.88", "scan active subnet with history priority")
        check(!hosts.contains("192.168.77.0") && !hosts.contains("192.168.77.255") && !hosts.contains("192.168.77.42") && !hosts.contains("10.0.0.1"), "exclude self/broadcast/network and stale hosts")
        check(LocalNetwork.candidates([LocalNetwork(address: "10.0.0.2", prefix: 8)], saved: []).isEmpty, "avoid unbounded subnet scanning")
        check(LocalNetwork.candidates([LocalNetwork(address: "192.168.77.4", prefix: 31)], saved: []) == ["192.168.77.5"], "point-to-point subnet endpoints")
        check(LocalNetwork.number("192.168.1.256") == nil && LocalNetwork.number("192.168.1") == nil, "validate manual IP")
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockBridge.self]
        let http = BridgeHTTP(configuration: config)
        let base = URL(string: "http://fixture.invalid:47831")!
        let project = HookProject(name: "Show", tab: 3, projectID: "p", computer: "PC", computerID: "pc", director: base, musicians: base, active: true)
        let state: JSON = ["connected": true, "directorAuthEnabled": true, "directorAuthHash": "F16CD45C", "directorAuthRevision": "r1", "currentPage": "playlist", "regions": [["id": "song", "name": "Música", "startPos": 10, "endPos": 50]], "playlists": [["id": "list", "name": "Show", "songs": [["id": "song", "name": "Música", "start_pos": 10, "end_pos": 50, "playlistOrder": 2, "playlistEntryId": "entry2"]]]]]
        MockBridge.reset(state)
        let director = HookSession(project: project, mode: .director, tablet: false, http: http)
        director.start()
        try await until { director.connected }
        check(!director.authenticated, "director requires password")
        check(MockBridge.sent.first?["type"] == "set_project_tab" && MockBridge.sent.first?["payload"]["projectTabIndex"] == 3, "select correct project before polling")
        director.command("play_button")
        try await Task.sleep(nanoseconds: 60_000_000)
        check(!MockBridge.sent.contains { $0["type"] == "play_button" }, "reject playback before auth")
        director.login("wrong"); check(!director.authenticated, "invalid password")
        director.login("1234")
        try await until { MockBridge.sent.contains { $0["type"] == "director_enter" } }
        director.select(director.allItems[0], queue: true)
        try await until { MockBridge.sent.contains { $0["type"] == "queue_playlist_song" } }
        let queued = MockBridge.sent.first { $0["type"] == "queue_playlist_song" }!["payload"]
        check(queued["manual"] == true && queued["selectedStartPos"] == 10 && queued["selectedEndPos"] == 50 && queued["queueExactPosition"] == true && queued["playlistOrder"] == 2 && queued["playlistEntryId"] == "entry2", "preserve exact playlist entry and manual queue intent")
        director.page = "regions"
        director.select(director.playlistItems[0], sourcePage: "playlist")
        try await until { MockBridge.sent.contains { $0["type"] == "select_playlist_song" } }
        let fromTP = MockBridge.sent.first { $0["type"] == "select_playlist_song" }!["payload"]
        check(fromTP["page"] == "playlist" && fromTP["playlistEntryId"] == "entry2" && director.page == "regions", "TP LIST selects from the active playlist without changing its underlying page")
        director.page = "playlist"
        director.command("timer_set_mode", ["mode": "countdown"])
        try await until { MockBridge.sent.contains { $0["type"] == "timer_set_mode" } }
        check(MockBridge.sent.first { $0["type"] == "timer_set_mode" }?["payload"]["mode"] == "countdown", "role metadata preserves functional mode")
        for i in 0...10 { director.setVolume(["id": "track"], ratio: Double(i) / 10) }
        try await until { MockBridge.sent.contains { $0["type"] == "mixer_set_volume" } }
        let volumes = MockBridge.sent.filter { $0["type"] == "mixer_set_volume" }
        check(volumes.count == 1 && volumes[0]["payload"]["ratio"] == 1, "coalesce rapid fader changes")
        director.snapshot["selectedPlaylistSongId"] = "song"
        director.setVolume(["itemId": "clip", "id": "fallback", "trackId": "track"], ratio: 0.5, premix: true)
        try await until { MockBridge.sent.contains { $0["type"] == "premix_item_set_volume" } }
        let clipVolume = MockBridge.sent.first { $0["type"] == "premix_item_set_volume" }!["payload"]
        check(clipVolume["id"] == "song" && clipVolume["itemId"] == "clip" && clipVolume["trackId"] == "track", "TCP item volume preserves separate song, item and track identities")
        director.setVolume(["itemId": "clip-live", "trackId": "track"], ratio: 0.8, premix: true, song: ["id": "playing-song", "startPos": 100, "endPos": 200])
        try await until { MockBridge.sent.contains { $0["payload"]["itemId"] == "clip-live" } }
        let liveVolume = MockBridge.sent.first { $0["payload"]["itemId"] == "clip-live" }!["payload"]
        check(liveVolume["id"] == "playing-song" && liveVolume["startPos"] == 100, "TCP sends the displayed song context even when another song remains selected")
        let previewItem: JSON = ["itemId": "clip-live", "volumeRatio": 0.2]
        check(MixerScale.ratio(director.displayedTCPItem(previewItem), max: 24) == 0.8, "waveform immediately follows the item fader while remote state is stale")
        MockBridge.reject("premix_item_set_volume")
        director.setVolume(previewItem, ratio: 0.1, premix: true)
        check(MixerScale.ratio(director.displayedTCPItem(previewItem), max: 24) == 0.1, "new item drag supersedes prior visual hold")
        try await until { director.itemVolumePreviews["clip-live"] == nil }
        check(MixerScale.ratio(director.displayedTCPItem(previewItem), max: 24) == 0.2, "rejected item volume restores remote waveform")
        MockBridge.reject("")
        director.snapshot["selectedRegionId"] = "old-region"
        director.select(director.allItems[0])
        check(director.snapshot["selectedRegionId"] == "" && director.selectedID == "song", "selecting a playlist song clears stale region focus")
        MockBridge.reject("loop_toggle")
        director.message = ""
        director.toggleLoop()
        try await until { director.message == "fixture rejection" }
        check(!director.snapshot["loopEnabled"].bool, "failed command rolls back optimistic UI")
        MockBridge.state(state.merging(["directorAuthRevision": "r2"]))
        try await until { !director.authenticated }
        director.suspend()
        let count = MockBridge.sent.count
        try await Task.sleep(nanoseconds: 400_000_000)
        check(MockBridge.sent.count == count, "suspension stops polling and heartbeat")
        MockBridge.reset(state)
        let musician = HookSession(project: project, mode: .musician, tablet: false, http: http)
        musician.start()
        try await until { musician.connected }
        musician.command("play_button"); musician.select(musician.allItems[0]); musician.toggleLoop()
        musician.setVolume(["id": "track"], ratio: 0.2)
        try await Task.sleep(nanoseconds: 400_000_000)
        check(MockBridge.sent.isEmpty, "musician cannot claim session, switch project or control playback")
        musician.suspend()
        let layoutSession = HookSession(project: project, mode: .director, tablet: true, http: http)
        let block: JSON = ["id": "block", "name": "Bloco", "sourceNumber": -1]
        let parent: JSON = ["id": "parent", "name": "Família", "isHashParent": true]
        let child: JSON = ["id": "child", "name": "Filha", "isHashChild": true, "parentId": "parent"]
        let solo: JSON = ["id": "solo", "name": "Avulsa", "startPos": 100, "endPos": 200, "bpmValue": 130, "tunerValue": -2]
        layoutSession.snapshot = ["playing": true, "playingSongId": "solo", "playPosition": 125,
            "multiloops": ["bypassActive": true], "timerDisplaySec": 3661,
            "playlists": [["id": "set", "songs": .array([block, parent, child, solo])]]]
        check(layoutSession.songEntries.map(\.ordinal) == ["1°", "01", "03"], "blocks have separate numbering; hidden children keep song order")
        layoutSession.openFamilies.insert("parent")
        check(layoutSession.songEntries.map(\.item.identifier) == ["block", "parent", "child", "solo"], "family drawer restores children in original order")
        check(layoutSession.bypassActive && solo.songBPM == 130 && solo.songTuner == -2, "read current Hook Center control fields")
        check(layoutSession.progress(at: Date()) == 0.25, "playback progress is relative to song start, not project start")
        check(layoutSession.timerText(at: Date()) == "01:01:01", "header shows session timer with hours")
        check(TCPAppearance.waveScale(["volumeRatio": 0]) == 0.04, "silent item preserves minimum waveform")
        check(TCPAppearance.waveScale(["volumeRatio": 0.38]) == 0.5, "attenuated waveform follows item ratio")
        check(TCPAppearance.waveScale(["volumeRatio": 0.76]) == 1, "unity gain waveform")
        check(abs(TCPAppearance.waveScale(["volumeRatio": 1]) - 1.35) < 0.0001, "boosted waveform grows above unity")
        check(TCPAppearance.listFraction(0.7, tracks: 0.5) == 0.5, "LIST respects space occupied by tracks")
        check(TCPAppearance.listFraction(0.1, tracks: 0.3) == 0.34, "LIST keeps current reference minimum width")
        check(TCPAppearance.waveScale(["ratio": 0.1, "volume": 1]) == 1, "timeline geometry ratio never changes waveform volume")
        let searchData: JSON = ["regions": [["id": "parent", "name": "Adoração", "isHashParent": true], ["id": "child", "name": "Graça", "parentId": "parent", "isHashChild": true], ["id": "block", "name": "Bloco", "isBlock": true]], "playlists": [["songs": [["id": "other", "name": "Canção distante"], ["id": "child", "name": "Graça"]]]]]
        check(DirectorSearch.entries(searchData, query: "graca adoracao").map(\.identifier) == ["child"], "LUPA finds closed family children by song and parent without accents")
        check(DirectorSearch.entries(searchData, query: "distante").map(\.identifier) == ["other"], "LUPA includes other playlists")
        check(DirectorSearch.entries(searchData, query: "").count == 3, "global search deduplicates songs and excludes blocks")
        let partsSong: JSON = ["id": "parts-song", "name": "Song", "startPos": 10, "endPos": 100]
        let partData: JSON = ["markers": [["id": "a", "name": "$ INTRO", "pos": 20], ["id": "b", "name": "*2 REFRÃO", "pos": 40], ["id": "ignored", "name": "TECH", "pos": 50], ["id": "outside", "name": "$ FINAL", "pos": 100]]]
        check(DirectorPlaylistTiming.text(["activePlaylistTotalSec": 11122.416601]) == "03:05:22", "RPTS uses the current bridge total even without song rows")
        check(DirectorPlaylistTiming.text(["playlistTotalText": "00:52:47"]) == "00:52:47", "RPTS preserves published total clock text")
        let family: JSON = ["id": "parent-marker", "name": "--MEDLEY--", "startPos": 0, "endPos": 50, "isHashParent": true]
        let familyList: JSON = ["name": "CULTO", "songs": [family], "totalDurationSec": 50]
        let familyData: JSON = ["regions": [family], "playlists": [familyList], "markers": [["id": "7", "number": 7, "name": "Canção antiga", "pos": 10], ["id": "8", "number": 8, "name": "Próxima", "pos": 30], ["id": "9", "name": "$PONTE", "pos": 35]]]
        let familyChildren = DirectorFamily.children(of: family, data: familyData)
        check(familyChildren.map(\.identifier) == ["m7", "m8"] && familyChildren[0]["endPos"] == 30 && familyChildren[1]["endPos"] == 50, "marker drawer preserves exact boundaries and excludes Parts markers")
        check(DirectorSearch.entries(familyData, query: "cancao medley").map(\.identifier) == ["m7"], "LUPA finds legacy marker children by parent")
        check(DirectorPlaylistCopy.text(familyList, data: familyData, includeChildren: false) == "CULTO\n\nTempo total: 00:50\n\n--MEDLEY--", "COPY retains playlist header and duration")
        check(DirectorPlaylistCopy.text(familyList, data: familyData, includeChildren: true).hasSuffix("--MEDLEY--\nCanção antiga\nPróxima"), "COPY can include drawer children in song order")
        let parts = DirectorParts.markers(partData, song: partsSong)
        check(parts.count == 3 && parts[0]["partsSongStart"].bool && parts[1]["partsDisplayName"] == "INTRO" && parts[2]["partsPrefix"] == "*2", "PARTS uses song start and supported markers within exact song bounds")
        check(DirectorParts.markers(partData, song: partsSong.merging(["isHashParent": true])).isEmpty, "family parent must select a child for Parts")
        let range = TCPRange(start: 100, end: 200)
        let overlapping: JSON = ["id": "media", "trackGuid": "guid-track", "startPos": 90, "endPos": 150]
        check(range.span(overlapping)?.left == 0 && range.span(overlapping)?.width == 0.5, "TCP clips media to selected song bounds")
        check(range.span(["startPos": 10, "endPos": 99]) == nil, "TCP excludes media outside selected song")
        check(TCPModel.matches(overlapping, track: ["id": "track", "guid": "guid-track"]), "timeline items match track GUID aliases")
        check(!TCPModel.matches(overlapping, track: ["id": "other"]), "timeline does not leak media to other tracks")
        layoutSession.snapshot = ["playing": true, "playPosition": 125, "regions": [solo, ["id": "child-span", "name": "Trecho", "startPos": 120, "endPos": 130]]]
        check(layoutSession.tcpFocus.identifier == "child-span", "TCP falls back to the smallest playing region when the bridge omits playback ID")
        for tablet in [false, true] {
            for mode: HookMode in [.director, .musician] {
                let navigation = HookSession(project: layoutSession.project, mode: mode, tablet: tablet)
                navigation.swipeTransport(right: true)
                check(navigation.panel == "tp", "transport swipe opens TP in each role/layout")
                navigation.swipeTransport(right: false)
                check(navigation.panel == "", "reverse swipe returns from TP in each role/layout")
                navigation.swipeTransport(right: false)
                check(navigation.panel == (mode == .director ? "parts" : ""), "parts remains director-only")
                navigation.swipeTransport(right: true)
                check(navigation.panel == (mode == .director ? "" : "tp"), "parts reverse swipe returns to list")
            }
        }
        let indexedTracks: [JSON] = [["id": "folder", "folderDepth": 1], ["id": "one", "guid": "guid-track", "trackIndex": 1, "name": "PIANO"], ["id": "two", "trackIndex": 2, "name": "BASS", "folderDepth": -1]]
        let indexedItems: [JSON] = [overlapping, ["id": "by-index", "trackIndex": 2], ["id": "by-name", "trackName": "piano"], ["id": "outside", "trackId": "missing"]]
        let indexedRows = TCPTrackRows.make(tracks: indexedTracks, items: indexedItems, focused: true)
        for index in 1..<indexedTracks.count {
            check(indexedRows[index].items == indexedItems.filter { TCPModel.matches($0, track: indexedTracks[index]) }, "indexed timeline preserves GUID, index and name matching")
        }
        check(indexedRows[0].shadow && indexedRows[0].items.count == 3, "folder waveform contains its child tracks")
        check(TCPTrackRows.make(tracks: indexedTracks, items: indexedItems, focused: false).allSatisfy { $0.items.isEmpty }, "unfocused timeline does not show items")
        let suite = "vshook-test-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let prefs = TPPreferences(defaults: defaults)
        check(prefs.settings(1)["chordScale"] == 50, "chord scale follows current reference normalization")
        prefs.set("textColor", "#123456", slot: 1)
        check(prefs.settings(1)["textColor"] == "#123456" && prefs.settings(2)["textColor"] == "#ffea00", "TP1 and TP2 settings remain independent")
        prefs.set("preset", "day", slot: 1)
        check(prefs.settings(1)["textColor"] == "#ffffff", "day preset has its own colours")
        prefs.set("preset", "night", slot: 1)
        check(prefs.settings(1)["textColor"] == "#123456", "switching presets restores prior customization")
        check(TPPreferences(defaults: defaults).settings(1)["textColor"] == "#123456", "teleprompt preferences persist")
        check(Set(TPSchema.data["fields"].array.map { $0["key"].string }).count == TPSchema.data["fields"].array.count, "teleprompt configuration fields have unique identities")
        let notice = TPNoticeModel()
        let instant = Date(timeIntervalSince1970: 1000)
        notice.apply(["now": 2_000_000, "notice": ["id": "a", "text": "Aviso", "expiresAt": 2_020_000]], at: instant)
        check(notice.active(at: instant.addingTimeInterval(19), settings: prefs.notice, slot: 1), "notice uses bridge clock instead of device clock")
        check(!notice.active(at: instant.addingTimeInterval(21), settings: prefs.notice, slot: 1), "stale notice expires even if disconnected")
        notice.apply(["now": 2_000_000, "notice": ["id": "image", "imagePath": "test.jpg", "pinned": true, "expiresAt": 0]], at: instant)
        check(notice.active(at: instant.addingTimeInterval(60), settings: prefs.notice, slot: 1), "pinned image-only notice stays visible beyond the normal deadline")
        notice.apply(["now": 2_000_000, "notice": ["id": "image", "imagePath": "test.jpg", "pinned": false, "expiresAt": 2_010_000]], at: instant)
        check(notice.active(at: instant.addingTimeInterval(9), settings: prefs.notice, slot: 1) && !notice.active(at: instant.addingTimeInterval(11), settings: prefs.notice, slot: 1), "unpin resumes the image notice deadline")
        prefs.setNotice("window2Enabled", false)
        check(!notice.active(at: instant, settings: prefs.notice, slot: 2), "notice visibility respects independent TP windows")
        notice.apply(["now": 2_001_000, "notice": .null], at: instant.addingTimeInterval(1))
        check(!notice.active(at: instant.addingTimeInterval(1), settings: prefs.notice, slot: 1), "cancelled notice immediately clears")
        check(DirectorNumberOrder.ascending([["id": 1], ["id": 2]]) && !DirectorNumberOrder.ascending([["id": 2], ["id": 1]]), "0-9 alternates direction from the current list order")
        print("VSHOOK_DIRECTOR_REFERENCE_OK: blocks, families, bridge controls, timer and song progress")
        print("VSHOOK_CORE_OK: protocol, discovery, authentication, queue, volume, rollback and passive musician")
    }
}
