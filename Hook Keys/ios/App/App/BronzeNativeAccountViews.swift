import SwiftUI

struct BronzeNativeAccountView: View {
    @ObservedObject var account: BronzeNativeAccount
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var confirmation = ""
    @State private var code = ""
    @State private var deviceName = "Meu iPad"
    @State private var profileName = ""
    @State private var removalID: String?
    @State private var confirmRemoval = false
    @State private var confirmLogout = false
    var body: some View {
        NavigationView {
            Form {
                if let session = account.session {
                    Section("Minha conta") {
                        Text(session.account.email)
                        TextField("Nome", text: $profileName)
                        Button("Salvar nome") { Task { await account.saveName(profileName) } }
                    }
                    Section("Trocar senha") {
                        SecureField("Nova senha", text: $password).textContentType(.newPassword)
                        SecureField("Confirmar senha", text: $confirmation).textContentType(.newPassword)
                        Button("Alterar senha") { Task { await account.changePassword(password, confirmation: confirmation); password = ""; confirmation = "" } }
                    }
                    Section("Dispositivos") {
                        Button("Atualizar dispositivos") { Task { await account.listDevices() } }
                        ForEach(account.devices) { device in
                            HStack {
                                Text(device.name + (device.current ? " · Este dispositivo" : ""))
                                Spacer()
                                Button("Remover", role: .destructive) { removalID = device.id; password = ""; confirmRemoval = true }
                            }
                        }
                    }
                    Button("Sair da conta", role: .destructive) { confirmLogout = true }
                } else {
                    Section("Acesso Bronze Keys") {
                        switch account.step {
                        case .password:
                            TextField("E-mail da compra", text: $email).textContentType(.username)
                                .textInputAutocapitalization(.never).disableAutocorrection(true).keyboardType(.emailAddress)
                            SecureField("Senha", text: $password).textContentType(.password)
                            Button("Entrar") { Task { await account.login(email: email, password: password); password = "" } }
                            Button("Esqueci minha senha") { Task { await account.forgotPassword(email: email) } }
                            Button("Primeiro acesso / código por e-mail") { Task { await account.startEmailVerification(email: email) } }
                            Text("Use o e-mail e a senha recebidos na compra.").font(.caption)
                        case .code:
                            TextField("Código recebido por e-mail", text: $code).textContentType(.oneTimeCode).keyboardType(.numberPad)
                            Button("Confirmar código") { Task { await account.submitCode(code); code = "" } }
                        case .setup:
                            SecureField("Nova senha", text: $password).textContentType(.newPassword)
                            SecureField("Confirmar senha", text: $confirmation)
                            Button("Definir senha") {
                                if password == confirmation { Task { await account.setupPassword(password); password = ""; confirmation = "" } }
                                else { account.message = "As senhas não coincidem." }
                            }
                        case .deviceName:
                            TextField("Nome deste dispositivo", text: $deviceName)
                            Button("Registrar dispositivo") { Task { await account.registerDevice(name: deviceName) } }
                        case .replacement:
                            Text("O limite de dispositivos foi atingido. Escolha qual dispositivo substituir.")
                            TextField("Nome deste dispositivo", text: $deviceName)
                            SecureField("Sua senha", text: $password)
                            ForEach(account.devices) { device in
                                Button("Substituir \(device.name)") {
                                    removalID = device.id; confirmRemoval = true
                                }
                            }
                        }
                    }
                }
                if account.busy { ProgressView("Aguarde…") }
                if !account.message.isEmpty { Text(account.message).font(.callout).foregroundStyle(.orange) }
            }
            .disabled(account.busy)
            .navigationTitle("Bronze Keys")
            .toolbar { if account.authorized { Button("Concluir") { dismiss() } } }
        }
        .navigationViewStyle(.stack)
        .onAppear { profileName = account.session?.account.name ?? "" }
        .onChange(of: account.authorized) { if !$0 { dismiss() } }
        .sheet(isPresented: $confirmRemoval) {
            NavigationView {
                Form {
                    Text(account.authorized ? "Confirme a remoção com sua senha." : "Confirmar substituição deste dispositivo?")
                    SecureField("Senha", text: $password)
                    Button("Confirmar", role: .destructive) {
                        guard let removalID else { return }
                        Task {
                            if account.authorized { await account.removeDevice(removalID, password: password) }
                            else { await account.replaceDevice(id: removalID, name: deviceName, password: password) }
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
    private var sounds: [BronzeCatalogSound] { account.categories.first(where: { $0.id == categoryID })?.sounds ?? [] }
    var body: some View {
        VStack(spacing: 5) {
            Text("\(sounds.count) timbres nesta categoria").font(.caption)
            if account.downloading != nil { ProgressView("Baixando SF2…") }
            List(sounds) { sound in
                HStack {
                    Button {
                        if let font = model.catalogFont(sound.id) { model.selectUserSoundFont(font, moduleIndex: moduleIndex) }
                        else {
                            Task {
                                do { let url = try await account.download(sound); model.importSoundFont(url, moduleIndex: moduleIndex, catalogID: sound.id) }
                                catch { model.controlError = "Falha ao baixar: \(error.localizedDescription)" }
                            }
                        }
                    } label: {
                        HStack {
                            Text(sound.name)
                            Spacer()
                            Image(systemName: model.catalogFont(sound.id) == nil ? "arrow.down.circle" : "checkmark.circle")
                        }.padding(5)
                            .overlay { if model.downloadedSoundID == sound.id { BronzePresetHighlight() } }
                    }
                }.disabled(account.downloading != nil || model.loadingSoundFontModule != nil)
            }
            Text("Os timbres baixados ficam disponíveis offline. A seleção mantém os parâmetros atuais do módulo.")
                .font(.caption2).foregroundStyle(.secondary)
        }
    }
}
