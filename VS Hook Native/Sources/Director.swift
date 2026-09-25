import SwiftUI

struct DirectorView: View {
    @ObservedObject var session: HookSession
    let projects: [HookProject]
    let back: () -> Void
    @State private var password = ""
    @State private var sheet: String?
    @State private var toolSong: JSON = .null
    @State private var previewPage = 0
    @AppStorage("vshook.native.border.mode") private var borderMode = "yellow"
    @State private var showSearch = false
    @State private var showPhoneMenu = false
    @AppStorage("vshook.native.grid.open") private var gridOpen = false
    @State private var confirmSave = false
    @State private var confirmLive = false
    @AppStorage("vshook.native.mainTransport.hidden") private var hideTransport = false
    @AppStorage("vshook.native.light") private var light = false
    @AppStorage("vshook.native.hideAccessNotice") private var hideAccessNotice = false
    @State private var accessRevision: String?
    @State private var accessDeadline = Date.distantPast
    var body: some View {
        Group {
            if session.requiresAuth && !session.authenticated { auth }
            else if showSearch { DirectorSearchView(session: session) { showSearch = false; session.query = "" } }
            else if session.panel == "tp" {
                TelepromptView(session: session, openPlaylists: { sheet = "playlists" }, songTools: { item in toolSong = item; session.select(item, sourcePage: "playlist"); sheet = "songTools" }).padding(8).background(Color(hex: "05070B").ignoresSafeArea())
            }
            else if session.tablet { tabletWorkspace }
            else { phoneWorkspace }
        }.accessibilityHidden(["recados", "settings", "projects", "playlists", "timer", "playHold", "songTools", "multiloop", "premix"].contains(sheet ?? ""))
            .foregroundColor(light ? Color(hex: "111827") : .white)
            .environment(\.colorScheme, light ? .light : .dark)
            .onAppear { session.start() }
            .onChange(of: session.authenticated) { HookOrientation.set(tablet: $0 && session.tablet) }
            .onChange(of: session.snapshot["blockedInterfaceAttemptRevision"]) { _ in syncAccessNotice() }
            .onDisappear { session.suspend() }
            .sheet(isPresented: Binding(get: { sheet != nil && !["recados", "settings", "projects", "playlists", "timer", "playHold", "songTools", "multiloop", "premix"].contains(sheet ?? "") }, set: { if !$0 { sheet = nil } })) { sheetContent }
            .overlay {
                if sheet == "recados" {
                    RecadosView(base: session.base, identity: session.noticeIdentity, back: { sheet = nil })
                        .onAppear { HookOrientation.set(tablet: false) }
                        .onDisappear { HookOrientation.set(tablet: session.tablet) }
                } else if sheet == "premix" {
                    DirectorPremixView(session: session, song: toolSong, close: { sheet = nil }).padding(session.tablet ? 8 : 4).background(Color(hex: "05070B"))
                } else if sheet == "songTools" {
                    DirectorDialog(tablet: session.tablet, compact: true, maxWidth: 720) {
                        DirectorSongToolsDialog(session: session, song: toolSong, open: { tool in
                            session.command(tool == "premix" ? "premix_focus_song" : "multiloop_focus", session.targetPayload(toolSong)); sheet = tool
                        }, close: { sheet = nil })
                    }
                } else if sheet == "playHold" {
                    DirectorDialog(tablet: session.tablet, compact: true, maxWidth: 600) { DirectorPlayDialog(session: session) { sheet = nil } }
                } else if sheet == "multiloop" {
                    DirectorDialog(tablet: session.tablet, compact: true, maxWidth: 850) { DirectorMultiLoopsDialog(session: session, song: toolSong, back: { sheet = "songTools" }, close: { sheet = nil }) }
                } else if sheet == "projects" {
                    DirectorDialog(tablet: session.tablet) { DirectorProjectDialog(session: session, projects: projects) { sheet = nil } }
                } else if sheet == "playlists" {
                    DirectorDialog(tablet: session.tablet) { DirectorPlaylistDialog(session: session) { sheet = nil } }
                } else if sheet == "timer" {
                    DirectorDialog(tablet: session.tablet, compact: true, maxWidth: 560) { DirectorTimerDialog(session: session) { sheet = nil } }
                } else if sheet == "settings" {
                    DirectorModal {
                        HookSettingsView(session: session, exit: back, close: { sheet = nil })
                    }
                }
            }
            .overlay(alignment: .bottom) {
                TimelineView(.periodic(from: .now, by: 0.25)) { context in
                    if !session.readOnly && session.authenticated && !hideAccessNotice && session.snapshot["blockInterfaceWhenDirectorConnected"].bool && context.date < accessDeadline {
                        DirectorControl(title: "PERMITIR", background: Color(hex: "16A34A"), height: 44) {
                            accessDeadline = .distantPast
                            session.command("director_set_interface_blocking", ["enabled": false, "blockInterfaceWhenDirectorConnected": false], optimistic: ["blockInterfaceWhenDirectorConnected": false, "directorInterfaceBlocked": false, "sharedControl": true, "exclusiveControl": false])
                            session.command("director_allow_local_interface", ["allow": true, "keepDirectorConnected": true])
                        }.frame(width: 180).padding(16).accessibilityLabel("Permitir controle da interface no computador")
                    }
                }
            }
            .alert("Salvar o projeto no computador?", isPresented: $confirmSave) {
                Button("Cancelar", role: .cancel) {}
                Button("Salvar") { session.command("save_project", ["confirmed": true]) }
            }
            .alert("Alterar o modo LIVE?", isPresented: $confirmLive) {
                Button("Cancelar", role: .cancel) {}
                Button("Confirmar") {
                    let next = !session.liveEnabled
                    session.command("live_set", ["enabled": .bool(next), "live": .bool(next), "desiredState": .bool(next)], optimistic: ["liveModeEnabled": .bool(next), "liveEnabled": .bool(next)])
                }
            }
            
    }
    private func syncAccessNotice() {
        let revision = session.snapshot["blockedInterfaceAttemptRevision"].string
        guard !revision.isEmpty, revision != "0", revision != accessRevision else { return }
        let first = accessRevision == nil
        accessRevision = revision
        let recent = abs(Date().timeIntervalSince1970 - session.snapshot["blockedInterfaceAttemptAtMs"].double / 1000) <= 12
        if !first || recent { accessDeadline = Date().addingTimeInterval(8) }
    }
    private var auth: some View {
        HookScreen(title: "VS Hook • Diretor", back: back) {
            Spacer()
            HookCard {
                Image("HookLogo").resizable().scaledToFit().frame(width: 90, height: 90)
                SecureField("Senha do Diretor", text: $password).modifier(HookField()).onSubmit { session.login(password) }
                HookButton(title: "ACESSAR", expand: true) { session.login(password) }.disabled(!session.connected)
                HookStatus(text: session.message)
            }.frame(maxWidth: 440).padding()
            Spacer()
        }
    }
    private var header: some View {
        HStack(spacing: 6) {
            DirectorControl(title: session.page == "regions" ? "LISTA GERAL" : session.activePlaylist.name.uppercased(), background: Color(hex: "101722"), height: 30, size: 10) { if !session.readOnly { sheet = "playlists" } }
            TimelineView(.periodic(from: .now, by: 1)) { context in
                DirectorControl(title: session.timerText(at: context.date), background: Color(hex: "16120A"), foreground: Color(hex: "FACC15"), height: 30, size: 12) { if !session.readOnly { sheet = "timer" } }
            }.frame(width: 104).accessibilityIdentifier("vshook.timer.open")
            if !session.readOnly {
                Button { showPhoneMenu.toggle() } label: { Image(systemName: "line.3.horizontal").frame(width: 32, height: 30) }
                    .buttonStyle(DirectorButtonStyle()).accessibilityIdentifier("vshook.phone.menu")
            }
            Button { sheet = "settings" } label: { Image(systemName: "gearshape.fill").frame(width: 32, height: 30) }.buttonStyle(DirectorButtonStyle()).accessibilityLabel("CONFIG").accessibilityIdentifier("vshook.config.open")
        }
    }
    private var navigation: some View {
        HStack(spacing: 6) {
            DirectorControl(title: "REPERTÓRIO", background: Color(hex: session.page == "playlist" ? "4338CA" : "172033"), height: 41, size: 11) { session.setPage("playlist"); session.panel = "" }
            DirectorControl(title: "MÚSICAS", background: Color(hex: session.page == "regions" ? "4338CA" : "172033"), height: 41, size: 11) { session.setPage("regions"); session.panel = "" }
            DirectorControl(title: "LOOP", background: Color(hex: session.snapshot.first("loopEnabled", "loopActive").bool ? "15803D" : "172033"), height: 41, size: 11) { session.toggleLoop() }
        }
    }
    private var borderColor: Color {
        if borderMode == "none" { return .clear }
        let colors = ["yellow":"FACC15", "green":"22C55E", "blue":"3B82F6", "purple":"A855F7", "red":"EF4444", "white":"FFFFFF"]
        return Color(hex: colors[borderMode] ?? "FACC15")
    }
    private var borderOutline: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { context in
            RoundedRectangle(cornerRadius: 6).strokeBorder(borderMode == "rgb" ? Color(hue: context.date.timeIntervalSince1970.truncatingRemainder(dividingBy: 6) / 6, saturation: 0.9, brightness: 1) : borderColor, lineWidth: 1.5)
        }.allowsHitTesting(false)
    }
    private var tabletWorkspace: some View {
        HStack(spacing: 8) {
            if session.panel != "tp" && session.panel != "mixer" { leftRail }
            VStack(spacing: 0) {
                tabletNavigation
                VStack(spacing: 8) {
                    tabletStatus
                    mainContent.frame(maxWidth: .infinity, maxHeight: .infinity)
                    if gridOpen && session.panel != "mixer" { DirectorGridPanel(session: session) }
                    if !session.message.isEmpty { HookStatus(text: session.message).onTapGesture { session.message = "" } }
                }.padding(6)
                    .background(light ? Color(hex: "D7DCE2") : Color(hex: "080D14"))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .overlay(borderOutline)
            }
            if session.panel != "tp" && session.panel != "mixer" { rightRail }
        }.padding(8).frame(maxWidth: .infinity, maxHeight: .infinity)
            .background((light ? Color(hex: "D7DCE2") : Color(hex: "080D14")).ignoresSafeArea())
            .ignoresSafeArea()
    }
    private var phoneWorkspace: some View {
        VStack(spacing: 7) {
            header
            if !session.readOnly { navigation }
            mainContent.frame(maxWidth: .infinity, maxHeight: .infinity)
            if !session.message.isEmpty { HookStatus(text: session.message).onTapGesture { session.message = "" } }
        }.padding(6)
            .background(light ? Color(hex: "E1E4E8") : Color(hex: "080D14"))
            .clipShape(RoundedRectangle(cornerRadius: 6)).overlay(borderOutline).padding(8)
            .background((light ? Color(hex: "E1E4E8") : HookTheme.background).ignoresSafeArea())
            .overlay(alignment: .topTrailing) {
                if showPhoneMenu {
                    ZStack(alignment: .topTrailing) {
                        Color.black.opacity(0.01).contentShape(Rectangle()).onTapGesture { showPhoneMenu = false }
                        ScrollView {
                            VStack(spacing: 10) {
                                phoneMenuButton("LUPA") { showSearch = true }
                                phoneMenuButton("SESSÃO") { sheet = "projects" }
                                phoneMenuButton("TCP") { togglePanel("mixer") }
                                phoneMenuButton("TUNER", color: "164E63") { togglePanel("tuner") }
                                phoneMenuButton("BPM", color: "082F49") { togglePanel("bpm") }
                                phoneMenuButton("RECADOS", color: "592326") { sheet = "recados" }
                                phoneMenuButton("MODO LIVE", color: session.liveEnabled ? "15803D" : "991B1B") { confirmLive = true }
                                phoneMenuButton("BY", color: session.snapshot.first("multiloopBypassEnabled", "multiLoopBypass", "bypassEnabled").bool ? "15803D" : "991B1B") { session.toggleBypass() }
                                if session.page == "playlist" {
                                    phoneMenuButton("AT/BL", color: session.snapshot["autoBlocoEnabled"].bool ? "15803D" : "1F2937") {
                                        let next = !session.snapshot["autoBlocoEnabled"].bool
                                        session.command("auto_bloco_set", ["desiredAutoBloco": .bool(next), "autoBlocoEnabled": .bool(next), "desiredState": .string(next ? "on" : "off")], optimistic: ["autoBlocoEnabled": .bool(next)])
                                    }
                                }
                            }.padding(12)
                        }.frame(width: 176, height: session.page == "playlist" ? 590 : 526)
                            .background(Color(hex: "0F172A")).cornerRadius(14)
                            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color(hex: "334155")))
                            .padding(.top, 47).padding(.trailing, 50)
                    }
                }
            }
    }
    private func phoneMenuButton(_ title: String, color: String = "1F2937", action: @escaping () -> Void) -> some View {
        DirectorControl(title: title, background: Color(hex: color), height: 54, size: 18) { showPhoneMenu = false; action() }
    }
    private var tabletNavigation: some View {
        HStack(spacing: 4) {
            tabletTab("REPERTÓRIO", active: session.page == "playlist" && session.panel != "mixer", primary: true) { session.setPage("playlist"); session.panel = "" }
            tabletTab("MÚSICAS", active: session.page == "regions" && session.panel != "mixer", primary: true) { session.setPage("regions"); session.panel = "" }
            if session.panel == "mixer" {
                DirectorControl(title: "RPTS", background: Color(hex: "FACC15"), foreground: .black, height: 32, size: 11) { sheet = "playlists" }
                DirectorControl(title: "LUPA", background: Color(hex: showSearch ? "22C55E" : "7C3AED"), height: 32, size: 11) { showSearch.toggle() }
            } else {
                tabletTab("TUNER", active: session.panel == "tuner") { togglePanel("tuner") }
                tabletTab("BPM", active: session.panel == "bpm") { togglePanel("bpm") }
            }
            tabletTab("TCP", active: session.panel == "mixer") { togglePanel("mixer") }
            tabletTab("PARTS", active: session.panel == "parts") { togglePanel("parts") }
        }.padding(4).frame(height: 42).background(Color(hex: light ? "D8E0E7" : "111827"))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "263244")))
    }
    private func tabletTab(_ title: String, active: Bool, primary: Bool = false, action: @escaping () -> Void) -> some View {
        DirectorControl(title: title, background: Color(hex: active ? "22C55E" : primary ? "FACC15" : "C90000"),
                        foreground: primary && !active ? Color(hex: "050505") : .white,
                        border: Color(hex: active ? "4ADE80" : primary ? "FDE047" : "FF2A2A"), height: 32, size: 11, action: action)
    }
    private var tabletStatus: some View {
        HStack(spacing: 6) {
            DirectorControl(title: session.page == "regions" ? "LISTA GERAL" : session.activePlaylist.name.uppercased(),
                            background: Color(hex: "101722"), height: 30, size: 11) { if session.page == "playlist" { sheet = "playlists" } }
            TimelineView(.periodic(from: .now, by: 1)) { context in
                DirectorControl(title: session.timerText(at: context.date), background: Color(hex: "16120A"),
                                foreground: Color(hex: "FACC15"), border: Color(hex: "FACC15"), height: 30, size: 12) { sheet = "timer" }.accessibilityIdentifier("vshook.timer.open")
            }
        }
    }
    private var leftRail: some View {
        VStack(spacing: 3) {
            DirectorSideButton(title: "LUPA", background: Color(hex: "283452"), foreground: Color(hex: "BFDBFE"), border: Color(hex: "536B9D"), active: showSearch) { showSearch.toggle() }
            DirectorSideButton(title: "SESSÃO", background: Color(hex: "153F4A"), foreground: Color(hex: "A5F3FC"), border: Color(hex: "28798B")) { sheet = "projects" }
            DirectorSideButton(title: "TP", background: Color(hex: "402060"), foreground: Color(hex: "D8B4FE"), border: Color(hex: "7540A3")) { togglePanel("tp") }
            DirectorSideButton(title: "RECADOS", background: Color(hex: "592326"), foreground: Color(hex: "FCA5A5"), border: Color(hex: "A54348")) { sheet = "recados" }
            DirectorSideButton(title: "CONFIG", background: Color(hex: "303846"), foreground: Color(hex: "E2E8F0"), border: Color(hex: "667085"), active: sheet == "settings") { sheet = "settings" }
        }.modifier(DirectorRailStyle())
    }
    private var rightRail: some View {
        VStack(spacing: 3) {
            DirectorSideButton(title: "RPTS", foreground: Color(hex: "FACC15")) { sheet = "playlists" }.frame(height: 72)
            DirectorSideButton(title: "BY", background: Color(hex: session.bypassActive ? "FACC15" : "B00000"),
                               foreground: session.bypassActive ? Color(hex: "111827") : .white,
                               border: Color(hex: session.bypassActive ? "FFF176" : "FF2A2A"), vertical: false) { session.toggleBypass() }.frame(height: 72)
            ForEach(1...3, id: \.self) { value in
                let slot = value + previewPage * 3
                DirectorSideButton(title: "P\(slot)", background: Color(hex: session.snapshot["previewMode"].int == slot ? "15803D" : "172033"), vertical: false) {
                    let next = session.snapshot["previewMode"].int == slot ? 0 : slot
                    session.command("preview_set", ["previewIndex": .number(Double(next)), "previewMode": .number(Double(next)), "desiredState": .bool(next > 0)], optimistic: ["previewMode": .number(Double(next))])
                }.highPriorityGesture(LongPressGesture(minimumDuration: 0.5).onEnded { _ in previewPage = (previewPage + 1) % 2 })
            }
            DirectorSideButton(title: gridOpen ? "▶︎" : "◀︎", foreground: Color(hex: "FACC15"), vertical: false) { gridOpen.toggle() }
                .frame(height: 48).accessibilityLabel("Representação gráfica")
        }.modifier(DirectorRailStyle())
    }
    private var mainContent: some View {
        VStack(spacing: 8) {
            if session.panel == "tp" { TelepromptView(session: session, openPlaylists: { sheet = "playlists" }, songTools: { item in toolSong = item; session.select(item, sourcePage: "playlist"); sheet = "songTools" }) }
            else if session.panel == "mixer" { TCPView(session: session, settings: { sheet = "settings" }) }
            else if session.tablet && ["tuner", "bpm"].contains(session.panel) { songList }
            else if ["parts", "tuner", "bpm"].contains(session.panel) {
                if session.tablet && session.panel == "parts" {
                    GeometryReader { geometry in
                        HStack(spacing: 16) { songList.frame(width: max(1, (geometry.size.width - 16) * 0.60)); DirectorPartsView(session: session).frame(maxWidth: .infinity) }
                    }
                } else if session.panel == "parts" { DirectorPartsView(session: session, standalone: true) }
                else { ToolPanel(session: session, tool: session.panel) }
            } else { songList }
        }
    }
    private var songList: some View {
        VStack(spacing: 8) {
            if !session.readOnly { playbackControls } else { DirectorControl(title: "TP", height: 42) { togglePanel("tp") } }
            if !hideTransport { DirectorPlaybackHeader(session: session).simultaneousGesture(DragGesture(minimumDistance: 28).onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) * 0.8 else { return }
                if value.translation.width > 0 { session.panel = "tp" }
                else if !session.readOnly { session.panel = "parts" }
            }).onLongPressGesture { if session.tablet { gridOpen.toggle() } else { sheet = "seek" } } }
            DirectorSongList(session: session) { item in
                toolSong = item; session.select(item); sheet = "songTools"
            }
        }
    }
    private var playbackControls: some View {
        HStack(spacing: 5) {
            DirectorControl(title: session.playing ? "STOP" : "PLAY", background: Color(hex: session.playing ? "DC2626" : "166534"), border: Color(hex: session.playing ? "F87171" : "22C55E")) { session.command("play_button") }
                .accessibilityIdentifier("vshook.transport.play")
                .highPriorityGesture(LongPressGesture(minimumDuration: 0.5).onEnded { _ in sheet = "playHold" })
            if session.page == "playlist" {
                DirectorControl(title: "AUTO 1", background: Color(hex: session.autoEnabled(1) ? "15803D" : "172033")) { session.toggleAuto(1) }
                DirectorControl(title: "AUTO 2", background: Color(hex: session.autoEnabled(2) ? "15803D" : "172033")) { session.toggleAuto(2) }
                if session.tablet {
                    DirectorControl(title: "AT/BL", background: Color(hex: session.snapshot["autoBlocoEnabled"].bool ? "15803D" : "172033")) {
                        let next = !session.snapshot["autoBlocoEnabled"].bool
                        session.command("auto_bloco_set", ["desiredAutoBloco": .bool(next), "autoBlocoEnabled": .bool(next), "desiredState": .string(next ? "on" : "off")], optimistic: ["autoBlocoEnabled": .bool(next)])
                    }
                }
            }
            DirectorControl(title: "STOP BREAK", background: Color(hex: session.playing ? "DC2626" : "374151")) {
                session.command("director_stop_break", session.target.merging(["noSeek": true, "preserveCursor": true, "transportOnly": true, "ignoreFadeout": true, "stopBreak": true]))
            }
            if session.tablet {
                DirectorControl(title: "LIVE", background: Color(hex: session.liveEnabled ? "15803D" : "991B1B")) { confirmLive = true }
            }
        }.disabled(!session.connected || !session.authenticated)
    }
    private func togglePanel(_ value: String) {
        let previous = session.panel
        session.panel = previous == value ? "" : value
        if previous == "tuner" || previous == "bpm" { session.command("set_\(previous)_visibility", ["visible": false]) }
        if session.panel == "tuner" || session.panel == "bpm" { session.command("\(value)_focus", ["visible": true]) }
        if session.panel == "mixer" { session.command("mixer_focus", ["view": "tracks"]) }
    }
    @ViewBuilder private var sheetContent: some View {
        if sheet == "recados" { RecadosView(base: session.base, identity: session.noticeIdentity, back: { sheet = nil }) }
        else if sheet == "seek" {
            VStack(spacing: 12) {
                DirectorGridPanel(session: session)
                HStack {
                    DirectorControl(title: session.playing ? "PAUSE" : "PLAY", background: Color(hex: session.playing ? "B91C1C" : "166534"), height: 44) {
                        session.command(session.playing ? "director_pause" : "director_play_no_seek", session.target.merging(["noSeek": true, "preserveCursor": true, "transportOnly": true]))
                    }
                    DirectorControl(title: "FECHAR", height: 44) { sheet = nil }
                }
            }.padding(14).background(Color(hex: "0B1220"))
        }
    }
}
