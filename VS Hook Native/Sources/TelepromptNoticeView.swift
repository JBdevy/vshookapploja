import SwiftUI

struct TPNoticeOverlay: View {
    @ObservedObject var model: TPNoticeModel
    let settings: JSON
    let slot: Int
    let base: URL
    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.175)) { context in
            if model.active(at: context.date, settings: settings, slot: slot) {
                GeometryReader { geometry in
                    let elapsed = max(0, context.date.timeIntervalSince(model.changedAt))
                    let flash = elapsed < 1.05 && Int(elapsed / 0.175) % 2 == 0
                    Group {
                        if !model.notice["imagePath"].string.isEmpty, let url = try? BridgeHTTP.shared.url(base, "/media", query: ["path": model.notice["imagePath"].string]) {
                            AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { ProgressView() }
                        } else {
                            Text(displayText)
                                .font(tpFont(settings["fontFamily"].string, size: min(72, max(24, geometry.size.width * 0.078)) * settings["textScale"].double / 100))
                        }
                    }
                        .foregroundColor(Color(hex: settings["textColor"].string))
                        .multilineTextAlignment(.center).minimumScaleFactor(0.3)
                        .padding(24).frame(width: geometry.size.width, height: geometry.size.height)
                        .background(Color(hex: settings[flash ? "flashColor" : "backgroundColor"].string))
                        .accessibilityIdentifier("vshook.tp.notice")
                }.allowsHitTesting(false)
            }
        }
    }
    private var displayText: String {
        let text = model.notice.first("text", "message").string.uppercased()
        let emoji = settings["emoji"].string.isEmpty ? "⚠️" : settings["emoji"].string
        return settings["emojiEnabled"].bool ? "\(emoji) \(text) \(emoji)" : text
    }
}
