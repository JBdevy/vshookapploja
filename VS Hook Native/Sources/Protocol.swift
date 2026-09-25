import Foundation
import Security

// The desktop bridge evolves independently of the mobile app. Preserve unknown
// fields while giving views and commands typed access to the published contract.
enum JSON: Codable, Equatable, Sendable, ExpressibleByStringLiteral, ExpressibleByIntegerLiteral, ExpressibleByFloatLiteral, ExpressibleByBooleanLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral {
    case null, string(String), number(Double), bool(Bool), array([JSON]), object([String: JSON])
    init(stringLiteral value: String) { self = .string(value) }
    init(integerLiteral value: Int) { self = .number(Double(value)) }
    init(floatLiteral value: Double) { self = .number(value) }
    init(booleanLiteral value: Bool) { self = .bool(value) }
    init(arrayLiteral elements: JSON...) { self = .array(elements) }
    init(dictionaryLiteral elements: (String, JSON)...) { self = .object(Dictionary(elements, uniquingKeysWith: { _, last in last })) }
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSON].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSON].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }
    subscript(_ key: String) -> JSON {
        get { if case .object(let v) = self { return v[key] ?? .null }; return .null }
        set { var v = object; v[key] = newValue; self = .object(v) }
    }
    var object: [String: JSON] { if case .object(let v) = self { return v }; return [:] }
    var array: [JSON] { if case .array(let v) = self { return v }; return [] }
    var string: String {
        switch self {
        case .string(let v): return v
        case .number(let v): return v.rounded() == v ? String(format: "%.0f", v) : String(v)
        default: return ""
        }
    }
    var double: Double { let value: Double; if case .number(let v) = self { value = v } else { value = Double(string) ?? 0 }; return value.isFinite ? value : 0 }
    var int: Int { let value = double; return value >= Double(Int.min) && value < Double(Int.max) ? Int(value) : 0 }
    var bool: Bool { if case .bool(let v) = self { return v }; return double != 0 }
    var exists: Bool { self != .null }
    func first(_ keys: String...) -> JSON { keys.map { self[$0] }.first { $0.exists && $0 != .string("") } ?? .null }
    func merging(_ other: JSON) -> JSON { .object(object.merging(other.object) { _, new in new }) }
    var identifier: String { first("id", "songId", "regionId", "markerId", "guid", "source_number", "sourceNumber", "number", "index").string }
    var name: String { first("name", "label", "title", "songName", "regionName", "markerName", "text").string }
}

struct BridgeError: LocalizedError {
    let message: String
    var status: Int = 0
    var errorDescription: String? { message }
}

