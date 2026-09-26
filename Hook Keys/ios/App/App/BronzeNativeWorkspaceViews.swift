import SwiftUI
import UniformTypeIdentifiers
import UIKit

struct BronzeNativeDocumentExport: UIViewControllerRepresentable {
    let url: URL
    let finished: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(finished) }
    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ controller: UIDocumentPickerViewController, context: Context) {}
    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let finished: () -> Void
        init(_ finished: @escaping () -> Void) { self.finished = finished }
        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finished() }
        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { finished() }
    }
}

struct BronzeNativeBackupPanel: View {
    @ObservedObject var model: BronzeNativeAppModel
    var userName = "Usuario"
    @Environment(\.dismiss) private var dismiss
    @State private var name = "Usuario"
    @State private var importing = false
    @State private var candidate: URL?
    @State private var confirming = false
    var body: some View {
        BronzeNativeModal(title: "Backup Bronze Keys", canDismiss: !model.backupBusy) {
            VStack(alignment: .leading, spacing: 18) {
                Text("Backup local com sessão, presets, configurações, mapeamentos, SF2 e áudios do usuário. Não inclui senha nem sessão de login.")
                TextField("Nome do usuário no arquivo", text: $name).textFieldStyle(BronzeNativeFieldStyle())
                Button("Salvar backup") { model.exportBackup(userName: name) }.buttonStyle(BronzeDeckButtonStyle(palette: .green)).frame(height: 46)
                    .disabled(!model.persistenceAvailable)
                Button("Restaurar backup") { importing = true }.buttonStyle(BronzeDeckButtonStyle()).frame(height: 46)
                Text("Restaurar substitui os ajustes atuais. A configuração anterior fica preservada internamente; arquivos existentes não são sobrescritos.").font(.bronzeUI(12))
                if model.backupBusy { ProgressView("Processando arquivos…") }
            }
            .disabled(model.backupBusy)

        }
        .onAppear { name = userName }
        .interactiveDismissDisabled(model.backupBusy)
        .sheet(item: $model.backupExport, onDismiss: { model.finishBackupExport() }) { export in
            BronzeNativeDocumentExport(url: export.url) { model.finishBackupExport() }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.data]) { result in
            switch result {
            case .success(let url): candidate = url; confirming = true
            case .failure(let error): model.controlError = error.localizedDescription
            }
        }
        .confirmationDialog("Restaurar os dados deste backup?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Restaurar", role: .destructive) { if let candidate { model.restoreBackup(candidate) } }
            Button("Cancelar", role: .cancel) { candidate = nil }
        }
    }
}

struct BronzeNativeMIDIPanel: View {
    @ObservedObject var model: BronzeNativeAppModel
    @Environment(\.dismiss) private var dismiss
    @State private var target = "fader:0"
    @State private var search = ""
    @State private var section = 0
    @State private var bank = 0
    @State private var item = 0
    @State private var minimumEnd = true
    private let initialTarget: String?
    init(model: BronzeNativeAppModel, initialTarget: String? = nil) {
        self.model = model; self.initialTarget = initialTarget
        if let initialTarget {
            let parts = initialTarget.split(separator: ":")
            if parts.first == "note", parts.count == 4 {
                _section = State(initialValue: Int(parts[1]) ?? 1)
                _bank = State(initialValue: Int(parts[2]) ?? 0)
                _item = State(initialValue: Int(parts[3]) ?? 0)
            } else { _target = State(initialValue: initialTarget) }
        }
    }
    private var selectedTarget: String { section == 0 ? target : "note:\(section):\(bank):\(item)" }
    private var mapping: BronzeCCMapping? { model.midiSettings.controls[target] }
    private var locked: Bool { section == 0 && target.hasPrefix("preset:") && model.midiSettings.compatibility }
    var body: some View {
        BronzeNativeModal(title: "MIDI Learn") {
            VStack(alignment: .leading, spacing: 16) {
                Toggle("Modo compatibilidade", isOn: Binding(get: { model.midiSettings.compatibility }, set: { model.setCompatibility($0) }))
                Text("Compatibilidade: Reverb 1–16 seleciona os 16 presets do banco aberto. Ao desligar, seus mapeamentos anteriores voltam intactos.").font(.bronzeUI(12))
                Picker("Tipo", selection: $section) {
                    Text("Controles CC").tag(0); Text("Pads contínuos").tag(1); Text("FX").tag(2)
                }.pickerStyle(.segmented)
                if section == 0 {
                    TextField("Filtrar controles", text: $search)
                    Picker("Controle", selection: $target) {
                        ForEach(BronzeMIDITarget.all.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) || $0.id == target }) { option in
                            Text(option.name).tag(option.id)
                        }
                    }
                    if let mapping {
                        Text("CC \(mapping.controller) · Canal \(mapping.channel) · Dispositivo \(mapping.device)").font(.bronzeUI(12))
                        if BronzeMIDITarget.all.first(where: { $0.id == target })?.continuous == true {
                            Picker("Limite CC", selection: $minimumEnd) { Text("MÍNIMO").tag(true); Text("MÁXIMO").tag(false) }.pickerStyle(.segmented)
                            Slider(value: Binding(get: { minimumEnd ? mapping.minimum : mapping.maximum }, set: { value in
                                model.setCCRange(target, minimum: minimumEnd ? min(value, mapping.maximum) : mapping.minimum,
                                    maximum: minimumEnd ? mapping.maximum : max(value, mapping.minimum), inverted: mapping.inverted)
                            }), in: 0...1)
                            Text(String(format: "Mínimo %.1f%% · Máximo %.1f%%", mapping.minimum * 100, mapping.maximum * 100)).font(.caption.monospacedDigit())
                            Toggle("Inverter", isOn: Binding(get: { mapping.inverted }, set: {
                                model.setCCRange(target, minimum: mapping.minimum, maximum: mapping.maximum, inverted: $0)
                            }))
                        }
                    }
                } else {
                    Picker("Banco", selection: $bank) {
                        ForEach(0..<(section == 1 ? 2 : 8), id: \.self) { index in
                            Text(section == 1 ? "Pad \(index + 1)" : model.workspace.fxBanks[index].name).tag(index)
                        }
                    }
                    Picker(section == 1 ? "Pad" : "Efeito", selection: $item) {
                        ForEach(0..<12, id: \.self) { Text("\($0 + 1)").tag($0) }
                    }
                    if let note = model.midiSettings.notes.first(where: { $0.kind == section && $0.bank == bank && $0.item == item }) {
                        Text("Nota \(note.note) · canal MIDI 10")
                    }
                    Text("O disparo acontece diretamente no motor C++, sem depender da tela. Uma nota pode controlar um único Pad ou FX.").font(.bronzeUI(12))
                }
                HStack {
                    Button("Learn CC / Note") { model.beginMIDILearn(selectedTarget) }.tint(locked ? .gray : .bronze)
                    Button("Clean") { model.clearMIDIMapping(selectedTarget) }.tint(locked ? .gray : .bronze)
                    if model.learningTarget != nil { Button("Cancelar Learn") { model.learningTarget = nil } }
                }
                Text(model.midiLearnMessage).font(.bronzeUI(12))
            }
            .pickerStyle(.menu).textFieldStyle(BronzeNativeFieldStyle())
        }
        .onAppear { if initialTarget != nil { model.beginMIDILearn(selectedTarget) } }
        .onChange(of: section) { _ in bank = 0; model.learningTarget = nil }
        .onChange(of: target) { _ in model.learningTarget = nil }
        .onDisappear { model.learningTarget = nil }
    }
}

