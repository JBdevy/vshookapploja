import Foundation
import Capacitor
import Security

// Guarda a sessão (token + conta) no Keychain, não no localStorage da WebView.
// O Keychain sobrevive a desinstalar e reinstalar o app — é por isso que ele
// existe: sem isto, todo reinstall pedia a conta de novo.
@objc(SessionVaultPlugin)
public final class SessionVaultPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SessionVaultPlugin"
    public let jsName = "SessionVault"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    private let service = "com.hookdeveloper.hookkeys.session"
    private let account = "session"

    private func query() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    @objc func read(_ call: CAPPluginCall) {
        var lookup = query()
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            call.resolve(["value": NSNull()])
            return
        }
        call.resolve(["value": value])
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), let data = value.data(using: .utf8) else {
            call.reject("value ausente")
            return
        }
        // kSecAttrAccessibleAfterFirstUnlock: legível em segundo plano, sem
        // exigir o aparelho desbloqueado no boot — e sobrevive ao reinstall.
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let updateStatus = SecItemUpdate(query() as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var newItem = query()
            for (key, value) in attributes { newItem[key] = value }
            SecItemAdd(newItem as CFDictionary, nil)
        }
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        SecItemDelete(query() as CFDictionary)
        call.resolve()
    }
}
