import SwiftUI

@MainActor final class RecadosModel: ObservableObject {
    let base: URL
    let directorIdentity: JSON?
    @Published var templates = ["", "", ""]
    @Published var images = ["", "", ""]
    @Published var draft = ""
    @Published var slot = -1
    @Published var pinned = false
    @Published var editing = false
    @Published var loaded = false
    @Published var noticeID = ""
    @Published var pausedRemaining: TimeInterval = 0
    @Published var password = ""
    @Published var hash = ""
    @Published var authenticated = false
    @Published var connected = false
    @Published var status = ""
    @Published var busy = false
    @Published var deadline: Date?
    private var globalDraft = ""
    init(base: URL, identity: JSON?) { self.base = base; directorIdentity = identity }
    var identity: JSON { directorIdentity ?? ["source": "recados", "passwordHash": .string(bridgePasswordHash(password))] }
    var image: String { slot >= 0 ? images[slot] : "" }
    func select(_ index: Int) {
        if slot == -1 { globalDraft = draft }
        guard (-1..<3).contains(index) else { return }
        slot = index; editing = false; status = ""; draft = index == -1 ? globalDraft : templates[index]
    }
    func poll() async {
        while !Task.isCancelled {
            do {
                let state = try await BridgeHTTP.shared.request(base, "/state", timeout: 3)
                guard !Task.isCancelled else { return }
                loaded = true; connected = state["connected"] != false
                let nextHash = state.first("recadosAuthHash", "recadosPasswordHash", "technicalNoticeAuthHash", "technicalNoticePasswordHash", "noticeAuthHash", "noticePasswordHash").string.uppercased()
                if hash != nextHash { hash = nextHash; authenticated = false }
                authenticated = directorIdentity != nil || hash.isEmpty || bridgePasswordHash(password) == hash
                if authenticated && connected {
                    if !editing, let result = try? await BridgeHTTP.shared.request(base, "/recados-templates", timeout: 3) { apply(result) }
                    if let result = try? await BridgeHTTP.shared.request(base, "/technical-notice", timeout: 3) { syncNotice(result) }
                }
            } catch { if !Task.isCancelled { loaded = true; connected = false; status = "Não foi possível conectar ao VS Hook. Verifique a rede." } }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        }
    }
    func login() { authenticated = hash.isEmpty || bridgePasswordHash(password) == hash; status = authenticated ? "" : "Senha inválida." }
    func apply(_ data: JSON) {
        for i in 0..<3 {
            if data["templates"].array.indices.contains(i) { templates[i] = data["templates"].array[i].string }
            if data["images"].array.indices.contains(i) { images[i] = data["images"].array[i].string }
        }
        if slot >= 0 && !editing { draft = templates[slot] }
    }
    var remaining: TimeInterval { pinned ? pausedRemaining : max(0, deadline?.timeIntervalSinceNow ?? 0) }
    func beginClock(pinned next: Bool, duration: TimeInterval) {
        pinned = next; pausedRemaining = next ? duration : 0
        deadline = next ? nil : Date().addingTimeInterval(duration)
    }
    func clearClock() { noticeID = ""; deadline = nil; pausedRemaining = 0; pinned = false }
    func syncNotice(_ data: JSON) {
        let notice = data["notice"]
        guard !notice["id"].string.isEmpty, notice["source"].string == (directorIdentity == nil ? "recados" : "director") else { return }
        if noticeID != notice["id"].string {
            noticeID = notice["id"].string
            let seconds = notice["pinned"].bool && notice["pausedRemainingMs"].double > 0 ? notice["pausedRemainingMs"].double / 1000 : notice["expiresAt"].double > 0 && data["now"].double > 0 ? (notice["expiresAt"].double - data["now"].double) / 1000 : (notice["durationMs"].exists ? notice["durationMs"].double / 1000 : 20)
            beginClock(pinned: notice["pinned"].bool, duration: min(20, max(0, seconds)))
        } else if notice["pinned"].bool != pinned { beginClock(pinned: notice["pinned"].bool, duration: remaining) }
    }
    func togglePin() {
        if noticeID.isEmpty { pinned.toggle() }
        else { send(action: pinned ? "unpin" : "pin") }
    }
    func exit(_ close: @escaping () -> Void) {
        guard !busy else { return }
        busy = true
        Task {
            if authenticated && connected { _ = try? await BridgeHTTP.shared.request(base, "/technical-notice", body: identity.merging(["action": "cancel"])) }
            busy = false; close()
        }
    }
    func send(action: String? = nil) {
        guard !busy, authenticated, connected else { return }
        guard action != nil || !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !image.isEmpty else { status = "Digite um recado ou escolha uma imagem."; return }
        busy = true
        let preservedRemaining = remaining
        Task {
            defer { busy = false }
            do {
                let payload: JSON = action.map { ["action": .string($0)] } ?? ["text": .string(image.isEmpty ? String(draft.prefix(500)) : ""), "imagePath": .string(image), "pinned": .bool(pinned), "durationMs": 20000]
                let result = try await BridgeHTTP.shared.request(base, "/technical-notice", body: identity.merging(payload))
                if result["ignoredDuePriority"].bool { if action == nil { clearClock() }; status = "DIRETOR EM PRIORIDADE"; return }
                if action == "cancel" { clearClock(); status = "RECADO REMOVIDO" }
                else {
                    noticeID = result["notice"]["id"].string
                    beginClock(pinned: result["notice"]["pinned"].bool, duration: action == nil ? 20 : preservedRemaining)
                    status = "RECADO ATIVO"
                }
            } catch { status = error.localizedDescription }
        }
    }
    func save(imageData: Data? = nil, removeImage: Bool = false) {
        guard slot >= 0, !busy, authenticated else { return }
        let index = slot
        busy = true
        Task {
            defer { busy = false }
            do {
                var payload: JSON = ["index": .number(Double(index))]
                if let imageData { payload = payload.merging(["updateImage": true, "imageDataUrl": .string("data:image/jpeg;base64," + imageData.base64EncodedString())]) }
                else if removeImage { payload = payload.merging(["updateImage": true, "imageDataUrl": ""]) }
                else { payload = payload.merging(["updateText": true, "text": .string(String(draft.prefix(500)))]) }
                let result = try await BridgeHTTP.shared.request(base, "/recados-templates", body: identity.merging(payload))
                apply(result); if imageData == nil && !removeImage { editing = false }; status = "RECADO SALVO"
            } catch { status = error.localizedDescription }
        }
    }
}

