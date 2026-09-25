import SwiftUI
import PhotosUI
import AVFoundation

struct BronzeNativePhotoPicker: UIViewControllerRepresentable {
    let selected: (UIImage?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(selected: selected) }
    func makeUIViewController(context: Context) -> PHPickerViewController {
        var configuration = PHPickerConfiguration()
        configuration.filter = .images; configuration.selectionLimit = 1
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ controller: PHPickerViewController, context: Context) {}
    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let selected: (UIImage?) -> Void
        init(selected: @escaping (UIImage?) -> Void) { self.selected = selected }
        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            guard let item = results.first?.itemProvider, item.canLoadObject(ofClass: UIImage.self) else { selected(nil); return }
            item.loadObject(ofClass: UIImage.self) { [selected] value, _ in DispatchQueue.main.async { selected(value as? UIImage) } }
        }
    }
}

struct BronzeProfilePhotoEditor: View {
    let image: UIImage
    var chooseAgain: () -> Void = {}
    let save: (Data) -> Void
    @State private var zoom = 1.0
    @State private var offset = CGSize.zero
    @State private var dragOrigin = CGSize.zero
    @State private var previewSize = CGSize(width: 720, height: 405)
    var body: some View {
        BronzeNativeModal(title: "Prévia da foto", scrollable: false) {
            GeometryReader { bounds in
                VStack(spacing: 8) {
                    GeometryReader { proxy in
                        let diameter = proxy.size.height * 0.68
                        let scale = max(diameter / image.size.width, diameter / image.size.height) * zoom
                        ZStack {
                            Color(bronzeHex: 0x090604)
                            Image(uiImage: image).resizable()
                                .frame(width: image.size.width * scale, height: image.size.height * scale)
                                .offset(offset)
                            Canvas { context, size in
                                var mask = Path(CGRect(origin: .zero, size: size))
                                mask.addEllipse(in: CGRect(x: (size.width - diameter) / 2, y: (size.height - diameter) / 2, width: diameter, height: diameter))
                                context.fill(mask, with: .color(.black.opacity(0.65)), style: FillStyle(eoFill: true))
                            }.allowsHitTesting(false)
                            Circle().stroke(Color.white.opacity(0.85), lineWidth: 2).frame(width: diameter, height: diameter).allowsHitTesting(false)
                        }.frame(width: proxy.size.width, height: proxy.size.height).clipped().contentShape(Rectangle())
                            .gesture(DragGesture().onChanged { gesture in
                                offset = bounded(CGSize(width: dragOrigin.width + gesture.translation.width, height: dragOrigin.height + gesture.translation.height))
                            }.onEnded { _ in dragOrigin = offset })
                            .onAppear { previewSize = proxy.size }
                            .onChange(of: proxy.size) { previewSize = $0; offset = bounded(offset); dragOrigin = offset }
                    }.frame(height: max(80, min(bounds.size.height - 80, bounds.size.width * 9 / 16)))
                    Text("Arraste a imagem e ajuste o zoom. A área dentro do círculo será usada no perfil.")
                        .font(.bronzeUI(11)).lineLimit(2)
                    HStack {
                        Button("−") { changeZoom(zoom / 1.18) }.accessibilityLabel("Diminuir foto")
                        Text(String(format: "%.0f%%", zoom * 100)).font(.bronzeUI(12))
                        Button("+") { changeZoom(zoom * 1.18) }.accessibilityLabel("Aumentar foto")
                        Spacer()
                        Button("Escolher outra", action: chooseAgain)
                        Button("Usar esta foto") { crop() }
                    }.buttonStyle(BronzeCompactButtonStyle(active: false))
                }
            }
        }
    }
    private func changeZoom(_ value: Double) {
        let next = min(4, max(1, value)), ratio = next / zoom
        zoom = next
        offset = bounded(CGSize(width: offset.width * ratio, height: offset.height * ratio)); dragOrigin = offset
    }
    private func bounded(_ proposed: CGSize) -> CGSize {
        let diameter = previewSize.height * 0.68
        let scale = max(diameter / image.size.width, diameter / image.size.height) * zoom
        let x = max(0, (image.size.width * scale - diameter) / 2)
        let y = max(0, (image.size.height * scale - diameter) / 2)
        return CGSize(width: min(x, max(-x, proposed.width)), height: min(y, max(-y, proposed.height)))
    }
    private func crop() {
        let target = CGSize(width: 256, height: 256)
        let scale = max(target.width / image.size.width, target.height / image.size.height) * zoom
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let ratio = 256 / max(1, previewSize.height * 0.68)
        let origin = CGPoint(x: (256 - size.width) / 2 + offset.width * ratio,
                             y: (256 - size.height) / 2 + offset.height * ratio)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let result = UIGraphicsImageRenderer(size: target, format: format).image { context in
            UIColor.black.setFill(); context.fill(CGRect(origin: .zero, size: target))
            image.draw(in: CGRect(origin: origin, size: size))
        }
        if let data = result.jpegData(compressionQuality: 0.82) { save(data) }
    }
}

