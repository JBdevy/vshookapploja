import Foundation
import Combine
import Security
import CryptoKit

struct BronzeAccountIdentity: Codable, Equatable {
    var email: String
    var name: String?
}
struct BronzeAccountSession: Codable {
    let token: String
    var expiresAt: String?
    var account: BronzeAccountIdentity
}
struct BronzeAccountDevice: Identifiable {
    let id: String
    let name: String
    let current: Bool
}
enum BronzeAPIError: LocalizedError {
    case response(Int, String)
    case invalid
    var errorDescription: String? {
        switch self { case .response(_, let message): return message; case .invalid: return "Resposta inválida do serviço Bronze Keys." }
    }
}

enum BronzeKeychain {
    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.hookdeveloper.hookkeys.native",
         kSecAttrAccount as String: key]
    }
    static func read(_ key: String) throws -> Data? {
        var request = query(key); request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw BronzeAPIError.response(0, "Não foi possível acessar o Keychain (\(status)).") }
        return data
    }
    static func write(_ data: Data, key: String) throws {
        let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query(key) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query(key); attributes.forEach { item[$0.key] = $0.value }
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw BronzeAPIError.response(0, "Não foi possível salvar a sessão com segurança (\(status)).") }
    }
    static func remove(_ key: String) { SecItemDelete(query(key) as CFDictionary) }
    static func deviceKey() throws -> String {
        if let data = try read("device"), let value = String(data: data, encoding: .utf8), UUID(uuidString: value) != nil { return value }
        let value = UUID().uuidString
        try write(Data(value.utf8), key: "device")
        return value
    }
}

@MainActor
final class BronzeNativeAccount: ObservableObject {
    enum Step: Equatable { case password, code, setup, deviceName, replacement }
    @Published private(set) var restoring = true
    @Published private(set) var session: BronzeAccountSession?
    @Published private(set) var step = Step.password
    @Published private(set) var busy = false
    @Published var message = ""
    @Published private(set) var devices: [BronzeAccountDevice] = []
    @Published private(set) var totalLicenses: Int?
    @Published private(set) var usedLicenses: Int?
    @Published private(set) var profilePhoto = ""
    @Published private(set) var profileCreatedAt: String?
    @Published private(set) var categories: [BronzeCatalogCategory] = []
    @Published private(set) var catalogBusy = false
    @Published private(set) var downloading: String?
    private var flowID = ""
    private var monitor: Task<Void, Never>?
    private let network: URLSession
    // Same production backend as src/main.ts; credentials are never in the binary.
    private let base = URL(string: "https://hookupdate7.up.railway.app")!
    var authorized: Bool { session != nil }

    init() {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 25; config.timeoutIntervalForResource = 600
        config.httpShouldSetCookies = false; config.urlCache = nil
        network = URLSession(configuration: config)
    }
    deinit { monitor?.cancel(); network.invalidateAndCancel() }

    private func request(_ path: String, body: [String: Any]? = nil, token: String? = nil, method: String? = nil) async throws -> [String: Any] {
        var request = URLRequest(url: base.appendingPathComponent("api/orangekey/" + path))
        request.httpMethod = method ?? (body == nil ? "GET" : "POST")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body { request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await network.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw BronzeAPIError.invalid }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (200..<300).contains(response.statusCode) else {
            throw BronzeAPIError.response(response.statusCode, json["message"] as? String ?? json["error"] as? String ?? "Não foi possível concluir a solicitação.")
        }
        return json
    }
    private func identity(_ object: Any?) throws -> BronzeAccountIdentity {
        guard let object, JSONSerialization.isValidJSONObject(object) else { throw BronzeAPIError.invalid }
        return try JSONDecoder().decode(BronzeAccountIdentity.self, from: JSONSerialization.data(withJSONObject: object))
    }
    private func store(_ value: BronzeAccountSession) throws {
        try BronzeKeychain.write(JSONEncoder().encode(value), key: "session")
        session = value; restoring = false; message = ""; step = .password; flowID = ""
    }
    func restore() async {
        guard restoring else { return }
        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.environment["BRONZE_UI_TEST"] == "1" {
            session = BronzeAccountSession(token: "", account: BronzeAccountIdentity(email: "preview@example.invalid", name: "Teste"))
            if ProcessInfo.processInfo.environment["BRONZE_LIBRARY_UI_TEST"] == "1" {
                categories = [BronzeCatalogCategory(id: "fixture", name: "Pianos", visibleModule: nil,
                    sounds: (0..<20).map { BronzeCatalogSound(id: "fixture-\($0)", name: "Piano \($0 + 1)", objectKey: "fixture.sf2", version: 1, byteSize: 50_000_000, sha256: nil, previewObjectKey: "fixture-preview", color: 0x35d273) })]
            }
            restoring = false
            return
        }
        #endif
        defer { restoring = false }
        do {
            guard let data = try BronzeKeychain.read("session") else { return }
            var cached = try JSONDecoder().decode(BronzeAccountSession.self, from: data)
            do {
                let response = try await request("auth/me", token: cached.token)
                cached.account = try identity(response["account"])
                cached.expiresAt = response["sessionExpiresAt"] as? String ?? cached.expiresAt
                try store(cached)
            } catch BronzeAPIError.response(let status, _) where status == 401 || status == 403 {
                BronzeKeychain.remove("session"); session = nil
                message = "Entre novamente para validar o acesso deste dispositivo."
                return
            } catch let error as URLError {
                // Cached access is only an offline/network-error fallback, never a 401/403 bypass.
                guard [.notConnectedToInternet, .timedOut, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed].contains(error.code) else { throw error }
                session = cached
            }
            beginMonitoring()
            await loadCatalog()
        } catch { message = error.localizedDescription }
    }

