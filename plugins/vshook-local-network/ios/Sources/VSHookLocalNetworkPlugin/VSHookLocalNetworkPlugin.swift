import Foundation
import Capacitor
import Darwin

@objc(VSHookLocalNetworkPlugin)
public class VSHookLocalNetworkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VSHookLocalNetworkPlugin"
    public let jsName = "VSHookLocalNetwork"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAddresses", returnType: CAPPluginReturnPromise)
    ]

    @objc func getAddresses(_ call: CAPPluginCall) {
        var firstAddress: UnsafeMutablePointer<ifaddrs>?
        var found: [(priority: Int, address: String)] = []

        guard getifaddrs(&firstAddress) == 0, let first = firstAddress else {
            call.resolve(["addresses": [String]()])
            return
        }
        defer { freeifaddrs(firstAddress) }

        var pointer: UnsafeMutablePointer<ifaddrs>? = first
        while let current = pointer {
            let interface = current.pointee
            defer { pointer = interface.ifa_next }

            guard let socketAddress = interface.ifa_addr else { continue }
            guard socketAddress.pointee.sa_family == UInt8(AF_INET) else { continue }

            let flags = Int32(interface.ifa_flags)
            guard (flags & IFF_UP) != 0, (flags & IFF_LOOPBACK) == 0 else { continue }

            var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            let length = socklen_t(socketAddress.pointee.sa_len)
            let result = getnameinfo(
                socketAddress,
                length,
                &hostname,
                socklen_t(hostname.count),
                nil,
                0,
                NI_NUMERICHOST
            )
            guard result == 0 else { continue }

            let address = String(cString: hostname)
            guard Self.isPrivateIPv4(address) else { continue }
            guard let interfaceNamePointer = interface.ifa_name else { continue }
            let interfaceName = String(cString: interfaceNamePointer)
            let priority = interfaceName == "en0" ? 0 : (interfaceName.hasPrefix("en") ? 1 : 2)
            found.append((priority, address))
        }

        var seen = Set<String>()
        let addresses = found
            .sorted { $0.priority < $1.priority }
            .compactMap { entry -> String? in
                guard !seen.contains(entry.address) else { return nil }
                seen.insert(entry.address)
                return entry.address
            }
        call.resolve(["addresses": addresses])
    }

    private static func isPrivateIPv4(_ value: String) -> Bool {
        let parts = value.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        if parts[0] == 10 { return true }
        if parts[0] == 192 && parts[1] == 168 { return true }
        return parts[0] == 172 && parts[1] >= 16 && parts[1] <= 31
    }
}
