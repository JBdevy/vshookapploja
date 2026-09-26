import SwiftUI
import UIKit

struct BronzeSkiaControl: View {
    enum Kind { case knob, fader }

    let kind: Kind
    @Binding var value: Double
    var accent: UIColor = UIColor(red: 0.80, green: 0.42, blue: 0.18, alpha: 1)
    var accessibilityLabel: String
    var displayValue: String? = nil
    var definition: BronzeProcessorParameter? = nil
    var body: some View {
        if kind == .knob {
            BronzeDial(value: $value, tint: Color(accent), label: accessibilityLabel, displayValue: displayValue, definition: definition)
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
    #if targetEnvironment(macCatalyst)
    private let fullRange = true
    #else
    @AppStorage("bronze.keyboardFullRange") private var fullRange = false
    #endif
    var midiNotes: Set<Int> = []
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
        view.midiNotes = midiNotes
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
    var lite = false { didSet { if oldValue != lite { setNeedsDisplay() } } }
    var midiNotes: Set<Int> = [] { didSet { if oldValue != midiNotes { setNeedsDisplay() } } }
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
            let held = !lite && ((noteTouchCounts[note] ?? 0) > 0 || midiNotes.contains(note))
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
            let held = !lite && ((noteTouchCounts[note] ?? 0) > 0 || midiNotes.contains(note))
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
                    if !spring {
                        LinearGradient(colors: [Color(bronzeHex: 0xe95b08), Color(bronzeHex: 0xffad45)], startPoint: .bottom, endPoint: .top)
                            .frame(height: geometry.size.height * min(1, max(0, value)))
                            .frame(maxHeight: .infinity, alignment: .bottom)
                            .clipShape(RoundedRectangle(cornerRadius: 5))
                            .allowsHitTesting(false)
                    }
                    VStack(spacing: 0) {
                        ForEach(0..<12) { _ in Rectangle().fill(.white.opacity(0.12)).frame(height: 1).frame(maxHeight: .infinity) }
                    }.padding(.horizontal, 5)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(LinearGradient(colors: [Color(white: 0.7), Color(white: 0.2), Color(white: 0.5)], startPoint: .top, endPoint: .bottom))
                        .overlay(Text(mark).font(.bronzeUI(13)).foregroundStyle(Color.bronzeLight))
                        .frame(maxWidth: .infinity).frame(height: thumb)
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
        #if targetEnvironment(macCatalyst)
        short.buttonMaskRequired = .primary
        view.addInteraction(UIContextMenuInteraction(delegate: context.coordinator))
        #else
        let long = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.hold(_:)))
        long.minimumPressDuration = 0.56
        long.allowableMovement = 10
        short.require(toFail: long)
        view.addGestureRecognizer(long)
        #endif
        view.addGestureRecognizer(short)
        view.isAccessibilityElement = false
        return view
    }
    func updateUIView(_ view: UIView, context: Context) {
        context.coordinator.parent = self
        view.isUserInteractionEnabled = enabled
    }
    final class Coordinator: NSObject, UIContextMenuInteractionDelegate {
        var parent: BronzeTapHoldSurface
        init(_ parent: BronzeTapHoldSurface) { self.parent = parent }
        @objc func tap() { if parent.enabled { parent.tap() } }
        func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
            guard parent.enabled else { return nil }
            // Catalyst routes secondary clicks through contextual interactions,
            // not through UITapGestureRecognizer's button mask.
            DispatchQueue.main.async { [weak self] in self?.parent.hold() }
            return nil
        }
        @objc func hold(_ gesture: UILongPressGestureRecognizer) {
            if parent.enabled && gesture.state == .began { parent.hold() }
        }
    }
}

#if targetEnvironment(macCatalyst)
/// Reserve desktop window space for the sidebar instead of applying the
/// phone/tablet's condensed transport and mixer layout.
struct BronzeMacSidebarWindow: UIViewRepresentable {
    let expanded: Bool
    final class WindowSizingView: UIView {
        var expanded = false { didSet { if oldValue != expanded { applySize() } } }
        override func didMoveToWindow() { super.didMoveToWindow(); applySize() }
        private func applySize() {
            window?.windowScene?.sizeRestrictions?.minimumSize = CGSize(width: expanded ? 1464 : 1024, height: 680)
        }
    }
    func makeUIView(context: Context) -> WindowSizingView {
        let view = WindowSizingView(); view.isUserInteractionEnabled = false; view.expanded = expanded; return view
    }
    func updateUIView(_ view: WindowSizingView, context: Context) { view.expanded = expanded }
}

