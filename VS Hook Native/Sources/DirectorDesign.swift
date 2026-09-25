import SwiftUI
import UIKit

// Dimensions and colours from the current tablet Director, kept independent of
// the connection screen's large gold buttons.
struct DirectorButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var scheme
    var background = Color(hex: "172033")
    var foreground = Color.white
    var border = Color(hex: "475569")
    func makeBody(configuration: Configuration) -> some View {
        let neutral = background == Color(hex: "172033") || background == Color(hex: "283140")
        let fill = scheme == .light && neutral ? Color(hex: "D8E0E7") : background
        configuration.label
            .foregroundColor(scheme == .light && neutral ? Color(hex: "111827") : foreground)
            .background(LinearGradient(colors: [fill, fill.opacity(0.78)], startPoint: .top, endPoint: .bottom))
            .overlay(LinearGradient(colors: [.white.opacity(0.18), .clear], startPoint: .top, endPoint: .center))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(border, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.62 : 1)
    }
}
struct DirectorControl: View {
    let title: String
    var background = Color(hex: "172033")
    var foreground = Color.white
    var border = Color(hex: "475569")
    var height: CGFloat = 36
    var size: CGFloat = 14
    let action: () -> Void
    var body: some View {
        Button { HookFeedback.tap(); action() } label: {
            Text(title).font(.custom("Arial-BoldMT", size: size)).lineLimit(1).minimumScaleFactor(0.65)
                .frame(maxWidth: .infinity).frame(height: height).contentShape(Rectangle())
        }.buttonStyle(DirectorButtonStyle(background: background, foreground: foreground, border: border))
    }
}
struct DirectorSideButton: View {
    let title: String
    var background = Color(hex: "172033")
    var foreground = Color.white
    var border = Color(hex: "475569")
    var vertical = true
    var active = false
    let action: () -> Void
    var body: some View {
        Button { HookFeedback.tap(); action() } label: {
            Group {
                if vertical {
                    GeometryReader { geometry in
                        let size = min(11, max(6, (geometry.size.height - 12) / CGFloat(max(1, title.count))))
                        VStack(spacing: 0) {
                            ForEach(Array(title.enumerated()), id: \.offset) { _, character in
                                Text(String(character)).font(.custom("Arial-BoldMT", size: size)).frame(height: size)
                            }
                        }.frame(width: geometry.size.width, height: geometry.size.height)
                    }
                } else if title.hasPrefix("◀") || title.hasPrefix("▶") {
                    Image(systemName: "play.fill").rotationEffect(.degrees(title.hasPrefix("◀") ? 180 : 0)).font(.system(size: 18))
                } else {
                    Text(title).font(.custom("Arial-BoldMT", size: title == "BY" ? 18 : 10))
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity).contentShape(Rectangle())
        }.buttonStyle(DirectorButtonStyle(background: active ? Color(hex: "44340A") : background,
                                         foreground: active ? Color(hex: "FDE047") : foreground,
                                         border: active ? Color(hex: "FACC15") : border))
            .accessibilityLabel(title)
    }
}

struct DirectorModal<Content: View>: View {
    var maxWidth: CGFloat = 1040
    @ViewBuilder let content: Content
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color.black.opacity(0.5).ignoresSafeArea()
                content.frame(width: min(maxWidth, geometry.size.width - 24), height: geometry.size.height * 0.9)
            }.frame(width: geometry.size.width, height: geometry.size.height)
        }.accessibilityAddTraits(.isModal)
    }
}
struct DirectorRailStyle: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.padding(.horizontal, 6).padding(.vertical, 5).frame(width: 48)
            .background(LinearGradient(colors: scheme == .light ? [Color(hex: "EEF3F7"), Color(hex: "D8E0E7")] : [Color(hex: "111827"), Color(hex: "080D14")], startPoint: .top, endPoint: .bottom))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "263244"), lineWidth: 1))
    }
}

struct DirectorMarquee: View {
    let text: String
    let size: CGFloat
    var enabled = true
    @State private var started = Date()
    var body: some View {
        GeometryReader { geometry in
            let width = (text as NSString).size(withAttributes: [.font: UIFont(name: "Arial-BoldMT", size: size) ?? .boldSystemFont(ofSize: size)]).width
            if enabled && width > geometry.size.width {
                TimelineView(.animation(minimumInterval: 1 / 30)) { tick in
                    let distance = width + 40
                    let elapsed = max(0, tick.date.timeIntervalSince(started) - 1.2)
                    let offset = (elapsed * 30).truncatingRemainder(dividingBy: distance)
                    HStack(spacing: 40) { Text(text); Text(text) }.fixedSize().offset(x: -offset)
                        .frame(maxHeight: .infinity)
                }
            } else { Text(text).lineLimit(1).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading) }
        }.font(.custom("Arial-BoldMT", size: size)).frame(height: size * 1.35).clipped().accessibilityLabel(text)
            .onChange(of: text) { _ in started = Date() }
    }
}
