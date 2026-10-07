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
