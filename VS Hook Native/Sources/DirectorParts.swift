import SwiftUI

struct DirectorPartsView: View {
    @ObservedObject var session: HookSession
    var standalone = false
    @State private var source = "playing"
    private var selected: String { session.snapshot["selectedMarkerId"].string }
    private var armed: String { session.playing ? session.snapshot["partsArmedMarkerId"].string : "" }
    private var playing: JSON { session.playing ? session.song(withID: session.playingID) : .null }
    private var queued: JSON { session.song(withID: session.queueID) }
    private var chosen: JSON { session.song(withID: session.selectedID) }
    private var song: JSON {
        let preferred = source == "queued" ? queued : source == "selected" ? chosen : playing
        return preferred.exists ? preferred : chosen.exists ? chosen : queued.exists ? queued : playing
    }
    private var origin: String { song == queued ? "EM ESPERA" : song == playing ? "REPRODUZINDO" : "SELECIONADA" }
    private var markers: [JSON] { DirectorParts.markers(session.snapshot, song: song) }
    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                if standalone { DirectorTransportControl(session: session) }
                DirectorControl(title: "CANCELAR", background: Color(hex: armed.isEmpty ? "283140" : "B91C1C"), height: 36) {
                    session.command("marker_cancel", ["key": "ESC", "escapeKey": true, "activeTab": "markers", "page": "markers", "cancelArmedMarker": true, "clearMarkerSelection": true])
                }
                DirectorControl(title: "LOOP", background: Color(hex: session.snapshot.first("loopEnabled", "loopActive").bool ? "15803D" : "283140"), height: 36) { session.toggleLoop() }
            }
            HStack(spacing: 8) {
                sourceButton(playing, fallback: "NENHUMA MÚSICA", key: "playing")
                sourceButton(queued, fallback: "FILA VAZIA", key: "queued")
            }.padding(.top, 6)
            VStack(spacing: 6) {
                HStack {
                    Text(song.exists ? song.name.uppercased() : "SELECIONE UMA MÚSICA").font(.custom("Arial-BoldMT", size: 11)).lineLimit(1)
                    Spacer(minLength: 4)
                    if song.exists { Text(origin).font(.custom("Arial-BoldMT", size: 8)).padding(4).background(Color.white.opacity(0.12)).clipShape(Capsule()) }
                }.padding(10).frame(maxWidth: .infinity, alignment: .leading).background(Color(hex: "6D28D9")).cornerRadius(6)
                ScrollView {
                    LazyVStack(spacing: 5) {
                        if song.isFamilyParent { Text("SELECIONE UMA MÚSICA FILHA PARA VER AS PARTS").font(.caption.bold()).padding(16) }
                        ForEach(Array(markers.enumerated()), id: \.offset) { _, marker in
                            let active = armed == marker.identifier
                            let highlighted = selected == marker.identifier
                            Button { session.selectPart(marker, song: song) } label: {
                                HStack(spacing: 8) {
                                    Text(marker["partsDisplayName"].string.uppercased()).font(.custom("Arial-BoldMT", size: 16)).frame(maxWidth: .infinity, alignment: .leading)
                                    Text(marker["partsSongStart"].bool ? "INÍCIO" : marker["partsPrefix"].string).font(.custom("Arial-BoldMT", size: 8)).padding(3).background(Color(hex: "6D28D9")).cornerRadius(3)
                                }.padding(.horizontal, 10).frame(minHeight: 44)
                            }.buttonStyle(DirectorButtonStyle(background: Color(hex: active ? "15803D" : highlighted ? "CA8A04" : "111827"), foreground: highlighted && !active ? .black : .white))
                                .modifier(ArmedPartVisual(session: session, active: active))
                        }
                    }.padding(6)
                }.background(Color(hex: "131A22")).cornerRadius(6)
            }.padding(2).overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "7C3AED"), lineWidth: 2))
        }
    }
    private func sourceButton(_ item: JSON, fallback: String, key: String) -> some View {
        DirectorControl(title: item.exists ? item.name.uppercased() : fallback, background: Color(hex: item.exists && song == item ? "15803D" : "172033"), height: 38, size: 10) { source = key }.disabled(!item.exists)
    }
}

private struct ArmedPartVisual: ViewModifier {
    @ObservedObject var session: HookSession
    let active: Bool
    @ViewBuilder func body(content: Content) -> some View {
        if active {
            TimelineView(.periodic(from: .now, by: 0.05)) { context in
                let bright = Int(context.date.timeIntervalSinceReferenceDate / 0.4) % 2 == 0
                let remaining = DirectorParts.remainingFraction(session.snapshot, song: session.song(withID: session.playingID), position: session.playbackPosition(at: context.date))
                content.opacity(bright ? 1 : 0.48)
                    .overlay(alignment: .bottomLeading) {
                        GeometryReader { geometry in
                            ZStack(alignment: .leading) {
                                Color(hex: "0F172A").opacity(0.6)
                                Color(hex: "FACC15").frame(width: geometry.size.width * remaining)
                                    .shadow(color: .yellow.opacity(0.7), radius: 3)
                            }
                        }.frame(height: 4).allowsHitTesting(false)
                    }
            }
        } else { content }
    }
}
