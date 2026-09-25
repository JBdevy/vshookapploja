import Foundation
import Combine

@MainActor final class TPNoticeModel: ObservableObject {
    @Published private(set) var notice: JSON = .null
    @Published private(set) var changedAt = Date()
    private var serverOffset = 0.0
    func apply(_ payload: JSON, at date: Date = Date()) {
        if payload["now"].double > 0 { serverOffset = payload["now"].double / 1000 - date.timeIntervalSince1970 }
        let next = payload["notice"]
        if next != notice { changedAt = date; notice = next }
    }
    func active(at date: Date, settings: JSON, slot: Int) -> Bool {
        settings[slot == 2 ? "window2Enabled" : "window1Enabled"] != false &&
        (!notice.first("text", "message").string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !notice["imagePath"].string.isEmpty) &&
        (notice["pinned"].bool || notice["expiresAt"].double / 1000 > date.timeIntervalSince1970 + serverOffset)
    }
    func poll(base: URL, fallback: JSON) async {
        if !notice.exists { notice = fallback }
        while !Task.isCancelled {
            do {
                let payload = try await BridgeHTTP.shared.request(base, "/technical-notice", timeout: 2)
                guard !Task.isCancelled else { return }
                apply(payload)
            } catch { /* Keep the last notice only until its server deadline. */ }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
    }
}