struct RecadosView: View {
    @StateObject private var model: RecadosModel
    let back: () -> Void
    @State private var selectImage = false
    init(base: URL, identity: JSON?, back: @escaping () -> Void) { _model = StateObject(wrappedValue: RecadosModel(base: base, identity: identity)); self.back = back }
    var body: some View {
        GeometryReader { geometry in
            if model.connected && model.authenticated {
                editor(compact: geometry.size.width < 480)
            } else {
                VStack(spacing: 14) {
                    Image("HookLogo").resizable().scaledToFit().frame(width: 78, height: 78)
                    Text("Recados").font(.system(size: 24, weight: .bold)).foregroundColor(Color(hex: "FACC15"))
                    Text(!model.loaded ? "Conectando ao Hook Center…" : !model.connected ? "Conecte-se ao VS Hook/Hook Center na mesma rede para utilizar este recurso." : "Digite a senha do app Recados.").multilineTextAlignment(.center)
                    if model.connected {
                        SecureField("SENHA", text: $model.password).multilineTextAlignment(.center).modifier(HookField()).onSubmit { model.login() }
                        control("ENTRAR", color: "FACC15", dark: true, height: 54) { model.login() }
                    }
                    HookStatus(text: model.status)
                    control("VOLTAR", color: "CBD5E1", dark: true, height: 54, action: back)
                }.padding(22).frame(maxWidth: 420).background(Color(hex: "0F172A")).cornerRadius(18)
                    .frame(maxWidth: .infinity, maxHeight: .infinity).padding(18)
            }
        }.background(Color(hex: "05070A").ignoresSafeArea()).foregroundColor(.white)
            .task { await model.poll() }
            .sheet(isPresented: $selectImage) {
                PhotoPicker { urls in
                    if let url = urls.first, let data = try? Data(contentsOf: url), let image = UIImage(data: data) {
                        let scale = min(1, 1920 / max(image.size.width, image.size.height))
                        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
                        let format = UIGraphicsImageRendererFormat(); format.scale = 1
                        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
                        if let jpeg = resized.jpegData(compressionQuality: 0.8) { model.save(imageData: jpeg) }
                    }
                }
            }
    }
    private func editor(compact: Bool) -> some View {
        VStack(spacing: compact ? 8 : 10) {
            HStack(spacing: 10) {
                control(model.busy ? "ENVIANDO…" : "ENVIAR", color: "FACC15", dark: true, height: compact ? 52 : 56) { model.send() }.accessibilityIdentifier("vshook.recados.send")
                control("RETIRAR", color: "CBD5E1", dark: true, height: compact ? 52 : 56) { model.send(action: "cancel") }
            }
            control(model.pinned ? "FIXADO" : "FIXAR", color: model.pinned ? "15803D" : "0F172A", height: compact ? 38 : 42) { model.togglePin() }
            VStack(spacing: 5) {
                HStack(spacing: 5) { ForEach(0..<3) { index in slotButton(index, "RECADO \(index + 1)" + (model.images[index].isEmpty ? "" : " · IMG"), compact: compact) } }
                slotButton(-1, "GLOBAL", compact: compact)
            }
            NativeNoticeEditor(text: $model.draft, placeholder: model.slot < 0 ? "Digite o recado técnico…" : "Conteúdo do Recado \(model.slot + 1)", editable: model.slot < 0 || model.editing, fontSize: compact ? 18 : 20)
                .frame(maxWidth: .infinity, maxHeight: .infinity).frame(minHeight: 44)
                .background(Color(hex: model.slot < 0 || model.editing ? "020617" : "0F172A"))
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color(hex: "FACC15").opacity(0.32)))
                .accessibilityIdentifier("vshook.recados.editor")
            if model.slot >= 0 {
                HStack(spacing: 8) {
                    Group {
                        if !model.image.isEmpty, let url = try? BridgeHTTP.shared.url(model.base, "/media", query: ["path": model.image]) {
                            AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { ProgressView() }
                        } else { Text("SEM IMAGEM").font(.system(size: 11, weight: .bold)).foregroundColor(.gray) }
                    }.frame(width: compact ? 74 : 104, height: compact ? 58 : 66).background(Color(hex: "020617")).cornerRadius(10)
                    control(model.image.isEmpty ? "ESCOLHER IMAGEM" : "TROCAR IMAGEM", color: "1D4ED8", height: compact ? 58 : 66) { selectImage = true }
                    if !model.image.isEmpty { control("REMOVER IMAGEM", color: "991B1B", height: compact ? 58 : 66) { model.save(removeImage: true) } }
                }
                control(model.editing ? "SALVAR" : "EDITAR", color: model.editing ? "15803D" : "1D4ED8", height: compact ? 38 : 42) {
                    if model.editing { model.save() } else { model.editing = true }
                }
            }
            TimelineView(.periodic(from: .now, by: 0.25)) { _ in
                Text(model.remaining > 0 ? "RECADO ATIVO: \(Int(ceil(model.remaining)))s" : model.status == "RECADO ATIVO" ? "RECADO EXPIRADO" : model.status)
                    .font(.system(size: 13, weight: .heavy)).foregroundColor(Color(hex: "FACC15")).lineLimit(1).minimumScaleFactor(0.6).frame(height: 28)
            }
            control("SAIR", color: "CBD5E1", dark: true, height: compact ? 52 : 56) { model.exit(back) }
        }.padding(compact ? 8 : 10).disabled(model.busy)
    }
    private func control(_ title: String, color: String, dark: Bool = false, height: CGFloat, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.system(size: 14, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.65)
                .frame(maxWidth: .infinity).frame(height: height).foregroundColor(dark ? Color(hex: "07110A") : .white)
                .background(Color(hex: color)).cornerRadius(6)
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.white.opacity(0.15)))
        }.buttonStyle(.plain)
    }
    private func slotButton(_ index: Int, _ title: String, compact: Bool) -> some View {
        control(title, color: model.slot == index ? "FACC15" : "0F172A", dark: model.slot == index, height: compact ? 38 : 42) { model.select(index) }
    }
}

