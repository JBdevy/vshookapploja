import SwiftUI

struct ToolPanel: View {
    @ObservedObject var session: HookSession
    let tool: String
    @State private var marker = ""
    @State private var source = "playing"
    @State private var seconds = "00:05:00"
    @State private var seekPosition = 0.0
    @State private var loopSlot = 1
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if tool == "parts" { parts }
                else if tool == "tuner" || tool == "bpm" { tuning }
                else if tool == "timer" { timer }
                else if tool == "seek" { seek }
                else if tool == "multiloop" { multiloop }
            }.padding(12)
        }.background(HookTheme.panel).cornerRadius(6)
            .disabled(session.readOnly || !session.connected || !session.authenticated)
            .onDisappear { if tool == "multiloop" { session.command("multiloop_close", session.target) } }
    }
    private var selectedSong: JSON {
        let id = source == "playing" ? session.playingID : source == "queued" ? session.queueID : session.selectedID
        return session.snapshot["regions"].array.first { $0.identifier == id } ?? session.allItems.first { $0.identifier == id } ?? .null
    }
    private var parts: some View {
        VStack(spacing: 12) {
            Text("PARTS").font(.headline)
            Picker("Música", selection: $source) {
                Text("Tocando").tag("playing"); Text("Fila").tag("queued"); Text("Selecionada").tag("selected")
            }.pickerStyle(.segmented)
            Text(selectedSong.name).font(.headline)
            HStack {
                HookButton(title: "CANCELAR", color: .red, expand: true) { marker = ""; session.command("marker_cancel", ["key": "ESC", "escapeKey": true, "activeTab": "markers", "page": "markers", "cancelArmedMarker": true, "clearMarkerSelection": true]) }
                HookButton(title: "LOOP", expand: true) { session.toggleLoop() }
            }
            ForEach(Array(partMarkers.enumerated()), id: \.offset) { _, item in
                HookButton(title: item.name, color: marker == item.identifier ? .green : HookTheme.gold, filled: marker == item.identifier, expand: true) {
                    let confirmed = !session.playing || marker == item.identifier
                    marker = item.identifier
                    if confirmed {
                        session.command("marker_go", item.merging(["id": .string(item.identifier), "markerId": .string(item.identifier), "activeTab": "markers", "page": "markers", "confirm": true, session.playing ? "armed" : "stopped": true]))
                    }
                }
            }
            if partMarkers.isEmpty { HookStatus(text: "Escolha uma música para ver suas Parts.") }
        }
    }
    private var partMarkers: [JSON] {
        guard selectedSong.exists else { return [] }
        let start = selectedSong.first("startPos", "start_pos", "pos", "rgnstart", "regionStart").double
        let end = selectedSong.first("endPos", "end_pos", "rgnend", "regionEnd").double
        let initial: JSON = ["id": .string("__parts_song_start__:" + selectedSong.identifier), "name": .string(selectedSong.name), "songId": .string(selectedSong.identifier), "targetId": .string(selectedSong.identifier), "position": .number(start), "startPos": .number(start), "targetPosition": .number(start), "songStart": true, "partsSongStart": true]
        return [initial] + session.snapshot["markers"].array.filter {
            let position = $0.first("pos", "position", "startPos", "start_pos").double
            return position >= start - 0.0005 && position < end - 0.0005
        }
    }
    private var tuning: some View {
        VStack(spacing: 10) {
            Text(tool.uppercased()).font(.headline)
            ForEach(Array(session.visibleItems.enumerated()), id: \.offset) { _, item in
                HookCard {
                    Text(item.name).font(.headline).frame(maxWidth: .infinity, alignment: .leading)
                    let value = tool == "tuner" ? item.songTuner : item.songBPM
                    HStack {
                        HookButton(title: "−", expand: true) { adjust(item, value: value - 1) }
                        Text(tool == "tuner" ? String(format: "%+.0f", value) : String(format: "%.0f BPM", value)).font(.title2.monospacedDigit().bold()).frame(maxWidth: .infinity)
                        HookButton(title: "+", expand: true) { adjust(item, value: value + 1) }
                    }
                    if tool == "tuner" { HookButton(title: "Zerar", filled: false) { adjust(item, value: 0) } }
                }
            }
        }
    }
    private func adjust(_ item: JSON, value: Double) {
        let current = tool == "tuner" ? item.songTuner : item.songBPM
        session.adjustSong(item, tool: tool, delta: value - current)
    }
    private var timer: some View {
        HookCard {
            TimelineView(.periodic(from: .now, by: 0.2)) { context in
                let data = session.snapshot
                let elapsed = data["timerRunning"].bool ? max(0, context.date.timeIntervalSince(session.lastUpdate)) : 0
                let anchor = data["timerDisplaySec"].exists ? data["timerDisplaySec"].double : data["timerAccumulatedSec"].double
                Text(timeText(anchor + (data["timerMode"] == "countdown" ? -elapsed : elapsed))).font(.system(size: 58, weight: .heavy, design: .monospaced))
            }
            HStack {
                HookButton(title: "Progressivo", filled: session.snapshot["timerMode"] != "countdown", expand: true) { session.command("timer_set_mode", ["mode": "progressive", "timerMode": "progressive", "timerDisplaySec": 0, "timerAccumulatedSec": 0]) }
                HookButton(title: "Regressivo", filled: session.snapshot["timerMode"] == "countdown", expand: true) { session.command("timer_set_mode", ["mode": "countdown", "timerMode": "countdown", "timerTargetSec": .number(timerSeconds)]) }
            }
            TextField("00:05:00", text: $seconds).keyboardType(.numbersAndPunctuation).modifier(HookField())
            HookButton(title: "Definir tempo", expand: true) { session.command("timer_set_target", ["timerMode": "countdown", "timerTargetSec": .number(timerSeconds)]) }
            Toggle("Iniciar automaticamente", isOn: Binding(get: { session.snapshot["timerInitAutoEnabled"].bool }, set: { session.command("timer_set_init_auto", ["initAutoEnabled": .bool($0)]) }))
            HStack {
                HookButton(title: "Iniciar", color: .green, expand: true) { session.command("timer_start", ["timerMode": session.snapshot["timerMode"], "timerTargetSec": .number(timerSeconds)]) }
                HookButton(title: "Parar / zerar", color: .red, expand: true) { session.command("timer_stop_reset", ["timerMode": session.snapshot["timerMode"], "timerTargetSec": .number(timerSeconds)]) }
            }
        }
    }
    private var timerSeconds: Double { seconds.split(separator: ":").compactMap { Double($0) }.reduce(0) { $0 * 60 + $1 } }
    private var seek: some View {
        HookCard {
            Text(session.allItems.first { $0.identifier == session.target["id"].string }?.name ?? "Posição").font(.headline)
            let start = session.target["startPos"].double
            let end = max(start + 1, session.target["endPos"].double)
            Slider(value: $seekPosition, in: start...end).onAppear { seekPosition = min(end, max(start, session.snapshot.first("playPosition", "position").double)) }
            Text(timeText(seekPosition)).font(.largeTitle.monospacedDigit().bold())
            HookButton(title: "Mover cursor", expand: true) { session.command("edit_cursor_move", session.target.merging(["position": .number(seekPosition), "targetPosition": .number(seekPosition), "noPlay": true, "preservePlayback": true])) }
            HookButton(title: "Tocar desta posição", color: .green, expand: true) { session.command("play_start", session.target.merging(["position": .number(seekPosition), "targetPosition": .number(seekPosition), "startPos": .number(seekPosition), "exactPosition": true, "noSeek": false])) }
        }
    }
    private var multiloop: some View {
        VStack(spacing: 12) {
            Text(session.snapshot["multiloops"]["songName"].string).font(.title2.bold())
            HStack {
                ForEach(1...4, id: \.self) { index in HookButton(title: "LOOP \(index)", filled: loopSlot == index, expand: true) { loopSlot = index } }
            }
            let data = session.snapshot["multiloops"]
            Toggle("Loop \(loopSlot) ativo", isOn: Binding(get: { data["loop\(loopSlot)Enabled"].bool }, set: { enabled in session.command("multiloop_slot_set", session.target.merging(["slot": .number(Double(loopSlot)), "enabled": .bool(enabled), "desiredState": .string(enabled ? "on" : "off")])) }))
            Toggle("Mute / Solo", isOn: Binding(get: { data["ms\(loopSlot)Enabled"].bool }, set: { enabled in session.command("multiloop_ms_set", session.target.merging(["slot": .number(Double(loopSlot)), "enabled": .bool(enabled), "desiredState": .string(enabled ? "on" : "off")])) })).disabled(!data["loop\(loopSlot)Enabled"].bool)
            HStack {
                HookButton(title: "Fade −", expand: true) { session.command("multiloop_fade_adjust", session.target.merging(["slot": .number(Double(loopSlot)), "delta": -1])) }
                HookButton(title: "Fade +", expand: true) { session.command("multiloop_fade_adjust", session.target.merging(["slot": .number(Double(loopSlot)), "delta": 1])) }
            }
            ForEach(Array(data["tracks"].array.enumerated()), id: \.offset) { _, track in
                HookCard {
                    Text(track.name).font(.headline)
                    HStack {
                        ForEach(["auto", "mute", "solo"], id: \.self) { mode in
                            HookButton(title: mode.uppercased(), filled: track["\(mode)\(loopSlot)"].bool, expand: true) {
                                let enabled = !track["\(mode)\(loopSlot)"].bool
                                session.command("multiloop_track_set", session.target.merging(["slot": .number(Double(loopSlot)), "trackId": track.first("guid", "id"), "guid": track.first("guid", "id"), "mode": .string(mode), "enabled": .bool(enabled), "desiredState": .string(enabled ? "on" : "off")]))
                            }
                        }
                    }
                    RemoteSlider(label: "Destino do fade", value: track["autoLimit\(loopSlot)Db"].double, range: -60...12) { value in
                        session.command("multiloop_track_limit_set", session.target.merging(["slot": .number(Double(loopSlot)), "trackId": track.first("guid", "id"), "guid": track.first("guid", "id"), "limitDb": .number(value)]))
                    }
                }
            }
        }
    }
}

