import Foundation
import Darwin
import Combine

struct LocalNetwork: Equatable {
    let address: String
    let prefix: Int
    static func number(_ address: String) -> UInt32? {
        let fields = address.split(separator: ".", omittingEmptySubsequences: false)
        guard fields.count == 4 else { return nil }
        var result: UInt32 = 0
        for field in fields {
            guard !field.isEmpty, field.allSatisfy(\.isNumber), let octet = UInt32(field), octet <= 255 else { return nil }
            result = (result << 8) | octet
        }
        return result
    }
    static func text(_ value: UInt32) -> String { [24, 16, 8, 0].map { String((value >> $0) & 255) }.joined(separator: ".") }
    static func isPrivate(_ value: UInt32) -> Bool { value >> 24 == 10 || value >> 16 == 0xC0A8 || value >> 20 == 0xAC1 }
    static func current() -> [Self] {
        var first: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&first) == 0 else { return [] }
        defer { freeifaddrs(first) }
        var pointer = first, result: [Self] = []
        while let current = pointer {
            let interface = current.pointee
            pointer = interface.ifa_next
            guard let addr = interface.ifa_addr, let mask = interface.ifa_netmask,
                  addr.pointee.sa_family == UInt8(AF_INET), mask.pointee.sa_family == UInt8(AF_INET),
                  interface.ifa_flags & UInt32(IFF_UP) != 0,
                  interface.ifa_flags & UInt32(IFF_LOOPBACK | IFF_POINTOPOINT) == 0 else { continue }
            let name = String(cString: interface.ifa_name)
            guard !["lo", "pdp_ip", "utun", "ipsec", "ppp", "awdl", "llw"].contains(where: name.hasPrefix) else { continue }
            let value = addr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { UInt32(bigEndian: $0.pointee.sin_addr.s_addr) }
            let maskValue = mask.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { UInt32(bigEndian: $0.pointee.sin_addr.s_addr) }
            let prefix = maskValue.nonzeroBitCount
            guard Self.isPrivate(value), prefix > 0, maskValue == UInt32.max << (32 - prefix) else { continue }
            let network = Self(address: Self.text(value), prefix: prefix)
            if !result.contains(network) { result.append(network) }
        }
        return result
    }
    static func candidates(_ networks: [Self], saved: [String]) -> [String] {
        let own = Set(networks.map(\.address))
        let ranges: [ClosedRange<UInt32>] = networks.compactMap { network in
            guard (16...32).contains(network.prefix), let number = Self.number(network.address) else { return nil }
            let mask = UInt32.max << (32 - network.prefix), start = number & mask
            let skip: UInt32 = network.prefix <= 30 ? 1 : 0
            return (start + skip)...(start + ~mask - skip)
        }
        var seen = Set<String>(), result: [String] = []
        func append(_ host: String) {
            guard let number = Self.number(host), !own.contains(host), ranges.contains(where: { $0.contains(number) }), seen.insert(host).inserted else { return }
            result.append(host)
        }
        saved.forEach(append)
        let preferred: [UInt32] = [1, 2, 10, 11, 15, 20, 30, 50, 80, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 120, 150, 180, 200, 220, 254]
        for range in ranges {
            for block in stride(from: UInt64(range.lowerBound / 256) * 256, through: UInt64(range.upperBound), by: 256) {
                for host in preferred { append(Self.text(UInt32(block) + host)) }
            }
            for host in range { append(Self.text(host)) }
        }
        return result
    }
}

