import SwiftUI
import UIKit

struct BronzeSkiaControl: UIViewRepresentable {
    enum Kind { case knob, fader }

    let kind: Kind
    @Binding var value: Double
    var accent: UIColor = UIColor(red: 0.80, green: 0.42, blue: 0.18, alpha: 1)
    var accessibilityLabel: String

    func makeUIView(context: Context) -> BronzeSkiaControlView {
        let view = BronzeSkiaControlView(frame: .zero)
        view.controlKind = kind == .knob ? .knob : .fader
        view.accentColor = accent
        view.accessibilityLabel = accessibilityLabel
        view.onValueChanged = { normalizedValue in
            context.coordinator.update(normalizedValue)
        }
        return view
    }

    func updateUIView(_ view: BronzeSkiaControlView, context: Context) {
        context.coordinator.parent = self
        view.controlKind = kind == .knob ? .knob : .fader
        view.accentColor = accent
        view.accessibilityLabel = accessibilityLabel
        view.normalizedValue = value
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator {
        var parent: BronzeSkiaControl

        init(_ parent: BronzeSkiaControl) { self.parent = parent }

        func update(_ value: CGFloat) {
            parent.value = Double(value)
        }
    }
}

struct BronzePanel<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(8)
            .background(Color(red: 0.075, green: 0.065, blue: 0.085))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.bronze.opacity(0.76), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

extension Color {
    static let bronze = Color(red: 0.80, green: 0.42, blue: 0.18)
    static let bronzeLight = Color(red: 0.94, green: 0.68, blue: 0.40)
    static let bronzeBackground = Color(red: 0.025, green: 0.022, blue: 0.030)
}

/// Teclado de quatro oitavas (C2...C5) com multitouch e glissando nativos.
struct BronzePerformanceKeyboard: UIViewRepresentable {
    let onNote: (_ note: Int, _ pressed: Bool, _ velocity: Int) -> Void

    func makeUIView(context: Context) -> BronzePerformanceKeyboardView {
        let view = BronzePerformanceKeyboardView(frame: .zero)
        view.onNote = onNote
        return view
    }

    func updateUIView(_ view: BronzePerformanceKeyboardView, context: Context) {
        view.onNote = onNote
    }

    static func dismantleUIView(_ view: BronzePerformanceKeyboardView, coordinator: ()) {
        view.releaseAllNotes()
    }
}

final class BronzePerformanceKeyboardView: UIView {
    var onNote: ((_ note: Int, _ pressed: Bool, _ velocity: Int) -> Void)?

    private let firstNote = 48
    private let lastNote = 84
    private let blackOffsets: Set<Int> = [1, 3, 6, 8, 10]
    private var whiteRects: [Int: CGRect] = [:]
    private var blackRects: [Int: CGRect] = [:]
    private var touchNotes: [ObjectIdentifier: Int] = [:]
    private var noteTouchCounts: [Int: Int] = [:]

    override init(frame: CGRect) {
        super.init(frame: frame)
        isMultipleTouchEnabled = true
        isExclusiveTouch = false
        backgroundColor = .clear
        contentMode = .redraw
        accessibilityLabel = "Teclado de performance, C2 a C5"
    }