    func login(email: String, password: String) async {
        await perform {
            try await self.accept(self.request("auth/password/login", body: ["email": email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                "password": password, "deviceKey": BronzeKeychain.deviceKey(), "platform": "iOS"]))
        }
    }
    func resetLoginFlow() {
        guard !busy, !authorized else { return }
        step = .password; flowID = ""; devices = []; message = ""
    }
    func startEmailVerification(email: String) async {
        await perform {
            let value = try await self.request("auth/start", body: ["email": email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()])
            if let id = value["challengeId"] as? String { self.flowID = id; self.step = .code; self.message = value["message"] as? String ?? "Digite o código enviado por e-mail." }
            else { self.step = .password; self.message = "Use a senha recebida na compra." }
        }
    }
    func submitCode(_ code: String) async {
        await perform { try await self.accept(self.request("auth/verify-code", body: ["challengeId": self.flowID, "code": code,
            "deviceKey": BronzeKeychain.deviceKey(), "platform": "iOS"])) }
    }
    func setupPassword(_ password: String) async {
        await perform { try await self.accept(self.request("auth/password/setup", body: ["passwordToken": self.flowID, "password": password,
            "deviceKey": BronzeKeychain.deviceKey(), "platform": "iOS"])) }
    }
    func registerDevice(name: String) async {
        await perform { try await self.accept(self.request("auth/device-registration/complete", body: ["registrationId": self.flowID, "deviceName": name])) }
    }
    func replaceDevice(id: String, name: String, password: String) async {
        await perform { try await self.accept(self.request("auth/device-replacement/confirm-password", body: ["replacementId": self.flowID,
            "targetDeviceId": id, "deviceName": name, "password": password])) }
    }
    private func accept(_ value: [String: Any]) async throws {
        if let token = value["sessionToken"] as? String {
            try store(BronzeAccountSession(token: token, expiresAt: value["sessionExpiresAt"] as? String, account: identity(value["account"])))
            beginMonitoring(); await loadCatalog()
        } else if let id = value["registrationId"] as? String { flowID = id; step = .deviceName }
        else if let id = value["replacementId"] as? String { flowID = id; devices = readDevices(value); step = .replacement }
        else if let id = value["passwordToken"] as? String { flowID = id; step = .setup }
        else { throw BronzeAPIError.invalid }
    }
    private func perform(_ operation: () async throws -> Void) async {
        guard !busy else { return }; busy = true; message = ""
        defer { busy = false }
        do { try await operation() } catch { message = error.localizedDescription }
    }
    func forgotPassword(email: String) async {
        await perform {
            let result = try await self.request("auth/password/forgot", body: ["email": email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()])
            self.message = result["message"] as? String ?? "Senha temporária enviada. Verifique seu e-mail."
        }
    }
    func changePassword(_ password: String, confirmation: String) async {
        await perform {
            guard let session = self.session else { throw BronzeAPIError.invalid }
            _ = try await self.request("account/password/change", body: ["password": password, "passwordConfirmation": confirmation], token: session.token)
            self.message = "Senha alterada."
        }
    }
    func saveName(_ name: String) async {
        await perform {
            guard var session = self.session else { throw BronzeAPIError.invalid }
            let result = try await self.request("account/profile/name", body: ["name": name], token: session.token, method: "PUT")
            session.account = try self.identity(result["profile"]); try self.store(session)
            self.message = "Nome atualizado."
        }
    }
    func listDevices() async {
        await perform {
            guard let token = self.session?.token else { return }
            let result = try await self.request("account/devices", token: token)
            guard self.session?.token == token else { return }
            self.devices = self.readDevices(result)
            self.totalLicenses = result["totalLicenses"] as? Int
            self.usedLicenses = result["usedLicenses"] as? Int
        }
    }

