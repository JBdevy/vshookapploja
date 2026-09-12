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
        var found: [(priority: Int, address: String, prefixLength: Int, interfaceName: String)] = []

        guard getifaddrs(&firstAddress) == 0, let first = firstAddress else {
            call.resolve(["addresses": [String](), "networks": [[String: Any]]()])
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
            guard (flags & IFF_UP) != 0, (flags & IFF_LOOPBACK) == 0,
                  (flags & IFF_POINTOPOINT) == 0 else { continue }
            guard let interfaceNamePointer = interface.ifa_name else { continue }
            let interfaceName = String(cString: interfaceNamePointer)
            // Não supõe um nome fixo para o hotspot: en*, bridge* e demais
            // interfaces LAN são aceitas; celular/VPN/peer-to-peer são excluídos.
            guard Self.isLocalInterface(interfaceName) else { continue }
            guard let prefixLength = Self.prefixLength(interface.ifa_netmask) else { continue }

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
            let priority = interfaceName == "en0" ? 0 : (interfaceName.hasPrefix("en") ? 1 : 2)
            found.append((priority, address, prefixLength, interfaceName))
        }

        var seen = Set<String>()
        let localNetworks = found
            .sorted { $0.priority < $1.priority }
            .filter { entry in
                let key = "\(entry.address)/\(entry.prefixLength)"
                return seen.insert(key).inserted
            }
        var seenAddresses = Set<String>()
        let addresses = localNetworks.compactMap { entry -> String? in
            return seenAddresses.insert(entry.address).inserted ? entry.address : nil
        }
        let networks: [[String: Any]] = localNetworks.map { entry in
            return ["address": entry.address, "prefixLength": entry.prefixLength,
                    "interfaceName": entry.interfaceName]
        }
        call.resolve(["addresses": addresses, "networks": networks])
    }

    private static func isLocalInterface(_ name: String) -> Bool {
        let excluded = ["lo", "pdp_ip", "utun", "ipsec", "ppp", "awdl", "llw"]
        return !excluded.contains { name.hasPrefix($0) }
    }

    private static func prefixLength(_ address: UnsafeMutablePointer<sockaddr>?) -> Int? {
        guard let address = address,
              address.pointee.sa_family == UInt8(AF_INET) else { return nil }
        let networkMask = address.withMemoryRebound(to: sockaddr_in.self, capacity: 1) {
            UInt32(bigEndian: $0.pointee.sin_addr.s_addr)
        }
        let prefix = networkMask.nonzeroBitCount
        guard prefix > 0, networkMask == UInt32.max << (32 - prefix) else { return nil }
        return prefix
    }

    private static func isPrivateIPv4(_ value: String) -> Bool {
        let parts = value.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        if parts[0] == 10 { return true }
        if parts[0] == 192 && parts[1] == 168 { return true }
        return parts[0] == 172 && parts[1] >= 16 && parts[1] <= 31
    }
}
