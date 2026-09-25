import SwiftUI
import AVKit

@MainActor final class ChatModel: ObservableObject {
    static var bootstrapURL: URL?
    static let backend = URL(string: "https://hookupdate7.up.railway.app")!
    @Published var email = ""
    @Published var session: JSON = .null
    @Published var state: JSON = [:]
    @Published var messages: [JSON] = []
    @Published var text = ""
    @Published var status = ""
    @Published var sending = false
    @Published var reply: JSON = .null
    @Published var media: JSON = .null
    @Published var mediaKind = ""
    @Published var recording = false
    @Published var recordingStarted: Date?
    private var recordingLimit: Task<Void, Never>?
    private var recorder: AVAudioRecorder?
    private var recordURL: URL?
    private var revision = 0
    private var generation = UUID()
    var loggedIn: Bool { !session["accessToken"].string.isEmpty }
    var closed: Bool { state["chat"]["open"] == false && !admin }
    var quota: String {
        let used = state["limits"]["usedToday"].int
        return admin ? "Administrador" : state["limits"]["unlimited"].bool ? "\(used) hoje • ilimitado" : "\(used)/\(max(1, state["limits"]["dailyLimit"].int)) hoje"
    }
    var admin: Bool { state["user"]["isAdmin"].bool }
    var canSend: Bool {
        guard state["user"]["id"].int > 0, !sending else { return false }
        return admin || (state["chat"]["open"] != false && (state["limits"]["unlimited"].bool || state["limits"]["remainingToday"].int > 0))
    }
    init() {
        #if DEBUG
        if ProcessInfo.processInfo.environment["VSHOOK_TEST_CHAT"] == "1" {
            session = ["accessToken": "vshcm_fixture"]
            apply(["ok": true, "user": ["id": 2, "name": "Músico teste", "isAdmin": false], "chat": ["open": true, "pinnedMessage": "Aviso fixado de teste"], "presence": ["onlineCount": 3], "limits": ["remainingToday": 8, "dailyLimit": 10, "usedToday": 2], "messages": [["id": 1, "customerId": 1, "name": "Diretor teste", "isAdmin": true, "text": "Mensagem do administrador", "createdAt": "2026-09-25T12:00:00Z"], ["id": 2, "customerId": 2, "name": "Músico teste", "isAdmin": false, "text": "Mensagem do músico", "createdAt": "2026-09-25T12:01:00Z"], ["id": 3, "customerId": 1, "name": "Diretor teste", "isAdmin": true, "text": "teste", "audioUrl": "http://127.0.0.1:58150/test-voice.wav", "createdAt": "2026-09-25T12:02:00Z"]]], full: true)
            return
        }
        #endif
        if let data = SecretStore.read("chat"), let saved = try? JSONDecoder().decode(JSON.self, from: data) {
            let expiry = ISO8601DateFormatter().date(from: saved["expiresAt"].string)
            if expiry == nil || expiry! > Date() { session = saved }
        }
    }
    func store(_ value: JSON) throws {
        guard value["accessToken"].string.hasPrefix("vshcm_") else { throw BridgeError(message: "Não foi possível identificar a conta.") }
        var value = value
        value["backendUrl"] = .string(Self.backend.absoluteString)
        try SecretStore.write(JSONEncoder().encode(value), account: "chat")
        session = value; generation = UUID(); messages = []; revision = 0
    }
    func login() async {
        guard !sending else { return }
        sending = true; defer { sending = false }
        do {
            let result = try await BridgeHTTP.shared.request(Self.backend, "/api/chat/mobile/session", body: ["email": .string(email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()), "mobileLogin": true], timeout: 20)
            try store(result["mobileSession"]); status = ""
        } catch { status = "Não foi possível entrar. Confira o e-mail da conta e tente novamente." }
    }
    func bootstrap() async {
        guard let url = Self.bootstrapURL,
              let key = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "chatKey" })?.value else { return }
        Self.bootstrapURL = nil
        do {
            let result = try await BridgeHTTP.shared.request(url, "/chat/bootstrap", body: ["bootstrapKey": .string(key)])
            try store(result["mobileSession"])
        } catch { status = error.localizedDescription }
    }
    func post(_ path: String, _ body: JSON = [:]) async throws -> JSON {
        #if DEBUG
        if ProcessInfo.processInfo.environment["VSHOOK_TEST_CHAT"] == "1" { return ["ok": true] }
        #endif
        guard loggedIn else { throw BridgeError(message: "Entre com sua conta do Chat Hook.") }
        do { return try await BridgeHTTP.shared.request(Self.backend, "/api/chat/" + path, body: body.merging(["chatMobileToken": session["accessToken"]]), timeout: 20) }
        catch let error as BridgeError {
            if error.status == 401 { try? SecretStore.write(nil, account: "chat"); session = .null; generation = UUID(); messages = []; media = .null }
            throw error
        }
    }
    func poll() async {
        #if DEBUG
        if ProcessInfo.processInfo.environment["VSHOOK_TEST_CHAT"] == "1" { return }
        #endif
        await bootstrap()
        while !Task.isCancelled {
            if loggedIn {
                let token = generation
                do {
                    var result = try await post("state", ["afterId": .number(Double(messages.last?["id"].int ?? 0))])
                    var full = messages.isEmpty
                    if revision != 0, result["chat"]["revision"].int != revision { result = try await post("state", ["afterId": 0]); full = true }
                    guard !Task.isCancelled, token == generation else { continue }
                    apply(result, full: full)
                } catch { if !Task.isCancelled { status = error.localizedDescription } }
            }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        }
    }
    func apply(_ data: JSON, full: Bool) {
        state = state.merging(data); revision = state["chat"]["revision"].int
        var indexed: [Int: JSON] = full ? [:] : Dictionary(messages.map { ($0["id"].int, $0) }, uniquingKeysWith: { _, last in last })
        for message in data["messages"].array where message["id"].int > 0 { indexed[message["id"].int] = message }
        messages = indexed.sorted { $0.key < $1.key }.map(\.value)
    }
    func attachImage(_ url: URL, avatar: Bool = false) {
        do {
            let raw = try Data(contentsOf: url)
            guard let image = UIImage(data: raw) else { throw BridgeError(message: "Escolha uma imagem válida.") }
            let scale = min(1, 1920 / max(image.size.width, image.size.height))
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let format = UIGraphicsImageRendererFormat(); format.scale = 1
            let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
            guard let data = resized.jpegData(compressionQuality: 0.8), data.count <= (avatar ? 3 : 6) * 1024 * 1024 else { throw BridgeError(message: "A imagem é grande demais.") }
            let payload: JSON = ["mimeType": "image/jpeg", "base64": .string(data.base64EncodedString())]
            if avatar { action("avatar", ["image": payload]) }
            else { media = payload; mediaKind = "image"; status = "Imagem anexada." }
        } catch { status = error.localizedDescription }
    }
    func send() async {
        guard canSend, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || media.exists else { return }
        guard text.count <= 1000 else { status = "A mensagem pode ter no máximo 1000 caracteres."; return }
        sending = true; defer { sending = false }
        do {
            let result = try await post("messages", ["text": .string(text), "replyToMessageId": reply["id"], "image": mediaKind == "image" ? media : .null, "audio": mediaKind == "audio" ? media : .null])
            apply(result, full: false); text = ""; media = .null; mediaKind = ""; reply = .null; status = ""
        } catch { status = error.localizedDescription }
    }
    func action(_ path: String, _ payload: JSON = [:], full: Bool = true) {
        Task { do { let result = try await post(path, payload); apply(result, full: full); status = "" } catch { status = error.localizedDescription } }
    }
    func logout() async {
        if loggedIn { _ = try? await post("mobile/logout") }
        try? SecretStore.write(nil, account: "chat")
        session = .null; state = [:]; messages = []; generation = UUID(); cancelRecording(); media = .null
    }
    func mayEdit(_ item: JSON) -> Bool { (admin || item["customerId"] == state["user"]["id"]) && item["id"].int > 0 }
    func startRecording() async {
        let audio = AVAudioSession.sharedInstance()
        let permitted = await withCheckedContinuation { continuation in audio.requestRecordPermission { continuation.resume(returning: $0) } }
        guard permitted else { status = "Permita o acesso ao microfone nos Ajustes."; return }
        do {
            try audio.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
            try audio.setActive(true)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".m4a")
            let recorder = try AVAudioRecorder(url: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64000])
            guard recorder.record(forDuration: 60) else { throw BridgeError(message: "Não foi possível iniciar a gravação.") }
            self.recorder = recorder; recordURL = url; recording = true; recordingStarted = Date()
            recordingLimit?.cancel()
            recordingLimit = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                guard !Task.isCancelled, let self, self.recording else { return }
                self.finishRecording()
            }
        } catch { status = error.localizedDescription }
    }
    func finishRecording() {
        recordingLimit?.cancel(); recordingLimit = nil; recordingStarted = nil
        let duration = recorder?.currentTime ?? 0
        recorder?.stop(); recorder = nil; recording = false
        defer { if let url = recordURL { try? FileManager.default.removeItem(at: url) }; recordURL = nil; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
        guard let url = recordURL, let data = try? Data(contentsOf: url) else { return }
        media = ["mimeType": "audio/mp4", "base64": .string(data.base64EncodedString()), "durationSeconds": .number(duration)]
        mediaKind = "audio"; status = "Áudio anexado."
    }
    func cancelRecording() { recordingLimit?.cancel(); recordingLimit = nil; recordingStarted = nil; recorder?.stop(); recorder = nil; recording = false; if let url = recordURL { try? FileManager.default.removeItem(at: url) }; recordURL = nil; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
}

struct ChatView: View {
    @StateObject private var model = ChatModel()
    let back: () -> Void
    @State private var picker = false
    @State private var avatar = false
    @State private var editing: JSON = .null
    @State private var editText = ""
    @State private var showEdit = false
    @State private var showAdmin = false
    @State private var deleteID: Int?
    @State private var openedImage: String?
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button(action: back) { Image(systemName: "chevron.left").font(.system(size: 25)).frame(width: 38, height: 38).background(Color.white.opacity(0.07)).cornerRadius(6) }.buttonStyle(.plain).accessibilityLabel("Voltar")
                if model.loggedIn { avatarView(model.state["user"], size: 54) }
                VStack(alignment: .leading, spacing: 3) {
                    Text("Chat Hook").font(.system(size: 19, weight: .bold))
                    Text(model.loggedIn ? "\(model.state["chat"]["open"] == false ? "Somente administradores" : "Ao vivo") · \(model.state["presence"]["onlineCount"].int) online" : "Entre com sua conta")
                        .font(.system(size: 11)).foregroundColor(Color(hex: "88F3A6"))
                }
                Spacer(minLength: 0)
                if model.loggedIn {
                    if model.admin {
                        Button { showAdmin = true } label: { Image(systemName: "line.3.horizontal").frame(width: 34, height: 34) }.accessibilityLabel("Configurar chat")
                    } else { Button("Sair") { Task { await model.logout() } }.foregroundColor(Color(hex: "FCA5A5")) }
                    Menu("Foto") {
                        Button("Alterar foto") { avatar = true; picker = true }
                        if !model.state["user"]["avatarUrl"].string.isEmpty { Button("Remover foto") { model.action("avatar", ["remove": true]) } }
                    }
                }
            }.font(.system(size: 12, weight: .bold)).padding(.horizontal, 12).padding(.vertical, 9).background(Color(hex: "0C0C14"))
            if !model.loggedIn { login }
            else {
                if !model.state["chat"]["pinnedMessage"].string.isEmpty {
                    VStack(alignment: .leading, spacing: 5) {
                        HStack { Label("Mensagem fixada", systemImage: "pin.fill").font(.system(size: 11, weight: .bold)).foregroundColor(Color(hex: "9EFF00")); Spacer(); if model.admin { Button("Desafixar") { model.action("pin", ["messageId": 0]) }.font(.caption) } }
                        Text(model.state["chat"]["pinnedMessage"].string).font(.system(size: 12))
                    }.padding(10).background(Color(hex: "9EFF00").opacity(0.075)).cornerRadius(12).padding(.horizontal, 10).padding(.top, 8)
                }
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            if model.messages.isEmpty { Text("Nenhuma mensagem ainda. Comece a conversa.").font(.system(size: 13)).foregroundColor(HookTheme.muted).frame(maxWidth: .infinity).padding(24) }
                            ForEach(model.messages, id: \.identifier) { item in bubble(item, jump: { id in withAnimation { proxy.scrollTo(id, anchor: .center) } }).id(item["id"].int) }
                        }.padding()
                    }.onChange(of: model.messages.last?["id"]) { id in if let id { withAnimation { proxy.scrollTo(id.int, anchor: .bottom) } } }
                }
                if model.closed { Text("Chat fechado pelo administrador").font(.system(size: 13, weight: .bold)).foregroundColor(Color(hex: "FFD978")).padding(13).frame(maxWidth: .infinity).background(Color.orange.opacity(0.09)).cornerRadius(12).padding(10) } else { composer }
            }
            if !model.loggedIn { HookStatus(text: model.status) }
        }.foregroundColor(.white).background(LinearGradient(colors: [Color(hex: "151521"), Color(hex: "08080F")], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
        .sheet(isPresented: Binding(get: { openedImage != nil }, set: { if !$0 { openedImage = nil } })) {
            HookScreen(title: "Imagem", back: { openedImage = nil }) {
                if let raw = openedImage, let url = URL(string: raw) { AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { ProgressView() }.frame(maxWidth: .infinity, maxHeight: .infinity) }
            }
        }
        .task { await model.poll() }.onDisappear { model.cancelRecording() }
        .sheet(isPresented: $picker) { PhotoPicker { urls in if let url = urls.first { model.attachImage(url, avatar: avatar) } } }
        .sheet(isPresented: $showAdmin) { ChatAdminView(model: model) }
        .sheet(isPresented: $showEdit) {
            HookScreen(title: "Editar mensagem", back: { showEdit = false }) {
                TextEditor(text: $editText).padding()
                HookButton(title: "Salvar") { model.action("edit", ["messageId": editing["id"], "text": .string(editText)]); showEdit = false }.disabled(editText.count > 1000)
            }
        }
        .alert("Apagar mensagem?", isPresented: Binding(get: { deleteID != nil }, set: { if !$0 { deleteID = nil } })) {
            Button("Cancelar", role: .cancel) { deleteID = nil }
            Button("Apagar", role: .destructive) { if let id = deleteID { model.action("delete", ["messageId": .number(Double(id))]) }; deleteID = nil }
        }
    }
    private var login: some View {
        VStack {
            Spacer()
            HookCard {
                Image("HookLogo").resizable().scaledToFit().frame(width: 74, height: 74)
                Text("Entre com a sua conta do Chat Hook.").font(.headline)
                TextField("E-mail da conta", text: $model.email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().modifier(HookField())
                HookButton(title: model.sending ? "Entrando…" : "Entrar", expand: true) { Task { await model.login() } }.disabled(model.sending || model.email.isEmpty)
            }.frame(maxWidth: 480).padding()
            Spacer()
        }
    }
    private func avatarView(_ user: JSON, size: CGFloat = 48) -> some View {
        Button { if !user["avatarUrl"].string.isEmpty { openedImage = user["avatarUrl"].string } } label: {
            Group {
                if !user["avatarUrl"].string.isEmpty, let url = URL(string: user["avatarUrl"].string) {
                    AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Text(initials(user["name"].string)) }
                } else { Text(initials(user["name"].string)).font(.system(size: 13, weight: .heavy)) }
            }.frame(width: size, height: size).background(LinearGradient(colors: [Color(hex: "CF37FF"), Color(hex: "541C9E")], startPoint: .topLeading, endPoint: .bottomTrailing)).clipShape(Circle())
        }.buttonStyle(.plain).accessibilityLabel("Foto de \(user["name"].string)")
    }
    private func initials(_ name: String) -> String { String(name.split(separator: " ").prefix(2).compactMap(\.first)).uppercased() }
    private func messageTime(_ raw: String) -> String {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: raw) ?? ISO8601DateFormatter().date(from: raw) else { return "" }
        let display = DateFormatter(); display.dateFormat = "HH:mm"; return display.string(from: date)
    }
    private func bubble(_ item: JSON, jump: @escaping (Int) -> Void) -> some View {
        HStack(alignment: .top, spacing: 8) {
            if item["isAdmin"].bool { avatarView(item) } else { Spacer(minLength: 30) }
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 5) {
                    Text(item["name"].string).font(.system(size: 11, weight: .bold)).lineLimit(1)
                    if item["isAdmin"].bool { Text("ADMIN").font(.system(size: 7, weight: .heavy)).foregroundColor(Color(hex: "9EFF00")).padding(3).background(Color(hex: "9EFF00").opacity(0.13)).cornerRadius(6) }
                    Spacer(minLength: 5)
                    Text(messageTime(item["createdAt"].string)).font(.system(size: 8)).foregroundColor(HookTheme.muted)
                    if !item["editedAt"].string.isEmpty { Text("editada").font(.system(size: 8)).foregroundColor(HookTheme.muted) }
                }
                if item["replyTo"].exists { Button { jump(item["replyTo"]["id"].int) } label: { Text("↩︎ \(item["replyTo"]["name"].string): \(item["replyTo"]["text"].string)").font(.caption).foregroundColor(HookTheme.muted).padding(6).frame(maxWidth: .infinity, alignment: .leading).background(Color.black.opacity(0.2)).cornerRadius(6) }.buttonStyle(.plain) }
                if !item["text"].string.isEmpty { Text(item["text"].string).font(.system(size: 14)).textSelection(.enabled) }
                if let url = URL(string: item["imageUrl"].string), !item["imageUrl"].string.isEmpty { Button { openedImage = item["imageUrl"].string } label: { AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { ProgressView() }.frame(maxHeight: 280) }.buttonStyle(.plain) }
                if let url = URL(string: item["audioUrl"].string), !item["audioUrl"].string.isEmpty { NativeChatAudioPlayer(url: url) }
                if let url = URL(string: item["videoUrl"].string), !item["videoUrl"].string.isEmpty { NativeMediaPlayer(url: url).frame(height: 220) }
            }.padding(9).frame(maxWidth: 520, alignment: .leading)
                .background(item["isAdmin"].bool ? Color.white.opacity(0.065) : Color(hex: "CF37FF").opacity(0.13)).cornerRadius(13)
                .overlay(RoundedRectangle(cornerRadius: 13).strokeBorder((item["isAdmin"].bool ? Color(hex: "9EFF00") : Color(hex: "CF37FF")).opacity(0.24)))
            if !item["isAdmin"].bool { avatarView(item) } else { Spacer(minLength: 30) }
        }
            .contextMenu {
                Button("Responder") { model.reply = item }
                if model.mayEdit(item) {
                    if item["audioUrl"].string.isEmpty {
                        Button("Editar") { editing = item; editText = item["text"].string; showEdit = true }
                    }
                    Button("Apagar", role: .destructive) { deleteID = item["id"].int }
                }
                if model.admin && item["customerId"] == model.state["user"]["id"] && !item["text"].string.isEmpty && item["audioUrl"].string.isEmpty {
                    Button("Fixar / desafixar") { model.action("pin", ["messageId": model.state["chat"]["pinnedMessageId"] == item["id"] ? 0 : item["id"]]) }
                }
            }
    }
    private var composer: some View {
        VStack(spacing: 6) {
            if model.reply.exists { HStack { Text("Respondendo a \(model.reply["name"].string)").font(.caption); Spacer(); Button("Cancelar") { model.reply = .null } }.padding(.horizontal) }
            if model.mediaKind == "image", let data = Data(base64Encoded: model.media["base64"].string), let preview = UIImage(data: data) {
                Image(uiImage: preview).resizable().scaledToFit().frame(maxHeight: 110)
            }
            if model.media.exists { HStack { Text(model.mediaKind == "image" ? "Imagem anexada" : "Áudio anexado"); Button("Remover") { model.media = .null } }.font(.caption) }
            if model.recording {
                HStack {
                    Circle().fill(Color.red).frame(width: 8, height: 8)
                    TimelineView(.periodic(from: .now, by: 0.25)) { context in Text(timeText(min(60, context.date.timeIntervalSince(model.recordingStarted ?? context.date)))).monospacedDigit() }
                    Text("Gravando · máximo 1 min").font(.caption)
                    Spacer()
                    Button("Cancelar") { model.cancelRecording() }
                    Button("Enviar") { model.finishRecording(); Task { await model.send() } }
                }.padding(10)
            }
            HStack(spacing: 8) {
                HookButton(title: "", icon: "paperclip", filled: false) { avatar = false; picker = true }.accessibilityLabel("Anexar imagem").disabled(!model.canSend || model.recording)
                TextField(model.canSend ? "Mensagem" : "Limite diário atingido", text: $model.text).modifier(HookField()).disabled(!model.canSend || model.recording).onChange(of: model.text) { model.text = String($0.prefix(1000)) }
                HookButton(title: "", icon: model.recording ? "stop.fill" : "mic.fill", color: model.recording ? .red : HookTheme.gold, filled: false) {
                    if model.recording { model.finishRecording() } else { Task { await model.startRecording() } }
                }.accessibilityLabel(model.recording ? "Finalizar gravação" : "Gravar áudio").disabled(!model.canSend)
                HookButton(title: "", icon: "paperplane.fill") { Task { await model.send() } }.disabled(!model.canSend || model.recording).accessibilityLabel("Enviar mensagem")
            }.padding(.horizontal, 10)
            HStack { Text(model.status).lineLimit(2); Spacer(); Text(model.quota) }.font(.system(size: 10)).foregroundColor(HookTheme.muted).padding(.horizontal, 12).padding(.bottom, 8)
        }.background(Color(hex: "0C0C14"))
    }
}