private struct NativeNoticeEditor: UIViewRepresentable {
    @Binding var text: String
    let placeholder: String
    let editable: Bool
    let fontSize: CGFloat
    func makeUIView(context: Context) -> UITextView {
        let view = NoticeTextView(); view.backgroundColor = .clear; view.textColor = .white
        view.textContainerInset = UIEdgeInsets(top: 13, left: 13, bottom: 13, right: 13)
        view.delegate = context.coordinator; view.autocorrectionType = .no
        return view
    }
    func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.parent = self
        if view.text != text { view.text = text }
        view.isEditable = editable; view.font = .systemFont(ofSize: fontSize)
        if let view = view as? NoticeTextView { view.hint.text = placeholder; view.hint.font = view.font; view.hint.isHidden = !text.isEmpty; view.setNeedsLayout() }
    }
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: NativeNoticeEditor
        init(_ parent: NativeNoticeEditor) { self.parent = parent }
        func textViewDidChange(_ view: UITextView) { (view as? NoticeTextView)?.hint.isHidden = !view.text.isEmpty; parent.text = String(view.text.prefix(500)); if view.text != parent.text { view.text = parent.text } }
    }
}

private final class NoticeTextView: UITextView {
    let hint = UILabel()
    override init(frame: CGRect, textContainer: NSTextContainer?) {
        super.init(frame: frame, textContainer: textContainer)
        hint.textColor = .gray; hint.numberOfLines = 2; hint.isUserInteractionEnabled = false; addSubview(hint)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func layoutSubviews() {
        super.layoutSubviews()
        hint.frame = CGRect(x: textContainerInset.left + 5, y: textContainerInset.top, width: max(0, bounds.width - textContainerInset.left - textContainerInset.right - 10), height: 50)
        hint.sizeToFit()
    }
}
