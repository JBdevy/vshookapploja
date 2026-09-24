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
