import Foundation

final class MockBridge: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    private static var snapshot: JSON = [:]
    private static var commands: [JSON] = []
    private static var rejected = ""
    private static var delayedType = ""
    static func reset(_ value: JSON) { lock.lock(); defer { lock.unlock() }; snapshot = value; commands = []; rejected = "" }
    static func state(_ value: JSON) { lock.lock(); defer { lock.unlock() }; snapshot = value }
    static func reject(_ type: String) { lock.lock(); defer { lock.unlock() }; rejected = type }
    static func delay(_ type: String) { lock.lock(); defer { lock.unlock() }; delayedType = type }
    static var sent: [JSON] { lock.lock(); defer { lock.unlock() }; return commands }
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "fixture.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock()
        var response = Self.snapshot
        var status = 200
        var delay = false
        if request.url?.path == "/command" {
            var data = request.httpBody ?? Data()
            if let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var bytes = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable { let count = stream.read(&bytes, maxLength: bytes.count); if count <= 0 { break }; data.append(contentsOf: bytes.prefix(count)) }
            }
            let command = (try? JSONDecoder().decode(JSON.self, from: data)) ?? .null
            Self.commands.append(command)
            delay = command["type"].string == Self.delayedType
            if command["type"].string == Self.rejected { status = 503; response = ["ok": false, "error": "fixture rejection"] }
            else { response = ["ok": true] }
        }
        Self.lock.unlock()
        if delay { Thread.sleep(forTimeInterval: 0.15) }
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
        director.setVolume(["itemId": "clip-live", "trackId": "track", "volumeRatio": 0.2], ratio: 0.8, premix: true, song: ["id": "playing-song", "startPos": 100, "endPos": 200])
        try await until { MockBridge.sent.contains { $0["payload"]["itemId"] == "clip-live" } }
        let liveVolume = MockBridge.sent.first { $0["payload"]["itemId"] == "clip-live" }!["payload"]
        check(liveVolume["id"] == "playing-song" && liveVolume["startPos"] == 100, "TCP sends the displayed song context even when another song remains selected")
        let previewItem: JSON = ["itemId": "clip-live", "volumeRatio": 0.2]
        check(MixerScale.ratio(director.displayedTCPItem(previewItem), max: 24) == 0.8, "waveform immediately follows the item fader while remote state is stale")
        try await Task.sleep(nanoseconds: 2_200_000_000)
        director.reconcileTCPItemVolumes([previewItem, previewItem.merging(["volumeRatio": 0.8])])
        check(MixerScale.ratio(director.displayedTCPItem(previewItem), max: 24) == 0.8, "reopening the item after two seconds keeps the accepted volume despite a stale catalog")
        MockBridge.reject("premix_item_set_volume")
        director.setVolume(previewItem, ratio: 0.1, premix: true)
        check(MixerScale.ratio(director.displayedTCPItem(previewItem), max: 24) == 0.1, "new item drag supersedes prior visual hold")
        try await until { director.itemVolumePreviews["clip-live"] == 0.8 }
        check(MixerScale.ratio(director.displayedTCPItem(previewItem), max: 24) == 0.8, "rejected edit restores the last accepted volume")
        let acknowledgedItem = previewItem.merging(["volumeRatio": 0.8])
        director.reconcileTCPItemVolumes([acknowledgedItem])
        check(director.itemVolumePreviews["clip-live"] == nil, "matching bridge data releases the local override")
        check(MixerScale.ratio(director.displayedTCPItem(previewItem.merging(["volumeRatio": 0.6])), max: 24) == 0.6, "later remote edits are visible after acknowledgment")
        MockBridge.reject("")
        director.setVolume(previewItem, ratio: 0.3, premix: true)
        try await Task.sleep(nanoseconds: 150_000_000)
        director.reconcileTCPItemVolumes([previewItem.merging(["volumeRatio": 0.4])])
        check(director.itemVolumePreviews["clip-live"] == nil, "a new remote volume supersedes an accepted value even without an exact echo")
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
        try await testImmediateFeedback(project: project, http: http)
        try await testAutoBlockFeedback(project: project, http: http)
        testContinuousClock()
        try await testFadeoutFeedback(project: project, http: http)
        try await testPlayFromCursor(project: project, http: http)
        try await testLiveCursorDrag(project: project, http: http)
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
        for tablet in [false, true] {
            MockBridge.reset(state)
            let searchSession = HookSession(project: project, mode: .director, tablet: tablet, http: http)
            searchSession.connected = true; searchSession.authenticated = true
            searchSession.snapshot = state
            searchSession.page = "regions"; searchSession.panel = "tp"; searchSession.query = "old filter"
            searchSession.selectSearchResult(state["regions"].array[0])
            let request = searchSession.searchScrollRequest!
            check(searchSession.page == "playlist" && searchSession.panel.isEmpty && searchSession.query.isEmpty, "LUPA returns to the active repertoire and clears hidden filters in both layouts")
            check(request.playlistEntryID == "entry2" && request.rowID(in: searchSession.songEntries, page: "playlist") == "0:entry2", "LUPA targets the actual playlist occurrence after list remount")
            check(request.rowID(in: searchSession.songEntries, page: "regions") == nil && request.rowID(in: [], page: "playlist") == nil, "scroll waits for the matching page and its rows")
            searchSession.selectSearchResult(state["regions"].array[0])
            check(searchSession.searchScrollRequest?.id != request.id, "choosing the same search result issues a new scroll")
            searchSession.snapshot["regions"] = .array(state["regions"].array + [solo])
            searchSession.selectSearchResult(solo)
            check(searchSession.page == "regions" && searchSession.selectedID == "solo" && searchSession.searchScrollRequest?.rowID(in: searchSession.songEntries, page: "regions") == "1:solo", "song outside the active repertoire opens and targets MÚSICAS")
            searchSession.snapshot = familyData
            searchSession.selectSearchResult(familyChildren[0])
            check(searchSession.page == "playlist" && searchSession.openFamilies.contains(family.identifier), "LUPA opens a closed family in the active repertoire")
            check(searchSession.searchScrollRequest?.rowID(in: searchSession.songEntries, page: "playlist") == "1:m7", "generated family child can be revealed and scrolled to")
            try await until { MockBridge.sent.contains { $0["type"] == "select_playlist_song" && $0["payload"]["targetId"] == "m7" } }
            MockBridge.reset(state)
            searchSession.snapshot = state.merging(["playing": true, "playingSongId": "current", "selectedPlaylistSongId": "current", "regions": .array(state["regions"].array + [solo])])
            searchSession.selectSearchResult(state["regions"].array[0])
            try await until { MockBridge.sent.contains { $0["type"] == "queue_playlist_song" } }
            let searchQueue = MockBridge.sent.first { $0["type"] == "queue_playlist_song" }!["payload"]
            check(searchSession.queueID == "song" && searchSession.playingID == "current" && searchSession.selectedID == "current", "LUPA queues without replacing playback or selection")
            check(searchQueue["playlistEntryId"] == "entry2" && searchQueue["manual"] == true, "search queue preserves the exact repertoire entry and manual intent")
            searchSession.selectSearchResult(state["regions"].array[0])
            check(searchSession.queueID == "song", "choosing an already queued search result keeps it queued")
            searchSession.selectSearchResult(solo)
            try await until { MockBridge.sent.contains { $0["type"] == "queue_region_song" } }
            check(searchSession.page == "regions" && searchSession.queueID == "solo" && searchSession.playingID == "current", "search queues songs outside the repertoire while navigating to MÚSICAS")
            check(!MockBridge.sent.contains { ["select_region", "select_playlist_song", "clear_queue"].contains($0["type"].string) }, "search during playback only sends queue commands")
            searchSession.suspend()
        }
        check(DirectorPlaylistCopy.text(familyList, data: familyData, includeChildren: false) == "CULTO\n\nTempo total: 00:50\n\n--MEDLEY--", "COPY retains playlist header and duration")
        check(DirectorPlaylistCopy.text(familyList, data: familyData, includeChildren: true).hasSuffix("--MEDLEY--\nCanção antiga\nPróxima"), "COPY can include drawer children in song order")
        let parts = DirectorParts.markers(partData, song: partsSong)
        check(parts.count == 3 && parts[0]["partsSongStart"].bool && parts[1]["partsDisplayName"] == "INTRO" && parts[2]["partsPrefix"] == "*2", "PARTS uses song start and supported markers within exact song bounds")
        check(DirectorParts.markers(partData, song: partsSong.merging(["isHashParent": true])).isEmpty, "family parent must select a child for Parts")
        let range = TCPRange(start: 100, end: 200)
        let overlapping: JSON = ["id": "media", "trackGuid": "guid-track", "startPos": 90, "endPos": 150]
        check(range.span(overlapping)?.left == 0 && range.span(overlapping)?.width == 0.5, "TCP clips media to selected song bounds")
        check(range.span(["startPos": 10, "endPos": 99]) == nil, "TCP excludes media outside selected song")
        let loopState: JSON = ["loopEnabled": true, "loopStartPos": 120, "loopEndPos": 180]
        let loopGeometry = TCPLoopOverlayGeometry.make(loopState, visible: range)!
        check(loopGeometry.startMarker == 0.2 && loopGeometry.endMarker == 0.8, "TCP loop boundaries align with timeline seconds")
        let zoomedLoop = TCPLoopOverlayGeometry.make(loopState, visible: TCPRange(start: 140, end: 200))!
        check(zoomedLoop.startMarker == nil && zoomedLoop.left == 0 && zoomedLoop.endMarker == 2.0 / 3, "zoom clips the loop fill without inventing an offscreen start marker")
        check(TCPLoopOverlayGeometry.make(loopState.merging(["loopEnabled": false]), visible: range) == nil, "disabled loop has no TCP markers")
        check(TCPLoopOverlayGeometry.make(loopState, visible: TCPRange(start: 0, end: 100)) == nil, "loop outside focused song is hidden")
        let configuredLoops: JSON = ["loopActive": false, "tcpMultiLoopRanges": [["songId": "a", "slot": 2, "startPos": 120, "endPos": 180]]]
        let enabledShapes = TCPLoopOverlayGeometry.all(configuredLoops, visible: range)
        check(enabledShapes.count == 1 && enabledShapes[0].slot == 2 && enabledShapes[0].startMarker == 0.2, "enabled multiloop appears before the playhead reaches it")
        check(TCPLoopOverlayGeometry.all(configuredLoops.merging(loopState), visible: range).count == 1, "Repeat does not duplicate enabled multiloop boundaries")
        check(TCPLoopOverlayGeometry.all(configuredLoops.merging(["tcpMultiLoopRanges": []]), visible: range).isEmpty, "disabled multiloop slots leave the grid")
        let existingMarkers: JSON = ["loopActive": false, "markers": [["name": "*1", "pos": 11760.64], ["name": "*1", "pos": 11768.32]]]
        let oldBridgeShapes = TCPLoopOverlayGeometry.all(existingMarkers, visible: TCPRange(start: 11728, end: 11906.56))
        check(oldBridgeShapes.count == 1 && oldBridgeShapes[0].slot == 1 && oldBridgeShapes[0].startMarker != nil && oldBridgeShapes[0].endMarker != nil, "existing Grid marker catalog draws both TCP limits without a new bridge field")
        check(TCPLoopOverlayGeometry.all(existingMarkers, visible: TCPRange(start: 11764, end: 11780), songRange: TCPRange(start: 11728, end: 11906.56)).first?.startMarker == nil, "zoom retains a marker pair whose beginning is offscreen")
        check(TCPLoopOverlayGeometry.all(existingMarkers.merging(["tcpMultiLoopRanges": []]), visible: TCPRange(start: 11728, end: 11906.56)).isEmpty, "explicit disabled slots override compatibility markers")
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
        let rowCache = TCPRowCache()
        check(rowCache.rows(tracks: indexedTracks, items: indexedItems, focused: true)[0].items == indexedRows[0].items, "cached folders preserve child waveforms")
        check(rowCache.rows(tracks: indexedTracks, items: indexedItems, focused: false).allSatisfy { $0.items.isEmpty }, "changing focus clears cached waveforms")
        let revisedItems = [indexedItems[0].merging(["volumeRatio": 0.2])]
        check(rowCache.rows(tracks: indexedTracks, items: revisedItems, focused: true)[1].items == revisedItems, "cached waveforms refresh when item volume changes")
        check(rowCache.rows(tracks: Array(indexedTracks.reversed()), items: revisedItems, focused: true).map(\.track) == Array(indexedTracks.reversed()), "cache follows track reordering")
        check(rowCache.rows(tracks: [], items: [], focused: false).isEmpty, "cache clears when the project closes")
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

    @MainActor static func testLiveCursorDrag(project: HookProject, http: BridgeHTTP) async throws {
        let song: JSON = ["id": "a", "startPos": 10, "endPos": 100]
        let data: JSON = ["connected": true, "playing": false, "playingId": "", "playPosition": 10, "editCursorPosition": 10, "selectedPlaylistSongId": "a", "selectedRegionId": "", "regions": [song], "playlists": [["id": "list", "songs": [song]]]]
        MockBridge.reset(data); MockBridge.delay("edit_cursor_move")
        let session = HookSession(project: project, mode: .director, tablet: true, http: http)
        session.start()
        try await until { session.connected && session.authenticated }
        session.moveEditCursor(to: 20, song: song)
        try await until { MockBridge.sent.contains { $0["type"] == "edit_cursor_move" } }
        check(MockBridge.sent.first { $0["type"] == "edit_cursor_move" }?["payload"]["position"] == 20, "drag sends cursor to engine before finger-up")
        for point in 21...45 { session.moveEditCursor(to: Double(point), song: song) }
        check(session.snapshot["editCursorPosition"] == 45, "rapid drag tracks latest finger position locally")
        session.command("play_button")
        check(abs(session.playbackPosition(at: Date()) - 45) < 0.1, "PLAY uses final drag position while bridge is still processing")
        session.command("director_stop_break")
        for point in 60...70 { session.moveEditCursor(to: Double(point), song: song) }
        try await until { MockBridge.sent.contains { $0["type"] == "edit_cursor_move" && $0["payload"]["position"] == 70 } }
        let sent = MockBridge.sent
        let moves = sent.filter { $0["type"] == "edit_cursor_move" }
        check(moves.map { $0["payload"]["position"].int } == [20, 45, 70], "slow network coalesces obsolete drag samples without losing final positions")
        let finalBeforePlay = sent.firstIndex { $0["type"] == "edit_cursor_move" && $0["payload"]["position"] == 45 }!
        let play = sent.firstIndex { $0["type"] == "play_button" }!
        let stop = sent.firstIndex { $0["type"] == "director_stop_break" }!
        let laterDrag = sent.firstIndex { $0["type"] == "edit_cursor_move" && $0["payload"]["position"] == 70 }!
        check(finalBeforePlay < play && play < stop && stop < laterDrag, "new drag never erases or overtakes the cursor move needed by an earlier PLAY")
        check(moves.allSatisfy { $0["payload"]["noPlay"] == true && $0["payload"]["preservePlayback"] == true }, "both grids move only the edit cursor without starting playback")
        session.suspend(); MockBridge.delay("")
        print("VSHOOK_LIVE_CURSOR_OK: movement before release, slow-network coalescing and ordered final position before PLAY")
    }
    @MainActor static func testPlayFromCursor(project: HookProject, http: BridgeHTTP) async throws {
        let a: JSON = ["id": "a", "name": "A", "startPos": 10, "endPos": 100]
        let b: JSON = ["id": "b", "name": "B", "startPos": 100, "endPos": 160]
        let part: JSON = ["id": "m1", "name": "$REFRÃO", "position": 130]
        let base: JSON = ["connected": true, "playing": false, "playingId": "", "playPosition": 10, "editCursorPosition": 10, "selectedPlaylistSongId": "a", "selectedRegionId": "", "regions": [a, b], "playlists": [["id": "list", "songs": [a, b]]], "markers": [part]]
        for tablet in [false, true] {
            MockBridge.reset(base)
            let session = HookSession(project: project, mode: .director, tablet: tablet, http: http)
            session.start()
            try await until { session.connected && session.authenticated }
            session.command("edit_cursor_move", ["position": 42, "minPos": 10, "maxPos": 100])
            check(session.snapshot["editCursorPosition"] == 42, "cursor movement is immediate before bridge confirmation")
            session.command("play_button")
            check(abs(session.playbackPosition(at: Date()) - 42) < 0.1, "PLAY clock starts at the manually chosen cursor")
            try await until { MockBridge.sent.contains { $0["type"] == "play_button" } }
            let sent = MockBridge.sent
            check(sent.firstIndex(where: { $0["type"] == "edit_cursor_move" })! < sent.firstIndex(where: { $0["type"] == "play_button" })!, "cursor movement reaches the engine before PLAY")
            let play = sent.first { $0["type"] == "play_button" }!["payload"]
            check(play["noSeek"] == true && play["targetId"] == "a", "PLAY preserves edit cursor while retaining song metadata for tuner and AUTO")
            MockBridge.state(base.merging(["tick": 1]))
            try await until { session.snapshot["tick"] == 1 }
            check(session.playbackPosition(at: Date()) >= 42 && session.snapshot["editCursorPosition"] == 42, "old bridge cursor cannot rewind a rapid local PLAY")
            session.suspend()

            MockBridge.reset(base)
            let parts = HookSession(project: project, mode: .director, tablet: tablet, http: http)
            parts.start()
            try await until { parts.connected && parts.authenticated }
            parts.selectPart(part, song: b)
            check(parts.snapshot["editCursorPosition"] == 130, "stopped PARTS selection prepares its position locally")
            parts.command("play_button")
            check(parts.playingID == "b" && abs(parts.playbackPosition(at: Date()) - 130) < 0.1, "PLAY starts from selected PART rather than region start")
            try await until { MockBridge.sent.contains { $0["type"] == "play_button" } }
            let partCommands = MockBridge.sent
            check(partCommands.firstIndex(where: { $0["type"] == "marker_go" })! < partCommands.firstIndex(where: { $0["type"] == "play_button" })!, "PARTS seek is ordered before PLAY")
            check(partCommands.first { $0["type"] == "play_button" }?["payload"]["noSeek"] == true, "PARTS PLAY does not send a region-start seek")
            parts.suspend()
        }
        let projection = HookSession(project: project, mode: .director, tablet: false, http: http)
        projection.snapshot = base.merging(["editCursorPosition": 42])
        let select = projection.localCommandState("select_playlist_song", payload: projection.targetPayload(b))
        projection.snapshot = projection.snapshot.merging(select.state).merging(["selectedPlaylistSongId": "b"])
        check(projection.localCommandState("play_button", payload: [:]).position == 100, "selecting a different song replaces old cursor with its start")
        projection.snapshot = base.merging(["editCursorPosition": 130, "selectedPlaylistSongId": "a"])
        let next = projection.localCommandState("play_button", payload: [:])
        check(next.position == 10 && next.payload["noSeek"] != true, "cursor outside prepared song cannot steal the next PLAY target")
        projection.snapshot = base.merging(["editCursorPosition": 42])
        check(projection.localCommandState("play_start", payload: projection.targetPayload(a)).position == 10, "explicit play-from-start commands retain their meaning")
        print("VSHOOK_CURSOR_PLAY_OK: phone/tablet cursor, PARTS, ordered commands, stale polls and new selection")
    }
    @MainActor static func testFadeoutFeedback(project: HookProject, http: BridgeHTTP) async throws {
        let track: JSON = ["id": "track", "guid": "track-guid", "volume": 1, "volumeRatio": 0.76]
        var data: JSON = ["connected": true, "playing": true, "playingId": "a", "playPosition": 20, "regions": [["id": "a", "startPos": 10, "endPos": 100]], "manualStopFadeout": ["enabled": true, "durationSec": 3, "selectedCount": 1, "selectedTrackIds": ["track-guid"], "active": false, "progress": 0], "mixerTracks": [track]]
        MockBridge.reset(data)
        let session = HookSession(project: project, mode: .director, tablet: false, http: http)
        session.start()
        try await until { session.connected && session.authenticated }
        check(session.fadeoutConfigured && session.snapshot["manualStopFadeoutDurationSec"] == 3, "nested bridge fade configuration normalizes into native settings")
        session.command("play_button")
        let start = Date()
        check(session.fadeoutActive && session.playing && session.playingID == "a", "STOP begins fade locally while keeping song playing")
        check(session.fadeoutClock.remaining(at: start) > 0.95, "popup and button regression begin immediately")
        check(abs(session.fadeoutClock.remaining(at: start.addingTimeInterval(1.5)) - 0.5) < 0.03, "fade countdown advances without bridge polls")
        let half = session.fadeoutClock.trackRatio(track, at: start.addingTimeInterval(1.5))!
        check(abs(MixerScale.decibels(half) - 20 * log10(0.5)) < 0.2, "TCP fader follows engine linear gain on logarithmic slider")
        check(session.fadeoutClock.trackRatio(["id": "unselected"], at: start) == nil, "unselected tracks do not move")
        data["tick"] = 1; MockBridge.state(data)
        try await until { session.snapshot["tick"] == 1 }
        check(session.fadeoutActive && session.playing, "stale bridge cannot remove newly started fade")
        data["manualStopFadeout"]["active"] = true
        data["manualStopFadeout"]["progress"] = 0.01
        data["tick"] = 2; MockBridge.state(data)
        try await until { session.snapshot["tick"] == 2 }
        check(abs(session.fadeoutClock.remaining(at: start.addingTimeInterval(1.5)) - 0.5) < 0.03, "bridge progress never rewinds local fade")
        session.command("play_button")
        check(!session.fadeoutActive && session.playing, "second STOP cancels fade locally without stopping playback")
        try await until { MockBridge.sent.filter { $0["type"] == "play_button" }.count == 2 }
        check(MockBridge.sent.filter { $0["type"] == "play_button" }.allSatisfy { $0["payload"]["desiredPlaying"] == false }, "cancel uses engine STOP-fade toggle protocol")
        session.command("play_button")
        check(session.fadeoutActive, "fade can restart locally after cancellation")
        session.command("director_stop_break", ["ignoreFadeout": true, "stopBreak": true])
        check(!session.fadeoutActive && !session.playing, "STOP BREAK interrupts fade and transport immediately")
        session.suspend()

        data["manualStopFadeout"]["active"] = false
        MockBridge.reset(data); MockBridge.reject("play_button")
        let rejected = HookSession(project: project, mode: .director, tablet: true, http: http)
        rejected.start()
        try await until { rejected.connected && rejected.authenticated }
        rejected.command("play_button")
        check(rejected.fadeoutActive, "fade feedback is immediate even before rejection arrives")
        try await until { rejected.message == "fixture rejection" }
        check(!rejected.fadeoutActive && rejected.playing, "failed STOP restores playback and removes fade feedback")
        data["manualStopFadeout"]["active"] = true; data["tick"] = 3; MockBridge.state(data)
        try await until { rejected.fadeoutActive }
        data["manualStopFadeout"]["active"] = false; data["playing"] = false; data["playingId"] = ""; data["tick"] = 4; MockBridge.state(data)
        try await until { rejected.snapshot["tick"] == 4 }
        check(!rejected.fadeoutActive && !rejected.playing, "confirmed fade completion clears popup, regression and transport")
        rejected.suspend(); MockBridge.reject("")
        var clock = DirectorFadeoutClock()
        let epoch = Date(timeIntervalSinceReferenceDate: 1000)
        let middle: JSON = ["manualStopFadeoutActive": true, "manualStopFadeoutDurationSec": 4, "manualStopFadeoutTrackIds": ["track-guid"], "manualStopFadeout": ["progress": 0.5], "mixerTracks": [["guid": "track-guid", "volume": 0.5]]]
        clock.update(middle, at: epoch)
        check(clock.remaining(at: epoch) == 0.5 && clock.remaining(at: epoch.addingTimeInterval(2)) == 0, "joining an active fade begins at remote progress and ends locally")
        check(abs(MixerScale.decibels(clock.trackRatio(track, at: epoch.addingTimeInterval(1))!) - 20 * log10(0.25)) < 0.001, "mid-fade attachment reconstructs original gain")
        clock.update(["manualStopFadeoutActive": false], at: epoch.addingTimeInterval(2))
        check(clock.trackRatio(track, at: epoch.addingTimeInterval(3)) == nil, "completed fade releases faders back to confirmed mixer values")
        print("VSHOOK_FADEOUT_OK: immediate start, countdown, stale polls, cancel, STOP BREAK and smooth selected faders")
    }
    static func testContinuousClock() {
        let epoch = Date(timeIntervalSinceReferenceDate: 1000)
        var clock = DirectorPlaybackClock()
        var data: JSON = ["playing": true, "playingId": "a", "playPosition": 10]
        clock.update(data, at: epoch)
        var previous = 10.0
        for step in 1...80 {
            let elapsed = Double(step) * 0.3
            // Alternating bridge latency must never move the visual backwards.
            data["playPosition"] = .number(10 + elapsed - (step % 2 == 0 ? 0.45 : 0.05))
            clock.update(data, at: epoch.addingTimeInterval(elapsed))
            let position = clock.position(at: epoch.addingTimeInterval(elapsed), fallback: data)
            check(position >= previous && abs(position - (10 + elapsed)) < 0.00001, "local clock ignores jitter in bridge refreshes")
            previous = position
        }
        check(clock.position(at: epoch.addingTimeInterval(30), fallback: data) == 40, "clock continues locally between polls")
        data["playPosition"] = 5
        clock.update(data, at: epoch.addingTimeInterval(31))
        check(clock.position(at: epoch.addingTimeInterval(32), fallback: data) == 6, "a real PARTS seek reanchors the local clock")
        data = data.merging(["playing": false, "playPosition": 6])
        clock.update(data, at: epoch.addingTimeInterval(32))
        check(clock.position(at: epoch.addingTimeInterval(40), fallback: data) == 6, "paused song time does not keep counting")
        data = data.merging(["playing": true, "playPosition": 19, "loopEnabled": true, "loopStartPos": 10, "loopEndPos": 20])
        clock.update(data, at: epoch.addingTimeInterval(40))
        check(clock.position(at: epoch.addingTimeInterval(42), fallback: data) == 11, "loop wraps on the local clock without waiting for bridge")
        let marked: JSON = ["liveEnabled": true, "liveMarkColorMode": "red", "regions": [["id": "a", "liveMarked": true], ["id": "b", "liveMarked": false]], "playlists": [["songs": [["id": "b", "liveMarked": true]]]]]
        check(DirectorLiveMarks.ids(marked) == ["a"], "LIVE honors canonical region marks and clears stale playlist marks")
        check(DirectorLiveMarks.colors(marked).background == "991B1B", "LIVE uses original red background")
        print("VSHOOK_LOCAL_CLOCK_OK: jitter, seek, pause, local loop and LIVE marks")
    }
    @MainActor static func testAutoBlockFeedback(project: HookProject, http: BridgeHTTP) async throws {
        let a: JSON = ["id": "a", "startPos": 10, "endPos": 100]
        let b: JSON = ["id": "b", "startPos": 100, "endPos": 160]
        let block: JSON = ["id": "block", "isBlock": true, "name": "BLOCO"]
        var data: JSON = ["connected": true, "playing": true, "playingId": "a", "playPosition": 20, "queuedSongId": "", "queuedManual": false, "autoBlocoArmed": false, "regions": [a, b], "playlists": [["id": "list", "songs": [a, block, b]]]]
        MockBridge.reset(data)
        let session = HookSession(project: project, mode: .director, tablet: false, http: http)
        session.start()
        try await until { session.connected && session.authenticated }
        session.toggleAuto(1)
        check(session.autoEnabled(1) && session.queueID == "b", "AUTO1 queues next song synchronously")
        session.toggleAuto(2)
        check(session.autoEnabled(2) && !session.autoEnabled(1) && session.queueID == "b", "AUTO2 switches local queue mode before bridge confirms")
        session.toggleAutoBlock()
        check(session.autoBlockEnabled && session.queueID.isEmpty && session.rawQueueID == "b", "AT/BL immediately hides boundary queue without losing target")
        data["testTick"] = 1; MockBridge.state(data)
        try await until { session.snapshot["testTick"] == 1 }
        check(session.autoBlockEnabled && session.queueID.isEmpty, "stale bridge cannot undo local AT/BL or queue")
        session.toggleAutoBlock()
        check(!session.autoBlockEnabled && session.queueID == "b", "disabling AT/BL immediately restores boundary queue")
        session.toggleAuto(2)
        check(!session.autoEnabled(2) && session.queueID.isEmpty, "disabling AUTO clears automatic queue locally")
        session.select(b, queue: true)
        session.toggleAuto(1); session.toggleAuto(1)
        check(session.queueID == "b" && session.snapshot["queuedManual"].bool, "AUTO toggles preserve manual queue")
        try await until { MockBridge.sent.filter { $0["type"] == "auto_bloco_set" }.count == 2 }
        session.suspend()
        data = data.merging(["playing": false, "playingId": "", "selectedPlaylistSongId": "a", "autoplay1Enabled": true, "autoplay2Enabled": false])
        MockBridge.reset(data)
        let stopped = HookSession(project: project, mode: .director, tablet: true, http: http)
        stopped.start()
        try await until { stopped.connected && stopped.authenticated }
        stopped.command("play_button")
        check(stopped.playingID == "a" && stopped.queueID == "b", "PLAY prepares AUTO queue locally before bridge responds")
        stopped.suspend()
        let boundary = HookSession(project: project, mode: .director, tablet: false, http: http)
        let c: JSON = ["id": "c", "startPos": 160, "endPos": 200]
        boundary.snapshot = ["playing": true, "playingId": "a", "autoBlocoEnabled": true, "queuedSongId": "c", "regions": [a, b, c], "playlists": [["songs": [a, b, block, c]]]]
        check(boundary.queueID.isEmpty, "AT/BL hides next block target even with more songs in current block")
        boundary.snapshot["queuedSongId"] = "b"
        check(boundary.queueID == "b", "AT/BL keeps a queue inside the current block visible")
        print("VSHOOK_LOCAL_AUTO_ATBL_OK: immediate queue, modes, block boundary, stale polls, manual queue and PLAY")
    }
    @MainActor static func testImmediateFeedback(project: HookProject, http: BridgeHTTP) async throws {
        let a: JSON = ["id": "a", "name": "A", "startPos": 10, "endPos": 100]
        let b: JSON = ["id": "b", "name": "B", "startPos": 100, "endPos": 160]
        var data: JSON = ["connected": true, "playing": false, "transportPaused": false, "playingSongId": .null, "queuedSongId": .null, "selectedPlaylistSongId": "a", "selectedRegionId": .null, "playPosition": 10, "regions": [a, b], "playlists": [["id": "list", "songs": [a, b]]], "markers": [["id": "m1", "name": "$REFRÃO", "pos": 40], ["id": "m2", "name": "*1 PONTE", "pos": 70]], "armedMarkerId": .null, "selectedMarkerId": .null]
        MockBridge.reset(data)
        let session = HookSession(project: project, mode: .director, tablet: false, http: http)
        session.start()
        try await until { session.connected && session.authenticated }
        session.command("play_button")
        check(session.playing && session.playingID == "a", "PLAY and the playing song update before the request completes")
        try await until { MockBridge.sent.contains { $0["type"] == "play_button" } }
        check(MockBridge.sent.first { $0["type"] == "play_button" }?["payload"]["desiredPlaying"] == true, "PLAY transmits the explicit local intent")
        data["testTick"] = 1; MockBridge.state(data)
        try await until { session.snapshot["testTick"] == 1 }
        check(session.playing && session.playingID == "a" && session.playbackPosition(at: Date()) > 10, "stale bridge polls cannot undo local play or reset its progress")
        session.select(b, queue: true)
        check(session.queueID == "b", "queued stripe updates synchronously")
        session.command("director_stop_break")
        check(!session.playing && session.playingID.isEmpty && session.queueID.isEmpty && session.selectedID == "b", "STOP immediately prepares the queued song and clears playback/queue highlights")
        session.command("play_button")
        check(session.playing && session.playingID == "b", "rapid PLAY uses the newly prepared local selection")
        try await until { MockBridge.sent.filter { $0["type"] == "play_button" }.count == 2 }
        data = data.merging(["playing": true, "playingSongId": "b", "selectedPlaylistSongId": "b", "playPosition": 110, "testTick": 2])
        MockBridge.state(data)
        try await until { session.snapshot["testTick"] == 2 }
        data["playing"] = false; data["playingSongId"] = .null; data["testTick"] = 3
        MockBridge.state(data)
        try await until { session.snapshot["testTick"] == 3 }
        check(!session.playing, "after confirmation, remote transport changes remain authoritative")
        MockBridge.reject("play_button"); MockBridge.delay("play_button")
        session.command("play_button")
        check(session.playing, "failed PLAY is still optimistic until the response arrives")
        try await until { session.message == "fixture rejection" }
        check(!session.playing, "rejected PLAY restores confirmed transport")
        session.command("play_button")
        session.command("director_stop_break")
        session.command("play_start", session.targetPayload(b))
        try await Task.sleep(nanoseconds: 250_000_000)
        check(session.playing && session.playingID == "b", "an older failed PLAY cannot roll back a newer PLAY with the same value")
        MockBridge.reject(""); MockBridge.delay("")
        data = data.merging(["playing": true, "playingSongId": "b", "selectedPlaylistSongId": "b", "playPosition": 120, "testTick": 4])
        MockBridge.state(data)
        try await until { session.snapshot["testTick"] == 4 }
        let start = DirectorParts.markers(data, song: b)[0]
        check(start.identifier == "start:b" && start["position"] == 100, "INÍCIO uses the native extension's virtual marker protocol")
        session.selectPart(start, song: b)
        check(session.snapshot["selectedMarkerId"] == "start:b" && session.snapshot["partsArmedMarkerId"].string.isEmpty, "first PART tap selects locally")
        session.selectPart(start, song: b)
        check(session.snapshot["partsArmedMarkerId"] == "start:b", "second PART tap arms locally")
        try await until { MockBridge.sent.contains { $0["type"] == "marker_go" } }
        let markerCommand = MockBridge.sent.first { $0["type"] == "marker_go" }!["payload"]
        check(markerCommand["markerId"] == "start:b" && markerCommand["position"] == 100 && markerCommand["armed"] == true, "INÍCIO sends a real virtual start target")
        data["playPosition"] = 100.1; data["armedMarkerId"] = "start:b"; data["selectedMarkerId"] = "start:b"; data["testTick"] = 5
        MockBridge.state(data)
        try await until { session.snapshot["testTick"] == 5 }
        check(session.snapshot["partsArmedMarkerId"].string.isEmpty, "arrival clears the armed effect even when the bridge still repeats the old armed ID")
        check(session.snapshot["selectedMarkerId"].string.isEmpty, "arrival also clears the yellow PART selection")
        data["playPosition"] = 100.5; data["testTick"] = 6; MockBridge.state(data)
        try await until { session.snapshot["testTick"] == 6 }
        check(session.snapshot["partsArmedMarkerId"].string.isEmpty, "a repeated consumed marker cannot re-arm the visual")
        check(abs(DirectorParts.remainingFraction(data, song: a, position: 55) - 0.5) < 0.0001, "PART countdown uses the current segment between markers")
        check(DirectorParts.remainingFraction(data, song: a, position: 100) == 0, "PART countdown ends at the song boundary")
        session.toggleLoop()
        data["loopActive"] = true; data["loopStartPos"] = 100; data["loopEndPos"] = 130; data["testTick"] = 7
        MockBridge.state(data)
        try await until { session.snapshot["testTick"] == 7 }
        check(session.snapshot["loopEnabled"].bool, "native loopActive confirms the app's canonical loop state")
        data["loopActive"] = false; data["testTick"] = 8; MockBridge.state(data)
        try await until { session.snapshot["testTick"] == 8 }
        check(!session.snapshot["loopEnabled"].bool, "remote loop changes cannot be masked by an old local loopEnabled value")
        session.suspend()
        print("VSHOOK_LOCAL_FEEDBACK_OK: transport, queue, stale polls, rapid commands, rejection and PARTS arrival")
    }
}