@MainActor final class DiscoveryModel: ObservableObject {
    @Published var projects: [HookProject] = []
    @Published var searching = false
    @Published var status = ""
    @Published var manualHost = ""
    @Published var peers: [VSHookApplePeer] = []
    private var task: Task<Void, Never>?
    private var generation = UUID()
    let peerBridge = VSHookApplePeerBridge()
    var saved: [String] { UserDefaults.standard.stringArray(forKey: "vshook.native.hosts") ?? [] }
    func stop() { generation = UUID(); task?.cancel(); task = nil; searching = false }
    func remember(_ project: HookProject) {
        guard let host = project.director.host, host != "127.0.0.1" else { return }
        UserDefaults.standard.set(Array(([host] + saved.filter { $0 != host }).prefix(20)), forKey: "vshook.native.hosts")
    }
    nonisolated static func probe(_ host: String, manual: Bool = false) async -> [HookProject] {
        let timeout = manual ? 2.8 : 0.65
        for port in (manual ? [47831, 47832] : [47831]) {
            guard !Task.isCancelled, let base = URL(string: "http://\(host):\(port)") else { return [] }
            let discovery = (try? await BridgeHTTP.shared.request(base, "/discovery", timeout: timeout)) ?? .null
            if discovery["reaperOnline"] == false { continue }
            if !manual {
                guard discovery["app"] == "VS Hook" || discovery["appName"].string.lowercased().contains("diretor") else { continue }
            }
            var payload = discovery
            if manual {
                for path in ["/projects", "/projects.json", "/state", "/state.json"] {
                    guard !Task.isCancelled else { return [] }
                    if let data = try? await BridgeHTTP.shared.request(base, path, timeout: timeout) {
                        payload = data
                        if !HookProject.parse(data, base: discovery, host: host).isEmpty { break }
                    }
                }
            }
            let found = HookProject.parse(payload, base: discovery, host: host)
            if !found.isEmpty { return found }
        }
        return []
    }
    func search(manual: Bool = false) {
        stop()
        let token = generation
        searching = true; status = "Procurando sessões VS Hook disponíveis na rede Wi-Fi…"
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["VSHOOK_TEST_BRIDGE"],
           let base = URL(string: raw), base.host == "127.0.0.1", base.scheme == "http" {
            task = Task {
                defer { if generation == token { searching = false } }
                do {
                    let data = try await BridgeHTTP.shared.request(base, "/discovery")
                    guard !Task.isCancelled, generation == token else { return }
                    projects = HookProject.parse(data, base: data, host: "127.0.0.1", director: base, musicians: base)
                    status = "Escolha como vai entrar no VS Hook."
                } catch { if generation == token { status = error.localizedDescription } }
            }
            return
        }
        #endif
        if !manual { projects = []; peers = []; peerBridge.stop() }
        let manualInput = manualHost.trimmingCharacters(in: .whitespacesAndNewlines)
        let host = URL(string: manualInput.contains("://") ? manualInput : "http://" + manualInput)?.host ?? ""
        var addresses = manual ? [host] : LocalNetwork.candidates(LocalNetwork.current(), saved: saved)
        #if targetEnvironment(simulator)
        // Simulator networking shares the Mac host. Include its loopback bridge
        // without probing loopback on physical iPhones/iPads.
        if !manual { addresses.insert("127.0.0.1", at: 0) }
        #endif
        if manual && LocalNetwork.number(host) == nil {
            searching = false; status = "Digite um endereço IPv4 válido, como 192.168.1.10."; return
        }
        task = Task {
            defer { if generation == token { searching = false } }
            var seen = Set(projects.map(\.id))
            for start in stride(from: 0, to: addresses.count, by: 48) {
                guard !Task.isCancelled, generation == token else { return }
                let batch = Array(addresses[start..<min(start + 48, addresses.count)])
                await withTaskGroup(of: [HookProject].self) { group in
                    for address in batch { group.addTask { await Self.probe(address, manual: manual) } }
                    for await found in group {
                        guard !Task.isCancelled, generation == token else { group.cancelAll(); break }
                        for project in found where seen.insert(project.id).inserted { projects.append(project); remember(project) }
                    }
                }
            }
            guard !Task.isCancelled, generation == token else { return }
            status = projects.isEmpty ? "Nenhuma sessão VS Hook foi encontrada. Mantenha o VS Hook/Hook Center aberto na mesma rede e toque em Procurar." : "Escolha como vai entrar no VS Hook."
            if addresses.isEmpty { status = "Conecte-se ao Wi-Fi ou informe o IP do computador." }
        }
    }
    func searchApplePeers() {
        stop(); let token = generation; peers = []; searching = true; status = "Procurando Macs próximos…"
        peerBridge.discover(timeout: 3.5) { [weak self] result in
            Task { @MainActor in
                guard let self, self.generation == token else { return }
                self.searching = false
                switch result {
                case .success(let peers): self.peers = peers; self.status = peers.isEmpty ? "Nenhum Mac encontrado. Abra o Hook Center no Mac." : "Escolha o Mac para conectar."
                case .failure(let error): self.status = error.localizedDescription
                }
            }
        }
    }
    func connectPeer(_ peer: VSHookApplePeer) {
        stop(); let token = generation; searching = true; status = "Conectando a \(peer.name)…"
        peerBridge.connect(peerId: peer.id) { [weak self] result in
            Task { @MainActor in
                guard let self, self.generation == token else { return }
                switch result {
                case .failure(let error): self.searching = false; self.status = error.localizedDescription
                case .success(let urls):
                    guard let director = URL(string: urls.directorUrl), let musicians = URL(string: urls.musiciansUrl) else { self.searching = false; return }
                    self.task = Task {
                        defer { if self.generation == token { self.searching = false } }
                        do {
                            let data = try await BridgeHTTP.shared.request(director, "/projects")
                            guard !Task.isCancelled, self.generation == token else { return }
                            self.projects = HookProject.parse(data, base: ["computerName": .string(peer.name), "computerId": .string(peer.id)], host: director.host ?? "127.0.0.1", director: director, musicians: musicians)
                            self.peers = []
                            self.status = self.projects.isEmpty ? "Abra um projeto no Hook Center." : "Escolha como vai entrar no VS Hook."
                        } catch { if self.generation == token { self.status = error.localizedDescription } }
                    }
                }
            }
        }
    }
}
