import SwiftUI

struct DirectorSongToolsDialog: View {
    @ObservedObject var session: HookSession
    let song: JSON
    let open: (String) -> Void
    let close: () -> Void
    @State private var choice = "premix"
    @State private var reset = false
    var body: some View {
        VStack(spacing: 14) {
            Text(song.name.uppercased()).font(.custom("Arial-BoldMT", size: 16)).frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 10) {
                DirectorControl(title: "PREMIX", background: Color(hex: choice == "premix" ? "16A34A" : "172033"), height: 60) { choice = "premix" }
                if !song.isFamilyParent { DirectorControl(title: "MULTILOOPS", background: Color(hex: choice == "multiloop" ? "16A34A" : "172033"), height: 60) { choice = "multiloop" } }
                DirectorControl(title: "RESET", background: Color(hex: "B91C1C"), height: 60) { reset = true }
            }
            HStack(spacing: 10) {
                DirectorControl(title: "ABRIR", background: Color(hex: "22C55E"), foreground: .black, height: 38) { open(choice) }
                DirectorControl(title: "FECHAR", height: 38, action: close)
            }
        }.modifier(DirectorDialogStyle()).alert("RESET LIVE", isPresented: $reset) {
            Button("CANCELAR", role: .cancel) {}; Button("RESET", role: .destructive) { session.command("live_reset_item", session.targetPayload(song)); close() }
        } message: { Text("REMOVER A MARCAÇÃO DE “\(song.name.uppercased())”?") }
    }
}
struct DirectorPlayDialog: View {
    @ObservedObject var session: HookSession
    let close: () -> Void
    @State private var choosingTracks = false
    private var seconds: Int { min(5, max(1, session.snapshot["manualStopFadeoutDurationSec"].int)) }
    private var tracks: [JSON] { session.snapshot["mixerTracks"].array }
    private var selected: Set<String> { Set(session.snapshot.first("manualStopFadeoutTrackIds", "manualStopFadeoutSelectedTrackIds").array.map(\.string)) }
    var body: some View {
        VStack(spacing: 12) {
            Text(choosingTracks ? "ESCOLHER PISTAS" : "PLAY").font(.custom("Arial-BoldMT", size: 18)).frame(maxWidth: .infinity, alignment: .leading)
            if choosingTracks {
                Text("\(selected.count) PISTAS MARCADAS").font(.caption.bold()).foregroundColor(Color(hex: "94A3B8"))
                ScrollView {
                    LazyVStack(spacing: 5) {
                        ForEach(Array(tracks.enumerated()), id: \.offset) { index, track in
                            let id = track.first("guid", "id").string
                            DirectorOptionRow(title: (selected.contains(id) ? "✓  " : "□  ") + "\(index + 1)  " + track.name, active: selected.contains(id)) {
                                var next = selected; if next.contains(id) { next.remove(id) } else { next.insert(id) }
                                session.command("manual_stop_fadeout_toggle_track", ["trackId": .string(id), "guid": .string(id), "targetId": .string(id)], optimistic: ["manualStopFadeoutTrackIds": .array(next.sorted().map(JSON.string))])
                            }
                        }
                    }
                }.frame(maxHeight: 280)
                HStack {
                    DirectorControl(title: "TODAS", height: 38) { all(true) }
                    DirectorControl(title: "LIMPAR", height: 38) { all(false) }
                }
            } else {
                toggle("FADEROUT", field: "manualStopFadeoutEnabled", command: "manual_stop_fadeout_set_enabled")
                HStack {
                    DirectorControl(title: "−", height: 40) { duration(-1) }.disabled(seconds <= 1)
                    Text("\(seconds)s").font(.title2.bold()).frame(maxWidth: .infinity)
                    DirectorControl(title: "+", height: 40) { duration(1) }.disabled(seconds >= 5)
                }
                HStack {
                    toggle("PLAY PROTECTION", field: "playProtectionEnabled", command: "play_protection_set")
                    toggle("AUTO STOP", field: "autoStopEnabled", command: "auto_stop_set")
                }
                DirectorControl(title: "ESCOLHER PISTAS", height: 40) { choosingTracks = true }
            }
            HStack {
                if choosingTracks { DirectorControl(title: "VOLTAR", height: 38) { choosingTracks = false } }
                DirectorControl(title: "FECHAR", height: 38, action: close)
            }
        }.modifier(DirectorDialogStyle())
    }
    private func toggle(_ label: String, field: String, command: String) -> some View {
        let next = !session.snapshot[field].bool
        return DirectorControl(title: label, background: Color(hex: next ? "B91C1C" : "16A34A"), height: 42, size: 12) {
            session.command(command, .object(["enabled": .bool(next), field: .bool(next), "desiredState": .string(next ? "on" : "off")]), optimistic: .object([field: .bool(next)]))
        }
    }
    private func duration(_ delta: Int) {
        let next = min(5,max(1,seconds + delta))
        session.command("manual_stop_fadeout_set_duration", ["duration": .number(Double(next)), "durationSec": .number(Double(next))], optimistic: ["manualStopFadeoutDurationSec": .number(Double(next))])
    }
    private func all(_ enabled: Bool) {
        session.command("manual_stop_fadeout_set_all_tracks", ["selected": .bool(enabled), "enabled": .bool(enabled)], optimistic: ["manualStopFadeoutTrackIds": .array(enabled ? tracks.map { $0.first("guid", "id") } : [])])
    }
}
struct DirectorMultiLoopsDialog: View {
    @ObservedObject var session: HookSession
    let song: JSON
    let back: () -> Void
    let close: () -> Void
    @State private var trackSlot = 0
    @State private var limitTrack: JSON = .null
    @State private var limit = -90.0
    private var data: JSON { session.snapshot["multiloops"] }
    private var payload: JSON { session.targetPayload(song).merging(["songKey": data["songKey"], "premixKey": data["songKey"], "songName": .string(song.name)]) }
    var body: some View {
        VStack(spacing: 12) {
            Text(limitTrack.exists ? "LIMITE DO AUTO FADER" : trackSlot > 0 ? "M/S \(trackSlot) — PISTAS" : "MULTILOOPS").font(.custom("Arial-BoldMT", size: 18)).frame(maxWidth: .infinity, alignment: .leading)
            if limitTrack.exists { limitControls }
            else if trackSlot > 0 { trackControls }
            else {
                Text(data["songName"].string.isEmpty ? song.name.uppercased() : data["songName"].string.uppercased()).font(.custom("Arial-BoldMT", size: 13)).foregroundColor(Color(hex: "FACC15"))
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(),spacing:8),count:4),spacing:8) {
                    ForEach(1...4,id: \.self) { slot in
                        let field = "loop\(slot)Enabled"
                        DirectorControl(title: "LOOP \(slot)", background: Color(hex: data[field].bool ? "16A34A" : "172033"), height: 60) {
                            if data["loop\(slot)Available"] == false { session.message = "LOOP NÃO DISPONÍVEL"; return }
                            set("multiloop_slot_set", field: field, slot:slot)
                        }
                    }
                    ForEach(5...8,id: \.self) { index in
                        let slot = index - 4
                        let field = "ms\(slot)Enabled"
                        DirectorControl(title: "M/S \(slot)", background: Color(hex: data[field].bool ? "16A34A" : "172033"), height: 60) {
                            guard data["loop\(slot)Enabled"].bool else { session.message = "ATIVE O LOOP \(slot)"; return }
                            set("multiloop_ms_set",field:field,slot:slot)
                        }.highPriorityGesture(LongPressGesture(minimumDuration: 0.5).onEnded { _ in trackSlot = slot })
                    }
                }
                Text("TOQUE E SEGURE EM M/S PARA CONFIGURAR AS PISTAS").font(.custom("Arial-BoldMT", size:10)).foregroundColor(Color(hex:"94A3B8"))
            }
            HStack {
                DirectorControl(title:"VOLTAR",height:38) { if limitTrack.exists { limitTrack = .null } else if trackSlot > 0 { trackSlot = 0 } else { back() } }
                DirectorControl(title:"FECHAR",height:38,action:close)
            }
        }.modifier(DirectorDialogStyle()).onDisappear { session.command("multiloop_close",payload) }
    }
    private var trackControls: some View {
        VStack(spacing:10) {
            let seconds = min(5,max(1,data["fade\(trackSlot)Sec"].exists ? data["fade\(trackSlot)Sec"].int : 3))
            HStack {
                DirectorControl(title:"−",height:36) { fade(-1) }.disabled(seconds<=1)
                Text("\(seconds)s").font(.title2.bold()).frame(maxWidth:.infinity)
                DirectorControl(title:"+",height:36) { fade(1) }.disabled(seconds>=5)
            }
            ScrollView {
                LazyVStack(spacing:3) {
                    ForEach(Array(data["tracks"].array.enumerated()),id: \.offset) { _, track in
                        HStack(spacing:6) {
                            Rectangle().fill(Color(hex:TCPAppearance.trackColor(track))).frame(width:4)
                            Text(track.name.uppercased()).font(.custom("Arial-BoldMT",size:11)).frame(maxWidth:.infinity,alignment:.leading)
                            ForEach(["auto","mute","solo"],id: \.self) { mode in
                                DirectorControl(title:mode == "auto" ? "AUTO FADER" : mode == "mute" ? "M" : "S",background:Color(hex:track["\(mode)\(trackSlot)"].bool ? (mode == "mute" ? "B91C1C" : mode == "solo" ? "CA8A04" : "16A34A") : "172033"),height:34,size:11) { toggleTrack(track,mode:mode) }
                                    .frame(width:mode == "auto" ? 94 : 36)
                                    .highPriorityGesture(LongPressGesture(minimumDuration: 0.5).onEnded { _ in if mode == "auto" { limitTrack = track; limit = track["autoLimit\(trackSlot)Db"].exists ? track["autoLimit\(trackSlot)Db"].double : -90 } })
                            }
                        }.padding(6).background(Color(hex:TCPAppearance.trackColor(track)).opacity(0.12)).cornerRadius(6)
                    }
                }
            }.frame(maxHeight:280)
        }
    }
    private var limitControls: some View {
        let ceiling = max(-90, limitTrack.first("db","volumeDb").double)
        return VStack(spacing:14) {
            Text(limitTrack.name).font(.headline)
            Text(String(format:"VOLUME ATUAL: %+.1f dB",ceiling)).font(.caption)
            Text(String(format:"DESTINO DO FADE: %+.1f dB",limit)).font(.headline)
            Slider(value:$limit,in: -90...max(-89.5,ceiling),step:0.5,onEditingChanged:{ active in if !active { session.command("multiloop_track_limit_set",payload.merging(["slot":.number(Double(trackSlot)),"trackId":limitTrack.first("guid","id"),"guid":limitTrack.first("guid","id"),"limitDb":.number(min(ceiling,limit))])) } })
        }
    }
    private func set(_ command:String,field:String,slot:Int) {
        let next = !data[field].bool
        session.command(command,payload.merging(["slot":.number(Double(slot)),"enabled":.bool(next),"desiredState":.string(next ? "on" : "off")]),optimistic:["multiloops":data.merging(.object([field:.bool(next)]))])
    }
    private func fade(_ delta:Int) {
        session.command("multiloop_fade_adjust",payload.merging(["slot":.number(Double(trackSlot)),"delta":.number(Double(delta))]))
    }
    private func toggleTrack(_ track:JSON,mode:String) {
        let next = !track["\(mode)\(trackSlot)"].bool
        session.command("multiloop_track_set",payload.merging(["slot":.number(Double(trackSlot)),"trackId":track.first("guid","id"),"guid":track.first("guid","id"),"mode":.string(mode),"enabled":.bool(next),"desiredState":.string(next ? "on" : "off")]))
    }
}
