import SwiftUI
import UniformTypeIdentifiers
import Security

@MainActor final class DropModel: ObservableObject {
    @Published var host: String
    @Published var code = ""
    @Published var files: [URL] = []
    @Published var received: [URL] = []
    @Published var busy = false
    @Published var progress = 0.0
    @Published var status = "Aguardando."
    private var task: Task<Void, Never>?
    private var transferGeneration = UUID()
    let deviceName: String
    init(host: String) {
        self.host = host
        if let saved = UserDefaults.standard.string(forKey: "vshook.native.dropName") { deviceName = saved }
        else {
            deviceName = ["Onça", "Tigre", "Raposa", "Lobo", "Leão", "Coruja", "Panda", "Arara"].randomElement()! + " " + ["Maçã", "Pera", "Manga", "Caju", "Uva", "Melão", "Pitanga", "Coco"].randomElement()!
            UserDefaults.standard.set(deviceName, forKey: "vshook.native.dropName")
        }
    }
    deinit { task?.cancel() }
    var base: URL? {
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["VSHOOK_TEST_BRIDGE"], let url = URL(string: raw), url.host == "127.0.0.1" { return url }
        #endif
        let raw = host.trimmingCharacters(in: .whitespacesAndNewlines)
        let address = URL(string: raw.contains("://") ? raw : "http://" + raw)?.host ?? ""
        guard LocalNetwork.number(address) != nil || address.hasSuffix(".local") else { return nil }
        return URL(string: "http://\(address):47835")
    }
    static func safeName(_ value: String) -> String {
        let invalid = CharacterSet(charactersIn: "\\/:*?\"<>|").union(.controlCharacters)
        let name = value.components(separatedBy: invalid).joined(separator: "_").trimmingCharacters(in: CharacterSet(charactersIn: ". "))
        return name.isEmpty ? "arquivo" : name
    }
    func add(_ urls: [URL]) {
        do {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent("HookDrop-" + UUID().uuidString)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            for url in urls {
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                let name = Self.safeName(url.lastPathComponent)
                let destination = folder.appendingPathComponent(name)
                guard (try url.resourceValues(forKeys: [.isDirectoryKey])).isDirectory != true else { continue }
                if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
                try FileManager.default.copyItem(at: url, to: destination)
                files.removeAll { $0.lastPathComponent == name }; files.append(destination)
            }
            status = "\(files.count) arquivo(s) selecionado(s)."
        } catch { status = error.localizedDescription }
    }
    func cancel() { transferGeneration = UUID(); task?.cancel(); task = nil; busy = false; status = "Transferência cancelada." }
    func start(send: Bool) {
        guard !busy, let base else { status = "Informe o IP do computador."; return }
        if send && (code.count != 6 || !code.allSatisfy(\.isNumber) || files.isEmpty) { status = "Escolha os arquivos e digite o código de seis dígitos."; return }
        busy = true; progress = 0; received = []
        transferGeneration = UUID()
        let generation = transferGeneration
        task = Task {
            defer { if generation == transferGeneration { busy = false; task = nil } }
            do {
                if send { try await upload(base) } else { try await download(base) }
                progress = 1; status = send ? "Arquivos enviados pela rede local." : "Arquivos recebidos. Toque em Salvar ou compartilhar."
            } catch { if !Task.isCancelled { status = error.localizedDescription } }
        }
    }
    private func upload(_ base: URL) async throws {
        let selected = files
        let sizes = try selected.map { Double(try $0.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) }
        let total = sizes.reduce(0, +)
        let manifestFiles: [JSON] = selected.enumerated().map { index, url in ["id": .string("file-\(index + 1)"), "relativePath": .string(url.lastPathComponent), "size": .number(sizes[index])] }
        var random = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, random.count, &random) == errSecSuccess else { throw BridgeError(message: "Não foi possível iniciar a transferência.") }
        let manifest: JSON = ["schemaVersion": 1, "transferId": .string(random.map { String(format: "%02x", $0) }.joined()), "code": .string(code), "rootName": "Drop Hook", "senderName": .string(deviceName), "directories": [], "files": .array(manifestFiles), "totalBytes": .number(total)]
        var failures = 0
        while true {
            try Task.checkCancellation()
            do {
                status = "Preparando envio local…"
                let start = try await BridgeHTTP.shared.request(base, "/transfer-hook/start", body: manifest)
                let missing = Set(start["missing"].array.map(\.string))
                guard !start["token"].string.isEmpty else { throw BridgeError(message: "O computador não autorizou a transferência.", status: 403) }
                var done = selected.indices.reduce(0.0) { sum, index in
                    let id = "file-\(index + 1)"
                    return sum + (missing.contains(id) ? min(sizes[index], max(0, start["offsets"][id].double)) : sizes[index])
                }
                for (index, url) in selected.enumerated() {
                    let id = "file-\(index + 1)"
                    guard missing.contains(id) else { continue }
                    let handle = try FileHandle(forReadingFrom: url)
                    defer { try? handle.close() }
                    var offset = UInt64(min(sizes[index], max(0, start["offsets"][id].double)))
                    try handle.seek(toOffset: offset)
                    while Double(offset) < sizes[index] {
                        try Task.checkCancellation()
                        guard let block = try handle.read(upToCount: 256 * 1024), !block.isEmpty else { throw BridgeError(message: "Não foi possível ler \(url.lastPathComponent).", status: 400) }
                        var req = URLRequest(url: try BridgeHTTP.shared.url(base, "/transfer-hook/file"), timeoutInterval: 20)
                        req.httpMethod = "POST"; req.httpBody = block
                        req.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
                        req.setValue(start["token"].string, forHTTPHeaderField: "x-copy-token")
                        req.setValue(id, forHTTPHeaderField: "x-copy-file-id")
                        req.setValue(String(offset), forHTTPHeaderField: "x-copy-offset")
                        _ = try await BridgeHTTP.shared.send(req)
                        offset += UInt64(block.count); done += Double(block.count); progress = total > 0 ? done / total : 0
                        status = "Enviando \(url.lastPathComponent) • \(index + 1) de \(selected.count)"
                    }
                }
                _ = try await BridgeHTTP.shared.request(base, "/transfer-hook/finish", body: ["token": start["token"]])
                return
            } catch {
                try Task.checkCancellation()
                let code = (error as? BridgeError)?.status ?? 0
                guard (code == 0 || code == 409 || code >= 500), failures < 5 else { throw error }
                failures += 1; status = "Transferência pausada. Tentando retomar (\(failures)/5)…"
                try await Task.sleep(nanoseconds: 1_200_000_000)
            }
        }
    }
    private func download(_ base: URL) async throws {
        status = "Consultando o computador na rede local…"
        var availability = try await BridgeHTTP.shared.request(base, "/transfer-hook/share/status")
        while availability["preparing"].bool && !availability["available"].bool {
            status = "O computador está preparando os arquivos…"
            try await Task.sleep(nanoseconds: 500_000_000)
            availability = try await BridgeHTTP.shared.request(base, "/transfer-hook/share/status")
        }
        guard availability["available"].bool else { throw BridgeError(message: "Nenhum arquivo está disponibilizado nesta Hook Center.") }
        let access = availability["access"].string
        guard access.count == 64, access.allSatisfy(\.isHexDigit) else { throw BridgeError(message: "Acesso temporário do Drop Hook não recebido.") }
        let manifest = try await BridgeHTTP.shared.request(base, "/transfer-hook/share/manifest", query: ["access": access])
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Drop Hook/" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let entries = manifest["files"].array
        for (index, entry) in entries.enumerated() {
            try Task.checkCancellation()
            let parts = entry["relativePath"].string.split(separator: "/").map { Self.safeName(String($0)) }
            guard !parts.isEmpty else { throw BridgeError(message: "O computador enviou um nome de arquivo inválido.") }
            let destination = parts.reduce(directory) { $0.appendingPathComponent($1) }
            try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            status = "Recebendo \(entry["relativePath"].string) • \(index + 1) de \(entries.count)"
            let url = try BridgeHTTP.shared.url(base, "/transfer-hook/share/file", query: ["access": access, "id": entry["id"].string])
            guard !FileManager.default.fileExists(atPath: destination.path) else { throw BridgeError(message: "O computador enviou dois arquivos com o mesmo nome.") }
            let partial = destination.appendingPathExtension("partial-" + UUID().uuidString)
            FileManager.default.createFile(atPath: partial.path, contents: nil)
            defer { try? FileManager.default.removeItem(at: partial) }
            let output = try FileHandle(forWritingTo: partial)
            defer { try? output.close() }
            let expected = max(0, Int64(entry["size"].double))
            var offset: Int64 = 0, failures = 0
            repeat {
                try Task.checkCancellation()
                do {
                    var request = URLRequest(url: url, timeoutInterval: 20)
                    request.setValue("bytes=\(offset)-\(min(expected - 1, offset + 256 * 1024 - 1))", forHTTPHeaderField: "Range")
                    if expected == 0 { request.setValue(nil, forHTTPHeaderField: "Range") }
                    let (temp, response) = try await BridgeHTTP.shared.session.download(for: request)
                    defer { try? FileManager.default.removeItem(at: temp) }
                    guard let response = response as? HTTPURLResponse, [200, 206].contains(response.statusCode) else {
                        throw BridgeError(message: "Não foi possível receber o arquivo.", status: (response as? HTTPURLResponse)?.statusCode ?? 0)
                    }
                    if response.statusCode == 206 {
                        let range = response.value(forHTTPHeaderField: "Content-Range") ?? ""
                        guard range.hasPrefix("bytes \(offset)-") else { throw BridgeError(message: "O computador enviou um trecho incorreto do arquivo.", status: 400) }
                    } else if offset > 0 { offset = 0; try output.truncate(atOffset: 0); try output.seek(toOffset: 0) }
                    let count = Int64(try temp.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0)
                    guard offset + count <= expected, expected == 0 || count > 0 else { throw BridgeError(message: "O arquivo foi recebido incompleto.", status: 400) }
                    let input = try FileHandle(forReadingFrom: temp)
                    defer { try? input.close() }
                    while let data = try input.read(upToCount: 256 * 1024), !data.isEmpty { try Task.checkCancellation(); try output.write(contentsOf: data) }
                    offset += count; failures = 0
                    progress = (Double(index) + (expected > 0 ? Double(offset) / Double(expected) : 1)) / Double(max(1, entries.count))
                } catch {
                    try Task.checkCancellation()
                    let code = (error as? BridgeError)?.status ?? 0
                    guard (code == 0 || code == 409 || code >= 500), failures < 5 else { throw error }
                    failures += 1; status = "Transferência pausada. Tentando retomar (\(failures)/5)…"
                    try await Task.sleep(nanoseconds: 1_200_000_000)
                }
            } while offset < expected
            try output.close()
            try FileManager.default.moveItem(at: partial, to: destination)
            received.append(destination); progress = Double(index + 1) / Double(max(1, entries.count))
        }
    }
}

