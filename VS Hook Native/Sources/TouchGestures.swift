import SwiftUI
import UIKit

// A high-priority SwiftUI LongPressGesture on a Button can swallow its short
// tap on iOS 16. UIKit keeps the release-inside action and cancels it only once
// the hold actually recognizes. This surface stays mounted across polling,
// PLAY/STOP and the audio-fade timeline's visual updates.
struct TransportButtonTouchSurface: UIViewRepresentable {
    @Environment(\.isEnabled) private var enabled
    let title: String
    let tap: () -> Void
    let hold: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> UIButton {
        let button = UIButton(type: .custom)
        button.backgroundColor = .clear
        button.accessibilityIdentifier = "vshook.transport.play"
        button.addTarget(context.coordinator, action: #selector(Coordinator.tap(_:event:)), for: .touchUpInside)
        let gesture = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.hold(_:)))
        gesture.minimumPressDuration = 0.5
        gesture.allowableMovement = 10
        gesture.cancelsTouchesInView = true
        button.addGestureRecognizer(gesture)
        button.accessibilityCustomActions = [UIAccessibilityCustomAction(name: "Opções do Play", target: context.coordinator, selector: #selector(Coordinator.openOptions))]
        return button
    }
    func updateUIView(_ button: UIButton, context: Context) {
        context.coordinator.parent = self
        button.isEnabled = enabled
        button.accessibilityLabel = title
        for gesture in button.gestureRecognizers ?? [] where gesture.isEnabled != enabled {
            gesture.isEnabled = enabled
        }
    }
    final class Coordinator: NSObject {
        var parent: TransportButtonTouchSurface
        init(_ parent: TransportButtonTouchSurface) { self.parent = parent }
        @objc func tap(_ button: UIButton, event: UIEvent?) {
            guard button.isEnabled, parent.enabled else { return }
            // UIButton accepts a release slightly beyond its visual bounds.
            // Transport must not fire after dragging off the control. An
            // accessibility/keyboard activation has no touch and stays valid.
            if let touch = event?.allTouches?.first,
               !button.bounds.contains(touch.location(in: button)) { return }
            parent.tap()
        }
        @objc func hold(_ gesture: UILongPressGestureRecognizer) {
            guard gesture.state == .began, parent.enabled else { return }
            parent.hold()
        }
        @objc func openOptions() -> Bool {
            guard parent.enabled else { return false }
            parent.hold()
            return true
        }
    }
}

// UIKit arbitrates tap/hold against the containing UIScrollView on iOS 15/16.
// No drag recognizer sits over the song list: a vertical drag stays with the list.
struct SongRowTouchSurface: UIViewRepresentable {
    let familyControl: Bool
    let timeWidth: CGFloat
    let inlineWidth: CGFloat
    let tap: () -> Void
    let hold: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> Surface {
        let view = Surface()
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tap))
        let hold = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.hold(_:)))
        hold.minimumPressDuration = 0.5
        hold.allowableMovement = 10
        tap.require(toFail: hold)
        view.addGestureRecognizer(tap)
        view.addGestureRecognizer(hold)
        return view
    }
    func updateUIView(_ view: Surface, context: Context) {
        context.coordinator.parent = self
        view.familyControl = familyControl
        view.timeWidth = timeWidth
        view.inlineWidth = inlineWidth
    }
    final class Surface: UIView {
        var familyControl = false
        var timeWidth: CGFloat = 0
        var inlineWidth: CGFloat = 0
        override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
            // Let the actual Mostrar/Ocultar button receive its own touch.
            let control = CGRect(x: bounds.width - 10 - inlineWidth - timeWidth - 8 - 64, y: 0, width: 64, height: bounds.height)
            return !(familyControl && control.contains(point)) && !(inlineWidth > 0 && point.x > bounds.width - inlineWidth - 10) && super.point(inside: point, with: event)
        }
    }
    final class Coordinator: NSObject {
        var parent: SongRowTouchSurface
        init(_ parent: SongRowTouchSurface) { self.parent = parent }
        @objc func tap() { parent.tap() }
        @objc func hold(_ gesture: UILongPressGestureRecognizer) {
            if gesture.state == .began { parent.hold() }
        }
    }
}