struct BronzeNativeAccountView: View {
    @ObservedObject var account: BronzeNativeAccount
    @ObservedObject var model: BronzeNativeAppModel
    @State private var panel = 0
    @State private var backup = false
    @State private var editingName = false
    @State private var pickPhoto = false
    @State private var previewPhoto = false
    @State private var choosePhotoAgain = false
    @State private var photoCandidate: UIImage?
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var confirmation = ""
    @State private var profileName = ""
    @State private var removalID: String?
    @State private var confirmRemoval = false
    @State private var confirmLogout = false
    var body: some View {
        BronzeNativeModal(title: "User") {
            VStack(alignment: .leading, spacing: 20) {
                if let session = account.session {
                    HStack(spacing: 20) {
                        Button { pickPhoto = true } label: {
                            ZStack(alignment: .bottomTrailing) {
                                Group {
                                    if let bytes = account.profilePhoto.split(separator: ",", maxSplits: 1).last.flatMap({ Data(base64Encoded: String($0)) }), let image = UIImage(data: bytes) {
                                        Image(uiImage: image).resizable().scaledToFill()
                                    } else { Image(systemName: "person.crop.circle.fill").resizable().scaledToFit().padding(14).foregroundStyle(Color.bronzeLight) }
                                }.frame(width: 90, height: 90).clipShape(Circle())
                                Image(systemName: "plus.circle.fill").font(.system(size: 22)).foregroundStyle(Color.bronzeLight).padding(4)
                            }
                        }.buttonStyle(.plain).accessibilityLabel("Escolher foto do perfil")
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Perfil").font(.bronzeUI(12)).foregroundStyle(.secondary)
                            if editingName {
                                HStack {
                                    TextField("Nome", text: $profileName).textFieldStyle(BronzeNativeFieldStyle())
                                    Button("Salvar") { Task { await account.saveName(profileName); editingName = false } }.buttonStyle(BronzeCompactButtonStyle(active: true))
                                }
                            } else {
                                HStack {
                                    Text(session.account.name ?? "Músico").font(.bronzeUI(24))
                                    Button { editingName = true } label: { Image(systemName: "pencil") }.accessibilityLabel("Editar nome")
                                }
                            }
                            Text(session.account.email).font(.bronzeUI(12)).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Sair") { confirmLogout = true }.buttonStyle(BronzeDeckButtonStyle(palette: .red)).frame(width: 100, height: 44)
                    }.padding(20).modifier(BronzeDeckSurface())
                    HStack(alignment: .top, spacing: 18) {
                        VStack(spacing: 10) {
                            Button("Salvar backup") { backup = true }
                            Button("Restaurar backup") { backup = true }
                            Button("Redefinir senha") { panel = 1 }
                            Button("Dispositivos") { panel = 2; Task { await account.listDevices() } }
                        }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(width: 240, height: 250)
                        VStack(alignment: .leading, spacing: 16) {
                            if panel == 1 {
                                Text("Redefinir senha").font(.bronzeUI(18)).foregroundStyle(Color.bronzeLight)
                                SecureField("Nova senha", text: $password).textContentType(.newPassword).textFieldStyle(BronzeNativeFieldStyle())
                                SecureField("Confirmar senha", text: $confirmation).textContentType(.newPassword).textFieldStyle(BronzeNativeFieldStyle())
                                Button("Alterar senha") { Task { await account.changePassword(password, confirmation: confirmation); password = ""; confirmation = "" } }
                                    .buttonStyle(BronzeDeckButtonStyle()).frame(height: 44)
                            } else if panel == 2 {
                                Text("Dispositivos").font(.bronzeUI(18)).foregroundStyle(Color.bronzeLight)
                                ForEach(account.devices) { device in
                                    HStack {
                                        Text(device.name + (device.current ? " · Este dispositivo" : "")).font(.bronzeUI(13))
                                        Spacer()
                                        Button("Remover", role: .destructive) { removalID = device.id; password = ""; confirmRemoval = true }
                                            .buttonStyle(BronzeCompactButtonStyle(active: false))
                                    }.padding(12).modifier(BronzeDeckSurface())
                                }
                            } else {
                                if let used = account.usedLicenses, let total = account.totalLicenses {
                                    Text("\(used) de \(total)").font(.bronzeUI(36)).foregroundStyle(Color.bronzeLight)
                                    Text("licenças utilizadas").font(.bronzeUI(16))
                                } else {
                                    Text("Licenças").font(.bronzeUI(22)).foregroundStyle(Color.bronzeLight)
                                    Button("Atualizar") { Task { await account.listDevices() } }.buttonStyle(BronzeCompactButtonStyle(active: false))
                                }
                            }
                        }.frame(maxWidth: .infinity, minHeight: 220, alignment: .topLeading).padding(20).modifier(BronzeDeckSurface())
                    }
                }
                if account.busy { ProgressView("Aguarde…") }
                if !account.message.isEmpty { Text(account.message).font(.bronzeUI(12)).foregroundStyle(.orange) }
            }.disabled(account.busy)
        }
        .sheet(isPresented: $backup) { BronzeNativeBackupPanel(model: model, userName: profileName) }
        .onAppear { profileName = account.session?.account.name ?? "" }
        .task { await account.loadProfile(); await account.listDevices() }
        .sheet(isPresented: $pickPhoto, onDismiss: { if photoCandidate != nil { previewPhoto = true } }) {
            BronzeNativePhotoPicker { photoCandidate = $0; pickPhoto = false }
        }
        .sheet(isPresented: $previewPhoto, onDismiss: {
            photoCandidate = nil
            if choosePhotoAgain { choosePhotoAgain = false; pickPhoto = true }
        }) {
            if let image = photoCandidate { BronzeProfilePhotoEditor(image: image, chooseAgain: { choosePhotoAgain = true; previewPhoto = false }) { data in
                previewPhoto = false
                Task { await account.saveProfilePhoto(data) }
            } }
        }
        .onChange(of: account.authorized) { if !$0 { dismiss() } }
        .sheet(isPresented: $confirmRemoval) {
            NavigationView {
                Form {
                    Text("Confirme a remoção com sua senha.")
                    SecureField("Senha", text: $password)
                    Button("Confirmar", role: .destructive) {
                        guard let removalID else { return }
                        Task {
                            await account.removeDevice(removalID, password: password)
                            password = ""; confirmRemoval = false
                        }
                    }.disabled(account.busy)
                }.navigationTitle("Confirmar dispositivo").toolbar { Button("Cancelar") { password = ""; confirmRemoval = false } }
            }.navigationViewStyle(.stack)
        }
        .confirmationDialog("Sair da conta neste dispositivo?", isPresented: $confirmLogout, titleVisibility: .visible) {
            Button("Sair", role: .destructive) { Task { await account.logout() } }
            Button("Cancelar", role: .cancel) {}
        }
    }
}

