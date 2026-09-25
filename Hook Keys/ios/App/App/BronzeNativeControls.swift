import SwiftUI
import UIKit

struct BronzeSkiaControl: View {
    enum Kind { case knob, fader }

    let kind: Kind
    @Binding var value: Double
    var accent: UIColor = UIColor(red: 0.80, green: 0.42, blue: 0.18, alpha: 1)
    var accessibilityLabel: String
    var body: some View {
        if kind == .knob {
            BronzeDial(value: $value, tint: Color(accent), label: accessibilityLabel)
        } else {
            BronzeSkiaNativeControl(kind: kind, value: $value, accent: accent, accessibilityLabel: accessibilityLabel)
        }
    }
}

struct BronzeSkiaNativeControl: UIViewRepresentable {
    typealias Kind = BronzeSkiaControl.Kind

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
        var parent: BronzeSkiaNativeControl

        init(_ parent: BronzeSkiaNativeControl) { self.parent = parent }

        func update(_ value: CGFloat) {
            parent.value = Double(value)
        }
    }
}

private struct BronzeConfigurationBordersKey: EnvironmentKey {
    static let defaultValue = false
}

private struct BronzeContentSizeKey: EnvironmentKey {
    static let defaultValue = CGSize(width: 1024, height: 720)
}

struct BronzeParameterDialSize: ViewModifier {
    @Environment(\.bronzeContentSize) private var contentSize
    var regular: CGFloat = 176
    var compact: CGFloat = 144

    func body(content: Content) -> some View {
        let side = min(regular, max(40, contentSize.height - 90), max(40, contentSize.width / 5 - 48))
        content.frame(width: side, height: side)
    }
}

extension EnvironmentValues {
    var bronzeContentSize: CGSize {
        get { self[BronzeContentSizeKey.self] }
        set { self[BronzeContentSizeKey.self] = newValue }
    }
    var bronzeConfigurationBorders: Bool {
        get { self[BronzeConfigurationBordersKey.self] }
        set { self[BronzeConfigurationBordersKey.self] = newValue }
    }
}

