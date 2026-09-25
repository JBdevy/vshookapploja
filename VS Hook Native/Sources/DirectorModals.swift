import SwiftUI

struct DirectorDialog<Content: View>: View {
    var tablet: Bool
    var compact = false
    var maxWidth: CGFloat = 1040
    @ViewBuilder let content: Content
    var body: some View {
        GeometryReader { geometry in
            let inset: CGFloat = tablet ? 76 : 12
            let top: CGFloat = tablet ? 62 : 12
            ZStack(alignment: .top) {
                Color.black.opacity(0.32).ignoresSafeArea()
                content.frame(width: min(maxWidth, max(220, geometry.size.width - inset * 2)))
                    .frame(height: compact ? nil : max(100, geometry.size.height - top - 16))
                    .frame(maxHeight: max(100, geometry.size.height - top - 16), alignment: .top)
                    .padding(.top, top)
            }.frame(width: geometry.size.width, height: geometry.size.height)
        }.accessibilityAddTraits(.isModal)
    }
}
struct DirectorDialogStyle: ViewModifier {
    @AppStorage("vshook.native.light") private var light = false
    func body(content: Content) -> some View {
        content.padding(20).foregroundColor(light ? Color(hex: "111827") : .white)
            .background(Color(hex: light ? "EDF1F5" : "101827")).clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "334155")))
    }
}
struct DirectorProjectDialog: View {
    @ObservedObject var session: HookSession
    let projects: [HookProject]
    let close: () -> Void
    @State private var confirmSave = false
    private var entries: [JSON] {
        for key in ["projects", "projectTabs", "openProjects", "tabs"] {
            if !session.snapshot[key].array.isEmpty { return session.snapshot[key].array }
        }
        return projects.filter { $0.computerID == session.project.computerID }.map { ["id": .string($0.projectID), "name": .string($0.name), "index": .number(Double($0.tab))] }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("SESSÃO").font(.custom("Arial-BoldMT", size: 18))
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(Array(entries.enumerated()), id: \.offset) { index, project in
                        let id = project.first("id", "projectId", "tabId").string
                        let tab = project.first("index", "projectIndex").exists ? project.first("index", "projectIndex").int : index
                        let activeID = session.snapshot.first("currentProjectId", "projectId").string
                        let active = activeID.isEmpty ? session.snapshot["activeProjectTabIndex"].int == tab : activeID == id
                        let name = project.first("name", "projectName", "title", "label").string.trimmingCharacters(in: CharacterSet(charactersIn: "* "))
                        DirectorOptionRow(title: (project["dirty"].bool || (active && session.snapshot["projectDirty"].bool) ? "*" : "") + name.uppercased(), active: active) {
                            session.command("set_project_tab", ["id": .string(id), "projectId": .string(id), "targetId": .string(id), "projectIndex": .number(Double(tab)), "projectTabIndex": .number(Double(tab)), "tabIndex": .number(Double(tab))], optimistic: ["currentProjectId": .string(id), "activeProjectTabIndex": .number(Double(tab))])
                        }
                    }
                }
            }
            HStack {
                DirectorControl(title: "SAVE", background: Color(hex: session.snapshot["projectDirty"].bool ? "EAB308" : "166534"), height: 38) { confirmSave = true }.frame(width: 122)
                Spacer()
                DirectorControl(title: "OK", background: Color(hex: "22C55E"), foreground: .black, height: 38, action: close).frame(width: 122)
            }
        }.modifier(DirectorDialogStyle())
            .alert("SALVAR SESSÃO?", isPresented: $confirmSave) {
                Button("CANCELAR", role: .cancel) {}
                Button("SALVAR") { session.command("save_project", ["confirmed": true], optimistic: ["projectDirty": false]) }
            } message: { Text(session.projectName) }
    }
}
struct DirectorOptionRow: View {
    @AppStorage("vshook.native.playlist.marquee") private var marquee = false
    let title: String
    var detail = ""
    var active = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                DirectorMarquee(text: title, size: 13, enabled: marquee).frame(maxWidth: .infinity)
                if !detail.isEmpty { Text(detail).font(.custom("Arial-BoldMT", size: 9)).foregroundColor(Color(hex: "FACC15")) }
            }.padding(.horizontal, 9).frame(height: 35)
        }.buttonStyle(DirectorButtonStyle(background: Color(hex: active ? "831843" : "202B3B"), border: Color(hex: active ? "EC4899" : "374151")))
    }
}
struct DirectorPlaylistDialog: View {
    @ObservedObject var session: HookSession
    let close: () -> Void
    @State private var selected = ""
    @State private var previews = false
    @State private var copyChildren = false
    @State private var copied = false
    @AppStorage("vshook.native.playlist.marquee") private var marquee = false
    private var multi: Bool { session.snapshot["multiProjectPlaylistsEnabled"].bool }
    private var all: [JSON] {
        let shared = session.snapshot.first("openProjectPlaylists", "allProjectPlaylists")
        return shared.exists ? shared.array : session.playlists
    }
    private func local(_ item: JSON) -> Bool {
        let pid = item["projectId"].string
        return item["projectActive"].bool || pid.isEmpty || pid == session.snapshot.first("currentProjectId", "projectId").string
    }
    private func identity(_ item: JSON) -> String { item.first("selectorId", "selectionId").string.isEmpty ? item["projectId"].string + "|" + item.first("localPlaylistId", "playlistId", "id").string : item.first("selectorId", "selectionId").string }
    private var entries: [JSON] { multi ? all : all.filter(local) }
    private var chosen: JSON { entries.first { identity($0) == selected } ?? entries.first { $0["active"].bool || $0["current"].bool || (local($0) && $0.first("localPlaylistId", "playlistId", "id") == session.activePlaylist.first("id", "playlistId")) } ?? entries.first ?? .null }
    var body: some View {
        GeometryReader { geometry in
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("REPERTÓRIOS").font(.custom("Arial-BoldMT", size: 18)).frame(maxWidth: .infinity, alignment: .leading)
                    if geometry.size.width > 550 { actions }
                }
                if geometry.size.width <= 550 { actions }
                ScrollView {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: geometry.size.width > 550 ? 2 : 1), spacing: 8) {
                        ForEach(Array(entries.enumerated()), id: \.offset) { _, item in
                            DirectorOptionRow(title: (item.name + (multi ? " — " + item["projectName"].string : "")).uppercased(), detail: total(item), active: identity(item) == identity(chosen)) { selected = identity(item); copied = false }
                        }
                    }
                    if entries.isEmpty { Text("NENHUM REPERTÓRIO").font(.caption).padding() }
                }
                HStack(spacing: 8) {
                    DirectorControl(title: "ABRIR", background: Color(hex: "166534"), height: 38) { open() }.disabled(!chosen.exists)
                    DirectorControl(title: copied ? "COPIADO" : "COPY", background: Color(hex: "FACC15"), foreground: .black, height: 38) {
                        let songs = copySource.first("songs", "items").array
                        if songs.contains(where: { $0.isFamilyParent && !DirectorFamily.children(of: $0, data: session.snapshot).isEmpty }) { copyChildren = true } else { copy(includeChildren: false) }
                    }.disabled(!chosen.exists || !local(chosen))
                    DirectorControl(title: "FECHAR", height: 38, action: close)
                }
            }.modifier(DirectorDialogStyle())
        }.overlay {
            if previews {
                ZStack {
                    Color.black.opacity(0.6)
                    VStack(spacing: 12) {
                        Text("PREVIEW").font(.headline)
                        LazyVGrid(columns: [GridItem(.flexible()),GridItem(.flexible()),GridItem(.flexible())], spacing: 8) {
                            ForEach(1...6, id: \.self) { slot in
                                DirectorControl(title: "PREVIEW \(slot)", background: Color(hex: session.snapshot["previewMode"].int == slot ? "16A34A" : "172033"), height: 48) {
                                    let next = session.snapshot["previewMode"].int == slot ? 0 : slot
                                    session.command("preview_set", ["previewIndex": .number(Double(next)), "previewMode": .number(Double(next)), "desiredState": .bool(next > 0)], optimistic: ["previewMode": .number(Double(next))])
                                }
                            }
                        }
                        DirectorControl(title: "FECHAR", height: 38) { previews = false }.accessibilityIdentifier("vshook.playlist.preview.close")
                    }.modifier(DirectorDialogStyle()).frame(maxWidth: 520).padding(12)
                }
            }
        }.alert("COPIAR REPERTÓRIO", isPresented: $copyChildren) {
            Button("NÃO") { copy(includeChildren: false) }; Button("SIM") { copy(includeChildren: true) }
        } message: { Text("DESEJA COPIAR COM AS MÚSICAS DA GAVETA?") }
    }
    private var actions: some View {
        HStack(spacing: 8) {
            DirectorControl(title: "PREVIEW", background: Color(hex: session.snapshot["previewMode"].int > 0 ? "16A34A" : "B91C1C"), height: 38, size: 12) { previews = true }
            DirectorControl(title: "LETREIRO", background: Color(hex: marquee ? "16A34A" : "B91C1C"), height: 38, size: 12) { marquee.toggle() }
            DirectorControl(title: multi ? "[x] MULTI" : "[ ] MULTI", background: Color(hex: multi ? "16A34A" : "B91C1C"), height: 38, size: 12) {
                session.command("multi_project_playlists_set", ["enabled": .bool(!multi), "multiProjectPlaylistsEnabled": .bool(!multi)], optimistic: ["multiProjectPlaylistsEnabled": .bool(!multi)])
            }.disabled(!all.contains { !local($0) })
        }.frame(maxWidth: 330)
    }
    private func total(_ item: JSON) -> String { DirectorPlaylistTiming.text(item) }
    private var copySource: JSON { session.playlists.first { $0.first("id", "playlistId") == chosen.first("localPlaylistId", "playlistId", "id") } ?? chosen }
    private func copy(includeChildren: Bool) {
        UIPasteboard.general.string = DirectorPlaylistCopy.text(copySource, data: session.snapshot, includeChildren: includeChildren)
        copied = true
    }
    private func open() {
        guard local(chosen) || (!session.playing && !session.snapshot["projects"].array.contains { $0["playing"].bool || $0["transportActive"].bool }) else {
            session.message = "PARE A REPRODUÇÃO ANTES DE ABRIR UM REPERTÓRIO DE OUTRA ABA"; return
        }
        let id = chosen.first("localPlaylistId", "playlistId", "id")
        session.choosePlaylist(chosen.merging(["id": id, "playlistId": id]))
        close()
    }
}