struct BronzeNativeCatalogList: View {
    @ObservedObject var model: BronzeNativeAppModel
    @ObservedObject var account: BronzeNativeAccount
    let moduleIndex: Int
    let categoryID: String
    let preview: (BronzeCatalogSound) -> Void
    let selected: () -> Void
    private var sounds: [BronzeCatalogSound] { account.categories.first(where: { $0.id == categoryID })?.sounds ?? [] }
    var body: some View {
        GeometryReader { geometry in
            let height = max(36, (geometry.size.height - 18) / 4)
            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6) {
                    ForEach(sounds) { sound in
                        Button {
                            if let font = model.catalogFont(sound.id) { selected(); model.selectUserSoundFont(font, moduleIndex: moduleIndex, catalogSound: sound) }
                            else { preview(sound) }
                        } label: {
                            VStack(spacing: 4) {
                                Text(sound.name).font(.bronzeUI(12)).lineLimit(2)
                                Text(model.catalogFont(sound.id) == nil ? "Baixar" : "No dispositivo").font(.bronzeUI(9)).opacity(0.75)
                            }.foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: height)
                                .background(LinearGradient(colors: [Color(bronzeHex: sound.color), .black.opacity(0.75)], startPoint: .top, endPoint: .bottom)).cornerRadius(5)
                                .overlay { if model.catalogFont(sound.id) == model.moduleSoundFonts[moduleIndex] && model.catalogFont(sound.id) != nil { BronzePresetHighlight().allowsHitTesting(false) } }
                        }.buttonStyle(.plain).accessibilityIdentifier("bronze.library.sound.\(sound.id)")
                            .contextMenu { Button("Detalhes / Preview") { preview(sound) } }
                    }
                }
                if sounds.isEmpty { Text("Nenhum timbre nesta categoria.").foregroundStyle(.secondary).padding(20) }
            }.accessibilityIdentifier("bronze.library.grid")
        }
    }
}

