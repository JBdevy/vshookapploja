import SwiftUI
import UIKit

struct DirectorFader: UIViewRepresentable {
    @Binding var value: Double
    var label = "Volume"
    var identifier = ""
    var editingChanged: (Bool) -> Void = { _ in }
    // Reuse the same image when lazy mixer rows enter the viewport.
    private static let thumb = UIGraphicsImageRenderer(size: CGSize(width: 14, height: 18)).image { _ in
        UIColor(Color(hex: "FACC15")).setFill()
        UIBezierPath(roundedRect: CGRect(x: 0, y: 0, width: 14, height: 18), cornerRadius: 4).fill()
    }
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> UISlider {
        let slider = ThinSlider()
        slider.minimumValue = 0; slider.maximumValue = 1
        slider.minimumTrackTintColor = UIColor(Color(hex: "FACC15"))
        slider.maximumTrackTintColor = UIColor(Color(hex: "374151"))
        slider.setThumbImage(Self.thumb, for: .normal)
        slider.addTarget(context.coordinator, action: #selector(Coordinator.start), for: .touchDown)
        slider.addTarget(context.coordinator, action: #selector(Coordinator.change(_:)), for: .valueChanged)
        slider.addTarget(context.coordinator, action: #selector(Coordinator.end), for: [.touchUpInside, .touchUpOutside, .touchCancel])
        return slider
    }
    func updateUIView(_ slider: UISlider, context: Context) {
        context.coordinator.parent = self
        if !slider.isTracking { slider.value = Float(value) }
        slider.accessibilityLabel = label; slider.accessibilityIdentifier = identifier
    }
    final class Coordinator: NSObject {
        var parent: DirectorFader
        init(_ parent: DirectorFader) { self.parent = parent }
        @objc func start() { parent.editingChanged(true) }
        @objc func change(_ sender: UISlider) { parent.editingChanged(true); parent.value = Double(sender.value) }
        @objc func end() { parent.editingChanged(false) }
    }
    final class ThinSlider: UISlider {
        override func trackRect(forBounds bounds: CGRect) -> CGRect { let rect = super.trackRect(forBounds: bounds); return CGRect(x:rect.minX,y:bounds.midY - 3,width:rect.width,height:6) }
        override func draw(_ rect: CGRect) {
            super.draw(rect)
            let x = 7 + (bounds.width - 14) * 0.76
            UIColor.white.setFill(); UIBezierPath(rect:CGRect(x:x,y:bounds.midY - 5,width:1,height:10)).fill()
        }
    }
}
