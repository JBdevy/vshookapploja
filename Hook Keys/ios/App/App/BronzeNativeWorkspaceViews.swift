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
        .onChange(of: section) { _ in bank = 0; model.learningTarget = nil }
        .onChange(of: target) { _ in model.learningTarget = nil }
        .onDisappear { model.learningTarget = nil }
    }
}

struct BronzeNativePlaylistLibrary: View {
    @ObservedObject var model: BronzeNativeAppModel
    var compact = false
    @State private var adding = false
    @State private var importing = false
    @State private var name = ""
    @State private var loop = false
    @State private var deleteList = false
    private var playlist: BronzeUserPlaylist? { model.selectedUserPlaylist }
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if !compact {
                VStack(spacing: 8) {
                    Button("Loops Bronze Keys") { model.selectPlaylist(nil) }.buttonStyle(BronzeDeckButtonStyle(palette: .red, selected: playlist == nil)).frame(height: 46)
                    ForEach(model.workspace.playlists) { list in
                        Button(list.name) { model.selectPlaylist(list.id) }.buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: playlist?.id == list.id)).frame(height: 46)
                    }
                    Button("Add Playlist") { name = ""; loop = false; adding = true }.buttonStyle(BronzeDeckButtonStyle(palette: .green)).frame(height: 46)
                }.frame(width: 190)
            }
            VStack(spacing: 12) {
                if compact {
                    Menu(playlist?.name ?? "Loops Bronze Keys") {
                        Button("Loops Bronze Keys") { model.selectPlaylist(nil) }
                        ForEach(model.workspace.playlists) { list in Button(list.name) { model.selectPlaylist(list.id) } }
                        Button("Add Playlist") { name = ""; loop = false; adding = true }
                    }.buttonStyle(BronzeDeckButtonStyle(palette: .red)).frame(height: 38)
                }
                HStack(spacing: 6) {
                    Button(model.loopPlaying ? "Stop" : "Play") { model.toggleLoopPlayback() }.buttonStyle(BronzeDeckButtonStyle(palette: model.loopPlaying ? .red : .green)).disabled(model.selectedLoop == nil)
                    if let playlist {
                        Button("Repeat") { edit { $0.repeatEnabled.toggle() } }.buttonStyle(BronzeDeckButtonStyle(palette: playlist.repeatEnabled ? .green : .grey)).disabled(playlist.isLoop)
                        Button("Auto") { edit { $0.autoAdvance.toggle() } }.buttonStyle(BronzeDeckButtonStyle(palette: playlist.autoAdvance ? .green : .grey)).disabled(playlist.isLoop)
                        Menu("Edit") {
                            Button("Adicionar músicas") { importing = true }
                            Button("Excluir playlist", role: .destructive) { deleteList = true }
                        }.buttonStyle(BronzeDeckButtonStyle(palette: .grey))
                    }
                }.frame(height: 38)
                if model.importingMedia || model.loadingLoop { ProgressView("Carregando…") }
                if let playlist {
                    if playlist.isLoop {
                        HStack { ForEach([4, 6], id: \.self) { beats in
                            Button(beats == 4 ? "4/4" : "6/8") { edit { $0.numerator = beats; $0.denominator = beats == 4 ? 4 : 8 } }
                                .buttonStyle(BronzeDeckButtonStyle(palette: .cyan, selected: playlist.numerator == beats))
                        }}.frame(height: 32)
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: compact ? 1 : 3), spacing: 8) {
                        ForEach(Array(playlist.tracks.enumerated()), id: \.element.id) { index, track in
                            Button { model.selectUserTrack(track.id) } label: { HStack { Text(String(format: "%02d", index + 1)); Text(track.name).lineLimit(2); Spacer(minLength: 0) }.padding(10) }
                                .buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: model.selectedLoop?.trackID == track.id)).frame(height: compact ? 52 : 76)
                                .contextMenu { Button("Retirar da playlist", role: .destructive) { model.removeTrack(track.id, playlistID: playlist.id) } }
                        }
                        Button("+ Adicionar músicas") { importing = true }.buttonStyle(BronzeDeckButtonStyle(palette: .green)).frame(height: compact ? 52 : 76)
                    }
                } else {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: compact ? 1 : 3), spacing: 8) {
                        ForEach(model.bundledLoops) { track in
                            Button(track.name) { model.selectLoop(track) }
                                .buttonStyle(BronzeDeckButtonStyle(palette: track.id == 1 ? .green : track.id == 2 ? .blue : .bronze, selected: model.selectedLoop?.id == track.id))
                                .frame(height: compact ? 60 : 96)
                        }
                    }
                }
            }.frame(maxWidth: .infinity).disabled(model.importingMedia || model.loadingLoop)
        }
        .sheet(isPresented: $adding) {
            BronzeNativeModal(title: "Nova playlist") {
                VStack(spacing: 18) {
                    TextField("Nome da playlist", text: $name).textFieldStyle(BronzeNativeFieldStyle())
                    HStack {
                        Button("Normal Playlist") { loop = false }.buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: !loop))
                        Button("Playlist de loop") { loop = true }.buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: loop))
                    }.frame(height: 44)
                    if loop { Text("Importe arquivos em 120 BPM, com edição pronta para loop.") }
                    Button("Criar") { model.createPlaylist(name: name, loop: loop); adding = false }.buttonStyle(BronzeDeckButtonStyle(palette: .green)).frame(height: 46)
                }
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.audio], allowsMultipleSelection: true) { result in
            guard let id = playlist?.id else { return }
            switch result {
            case .success(let urls): model.importTracks(urls, playlistID: id)
            case .failure(let error): model.controlError = error.localizedDescription
            }
        }
        .confirmationDialog("Excluir esta playlist? Os arquivos originais não serão apagados.", isPresented: $deleteList, titleVisibility: .visible) {
            Button("Excluir playlist", role: .destructive) { if let id = playlist?.id { model.deletePlaylist(id) } }
            Button("Cancelar", role: .cancel) {}
        }
    }
    private func edit(_ update: (inout BronzeUserPlaylist) -> Void) {
        guard var next = playlist else { return }; update(&next); model.editPlaylist(next)
    }
}

