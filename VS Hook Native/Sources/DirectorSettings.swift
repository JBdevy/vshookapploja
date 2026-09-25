import SwiftUI

struct HookSettingsView: View {
    @ObservedObject var session: HookSession
    let exit: () -> Void
    let close: () -> Void
    @StateObject private var preferences: TPPreferences
    @State private var tabControls = false
    @State private var confirmSort = false
    @State private var confirmNumber = false
    @State private var descending = false
    @AppStorage("vshook.native.number.sort") private var numberSort = ""
    @AppStorage("vshook.native.light") private var light = false
    @AppStorage("vshook.native.haptics") private var haptics = false
    @AppStorage("vshook.native.sound") private var sound = false
    @AppStorage("vshook.native.mainTransport.hidden") private var hideTransport = false
    @AppStorage("vshook.native.hideAccessNotice") private var hideAccessNotice = false
    @AppStorage("vshook.native.number.region") private var regionNumber = false
    @AppStorage("vshook.native.border.mode") private var borderMode = "yellow"
    @AppStorage("vshook.native.teleprompt.slot") private var tpSlot = 1
    init(session: HookSession, exit: @escaping () -> Void, close: @escaping () -> Void) {
        self.session = session; self.exit = exit; self.close = close
        _preferences = StateObject(wrappedValue: TPPreferences(role: session.mode.rawValue))
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(tabControls ? "CONFIG ABA TP" : "CONFIGURAÇÕES").font(.custom("Arial-BoldMT", size: 16))
            ScrollView {
                VStack(spacing: 10) {
                    if tabControls { tpControls }
                    else { categories }
                }
            }
            HStack(spacing: 10) {
                DirectorControl(title: tabControls ? "VOLTAR" : "SAIR", background: Color(hex: tabControls ? "16A34A" : "B91C1C"), height: 38) { if tabControls { tabControls = false } else { close(); exit() } }
                DirectorControl(title: "FECHAR", height: 38, action: close)
            }
        }.padding(16).foregroundColor(light ? Color(hex: "111827") : .white).background(Color(hex: light ? "EDF1F5" : "101827"))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "475569")))
            .alert(descending ? "Organizar do maior para o menor?" : "Organizar do menor para o maior?", isPresented: $confirmSort) {
                Button("Cancelar", role: .cancel) {}
                Button("Confirmar") { sort(descending: descending) }
            }
            .alert("NUMBER", isPresented: $confirmNumber) {
                Button("Cancelar", role: .cancel) {}
                Button("Confirmar") { regionNumber.toggle(); if regionNumber { sort(descending: false) } }
            } message: {
                Text(regionNumber ? "A numeração voltará a seguir a ordem da própria lista." : "A lista será reorganizada de acordo com o ID da região. Os blocos permanecerão exatamente onde estão.")
            }
    }
    private var categories: some View {
        VStack(spacing: 10) {
            group("TEMA") {
                HStack(spacing: 8) {
                    option("MODO ESCURO", active: !light) { light = false }
                    option("MODO CLARO", active: light) { light = true }
                }
                DirectorControl(title: "Cor da borda - " + borderLabel, height: 34, size: 12) {
                    let values = ["yellow", "green", "blue", "purple", "red", "white", "none", "rgb"]
                    borderMode = values[((values.firstIndex(of: borderMode) ?? 0) + 1) % values.count]
                }
            }
            group("SOM E VIBRAÇÃO") {
                HStack(spacing: 8) { option("SOM LIGADO", active: sound) { sound = true }; option("SOM DESLIGADO", active: !sound) { sound = false } }
                HStack(spacing: 8) { option("VIBRAR LIGADO", active: haptics) { haptics = true }; option("VIBRAR DESLIGADO", active: !haptics) { haptics = false } }
            }
            group("TELEPROMPT") {
                DirectorControl(title: "CONFIG ABA TP", background: Color(hex: "7C3AED"), border: Color(hex: "A78BFA"), height: 34, size: 12) { tabControls = true }
                option(hideTransport ? "PAINEL TRANSPORTE PRINCIPAL OCULTO" : "OCULTAR PAINEL TRANSPORTE DA TELA PRINCIPAL", active: hideTransport, offRed: true) { hideTransport.toggle() }
            }
            if !session.readOnly {
                group("ORDENS") {
                    HStack(spacing: 8) {
                        option("NUMBER", active: regionNumber, offRed: true) { confirmNumber = true }
                        DirectorControl(title: "0-9", height: 34, size: 12) {
                            descending = DirectorNumberOrder.ascending(session.allItems, localDirection: session.page == "regions" ? numberSort : "")
                            confirmSort = true
                        }.disabled(!regionNumber || session.allItems.filter { !$0.isSongBlock }.count < 2)
                    }
                }
                group("GAVETAS") {
                    option("VIEW — Mostrar/Ocultar", active: session.snapshot["familyViewControlsEnabled"].bool, offRed: true) {
                        let next = !session.snapshot["familyViewControlsEnabled"].bool
                        session.command("director_family_view_set", ["enabled": .bool(next), "familyViewControlsEnabled": .bool(next), "desiredState": .string(next ? "on" : "off")], optimistic: ["familyViewControlsEnabled": .bool(next)])
                    }
                }
                group("ACESSO DA INTERFACE") {
                    option("Bloquear o uso da interface quando estiver conectado ao app do Diretor", active: session.snapshot["blockInterfaceWhenDirectorConnected"].bool, offRed: true) {
                        let next = !session.snapshot["blockInterfaceWhenDirectorConnected"].bool
                        session.command("director_set_interface_blocking", ["enabled": .bool(next), "blockInterfaceWhenDirectorConnected": .bool(next), "desiredState": .string(next ? "on" : "off")], optimistic: ["blockInterfaceWhenDirectorConnected": .bool(next)])
                    }
                    option("Bloquear notificação de acesso da interface", active: hideAccessNotice, offRed: true) { hideAccessNotice.toggle() }
                }
            }
        }
    }
    private var tpControls: some View {
        VStack(spacing: 15) {
            let hidden = preferences.settings(tpSlot)["hideTransport"].bool
            option(hidden ? "PAINEL TRANSPORTE OCULTO" : "OCULTAR PAINEL TRANSPORTE", active: hidden, offRed: true) { preferences.set("hideTransport", .bool(!hidden), slot: tpSlot) }
            if !session.readOnly {
            Text("ESCOLHA OS BOTÕES QUE SERÃO MOSTRADOS NO RODAPÉ DO TELEPROMPT").font(.custom("Arial-BoldMT", size: 12)).multilineTextAlignment(.center).foregroundColor(Color(hex: "CBD5E1"))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: session.tablet ? (session.readOnly ? 3 : 6) : 3), spacing: 10) {
                ForEach(availableControls, id: \.0) { key, label in
                    option(label, active: preferences.control(key, tablet: session.tablet), offRed: true, height: 54) { preferences.toggleControl(key, tablet: session.tablet) }
                        .accessibilityIdentifier("vshook.config.tp." + key)
                        .accessibilityValue(preferences.control(key, tablet: session.tablet) ? "Ligado" : "Desligado")
                }
            }
            }
        }
    }
    private var availableControls: [(String,String)] {
        session.readOnly ? [] : session.tablet ? [("play","PLAY"),("list","LIST"),("auto1","AUTO 1"),("auto2","AUTO 2"),("parts","PARTS"),("stopBreak","STOP BREAK")] : [("play","PLAY"),("list","LIST"),("auto1","AUTO 1"),("loop","LOOP"),("parts","PARTS")]
    }
    private func option(_ title: String, active: Bool, offRed: Bool = false, height: CGFloat = 34, action: @escaping () -> Void) -> some View {
        Button { HookFeedback.tap(); action() } label: {
            Text(title).font(.custom("Arial-BoldMT", size: 12)).multilineTextAlignment(.center).frame(maxWidth: .infinity).frame(minHeight: height).padding(.horizontal, 8)
        }.buttonStyle(DirectorButtonStyle(background: Color(hex: active ? (offRed ? "16A34A" : "DCA700") : offRed ? "991B1B" : "283140"), foreground: active && !offRed ? .black : .white, border: Color(hex: active ? (offRed ? "4ADE80" : "FACC15") : offRed ? "EF4444" : "475569")))
    }
    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.custom("ArialMT", size: 11))
            content()
        }
    }
    private var borderLabel: String { ["yellow":"AMARELO", "green":"VERDE", "blue":"AZUL", "purple":"ROXO", "red":"VERMELHO", "white":"BRANCO", "none":"DESLIGADA", "rgb":"RGB"][borderMode] ?? "AMARELO" }
    private func sort(descending: Bool) {
        if session.page == "regions" { numberSort = descending ? "desc" : "asc" }
        else {
            session.command("sort_playlist_by_number", ["direction": .string(descending ? "desc" : "asc"), "descending": .bool(descending), "activeTab": "playlist", "page": "playlist"])
        }
    }
}
