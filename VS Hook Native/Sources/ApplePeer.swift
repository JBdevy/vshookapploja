// Native peer transport shared with the current VS Hook protocol. No Capacitor dependency.
import Foundation
import Network

struct VSHookApplePeer: Equatable {
    let id: String
    let name: String
}

struct VSHookApplePeerURLs {
    let directorUrl: String
    let musiciansUrl: String
    let peerName: String
}

private enum VSHookApplePeerError: LocalizedError {
    case unavailable(String)
    case peerNotFound
    case proxyFailed(String)

    var errorDescription: String? {
        switch self {
        case .unavailable(let message): return message
        case .peerNotFound: return "O Mac selecionado não está mais disponível. Procure novamente."
        case .proxyFailed(let message): return "Não foi possível abrir a conexão direta: \(message)"
        }
    }
}

final class VSHookApplePeerBridge {
    private let queue = DispatchQueue(label: "com.hookdeveloper.vshook.apple-peer")
    private let serviceType = "_vshook._tcp"
    private var browser: NWBrowser?
    private var endpoints: [String: (endpoint: NWEndpoint, name: String)] = [:]
    private var endpointIds: [String: String] = [:]
    private var proxy: VSHookApplePeerProxy?
    private var discoveryGeneration = 0

    func discover(timeout: TimeInterval,
                  completion: @escaping (Result<[VSHookApplePeer], Error>) -> Void) {
        queue.async {
            self.discoveryGeneration += 1
            let generation = self.discoveryGeneration
            self.browser?.cancel()
            self.browser = nil
            self.endpoints.removeAll()
            self.endpointIds.removeAll()

            let parameters = NWParameters.tcp
            parameters.includePeerToPeer = true
            let browser = NWBrowser(for: .bonjour(type: self.serviceType, domain: nil),
                                    using: parameters)
            self.browser = browser
            var finished = false
            let finish: (Result<[VSHookApplePeer], Error>) -> Void = { result in
                guard !finished else { return }
                finished = true
                // Mantém os endpoints descobertos disponíveis para a escolha
                // do usuário. Um último callback vazio após cancel() não pode
                // apagar a lista antes de connectApplePeer.
                browser.stateUpdateHandler = nil
                browser.browseResultsChangedHandler = nil
                browser.cancel()
                if self.browser === browser { self.browser = nil }
                DispatchQueue.main.async { completion(result) }
            }

            browser.stateUpdateHandler = { state in
                guard generation == self.discoveryGeneration else { return }
                switch state {
                case .failed(let error):
                    finish(.failure(VSHookApplePeerError.unavailable(error.localizedDescription)))
                case .cancelled:
                    break
                default:
                    break
                }
            }
            browser.browseResultsChangedHandler = { results, _ in
                guard generation == self.discoveryGeneration else { return }
                var next: [String: (endpoint: NWEndpoint, name: String)] = [:]
                var nextIds: [String: String] = [:]
                for result in results {
                    let description = result.endpoint.debugDescription
                    let id = self.endpointIds[description] ?? UUID().uuidString
                    let name: String
                    if case let .service(serviceName, _, _, _) = result.endpoint {
                        name = serviceName
                    } else {
                        name = "Hook Center"
                    }
                    next[id] = (result.endpoint, name)
                    nextIds[description] = id
                }
                self.endpoints = next
                self.endpointIds = nextIds
            }
            browser.start(queue: self.queue)
            self.queue.asyncAfter(deadline: .now() + timeout) {
                guard generation == self.discoveryGeneration else { return }
                let peers = self.endpoints.map { VSHookApplePeer(id: $0.key, name: $0.value.name) }
                    .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                finish(.success(peers))
            }
        }
    }

    func connect(peerId: String,
                 completion: @escaping (Result<VSHookApplePeerURLs, Error>) -> Void) {
        queue.async {
            guard let selected = self.endpoints[peerId] else {
                DispatchQueue.main.async { completion(.failure(VSHookApplePeerError.peerNotFound)) }
                return
            }
            self.proxy?.stop()
            let proxy = VSHookApplePeerProxy(endpoint: selected.endpoint, queue: self.queue)
            self.proxy = proxy
            proxy.start { result in
                let mapped = result.map { ports in
                    VSHookApplePeerURLs(
                        directorUrl: "http://127.0.0.1:\(ports.director)",
                        musiciansUrl: "http://127.0.0.1:\(ports.musicians)",
                        peerName: selected.name
                    )
                }
                DispatchQueue.main.async { completion(mapped) }
            }
        }
    }

