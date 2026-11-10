import Foundation

@MainActor private final class RemoteMIDIActions {
    static let shared = RemoteMIDIActions()
    var isLearning = false
}
@MainActor private final class NavigationProbe {
    struct Session { var connected = true; var remoteState: DAWRemoteState? }
    struct Scrolling { enum Scope { case tracks, setlist }; var selectionScope = Scope.tracks }
    var state: DAWRemoteState { didSet { remote.remoteState = state } }
    var remote: Session
    var local = false, observer = false, controlsEnabled = true, phoneLayout = true
    var sectionsInList = false, sectionsOpen = false, searchFocused = false
    var phonePanel = DAWRemotePhonePanel.setlist
    var trackScrolling = Scrolling()
    var setlistRowsCache = DAWRemoteSetlistRowsCache()
    var search = ""
    var expandedRegions = Set<UUID>()
    var selectedSetlistEntries = Set<UUID>()
    var setlistSelectionAnchor: UUID?
    var remoteMIDISetlistID: UUID?, remoteMIDIPlaylistID: UUID?, remoteMIDIPartID: UUID?
    var setlistBrowsing = false
    var remoteNavigationTask: Task<Void, Never>?
    var commands: [(DAWRemoteCommand.Action, UUID?)] = []
    init(_ state: DAWRemoteState) { self.state = state; remote = Session(remoteState: state) }
    func action(_ action: DAWRemoteCommand.Action, target: UUID? = nil) { commands.append((action, target)) }
    func choosePhonePanel(_ panel: DAWRemotePhonePanel) { phonePanel = panel }
    // PRODUCTION_HANDLERS
}

@main struct MobileSetlistNavigationTests {
    @MainActor static func main() async throws {
        let a = UUID(), b = UUID(), c = UUID(), child = UUID(), project = UUID(), song = UUID()
        let roots: [DAWRemoteState.Region] = [
            .init(id: a, name: "First", start: 0, end: 10, color: 0),
            .init(id: b, name: "Drawer", start: 10, end: 30, color: 0),
            .init(id: c, name: "Last", start: 30, end: 40, color: 0)]
        var state = DAWRemoteState(project: project, projectName: "Test", song: song, songName: "Test",
            songs: [.init(id: song, name: "Test")], tracks: [], regions: roots,
            timelineRegions: roots + [.init(id: child, name: "Child", start: 12, end: 18, color: 0, parentRegion: b)],
            currentRegion: a, queuedRegion: b, focusedRegion: a, position: 0, duration: 40, bpm: 120,
            playing: true, paused: false, subPlaying: false, loop: false,
            masterVolume: 1, masterMute: false, masterSolo: false, masterMono: false,
            pendingSave: false, saving: false, message: "")
        let probe = NavigationProbe(state)
        func key(_ code: UInt16, _ phase: HardwareKeyboardEvent.Phase = .down, repeatKey: Bool = false,
                 flags: HardwareKeyboardModifiers = []) -> HardwareKeyboardEvent {
            HardwareKeyboardEvent(keyCode: code, modifiers: flags, characters: "", isRepeat: repeatKey, phase: phase)
        }
        probe.performRemoteMIDI(.setlistDown); probe.performRemoteMIDI(.setlistDown)
        precondition(probe.setlistSelectionAnchor == c && probe.setlistBrowsing)
        for n in 1...10 { state.position = Double(n) / 10; probe.state = state }
        try await Task.sleep(nanoseconds: 250_000_000)
        precondition(probe.commands.isEmpty && probe.state.queuedRegion == b && probe.setlistSelectionAnchor == c,
                     "Playback packets cannot erase browsing or turn it into queue selection")
        precondition(probe.handleRemoteKey(key(36)))
        precondition(probe.handleRemoteKey(key(36, repeatKey: true)))
        precondition(probe.commands.count == 1 && probe.commands[0].0 == .selectRegion && probe.commands[0].1 == c)

        probe.commands = []; probe.resetSetlistBrowsing(); probe.expandedRegions = [b]
        probe.performRemoteMIDI(.setlistDown); probe.performRemoteMIDI(.setlistDown)
        precondition(probe.setlistSelectionAnchor == child, "MIDI must visit visible drawer children")
        probe.expandedRegions = []; probe.performRemoteMIDI(.setlistDown)
        precondition(probe.setlistSelectionAnchor == c, "Collapsed child anchors on its visible parent")
        probe.resetSetlistBrowsing(); probe.search = "Last"; probe.performRemoteMIDI(.setlistDown)
        precondition(probe.setlistSelectionAnchor == c, "MIDI must respect filtering")

        probe.resetSetlistBrowsing(); probe.search = ""; probe.state.playing = false
        precondition(probe.handleRemoteKey(key(125)))
        try await Task.sleep(nanoseconds: 300_000_000)
        precondition(probe.commands.isEmpty, "Holding an arrow must not commit before release")
        precondition(probe.handleRemoteKey(key(125, repeatKey: true)))
        precondition(probe.handleRemoteKey(key(125, .up)))
        try await Task.sleep(nanoseconds: 300_000_000)
        precondition(probe.commands.count == 1 && probe.commands[0].1 == c)

        probe.commands = []; probe.resetSetlistBrowsing(); probe.performRemoteMIDI(.setlistDown)
        probe.state.playing = true
        try await Task.sleep(nanoseconds: 300_000_000)
        precondition(probe.commands.isEmpty, "Starting playback cancels a pending stopped selection")
        probe.state.playing = false; probe.performRemoteMIDI(.setlistDown); probe.state.project = UUID()
        try await Task.sleep(nanoseconds: 300_000_000)
        precondition(probe.commands.isEmpty, "A delayed selection must not affect another project")

        probe.state.playing = true
        probe.performRemoteMIDI(.playStop); probe.performRemoteMIDI(.subPlayStop)
        probe.state.subPlaying = true; probe.performRemoteMIDI(.subPlayStop)
        precondition(probe.commands.map(\.0) == [.stop, .subPlay, .subStop])
        probe.commands = []; probe.state.playing = false; probe.performRemoteMIDI(.subPlayStop)
        precondition(probe.commands.isEmpty, "Subplay requires running transport")
        probe.performRemoteMIDI(.playStop); precondition(probe.commands.last?.0 == .play)
        probe.commands = []; probe.performRemoteMIDI(.togglePreview)
        precondition(probe.commands.isEmpty, "Hosts without Preview cannot receive the action")
        probe.state.previewActive = false; probe.performRemoteMIDI(.togglePreview)
        precondition(probe.commands.count == 1 && probe.commands[0].0 == .togglePreview)
        probe.commands = []; probe.observer = true; probe.performRemoteMIDI(.setlistDown)
        precondition(!probe.handleRemoteKey(key(36)) && probe.commands.isEmpty)
        print("MOBILE_SETLIST_MIDI_KEYBOARD_PLAYBACK_QUEUE_HOLD_DRAWERS_AND_TRANSPORT_OK")
    }
}
