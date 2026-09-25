import SwiftUI

struct DirectorPremixView: View {
    @ObservedObject var session: HookSession
    let song: JSON
    let close: () -> Void
    @State private var chosen: JSON = .null
    private var data: JSON { session.snapshot["premix"] }
    private var sections: [JSON] { data.first("songSections", "sections").array }
    private var target: JSON { chosen.exists ? chosen : song }
    var body: some View {
        VStack(spacing: 8) {
            DirectorPlaybackHeader(session: session)
            HStack(spacing: 7) {
                DirectorControl(title: session.playing ? "PAUSE" : "PLAY", background: Color(hex: session.playing ? "B91C1C" : "166534"), height: 42) {
                    let payload = session.targetPayload(target)
                    if session.playing { session.command("director_pause", payload.merging(["noSeek": true, "preserveCursor": true, "transportOnly": true])) }
                    else if session.snapshot["transportPaused"].bool { session.command("director_play_no_seek", payload.merging(["noSeek": true, "preserveCursor": true, "transportOnly": true])) }
                    else { session.command("play_start", payload.merging(["startPos": target.first("startPos", "start_pos"), "exactPosition": true])) }
                }
                DirectorControl(title: "VOLTAR", height: 42, action: close)
            }
            HStack(spacing: 10) {
                Text("PREMIX").foregroundColor(Color(hex: "FACC15"))
                Text(song.name.uppercased()).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            }.font(.custom("Arial-BoldMT", size: 14)).padding(.horizontal, 4)
            ScrollView {
                LazyVStack(spacing: 0) {
                    if !sections.isEmpty {
                        ForEach(Array(sections.enumerated()), id: \.offset) { index, section in
                            let item = section.merging(["id": section.first("songId", "regionId", "id"), "name": section.first("songName", "name")])
                            DirectorOptionRow(title: String(format: "%02d  ", index + 1) + item.name.uppercased(), active: target.identifier == item.identifier) { chosen = item }
                            ForEach(Array(section.first("items", "itemRows").array.filter(MixerScale.visible).enumerated()), id: \.offset) { _, clip in
                                DirectorPremixRow(session: session, item: session.displayedTCPItem(clip), song: item)
                            }
                        }
                    } else {
                        ForEach(Array(data.first("items", "itemRows").array.filter(MixerScale.visible).enumerated()), id: \.offset) { _, item in
                            DirectorPremixRow(session: session, item: session.displayedTCPItem(item), song: target)
                        }
                        if data.first("items", "itemRows").array.isEmpty { Text("NENHUM ITEM COMEÇA DENTRO DESTA MÚSICA").font(.caption.bold()).padding(20) }
                    }
                }
            }.background(Color(hex: "070B11")).cornerRadius(6).overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "273449")))
        }.padding(8).background(Color(hex: "0B1018")).cornerRadius(6)
            .onDisappear { session.command("premix_close", session.targetPayload(song)) }
    }
}
private struct DirectorPremixRow: View {
    @ObservedObject var session: HookSession
    let item: JSON
    let song: JSON
    @State private var ratio = 0.76
    @State private var editing = false
    private var payload: JSON { session.targetPayload(song).merging(["itemId": item.first("itemId", "mediaItemId", "guid", "id"), "mediaItemId": item.first("itemId", "mediaItemId", "guid", "id"), "targetId": item.first("itemId", "mediaItemId", "guid", "id"), "trackId": item.first("trackId", "trackGuid", "track_id")]) }
    var body: some View {
        GeometryReader { geometry in
            let compact = geometry.size.width < 560
            VStack(spacing: 6) {
                HStack(spacing: 9) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item["trackName"].string.uppercased()).font(.custom("Arial-BoldMT", size: 11)).foregroundColor(Color(hex: "94A3B8"))
                        Text(item.name.uppercased()).font(.custom("Arial-BoldMT", size: 14)).lineLimit(1)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    if !compact { volume.frame(width: geometry.size.width * 0.40) }
                    buttons
                }
                if compact { volume }
            }.padding(10)
        }.frame(height: session.tablet ? 70 : 96).background(Color(hex: "0D131D"))
            .overlay(alignment: .bottom) { Color(hex: "1E293B").frame(height: 1) }
            .onAppear { ratio = MixerScale.ratio(item, max: 24) }
            .onChange(of: item) { value in if !editing { ratio = MixerScale.ratio(value, max: 24) } }
    }
    private var volume: some View {
        HStack(spacing: 7) {
            DirectorFader(value: $ratio, label: "Volume de " + item.name, editingChanged: { active in editing = active; if !active { send() } }).frame(height: 36)
                .onChange(of: ratio) { _ in if editing { send() } }.onTapGesture(count: 2) { ratio = 0.76; send() }
            let db = MixerScale.decibels(ratio, max: 24)
            Text(db.isFinite ? String(format: "%+.1f dB", db) : "−INF dB").font(.custom("Arial-BoldMT", size: 10.5)).foregroundColor(Color(hex: "FACC15")).frame(width: 54)
        }
    }
    private var buttons: some View {
        HStack(spacing: 5) {
            toggle("U", field: "uniqueSolo", command: "premix_item_set_unique_solo", desired: "desiredUniqueSolo", color: "7C3AED")
            toggle("S", field: "trackSolo", command: "premix_item_set_track_solo", desired: "desiredSolo", color: "CA8A04")
            toggle("M", field: "mute", command: "premix_item_toggle_mute", desired: "desiredMute", color: "DC2626")
        }
    }
    private func toggle(_ title: String, field: String, command: String, desired: String, color: String) -> some View {
        let on = item[field].bool || (field == "mute" && item["muted"].bool)
        return DirectorControl(title: title, background: Color(hex: on ? color : "111827"), height: 38, size: 15) { session.command(command, payload.merging(.object([desired: .bool(!on), field: .bool(!on)]))) }.frame(width: 40)
    }
    private func send() { session.setVolume(item, ratio: ratio, premix: true, song: song) }
}
