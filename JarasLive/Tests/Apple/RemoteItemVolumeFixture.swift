import SwiftUI
import UIKit

// The fixture hosts the production UIKit presenter in the same stable parent
// arrangement used by RemoteNativeTimeline, while the grid cell stays cached.
enum DAWRemoteState {
    struct Clip: Identifiable { var id = UUID(); var gain = 1.0; var muted = false }
}
struct RemoteItemEditorOverlay: View {
    let clip: DAWRemoteState.Clip
    let color: UInt32
    let setGain: (Double) -> Void
    let mute: () -> Void
    let close: () -> Void
    var body: some View { Color.black.opacity(0.18) }
}
@MainActor final class VolumeFixture: ObservableObject {
    @Published var clip = DAWRemoteState.Clip()
    @Published var selected = false
    @Published var exists = true
}
struct CachedItem: View, Equatable {
    let open: () -> Void
    static func == (lhs: Self, rhs: Self) -> Bool { true }
    var body: some View { Color.blue.frame(width: 200, height: 80).onLongPressGesture(perform: open) }
}
struct FixtureView: View {
    @ObservedObject var fixture: VolumeFixture
    var body: some View {
        CachedItem(open: { fixture.selected = true }).equatable()
            .background {
                RemoteItemEditorPresentation(clip: fixture.selected && fixture.exists ? fixture.clip : nil, color: 0,
                    setGain: { fixture.clip.gain = $0 }, mute: { fixture.clip.muted.toggle() },
                    close: { fixture.selected = false }).frame(width: 0, height: 0)
            }
    }
}
@main final class App: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let fixture = VolumeFixture(), host = UIHostingController(rootView: FixtureView(fixture: fixture))
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = host; window.makeKeyAndVisible(); self.window = window
        Task { @MainActor in
            func settle() async { try? await Task.sleep(nanoseconds: 250_000_000) }
            func check(_ value: Bool, _ message: String) throws {
                if !value { throw NSError(domain: message, code: 1) }
            }
            func presenter(_ controller: UIViewController) -> RemoteItemEditorPresentation.Presenter? {
                if let found = controller as? RemoteItemEditorPresentation.Presenter { return found }
                return controller.children.lazy.compactMap { presenter($0) }.first
            }
            var result: String
            do {
                await settle()
                guard let owner = presenter(host) else { throw NSError(domain: "Missing presenter", code: 1) }
                // Opening does not require a gain/mute packet or a grid redraw.
                fixture.selected = true; await settle()
                guard let editor = owner.editor else { throw NSError(domain: "Long press did not present immediately", code: 1) }
                try check(editor.view.window != nil, "Editor is not visible")
                for gain in [0.5, 0, 2, 1] {
                    editor.rootView.setGain(gain); await settle()
                    try check(owner.editor === editor && editor.view.window != nil, "Gain dismissed/recreated editor")
                    try check(editor.rootView.clip.gain == gain, "Host gain not refreshed")
                }
                editor.rootView.mute(); await settle()
                try check(owner.editor === editor && editor.rootView.clip.muted, "Mute dismissed/staled editor")
                editor.rootView.close(); await settle()
                try check(owner.editor == nil, "Close failed")
                fixture.selected = true; await settle()
                try check(owner.editor?.view.window != nil, "Reopening failed")
                fixture.exists = false; await settle()
                try check(owner.editor == nil, "Deleted item retained inspector")
                result = "REMOTE_ITEM_VOLUME_PRESENT_UPDATE_CLOSE_REOPEN_DELETE_OK"
            } catch { result = "FAILED: \(error)" }
            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("result.txt")
            try! result.write(to: url, atomically: true, encoding: .utf8)
        }
        return true
    }
}
