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
        NavigationView {
            Form {
                Text("Backup local com sessão, presets, configurações, mapeamentos, SF2 e áudios do usuário. Não inclui senha nem sessão de login.")
                TextField("Nome do usuário no arquivo", text: $name)
                Button("Salvar UserBK") { model.exportBackup(userName: name) }
                    .disabled(!model.persistenceAvailable)
                Button("Restaurar backup") { importing = true }
                Text("Restaurar substitui os ajustes atuais. A configuração anterior fica preservada internamente; arquivos existentes não são sobrescritos.").font(.caption)
                if model.backupBusy { ProgressView("Processando arquivos…") }
            }
            .disabled(model.backupBusy)
            .navigationTitle("Backup Bronze Keys")
            .toolbar { Button("Concluir") { dismiss() }.disabled(model.backupBusy) }
        }
        .navigationViewStyle(.stack)
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
        NavigationView {
            Form {
                Toggle("Modo compatibilidade", isOn: Binding(get: { model.midiSettings.compatibility }, set: { model.setCompatibility($0) }))
                Text("Compatibilidade: Reverb 1–16 seleciona os 16 presets do banco aberto. Ao desligar, seus mapeamentos anteriores voltam intactos.").font(.caption)
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
                        Text("CC \(mapping.controller) · Canal \(mapping.channel) · Dispositivo \(mapping.device)").font(.caption)
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
                    Text("O disparo acontece diretamente no motor C++, sem depender da tela. Uma nota pode controlar um único Pad ou FX.").font(.caption)
                }
                HStack {
                    Button("Learn CC / Note") { model.beginMIDILearn(selectedTarget) }.tint(locked ? .gray : .bronze)
                    Button("Clean") { model.clearMIDIMapping(selectedTarget) }.tint(locked ? .gray : .bronze)
                    if model.learningTarget != nil { Button("Cancelar Learn") { model.learningTarget = nil } }
                }
                Text(model.midiLearnMessage).font(.caption)
            }
            .navigationTitle("MIDI Learn")
            .toolbar { Button("Concluir") { dismiss() } }
        }
        .navigationViewStyle(.stack)
        .onChange(of: section) { _ in bank = 0; model.learningTarget = nil }
        .onChange(of: target) { _ in model.learningTarget = nil }
        .onDisappear { model.learningTarget = nil }
    }
}

