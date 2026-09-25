import SwiftUI

struct TPPreviewGrid: View {
    @ObservedObject var session: HookSession
    let slot: Int
    let settings: JSON
    var hideBorders = false
    private var blocks: [JSON] {
        let nested = session.snapshot["tp\(slot)"]
        let raw = session.snapshot["telepromptPreview"].exists ? session.snapshot["telepromptPreview"] : nested.first("previewOverlay", "preview")
        let all = raw.first("blocks", "previewBlocks").exists ? raw.first("blocks", "previewBlocks").array : session.snapshot["previewBlocks"].array
        let count = min(8, max(1, raw.first("pageSize", "limit").exists ? raw.first("pageSize", "limit").int : 8))
        let mode = raw.first("mode", "previewMode").exists ? raw.first("mode", "previewMode").int : session.snapshot["previewMode"].int
        let page = raw.first("pageIndex", "page").exists ? raw.first("pageIndex", "page").int : max(0, mode - 1)
        let start = all.count > count && page * count < all.count ? page * count : 0
        return Array(all.dropFirst(start).prefix(count))
    }
    var body: some View {
        GeometryReader { geometry in
            let layout = distribution(size: geometry.size)
            HStack(alignment: .top, spacing: 8) {
                ForEach(Array(layout.columns.enumerated()), id: \.offset) { _, column in
                    VStack(spacing: 8) {
                        ForEach(column, id: \.self) { index in
                            card(blocks[index], size: layout.font)
                        }
                    }.frame(maxWidth: .infinity, alignment: .top)
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top).padding(6)
            if blocks.isEmpty { Text("SEM BLOCOS NESTA PÁGINA").foregroundColor(.gray).frame(width: geometry.size.width, height: geometry.size.height) }
        }
    }
    private func distribution(size: CGSize) -> (columns: [[Int]], font: CGFloat) {
        var best: ([[Int]], CGFloat) = ([Array(blocks.indices)], 10)
        for count in 1...max(1, min(session.tablet ? 4 : 2, blocks.count)) {
            var columns = Array(repeating: [Int](), count: count), units = Array(repeating: 0.0, count: count)
            for index in blocks.indices {
                let shortest = units.indices.min(by: { units[$0] < units[$1] }) ?? 0
                columns[shortest].append(index); units[shortest] += Double(max(1, blocks[index].first("songs", "items").array.count)) + 1.35
            }
            let width = (size.width - CGFloat(count - 1) * 8 - 12) / CGFloat(count)
            let vertical = max(10, (size.height - CGFloat(columns.map(\.count).max() ?? 1) * 20) / (max(1, units.max() ?? 1) * 1.07))
            let font = min(vertical, max(10, width / 13)) * settings["previewScale"].double / 100
            if font >= best.1 { best = (columns, font) }
        }
        return (best.0, best.1)
    }
    private func card(_ block: JSON, size: CGFloat) -> some View {
        let rawColor = block.first("colorHex", "blockColorHex", "bridgeBlockColorHex", "textColorHex").string
        let color = Color(hex: rawColor.isEmpty ? "FDE047" : rawColor)
        let songs = block.first("songs", "items").array
        let whiten = (block["colorKey"].string == "green" && songs.contains { $0["playing"].bool }) || (block["colorKey"].string == "yellow" && songs.contains { $0["queued"].bool })
        return VStack(alignment: .leading, spacing: 3) {
            Text(display(block.name) + (settings["previewBlockDurationEnabled"].bool && block.songDuration > 0 ? " • " + directorTime(block.songDuration) : ""))
                .font(tpFont(settings["previewFontFamily"].string, size: size * 1.05)).foregroundColor(color).lineLimit(2)
            ForEach(Array(songs.enumerated()), id: \.offset) { _, song in
                Text(display(song.name) + (settings["previewSongDurationEnabled"].bool && song.songDuration > 0 ? " • " + directorTime(song.songDuration) : ""))
                    .font(tpFont(settings["previewFontFamily"].string, size: size)).foregroundColor(whiten && !song["playing"].bool && !song["queued"].bool ? .white : color)
                    .underline(settings["previewUnderlineEnabled"].bool).lineLimit(2)
            }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(6)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(hideBorders ? .clear : color.opacity(0.7)))
    }
    private func display(_ text: String) -> String { settings["textCase"].string == "original" ? text : settings["textCase"].string == "lowercase" ? text.lowercased() : text.uppercased() }
}
