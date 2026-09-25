import SwiftUI
import UIKit

struct TCPRegionHeader: View {
    let regions: [JSON]
    let range: TCPRange
    let focused: Bool
    var body: some View {
        Canvas { context, size in
            guard focused else { return }
            for item in regions where !item.isSongBlock {
                guard let span = range.span(item) else { continue }
                let color = Color(hex: item["color"].string.hasPrefix("#") ? item["color"].string : item.isFamilyChild ? "A16207" : "7E22CE")
                let rect = CGRect(x: span.left * size.width, y: item.isFamilyChild ? 19 : 1, width: max(1, span.width * size.width), height: 16)
                var local = context; local.clip(to: Path(rect))
                local.fill(Path(rect), with: .color(color))
                local.stroke(Path(rect), with: .color(.white.opacity(0.3)), lineWidth: 1)
                local.draw(Text(item.name.uppercased()).font(.custom("Arial-BoldMT", size: 8)).foregroundColor(.white), at: CGPoint(x: rect.minX + 3, y: rect.midY), anchor: .leading)
            }
        }.background(Color(hex: "070A0F"))
    }
}
struct TCPGridRow: View {
    let track: JSON
    let items: [JSON]
    let regions: [JSON]
    let range: TCPRange
    let focused: Bool
    let shadow: Bool
    let cursor: Double?
    let onSeek: (Double) -> Void
    let onItem: (JSON) -> Void
    let canPan: Bool
    let onPan: (Double, Bool) -> Void
    var body: some View {
        GeometryReader { geometry in
            Canvas { context, size in
                guard focused else { return }
                for item in items {
                    guard let span = range.span(item) else { continue }
                    let rect = CGRect(x: span.left * size.width, y: 0, width: max(1, span.width * size.width), height: 72)
                    var local = context; local.clip(to: Path(roundedRect: rect, cornerRadius: 2))
                    let muted = item.first("mute", "muted").bool
                    let color = UIColor(Color(hex: TCPAppearance.trackColor(track)))
                    if !shadow {
                        local.fill(Path(rect), with: .color(muted ? Color(hex: "050505") : mix(color, with: "111827", amount: 0.22)))
                        let header = CGRect(x: rect.minX, y: 0, width: rect.width, height: 13)
                        local.fill(Path(header), with: .color(muted ? Color(hex: "050505") : mix(color, with: "020617", amount: 0.22)))
                        local.fill(Path(CGRect(x: rect.minX, y: 12, width: rect.width, height: 1)), with: .color(.white.opacity(0.5)))
                        let name = item.name.isEmpty ? track.name : item.name
                        drawLabel(name.uppercased(), in: CGRect(x: rect.minX + 3, y: 1, width: max(0, rect.width - (muted ? 38 : 6)), height: 11), color: Color(hex: muted ? "EF4444" : "050505"), context: &local)
                        if muted {
                            let badge = CGRect(x: rect.maxX - 32, y: 1.5, width: 29, height: 10)
                            local.fill(Path(roundedRect: badge, cornerRadius: 2), with: .color(Color(hex: "DC2626")))
                            local.stroke(Path(roundedRect: badge.insetBy(dx: 0.5, dy: 0.5), cornerRadius: 2), with: .color(Color(hex: "F87171")), lineWidth: 1)
                            local.draw(Text("MUTE").font(.custom("Arial-BoldMT", size: 7)).foregroundColor(.white), at: CGPoint(x: badge.midX, y: badge.midY))
                        }
                        local.stroke(Path(roundedRect: rect.insetBy(dx: 0.5, dy: 0.5), cornerRadius: 2), with: .color(muted ? Color(hex: "374151") : mix(color, with: "FFFFFF", amount: 0.28)), lineWidth: 1)
                    }
                    // The current Director uses this same deterministic 12-bar
                    // representation when the bridge doesn't publish audio peaks.
                    let key = item.first("itemId", "id", "guid").string + "|" + item.name
                    var seed: UInt32 = 17
                    for code in key.utf16 { seed = seed &* 31 &+ UInt32(code) }
                    let scale = TCPAppearance.waveScale(item)
                    let waveRect = shadow ? CGRect(x: rect.minX, y: 4, width: rect.width, height: 63) : CGRect(x: rect.minX + 4, y: 16, width: max(0, rect.width - 8), height: 53)
                    local.clip(to: Path(waveRect))
                    let barWidth = max(1, (waveRect.width - 11) / 12)
                    for index in 0..<12 {
                        let amount = Double(18 + (UInt64(seed) + UInt64(index * 37 + (index % 5) * 19)) % 76) / 100
                        let baseHeight = amount * waveRect.height
                        let height = baseHeight * scale
                        let bar = CGRect(x: waveRect.minX + CGFloat(index) * (barWidth + 1), y: waveRect.midY - height / 2, width: barWidth, height: height)
                        let radius = min(barWidth, baseHeight) / 2
                        let path = Path(roundedRect: bar, cornerSize: CGSize(width: radius, height: radius * scale))
                        local.fill(path, with: .color(Color(hex: shadow ? "737B86" : "6B7280").opacity(shadow ? 0.468 : 0.9)))
                    }
                }
                for region in regions where !region.isSongBlock {
                    guard let span = range.span(region) else { continue }
                    let color = Color(hex: region.isFamilyChild ? "FACC15" : "D946EF")
                    var line = Path()
                    for x in [span.left * size.width, (span.left + span.width) * size.width] {
                        line.move(to: CGPoint(x: x, y: 0)); line.addLine(to: CGPoint(x: x, y: size.height))
                    }
                    context.stroke(line, with: .color(color.opacity(region.isFamilyChild ? 0.62 : 0.88)), lineWidth: 1)
                }
                if let cursor, cursor >= range.start && cursor <= range.end {
                    let x = (cursor - range.start) / range.duration * size.width
                    context.fill(Path(CGRect(x: x, y: 0, width: 2, height: size.height)), with: .color(Color(hex: "A3E635")))
                }
            }
            TCPTouchSurface(tap: { point in onSeek(point.x / max(1, geometry.size.width)) }, open: { point in
                let time = range.start + range.duration * point.x / max(1, geometry.size.width)
                if !shadow, let item = items.last(where: { $0.first("startPos", "start_pos").double <= time && $0.first("endPos", "end_pos").double > time }) { onItem(item) }
            }, canPan: canPan, pan: { translation, ended in onPan(translation / max(1, geometry.size.width), ended) })
        }.background(Color(hex: "11151B")).clipped()
            .overlay(alignment: .bottom) { Color(hex: "7C3AED").frame(height: 1) }
            .accessibilityElement().accessibilityLabel("Linha do tempo de " + track.name)
    }
    private func mix(_ color: UIColor, with hex: String, amount: Double) -> Color {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        UIColor(Color(hex: hex)).getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        return Color(red: r * (1 - amount) + r2 * amount, green: g * (1 - amount) + g2 * amount, blue: b * (1 - amount) + b2 * amount)
    }
    private func drawLabel(_ text: String, in rect: CGRect, color: Color, context: inout GraphicsContext) {
        guard rect.width > 0 else { return }
        let font = UIFont(name: "Arial-BoldMT", size: 8) ?? .boldSystemFont(ofSize: 8)
        var label = text
        if (label as NSString).size(withAttributes: [.font: font]).width > rect.width {
            while !label.isEmpty && ((label + "…") as NSString).size(withAttributes: [.font: font]).width > rect.width { label.removeLast() }
            label += "…"
        }
        var clipped = context; clipped.clip(to: Path(rect))
        clipped.draw(Text(label).font(.custom("Arial-BoldMT", size: 8)).foregroundColor(color), at: CGPoint(x: rect.minX, y: rect.midY), anchor: .leading)
    }
}
private struct TCPTouchSurface: UIViewRepresentable {
    var tap: (CGPoint) -> Void
    var open: (CGPoint) -> Void
    var canPan: Bool
    var pan: (CGFloat, Bool) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> UIView {
        let view = UIView(); view.backgroundColor = .clear
        let single = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.single(_:)))
        let double = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.double(_:))); double.numberOfTapsRequired = 2
        single.require(toFail: double)
        let hold = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.hold(_:)))
        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.drag(_:)))
        pan.maximumNumberOfTouches = 1; pan.delegate = context.coordinator
        single.require(toFail: pan); hold.require(toFail: pan)
        view.addGestureRecognizer(pan)
        view.addGestureRecognizer(single); view.addGestureRecognizer(double); view.addGestureRecognizer(hold)
        return view
    }
    func updateUIView(_ view: UIView, context: Context) { context.coordinator.parent = self }
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var parent: TCPTouchSurface
        init(_ parent: TCPTouchSurface) { self.parent = parent }
        @objc func single(_ gesture: UITapGestureRecognizer) { parent.tap(gesture.location(in: gesture.view)) }
        @objc func double(_ gesture: UITapGestureRecognizer) { parent.open(gesture.location(in: gesture.view)) }
        @objc func hold(_ gesture: UILongPressGestureRecognizer) { if gesture.state == .began { parent.open(gesture.location(in: gesture.view)) } }
        @objc func drag(_ gesture: UIPanGestureRecognizer) {
            parent.pan(gesture.translation(in: gesture.view).x, [.ended, .cancelled, .failed].contains(gesture.state))
        }
        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return true }
            let velocity = pan.velocity(in: pan.view)
            return parent.canPan && abs(velocity.x) > abs(velocity.y)
        }
    }
}