    required init?(coder: NSCoder) {
        fatalError("BronzePerformanceKeyboardView não usa storyboard")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        rebuildKeyRects()
    }

    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext() else { return }
        context.setAllowsAntialiasing(true)
        for note in whiteRects.keys.sorted() {
            guard let keyRect = whiteRects[note] else { continue }
            let held = (noteTouchCounts[note] ?? 0) > 0
            context.setFillColor((held
                ? UIColor(red: 0.93, green: 0.62, blue: 0.31, alpha: 1)
                : UIColor(white: 0.92, alpha: 1)).cgColor)
            context.fill(keyRect.insetBy(dx: 0.6, dy: 0.5))
            context.setStrokeColor(UIColor(red: 0.34, green: 0.19, blue: 0.11, alpha: 1).cgColor)
            context.stroke(keyRect.insetBy(dx: 0.6, dy: 0.5), width: 1)
            if note % 12 == 0 || note == firstNote || note == lastNote {
                let name = "C\(note / 12 - 2)" as NSString
                name.draw(
                    at: CGPoint(x: keyRect.minX + 3, y: keyRect.maxY - 17),
                    withAttributes: [
                        .font: UIFont.monospacedSystemFont(ofSize: 9, weight: .bold),
                        .foregroundColor: UIColor.black
                    ]
                )
            }
        }
        for note in blackRects.keys.sorted() {
            guard let keyRect = blackRects[note] else { continue }
            let held = (noteTouchCounts[note] ?? 0) > 0
            let path = UIBezierPath(
                roundedRect: keyRect.insetBy(dx: 0.5, dy: 0),
                byRoundingCorners: [.bottomLeft, .bottomRight],
                cornerRadii: CGSize(width: 2, height: 2)
            )
            (held
                ? UIColor(red: 0.34, green: 0.84, blue: 0.47, alpha: 1)
                : UIColor(white: 0.045, alpha: 1)).setFill()
            path.fill()
            UIColor(red: 0.78, green: 0.41, blue: 0.18, alpha: 0.9).setStroke()
            path.lineWidth = 0.8
            path.stroke()
        }
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) { update(touches) }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) { update(touches) }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { end(touches) }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { end(touches) }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { releaseAllNotes() }
    }

    func releaseAllNotes() {
        let sounding = noteTouchCounts.filter { $0.value > 0 }.map(\.key)
        touchNotes.removeAll()
        noteTouchCounts.removeAll()
        for note in sounding { onNote?(note, false, 0) }
        setNeedsDisplay()
    }

    private func update(_ touches: Set<UITouch>) {
        for touch in touches {
            let identifier = ObjectIdentifier(touch)
            let point = touch.location(in: self)
            let next = note(at: point)
            let previous = touchNotes[identifier]
            guard next != previous else { continue }
            if let previous { release(previous) }
            if let next {
                touchNotes[identifier] = next
                press(next, velocity: velocity(for: next, point: point))
            } else {
                touchNotes.removeValue(forKey: identifier)
            }
        }
        setNeedsDisplay()
    }

    private func end(_ touches: Set<UITouch>) {
        for touch in touches {
            let identifier = ObjectIdentifier(touch)
            if let note = touchNotes.removeValue(forKey: identifier) { release(note) }
        }
        setNeedsDisplay()
    }

    private func press(_ note: Int, velocity: Int) {
        let count = noteTouchCounts[note, default: 0]
        noteTouchCounts[note] = count + 1
        if count == 0 { onNote?(note, true, velocity) }
    }

    private func release(_ note: Int) {
        let count = max(0, (noteTouchCounts[note] ?? 0) - 1)
        noteTouchCounts[note] = count
        if count == 0 { onNote?(note, false, 0) }
    }

    private func note(at point: CGPoint) -> Int? {
        guard bounds.contains(point) else { return nil }
        if let match = blackRects.first(where: { $0.value.contains(point) }) { return match.key }
        return whiteRects.first(where: { $0.value.contains(point) })?.key
    }

    private func velocity(for note: Int, point: CGPoint) -> Int {
        let keyRect = blackRects[note] ?? whiteRects[note] ?? bounds
        let ratio = min(1, max(0, (point.y - keyRect.minY) / max(1, keyRect.height)))
        return min(127, max(1, Int((1 + ratio * 126).rounded())))
    }

    private func rebuildKeyRects() {
        whiteRects.removeAll(keepingCapacity: true)
        blackRects.removeAll(keepingCapacity: true)
        let whiteCount = (firstNote...lastNote).filter { !blackOffsets.contains($0 % 12) }.count
        let whiteWidth = bounds.width / CGFloat(max(1, whiteCount))
        let blackWidth = whiteWidth * 0.62
        let blackHeight = bounds.height * 0.62
        var whiteIndex = 0
        for note in firstNote...lastNote {
            if blackOffsets.contains(note % 12) {
                blackRects[note] = CGRect(
                    x: CGFloat(whiteIndex) * whiteWidth - blackWidth / 2,
                    y: 0,
                    width: blackWidth,
                    height: blackHeight
                )
            } else {
                whiteRects[note] = CGRect(
                    x: CGFloat(whiteIndex) * whiteWidth,
                    y: 0,
                    width: whiteWidth,
                    height: bounds.height
                )
                whiteIndex += 1
            }
        }
        setNeedsDisplay()
    }
}
