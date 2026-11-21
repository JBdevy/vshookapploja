import AppKit
import SwiftUI

private enum JarasTheme { static let green = Color(red: 105 / 255, green: 237 / 255, blue: 145 / 255) }
private func require(_ value: @autoclosure () -> Bool, _ message: String) { if !value() { fatalError(message) } }
private func projectState() -> DAWRemoteState {
    DAWRemoteState(project: UUID(), projectName: "Drawer", song: nil, songName: "", songs: [], tracks: [], regions: [], timelineRegions: [],
        currentRegion: nil, queuedRegion: nil, focusedRegion: nil, position: 0, duration: 180, bpm: 120,
        playing: false, paused: false, subPlaying: false, loop: false, masterVolume: 1, masterMute: false,
        masterSolo: false, masterMono: false, pendingSave: false, saving: false, message: "")
}
let parent = UUID(), other = UUID(), copy = UUID(), child1 = UUID(), child2 = UUID(), child3 = UUID()
var state = projectState()
state.regions = [.init(id: parent, name: "Gaveta", start: 0, end: 120, color: 0x777777),
                 .init(id: copy, name: "Cópia", start: 0, end: 120, color: 0x777777, sourceRegionId: parent),
                 .init(id: other, name: "Outra", start: 120, end: 180, color: 0x777777)]
state.timelineRegions = state.regions + [
    .init(id: child1, name: "Voz", start: 0, end: 40, color: 0x777777, parentRegion: parent),
    .init(id: child2, name: "Intro", start: 40, end: 80, color: 0x777777, parentRegion: parent),
    .init(id: child3, name: "Voz final", start: 80, end: 120, color: 0x777777, parentRegion: parent)]
let cache = DAWRemoteSetlistRowsCache()
func rows(_ entries: [DAWRemoteSetlistPresentation.Entry]) -> [DAWRemoteSetlistPresentation.Row] {
    entries.compactMap { if case .region(let row) = $0 { return row }; return nil }
}
let expanded = rows(cache.entries(in: state, expanded: [parent], query: ""))
require(expanded.filter(\.child).map(\.drawerContinues) == [true, true, false], "Only final visible child closes the branch")
require(expanded.filter { !$0.child }.allSatisfy { !$0.drawerContinues }, "Parent, normal song and playlist duplicate have no drawer rail")
require(expanded.map(\.number) == [1, nil, nil, nil, 2, 3], "Guide metadata never changes numbering")
let filtered = rows(cache.entries(in: state, expanded: [parent], query: "Voz"))
require(filtered.map(\.id) == [child1, child3] && filtered.map(\.drawerContinues) == [true, false], "Search joins only visible siblings and ends at last visible one")
let single = rows(cache.entries(in: state, expanded: [parent], query: "Intro"))
require(single.count == 1 && single[0].child && !single[0].drawerContinues, "Single matching child has only terminal branch")
require(rows(cache.entries(in: state, expanded: [], query: "")).allSatisfy { !$0.child && !$0.drawerContinues }, "Collapsed drawers never leave rails behind")
state.setlistBlocks = [.init(id: UUID(), name: "Bloco 02", color: 0xffaa00, beforeRegion: other)]
let blocked = cache.entries(in: state, expanded: [parent], query: "")
require(rows(blocked).filter(\.child).map(\.drawerContinues) == [true, true, false], "Block after drawer does not extend the rail")
var mixed = expanded.filter(\.child)
mixed[1].region.parentRegion = other
let mixedEntries = DAWRemoteSetlistPresentation.entries(rows: mixed, blocks: [], query: "")
require(rows(mixedEntries).allSatisfy { !$0.drawerContinues }, "Different parents must not be joined")
let before = cache.rebuildCount
_ = cache.entries(in: state, expanded: [parent], query: "")
require(cache.rebuildCount == before, "Guide layout shares the retained list cache")

private struct DrawerVisualFixture: View {
    let spacing: CGFloat
    let scale: CGFloat
    var body: some View {
        VStack(spacing: spacing) {
            row("Região especial", child: false, continues: false)
            row("Música filha 1", child: true, continues: true)
            row("Música filha 2", child: true, continues: false)
            row("Outra música", child: false, continues: false)
        }.frame(width: 260).background(Color.black)
    }
    private func row(_ title: String, child: Bool, continues: Bool) -> some View {
        Text(title).font(.system(size: 13 * scale)).foregroundStyle(Color.white)
            .frame(maxWidth: .infinity, alignment: .leading).frame(height: 38 * scale)
            .background(Color(white: 0.16))
            .modifier(RemoteSetlistDrawerGuide(child: child, continues: continues, spacing: spacing))
    }
}
MainActor.assumeIsolated {
    let destination = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "/private/tmp/catlive-drawer-guide.png"
    for (index, config) in [(CGFloat(4), CGFloat(1)), (CGFloat(5), CGFloat(2))].enumerated() {
        let (gap, scale) = config
        let renderer = ImageRenderer(content: DrawerVisualFixture(spacing: gap, scale: scale))
        renderer.scale = 2
        guard let image = renderer.cgImage else { fatalError("Render failed") }
        let bitmap = NSBitmapImageRep(cgImage: image)
        func green(_ x: CGFloat, _ y: CGFloat) -> Bool {
            guard let color = bitmap.colorAt(x: Int(x * 2), y: Int(y * 2))?.usingColorSpace(.deviceRGB) else { return false }
            return color.greenComponent > color.redComponent + 0.12 && color.greenComponent > color.blueComponent + 0.12
        }
        let h = 38 * scale, first = h + gap, second = 2 * (h + gap)
        require(green(5, first + 3), "First child has vertical guide")
        require(green(5, first + h + gap / 2), "Guide remains continuous across row spacing")
        require(green(10, first + h / 2), "First child has horizontal branch")
        require(green(10, second + h / 2), "Last child has horizontal branch")
        require(!green(5, second + h - 3), "Last child guide stops at its branch")
        require(!green(5, h / 2), "Parent does not acquire a guide")
        require(!green(5, 3 * (h + gap) + h / 2), "Following unrelated row has no guide")
        if index == 0, let png = bitmap.representation(using: .png, properties: [:]) {
            try! png.write(to: URL(fileURLWithPath: destination))
        }
    }
}
print("SETLIST_DRAWER_GUIDE_NATIVE_REMOTE_OBSERVER_SEARCH_CONTINUITY_NUMBERING_AND_DUPLICATE_ISOLATION_OK")
