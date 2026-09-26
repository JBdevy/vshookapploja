import Foundation
import CryptoKit

// A streaming container, not an in-memory JSON/base64 copy of hundreds of MB.
// Only user state and private audio: no tokens, Keychain, account or app bundle.
struct BronzeNativeBackup {
    private struct Entry: Codable { let path: String; let bytes: UInt64; let sha256: String }
    private struct Manifest: Codable { var version = 1; var entries: [Entry] }
    private static let magic = Data("BKBACK01".utf8)
    private static let chunkSize = 256 * 1024
    private static let maximumBytes: UInt64 = 32 * 1024 * 1024 * 1024

    static func fileName(user: String) -> String {
        let excluded = CharacterSet(charactersIn: "<>:\"/\\|?*\0").union(.controlCharacters)
        let name = user.components(separatedBy: excluded).joined().trimmingCharacters(in: .whitespacesAndNewlines)
        return "UserBK_\(name.isEmpty ? "Usuario" : String(name.prefix(60))).bkbackup"
    }

    static func export(session: BronzeNativeSession, store: BronzeSessionStore, destination: URL) throws {
        try session.validate()
        let staging = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: staging) }
        let json = staging.appendingPathComponent("native-session.json")
        try JSONEncoder().encode(session).write(to: json, options: .atomic)
        var sources: [(String, URL)] = [("native-session.json", json)]
        for folder in ["UserSoundFonts", "UserMedia"] {
            let root = store.directory.appendingPathComponent(folder, isDirectory: true)
            guard FileManager.default.fileExists(atPath: root.path) else { continue }
            guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isSymbolicLinkKey, .isRegularFileKey]) else { throw BronzeSessionError.invalid }
            for case let url as URL in walker {
                let info = try url.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey])
                guard info.isSymbolicLink != true else { throw BronzeSessionError.invalid }
                if info.isRegularFile == true {
                    let relative = folder + "/" + url.deletingLastPathComponent().lastPathComponent + "/" + url.lastPathComponent
                    try validatePath(relative)
                    guard url.standardizedFileURL.path == store.directory.appendingPathComponent(relative).standardizedFileURL.path else { throw BronzeSessionError.invalid }
                    sources.append((relative, url))
                }
            }
        }
        guard sources.count <= 10000 else { throw BronzeSessionError.invalid }
        var entries: [Entry] = []
        var total: UInt64 = 0
        for (path, url) in sources {
            let result = try digest(url)
            guard result.bytes <= maximumBytes - total else { throw BronzeSessionError.invalid }
            total += result.bytes
            entries.append(Entry(path: path, bytes: result.bytes, sha256: result.sha256))
        }
        let manifest = try JSONEncoder().encode(Manifest(entries: entries))
        guard manifest.count <= 4 * 1024 * 1024 else { throw BronzeSessionError.invalid }
        let temporary = destination.deletingLastPathComponent().appendingPathComponent(UUID().uuidString + ".partial")
        defer { try? FileManager.default.removeItem(at: temporary) }
        guard FileManager.default.createFile(atPath: temporary.path, contents: nil) else { throw BronzeSessionError.invalid }
        let output = try FileHandle(forWritingTo: temporary)
        defer { try? output.close() }
        try output.write(contentsOf: magic)
        let length = UInt32(manifest.count)
        try output.write(contentsOf: Data((0..<4).map { UInt8(truncatingIfNeeded: length >> ($0 * 8)) }))
        try output.write(contentsOf: manifest)
        for ((_, url), entry) in zip(sources, entries) {
            let input = try FileHandle(forReadingFrom: url)
            defer { try? input.close() }
            var hasher = SHA256(), remaining = entry.bytes
            while remaining > 0 {
                let chunk = try read(input, count: Int(min(UInt64(chunkSize), remaining)))
                hasher.update(data: chunk); try output.write(contentsOf: chunk); remaining -= UInt64(chunk.count)
            }
            guard hex(hasher.finalize()) == entry.sha256, try input.read(upToCount: 1)?.isEmpty != false else { throw BronzeSessionError.invalid }
        }
        try output.synchronize()
        // destination is a fresh temporary export path. Never overwrite a user's file.
        try FileManager.default.moveItem(at: temporary, to: destination)
    }

    // No writes to the live store until every byte and session reference is verified.
    static func stage(_ archive: URL) throws -> BronzeSessionStore {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var complete = false
        defer { if !complete { try? FileManager.default.removeItem(at: directory) } }
        let input = try FileHandle(forReadingFrom: archive)
        defer { try? input.close() }
        guard try read(input, count: 8) == magic else { throw BronzeSessionError.invalid }
        let sizeBytes = try read(input, count: 4)
        let size = sizeBytes.enumerated().reduce(0) { $0 | (Int($1.element) << ($1.offset * 8)) }
        guard (1...(4 * 1024 * 1024)).contains(size) else { throw BronzeSessionError.invalid }
        let manifest = try JSONDecoder().decode(Manifest.self, from: read(input, count: size))
        guard manifest.version == 1, (1...10000).contains(manifest.entries.count),
              Set(manifest.entries.map { $0.path.lowercased() }).count == manifest.entries.count else { throw BronzeSessionError.invalid }
        var total: UInt64 = 0
        for entry in manifest.entries {
            try validatePath(entry.path)
            guard entry.bytes > 0, entry.bytes <= maximumBytes - total,
                  entry.path != "native-session.json" || entry.bytes <= 16 * 1024 * 1024,
                  entry.sha256.count == 64 else { throw BronzeSessionError.invalid }
            total += entry.bytes
            let url = directory.appendingPathComponent(entry.path)
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            guard FileManager.default.createFile(atPath: url.path, contents: nil) else { throw BronzeSessionError.invalid }
            let output = try FileHandle(forWritingTo: url)
            defer { try? output.close() }
            var remaining = entry.bytes, hasher = SHA256()
            while remaining > 0 {
                let chunk = try read(input, count: Int(min(UInt64(chunkSize), remaining)))
                hasher.update(data: chunk); try output.write(contentsOf: chunk); remaining -= UInt64(chunk.count)
            }
            guard hex(hasher.finalize()) == entry.sha256 else { throw BronzeSessionError.invalid }
        }
        guard try input.read(upToCount: 1)?.isEmpty != false else { throw BronzeSessionError.invalid }
        let store = BronzeSessionStore(directory: directory)
        guard let session = try store.load() else { throw BronzeSessionError.invalid }
        var fontKeys = session.modules.compactMap(\.soundFontKey)
        fontKeys += session.presets.flatMap { $0.modules?.compactMap(\.soundFontKey) ?? [] }
        let workspace = session.workspace ?? BronzeUserWorkspace()
        fontKeys += Array((workspace.catalogDownloads ?? [:]).values)
        let mediaKeys = workspace.allLibraryTracks.map(\.key) + workspace.fxBanks.flatMap { $0.pads.compactMap(\.key) }
        for key in fontKeys { guard FileManager.default.fileExists(atPath: try store.soundFontURL(for: key).path) else { throw BronzeSessionError.invalid } }
        for key in mediaKeys { guard FileManager.default.fileExists(atPath: try BronzeUserMediaStore(session: store).url(key).path) else { throw BronzeSessionError.invalid } }
        complete = true
        return store
    }

    // Merge immutable UUID assets. Existing files are never replaced; a conflict
    // fails before the session changes. Previously referenced assets remain intact.
    static func installAssets(from staged: BronzeSessionStore, into live: BronzeSessionStore) throws {
        var pending: [(URL, URL)] = []
        for folder in ["UserSoundFonts", "UserMedia"] {
            let root = staged.directory.appendingPathComponent(folder)
            guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey]) else { continue }
            for case let source as URL in walker where try source.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
                let path = folder + "/" + source.deletingLastPathComponent().lastPathComponent + "/" + source.lastPathComponent
                try validatePath(path)
                let destination = live.directory.appendingPathComponent(path)
                guard destination.resolvingSymlinksInPath().path.hasPrefix(live.directory.resolvingSymlinksInPath().path + "/") else { throw BronzeSessionError.invalid }
                if FileManager.default.fileExists(atPath: destination.path) {
                    guard try digest(source).sha256 == digest(destination).sha256 else { throw BronzeSessionError.invalid }
                } else { pending.append((source, destination)) }
            }
        }
        for (source, destination) in pending {
            try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: source, to: destination)
        }
    }

    private static func validatePath(_ path: String) throws {
        if path == "native-session.json" { return }
        if path.hasPrefix("UserSoundFonts/") { try BronzeSessionStore.validateSoundFontKey(String(path.dropFirst(15))); return }
        if path.hasPrefix("UserMedia/") { try BronzeUserMediaStore.validateKey(String(path.dropFirst(10))); return }
        throw BronzeSessionError.invalid
    }
    private static func read(_ input: FileHandle, count: Int) throws -> Data {
        var result = Data()
        while result.count < count {
            guard let data = try input.read(upToCount: count - result.count), !data.isEmpty else { throw BronzeSessionError.invalid }
            result.append(data)
        }
        return result
    }
    private static func digest(_ url: URL) throws -> (bytes: UInt64, sha256: String) {
        let input = try FileHandle(forReadingFrom: url)
        defer { try? input.close() }
        var hasher = SHA256(), bytes: UInt64 = 0
        while let data = try input.read(upToCount: chunkSize), !data.isEmpty {
            bytes += UInt64(data.count)
            guard bytes <= maximumBytes else { throw BronzeSessionError.invalid }
            hasher.update(data: data)
        }
        return (bytes, hex(hasher.finalize()))
    }
    private static func hex(_ digest: SHA256.Digest) -> String { digest.map { String(format: "%02x", $0) }.joined() }
}
