import SwiftUI

struct MixerView: View {
    @ObservedObject var session: HookSession
    var premix = false
    @State private var view = "tracks"
    @State private var route: JSON = .null
    private var tracks: [JSON] {
        let data = session.snapshot, nested = data[premix ? "premix" : "mixer"]
        if view == "master" { let master = data.first("mixerMaster", "masterTrack").exists ? data.first("mixerMaster", "masterTrack") : nested["master"]; return master.exists ? [master] : [] }
        if view == "items" {
            let sections = nested.first("songSections", "sections").array.flatMap { $0.first("items", "itemRows").array }
            return (sections.isEmpty ? data["premixItems"].exists ? data["premixItems"].array : nested.first("items", "itemRows").array : sections).filter(MixerScale.visible)
        }
        let key = (premix ? "premix" : "mixer") + (view == "groups" ? "Groups" : "Tracks")
        return (data[key].exists ? data[key].array : nested[view].array).filter(MixerScale.visible)
    }
    var body: some View {
        VStack(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(premix ? ["tracks", "groups", "items"] : ["tracks", "groups", "master"], id: \.self) { value in
                        HookButton(title: ["tracks": "PISTAS", "groups": "GRUPOS", "items": "ITENS", "master": "MASTER"][value]!, filled: view == value) {
                            view = value
                            session.command(premix ? (value == "items" ? "premix_item_open" : "premix_focus_song") : "mixer_focus", session.target.merging(["view": .string(value), "requestFull": "1"]))
                        }
                    }
                    if premix {
                        HookButton(title: "ON", color: .green, filled: session.snapshot["premix"]["enabled"].bool) { session.command("premix_toggle_enabled", session.target) }
                        HookButton(title: "Atualizar", filled: false) { session.command("premix_refresh", session.target) }
                    }
                }
            }
            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(Array(tracks.enumerated()), id: \.offset) { _, item in
                        MixerStrip(session: session, item: item, view: view, premix: premix, route: { route = item })
                    }
                    if tracks.isEmpty { HookStatus(text: "Aguardando as pistas do Hook Center…") }
                }.padding(6)
            }
        }.onDisappear { if premix { session.command("premix_close", session.target) } }
            .sheet(isPresented: Binding(get: { route.exists }, set: { if !$0 { route = .null } })) {
                HookScreen(title: "Saídas • \(route.name)", back: { route = .null }) {
                    Form {
                        routeToggle("Master / grupo", kind: "parent", channel: 0, enabled: route["parentSend"] != false)
                        let outputs = session.snapshot["mixerHardwareOutputs"].exists ? session.snapshot["mixerHardwareOutputs"].array : session.snapshot["mixer"]["hardwareOutputs"].array
                        ForEach(Array(outputs.enumerated()), id: \.offset) { _, output in
                            routeToggle(output.name, kind: output.first("kind", "routeKind").string.isEmpty ? "hardware" : output.first("kind", "routeKind").string, channel: output["channel"].int, enabled: route["hardwareRoutes"].array.contains(output["id"]))
                        }
                    }
                }
            }
    }
    private func routeToggle(_ title: String, kind: String, channel: Int, enabled: Bool) -> some View {
        Toggle(title, isOn: Binding(get: { enabled }, set: { next in
            let id = route.first("id", "guid", "trackId")
            session.command("mixer_set_route", ["id": id, "targetId": id, "trackId": id, "routeKind": .string(kind), "channel": .number(Double(channel)), "enabled": .bool(next)])
        }))
    }
}
private struct MixerStrip: View {
    @ObservedObject var session: HookSession
    let item: JSON
    let view: String
    let premix: Bool
    let route: () -> Void
    @State private var local = 0.76
    @State private var holdUntil = Date.distantPast
    @State private var editing = false
    var itemMode: Bool { premix && view == "items" }
    var itemID: JSON { item.first("id", "guid", "targetId", "trackId", "itemId", "mediaItemId") }
    var payload: JSON { session.target.merging(["id": itemID, "targetId": itemID, "trackId": itemMode ? item.first("trackId", "trackGuid") : itemID, "itemId": itemID, "mediaItemId": itemID, "view": .string(view)]) }
    var body: some View {
        VStack(spacing: 10) {
            HStack {
                RoundedRectangle(cornerRadius: 2).fill(Color(hex: item.first("displayColor", "color", "trackColor").string)).frame(width: 5)
                Text(item.name.isEmpty ? item["trackName"].string : item.name).font(.headline).frame(maxWidth: .infinity, alignment: .leading)
                let db = MixerScale.decibels(local, max: itemMode ? 24 : 12)
                Text(db.isFinite ? String(format: "%+.1f dB", db) : "−∞ dB").font(.system(.body, design: .monospaced).bold()).frame(width: 90)
                if !premix { HookButton(title: "OUT", filled: false, action: route) }
            }
            HStack(spacing: 12) {
                HookButton(title: "M", color: .red, filled: item.first("mute", "muted").bool) {
                    let next = !item.first("mute", "muted").bool
                    session.command(itemMode ? "premix_item_toggle_mute" : premix ? "premix_toggle_mute" : "mixer_toggle_mute", payload.merging(["desiredMute": .bool(next), "muted": .bool(next)]))
                }
                HookButton(title: "S", color: .green, filled: item.first("solo", "trackSolo").bool) {
                    let next = !item.first("solo", "trackSolo").bool
                    session.command(itemMode ? "premix_item_set_track_solo" : "mixer_toggle_solo", payload.merging(["desiredSolo": .bool(next), "solo": .bool(next)]))
                }
                Slider(value: $local, in: 0...1, onEditingChanged: { editing = $0; holdUntil = Date().addingTimeInterval(3); if !$0 { changeVolume() } })
                    .onChange(of: local) { _ in if editing { changeVolume() } }
                HookButton(title: "0 dB", filled: false) { local = 0.76; holdUntil = Date().addingTimeInterval(3); changeVolume() }
            }
            if premix {
                HStack {
                    if itemMode {
                        HookButton(title: "ÚNICO", filled: item["uniqueSolo"].bool, expand: true) {
                            let next = !item["uniqueSolo"].bool
                            session.command("premix_item_set_unique_solo", payload.merging(["desiredUniqueSolo": .bool(next), "uniqueSolo": .bool(next)]))
                        }
                    } else { HookButton(title: "FX", filled: item["fxEnabled"].bool, expand: true) { session.command("premix_toggle_fx", payload) } }
                }
            }
        }.padding(12).background(HookTheme.panel).cornerRadius(6)
            .onAppear { local = MixerScale.ratio(item, max: itemMode ? 24 : 12) }
            .onChange(of: item) { value in if !editing && Date() > holdUntil { local = MixerScale.ratio(value, max: itemMode ? 24 : 12) } }
            .disabled(!session.connected || !session.authenticated || session.readOnly)
    }
    private func changeVolume() {
        if premix && !itemMode { session.command("premix_set_volume", payload.merging(["ratio": .number(local), "volumeRatio": .number(local)])) }
        else { session.setVolume(item, ratio: local, view: view, premix: itemMode) }
    }
}