struct BronzeNativePlaylistLibrary: View {
    @ObservedObject var model: BronzeNativeAppModel
    @Environment(\.dismiss) private var dismiss
    @State private var importing = false
    @State private var importTarget = BronzeUserWorkspace.libraryPlaylistID
    @State private var editorStage = 0
    @State private var editorID: UUID?
    @State private var name = ""
    @State private var loop = false
    @State private var selectedTracks = Set<UUID>()
    @State private var deleteList = false
    @State private var deleteAll = false
    private var playlist: BronzeUserPlaylist? { model.selectedUserPlaylist }
    private var isAll: Bool { model.workspace.selectedPlaylist == BronzeUserWorkspace.libraryPlaylistID }
    private var bundled: Bool { model.workspace.selectedPlaylist == nil }
    private var busy: Bool { model.importingMedia || model.loadingLoop }
    var body: some View {
        GeometryReader { g in
            let compact = g.size.height < 500
            VStack(spacing: compact ? 5 : 10) {
                Text("Playlist").font(.bronzeUI(compact ? 15 : 22)).frame(height: compact ? 20 : 30)
                HStack(spacing: compact ? 5 : 10) {
                    ScrollView {
                        LazyVStack(spacing: 5) {
                            setButton("All", id: BronzeUserWorkspace.libraryPlaylistID, height: compact ? 32 : 44)
                            Divider()
                            setButton("Loops Gospel", id: nil, height: compact ? 32 : 44)
                            ForEach(model.workspace.playlists) { list in
                                setButton(list.name, id: list.id, height: compact ? 32 : 44)
                                    .bronzeTapHold(tap: { model.selectPlaylist(list.id) }, hold: { edit(list) })
                            }
                        }.padding(5)
                    }.frame(width: compact ? 120 : 190).background(.black.opacity(0.2)).cornerRadius(6)
                    GeometryReader { _ in
                        ScrollView {
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 4), spacing: 5) {
                                if bundled {
                                    ForEach(model.bundledLoops) { track in
                                        Button(track.name) { model.selectLoop(track) }
                                            .buttonStyle(BronzePlaylistMusicStyle(palette: track.id == 1 ? .green : track.id == 2 ? .blue : .bronze, selected: model.selectedLoop?.id == track.id))
                                            .frame(height: compact ? 44 : 56)
                                    }
                                } else {
                                    ForEach(playlist?.tracks ?? []) { track in
                                        Button(track.name) { model.selectUserTrack(track.id) }
                                            .buttonStyle(BronzePlaylistMusicStyle(selected: model.selectedLoop?.trackID == track.id))
                                            .frame(height: compact ? 44 : 56)
                                            .contextMenu {
                                                Button(isAll ? "Apagar música da biblioteca" : "Retirar da playlist", role: .destructive) {
                                                    if isAll { model.removeLibraryTrack(track.id) }
                                                    else if let id = playlist?.id { model.removeTrack(track.id, playlistID: id) }
                                                }
                                            }
                                    }
                                }
                            }
                            if !bundled && playlist?.tracks.isEmpty != false {
                                Text(isAll ? "Nenhuma música adicionada." : "Esta playlist ainda não possui músicas.").font(.bronzeUI(12)).foregroundStyle(.secondary).padding(20)
                            }
                        }.padding(5)
                    }.background(.black.opacity(0.2)).cornerRadius(6)
                }.disabled(busy)
                if busy { ProgressView("Adicionando músicas…").font(.bronzeUI(11)) }
                HStack(spacing: compact ? 5 : 10) {
                    Button("Voltar") { dismiss() }.buttonStyle(BronzeConfigActionStyle(kind: .back))
                    Button("Delete All") { deleteAll = true }.buttonStyle(BronzeConfigActionStyle(kind: .off)).disabled(bundled || playlist?.tracks.isEmpty != false)
                    Button("Add música") { importTarget = playlist?.id ?? BronzeUserWorkspace.libraryPlaylistID; importing = true }.buttonStyle(BronzeConfigActionStyle(kind: .on))
                    Button("Create playlist") { editorID = nil; selectedTracks = []; name = ""; loop = false; editorStage = 1 }.buttonStyle(BronzeConfigActionStyle(kind: .reset))
                }.frame(height: compact ? 36 : 50).disabled(busy)
            }.padding(10)
            if editorStage > 0 {
                editor(compact: compact).padding(compact ? 12 : 30).frame(width: g.size.width, height: g.size.height)
                    .background(BronzeScreenBackground())
            }
        }.background(BronzeScreenBackground()).preferredColorScheme(.dark)
        .onAppear { if model.workspace.selectedPlaylist == nil { model.selectPlaylist(BronzeUserWorkspace.libraryPlaylistID) } }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.audio], allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls): model.importTracks(urls, playlistID: importTarget)
            case .failure(let error): model.controlError = error.localizedDescription
            }
        }
        .confirmationDialog("Apagar esta playlist? As músicas continuam na biblioteca All.", isPresented: $deleteList, titleVisibility: .visible) {
            Button("Apagar playlist", role: .destructive) { if let editorID { model.deletePlaylist(editorID) }; editorStage = 0; model.selectPlaylist(BronzeUserWorkspace.libraryPlaylistID) }
            Button("Cancelar", role: .cancel) {}
        }
        .confirmationDialog(isAll ? "Apagar todas as músicas da biblioteca e das playlists?" : "Retirar todas as músicas desta playlist?", isPresented: $deleteAll, titleVisibility: .visible) {
            Button("Confirmar", role: .destructive) {
                for track in playlist?.tracks ?? [] {
                    if isAll { model.removeLibraryTrack(track.id) }
                    else if let id = playlist?.id { model.removeTrack(track.id, playlistID: id) }
                }
            }
            Button("Cancelar", role: .cancel) {}
        }
        .alert("Playlist", isPresented: Binding(get: { model.controlError != nil }, set: { if !$0 { model.controlError = nil } })) {
            Button("OK") { model.controlError = nil }
        } message: { Text(model.controlError ?? "") }
    }
    private func setButton(_ title: String, id: UUID?, height: CGFloat) -> some View {
        Button(title) { model.selectPlaylist(id) }.buttonStyle(BronzeDeckButtonStyle(palette: model.workspace.selectedPlaylist == id ? .green : .grey, selected: model.workspace.selectedPlaylist == id)).frame(height: height)
    }
    private func edit(_ list: BronzeUserPlaylist) {
        editorID = list.id; name = list.name; loop = list.isLoop
        let keys = Set(list.tracks.map(\.key))
        selectedTracks = Set(model.workspace.allLibraryTracks.filter { keys.contains($0.key) }.map(\.id))
        editorStage = 2
    }
    @ViewBuilder private func editor(compact: Bool) -> some View {
        VStack(spacing: 12) {
            Text(editorID == nil ? "Nova playlist" : "Editar playlist").font(.bronzeUI(compact ? 18 : 26))
            if editorStage == 1 {
                Spacer(minLength: 0)
                Text("Escolha o tipo").font(.bronzeUI(18))
                HStack(spacing: 12) {
                    Button { loop = false; editorStage = 2 } label: { VStack(spacing: 8) { Text("Normal Playlist"); Text("Músicas na velocidade original").font(.bronzeUI(11)) } }
                        .buttonStyle(BronzeDeckButtonStyle(palette: .grey))
                    Button { loop = true; editorStage = 2 } label: { VStack(spacing: 8) { Text("Playlist de loop"); Text("Sincronizada com o BPM do Bronze Keys").font(.bronzeUI(11)) } }
                        .buttonStyle(BronzeDeckButtonStyle(palette: .grey))
                }.frame(height: compact ? 80 : 140)
                Text("Importe arquivos em 120 BPM com edição pronta para loop.").font(.bronzeUI(11)).foregroundStyle(Color.bronzeLight)
                Spacer(minLength: 0)
            } else if editorStage == 2 {
                Spacer(minLength: 0)
                TextField("Nome da playlist", text: $name).textFieldStyle(BronzeNativeFieldStyle()).font(.bronzeUI(20))
                Spacer(minLength: 0)
            } else {
                Text(name).font(.bronzeUI(18)).foregroundStyle(Color.bronzeLight)
                if loop { Text("Importe arquivos em 120 BPM com edição pronta para loop.").font(.bronzeUI(11)) }
                ScrollView {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 4), spacing: 5) {
                        ForEach(model.workspace.allLibraryTracks) { track in
                            Button(track.name) { if selectedTracks.contains(track.id) { selectedTracks.remove(track.id) } else { selectedTracks.insert(track.id) } }
                                .buttonStyle(BronzePlaylistMusicStyle(selected: selectedTracks.contains(track.id)))
                                .frame(height: compact ? 44 : 56)
                        }
                    }
                    if model.workspace.allLibraryTracks.isEmpty { Text("Nenhuma música adicionada. Você pode criar a playlist vazia.").font(.bronzeUI(12)).padding(20) }
                }
            }
            HStack(spacing: 10) {
                Button(editorStage == 3 ? "Voltar" : "Cancelar") { if editorStage == 3 { editorStage = 2 } else { editorStage = 0 } }.buttonStyle(BronzeConfigActionStyle(kind: .back))
                if editorStage == 2 && editorID != nil { Button("Apagar playlist") { deleteList = true }.buttonStyle(BronzeConfigActionStyle(kind: .off)) }
                if editorStage > 1 {
                    Button(editorStage == 3 ? "Salvar" : "Continuar") {
                        if editorStage == 2 { editorStage = 3 }
                        else { model.savePlaylist(editorID, name: name, loop: loop, trackIDs: selectedTracks); editorStage = 0 }
                    }.buttonStyle(BronzeConfigActionStyle(kind: .on)).disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }.frame(height: compact ? 36 : 48)
        }
    }
}

