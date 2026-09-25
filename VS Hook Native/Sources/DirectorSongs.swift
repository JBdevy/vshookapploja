import SwiftUI

enum DirectorPlaybackColors {
    static let playing = [Color(hex: "EF4444"), Color(hex: "B91C1C"), Color(hex: "7F1D1D")]
    static let queued = [Color(hex: "FB923C"), Color(hex: "E67A29"), Color(hex: "C2410C")]
}

struct DirectorSongList: View {
    @Environment(\.colorScheme) private var scheme
    @ObservedObject var session: HookSession
    var hideNumbers = false
    var playlistOnly = false
    let tools: (JSON) -> Void
    @AppStorage("vshook.native.number.region") private var regionNumber = false
    @AppStorage("vshook.native.number.sort") private var numberSort = ""
    private var entries: [DirectorSongEntry] {
        let rows = playlistOnly ? session.songEntries(for: session.playlistItems) : session.songEntries
        return !playlistOnly && session.page == "regions" && regionNumber && !numberSort.isEmpty ? DirectorNumberOrder.sorted(rows, descending: numberSort == "desc") : rows
    }
    var body: some View {
        let rows = entries
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(rows) { entry in
                        DirectorSongRow(session: session, entry: entry, hideNumbers: hideNumbers, playlistOnly: playlistOnly, tools: tools).id(entry.id)
                    }
                    if rows.isEmpty { HookStatus(text: session.connected ? "NENHUM ITEM ENCONTRADO" : "AGUARDANDO O HOOK CENTER…").padding(24) }
                }
            }.accessibilityIdentifier("vshook.song.list").onChange(of: session.playingID) { id in
                if let entry = rows.first(where: { $0.item.identifier == id }) { withAnimation { proxy.scrollTo(entry.id, anchor: .center) } }
            }
        }.background(Color(hex: scheme == .light ? "F8FAFC" : "111820")).clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "334155")).allowsHitTesting(false))
    }
}
private struct DirectorSongRow: View {
    @Environment(\.colorScheme) private var scheme
    @ObservedObject var session: HookSession
    let entry: DirectorSongEntry
    let hideNumbers: Bool
    let playlistOnly: Bool
    let tools: (JSON) -> Void
    @AppStorage("vshook.native.number.region") private var regionNumber = false
    @AppStorage("vshook.native.playlist.marquee") private var marquee = false
    var item: JSON { entry.item }
    var playing: Bool { session.playing && item.identifier == session.playingID }
    var selected: Bool { !session.playing && item.identifier == (playlistOnly ? session.snapshot["selectedPlaylistSongId"].string : session.selectedID) && !item.identifier.isEmpty }
    var queued: Bool { !item.identifier.isEmpty && item.identifier == session.queueID }
    var block: Bool { item.isSongBlock }
    var baseColor: Color {
        let plain = scheme == .light ? Color(hex: "111827") : .white
        if (playlistOnly || session.page == "playlist") && session.snapshot["blockSongColorMode"].string == "white" && !block { return plain }
        let raw = block ? item.first("blockColorHex", "bridgeBlockColorHex", "finalTextColorHex", "textColorHex").string : item.first("textColorHex", "finalTextColorHex", "inheritedBlockColorHex", "blockColorHex", "colorHex").string
        if block && session.snapshot["blockColorMode"].string == "none" { return plain }
        return raw.isEmpty || ["#334155", "#ffffff"].contains(raw.lowercased()) ? plain : Color(hex: raw)
    }
    var textColor: Color { playing ? .white : queued || selected ? Color(hex: "050505") : baseColor }
    var rowBackground: Color {
        if playing { return Color(hex: "B91C1C") }
        if selected { return Color(hex: block ? "F472B6" : "60A5FA") }
        if queued { return Color(hex: "EA580C") }
        if session.liveEnabled && item.first("liveExecuted", "liveMarked").bool { return Color(hex: "45245E") }
        return block && session.snapshot["blockColorMode"].string != "none" ? baseColor.opacity(0.22) : Color(hex: scheme == .light ? "F8FAFC" : "151D25")
    }
    var body: some View {
        HStack(spacing: 0) {
            if !session.readOnly && !hideNumbers {
                Text(regionNumber && !block ? String(format: "%02d", abs(item.first("source_number", "sourceNumber", "number", "id").int)) : entry.ordinal).font(.custom("Arial-BoldMT", size: 11)).foregroundColor(block ? baseColor : Color(hex: "94A3B8"))
                    .frame(width: 38).frame(maxHeight: .infinity).background(Color(hex: "0F172A").opacity(0.4))
                    .overlay(alignment: .trailing) { Rectangle().fill(Color(hex: "263244")).frame(width: 1) }
            }
            HStack(spacing: 8) {
                if !entry.parent.isEmpty { Text("↳").foregroundColor(Color(hex: "67E8F9")) }
                HStack(spacing: 5) {
                    if block && session.snapshot["blockSymbolMode"].string != "none" && session.snapshot["blockSymbolMode"].exists { ornament(left: true) }
                    if marquee && !block {
                        DirectorMarquee(text: item.name.uppercased(), size: session.tablet ? 16 : 14).foregroundColor(textColor)
                    } else {
                        Text(item.name.uppercased()).font(.custom("Arial-BoldMT", size: session.tablet ? 16 : 14))
                            .foregroundColor(textColor).lineLimit(session.tablet || block ? 1 : 2)
                    }
                    if block && session.snapshot["blockSymbolMode"].string != "none" && session.snapshot["blockSymbolMode"].exists { ornament(left: false) }
                }.frame(maxWidth: .infinity, alignment: block && item["blockCustomCentered"] != false ? .center : .leading)
                if item.isFamilyParent && session.snapshot["familyViewControlsEnabled"].bool {
                    Button { toggleFamily() } label: {
                        Text(session.openFamilies.contains(item.identifier) ? "Ocultar" : "Mostrar")
                            .font(.custom("Arial-BoldMT", size: 10)).padding(.horizontal, 6).frame(height: 28)
                    }.buttonStyle(DirectorButtonStyle()).frame(width: 64)
                }
                TimelineView(.periodic(from: .now, by: 0.2)) { context in
                    Text(item.songDuration > 0 ? directorTime(playing ? ceil(item.songDuration * (1 - session.progress(at: context.date)) - 0.0005) : item.songDuration) : "")
                        .font(.custom("Arial-BoldMT", size: session.tablet ? 16 : 14)).monospacedDigit()
                        .foregroundColor(block ? Color(hex: "22C55E") : textColor).frame(width: session.tablet ? 72 : 48, alignment: .trailing)
                }
                if session.tablet && ["tuner", "bpm"].contains(session.panel) {
                    DirectorInlineTuning(session: session, item: item).frame(width: session.panel == "bpm" ? 232 : 152)
                }
            }.padding(.horizontal, 10)
        }.frame(height: session.tablet ? 44 : 48)
            .background(LinearGradient(colors: selected && !block ? [Color(hex: "0284C7"), Color(hex: "4338CA")] : playing ? DirectorPlaybackColors.playing : queued ? DirectorPlaybackColors.queued : [rowBackground, rowBackground], startPoint: .leading, endPoint: .trailing))
            .overlay { if block { Rectangle().strokeBorder(baseColor.opacity(0.8), lineWidth: 1).allowsHitTesting(false) } }
            .overlay(alignment: .bottom) { Rectangle().fill(Color(hex: "1F2937")).frame(height: 1).allowsHitTesting(false) }
            .overlay(alignment: .bottomLeading) {
                if playing || queued {
                    TimelineView(.periodic(from: .now, by: 0.1)) { context in
                        GeometryReader { geometry in
                            Rectangle().fill(playing ? Color(hex: "00CE55") : Color(hex: "FFE000"))
                                .frame(width: geometry.size.width * (playing ? session.progress(at: context.date) : 1 - session.progress(at: context.date)), height: 3)
                        }.frame(height: 3)
                    }.allowsHitTesting(false)
                }
            }
            .contentShape(Rectangle())
            .overlay {
                SongRowTouchSurface(familyControl: item.isFamilyParent && session.snapshot["familyViewControlsEnabled"].bool,
                                    timeWidth: session.tablet ? 72 : 48,
                                    inlineWidth: session.tablet && ["tuner", "bpm"].contains(session.panel) ? (session.panel == "bpm" ? 240 : 160) : 0, tap: select, hold: {
                    if !session.readOnly && !block { tools(item) }
                }).allowsHitTesting(!session.readOnly)
            }
            .accessibilityIdentifier("vshook.song." + item.identifier)
            .accessibilityAction(named: Text("Selecionar"), select)
    }
    private func select() {
        guard !session.readOnly else { return }
        session.select(item, queue: session.playing, sourcePage: playlistOnly ? "playlist" : nil)

    }
    private func ornament(left: Bool) -> some View {
        let mode = session.snapshot["blockSymbolMode"].string
        let symbols = ["colon": ":", "equal": "=", "dash": "—", "diamond": "◆", "spark": "✦", "capsule": "•"]
        let symbol = mode == "angle" ? (left ? "⟶" : "⟵") : (symbols[mode] ?? "")
        let colors = ["yellow": "FFF02E", "green": "1AFF57", "blue": "3394FF", "purple": "B852FF", "red": "FF382E", "orange": "FF8514", "cyan": "1FEBFF", "white": "EBF2FF", "gray": "8F99A8"]
        return Text(symbol).font(.system(size: 21, weight: .bold)).foregroundColor(Color(hex: colors[session.snapshot["blockSymbolColor"].string] ?? "FFF02E"))
    }
    private func toggleFamily() { session.toggleFamily(item.identifier) }
}
struct DirectorInlineTuning: View {
    @ObservedObject var session: HookSession
    let item: JSON
    var body: some View {
        HStack(spacing: 4) {
            if !item.isSongBlock && !item.isFamilyParent {
                let tuner = session.panel == "tuner"
                DirectorControl(title: "−", height: 32, size: 20) { session.adjustSong(item, tool: session.panel, delta: -1) }.frame(width: 32)
                Button { if tuner { session.adjustSong(item, tool: "tuner", delta: 0, reset: true) } } label: {
                    Text(tuner ? String(format: "%+.0fst", item.songTuner) : String(format: "%+.0f", item.songBPM - item.first("bpmOriginal", "originalBpm", "bpmValue").double))
                        .font(.custom("Arial-BoldMT", size: 14)).frame(width: 58, height: 32)
                }.buttonStyle(DirectorButtonStyle())
                DirectorControl(title: "+", height: 32, size: 20) { session.adjustSong(item, tool: session.panel, delta: 1) }.frame(width: 32)
                if !tuner { Text(item.songBPM > 0 ? String(format: "%.0f BPM", item.songBPM) : "—").font(.custom("Arial-BoldMT", size: 12)).frame(width: 72).foregroundColor(item["bpmGeneric"].bool ? .yellow : .white) }
            }
        }.disabled(session.readOnly || (session.panel == "bpm" && (session.playing && session.playingID == item.identifier || item.songBPM <= 0)))
    }
}
struct DirectorPlaybackHeader: View {
    @ObservedObject var session: HookSession
    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.1)) { context in
            let progress = session.progress(at: context.date)
            let song = session.song(withID: session.playingID)
            let next = session.song(withID: session.queueID)
            let active = session.playing || session.snapshot["transportPaused"].bool
            VStack(spacing: 0) {
                line("REPRODUZINDO", title: active ? (song.name.isEmpty ? session.snapshot["playingSongName"].string : song.name) : "NENHUMA MÚSICA EM REPRODUÇÃO",
                     time: active && song.songDuration > 0 ? directorTime(ceil(song.songDuration * (1 - progress) - 0.0005)) : "", color: Color(hex: "00CE55"), height: 30, active: active, queued: false)
                progressBar(progress, color: Color(hex: "00CE55"))
                line("PRÓXIMA", title: session.queueID.isEmpty ? "FILA DE ESPERA VAZIA" : next.name,
                     time: next.songDuration > 0 ? directorTime(next.songDuration) : "", color: Color(hex: "FFE000"), height: 30, active: !session.queueID.isEmpty, queued: true)
                progressBar(session.queueID.isEmpty ? 0 : 1 - progress, color: Color(hex: "FFE000"))
                line("MULTILOOPS", title: loopText, time: "", color: Color(hex: "FFE000"), height: 22, arrow: false)
            }.frame(height: 94).background(Color(hex: "0A1018"))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "263244")).allowsHitTesting(false))
        }.contentShape(Rectangle())
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("vshook.transport.header")
            .simultaneousGesture(DragGesture(minimumDistance: 28).onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                session.swipeTransport(right: value.translation.width > 0)
            })
    }
    private var loopText: String {
        if session.bypassActive { return "BY ATIVO MULTILOOPS DESATIVADOS" }
        if session.snapshot["loopPlaybackReached"].bool { return session.snapshot["multiLoopPartName"].string.uppercased() + " — EM LOOP" }
        return session.snapshot["selectedOrPlayingMultiLoopActive"].bool ? "ESSA MÚSICA TEM MULTILOOP ATIVO" : "−"
    }
    private func line(_ label: String, title: String, time: String, color: Color, height: CGFloat, arrow: Bool = true, active: Bool = false, queued: Bool = false) -> some View {
        HStack(spacing: 8) {
            Text(label).font(.custom("Arial-BoldMT", size: 9)).foregroundColor(active ? Color(hex: "050505") : arrow ? Color(hex: "94A3B8") : color).frame(width: 82, alignment: .leading)
            if arrow { Text("⟶").font(.system(size: 20, weight: .heavy)).foregroundColor(color) }
            Text(title.uppercased()).font(.custom("Arial-BoldMT", size: arrow ? 12 : 9)).foregroundColor(active ? .white : color).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            if !time.isEmpty { Text(time).font(.custom("Arial-BoldMT", size: 13)).monospacedDigit().foregroundColor(active && !queued ? .white : color) }
        }.padding(.horizontal, 10).frame(height: height)
            .background(LinearGradient(colors: active ? (queued ? DirectorPlaybackColors.queued : DirectorPlaybackColors.playing) : [.clear, .clear], startPoint: .leading, endPoint: .trailing))
    }
    private func progressBar(_ progress: Double, color: Color) -> some View {
        GeometryReader { geometry in color.frame(width: geometry.size.width * min(1, max(0, progress))) }
            .frame(height: 6).background(Color(hex: "151E2A"))
    }
}
