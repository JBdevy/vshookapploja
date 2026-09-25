import SwiftUI
import UIKit

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

// Observe a message's horizontal gesture without covering its audio slider,
// image buttons or text selection with another hit-testing view.
struct MessageSwipeObserver: UIViewRepresentable {
    let changed: (CGFloat) -> Void
    let ended: (CGFloat) -> Void
    func makeUIView(context: Context) -> Observer { Observer() }
    func updateUIView(_ view: Observer, context: Context) { view.changed = changed; view.ended = ended }
    static func dismantleUIView(_ view: Observer, coordinator: ()) { view.detach() }
    final class Observer: UIView, UIGestureRecognizerDelegate {
        var changed: (CGFloat) -> Void = { _ in }
        var ended: (CGFloat) -> Void = { _ in }
        private lazy var pan = UIPanGestureRecognizer(target: self, action: #selector(drag(_:)))
        override func didMoveToWindow() {
            super.didMoveToWindow()
            detach()
            guard let window else { return }
            isUserInteractionEnabled = false
            pan.maximumNumberOfTouches = 1
            pan.delegate = self
            window.addGestureRecognizer(pan)
        }
        func detach() { pan.view?.removeGestureRecognizer(pan) }
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            guard window != nil, bounds.contains(touch.location(in: self)), !isHidden else { return false }
            var ancestor = superview
            while let view = ancestor {
                if view.isHidden || view.alpha == 0 { return false }
                if view.clipsToBounds && !view.bounds.contains(touch.location(in: view)) { return false }
                ancestor = view.superview
            }
            var touched: UIView? = touch.view
            while let view = touched {
                if view is UIControl { return false }
                touched = view.superview
            }
            return true
        }
        override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            let velocity = pan.velocity(in: self)
            return velocity.x > 0 && abs(velocity.x) > abs(velocity.y) * 1.3
        }
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            other is UIPanGestureRecognizer && other.view is UIScrollView
        }
        @objc private func drag(_ gesture: UIPanGestureRecognizer) {
            let distance = max(0, gesture.translation(in: gesture.view).x)
            switch gesture.state {
            case .began, .changed: changed(distance)
            case .ended: ended(distance)
            case .cancelled, .failed: ended(0)
            default: break
            }
        }
    }
}

struct ChatReplySwipe: ViewModifier {
    let reply: () -> Void
    @State private var offset: CGFloat = 0
    @State private var ready = false
    func body(content: Content) -> some View {
        content.offset(x: offset)
            .background(alignment: .leading) {
                Image(systemName: "arrowshape.turn.up.left.fill")
                    .foregroundColor(Color(hex: "9EFF00"))
                    .frame(width: 40, height: 40)
                    .background(Color.white.opacity(0.08)).clipShape(Circle())
                    .opacity(min(1, offset / 55)).scaleEffect(ready ? 1 : 0.8)
                    .allowsHitTesting(false)
            }
            .background(MessageSwipeObserver(changed: { distance in
                offset = min(88, distance * 0.8)
                if !ready && distance >= 64 { UISelectionFeedbackGenerator().selectionChanged() }
                ready = distance >= 64
            }, ended: { distance in
                if distance >= 64 { reply() }
                ready = false
                withAnimation(.easeOut(duration: 0.18)) { offset = 0 }
            }))
    }
}