struct BronzeNativeFXEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    @Environment(\.dismiss) private var dismiss
    let index: Int
    let bank: Int
    @State private var name: String
    @State private var color: Int
    @State private var mode: String
    @State private var release: String
    @State private var importing = false
    @State private var showMode = false
    @State private var showLearn = false
    @State private var clean = false
    @State private var renameBank = false
    @State private var bankName = ""
    init(model: BronzeNativeAppModel, initialIndex: Int = 0) {
        self.model = model
        let item = min(11, max(0, initialIndex)), bank = model.workspace.fxBank
        index = item; self.bank = bank
        let pad = model.workspace.fxBanks[bank].pads[item]
        _name = State(initialValue: pad.name); _color = State(initialValue: pad.color)
        _mode = State(initialValue: pad.triggerMode ?? "toggle")
        _release = State(initialValue: pad.gateRelease ?? "infinite")
    }
    private var pad: BronzeUserFX { model.workspace.fxBanks[bank].pads[index] }
    private var target: String { "note:2:\(bank):\(index)" }
    var body: some View {
        BronzeEditDialog(title: "\(model.workspace.fxBanks[bank].name) · Efeito \(index + 1)", height: bank == 0 ? 360 : showMode ? 570 : 460) {
            VStack(spacing: 12) {
                if bank != 0 {
                    TextField("Nome do efeito", text: $name).textFieldStyle(BronzeNativeFieldStyle())
                        .onChange(of: name) { if $0.count > 12 { name = String($0.prefix(12)) } }
                }
                Text(bank == 0 ? pad.name : name).font(.bronzeUI(19)).frame(maxWidth: .infinity).frame(height: 65)
                    .background(LinearGradient(colors: [BronzePresetPalette.colors[color], BronzePresetPalette.colors[color].opacity(0.35)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                HStack(spacing: 6) {
                    ForEach(0..<8, id: \.self) { item in
                        Button { color = item } label: {
                            RoundedRectangle(cornerRadius: 5).fill(BronzePresetPalette.colors[item]).frame(height: 30)
                                .overlay(RoundedRectangle(cornerRadius: 5).stroke(color == item ? .white : .clear, lineWidth: 2))
                        }.buttonStyle(.plain).accessibilityLabel("Cor \(item + 1)")
                    }
                }
                HStack(spacing: 8) {
                    Button { showLearn = true } label: {
                        VStack(spacing: 3) {
                            Text("Learn Note")
                            Text(model.midiSettings.notes.first(where: { $0.kind == 2 && $0.bank == bank && $0.item == index }).map { "Nota \($0.note) · CH 10" } ?? "Ainda não mapeado").font(.bronzeUI(10))
                        }
                    }.buttonStyle(BronzeDeckButtonStyle(palette: .bronze))
                    Button("Clean") { clean = true }.buttonStyle(BronzeDeckButtonStyle(palette: .red)).frame(width: 90)
                }.frame(height: 46)
                if bank != 0 {
                    HStack {
                        Button("Modo · \(mode == "gate" ? "Gate" : "Toggle")") { showMode.toggle() }
                        Button("Escolher FX") { importing = true }
                    }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(height: 40)
                    if showMode {
                        HStack {
                            ForEach(["toggle", "gate"], id: \.self) { value in
                                Button(value == "gate" ? "Gate" : "Toggle") { mode = value }
                                    .buttonStyle(BronzeDeckButtonStyle(palette: mode == value ? .green : .grey, selected: mode == value))
                            }
                        }.frame(height: 36)
                        if mode == "gate" {
                            HStack {
                                ForEach(["infinite", "continue-press"], id: \.self) { value in
                                    Button(value == "infinite" ? "Infinite Release" : "Continue Press") { release = value }
                                        .buttonStyle(BronzeDeckButtonStyle(palette: release == value ? .green : .grey, selected: release == value, size: 10))
                                }
                            }.frame(height: 36)
                        }
                    }
                    Text(pad.key == nil ? "Nenhum arquivo" : "Arquivo importado").font(.bronzeUI(10)).foregroundStyle(.secondary)
                    Button("Renomear banco") { bankName = model.workspace.fxBanks[bank].name; renameBank = true }.font(.bronzeUI(10))
                }
                if model.importingMedia { ProgressView("Importando…") }
            }.disabled(model.importingMedia)
        } actions: {
            Button("Voltar") { dismiss() }.buttonStyle(BronzeConfigActionStyle(kind: .back)).disabled(model.importingMedia)
            Button("OK") {
                model.editFX(bank: bank, index: index, name: bank == 0 ? pad.name : name, gain: pad.gainDb, color: color, triggerMode: mode, gateRelease: release)
                dismiss()
            }.buttonStyle(BronzeDeckButtonStyle(palette: .green)).disabled(model.importingMedia)
        }
        .fullScreenCover(isPresented: $showLearn) { BronzeMIDILearnDialog(model: model, target: target) }
        .alert("Limpar mapeamento?", isPresented: $clean) {
            Button("Cancelar", role: .cancel) {}
            Button("Limpar", role: .destructive) { model.clearMIDIMapping(target) }
        }
        .alert("Nome do banco", isPresented: $renameBank) {
            TextField("Nome", text: $bankName)
            Button("Cancelar", role: .cancel) {}
            Button("OK") { model.renameFXBank(bank, name: bankName) }
        }
        .interactiveDismissDisabled(model.importingMedia)
        .fileImporter(isPresented: $importing, allowedContentTypes: [.audio]) { result in
            switch result {
            case .success(let url): model.importFX(url, bank: bank, index: index)
            case .failure(let error): model.controlError = error.localizedDescription
            }
        }
    }
}

struct BronzeNativeSynthPresetEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    let index: Int
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var color: Int
    @State private var replacing = false
    init(model: BronzeNativeAppModel, index: Int) {
        self.model = model; self.index = index
        let preset = model.workspace.synthPresets[index]
        _name = State(initialValue: preset.sound == nil ? "Preset \(index + 1)" : preset.name)
        _color = State(initialValue: preset.color)
    }
    var body: some View {
        NavigationView {
            Form {
                TextField("Nome", text: $name)
                Picker("Cor", selection: $color) { ForEach(0..<8, id: \.self) { Text("Cor \($0 + 1)").tag($0) } }
                Button("Salvar o som atual aqui") {
                    if model.workspace.synthPresets[index].sound != nil { replacing = true } else { save() }
                }
            }.navigationTitle("Synth · Preset \(index + 1)").toolbar { Button("Cancelar") { dismiss() } }
        }.navigationViewStyle(.stack)
        .confirmationDialog("Substituir este preset do Synth?", isPresented: $replacing, titleVisibility: .visible) {
            Button("Substituir", role: .destructive) { save() }
            Button("Cancelar", role: .cancel) {}
        }
    }
    private func save() { model.saveSynthPreset(index, name: name, color: color); dismiss() }
}

/// Native counterpart of the original 30% playlist panel.
struct BronzeNativePlaylistSidebar: View {
    @ObservedObject var model: BronzeNativeAppModel
    @State private var setsOpen = false
    @State private var editing = false
    @State private var draggedID: String?
    @State private var renamedBlock: BronzePlaylistBlock?
    @State private var blockName = ""
    private var settings: BronzePlaylistSidebarSettings { model.playlistSidebar }
    private var scope: String { settings.scope }
    private var bundled: Bool { scope == "bundled" }
    private var playlist: BronzeUserPlaylist? { model.workspace.playlists.first { $0.id.uuidString == scope } }
    private var tracks: [(playlist: BronzeUserPlaylist, track: BronzeUserTrack)] {
        if let playlist { return playlist.tracks.map { (playlist, $0) } }
        return bundled ? [] : model.allSidebarTracks
    }
    private var blocks: [BronzePlaylistBlock] { settings.blocks.filter { $0.scope == scope } }
    private var items: [String] {
        let available = tracks.map { $0.track.id.uuidString } + blocks.map { $0.id.uuidString }
        let order = (settings.order[scope] ?? []).filter { available.contains($0) }
        return order + available.filter { !order.contains($0) }
    }
    private var repeatEnabled: Bool { playlist?.repeatEnabled ?? settings.repeatEnabled }
    private var autoAdvance: Bool { playlist?.autoAdvance ?? settings.autoAdvance }
    private var isLoop: Bool { bundled || playlist?.isLoop == true }

    var body: some View {
        VStack(spacing: 8) {
            Button { setsOpen.toggle() } label: {
                HStack { Text(bundled ? "Loops Gospel" : playlist?.name ?? "All").lineLimit(1); Spacer(); Image(systemName: "chevron.down") }
            }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(height: 40)
                .accessibilityIdentifier("bronze.playlist.sets")
            if isLoop {
                Button(model.loopClickEnabled ? "Click ON" : "Click OFF") {
                    model.setLoopClickEnabled(!model.loopClickEnabled)
                }.buttonStyle(BronzeDeckButtonStyle(palette: model.loopClickEnabled ? .green : .red))
                    .frame(height: 36)
                    .accessibilityIdentifier("bronze.loop.click")
                    .accessibilityValue(model.loopClickEnabled ? "Estéreo" : "Canal R nos dois lados")
            } else {
            HStack(spacing: 5) {
                Button { toggleRepeat() } label: { Image(systemName: "repeat") }
                    .buttonStyle(BronzeDeckButtonStyle(palette: repeatEnabled ? .green : .red)).accessibilityLabel("Repetir música").frame(width: 44)
                Button("Auto") { toggleAuto() }.buttonStyle(BronzeDeckButtonStyle(palette: autoAdvance ? .yellow : .red)).disabled(isLoop)
                Button("Add-BL") { addBlock() }.buttonStyle(BronzeDeckButtonStyle(palette: .purple)).disabled(bundled)
                Button("Edit") { editing.toggle() }.buttonStyle(BronzeDeckButtonStyle(palette: editing ? .green : .red)).disabled(bundled)
            }.frame(height: 48)
            }
            ZStack(alignment: .top) {
                ScrollView {
                    LazyVStack(spacing: 5) {
                        if bundled {
                            ForEach(Array(model.bundledLoops.enumerated()), id: \.element.id) { index, track in
                                Button { model.selectLoop(track) } label: { row(number: "\(index + 1)", name: track.name) }
                                    .buttonStyle(BronzeDeckButtonStyle(palette: model.selectedLoop?.id == track.id ? .green : .grey)).frame(height: 48)
                            }
                        } else {
                            ForEach(items, id: \.self) { id in
                                item(id)
                                    .onDrag { draggedID = editing ? id : nil; return NSItemProvider(object: id as NSString) }
                                    .onDrop(of: [.plainText], delegate: BronzePlaylistRowDrop(id: id, draggedID: $draggedID, enabled: editing, move: move))
                            }
                            if items.isEmpty { Text("Nenhuma música adicionada.").foregroundStyle(.secondary).padding(.vertical, 24) }
                        }
                    }
                }
                if setsOpen {
                    ScrollView {
                        VStack(spacing: 5) {
                            setButton("All", id: "all")
                            Divider()
                            setButton("Loops Gospel", id: "bundled")
                            ForEach(model.workspace.playlists) { list in setButton(list.name, id: list.id.uuidString) }
                        }.padding(7)
                    }.background(BronzeTheme.panelGradient).clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            if model.loadingLoop || model.importingMedia { ProgressView("Carregando…") }
        }.padding(8).font(.bronzeUI(12))
            .onAppear {
                if model.workspace.playlistSidebar == nil { model.editPlaylistSidebar { _ in } }
            }
            .sheet(item: $renamedBlock) { block in
                BronzeNativeModal(title: "Nome do bloco") {
                    TextField("Nome", text: $blockName).textFieldStyle(BronzeNativeFieldStyle())
                    Button("Salvar") {
                        model.editPlaylistSidebar { next in
                            if let index = next.blocks.firstIndex(where: { $0.id == block.id }) {
                                next.blocks[index].name = BronzeUserWorkspace.name(blockName, fallback: "Bloco")
                            }
                        }
                        renamedBlock = nil
                    }.buttonStyle(BronzeDeckButtonStyle(palette: .green)).frame(height: 44)
                }
            }
    }

    private func row(number: String, name: String) -> some View {
        HStack(spacing: 7) {
            Text(number).foregroundStyle(.secondary).frame(width: 27)
            Text(name).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            if editing { Image(systemName: "line.3.horizontal").foregroundStyle(.secondary) }
        }.padding(.horizontal, 9)
    }

    @ViewBuilder private func item(_ id: String) -> some View {
        if let block = blocks.first(where: { $0.id.uuidString == id }) {
            Button { blockName = block.name; renamedBlock = block } label: { row(number: "–", name: block.name) }
                .buttonStyle(BronzeDeckButtonStyle(palette: .purple)).frame(height: 48)
                .contextMenu {
                    Button("Renomear") { blockName = block.name; renamedBlock = block }
                    Button("Apagar bloco", role: .destructive) {
                        model.editPlaylistSidebar { $0.blocks.removeAll { $0.id == block.id }; $0.order[scope]?.removeAll { $0 == id } }
                    }
                }
        } else if let entry = tracks.first(where: { $0.track.id.uuidString == id }) {
            let index = items.prefix(while: { $0 != id }).filter { candidate in tracks.contains { $0.track.id.uuidString == candidate } }.count
            Button {
                guard !editing else { return }
                model.selectPlaylist(entry.playlist.id, preserveSidebarScope: true)
                model.selectUserTrack(entry.track.id)
            } label: { row(number: "\(index + 1)", name: entry.track.name) }
                .buttonStyle(BronzeDeckButtonStyle(palette: model.selectedLoop?.trackID == entry.track.id ? .green : .grey)).frame(height: 48)
                .contextMenu {
                    Button(scope == "all" ? "Apagar música da biblioteca" : "Retirar da playlist", role: .destructive) {
                        if scope == "all" { model.removeLibraryTrack(entry.track.id) }
                        else { model.removeTrack(entry.track.id, playlistID: entry.playlist.id) }
                    }
                }
        }
    }

    private func setButton(_ name: String, id: String) -> some View {
        Button(name) {
            model.editPlaylistSidebar { $0.scope = id }
            if id == "all" { model.selectPlaylist(BronzeUserWorkspace.libraryPlaylistID) }
            else if id == "bundled" { model.selectPlaylist(nil) }
            else if let uuid = UUID(uuidString: id) { model.selectPlaylist(uuid) }
            setsOpen = false; editing = false
        }.buttonStyle(BronzeDeckButtonStyle(palette: scope == id ? .green : .grey)).frame(height: 40)
    }

    private func toggleRepeat() {
        if var next = playlist { next.repeatEnabled.toggle(); model.editPlaylist(next) }
        else { model.editPlaylistSidebar { $0.repeatEnabled.toggle() } }
    }
    private func toggleAuto() {
        if var next = playlist { next.autoAdvance.toggle(); model.editPlaylist(next) }
        else { model.editPlaylistSidebar { $0.autoAdvance.toggle() } }
    }
    private func addBlock() {
        let block = BronzePlaylistBlock(scope: scope, name: "Bloco \(blocks.count + 1)")
        let current = items
        model.editPlaylistSidebar { $0.blocks.append(block); $0.order[scope] = current + [block.id.uuidString] }
    }
    private func move(_ source: String, _ destination: String) {
        var order = items
        guard let from = order.firstIndex(of: source), let to = order.firstIndex(of: destination), from != to else { return }
        order.remove(at: from); order.insert(source, at: to)
        model.editPlaylistSidebar { $0.order[scope] = order }
        if var next = playlist {
            next.tracks = order.compactMap { id in next.tracks.first { $0.id.uuidString == id } }
            model.editPlaylist(next)
        }
    }
}

private struct BronzePlaylistRowDrop: DropDelegate {
    let id: String
    @Binding var draggedID: String?
    let enabled: Bool
    let move: (String, String) -> Void
    func validateDrop(info: DropInfo) -> Bool { enabled && draggedID != nil }
    func dropEntered(info: DropInfo) { if enabled, let source = draggedID, source != id { move(source, id) } }
    func dropUpdated(info: DropInfo) -> DropProposal? { DropProposal(operation: .move) }
    func performDrop(info: DropInfo) -> Bool { draggedID = nil; return enabled }
}

struct BronzeLearnOnHold: ViewModifier {
    @ObservedObject var model: BronzeNativeAppModel
    let target: String
    var tapAction: (() -> Void)? = nil
    @State private var open = false
    func body(content: Content) -> some View {
        Group {
            if let tapAction {
                content.bronzeTapHold(tap: tapAction, hold: { open = true })
            } else {
                #if targetEnvironment(macCatalyst)
                content.contextMenu { Button("Mapear MIDI") { open = true } }
                #else
                content.simultaneousGesture(LongPressGesture(minimumDuration: 0.56, maximumDistance: 8).onEnded { _ in open = true })
                #endif
            }
        }
            .accessibilityAction(named: "MIDI Learn") { open = true }
            .fullScreenCover(isPresented: $open) { BronzeMIDILearnDialog(model: model, target: target) }
    }
}

private struct BronzeLearnActionKey: EnvironmentKey {
    static let defaultValue: (() -> Void)? = nil
}
extension EnvironmentValues {
    var bronzeLearnAction: (() -> Void)? {
        get { self[BronzeLearnActionKey.self] }
        set { self[BronzeLearnActionKey.self] = newValue }
    }
}
struct BronzeConfigLearn: ViewModifier {
    @ObservedObject var model: BronzeNativeAppModel
    let target: String
    @State private var open = false
    func body(content: Content) -> some View {
        content.environment(\.bronzeLearnAction, { open = true })
            .fullScreenCover(isPresented: $open) { BronzeMIDILearnDialog(model: model, target: target) }
    }
}

struct BronzeEditDialog<Content: View, Actions: View>: View {
    let title: String
    var height: CGFloat = 430
    @ViewBuilder let content: () -> Content
    @ViewBuilder let actions: () -> Actions
    var body: some View {
        GeometryReader { g in
            VStack(spacing: 16) {
                Text(title).font(.bronzeUI(20)).foregroundStyle(Color.bronzeLight)
                ScrollView { content().frame(maxWidth: .infinity) }
                HStack(spacing: 8) { actions() }.frame(height: 44)
            }.padding(20)
                .frame(width: min(540, max(1, g.size.width - 24)), height: min(height, max(1, g.size.height - 24)))
                .background(BronzeTheme.panelGradient).clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.bronze.opacity(0.7)).allowsHitTesting(false))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }.background(Color.black.opacity(0.65)).background(BronzeTransparentModalBackground())
            .preferredColorScheme(.dark)
    }
}

struct BronzeMIDILearnDialog: View {
    @ObservedObject var model: BronzeNativeAppModel
    let target: String
    @Environment(\.dismiss) private var dismiss
    @State private var minimum = 0.0
    @State private var maximum = 1.0
    @State private var inverted = false
    @State private var minimumEnd = false
    @State private var clear = false
    private var note: Bool { target.hasPrefix("note:") }
    private var continuous: Bool { BronzeMIDITarget.all.first(where: { $0.id == target })?.continuous == true }
    private var canConfirm: Bool { note ? model.midiLearnNoteCandidate != nil : model.midiLearnCandidate != nil }
    var body: some View {
        BronzeEditDialog(title: BronzeMIDITarget.all.first(where: { $0.id == target })?.name ?? "Mapeamento MIDI", height: continuous ? 480 : 310) {
            VStack(spacing: 12) {
                Text(note ? "NOTE" : "CC").font(.bronzeUI(25)).padding(12).background(Color.bronze.opacity(0.2)).clipShape(RoundedRectangle(cornerRadius: 8))
                Text(note ? "Learn Note" : "Learn CC").font(.bronzeUI(18))
                Text(model.midiLearnMessage).font(.bronzeUI(12)).multilineTextAlignment(.center)
                Text(note ? model.midiLearnNoteCandidate.map { "Mapeamento: Nota \($0) · CH 10" } ?? "Ainda não mapeado"
                    : model.midiLearnCandidate.map { "Mapeamento: CC \($0.controller) · CH \($0.channel)" } ?? "Ainda não mapeado")
                    .font(.bronzeUI(11)).foregroundStyle(Color.bronzeLight)
                if continuous {
                    Button("Inverter") { inverted.toggle() }.buttonStyle(BronzeDeckButtonStyle(palette: inverted ? .green : .grey, selected: inverted)).frame(height: 34)
                    HStack(spacing: 8) {
                        Button(String(format: "Mínimo  %.1f%%", minimum * 100)) { minimumEnd = true }
                            .buttonStyle(BronzeDeckButtonStyle(palette: minimumEnd ? .bronze : .grey, selected: minimumEnd))
                        Button(String(format: "Máximo  %.1f%%", maximum * 100)) { minimumEnd = false }
                            .buttonStyle(BronzeDeckButtonStyle(palette: minimumEnd ? .grey : .bronze, selected: !minimumEnd))
                    }.frame(height: 38)
                    GeometryReader { g in
                        let width = max(1, g.size.width - 24)
                        ZStack(alignment: .leading) {
                            Capsule().fill(.gray.opacity(0.35)).frame(height: 6)
                            Capsule().fill(Color.bronzeLight).frame(width: max(1, width * (maximum - minimum)), height: 6).offset(x: 12 + width * minimum)
                            ForEach([true, false], id: \.self) { low in
                                Circle().fill(minimumEnd == low ? Color.bronzeLight : .white).frame(width: 24, height: 24)
                                    .offset(x: width * (low ? minimum : maximum))
                                    .zIndex(minimumEnd == low ? 1 : 0)
                                    .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("ccRange")).onChanged { event in
                                        minimumEnd = low
                                        let n = min(1, max(0, (event.location.x - 12) / width))
                                        if low { minimum = min(maximum, n) } else { maximum = max(minimum, n) }
                                    })
                                    .accessibilityLabel(low ? "Limite mínimo" : "Limite máximo")
                                    .accessibilityValue(String(format: "%.1f%%", (low ? minimum : maximum) * 100))
                                    .accessibilityAdjustableAction { direction in
                                        let delta = direction == .increment ? 0.01 : -0.01
                                        if low { minimum = min(maximum, max(0, minimum + delta)) }
                                        else { maximum = max(minimum, min(1, maximum + delta)) }
                                    }
                            }
                        }.frame(height: g.size.height).coordinateSpace(name: "ccRange")
                    }.frame(height: 32)
                    Text("Arraste as duas alças para definir o mínimo e o máximo do curso do CC.").font(.bronzeUI(10)).foregroundStyle(.secondary)
                }
            }
        } actions: {
            Button("Voltar") { dismiss() }.buttonStyle(BronzeConfigActionStyle(kind: .back))
            Button("Clean") { clear = true }.buttonStyle(BronzeDeckButtonStyle(palette: .red))
            Button("OK") { model.commitMIDILearnDraft(target, minimum: minimum, maximum: maximum, inverted: inverted); dismiss() }
                .buttonStyle(BronzeDeckButtonStyle(palette: .green)).disabled(!canConfirm)
        }
        .onAppear {
            if let map = model.midiSettings.controls[target] { minimum = map.minimum; maximum = map.maximum; inverted = map.inverted }
            model.beginMIDILearnDraft(target)
        }
        .onDisappear { model.cancelMIDILearnDraft() }
        .alert("Limpar mapeamento?", isPresented: $clear) {
            Button("Cancelar", role: .cancel) {}
            Button("Limpar", role: .destructive) { model.clearMIDIMapping(target); dismiss() }
        } message: { Text("O mapeamento deste controle será removido.") }
    }
}

private struct BronzePlaylistMusicStyle: ButtonStyle {
    var palette: BronzeDeckPalette? = nil
    var selected = false
    func makeBody(configuration: Configuration) -> some View {
        let colors = palette?.colors ?? (selected
            ? [Color(bronzeHex: 0x168b3d), Color(bronzeHex: 0x063c1a)]
            : [Color(bronzeHex: 0x2f2f33), Color(bronzeHex: 0x0f0f11)])
        configuration.label.font(.bronzeUI(12)).lineLimit(2)
            .multilineTextAlignment(.leading).foregroundStyle(Color.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .background(LinearGradient(colors: Array(colors.prefix(2)), startPoint: .topLeading, endPoint: .bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius: 7))
            .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(selected ? Color(bronzeHex: 0x41ea77) : Color(bronzeHex: 0x65564c), lineWidth: 1.5).allowsHitTesting(false))
            .brightness(configuration.isPressed ? 0.12 : 0)
    }
}