struct BronzeNativeFXEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var importing = false
    @State private var bankName = ""
    private var bank: Int { model.workspace.fxBank }
    private var pad: BronzeUserFX { model.workspace.fxBanks[bank].pads[index] }
    var body: some View {
        BronzeNativeModal(title: model.workspace.fxBanks[bank].name, canDismiss: !model.importingMedia) {
            VStack(alignment: .leading, spacing: 18) {
                Section("Banco") {
                    TextField("Nome do banco", text: $bankName).disabled(bank == 0)
                    if bank != 0 { Button("Renomear banco") { model.renameFXBank(bank, name: bankName) } }
                    else { Text("Church é fixo. Nome, volume e cor dos efeitos podem ser editados.").font(.bronzeUI(12)) }
                }
                Picker("Efeito", selection: $index) {
                    ForEach(0..<12, id: \.self) { i in Text("\(i + 1) · \(model.workspace.fxBanks[bank].pads[i].name)").tag(i) }
                }
                TextField("Nome", text: Binding(get: { pad.name }, set: { edit(name: $0) }))
                BronzeNativeValueKnob(definition: .init("Volume", -36, 0, 0, .decibels),
                    value: Binding(get: { pad.gainDb }, set: { edit(gain: $0) }))
                Picker("Cor", selection: Binding(get: { pad.color }, set: { edit(color: $0) })) {
                    ForEach(0..<8, id: \.self) { color in Text("Cor \(color + 1)").foregroundStyle(BronzePresetPalette.colors[color]).tag(color) }
                }
                if bank != 0 {
                    Text(pad.key == nil ? "Nenhum arquivo" : "Arquivo importado").font(.bronzeUI(12))
                    Button("Importar / substituir áudio") { importing = true }
                }
                Text("Gate · Infinite Release: um toque dispara o áudio até o final. Não é Toggle.").font(.bronzeUI(12))
                if model.importingMedia { ProgressView("Importando…") }
            }
            .disabled(model.importingMedia)
            .pickerStyle(.menu).textFieldStyle(BronzeNativeFieldStyle())
        }
        .onAppear { bankName = model.workspace.fxBanks[bank].name }
        .interactiveDismissDisabled(model.importingMedia)
        .fileImporter(isPresented: $importing, allowedContentTypes: [.audio]) { result in
            switch result {
            case .success(let url): model.importFX(url, bank: bank, index: index)
            case .failure(let error): model.controlError = error.localizedDescription
            }
        }
    }
    private func edit(name: String? = nil, gain: Double? = nil, color: Int? = nil) {
        model.editFX(bank: bank, index: index, name: name ?? pad.name, gain: gain ?? pad.gainDb, color: color ?? pad.color)
    }
}

