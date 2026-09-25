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
struct DirectorAutoControl: View {
    @ObservedObject var session: HookSession
    let mode: Int
    var height: CGFloat = 36
    var size: CGFloat = 14
    var body: some View {
        let active = session.autoEnabled(mode)
        DirectorControl(title: "AUTO \(mode)",
                        background: Color(hex: active ? (mode == 1 ? "CA8A04" : "16A34A") : "172033"),
                        foreground: active && mode == 1 ? Color(hex: "111827") : .white,
                        border: Color(hex: active ? (mode == 1 ? "FACC15" : "4ADE80") : "475569"),
                        height: height, size: size) { session.toggleAuto(mode) }
    }
}

struct DirectorActiveBlink: ViewModifier {
    let active: Bool
    @ViewBuilder func body(content: Content) -> some View {
        if active {
            // Same 720 ms on/off cycle as the reference LIVE and BY controls.
            TimelineView(.periodic(from: Date(timeIntervalSinceReferenceDate: 0), by: 0.36)) { context in
                let bright = Int(context.date.timeIntervalSinceReferenceDate / 0.36) % 2 == 0
                content.saturation(bright ? 1 : 0.35)
                    .colorMultiply(bright ? .white : Color(white: 0.2))
            }
        } else { content }
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
    var struck = false
    @State private var started = Date()
    var body: some View {
        GeometryReader { geometry in
            let width = (text as NSString).size(withAttributes: [.font: UIFont(name: "Arial-BoldMT", size: size) ?? .boldSystemFont(ofSize: size)]).width
            if enabled && width > geometry.size.width {
                TimelineView(.animation(minimumInterval: 1 / 30)) { tick in
                    let distance = width + 40
                    let elapsed = max(0, tick.date.timeIntervalSince(started) - 1.2)
                    let offset = (elapsed * 30).truncatingRemainder(dividingBy: distance)
                    HStack(spacing: 40) { Text(text).strikethrough(struck); Text(text).strikethrough(struck) }.fixedSize().offset(x: -offset)
                        .frame(maxHeight: .infinity)
                }
            } else { Text(text).strikethrough(struck).lineLimit(1).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading) }
        }.font(.custom("Arial-BoldMT", size: size)).frame(height: size * 1.35).clipped().accessibilityLabel(text)
            .onChange(of: text) { _ in started = Date() }
    }
}


struct DirectorTransportControl: View {
    @ObservedObject var session: HookSession
    var stopBreak = false
    var height: CGFloat = 36
    var size: CGFloat = 14
    var body: some View {
        Group {
            if session.fadeoutActive {
                TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in
                    control(remaining: session.fadeoutClock.remaining(at: context.date), date: context.date)
                }
            } else { control(remaining: nil, date: .now) }
        }
    }
    private func control(remaining: Double?, date: Date) -> some View {
        let pulse = !stopBreak && remaining != nil ? (1 - cos(date.timeIntervalSinceReferenceDate / 0.62 * 2 * .pi)) / 2 : 0
        return Button {
            HookFeedback.tap()
            if stopBreak {
                session.command("director_stop_break", session.target.merging(["noSeek": true, "preserveCursor": true, "transportOnly": true, "ignoreFadeout": true, "stopBreak": true]))
            } else { session.command("play_button") }
        } label: {
            Text(stopBreak ? "STOP BREAK" : session.playing ? "STOP" : "PLAY")
                .font(.custom("Arial-BoldMT", size: size)).lineLimit(1).minimumScaleFactor(0.65)
                .foregroundColor(.white).frame(maxWidth: .infinity).frame(height: height)
                .background {
                    if let remaining {
                        GeometryReader { geometry in
                            ZStack(alignment: .leading) {
                                Color(hex: "3B1115")
                                Color(hex: "DC2626").frame(width: geometry.size.width * remaining)
                            }
                        }
                    } else { Color(hex: session.playing ? "DC2626" : stopBreak ? "374151" : "166534") }
                }
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: session.playing ? "F87171" : stopBreak ? "475569" : "22C55E"), lineWidth: 1))
                .brightness(pulse * 0.12)
                .shadow(color: .red.opacity(pulse * 0.65), radius: 6)
                .contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
}

struct DirectorFadeoutPopup: View {
    @ObservedObject var session: HookSession
    var body: some View {
        if session.fadeoutActive {
            TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in
                let remaining = session.fadeoutClock.remaining(at: context.date)
                VStack(spacing: 8) {
                    Text("FaderOut - \(String(format: "%.1f", remaining * session.fadeoutClock.duration))s")
                        .font(.custom("Arial-BoldMT", size: 16)).monospacedDigit().foregroundColor(.white)
                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            Color(hex: "14181D")
                            LinearGradient(colors: [Color(hex: "F97316"), Color(hex: "EF4444")], startPoint: .leading, endPoint: .trailing)
                                .frame(width: geometry.size.width * remaining)
                        }.clipShape(Capsule()).overlay(Capsule().strokeBorder(Color(hex: "4C555E"), lineWidth: 1))
                    }.frame(height: 8)
                }.padding(.horizontal, 14).padding(.vertical, 12).frame(width: 230)
                    .background(Color(hex: "020617").opacity(0.96)).cornerRadius(14)
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color(hex: "FACC15"), lineWidth: 1))
                    .shadow(color: .black.opacity(0.45), radius: 18, y: 10)
            }.allowsHitTesting(false).accessibilityIdentifier("vshook.fadeout.popup")
        }
    }
}