enum BronzeTheme {
    static var screenGradient: LinearGradient {
        LinearGradient(colors: [Color(bronzeHex: 0x303030), Color(bronzeHex: 0x242424), Color(bronzeHex: 0x181818)],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }
    static var panelGradient: LinearGradient {
        LinearGradient(colors: [Color(bronzeHex: 0x2b2b2b).opacity(0.92), Color(bronzeHex: 0x1c1c1c).opacity(0.94)],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// Fills the screen behind safe areas and rounded device corners without a frame.
struct BronzeScreenBackground: View {
    var body: some View {
        BronzeTheme.screenGradient.ignoresSafeArea().allowsHitTesting(false).accessibilityHidden(true)
    }
}

struct BronzePanel<Content: View>: View {
    @Environment(\.bronzeConfigurationBorders) private var configurationBorders
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(8)
            .background(BronzeTheme.panelGradient)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(configurationBorders ? Color.bronze.opacity(0.76) : .clear, lineWidth: 1))
    }
}

extension Color {
    static let bronze = Color(red: 0.80, green: 0.42, blue: 0.18)
    static let bronzeLight = Color(red: 0.94, green: 0.68, blue: 0.40)
    static let bronzeBackground = Color(bronzeHex: 0x242424)
}

/// Native full piano and the legacy compact C2...C5 layout (called "four" in the original app).
struct BronzePerformanceKeyboard: UIViewRepresentable {
    @AppStorage("bronze.keyboardStyle") private var keyboardStyle = 0
    @AppStorage("bronze.lite") private var lite = false
    @AppStorage("bronze.keyboardFullRange") private var fullRange = false
    let onNote: (_ note: Int, _ pressed: Bool, _ velocity: Int) -> Void

    func makeUIView(context: Context) -> BronzePerformanceKeyboardView {
        let view = BronzePerformanceKeyboardView(frame: .zero)
        view.onNote = onNote
        return view
    }

    func updateUIView(_ view: BronzePerformanceKeyboardView, context: Context) {
        view.onNote = onNote
        view.keyboardStyle = keyboardStyle
        view.lite = lite
        view.fullRange = fullRange
    }

    static func dismantleUIView(_ view: BronzePerformanceKeyboardView, coordinator: ()) {
        view.releaseAllNotes()
    }
}

final class BronzePerformanceKeyboardView: UIView {
    var fullRange = false {
        didSet {
            guard fullRange != oldValue else { return }
            releaseAllNotes()
            accessibilityLabel = fullRange ? "Teclado de 88 teclas" : "Teclado compacto, C2 a C5"
            rebuildKeyRects()
        }
    }
    var keyboardStyle = 0 { didSet { if oldValue != keyboardStyle { setNeedsDisplay() } } }
    var lite = false
    var onNote: ((_ note: Int, _ pressed: Bool, _ velocity: Int) -> Void)?

    private var firstNote: Int { fullRange ? 21 : 48 }
    private var lastNote: Int { fullRange ? 108 : 84 }
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
        accessibilityLabel = "Teclado compacto, C2 a C5"
        isAccessibilityElement = true
        accessibilityIdentifier = "bronze.performance.keyboard"
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
            let held = !lite && (noteTouchCounts[note] ?? 0) > 0
            let colors: [UIColor] = held ? [.init(red: 0.41, green: 0.97, blue: 0.59, alpha: 1), .init(red: 0.08, green: 0.65, blue: 0.29, alpha: 1)]
                : keyboardStyle == 0 ? [.init(white: 0.7, alpha: 1), .init(white: 0.98, alpha: 1), .init(white: 0.7, alpha: 1)]
                : [.init(white: 0.02, alpha: 1), .init(white: 0.16, alpha: 1), .init(white: 0.025, alpha: 1)]
            context.saveGState()
            context.clip(to: keyRect.insetBy(dx: 0.6, dy: 0.5))
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors.map(\.cgColor) as CFArray, locations: nil) {
                context.drawLinearGradient(gradient, start: CGPoint(x: keyRect.minX, y: 0), end: CGPoint(x: keyRect.maxX, y: 0), options: [])
            }
            context.restoreGState()
            context.setStrokeColor(UIColor.darkGray.cgColor)
            context.stroke(keyRect.insetBy(dx: 0.6, dy: 0.5), width: 1)
            if note % 12 == 0 || note == firstNote || note == lastNote {
                let pitch = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][note % 12]
                let name = "\(pitch)\(note / 12 - 2)" as NSString
                name.draw(
                    at: CGPoint(x: keyRect.minX + 3, y: keyRect.maxY - 17),
                    withAttributes: [
                        .font: UIFont.monospacedSystemFont(ofSize: 9, weight: .bold),
                        .foregroundColor: keyboardStyle == 0 ? UIColor.darkGray : UIColor.lightGray
                    ]
                )
            }
        }
        for note in blackRects.keys.sorted() {
            guard let keyRect = blackRects[note] else { continue }
            let held = !lite && (noteTouchCounts[note] ?? 0) > 0
            let path = UIBezierPath(
                roundedRect: keyRect.insetBy(dx: 0.5, dy: 0),
                byRoundingCorners: [.bottomLeft, .bottomRight],
                cornerRadii: CGSize(width: 2, height: 2)
            )
            (held
                ? UIColor(red: 0.34, green: 0.84, blue: 0.47, alpha: 1)
                : keyboardStyle == 1 ? UIColor(white: 0.9, alpha: 1)
                : keyboardStyle == 2 ? UIColor(red: 0.8, green: 0.5, blue: 0.2, alpha: 1)
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

struct BronzeKeyboardExpressionWheel: View {
    let title: String
    let mark: String
    @Binding var value: Double
    let spring: Bool
    var body: some View {
        VStack(spacing: 3) {
            Text(title).font(.bronzeUI(10)).foregroundStyle(.white)
            GeometryReader { geometry in
                let thumb = min(34.0, geometry.size.height * 0.3)
                let travel = max(1, geometry.size.height - thumb)
                ZStack(alignment: .top) {
                    RoundedRectangle(cornerRadius: 5).fill(LinearGradient(colors: [.black, Color(white: 0.22), .black], startPoint: .leading, endPoint: .trailing))
                    VStack(spacing: 0) {
                        ForEach(0..<12) { _ in Rectangle().fill(.white.opacity(0.12)).frame(height: 1).frame(maxHeight: .infinity) }
                    }.padding(.horizontal, 5)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(LinearGradient(colors: [Color(white: 0.7), Color(white: 0.2), Color(white: 0.5)], startPoint: .top, endPoint: .bottom))
                        .overlay(Text(mark).font(.bronzeUI(13)).foregroundStyle(Color.bronzeLight))
                        .frame(height: thumb).padding(.horizontal, 3)
                        .offset(y: (1 - value) * travel)
                }.contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 0).onChanged { gesture in
                        value = min(1, max(0, 1 - (gesture.location.y - thumb / 2) / travel))
                    }.onEnded { _ in if spring { value = 0.5 } })
            }
        }.frame(width: 44)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(spring ? "Pitch bend" : "Modulation")
            .accessibilityIdentifier(spring ? "bronze.keyboard.pitch" : "bronze.keyboard.modulation")
            .accessibilityValue(spring ? String(format: "%.0f%%", (value - 0.5) * 200) : String(Int((value * 127).rounded())))
            .accessibilityAdjustableAction { direction in value = min(1, max(0, value + (direction == .increment ? 0.05 : -0.05))) }
            .accessibilityAction(named: "Zerar") { value = spring ? 0.5 : 0 }
            .onDisappear { if spring { value = 0.5 } }
    }
}