#if DEBUG
/// Local smoke capture of this app's own window, without screen recording or
/// Accessibility permissions. Only enabled by an explicit test environment.
enum BronzeMacSmoke {
    static let navigate = Notification.Name("BronzeMacSmokeNavigate")
    static func start(window: UIWindow) {
        guard ProcessInfo.processInfo.environment["BRONZE_UI_TEST"] == "1",
              let directory = ProcessInfo.processInfo.environment["BRONZE_MAC_CAPTURE"] else { return }
        Task { @MainActor in
            do {
                try BronzeKeychain.write(Data("local-smoke".utf8), key: "mac-smoke")
                let restored = try BronzeKeychain.read("mac-smoke") == Data("local-smoke".utf8)
                BronzeKeychain.remove("mac-smoke")
                NSLog("[BronzeMacSmoke] keychain=%d", restored)
            } catch { NSLog("[BronzeMacSmoke] keychain error: %@", error.localizedDescription) }
            try? FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
            try? await Task.sleep(nanoseconds: 12_000_000_000)
            for scene in ["home", "sidebar", "home", "pads", "fxEditor", "home", "eq", "settings", "home", "preset", "home", "learn", "home"] {
                NotificationCenter.default.post(name: navigate, object: scene)
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
                    window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
                }
                try? image.pngData()?.write(to: URL(fileURLWithPath: directory).appendingPathComponent(scene + ".png"))
                NSLog("[BronzeMacSmoke] %@ %.0fx%.0f", scene, window.bounds.width, window.bounds.height)
            }
        }
    }
}
#endif

/// Only secondary mouse events land here. Primary dragging still reaches
/// the underlying knob, fader or button unchanged.
struct BronzeSecondaryClickSurface: UIViewRepresentable {
    @Environment(\.isEnabled) private var enabled
    let action: () -> Void
    final class Surface: UIView {
        override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
            event?.buttonMask.contains(.secondary) == true && super.point(inside: point, with: event)
        }
    }
    final class Coordinator: NSObject {
        var parent: BronzeSecondaryClickSurface
        init(_ parent: BronzeSecondaryClickSurface) { self.parent = parent }
        @objc func click() { if parent.enabled { parent.action() } }
    }
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> Surface {
        let view = Surface()
        let click = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.click))
        click.buttonMaskRequired = .secondary
        view.addGestureRecognizer(click)
        return view
    }
    func updateUIView(_ view: Surface, context: Context) { context.coordinator.parent = self }
}
#endif

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

// UIKit presents a transparent floating panel on iOS 15/16 as well as newer
// systems; SwiftUI's compact popover adaptation would turn it into a sheet.
struct BronzeKnobFocusPresenter: UIViewRepresentable {
    @Binding var isPresented: Bool
    @Binding var value: Double
    let label: String
    var displayValue: String?
    var definition: BronzeProcessorParameter?
    let step: Double
    let tint: Color
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> UIView {
        let view = UIView(); view.isUserInteractionEnabled = false
        return view
    }
    func updateUIView(_ view: UIView, context: Context) {
        let coordinator = context.coordinator
        coordinator.parent = self
        guard isPresented || coordinator.isVisible else { return }
        // Presentation and dismissal must happen after SwiftUI's update pass.
        DispatchQueue.main.async { [weak view, weak coordinator] in
            guard let view, let coordinator else { return }
            coordinator.state.synchronize(coordinator.parent)
            if coordinator.parent.isPresented { coordinator.show(from: view) }
            else { coordinator.hide() }
        }
    }
    static func dismantleUIView(_ view: UIView, coordinator: Coordinator) { coordinator.hide() }

    final class Coordinator {
        var parent: BronzeKnobFocusPresenter
        let state = BronzeKnobFocusState()
        private var controller: BronzeKnobFocusController?
        var isVisible: Bool { controller != nil }
        init(_ parent: BronzeKnobFocusPresenter) {
            self.parent = parent
            state.write = { [weak self] value in self?.parent.value = value }
            state.close = { [weak self] in
                self?.parent.isPresented = false
                self?.hide()
            }
        }
        func show(from source: UIView) {
            guard controller == nil, source.window != nil else { return }
            var responder: UIResponder? = source
            while responder != nil && !(responder is UIViewController) { responder = responder?.next }
            guard var presenter = responder as? UIViewController else { return }
            while let presented = presenter.presentedViewController { presenter = presented }
            guard !presenter.isBeingDismissed, !presenter.isBeingPresented else { return }
            let next = BronzeKnobFocusController(rootView: BronzeKnobFocusPanel(state: state))
            next.orientationMask = presenter.supportedInterfaceOrientations
            next.modalPresentationStyle = .overFullScreen
            next.modalTransitionStyle = .crossDissolve
            next.view.backgroundColor = .clear
            controller = next
            presenter.present(next, animated: false)
        }
        func hide() {
            guard let controller else { return }
            self.controller = nil
            controller.dismiss(animated: false)
        }
    }
}