    func loadProfile() async {
        await perform {
            guard let token = self.session?.token else { return }
            let result = try await self.request("account/profile", token: token)
            guard self.session?.token == token, let profile = result["profile"] as? [String: Any] else { return }
            self.profilePhoto = profile["photoDataUrl"] as? String ?? ""
            self.profileCreatedAt = profile["createdAt"] as? String
        }
    }

    func saveProfilePhoto(_ jpeg: Data) async {
        await perform {
            guard let token = self.session?.token, jpeg.count <= 4 * 1024 * 1024 else { return }
            let result = try await self.request("account/profile/photo", body: ["imageDataUrl": "data:image/jpeg;base64," + jpeg.base64EncodedString()], token: token, method: "PUT")
            guard self.session?.token == token, let profile = result["profile"] as? [String: Any] else { return }
            self.profilePhoto = profile["photoDataUrl"] as? String ?? ""
            self.message = "Foto atualizada."
        }
    }
    func removeDevice(_ id: String, password: String) async {
        await perform {
            guard let token = self.session?.token else { return }
            let result = try await self.request("account/devices/removal/confirm", body: ["targetDeviceId": id, "password": password], token: token)
            if result["currentDeviceRemoved"] as? Bool == true { self.clearSession() }
            else { self.devices = self.readDevices(try await self.request("account/devices", token: token)) }
        }
    }
    func logout() async {
        await perform {
            guard let token = self.session?.token else { return }
            _ = try await self.request("auth/logout", body: [:], token: token)
            self.clearSession()
        }
    }
    private func clearSession() {
        profilePhoto = ""; profileCreatedAt = nil; totalLicenses = nil; usedLicenses = nil
        monitor?.cancel(); monitor = nil; BronzeKeychain.remove("session"); session = nil; categories = []; devices = []; step = .password
    }
    private func readDevices(_ response: [String: Any]) -> [BronzeAccountDevice] {
        (response["devices"] as? [[String: Any]] ?? []).compactMap {
            guard let id = $0["id"] as? String, let name = $0["name"] as? String else { return nil }
            return BronzeAccountDevice(id: id, name: name, current: $0["current"] as? Bool ?? false)
        }
    }
    private func beginMonitoring() {
        monitor?.cancel()
        monitor = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 600_000_000_000) } catch { return }
                guard let self, let token = self.session?.token else { return }
                do {
                    let response = try await self.request("auth/me", token: token)
                    guard !Task.isCancelled, var current = self.session, current.token == token else { return }
                    current.account = try self.identity(response["account"]); try self.store(current)
                } catch BronzeAPIError.response(let status, _) where status == 401 || status == 403 {
                    if self.session?.token == token { self.clearSession() }; return
                }
                catch { /* Network loss must not interrupt a performance. */ }
            }
        }
    }

    func loadCatalog() async {
        guard let token = session?.token, !catalogBusy else { return }
        catalogBusy = true; defer { catalogBusy = false }
        do {
            let result = try await request("account/sound-catalog", token: token)
            guard session?.token == token else { return }
            guard let catalog = result["catalog"] as? [String: Any] else { throw BronzeAPIError.invalid }
            let data = try JSONSerialization.data(withJSONObject: catalog)
            categories = try Self.parseCatalog(data)
            let store = try BronzeSessionStore.applicationStore()
            try FileManager.default.createDirectory(at: store.directory, withIntermediateDirectories: true)
            try data.write(to: store.directory.appendingPathComponent("catalog.json"), options: .atomic)
        } catch {
            guard session?.token == token else { return }
            if let store = try? BronzeSessionStore.applicationStore(),
               let data = try? Data(contentsOf: store.directory.appendingPathComponent("catalog.json")),
               let cached = try? Self.parseCatalog(data) { categories = cached }
            message = "Catálogo: \(error.localizedDescription)"
        }
    }
    nonisolated static func parseCatalog(_ data: Data) throws -> [BronzeCatalogCategory] {
        try BronzeNativeCatalog.parse(data)
    }
    func download(_ sound: BronzeCatalogSound) async throws -> URL {
        guard let token = session?.token, downloading == nil else { throw BronzeAPIError.invalid }
        downloading = sound.id; defer { downloading = nil }
        let result = try await request("account/sound-assets/url", body: ["objectKey": sound.objectKey, "kind": "sf2"], token: token)
        guard session?.token == token else { throw CancellationError() }
        guard let address = result["url"] as? String, let url = URL(string: address), url.scheme == "https" else { throw BronzeAPIError.invalid }
        // Do not forward the account bearer token to the asset/CDN host.
        let (temporary, response) = try await network.download(from: url)
        defer { try? FileManager.default.removeItem(at: temporary) }
        guard session?.token == token else { throw CancellationError() }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), http.url?.scheme == "https" else { throw BronzeAPIError.invalid }
        let size = try temporary.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 12, sound.byteSize.map({ $0 <= 0 || $0 == size }) ?? true else { throw BronzeAPIError.invalid }
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        var delivered = false
        defer { if !delivered { try? FileManager.default.removeItem(at: destination) } }
        let safeName = BronzeNativeBackup.fileName(user: sound.name).replacingOccurrences(of: ".bkbackup", with: ".sf2")
        let output = destination.appendingPathComponent(String(safeName.dropFirst(7)))
        // Hashing/copying SF2 must not block SwiftUI while it draws audio meters.
        let downloaded = try await Task.detached(priority: .utility) {
            let input = try FileHandle(forReadingFrom: temporary); defer { try? input.close() }
            let header = try input.read(upToCount: 12) ?? Data()
            guard header.count == 12, String(data: header.prefix(4), encoding: .ascii) == "RIFF",
                  String(data: header.suffix(4), encoding: .ascii) == "sfbk" else { throw BronzeAPIError.invalid }
            if let expected = sound.sha256, !expected.isEmpty {
                try input.seek(toOffset: 0); var hash = SHA256()
                while let data = try input.read(upToCount: 256 * 1024), !data.isEmpty { hash.update(data: data) }
                guard hash.finalize().map({ String(format: "%02x", $0) }).joined() == expected.lowercased() else { throw BronzeAPIError.invalid }
            }
            try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            try FileManager.default.moveItem(at: temporary, to: output)
            return output
        }.value
        guard session?.token == token else {
            throw CancellationError()
        }
        delivered = true
        return downloaded
    }

    func previewData(_ sound: BronzeCatalogSound) async throws -> Data {
        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.environment["BRONZE_LIBRARY_UI_TEST"] == "1",
           let url = Bundle.main.url(forResource: "01-kick", withExtension: "mp3", subdirectory: "fx-1") {
            return try Data(contentsOf: url)
        }
        #endif
        guard let token = session?.token, let key = sound.previewObjectKey else { throw BronzeAPIError.invalid }
        let result = try await request("account/sound-assets/url", body: ["objectKey": key, "kind": "preview"], token: token)
        guard session?.token == token else { throw CancellationError() }
        guard let address = result["url"] as? String, let url = URL(string: address), url.scheme == "https" else { throw BronzeAPIError.invalid }
        // Signed asset URL only; the bearer token stays with the account API.
        let (temporary, response) = try await network.download(from: url)
        defer { try? FileManager.default.removeItem(at: temporary) }
        guard session?.token == token else { throw CancellationError() }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), http.url?.scheme == "https",
              let size = try temporary.resourceValues(forKeys: [.fileSizeKey]).fileSize, (1...100_000_000).contains(size) else { throw BronzeAPIError.invalid }
        return try await Task.detached(priority: .utility) { try Data(contentsOf: temporary) }.value
    }

    // Only a UUID directory created by download(), never an imported user file.
    func discardDownload(_ url: URL) {
        let directory = url.deletingLastPathComponent().standardizedFileURL
        guard UUID(uuidString: directory.lastPathComponent) != nil,
              directory.deletingLastPathComponent().resolvingSymlinksInPath().path == FileManager.default.temporaryDirectory.resolvingSymlinksInPath().standardizedFileURL.path,
              url.pathExtension.lowercased() == "sf2" else { return }
        try? FileManager.default.removeItem(at: directory)
    }
}