final class BridgeHTTP: @unchecked Sendable {
    static let shared = BridgeHTTP()
    let session: URLSession
    init(configuration: URLSessionConfiguration = .ephemeral) {
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 60
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpMaximumConnectionsPerHost = 6
        session = URLSession(configuration: configuration)
    }
    func url(_ base: URL, _ path: String, query: [String: String] = [:]) throws -> URL {
        guard var parts = URLComponents(url: base, resolvingAgainstBaseURL: false) else { throw BridgeError(message: "Endereço inválido.") }
        parts.path = path.hasPrefix("/") ? path : "/" + path
        parts.queryItems = query.isEmpty ? nil : query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        guard let url = parts.url else { throw BridgeError(message: "Endereço inválido.") }
        return url
    }
    func request(_ base: URL, _ path: String, body: JSON? = nil, query: [String: String] = [:], timeout: Double = 15) async throws -> JSON {
        var req = URLRequest(url: try url(base, path, query: query), timeoutInterval: timeout)
        if let body {
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        return try await send(req)
    }
    func send(_ request: URLRequest) async throws -> JSON {
        try Task.checkCancellation()
        let (data, response) = try await session.data(for: request)
        try Task.checkCancellation()
        guard let response = response as? HTTPURLResponse else { throw BridgeError(message: "Resposta inválida do servidor.") }
        let json = (try? JSONDecoder().decode(JSON.self, from: data)) ?? .null
        guard (200..<300).contains(response.statusCode), json["ok"] != .bool(false) else {
            throw BridgeError(message: json["error"].string.isEmpty ? "Falha de conexão (\(response.statusCode))." : json["error"].string, status: response.statusCode)
        }
        guard json.exists else { throw BridgeError(message: "O servidor não retornou os dados do VS Hook.") }
        return json
    }
}

enum SecretStore {
    static func read(_ account: String) -> Data? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.hookdeveloper.vshook.native", kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }
    static func write(_ data: Data?, account: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.hookdeveloper.vshook.native", kSecAttrAccount as String: account]
        guard let data else { SecItemDelete(query as CFDictionary); return }
        let update = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if update == errSecSuccess { return }
        guard update == errSecItemNotFound else { throw BridgeError(message: "Não foi possível guardar a sessão com segurança.") }
        var insert = query
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { throw BridgeError(message: "Não foi possível guardar a sessão com segurança.") }
    }
}

// Compatibility with simpleHash in the existing desktop/mobile protocol. This
// is a legacy access-code verifier, not a replacement for a password KDF.
func bridgePasswordHash(_ text: String) -> String {
    var h1: UInt64 = 0x45D9, h2: UInt64 = 0x2710
    for (i, char) in text.utf16.enumerated() {
        let b = UInt64(char), index = UInt64(i)
        h1 = (h1 ^ (b * (index + 1) + 17)) & 0xFFFFFF
        h2 = (h2 + ((b + index) * 131)) & 0xFFFFFF
        h1 = (h1 * 33 + h2) & 0xFFFFFF
        h2 = (h2 * 17 + h1) & 0xFFFFFF
    }
    return String(format: "%08X", UInt32(truncatingIfNeeded: (h1 << 12) + h2))
}

struct HookProject: Identifiable, Codable, Equatable, Sendable {
    let name: String
    let tab: Int
    let projectID: String
    let computer: String
    let computerID: String
    let director: URL
    let musicians: URL
    let active: Bool
    var id: String { "\(computerID)|\(tab)|\(projectID)|\(name)" }
    static func parse(_ payload: JSON, base: JSON, host: String, director: URL? = nil, musicians: URL? = nil) -> [Self] {
        guard payload["reaperOnline"] != false, base["reaperOnline"] != false else { return [] }
        let lists = [payload.array] + ["projects", "projectTabs", "openProjects", "tabs", "reaperProjects", "availableProjects"].map { payload[$0].array }
        var items = lists.first { !$0.isEmpty } ?? []
        if items.isEmpty {
            items = [["name": payload["projectName"].exists ? payload["projectName"] : base["projectName"], "active": true, "index": payload.first("activeProjectTabIndex", "activeProjectTabId")]]
        }
        return items.enumerated().compactMap { index, item in
            let name = (item.first("name", "projectName", "title", "label").string.isEmpty ? item.string : item.first("name", "projectName", "title", "label").string).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty, !["projeto vs hook", "vs hook", "demo", "projeto demo"].contains(name.lowercased().split(whereSeparator: \.isWhitespace).joined(separator: " ")) else { return nil }
            let tab = Int(item.first("index", "projectTabIndex", "tabIndex", "id").string) ?? index
            let computer = item.first("computerName", "deviceName", "hostName").string
            let fallback = base.first("computerName", "deviceName", "hostName").string
            let computerID = item["computerId"].string.isEmpty ? base.first("computerId", "deviceId").string : item["computerId"].string
            guard let director = director ?? URL(string: "http://\(host):47831"), let musicians = musicians ?? URL(string: "http://\(host):47832") else { return nil }
            return Self(name: name, tab: tab, projectID: item.first("id", "projectId", "tabId").string.isEmpty ? String(tab) : item.first("id", "projectId", "tabId").string, computer: computer.isEmpty ? (fallback.isEmpty ? "PC \(host)" : fallback) : computer, computerID: computerID.isEmpty ? host : computerID, director: director, musicians: musicians, active: item.first("active", "isCurrent", "current").bool)
        }
    }
}