struct BronzeNativePlaylistLibrary: View {
    @ObservedObject var model: BronzeNativeAppModel
    @State private var adding = false
    @State private var importing = false
    @State private var name = ""
    @State private var loop = false
    @State private var deleteList = false
    private var playlist: BronzeUserPlaylist? { model.selectedUserPlaylist }
    var body: some View {
        VStack(spacing: 6) {
            HStack {
                Menu(playlist?.name ?? "Loops Bronze Keys") {
                    Button("Loops Bronze Keys · Fixa") { model.selectPlaylist(nil) }
                    ForEach(model.workspace.playlists) { list in Button(list.name) { model.selectPlaylist(list.id) } }
                }
                Button("Add Playlist") { name = ""; loop = false; adding = true }
                if playlist != nil {
                    Button("Importar áudio") { importing = true }
                    Button("Excluir playlist", role: .destructive) { deleteList = true }
                }
                if model.importingMedia { ProgressView() }
            }.disabled(model.importingMedia || model.loadingLoop)
            if let playlist {
                HStack {
                    Text(playlist.isLoop ? "Loops em 120 BPM, editados para loop" : "Músicas · velocidade original")
                        .font(.caption2).foregroundStyle(.secondary)
                    Button("Repeat") { edit { $0.repeatEnabled.toggle() } }
                        .buttonStyle(BronzeCompactButtonStyle(active: playlist.repeatEnabled)).disabled(playlist.isLoop)
                    Button("Auto") { edit { $0.autoAdvance.toggle() } }
                        .buttonStyle(BronzeCompactButtonStyle(active: playlist.autoAdvance)).disabled(playlist.isLoop)
                    if playlist.isLoop {
                        Button("4/4") { edit { $0.numerator = 4; $0.denominator = 4 } }
                            .buttonStyle(BronzeCompactButtonStyle(active: playlist.numerator == 4))
                        Button("6/8") { edit { $0.numerator = 6; $0.denominator = 8 } }
                            .buttonStyle(BronzeCompactButtonStyle(active: playlist.numerator == 6))
                    }
                }
                ScrollView {
                    LazyVStack(spacing: 4) {
                        ForEach(playlist.tracks) { track in
                            HStack {
                                Button(track.name) { model.selectUserTrack(track.id) }
                                    .buttonStyle(BronzeCompactButtonStyle(active: model.selectedLoop?.trackID == track.id))
                                Spacer()
                                Button { model.removeTrack(track.id, playlistID: playlist.id) } label: { Image(systemName: "minus.circle") }
                                    .accessibilityLabel("Retirar \(track.name) da playlist")
                            }.disabled(model.loadingLoop || model.importingMedia)
                        }
                        if playlist.tracks.isEmpty { Text("Importe os arquivos para esta playlist.").font(.caption) }
                    }
                }.frame(maxHeight: 100)
            }
        }
        .sheet(isPresented: $adding) {
            NavigationView {
                Form {
                    TextField("Nome da playlist", text: $name)
                    Picker("Tipo", selection: $loop) {
                        Text("Normal Playlist").tag(false)
                        Text("Playlist de loop").tag(true)
                    }.pickerStyle(.segmented)
                    if loop { Text("Importe arquivos em 120 BPM, com edição pronta para loop. Repeat e Auto não são usados.") }
                    Button("Criar") { model.createPlaylist(name: name, loop: loop); adding = false }
                }.navigationTitle("Nova playlist")
                    .toolbar { Button("Cancelar") { adding = false } }
            }.navigationViewStyle(.stack)
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
        NavigationView {
            Form {
                Section("Banco") {
                    TextField("Nome do banco", text: $bankName).disabled(bank == 0)
                    if bank != 0 { Button("Renomear banco") { model.renameFXBank(bank, name: bankName) } }
                    else { Text("Church é fixo. Nome, volume e cor dos efeitos podem ser editados.").font(.caption) }
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
                    Text(pad.key == nil ? "Nenhum arquivo" : "Arquivo importado").font(.caption)
                    Button("Importar / substituir áudio") { importing = true }
                }
                Text("Gate · Infinite Release: um toque dispara o áudio até o final. Não é Toggle.").font(.caption)
                if model.importingMedia { ProgressView("Importando…") }
            }
            .disabled(model.importingMedia)
            .navigationTitle(model.workspace.fxBanks[bank].name)
            .toolbar { Button("Concluir") { dismiss() }.disabled(model.importingMedia) }
        }
        .navigationViewStyle(.stack)
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
        NavigationView {
            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4)) {
                    ForEach(0..<16, id: \.self) { index in
                        let preset = model.workspace.synthPresets[index]
                        VStack(spacing: 4) {
                            Button {
                                if preset.sound == nil { edit(index) } else { model.recallSynthPreset(index) }
                            } label: {
                                Text("\(index + 1) · \(preset.name)").font(.caption.bold())
                                    .foregroundStyle(.black).frame(maxWidth: .infinity, minHeight: 50)
                                    .background(BronzePresetPalette.colors[preset.color]).clipShape(RoundedRectangle(cornerRadius: 6))
                                    .overlay { if model.workspace.activeSynthPreset == index { BronzePresetHighlight() } }
                            }
                            Button("Salvar / Editar") { edit(index) }.font(.caption2)
                        }
                    }
                }.padding()
            }
            .navigationTitle("Presets do Synth")
            .toolbar { Button("Concluir") { dismiss() } }
            .sheet(isPresented: $editing) {
                NavigationView {
                    Form {
                        TextField("Nome", text: $name)
                        Picker("Cor", selection: $color) { ForEach(0..<8, id: \.self) { Text("Cor \($0 + 1)").tag($0) } }
                        Text("Guarda os três osciladores, filtro, LFO, Glide e envelope. Não altera os outros módulos.").font(.caption)
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
        }.navigationViewStyle(.stack)
    }
    private func edit(_ index: Int) { target = index; name = model.workspace.synthPresets[index].name; color = model.workspace.synthPresets[index].color; editing = true }
    private func save() { model.saveSynthPreset(target, name: name, color: color); editing = false }
}