struct BronzeNativeSynthPresets: View {
    @ObservedObject var model: BronzeNativeAppModel
    @Environment(\.dismiss) private var dismiss
    @State private var target = 0
    @State private var name = ""
    @State private var color = 0
    @State private var editing = false
    @State private var replacing = false
    var body: some View {
        BronzeNativeModal(title: "Presets do Synth") {
            VStack {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4)) {
                    ForEach(0..<16, id: \.self) { index in
                        let preset = model.workspace.synthPresets[index]
                        VStack(spacing: 4) {
                            Button {
                                if preset.sound == nil { edit(index) } else { model.recallSynthPreset(index) }
                            } label: {
                                Text("\(index + 1) · \(preset.name)").font(.bronzeUI(12))
                                    .foregroundStyle(.black).frame(maxWidth: .infinity, minHeight: 50)
                                    .background(BronzePresetPalette.colors[preset.color]).clipShape(RoundedRectangle(cornerRadius: 6))
                                    .overlay { if model.workspace.activeSynthPreset == index { BronzePresetHighlight() } }
                            }
                            Button("Salvar / Editar") { edit(index) }.font(.bronzeUI(10))
                        }
                    }
                }.padding()
            }

            .sheet(isPresented: $editing) {
                NavigationView {
                    Form {
                        TextField("Nome", text: $name)
                        Picker("Cor", selection: $color) { ForEach(0..<8, id: \.self) { Text("Cor \($0 + 1)").tag($0) } }
                        Text("Guarda os três osciladores, filtro, LFO, Glide e envelope. Não altera os outros módulos.").font(.bronzeUI(12))
                        Button("Salvar o som atual aqui") {
                            if model.workspace.synthPresets[target].sound != nil { replacing = true } else { save() }
                        }
                    }.navigationTitle("Synth \(target + 1)").toolbar { Button("Cancelar") { editing = false } }
                }.navigationViewStyle(.stack)
                .confirmationDialog("Substituir este preset do Synth?", isPresented: $replacing, titleVisibility: .visible) {
                    Button("Substituir", role: .destructive) { save() }
                    Button("Cancelar", role: .cancel) {}
                }
            }
        }
    }
    private func edit(_ index: Int) { target = index; name = model.workspace.synthPresets[index].name; color = model.workspace.synthPresets[index].color; editing = true }
    private func save() { model.saveSynthPreset(target, name: name, color: color); editing = false }
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
                HStack { Text(bundled ? "Loops Bronze Keys" : playlist?.name ?? "All").lineLimit(1); Spacer(); Image(systemName: "chevron.down") }
            }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(height: 40)
                .accessibilityIdentifier("bronze.playlist.sets")
            LazyVGrid(columns: [GridItem(.fixed(38), spacing: 5)] + Array(repeating: GridItem(.flexible(), spacing: 5), count: 3), spacing: 5) {
                Button { toggleRepeat() } label: { Image(systemName: "repeat") }
                    .buttonStyle(BronzeDeckButtonStyle(palette: repeatEnabled ? .green : .red)).accessibilityLabel("Repetir música").disabled(isLoop)
                Button("Auto") { toggleAuto() }.buttonStyle(BronzeDeckButtonStyle(palette: autoAdvance ? .yellow : .red)).disabled(isLoop)
                Button("Add-BL") { addBlock() }.buttonStyle(BronzeDeckButtonStyle(palette: .purple)).disabled(bundled)
                Button("Edit") { editing.toggle() }.buttonStyle(BronzeDeckButtonStyle(palette: editing ? .green : .red)).disabled(bundled)
            }.frame(height: 36)
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
                            setButton("Loops Bronze Keys", id: "bundled")
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
                    Button("Retirar da playlist", role: .destructive) { model.removeTrack(entry.track.id, playlistID: entry.playlist.id) }
                }
        }
    }

    private func setButton(_ name: String, id: String) -> some View {
        Button(name) {
            model.editPlaylistSidebar { $0.scope = id }
            if id == "bundled" { model.selectPlaylist(nil) }
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
