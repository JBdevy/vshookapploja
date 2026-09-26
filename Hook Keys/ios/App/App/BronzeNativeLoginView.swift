import SwiftUI

/// Native access screen. No animation loop or audio initialization while signing in.
struct BronzeNativeLoginView: View {
    @ObservedObject var account: BronzeNativeAccount
    @Environment(\.dynamicTypeSize) private var textSize
    @State private var email = ""
    @State private var password = ""
    @State private var confirmation = ""
    @State private var code = ""
    #if targetEnvironment(macCatalyst)
    @State private var deviceName = "Meu Mac"
    #else
    @State private var deviceName = "Meu iPad"
    #endif
    @State private var showPassword = false
    @State private var replacement: BronzeAccountDevice?
    @FocusState private var focus: Field?
    private enum Field: Hashable { case email, password, confirmation, code, device }
    // Match the access screen palette from the original app.
    private let gold = Color(red: 205 / 255, green: 127 / 255, blue: 50 / 255)
    private let goldBright = Color(red: 232 / 255, green: 173 / 255, blue: 112 / 255)
    private let paper = Color(red: 1, green: 249 / 255, blue: 244 / 255)
    private let muted = Color(red: 184 / 255, green: 170 / 255, blue: 160 / 255)

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 22) {
                    if focus == nil { compactBrand }
                    accessPanel
                }
                .frame(maxWidth: 520)
                .padding(.horizontal, 18)
                .padding(.vertical, geometry.size.height < 700 ? 16 : 32)
                .frame(maxWidth: .infinity, minHeight: geometry.size.height)
            }
            .background(backdrop)
        }
        .foregroundStyle(paper)
        .tint(goldBright)
        .preferredColorScheme(.dark)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Concluir") { focus = nil }
            }
        }
        .onChange(of: account.step) { _ in clearSecrets(); code = ""; focus = nil; replacement = nil }
        .onReceive(NotificationCenter.default.publisher(for: .bronzeLoginFocusTraversal)) { notification in
            guard !account.busy, replacement == nil else { return }
            moveFocus(backwards: notification.userInfo?["backwards"] as? Bool ?? false)
        }
        .onDisappear { clearSecrets(); code = "" }
        .confirmationDialog("Substituir este dispositivo?", isPresented: Binding(
            get: { replacement != nil }, set: { if !$0 { replacement = nil } }
        ), titleVisibility: .visible) {
            if let device = replacement {
                Button("Substituir \(device.name)", role: .destructive) {
                    replacement = nil
                    Task { await account.replaceDevice(id: device.id, name: deviceName, password: password); clearSecrets() }
                }
            }
            Button("Cancelar", role: .cancel) { replacement = nil }
        } message: {
            Text("O dispositivo escolhido perderá o acesso para liberar uma vaga para este dispositivo.")
        }
    }

    private var backdrop: some View { BronzeScreenBackground() }

    private func moveFocus(backwards: Bool) {
        let order: [Field]
        switch account.step {
        case .password: order = [.email, .password]
        case .code: order = [.code]
        case .setup: order = [.password, .confirmation]
        case .deviceName: order = [.device]
        case .replacement: order = [.device, .password]
        }
        guard let current = focus, let index = order.firstIndex(of: current) else {
            focus = backwards ? order.last : order.first
            return
        }
        focus = order[(index + (backwards ? -1 : 1) + order.count) % order.count]
    }

    private func wordmark(size: CGFloat) -> some View {
        (Text("Bronze").foregroundColor(gold) + Text(" Keys").foregroundColor(paper))
            .font(.system(size: size, weight: .heavy, design: .monospaced))
            .tracking(-size * 0.065)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .accessibilityAddTraits(.isHeader)
    }

    private var compactBrand: some View {
        VStack(spacing: 10) {
            logo(size: 78)
            Text("ReiVs apresenta").font(.caption.monospaced().weight(.heavy)).foregroundStyle(goldBright)
            wordmark(size: 52)
            Text("Seu instrumento. Em qualquer palco.")
                .font(.system(.subheadline, design: .monospaced).weight(.heavy))
                .foregroundStyle(muted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: 520)
        .accessibilityElement(children: .combine)
    }

    private func logo(size: CGFloat) -> some View {
        Image("BronzeBrand").resizable().scaledToFit().frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.21))
            .shadow(color: gold.opacity(0.3), radius: 22)
            .accessibilityHidden(true)
    }

    private var accessPanel: some View {
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 22) {
                HStack(spacing: 9) {
                    Circle().fill(gold).frame(width: 7, height: 7)
                        .shadow(color: gold.opacity(0.6), radius: 7).accessibilityHidden(true)
                    Text("BRONZE KEYS")
                        .font(.caption2.monospaced().weight(.heavy)).tracking(1.5).foregroundStyle(muted)
                }.padding(.bottom, 8)
                VStack(alignment: .leading, spacing: 8) {
                    if account.step == .password {
                        Text("BEM-VINDO DE VOLTA")
                            .font(.caption.monospaced().weight(.heavy)).tracking(1.2).foregroundStyle(goldBright)
                    }
                    Text(title).font(.system(.title, design: .monospaced).weight(.heavy)).accessibilityAddTraits(.isHeader)
                    Text(subtitle).font(.system(.subheadline, design: .monospaced).weight(.heavy))
                        .foregroundStyle(muted).lineSpacing(4).fixedSize(horizontal: false, vertical: true)
                }
                fields.disabled(account.busy)
                if focus != nil {
                    Button("Ocultar teclado") { focus = nil }
                        .font(.caption).foregroundStyle(goldBright).frame(minHeight: 44)
                }
                if !account.message.isEmpty {
                    Label(account.message, systemImage: "info.circle")
                        .font(.footnote).foregroundStyle(goldBright)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                        .background(gold.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .accessibilityLabel("Mensagem: \(account.message)")
                }
                if account.busy { ProgressView("Aguarde…").frame(maxWidth: .infinity).font(.footnote) }
                if account.step != .password {
                    Button { account.resetLoginFlow(); clearSecrets(); code = "" } label: {
                        Label("Voltar ao login", systemImage: "arrow.left").font(.subheadline)
                            .frame(minHeight: 44)
                    }.buttonStyle(.plain).foregroundStyle(goldBright).disabled(account.busy)
                }
            }
            .padding(textSize.isAccessibilitySize ? 22 : 28)
            .background(BronzeTheme.panelGradient)
            .clipShape(RoundedRectangle(cornerRadius: 28))
            .shadow(color: .black.opacity(0.5), radius: 32, y: 20)
            Label("Acesso protegido pela sua senha", systemImage: "lock")
                .font(.system(.caption2, design: .monospaced).weight(.heavy)).foregroundStyle(muted)
        }
    }

    private var title: String {
        switch account.step {
        case .password: return "Acessar Bronze Keys"
        case .code: return "Confira seu e-mail"
        case .setup: return "Crie sua senha"
        case .deviceName: return "Seu dispositivo"
        case .replacement: return "Gerenciar acesso"
        }
    }
    private var subtitle: String {
        switch account.step {
        case .password: return "Entre com o e-mail e a senha recebidos na compra."
        case .code: return "Digite o código enviado para \(email)."
        case .setup: return "Escolha uma senha de 8 a 128 caracteres para proteger sua conta."
        case .deviceName: return "Dê um nome para reconhecer este iPad na sua conta."
        case .replacement: return "Seu limite de dispositivos foi atingido. Escolha qual substituir."
        }
    }

    @ViewBuilder private var fields: some View {
        VStack(alignment: .leading, spacing: 16) {
            switch account.step {
            case .password:
                field("E-mail da compra", icon: "envelope", active: .email) {
                    TextField("seuemail@exemplo.com", text: $email)
                        .textContentType(.username).keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never).disableAutocorrection(true)
                        .focused($focus, equals: .email).submitLabel(.next).onSubmit { focus = .password }
                }
                passwordField("Senha", text: $password, active: .password)
                primary("Entrar", action: submit)
                Button("Esqueci minha senha") {
                    guard validEmail() else { return }; focus = nil
                    Task { await account.forgotPassword(email: email) }
                }.font(.subheadline).frame(minHeight: 44).buttonStyle(.plain).foregroundStyle(goldBright)
                Divider().overlay(gold.opacity(0.2))
                Button("Primeiro acesso / código por e-mail") {
                    guard validEmail() else { return }; focus = nil
                    Task { await account.startEmailVerification(email: email) }
                }.font(.footnote).frame(maxWidth: .infinity, minHeight: 44).buttonStyle(.plain)
            case .code:
                field("Código recebido", icon: "key", active: .code) {
                    TextField("Código do e-mail", text: $code).textContentType(.oneTimeCode)
                        .keyboardType(.numberPad).focused($focus, equals: .code).submitLabel(.go).onSubmit(submit)
                }
                primary("Confirmar código", action: submit)
            case .setup:
                passwordField("Nova senha", text: $password, active: .password)
                passwordField("Confirmar senha", text: $confirmation, active: .confirmation)
                primary("Definir senha", action: submit)
            case .deviceName:
                deviceField
                primary("Registrar dispositivo", action: submit)
            case .replacement:
                deviceField
                passwordField("Sua senha", text: $password, active: .password)
                ForEach(account.devices) { device in
                    Button {
                        guard validDevice(), !password.isEmpty else {
                            account.message = "Informe o nome deste dispositivo e sua senha."; return
                        }
                        focus = nil; replacement = device
                    } label: {
                        HStack {
                            Image(systemName: "ipad")
                            Text(device.name).multilineTextAlignment(.leading)
                            Spacer()
                            Text("Substituir").font(.caption.bold())
                        }.padding(12).frame(minHeight: 44)
                            .background(gold.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 10))
                    }.buttonStyle(.plain).foregroundStyle(goldBright)
                }
            }
        }
    }

    private var deviceField: some View {
        field("Nome do dispositivo", icon: "ipad", active: .device) {
            TextField("Meu iPad", text: $deviceName).focused($focus, equals: .device)
                .submitLabel(account.step == .replacement ? .next : .go)
                .onSubmit { if account.step == .replacement { focus = .password } else { submit() } }
        }
    }

    private func passwordField(_ title: String, text: Binding<String>, active: Field) -> some View {
        field(title, icon: "lock", active: active) {
            Group {
                if showPassword { TextField(title, text: text) }
                else { SecureField(title, text: text) }
            }
            .textContentType(account.step == .setup ? .newPassword : .password)
            .textInputAutocapitalization(.never).disableAutocorrection(true)
            .focused($focus, equals: active)
            .submitLabel(account.step == .setup && active == .password ? .next : .go)
            .onSubmit { if account.step == .setup && active == .password { focus = .confirmation } else { submit() } }
            Button { showPassword.toggle(); focus = active } label: {
                Image(systemName: showPassword ? "eye.slash" : "eye").frame(width: 44, height: 44)
            }.buttonStyle(.plain).foregroundStyle(goldBright)
                .accessibilityLabel(showPassword ? "Ocultar senha" : "Mostrar senha")
        }
    }

    private func field<Content: View>(_ title: String, icon: String, active: Field, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(.caption, design: .monospaced).weight(.heavy)).foregroundStyle(paper)
            HStack(spacing: 10) {
                Image(systemName: icon).foregroundStyle(goldBright).accessibilityHidden(true)
                content()
            }
            .textFieldStyle(.plain).font(.system(.body, design: .monospaced).weight(.heavy))
            .padding(.horizontal, 14).frame(minHeight: 54)
            .background(Color.black.opacity(0.43)).clipShape(RoundedRectangle(cornerRadius: 15))
            .overlay(RoundedRectangle(cornerRadius: 15).stroke(focus == active ? Color.purple : Color.white.opacity(0.1), lineWidth: 1))
        }
    }

    private func primary(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.system(.headline, design: .monospaced).weight(.heavy))
                .foregroundStyle(Color(red: 26 / 255, green: 9 / 255, blue: 1 / 255))
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(LinearGradient(colors: [goldBright, Color(red: 111 / 255, green: 53 / 255, blue: 24 / 255)],
                                           startPoint: .top, endPoint: .bottom))
                .clipShape(RoundedRectangle(cornerRadius: 15))
                .shadow(color: gold.opacity(0.23), radius: 16, y: 6)
        }.buttonStyle(.plain).opacity(account.busy ? 0.5 : 1)
    }

    private func validEmail() -> Bool {
        email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = email.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty, parts[1].contains("."),
              !email.contains(where: { $0.isWhitespace }) else {
            account.message = "Informe um e-mail válido, igual ao utilizado na compra."; focus = .email; return false
        }
        return true
    }
    private func validDevice() -> Bool {
        deviceName = deviceName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !deviceName.isEmpty else { account.message = "Informe um nome para este dispositivo."; focus = .device; return false }
        return true
    }
    private func clearSecrets() { password = ""; confirmation = ""; showPassword = false }
    private func submit() {
        guard !account.busy else { return }
        switch account.step {
        case .password:
            guard validEmail() else { return }
            guard !password.isEmpty else { account.message = "Informe sua senha."; focus = .password; return }
            focus = nil
            Task { await account.login(email: email, password: password) }
        case .code:
            let value = code.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { account.message = "Digite o código recebido por e-mail."; focus = .code; return }
            focus = nil
            Task { await account.submitCode(value) }
        case .setup:
            guard (8...128).contains(password.count) else { account.message = "Use uma senha de 8 a 128 caracteres."; focus = .password; return }
            guard password == confirmation else { account.message = "As senhas não coincidem."; focus = .confirmation; return }
            focus = nil
            Task { await account.setupPassword(password) }
        case .deviceName:
            guard validDevice() else { return }; focus = nil
            Task { await account.registerDevice(name: deviceName) }
        case .replacement: focus = nil
        }
    }
}

#if DEBUG
struct BronzeNativeLoginView_Previews: PreviewProvider {
    static var previews: some View {
        BronzeNativeLoginView(account: BronzeNativeAccount())
            .previewInterfaceOrientation(.portrait)
            .previewDisplayName("Login · Retrato")
    }
}
#endif
