import SwiftUI
import UIKit
import AudioToolbox

enum HookFeedback {
    static func tap() {
        if UserDefaults.standard.bool(forKey: "vshook.native.haptics") { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        if UserDefaults.standard.bool(forKey: "vshook.native.sound") { AudioServicesPlaySystemSound(1104) }
    }
}

enum HookTheme {
    static let background = Color(hex: "0B1118")
    static let panel = Color(hex: "151B25")
    static let gold = Color(hex: "F7C948")
    static let muted = Color(hex: "AAB2C0")
    static let buttonRadius: CGFloat = 6
    static let goldGradient = LinearGradient(colors: [Color(hex: "F7C948"), Color(hex: "F59E0B")], startPoint: .topLeading, endPoint: .bottomTrailing)
}
extension Color {
    init(hex: String) {
        let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        let value = UInt64(clean, radix: 16) ?? 0x64748B
        self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}
struct HookButtonStyle: ButtonStyle {
    var color: Color = HookTheme.gold
    var filled = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .bold))
            .frame(minHeight: 44)
            .padding(.horizontal, 12)
            .foregroundColor(filled && color == HookTheme.gold ? Color(hex: "111827") : .white)
            .background(LinearGradient(colors: [color.opacity(filled ? 1 : 0.22), color.opacity(filled ? 0.75 : 0.1)], startPoint: .top, endPoint: .bottom))
            .clipShape(RoundedRectangle(cornerRadius: HookTheme.buttonRadius))
            .overlay(RoundedRectangle(cornerRadius: HookTheme.buttonRadius).strokeBorder(color.opacity(0.45), lineWidth: 1))
            .opacity(configuration.isPressed ? 0.65 : 1)
    }
}
struct HookButton: View {
    let title: String
    var icon: String? = nil
    var color: Color = HookTheme.gold
    var filled = true
    var expand = false
    let action: () -> Void
    var body: some View {
        Button {
            HookFeedback.tap()
            action()
        } label: {
            HStack(spacing: 7) { if let icon { Image(systemName: icon) }; Text(title).lineLimit(2) }
                .frame(maxWidth: expand ? .infinity : nil)
        }.buttonStyle(HookButtonStyle(color: color, filled: filled))
    }
}
struct HookField: ViewModifier {
    func body(content: Content) -> some View {
        content.padding(13).frame(minHeight: 50).background(Color.white.opacity(0.07))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.white.opacity(0.15)))
    }
}
struct HookCard<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        VStack(spacing: 14) { content }.padding(20).frame(maxWidth: .infinity)
            .background(HookTheme.panel).clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.white.opacity(0.08)))
    }
}
struct HookScreen<Content: View>: View {
    let title: String
    let back: () -> Void
    @ViewBuilder let content: Content
    var body: some View {
        VStack(spacing: 12) {
            HStack {
                HookButton(title: "Voltar", icon: "chevron.left", filled: false, action: back)
                Text(title).font(.title2.bold()).frame(maxWidth: .infinity, alignment: .leading)
            }.padding(.horizontal).padding(.top, 6)
            content
        }.background(HookTheme.background.ignoresSafeArea()).foregroundColor(.white)
    }
}
struct HookStatus: View {
    var text: String
    var color: Color = HookTheme.muted
    var body: some View {
        if !text.isEmpty { Text(text).font(.subheadline).foregroundColor(color).multilineTextAlignment(.center).padding(8).accessibilityIdentifier("vshook.status") }
    }
}
func timeText(_ seconds: Double) -> String {
    guard seconds.isFinite else { return "00:00" }
    let value = Int(abs(seconds)), prefix = seconds < 0 ? "−" : ""
    if value >= 3600 { return String(format: "%@%02d:%02d:%02d", prefix, value / 3600, (value % 3600) / 60, value % 60) }
    return String(format: "%@%02d:%02d", prefix, value / 60, value % 60)
}
