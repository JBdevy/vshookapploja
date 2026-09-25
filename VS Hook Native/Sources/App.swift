import SwiftUI
import UIKit

@main
struct VSHookNativeApp: App {
    @UIApplicationDelegateAdaptor(HookAppDelegate.self) private var appDelegate
    var body: some Scene {
        WindowGroup {
            HookRootView()
                .preferredColorScheme(.dark)
                .tint(HookTheme.gold)
                .statusBarHidden()
        }
    }
}
final class HookAppDelegate: NSObject, UIApplicationDelegate {
    static var orientations: UIInterfaceOrientationMask = .portrait
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask { Self.orientations }
}
@MainActor enum HookOrientation {
    static func set(tablet: Bool) {
        HookAppDelegate.orientations = tablet ? .landscape : .portrait
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        if #available(iOS 16, *) {
            scene.windows.first?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: HookAppDelegate.orientations))
        } else {
            UIDevice.current.setValue((tablet ? UIInterfaceOrientation.landscapeRight : .portrait).rawValue, forKey: "orientation")
            UIViewController.attemptRotationToDeviceOrientation()
        }
    }
}

struct HookRootView: View {
    @StateObject private var discovery = DiscoveryModel()
    @State private var session: HookSession?
    @State private var route = "home"
    @State private var chosenMode: HookMode = .director
    @State private var tablet = false
    @State private var computer = ""
    @Environment(\.scenePhase) private var phase
    var body: some View {
        Group {
            if let session {
                if session.mode == .recados {
                    RecadosView(base: session.project.director, identity: nil, back: leave)
                } else if session.mode == .drop {
                    DropView(host: session.project.director.host ?? "", back: leave)
                } else {
                    DirectorView(session: session, projects: discovery.projects, back: leave)
                }
            } else if route == "chat" {
                ChatView(back: { route = "home" })
            } else if route == "drop" {
                DropView(host: discovery.manualHost, back: { route = "home" })
            } else {
                shell
            }
        }
        .onAppear {
            HookOrientation.set(tablet: false)
            discovery.search()
        }
        .onChange(of: phase) { phase in
            UIApplication.shared.isIdleTimerDisabled = phase == .active && session != nil
            if phase == .active { session?.start() }
            else { session?.suspend(); discovery.stop() }
        }
        .onChange(of: session?.dismissed) { if $0 == true { leave() } }
        .onOpenURL { url in
            // A scanned desktop QR URL contains the same host and optional chatKey.
            if let host = url.host, LocalNetwork.number(host) != nil { discovery.manualHost = host; discovery.search(manual: true) }
            if let key = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "chatKey" })?.value, key.count == 64 {
                ChatModel.bootstrapURL = url; route = "chat"
            }
        }
    }
    private var shell: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 0) {
                    Spacer(minLength: 24)
                    HookCard {
                        Image("HookLogo").resizable().scaledToFit().frame(width: 74, height: 74).clipShape(RoundedRectangle(cornerRadius: 16))
                        Text(route == "home" ? "VS Hook" : route == "device" ? "Modo Diretor" : route == "computers" ? "Escolha o computador" : chosenMode.title)
                            .font(.system(size: 30, weight: .bold))
                        if route == "home" { home }
                        else if route == "device" { deviceSelection }
                        else if route == "computers" { computers }
                        else { projects }
                        Text("Versão \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.2")").font(.footnote.bold()).foregroundColor(HookTheme.muted)
                    }.frame(maxWidth: 480)
                    Spacer(minLength: 24)
                }.padding(18).frame(width: geometry.size.width).frame(minHeight: geometry.size.height)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .background(
                RadialGradient(colors: [HookTheme.gold.opacity(0.14), HookTheme.background], center: .top, startRadius: 0, endRadius: 480).ignoresSafeArea()
            )
        }.frame(maxWidth: .infinity, maxHeight: .infinity).foregroundColor(.white).accessibilityIdentifier("vshook.native.root")
    }
    private var home: some View {
        VStack(spacing: 12) {
            HookStatus(text: discovery.status)
            if discovery.searching { ProgressView().tint(HookTheme.gold) }
            if !discovery.projects.isEmpty {
                ForEach(HookMode.allCases) { mode in
                    HookButton(title: mode == .chat || mode == .drop ? "Entrar no \(mode.title)" : "Entrar como \(mode.title)", icon: mode.icon, expand: true) { choose(mode) }
                        .accessibilityIdentifier("vshook.mode.\(mode.rawValue)")
                }
            } else {
                HookButton(title: "Entrar no Chat Hook", icon: "bubble.left.and.bubble.right", expand: true) { route = "chat"; discovery.stop() }
                HookButton(title: "Entrar no Drop Hook", icon: "arrow.up.arrow.down", expand: true) { route = "drop"; discovery.stop() }
            }
            ForEach(discovery.peers, id: \.id) { peer in
                HookButton(title: peer.name, icon: "desktopcomputer", expand: true) { discovery.connectPeer(peer) }
            }
            HookButton(title: "Conectar diretamente a um Mac", icon: "antenna.radiowaves.left.and.right", filled: false, expand: true) { discovery.searchApplePeers() }
            Divider().overlay(Color.white.opacity(0.12))
            TextField("IP do computador", text: $discovery.manualHost).keyboardType(.decimalPad).textInputAutocapitalization(.never)
                .modifier(HookField()).accessibilityIdentifier("vshook.manual.ip")
            HStack {
                HookButton(title: "Conectar", expand: true) { discovery.search(manual: true) }.accessibilityIdentifier("vshook.manual.connect")
                HookButton(title: "Procurar", color: .green, expand: true) { discovery.search() }.accessibilityIdentifier("vshook.search")
            }
        }
    }
    private var deviceSelection: some View {
        VStack(spacing: 18) {
            HookStatus(text: "Escolha em qual dispositivo vai usar o Diretor.")
            HStack(spacing: 14) {
                deviceButton("Celular", icon: "iphone", tablet: false)
                deviceButton("Tablet", icon: "ipad.landscape", tablet: true)
            }
            HookButton(title: "Voltar", filled: false, expand: true) { route = "home" }
        }
    }
    private func deviceButton(_ text: String, icon: String, tablet: Bool) -> some View {
        Button { self.tablet = tablet; showComputers() } label: {
            VStack(spacing: 16) { Image(systemName: icon).font(.system(size: 45)); Text(text) }.frame(maxWidth: .infinity).padding(.vertical, 18)
        }.buttonStyle(HookButtonStyle(filled: false))
    }
    private var computers: some View {
        VStack(spacing: 12) {
            ForEach(Array(Set(discovery.projects.map(\.computerID))).sorted(), id: \.self) { id in
                HookButton(title: discovery.projects.first { $0.computerID == id }?.computer ?? id, icon: "desktopcomputer", expand: true) { computer = id; route = "projects" }
            }
            HookButton(title: "Voltar", filled: false, expand: true) { route = "device" }
        }
    }
    private var projects: some View {
        VStack(spacing: 12) {
            HookStatus(text: "Selecione a sessão disponível na rede Wi-Fi.")
            ForEach(discovery.projects.filter { computer.isEmpty || $0.computerID == computer }) { project in
                HookButton(title: project.name, icon: "music.note.list", expand: true) { enter(project, mode: chosenMode) }.accessibilityIdentifier("vshook.project.\(project.tab)")
            }
            HStack {
                HookButton(title: "Voltar", filled: false, expand: true) { route = chosenMode == .director ? "device" : "home" }
                HookButton(title: "Atualizar", filled: false, expand: true) { discovery.search() }
            }
            if discovery.searching { ProgressView() }
        }
    }
    private func choose(_ mode: HookMode) {
        discovery.stop(); chosenMode = mode
        if mode == .chat { route = "chat" }
        else if mode == .director { route = "device" }
        else if let project = discovery.projects.first(where: \.active) ?? discovery.projects.first { enter(project, mode: mode) }
    }
    private func showComputers() {
        let ids = Set(discovery.projects.map(\.computerID))
        if ids.count > 1 { route = "computers" } else { computer = ids.first ?? ""; route = "projects" }
    }
    private func enter(_ project: HookProject, mode: HookMode) {
        discovery.stop(); discovery.remember(project)
        session = HookSession(project: project, mode: mode, tablet: mode == .director && tablet)
        UIApplication.shared.isIdleTimerDisabled = true
    }
    private func leave() {
        session?.suspend(); session = nil; route = "home"
        HookOrientation.set(tablet: false); UIApplication.shared.isIdleTimerDisabled = false
    }
}