final class BronzeKnobFocusController: UIHostingController<BronzeKnobFocusPanel> {
    var orientationMask: UIInterfaceOrientationMask = .landscape
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { orientationMask }
    override var prefersStatusBarHidden: Bool { true }
}

final class BronzeKnobFocusState: ObservableObject {
    @Published var value = 0.0
    @Published var text = ""
    var label = ""
    var tint = Color.bronzeLight
    var definition: BronzeProcessorParameter?
    var step = 0.01
    var write: (Double) -> Void = { _ in }
    var close: () -> Void = {}
    func synchronize(_ source: BronzeKnobFocusPresenter) {
        label = source.label; tint = source.tint; definition = source.definition; step = source.step
        if value != source.value { value = source.value }
        let next = source.displayValue ?? definition.map { $0.text($0.value(value)) } ?? "\(Int((value * 100).rounded()))%"
        if text != next { text = next }
    }
    func setValue(_ next: Double) {
        guard next.isFinite else { return }
        value = min(1, max(0, next))
        if let definition { text = definition.text(definition.value(value)) }
        write(value)
    }
    func adjust(_ direction: Int) {
        if let definition {
            setValue(definition.normalized(definition.stepped(definition.value(value), direction: direction)))
        } else {
            setValue(value + step * Double(direction))
        }
    }
}

struct BronzeKnobFocusPanel: View {
    @ObservedObject var state: BronzeKnobFocusState
    @State private var idle: Task<Void, Never>?
    @State private var slidingFrom: Double?
    @GestureState private var sliding = false
    var body: some View {
        ZStack {
            Color.black.opacity(0.001).ignoresSafeArea().onTapGesture { state.close() }
            VStack(spacing: 12) {
                Text(state.label).font(.bronzeUI(18)).foregroundStyle(.white).lineLimit(2)
                HStack(spacing: 14) {
                    VStack(spacing: 10) {
                        stepButton("+", direction: 1)
                        stepButton("−", direction: -1)
                    }
                    BronzeDialFace(value: state.value, tint: state.tint).frame(width: 118, height: 118).accessibilityHidden(true)
                    ZStack(alignment: .top) {
                        RoundedRectangle(cornerRadius: 3).fill(Color(bronzeHex: 0x0b0c10)).frame(width: 8)
                            .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color.gray.opacity(0.6)))
                        RoundedRectangle(cornerRadius: 3)
                            .fill(LinearGradient(colors: [Color(bronzeHex: 0x444b55), .black, Color(bronzeHex: 0x353b44)], startPoint: .top, endPoint: .bottom))
                            .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color.gray))
                            .shadow(color: state.tint.opacity(0.45), radius: 5)
                            .frame(width: 30, height: 20).offset(y: (1 - state.value) * 98)
                    }.frame(width: 34, height: 118).contentShape(Rectangle())
                        .gesture(DragGesture(minimumDistance: 0).updating($sliding) { _, active, _ in active = true }.onChanged { gesture in
                            if slidingFrom == nil { slidingFrom = state.value; editing(true) }
                            // Relative movement: touching the track never jumps the value.
                            state.setValue((slidingFrom ?? state.value) - gesture.translation.height / 98)
                        }.onEnded { _ in slidingFrom = nil; editing(false) })
                        .onChange(of: sliding) { active in if !active { slidingFrom = nil; editing(false) } }
                        .accessibilityElement().accessibilityLabel("Ajustar \(state.label)").accessibilityValue(state.text)
                        .accessibilityAdjustableAction { direction in state.adjust(direction == .increment ? 1 : -1); editing(false) }
                        .accessibilityIdentifier("bronze.knob.slider")
                }
                Text(state.text).font(.bronzeUI(16)).foregroundStyle(state.tint).monospacedDigit()
                    .accessibilityIdentifier("bronze.knob.value")
            }.padding(.horizontal, 28).padding(.top, 22).padding(.bottom, 18)
                .background(Color(bronzeHex: 0x0d0c10).opacity(0.96))
                .clipShape(RoundedRectangle(cornerRadius: 22))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(state.tint.opacity(0.8), lineWidth: 1.5))
                .shadow(color: .black.opacity(0.7), radius: 25, y: 16)
                .shadow(color: state.tint.opacity(0.22), radius: 15)
                .padding(12)
                .accessibilityIdentifier("bronze.knob.focus")
        }.preferredColorScheme(.dark)
            .onAppear { editing(false) }
            .onDisappear { idle?.cancel() }
    }
    private func stepButton(_ label: String, direction: Int) -> some View {
        BronzeKnobStepButton(label: label, tint: state.tint, editing: editing) { state.adjust(direction) }
            .accessibilityLabel("\(direction > 0 ? "Aumentar" : "Diminuir") \(state.label)")
    }
    private func editing(_ active: Bool) {
        idle?.cancel(); idle = nil
        guard !active else { return }
        idle = Task { @MainActor in
            do { try await Task.sleep(nanoseconds: 2_000_000_000) } catch { return }
            guard !Task.isCancelled else { return }
            state.close()
        }
    }
}