struct DropView: View {
    @StateObject private var model: DropModel
    let back: () -> Void
    @State private var importFiles = false
    @State private var photos = false
    @State private var camera = false
    @State private var video = false
    @State private var share = false
    init(host: String, back: @escaping () -> Void) { _model = StateObject(wrappedValue: DropModel(host: host)); self.back = back }
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 12) {
                        Button(action: back) { Image(systemName: "chevron.left").font(.system(size: 25)).frame(width: 44, height: 44).background(Color(hex: "111E29")).cornerRadius(6) }.buttonStyle(.plain)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Drop Hook").font(.system(size: 25, weight: .bold))
                            Text("\(model.deviceName) · Transferência direta pela rede local. Não usa internet.").font(.system(size: 13)).foregroundColor(Color(hex: "9FB0BF"))
                        }
                    }
                    if model.base == nil {
                        TextField("IP do computador", text: $model.host).keyboardType(.decimalPad).modifier(HookField()).disabled(model.busy)
                    }
                    DropCard {
                        Text("Enviar para o computador").font(.title2.bold())
                        Text("Escolha arquivos, fotos ou vídeos e digite o código exibido pela Hook Center.").foregroundColor(HookTheme.muted)
                        TextField("000000", text: $model.code).keyboardType(.numberPad).multilineTextAlignment(.center).font(.largeTitle.monospacedDigit()).modifier(HookField())
                            .onChange(of: model.code) { model.code = String($0.filter(\.isNumber).prefix(6)) }
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: geometry.size.width <= 430 ? 1 : 2), spacing: 9) {
                            HookButton(title: "Galeria", icon: "photo", filled: false, expand: true) { photos = true }
                            HookButton(title: "Arquivos", icon: "folder", filled: false, expand: true) { importFiles = true }
                            HookButton(title: "Tirar foto", icon: "camera", filled: false, expand: true) { video = false; camera = true }.disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
                            HookButton(title: "Gravar vídeo", icon: "video", filled: false, expand: true) { video = true; camera = true }.disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
                        }
                        Text(model.files.isEmpty ? "Nenhum arquivo selecionado." : "\(model.files.count) arquivo(s) • \(String(format: "%.1f", model.files.reduce(0.0) { $0 + Double((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) } / 1048576)) MB").font(.system(size: 13))
                        ForEach(model.files, id: \.self) { url in HStack { Text(url.lastPathComponent).lineLimit(1); Spacer(); Button("Remover") { model.files.removeAll { $0 == url } } }.font(.caption) }
                        HookButton(title: "Enviar arquivos", icon: "arrow.up", expand: true) { model.start(send: true) }.disabled(model.files.isEmpty || model.code.count != 6)
                    }.disabled(model.busy)
                    DropCard {
                        Text("Receber do computador").font(.title2.bold())
                        Text("No computador, clique em “Disponibilizar para celular”. Este aparelho encontra a Hook Center pela rede local, sem código.").foregroundColor(HookTheme.muted)
                        HookButton(title: "Receber arquivos", icon: "arrow.down", expand: true) { model.start(send: false) }.disabled(model.busy)
                        if !model.received.isEmpty { HookButton(title: "Salvar ou compartilhar", icon: "square.and.arrow.up", expand: true) { share = true } }
                    }
                    DropCard {
                        Text("Atividade").font(.system(size: 20, weight: .bold))
                        ProgressView(value: model.progress).tint(HookTheme.gold)
                        HookStatus(text: model.status)
                        if model.busy { HookButton(title: "Cancelar transferência", color: .red, filled: false) { model.cancel() } }
                    }
                }.padding(.horizontal, 14).padding(.vertical, 16).frame(maxWidth: 708).frame(maxWidth: .infinity)
            }
        }
        .foregroundColor(.white).background(Color(hex: "071019").ignoresSafeArea())
        .fileImporter(isPresented: $importFiles, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            switch result { case .success(let urls): model.add(urls); case .failure(let error): model.status = error.localizedDescription }
        }
        .sheet(isPresented: $photos) { PhotoPicker(videos: true, multiple: true) { model.add($0) } }
        .sheet(isPresented: $camera) { CameraPicker(video: video) { if let url = $0 { model.add([url]) } } }
        .sheet(isPresented: $share) { ShareFiles(urls: model.received) }
        .onDisappear { model.cancel() }
    }
}

private struct DropCard<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }.padding(17).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(hex: "0D1923")).cornerRadius(20)
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Color(hex: "263D4F")))
    }
}