// Measures intrinsically sized editor rows inside a bounded workspace. Most
// pages use the available dimensions directly; this also keeps advanced panels
// usable on the shortest supported landscape displays without vertical scroll.
private struct BronzeEditorHeight: PreferenceKey {
    static let defaultValue: CGFloat = 1
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}
struct BronzeFittedEditor<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @State private var measuredHeight: CGFloat = 1
    var body: some View {
        GeometryReader { geometry in
            let scale = min(1, geometry.size.height / max(1, measuredHeight))
            content().frame(width: geometry.size.width).fixedSize(horizontal: false, vertical: true)
                .background(GeometryReader { size in Color.clear.preference(key: BronzeEditorHeight.self, value: size.size.height) })
                .scaleEffect(scale, anchor: .top)
                .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
                .environment(\.bronzeContentSize, geometry.size)
        }.onPreferenceChange(BronzeEditorHeight.self) { measuredHeight = $0 }
    }
}

// A single UIKit recognizer pair owns taps and holds on iOS 15 and later.
// Releasing before the hold threshold fires the tap; a completed hold never taps.
struct BronzeTapHoldSurface: UIViewRepresentable {
    @Environment(\.isEnabled) private var enabled
    let tap: () -> Void
    let hold: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        let short = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tap))
        let long = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.hold(_:)))
        long.minimumPressDuration = 0.56
        long.allowableMovement = 10
        short.require(toFail: long)
        view.addGestureRecognizer(short)
        view.addGestureRecognizer(long)
        view.isAccessibilityElement = false
        return view
    }
    func updateUIView(_ view: UIView, context: Context) {
        context.coordinator.parent = self
        view.isUserInteractionEnabled = enabled
    }
    final class Coordinator: NSObject {
        var parent: BronzeTapHoldSurface
        init(_ parent: BronzeTapHoldSurface) { self.parent = parent }
        @objc func tap() { if parent.enabled { parent.tap() } }
        @objc func hold(_ gesture: UILongPressGestureRecognizer) {
            if parent.enabled && gesture.state == .began { parent.hold() }
        }
    }
}

extension View {
    func bronzeTapHold(tap: @escaping () -> Void, hold: @escaping () -> Void) -> some View {
        self.allowsHitTesting(false)
            .overlay(BronzeTapHoldSurface(tap: tap, hold: hold).accessibilityHidden(true))
            .accessibilityElement(children: .combine)
            .accessibilityAction { tap() }
    }
}

// Keep the menu instance stable while meters publish updates. Replacing an open
// menu resets its scroll offset on older iOS releases.
struct BronzeStableMenu: UIViewRepresentable {
    @Environment(\.isEnabled) private var enabled
    let title: String
    let choices: [String]
    let selected: Int
    let select: (Int) -> Void
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> UIButton {
        let button = UIButton(type: .system)
        button.showsMenuAsPrimaryAction = true
        button.backgroundColor = UIColor(white: 0.17, alpha: 1)
        button.layer.cornerRadius = 6
        button.titleLabel?.font = UIFont(name: "JetBrainsMono-ExtraBold", size: 12) ?? .boldSystemFont(ofSize: 12)
        button.titleLabel?.adjustsFontSizeToFitWidth = true
        button.tintColor = .white
        return button
    }
    func updateUIView(_ view: UIButton, context: Context) {
        let coordinator = context.coordinator
        coordinator.select = select
        view.isEnabled = enabled
        if view.title(for: .normal) != title { view.setTitle(title, for: .normal) }
        guard coordinator.choices != choices || coordinator.selected != selected else { return }
        coordinator.choices = choices; coordinator.selected = selected
        let snapshot = choices
        view.menu = UIMenu(children: choices.enumerated().map { index, label in
            UIAction(title: label, state: index == selected ? .on : .off) { [weak coordinator] _ in
                guard let coordinator, coordinator.choices == snapshot else { return }
                coordinator.select(index)
            }
        })
    }
    final class Coordinator {
        var choices: [String] = []
        var selected = -2
        var select: (Int) -> Void = { _ in }
    }
}