struct RemoteSlider: View {
    let label: String
    let value: Double
    var range: ClosedRange<Double> = 0...1
    let changed: (Double) -> Void
    @State private var local = 0.0
    @State private var editing = false
    var body: some View {
        VStack(alignment: .leading) {
            Text("\(label): \(local, specifier: "%.1f")").font(.caption.monospacedDigit())
            Slider(value: $local, in: range, onEditingChanged: { editing = $0; if !$0 { changed(local) } })
        }.onAppear { local = min(range.upperBound, max(range.lowerBound, value)) }
            .onChange(of: value) { if !editing { local = min(range.upperBound, max(range.lowerBound, $0)) } }
    }
}

struct HookAdvancedSettingsView: View {
    @ObservedObject var session: HookSession
    let exit: () -> Void
    @AppStorage("vshook.native.light") private var light = false
    @AppStorage("vshook.native.haptics") private var haptics = true
    @AppStorage("vshook.native.sound") private var sound = false
    var body: some View {
        Form {
            Section("Interface") {
                Toggle("Tema claro", isOn: $light)
                Toggle("Vibração", isOn: $haptics)
                Toggle("Som dos botões", isOn: $sound)
            }
            if !session.readOnly {
                Section("Diretor") {
                    remoteToggle("Bloquear interface do computador", field: "blockInterfaceWhenDirectorConnected", command: "director_set_interface_blocking", payload: "blockInterfaceWhenDirectorConnected")
                    HookButton(title: "Liberar interface local", expand: true) { session.command("director_allow_local_interface", ["allowed": true, "enabled": true]) }
                    remoteToggle("Controles de famílias", field: "familyViewControlsEnabled", command: "director_family_view_set", payload: "familyViewControlsEnabled")
                    remoteToggle("Repertórios de outros projetos", field: "multiProjectPlaylistsEnabled", command: "multi_project_playlists_set", payload: "multiProjectPlaylistsEnabled")
                    remoteToggle("Proteção do Play", field: "playProtectionEnabled", command: "play_protection_set", payload: "playProtectionEnabled")
                    remoteToggle("Stop / Pause", field: "stopPauseModeEnabled", command: "stop_pause_mode_set", payload: "stopPauseModeEnabled")
                }
                Section("Fadeout") {
                    remoteToggle("Fade ao parar", field: "manualStopFadeoutEnabled", command: "manual_stop_fadeout_set_enabled", payload: "enabled")
                    RemoteSlider(label: "Duração em segundos", value: max(1, session.snapshot["manualStopFadeoutDurationSec"].double), range: 1...5) { session.command("manual_stop_fadeout_set_duration", ["duration": .number($0), "durationSec": .number($0)]) }
                    HookButton(title: "Todas as pistas", filled: false) { session.command("manual_stop_fadeout_set_all_tracks", ["selected": true, "enabled": true]) }
                    HookButton(title: "Limpar pistas", filled: false) { session.command("manual_stop_fadeout_set_all_tracks", ["selected": false, "enabled": false]) }
                    ForEach(Array(session.snapshot["mixerTracks"].array.enumerated()), id: \.offset) { _, track in
                        Button(track.name) { session.command("manual_stop_fadeout_toggle_track", ["trackId": track.first("guid", "id"), "guid": track.first("guid", "id"), "targetId": track.first("guid", "id")]) }
                    }
                }
            }
            HookButton(title: "SAIR", icon: "rectangle.portrait.and.arrow.right", color: .red, expand: true, action: exit)
        }
    }
    private func remoteToggle(_ label: String, field: String, command: String, payload: String) -> some View {
        Toggle(label, isOn: Binding(get: { session.snapshot[field].bool }, set: { next in session.command(command, .object(["enabled": .bool(next), payload: .bool(next), "desiredState": .string(next ? "on" : "off")]), optimistic: .object([field: .bool(next)])) })).disabled(!session.connected || !session.authenticated)
    }
}
