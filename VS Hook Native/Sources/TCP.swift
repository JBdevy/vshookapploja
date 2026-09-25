import SwiftUI
import UIKit

struct TCPView: View {
    @ObservedObject var session: HookSession
    @Binding var master: Bool
    @StateObject private var model = TCPModel()
    @State private var listOpen = false
    @State private var selectedItem: JSON = .null
    @State private var selectedTrack: JSON = .null
    @AppStorage("vshook.native.tcp.trackWidth") private var trackFraction = 0.30
    @AppStorage("vshook.native.tcp.listWidth") private var listFraction = 0.34
    @State private var dragTrackStart: Double?
    @State private var dragListStart: Double?
    @State private var selectedHandle = ""
    @State private var zoom = 1.0
    @State private var zoomStart = 1.0
    @State private var pan = 0.0
    @State private var panStart: Double?
    @State private var cursor: Double?
    private var tracks: [JSON] {
        if master {
            let value = session.snapshot.first("mixerMaster", "masterTrack")
            return value.exists ? [value] : []
        }
        return (session.snapshot["mixerTracks"].exists ? session.snapshot["mixerTracks"].array : session.snapshot["mixer"]["tracks"].array).filter(MixerScale.visible)
    }
    private var focus: JSON { session.tcpFocus }
    private var bounds: TCPRange {
        let start = focus.first("startPos", "start_pos").double
        return TCPRange(start: start, end: max(start + 1, focus.first("endPos", "end_pos").double))
    }
    private var visibleRange: TCPRange {
        let duration = bounds.duration / zoom
        let start = bounds.start + min(max(0, pan), bounds.duration - duration)
        return TCPRange(start: start, end: start + duration)
    }
    private var items: [JSON] {
        var seen = Set<String>()
        return (session.tcpItems + model.items).filter { seen.insert($0.first("itemId", "id", "guid").string).inserted }.map(session.displayedTCPItem)
    }
    private var revision: String {
        session.snapshot.first("currentProjectId", "projectId", "projectPath").string + ":" + session.snapshot["mixerTimelineRevision"].string + ":" + session.snapshot["mixerTimelineCatalogRevision"].string
    }
    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 5) {
                DirectorControl(title: session.playing ? "STOP" : "PLAY", background: Color(hex: session.playing ? "DC2626" : "166534")) { session.command("play_button") }
                DirectorControl(title: "AUTO 1", background: Color(hex: session.autoEnabled(1) ? "15803D" : "172033")) { session.toggleAuto(1) }
                DirectorControl(title: "STOP BREAK") { session.command("director_stop_break", session.target.merging(["noSeek": true, "preserveCursor": true, "transportOnly": true, "ignoreFadeout": true, "stopBreak": true])) }
                DirectorControl(title: "LIST", background: Color(hex: listOpen ? "15803D" : "991B1B")) { listOpen.toggle() }.accessibilityIdentifier("vshook.tcp.list")
            }
            GeometryReader { geometry in
                let sideWidth = listOpen ? geometry.size.width * TCPAppearance.listFraction(listFraction, tracks: trackFraction) : 0
                let width = max(1, geometry.size.width - sideWidth)
                HStack(spacing: 0) {
                    trackGrid(width: width, totalWidth: geometry.size.width).frame(width: width)
                    if listOpen {
                        DirectorSongList(session: session, hideNumbers: true) { session.select($0) }
                            .padding(.leading, 24)
                            .frame(width: sideWidth)
                            .overlay(alignment: .leading) {
                                TCPWidthHandle(selected: selectedHandle == "list", label: "Ajustar largura da lista", value: TCPAppearance.listFraction(listFraction, tracks: trackFraction), identifier: "vshook.tcp.listWidth", leading: true)
                                    .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("tcpPanel")).onChanged { value in
                                        selectedHandle = "list"
                                        if dragListStart == nil { dragListStart = TCPAppearance.listFraction(listFraction, tracks: trackFraction) }
                                        listFraction = TCPAppearance.listFraction((dragListStart ?? listFraction) - value.translation.width / max(1, geometry.size.width), tracks: trackFraction)
                                    }.onEnded { _ in dragListStart = nil })
                                    .accessibilityAdjustableAction { direction in
                                        listFraction = TCPAppearance.listFraction(listFraction + (direction == .increment ? 0.05 : -0.05), tracks: trackFraction)
                                    }
                            }
                    }
                }
            }.coordinateSpace(name: "tcpPanel").background(Color(hex: "11151B")).clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "334155")).allowsHitTesting(false))
        }
        .task(id: revision) { await model.load(session: session) }
        .onChange(of: focus.identifier) { _ in zoom = 1; zoomStart = 1; pan = 0; cursor = nil }
        .overlay {
            if selectedItem.exists || selectedTrack.exists {
                let itemMode = selectedItem.exists
                let current = itemMode ? (items.first { $0.first("itemId", "id", "guid") == selectedItem.first("itemId", "id", "guid") } ?? session.displayedTCPItem(selectedItem)) : (tracks.first { $0.identifier == selectedTrack.identifier } ?? selectedTrack)
                GeometryReader { geometry in
                    ZStack {
                        Color.black.opacity(0.001).contentShape(Rectangle()).onTapGesture { closeItem() }
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(current.name.uppercased()).font(.custom("Arial-BoldMT", size: 16)).lineLimit(1)
                                    Text(current["trackName"].string.uppercased()).font(.custom("Arial-BoldMT", size: 10)).foregroundColor(Color(hex: "94A3B8"))
                                }
                                Spacer()
                                DirectorControl(title: "FECHAR", height: 34, size: 12) { closeItem() }.frame(width: 84)
                            }
                            TCPItemControls(session: session, item: current, itemMode: itemMode, view: master ? "master" : "tracks", song: focus)
                        }.padding(16).frame(width: min(520, geometry.size.width * 0.92))
                            .background(Color(hex: "101827")).clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "475569")))
                            .accessibilityAddTraits(.isModal)
                    }.frame(width: geometry.size.width, height: geometry.size.height)
                }
            }
        }
        
    }
    private func closeItem() { selectedItem = .null; selectedTrack = .null }
    private func trackGrid(width: CGFloat, totalWidth: CGFloat) -> some View {
        let left = master ? width : min(width, totalWidth * min(1, max(0.25, trackFraction)))
        let right = max(1, width - left)
        let rows = model.rowCache.rows(tracks: tracks, items: items, focused: focus.exists)
        let regions = session.snapshot["regions"].array
        return VStack(spacing: 0) {
            if !master {
                HStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Músicas/Blocos  ▸").frame(height: 18)
                        Text("Músicas/Filhos  ▸").frame(height: 18)
                    }.font(.custom("Arial-BoldMT", size: 9)).foregroundColor(Color(hex: "F02EE6"))
                        .padding(.leading, 8).frame(width: left, alignment: .leading)

                    TCPRegionHeader(regions: regions, range: visibleRange, focused: focus.exists, cursor: currentCursor, playing: session.playing && session.connected, updatedAt: session.lastUpdate).frame(width: right, height: 36)
                }.frame(height: 36).background(Color(hex: "070A0F"))
            }
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(rows) { row in
                        let track = row.track
                        HStack(spacing: 0) {
                            TCPTrackStrip(session: session, track: track, view: master ? "master" : "tracks") { selectedTrack = track }
                                .equatable().padding(.trailing, master ? 0 : 24).frame(width: left)
                            if !master {
                                TCPGridRow(track: track, items: row.items, regions: regions, range: visibleRange, focused: focus.exists,
                                           shadow: row.shadow,
                                           onSeek: { ratio in selectedHandle = ""; seek(ratio) }, onItem: { selectedItem = $0 }, canPan: zoom > 1,
                                           onPan: { ratio, ended in
                                               if panStart == nil { panStart = pan }
                                               pan = min(bounds.duration - visibleRange.duration, max(0, (panStart ?? pan) - ratio * visibleRange.duration))
                                               if ended { panStart = nil }
                                           })
                                    .frame(width: right, height: 72)
                            }
                        }.frame(height: 72)
                    }
                    if tracks.isEmpty { HookStatus(text: model.loading ? "CARREGANDO TCP…" : "TCP SEM DADOS").padding() }
                }
            }.overlay(alignment: .trailing) {
                if !master {
                    TCPMovingCursor(range: visibleRange, position: currentCursor, playing: session.playing && session.connected, updatedAt: session.lastUpdate, head: false)
                        .frame(width: right).clipped().allowsHitTesting(false)
                }
            }.accessibilityIdentifier("vshook.tcp.tracks")
                .simultaneousGesture(MagnificationGesture().onChanged { zoom = min(16, max(1, zoomStart * $0)) }.onEnded { _ in zoomStart = zoom })
        }.overlay(alignment: .leading) {
            if !master {
                TCPWidthHandle(selected: selectedHandle == "tracks", label: "Ajustar largura das pistas", value: trackFraction, identifier: "vshook.tcp.trackWidth", leading: false)
                    .offset(x: max(0, left - 24))
                    .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("tcpPanel")).onChanged { value in
                        selectedHandle = "tracks"
                        if dragTrackStart == nil { dragTrackStart = trackFraction }
                        trackFraction = min(1, max(0.25, (dragTrackStart ?? trackFraction) + value.translation.width / max(1, totalWidth)))
                    }.onEnded { _ in dragTrackStart = nil })
                    .accessibilityAdjustableAction { direction in trackFraction = min(1, max(0.25, trackFraction + (direction == .increment ? 0.05 : -0.05))) }
            }
        }
    }
    private var currentCursor: Double? {
        if let cursor, !session.playing { return cursor }
        let position = session.snapshot.first("playPosition", "currentPlayPosition", "position", "editCursorPosition")
        return position.exists ? position.double : nil
    }
    private func seek(_ ratio: Double) {
        guard focus.exists else { return }
        guard !session.playing else { session.message = "APENAS COM A MÚSICA PARADA"; return }
        let position = visibleRange.start + visibleRange.duration * min(1, max(0, ratio))
        cursor = position
        session.command("edit_cursor_move", ["position": .number(position), "minPos": .number(bounds.start), "maxPos": .number(bounds.end), "cursorMoveSeq": .number(Date().timeIntervalSince1970 * 1_000_000)])
    }
}
private struct TCPTrackStrip: View, Equatable {
    let session: HookSession
    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.session === rhs.session && lhs.track == rhs.track && lhs.view == rhs.view
    }
    let track: JSON
    let view: String
    let open: () -> Void
    @State private var ratio = 0.76
    @State private var editing = false
    @State private var holdUntil = Date.distantPast
    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "arrow.up.and.down").font(.system(size: 13)).foregroundColor(Color(hex: "64748B")).frame(width: 33, height: 72).background(Color(hex: "0F172A"))
            Rectangle().fill(Color(hex: TCPAppearance.trackColor(track))).frame(width: 5, height: 56)
            VStack(spacing: 1) {
                HStack(spacing: 4) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(track.name.uppercased()).font(.custom("Arial-BoldMT", size: 11)).lineLimit(1)
                        Text(dbText).font(.custom("Arial-BoldMT", size: 9)).foregroundColor(Color(hex: "94A3B8"))
                    }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()).onTapGesture(perform: open)
                    mini("M", on: track.first("mute", "muted").bool, color: "DC2626", command: "mixer_toggle_mute")
                    mini("S", on: track.first("solo", "trackSolo").bool, color: "EAB308", command: "mixer_toggle_solo")
                }.frame(height: 30)
                DirectorFader(value: $ratio, label: "Volume de " + track.name, editingChanged: { active in editing = active; holdUntil = Date().addingTimeInterval(2); if !active { session.setVolume(track, ratio: ratio, view: view) } })
                    .tint(.white).frame(height: 28).accessibilityLabel("Volume de " + track.name)
                    .onChange(of: ratio) { _ in if editing { session.setVolume(track, ratio: ratio, view: view) } }
            }.padding(.trailing, 12)
        }.frame(height: 72).background(Color(hex: "0B1017"))
            .overlay(alignment: .bottom) { Color(hex: "7C3AED").frame(height: 1) }
            .onAppear { ratio = MixerScale.ratio(track) }
            .onChange(of: track) { value in if !editing && Date() > holdUntil { ratio = MixerScale.ratio(value) } }
    }
    private var dbText: String { let db = MixerScale.decibels(ratio); return db.isFinite ? String(format: "%+.1f dB", db) : "−∞ dB" }
    private func mini(_ label: String, on: Bool, color: String, command: String) -> some View {
        DirectorControl(title: label, background: Color(hex: on ? color : "172033"), height: 28, size: 12) {
            let id = track.first("id", "guid", "trackId")
            session.command(command, ["id": id, "targetId": id, "trackId": id, "desiredState": .string(on ? "off" : "on"), label == "M" ? "desiredMute" : "desiredSolo": .bool(!on)])
        }.frame(width: 30)
    }
}
private struct TCPItemControls: View {
    @ObservedObject var session: HookSession
    let item: JSON
    let itemMode: Bool
    let view: String
    let song: JSON
    @State private var ratio = 0.76
    @State private var editing = false
    var body: some View {
        HStack(spacing: 12) {
            DirectorControl(title: "M", background: Color(hex: item.first("mute", "muted").bool ? "DC2626" : "172033"), height: 56, size: 22) {
                let id = item.first("itemId", "id", "guid")
                let target = itemMode ? session.targetPayload(song) : JSON.object([:])
                session.command(itemMode ? "premix_item_toggle_mute" : "mixer_toggle_mute", target.merging(["targetId": id, "itemId": id, "mediaItemId": id, "trackId": item.first("trackId", "id"), "desiredMute": .bool(!item.first("mute", "muted").bool)]).merging(itemMode ? [:] : ["id": id]))
            }.frame(width: 56).accessibilityIdentifier("vshook.tcp.itemMute")
            DirectorFader(value: $ratio, label: "Volume de " + item.name, identifier: "vshook.tcp.itemVolume", editingChanged: { active in
                editing = active
                if !active { sendVolume() }
            }).tint(.white).accessibilityLabel("Volume de " + item.name).accessibilityIdentifier("vshook.tcp.itemVolume")
                .onChange(of: ratio) { _ in if editing { sendVolume() } }
                .onTapGesture(count: 2) { ratio = 0.76; sendVolume() }
            let db = MixerScale.decibels(ratio, max: itemMode ? 24 : 12)
            Text(db.isFinite ? String(format: "%+.1f dB", db) : "−∞ dB").font(.custom("Arial-BoldMT", size: 12)).monospacedDigit().frame(width: 64)
        }.onAppear { ratio = MixerScale.ratio(item, max: itemMode ? 24 : 12) }
            .onChange(of: item) { value in if !editing { ratio = MixerScale.ratio(value, max: itemMode ? 24 : 12) } }
    }
    private func sendVolume() { session.setVolume(item, ratio: ratio, view: view, premix: itemMode, song: song) }
}

private struct TCPWidthHandle: View {
    let selected: Bool
    let label: String
    let value: Double
    let identifier: String
    let leading: Bool
    var body: some View {
        Canvas { context, size in
            let rect = CGRect(x: leading ? 0 : 7, y: 0, width: 14, height: size.height)
            context.fill(Path(rect), with: .color(Color(hex: selected ? "713F12" : "1F2937")))
            for x in stride(from: rect.minX, to: rect.maxX, by: 5) {
                context.fill(Path(CGRect(x: x, y: 0, width: min(2, rect.maxX - x), height: size.height)), with: .color(Color(hex: selected ? "FACC15" : "9CA3AF")))
            }
            context.stroke(Path(rect.insetBy(dx: 0.5, dy: 0.5)), with: .color(Color(hex: selected ? "FDE047" : "9CA3AF")), lineWidth: 1)
        }.frame(width: 24).frame(maxHeight: .infinity)
            .contentShape(Rectangle()).accessibilityElement().accessibilityLabel(label)
            .accessibilityValue("\(Int(value * 100))%").accessibilityIdentifier(identifier)
    }
}