    func stop() {
        queue.async {
            self.discoveryGeneration += 1
            self.browser?.cancel()
            self.browser = nil
            self.proxy?.stop()
            self.proxy = nil
            self.endpoints.removeAll()
            self.endpointIds.removeAll()
        }
    }
}

private final class VSHookApplePeerProxy {
    struct Ports {
        let director: UInt16
        let musicians: UInt16
    }

    private let endpoint: NWEndpoint
    private let queue: DispatchQueue
    private var listeners: [String: NWListener] = [:]
    private var tunnels: [ObjectIdentifier: VSHookApplePeerTunnel] = [:]
    private var completedStart = false

    init(endpoint: NWEndpoint, queue: DispatchQueue) {
        self.endpoint = endpoint
        self.queue = queue
    }

    func start(completion: @escaping (Result<Ports, Error>) -> Void) {
        do {
            let director = try makeListener(channel: "director")
            let musicians = try makeListener(channel: "musicians")
            listeners = ["director": director, "musicians": musicians]
            var ready: [String: UInt16] = [:]

            for (channel, listener) in listeners {
                listener.stateUpdateHandler = { [weak self] state in
                    guard let self, !self.completedStart else { return }
                    switch state {
                    case .ready:
                        if let port = listener.port?.rawValue { ready[channel] = port }
                        if let directorPort = ready["director"],
                           let musiciansPort = ready["musicians"] {
                            self.completedStart = true
                            completion(.success(Ports(director: directorPort,
                                                      musicians: musiciansPort)))
                        }
                    case .failed(let error):
                        self.completedStart = true
                        self.stop()
                        completion(.failure(VSHookApplePeerError.proxyFailed(error.localizedDescription)))
                    default:
                        break
                    }
                }
                listener.start(queue: queue)
            }
        } catch {
            completedStart = true
            stop()
            completion(.failure(VSHookApplePeerError.proxyFailed(error.localizedDescription)))
        }
    }

    private func makeListener(channel: String) throws -> NWListener {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        let listener = try NWListener(using: parameters)
        listener.newConnectionHandler = { [weak self] local in
            guard let self else { local.cancel(); return }
            let tunnel = VSHookApplePeerTunnel(local: local, endpoint: self.endpoint,
                                                channel: channel, queue: self.queue)
            let key = ObjectIdentifier(tunnel)
            self.tunnels[key] = tunnel
            tunnel.onClose = { [weak self] in self?.tunnels.removeValue(forKey: key) }
            tunnel.start()
        }
        return listener
    }

    func stop() {
        listeners.values.forEach { $0.cancel() }
        listeners.removeAll()
        let activeTunnels = Array(tunnels.values)
        tunnels.removeAll()
        activeTunnels.forEach {
            $0.onClose = nil
            $0.stop()
        }
    }
}

private final class VSHookApplePeerTunnel {
    private let local: NWConnection
    private let remote: NWConnection
    private let channel: String
    private let queue: DispatchQueue
    private var closed = false
    var onClose: (() -> Void)?

    init(local: NWConnection, endpoint: NWEndpoint, channel: String, queue: DispatchQueue) {
        self.local = local
        self.channel = channel
        self.queue = queue
        let parameters = NWParameters.tcp
        parameters.includePeerToPeer = true
        self.remote = NWConnection(to: endpoint, using: parameters)
    }

    func start() {
        local.stateUpdateHandler = { [weak self] state in
            if case .failed = state { self?.stop() }
            if case .cancelled = state { self?.stop() }
        }
        remote.stateUpdateHandler = { [weak self] state in
            guard let self, !self.closed else { return }
            switch state {
            case .ready:
                let header = Data("VSHOOK/1 \(self.channel)\n".utf8)
                self.remote.send(content: header, completion: .contentProcessed { error in
                    if error != nil { self.stop(); return }
                    self.pipe(from: self.local, to: self.remote)
                    self.pipe(from: self.remote, to: self.local)
                })
            case .failed, .cancelled:
                self.stop()
            default:
                break
            }
        }
        local.start(queue: queue)
        remote.start(queue: queue)
    }

    private func pipe(from source: NWConnection, to destination: NWConnection) {
        source.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, complete, error in
            guard let self, !self.closed else { return }
            if let data, !data.isEmpty {
                destination.send(content: data, completion: .contentProcessed { sendError in
                    if sendError != nil || complete || error != nil { self.stop() }
                    else { self.pipe(from: source, to: destination) }
                })
            } else if complete || error != nil {
                self.stop()
            } else {
                self.pipe(from: source, to: destination)
            }
        }
    }

    func stop() {
        guard !closed else { return }
        closed = true
        local.cancel()
        remote.cancel()
        onClose?()
        onClose = nil
    }
}
