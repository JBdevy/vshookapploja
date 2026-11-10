import SwiftUI
import UIKit
import Combine

enum JarasTheme { static let panel = Color.gray, green = Color.green, liveOffRed = Color.red, secondary = Color.gray, text = Color.white }
@main struct FixtureApp: App {
    @UIApplicationDelegateAdaptor(JarasMobileApplicationDelegate.self) private var delegate
    var body: some Scene {
        WindowGroup("Main", id: "main") { IpadMainWindowRoot { FixtureRoot() } }
        WindowGroup("Video", id: IpadVideoPresentation.windowID) { IpadDetachedVideoScene() }
    }
}
@MainActor private enum WorkspaceProbe { static var starts = 0 }
struct FixtureRoot: View {
    @Environment(\.openWindow) private var openWindow
    @ObservedObject private var state = IpadVideoPresentation.shared
    @State private var ran = false
    var body: some View {
        VStack {
            Text("Video presentation fixture")
            if state.embedded { IpadEmbeddedVideoPanel() }
        }.task {
            guard !ran else { return }; ran = true
            WorkspaceProbe.starts += 1
            precondition(WorkspaceProbe.starts == 1, "A second main scene must not duplicate the workspace/audio engine")
            precondition(!state.visible && !state.detached && !state.embedded)
            VideoPlayback.shared.setVisible(true)
            precondition(state.embedded)
            for _ in 0..<3 {
                try? await Task.sleep(nanoseconds: 300_000_000)
                if state.canDetach {
                    state.detach { openWindow(id: IpadVideoPresentation.windowID) }
                    for _ in 0..<80 {
                        if state.detached { break }
                        try? await Task.sleep(nanoseconds: 100_000_000)
                    }
                    precondition(state.detached && !state.embedded, "UIKit must create a separate scene")
                    state.dock()
                    precondition(!state.detached && state.embedded, "Docking must restore the embedded view without closing video")
                } else {
                    var called = false
                    state.detach { called = true }
                    precondition(!called && !state.detached && state.embedded)
                }
                try? await Task.sleep(nanoseconds: 700_000_000)
            }
            openWindow(id: "main")
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            precondition(WorkspaceProbe.starts == 1, "Only the original workspace may mount after New Window")
            VideoPlayback.shared.setVisible(false)
            precondition(!state.visible && !state.embedded && !state.detached)
            print("IPAD_VIDEO_EMBEDDED_DEFAULT_REAL_SCENE_DETACH_DOCK_CLOSE_OK canDetach=\(state.canDetach)")
            fflush(stdout); exit(0)
        }
    }
}