struct ChatAdminView: View {
    @ObservedObject var model: ChatModel
    @Environment(\.dismiss) private var dismiss
    @State private var open = true
    @State private var unlimited = false
    @State private var limit = 10
    @State private var days = 30
    @State private var confirmClear = false
    var body: some View {
        HookScreen(title: "Administrar chat", back: { dismiss() }) {
            Form {
                HookButton(title: "Sair da conta", color: .red, filled: false) { Task { await model.logout(); dismiss() } }
                Toggle("Chat aberto", isOn: $open)
                Toggle("Mensagens ilimitadas", isOn: $unlimited)
                Stepper("Limite diário: \(limit)", value: $limit, in: 1...10000).disabled(unlimited)
                Stepper("Manter por \(days) dias", value: $days, in: 1...30)
                HookButton(title: "Salvar", expand: true) { model.action("admin/settings", ["open": .bool(open), "dailyMessageUnlimited": .bool(unlimited), "dailyMessageLimit": .number(Double(limit)), "retentionDays": .number(Double(days))]); dismiss() }
                HookButton(title: "Apagar todas as mensagens", color: .red, filled: false) { confirmClear = true }
            }
        }.onAppear { open = model.state["chat"]["open"] != false; unlimited = model.state["chat"]["dailyMessageUnlimited"].bool; limit = max(1, model.state["chat"]["dailyMessageLimit"].int); days = max(1, model.state["chat"]["retentionDays"].int) }
            .alert("Apagar todas as mensagens e mídias do Chat Hook?", isPresented: $confirmClear) { Button("Cancelar", role: .cancel) {}; Button("Apagar", role: .destructive) { model.action("admin/clear") } }
    }
}
struct NativeMediaPlayer: View {
    let url: URL
    @State private var player: AVPlayer?
    var body: some View {
        VideoPlayer(player: player).onAppear { player = AVPlayer(url: url) }.onDisappear { player?.pause(); player = nil }
    }
}