@MainActor final class BronzeCatalogPreviewAudio: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var playing = false
    @Published private(set) var loading = false
    @Published private(set) var error = ""
    private var player: AVAudioPlayer?
    private var request: Task<Void, Never>?
    func toggle(sound: BronzeCatalogSound, account: BronzeNativeAccount) {
        if playing || loading { stop(); return }
        loading = true; error = ""
        request = Task {
            do {
                let data = try await account.previewData(sound)
                try Task.checkCancellation()
                let next = try AVAudioPlayer(data: data)
                next.delegate = self; next.prepareToPlay()
                player = next; playing = next.play()
                if !playing { error = "Não foi possível reproduzir o preview." }
            } catch is CancellationError { }
            catch { self.error = "Não foi possível reproduzir o preview. \(error.localizedDescription)" }
            loading = false
        }
    }
    func stop() { request?.cancel(); request = nil; player?.stop(); player = nil; playing = false; loading = false }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in self?.playing = false }
    }
}

struct BronzeNativeSoundPreview: View {
    @ObservedObject var model: BronzeNativeAppModel
    @ObservedObject var account: BronzeNativeAccount
    let sound: BronzeCatalogSound
    let close: () -> Void
    @StateObject private var audio = BronzeCatalogPreviewAudio()
    private var installed: Bool { model.catalogFont(sound.id) != nil }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                RoundedRectangle(cornerRadius: 6).fill(Color(bronzeHex: sound.color)).frame(width: 46, height: 46)
                VStack(alignment: .leading, spacing: 4) {
                    Text(installed ? "Salvo neste dispositivo" : "Disponível para download").font(.bronzeUI(11)).foregroundStyle(.secondary)
                    Text(sound.name).font(.bronzeUI(22))
                }
                Spacer()
                Button("Voltar", action: close).buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(width: 85, height: 36)
            }
            if let bytes = sound.byteSize { Text(ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)).font(.bronzeUI(14)).foregroundStyle(Color.bronzeLight) }
            HStack(spacing: 12) {
                Button(audio.loading ? "Carregando preview…" : audio.playing ? "Parar preview" : "Ouvir preview") { audio.toggle(sound: sound, account: account) }
                    .buttonStyle(BronzeDeckButtonStyle(palette: .purple)).disabled(sound.previewObjectKey == nil)
                    .accessibilityIdentifier("bronze.library.listen")
                Button(installed && !model.catalogNeedsUpdate(sound) ? "No dispositivo" : "Baixar") {
                    audio.stop(); model.downloadCatalogSounds([sound], account: account); close()
                }.buttonStyle(BronzeDeckButtonStyle(palette: .green)).disabled(model.catalogDownloadName != nil || (installed && !model.catalogNeedsUpdate(sound)))
            }.frame(height: 52)
            if sound.previewObjectKey == nil { Text("Preview ainda não publicado").font(.bronzeUI(12)).foregroundStyle(.secondary) }
            if !audio.error.isEmpty { Text(audio.error).font(.bronzeUI(12)).foregroundStyle(.orange) }
        }.onDisappear { audio.stop() }
    }
}
