import SwiftUI

struct DirectorPartsView: View {
    @ObservedObject var session: HookSession
    var standalone = false
    @State private var source = "playing"
    @State private var selected = ""
    @State private var armed = ""
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
                if standalone { DirectorControl(title: session.playing ? "STOP" : "PLAY", background: Color(hex: session.playing ? "B91C1C" : "166534"), height: 36) { session.command("play_button") } }
                DirectorControl(title: "CANCELAR", background: Color(hex: armed.isEmpty ? "283140" : "B91C1C"), height: 36) {
                    selected = ""; armed = ""
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
                            Button { select(marker) } label: {
                                HStack(spacing: 8) {
                                    Text(marker["partsDisplayName"].string.uppercased()).font(.custom("Arial-BoldMT", size: 16)).frame(maxWidth: .infinity, alignment: .leading)
                                    Text(marker["partsSongStart"].bool ? "INÍCIO" : marker["partsPrefix"].string).font(.custom("Arial-BoldMT", size: 8)).padding(3).background(Color(hex: "6D28D9")).cornerRadius(3)
                                }.padding(.horizontal, 10).frame(minHeight: 44)
                            }.buttonStyle(DirectorButtonStyle(background: Color(hex: active ? "15803D" : highlighted ? "CA8A04" : "111827"), foreground: highlighted && !active ? .black : .white))
                        }
                    }.padding(6)
                }.background(Color(hex: "131A22")).cornerRadius(6)
            }.padding(2).overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "7C3AED"), lineWidth: 2))
        }.onChange(of: song.identifier) { _ in selected = ""; armed = "" }
            .onChange(of: session.snapshot["partsArmedMarkerId"]) { value in if value.exists { armed = value.string } }
    }
    private func sourceButton(_ item: JSON, fallback: String, key: String) -> some View {
        DirectorControl(title: item.exists ? item.name.uppercased() : fallback, background: Color(hex: item.exists && song == item ? "15803D" : "172033"), height: 38, size: 10) { source = key; selected = ""; armed = "" }.disabled(!item.exists)
    }
    private func select(_ marker: JSON) {
        let confirm = !session.playing || selected == marker.identifier
        selected = marker.identifier; armed = ""
        guard confirm else { return }
        if session.playing { armed = marker.identifier }
        session.command("marker_go", marker.merging(["id": .string(marker.identifier), "markerId": .string(marker.identifier), "songId": .string(song.identifier), "targetId": .string(song.identifier), "activeTab": "markers", "page": "markers", "confirm": true, session.playing ? "armed" : "stopped": true]))
    }
}