private struct NativeChatAudioPlayer: View {
    let url: URL
    @State private var player: AVPlayer?
    @State private var observer: Any?
    @State private var position = 0.0
    @State private var duration = 0.0
    @State private var playing = false
    private let playNotice = Notification.Name("VSHookChatVoicePlayback")
    var body: some View {
        HStack(spacing: 8) {
            Button {
                guard let player else { return }
                if playing { player.pause(); playing = false }
                else {
                    try? AVAudioSession.sharedInstance().setCategory(.playback)
                    try? AVAudioSession.sharedInstance().setActive(true)
                    NotificationCenter.default.post(name: playNotice, object: player)
                    if position >= duration && duration > 0 { player.seek(to: .zero) }
                    player.play(); playing = true
                }
            } label: { Image(systemName: playing ? "pause.fill" : "play.fill").font(.system(size: 12, weight: .heavy)).foregroundColor(Color(hex: "111116")).frame(width: 32, height: 32).background(HookTheme.goldGradient).clipShape(Circle()) }.buttonStyle(.plain).accessibilityLabel(playing ? "Pausar áudio" : "Reproduzir áudio")
            VStack(alignment: .leading, spacing: 3) {
                Text("Mensagem de voz").font(.system(size: 10, weight: .bold))
                Slider(value: Binding(get: { position }, set: { position = $0; player?.seek(to: CMTime(seconds: $0, preferredTimescale: 600)) }), in: 0...max(0.01, duration)).tint(HookTheme.gold).frame(height: 14).accessibilityLabel("Posição do áudio")
                HStack { Text(timeText(position)); Spacer(); Text(timeText(duration)) }.font(.system(size: 8)).monospacedDigit().foregroundColor(HookTheme.muted)
            }
        }.padding(8).background(Color(hex: "1B1B24")).cornerRadius(12).overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(HookTheme.gold.opacity(0.26)))
            .onAppear {
                let audio = AVPlayer(url: url); player = audio
                observer = audio.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.1, preferredTimescale: 600), queue: .main) { time in
                    position = time.seconds.isFinite ? max(0, time.seconds) : 0
                    let length = audio.currentItem?.duration.seconds ?? 0
                    duration = length.isFinite ? max(0, length) : 0
                    playing = audio.rate > 0
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: playNotice)) { event in
                if let other = event.object as? AVPlayer, other !== player { player?.pause(); playing = false }
            }
            .onDisappear { player?.pause(); if let observer { player?.removeTimeObserver(observer) }; observer = nil; player = nil }
    }
}
