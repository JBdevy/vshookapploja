import SwiftUI

struct DirectorGridPanel: View {
    @ObservedObject var session: HookSession
    @State private var position: Double?
    private var song: JSON {
        let chosen = session.song(withID: session.selectedID)
        return chosen.exists ? chosen : session.tcpFocus
    }
    private var start: Double { song.first("startPos", "start_pos").double }
    private var end: Double { max(start + 0.001, song.first("endPos", "end_pos").double) }
    private var current: Double { min(end, max(start, position ?? (session.playing ? session.snapshot.first("playPosition", "position").double : session.snapshot.first("editCursorPosition", "playPosition", "position").double))) }
    var body: some View {
        VStack(spacing: 3) {
            VStack(spacing: 0) {
                Text(song.exists ? song.name.uppercased() : "SEM MÚSICA SELECIONADA").font(.custom("Arial-BoldMT", size: 9)).lineLimit(1).padding(.horizontal, 7).frame(maxWidth: .infinity, alignment: .leading).frame(height: 18).background(Color(hex: song.exists ? "6D28D9" : "374151"))
                GeometryReader { geometry in
                    Canvas { context, size in
                        for x in stride(from: 0.0, to: size.width, by: 22) { context.fill(Path(CGRect(x: x, y: 0, width: 1, height: size.height)), with: .color(.white.opacity(0.06))) }
                        for y in stride(from: 0.0, to: size.height, by: 22) { context.fill(Path(CGRect(x: 0, y: y, width: size.width, height: 1)), with: .color(.white.opacity(0.05))) }
                        let bars = waveBars
                        let width = max(1, (size.width - 20 - Double(bars.count - 1) * 2) / Double(bars.count))
                        for (index, amount) in bars.enumerated() {
                            let height = amount * (size.height - 13)
                            let bar = CGRect(x: 10 + Double(index) * (width + 2), y: (size.height - height) / 2, width: width, height: height)
                            context.fill(Path(roundedRect: bar, cornerRadius: width / 2), with: .linearGradient(Gradient(colors: [Color(hex: "CBD5E1"), Color(hex: "64748B")]), startPoint: CGPoint(x: 0,y: bar.minY), endPoint: CGPoint(x: 0,y: bar.maxY)))
                        }
                        for marker in session.snapshot["markers"].array {
                            let value = marker.first("pos", "position", "startPos").double
                            guard song.exists, value > start, value < end, marker.name.hasPrefix("$") || marker.name.hasPrefix("*") else { continue }
                            let x = (value - start) / (end - start) * size.width
                            let loop = marker.name.hasPrefix("*")
                            let color = Color(hex: loop ? "EF4444" : "06B6D4")
                            context.fill(Path(CGRect(x: x, y: 5, width: loop ? 2 : 1, height: size.height - 10)), with: .color(color))
                            context.draw(Text(loop ? "LOOP" : "$").font(.custom("Arial-BoldMT", size: 7)).foregroundColor(color), at: CGPoint(x: x,y: 5), anchor: .top)
                        }
                        let x = (current - start) / (end - start) * size.width
                        context.fill(Path(CGRect(x: x,y: 8,width: 2,height: size.height - 16)), with: .color(Color(hex: "14B8A6")))
                        context.fill(Path(ellipseIn: CGRect(x: x - 5,y: 4,width: 10,height: 10)), with: .color(Color(hex: "14B8A6")))
                    }.contentShape(Rectangle()).gesture(DragGesture(minimumDistance: 0).onChanged { value in
                        guard song.exists, !session.playing else { return }
                        position = start + min(1, max(0, value.location.x / max(1, geometry.size.width))) * (end - start)
                    }.onEnded { _ in
                        guard song.exists, !session.playing, let position else { return }
                        session.command("edit_cursor_move", session.targetPayload(song).merging(["position": .number(position), "targetPosition": .number(position), "noPlay": true, "preservePlayback": true]))
                    }).accessibilityLabel("Mover cursor dentro da música")
                }.frame(height: session.tablet ? 52 : 126).background(LinearGradient(colors: [Color(hex: "1B1F2A"), Color(hex: "0F172A")], startPoint: .top, endPoint: .bottom))
            }.cornerRadius(6).overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "7C3AED")))
            HStack { Text("CURSOR " + directorTime(song.exists ? current - start : 0)); Spacer(); Text("TOTAL " + directorTime(song.songDuration)) }.font(.custom("Arial-BoldMT", size: 9)).foregroundColor(Color(hex: "FACC15"))
        }.padding(4).background(Color(hex: "0B1220")).cornerRadius(6).overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "7C3AED")))
            .onChange(of: song.identifier) { _ in position = nil }
            .onChange(of: session.snapshot["playPosition"]) { _ in if session.playing { position = nil } }
            .accessibilityIdentifier("vshook.grid.panel")
    }
    private var waveBars: [Double] {
        if !song.exists { return [34,52,41,68,47,59,38,63,45,55,36,66,43,58,39,62,46,54,35,64,42,57,40,60].map { Double($0) / 100 } }
        let key = song.identifier + "|" + song.name + "|" + song.first("startPos", "start_pos").string + "|" + song.first("endPos", "end_pos").string
        var seed = UInt32(bridgePasswordHash(key), radix: 16) ?? 17
        return (0..<56).map { index in
            seed = seed &* 1664525 &+ 1013904223
            let random = Double((seed >> 8) & 0xFFFF) / 65535
            let shape = 0.42 + 0.38 * sin(Double(index) / 55 * .pi)
            return max(12, min(92, ((random * 0.6 + shape * 0.4) * 100).rounded())) / 100
        }
    }
}