private struct BronzeKnobStepButton: View {
    let label: String
    let tint: Color
    let editing: (Bool) -> Void
    let action: () -> Void
    @State private var repeating: Task<Void, Never>?
    @State private var pressed = false
    @GestureState private var touching = false
    var body: some View {
        Text(label).font(.bronzeUI(22)).foregroundStyle(.white).frame(width: 34, height: 46)
            .background(LinearGradient(colors: [Color(bronzeHex: 0x343943), Color(bronzeHex: 0x121419)], startPoint: .top, endPoint: .bottom))
            .clipShape(RoundedRectangle(cornerRadius: 5))
            .overlay(RoundedRectangle(cornerRadius: 5).stroke(tint.opacity(0.7)))
            .brightness(pressed ? 0.2 : 0).contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).updating($touching) { _, active, _ in active = true }.onChanged { _ in
                guard !pressed else { return }
                pressed = true; editing(true); action()
                repeating = Task { @MainActor in
                    do {
                        try await Task.sleep(nanoseconds: 280_000_000)
                        while !Task.isCancelled {
                            action()
                            try await Task.sleep(nanoseconds: 60_000_000)
                        }
                    } catch {}
                }
            }.onEnded { _ in stop(); editing(false) })
            .onChange(of: touching) { active in if !active { stop(); editing(false) } }
            .onDisappear { stop() }
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { action(); editing(false) }
    }
    private func stop() { repeating?.cancel(); repeating = nil; pressed = false }
}

struct BronzeTransparentModalBackground: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView { ClearView() }
    func updateUIView(_ view: UIView, context: Context) {}
    private final class ClearView: UIView {
        override func didMoveToWindow() {
            super.didMoveToWindow()
            DispatchQueue.main.async { [weak self] in
                var responder: UIResponder? = self
                while let current = responder {
                    if let controller = current as? UIViewController {
                        controller.view.backgroundColor = .clear
                        break
                    }
                    responder = current.next
                }
            }
        }
    }
}

#if targetEnvironment(macCatalyst)
/// Listen on the window so SwiftUI labels/overlays cannot swallow the secondary
/// button. The marker restricts recognition to this transport's visible bounds.
struct BronzeTransportSecondaryClick: UIViewRepresentable {
    let action: () -> Void
    final class Marker: UIView, UIGestureRecognizerDelegate {
        var action: () -> Void = {}
        private weak var installedWindow: UIWindow?
        private lazy var click: UITapGestureRecognizer = {
            let value = UITapGestureRecognizer(target: self, action: #selector(secondaryClick))
            value.buttonMaskRequired = .secondary
            value.cancelsTouchesInView = false
            value.delegate = self
            return value
        }()
        override func didMoveToWindow() {
            super.didMoveToWindow()
            installedWindow?.removeGestureRecognizer(click)
            installedWindow = window
            window?.addGestureRecognizer(click)
        }
        func detach() { installedWindow?.removeGestureRecognizer(click); installedWindow = nil }
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            guard window != nil, !isHidden, alpha > 0,
                  window?.rootViewController?.presentedViewController == nil else { return false }
            return bounds.contains(touch.location(in: self))
        }
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool { true }
        @objc private func secondaryClick() { action() }
    }
    func makeUIView(context: Context) -> Marker {
        let view = Marker(); view.isUserInteractionEnabled = false; view.action = action; return view
    }
    func updateUIView(_ view: Marker, context: Context) { view.action = action }
    static func dismantleUIView(_ view: Marker, coordinator: ()) { view.detach() }
}
#endif
