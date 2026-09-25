import SwiftUI

/// The original welcome transition, presented once before revealing the player.
struct BronzeNativeWelcomeView: View {
    let name: String
    var onFinished: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visibleCount = 0
    @State private var leaving = false
    @State private var lightExpanded = false
    @State private var lineVisible = false
    @State private var scanFinished = false

    private let accent = Color(red: 1, green: 139 / 255, blue: 49 / 255)
    private var greeting: String { "Bem Vindo, \(name)" }

    static func displayName(_ identity: BronzeAccountIdentity?) -> String {
        let name = identity?.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !name.isEmpty { return String(name.prefix(80)) }
        let emailName = identity?.email.split(separator: "@").first?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return emailName.isEmpty ? "Músico" : String(emailName.prefix(80))
    }

    var body: some View {
        GeometryReader { geometry in
            let titleSize = min(82, max(32, geometry.size.width * 0.064))
            ZStack {
                BronzeScreenBackground()
                Ellipse()
                    .fill(Color.gray.opacity(0.16))
                    .frame(width: min(920, geometry.size.width * 0.74), height: min(260, geometry.size.height * 0.36))
                    .blur(radius: 30)
                    .shadow(color: .gray.opacity(0.16), radius: 70)
                    .scaleEffect(lightExpanded ? 1.05 : 0.65)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 2.2).repeatForever(autoreverses: true), value: lightExpanded)
                VStack(spacing: 26) {
                    Text("BRONZE KEYS")
                        .font(.system(.caption, design: .monospaced).weight(.heavy))
                        .tracking(4).foregroundStyle(accent)
                    ZStack {
                        // Reserve the final height so multi-line names don't move the composition.
                        Text(greeting + "▏").hidden()
                        HStack(alignment: .center, spacing: 5) {
                            Text(String(greeting.prefix(visibleCount)))
                                .foregroundStyle(Color(red: 1, green: 247 / 255, blue: 241 / 255))
                                .id(visibleCount)
                                .transition(.identity)
                                .transaction { transaction in
                                    transaction.animation = nil
                                    transaction.disablesAnimations = true
                                }
                            BronzeWelcomeCaret(color: accent, reduceMotion: reduceMotion)
                                .frame(width: max(2, titleSize * 0.055), height: titleSize)
                        }
                    }
                    .font(.system(size: titleSize, weight: .heavy, design: .monospaced))
                    .multilineTextAlignment(.center)
                    .lineLimit(4).minimumScaleFactor(0.45)
                    .shadow(color: accent.opacity(0.18), radius: 24)
                    Text("PRONTO PARA SUA PERFORMANCE")
                        .font(.system(.caption2, design: .monospaced).weight(.heavy))
                        .tracking(2.5).foregroundStyle(Color(red: 129 / 255, green: 120 / 255, blue: 113 / 255))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: 1100)
                .padding(.horizontal, geometry.size.width * 0.04)

                VStack {
                    Spacer()
                    Rectangle().fill(.white.opacity(0.06)).frame(height: 1)
                        .overlay(
                            LinearGradient(colors: [.clear, .gray, Color(bronzeHex: 0xd6d6d6), .gray, .clear],
                                           startPoint: .leading, endPoint: .trailing)
                                .scaleEffect(x: lineVisible ? 1 : 0, y: 1)
                                .shadow(color: .gray.opacity(0.7), radius: 12)
                                .animation(reduceMotion ? nil : .easeOut(duration: 1.25).delay(0.1), value: lineVisible)
                        )
                }
                .padding(.horizontal, geometry.size.width * 0.12)
                .padding(.bottom, geometry.size.height * 0.12)

                if !reduceMotion {
                    Rectangle()
                        .fill(LinearGradient(colors: [.clear, Color.gray.opacity(0.14), .clear], startPoint: .leading, endPoint: .trailing))
                        .frame(width: geometry.size.width * 0.25)
                        .rotationEffect(.degrees(16)).blur(radius: 15)
                        .offset(x: geometry.size.width * (scanFinished ? 1.5 : -1.5))
                        .animation(.easeOut(duration: 1.35).delay(0.22), value: scanFinished)
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped()
        }
        .ignoresSafeArea()
        .opacity(leaving ? 0 : 1)
        .blur(radius: leaving && !reduceMotion ? 6 : 0)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.36), value: leaving)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(greeting). Pronto para sua performance.")
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("bronze-welcome")
        .task(id: reduceMotion) { await play() }
    }

    @MainActor private func play() async {
        visibleCount = 0
        leaving = false
        do {
            if reduceMotion {
                visibleCount = greeting.count
                lineVisible = true
                lightExpanded = true
                try await Task.sleep(nanoseconds: 1_100_000_000)
            } else {
                lightExpanded = true
                lineVisible = true
                scanFinished = true
                try await Task.sleep(nanoseconds: 380_000_000)
                for count in 1...greeting.count {
                    visibleCount = count
                    try await Task.sleep(nanoseconds: 64_000_000)
                }
                try await Task.sleep(nanoseconds: 1_050_000_000)
                for count in stride(from: greeting.count - 1, through: 0, by: -1) {
                    visibleCount = count
                    try await Task.sleep(nanoseconds: 38_000_000)
                }
                leaving = true
                try await Task.sleep(nanoseconds: 360_000_000)
            }
            try Task.checkCancellation()
            onFinished()
        } catch {
            // SwiftUI cancels this task when the user leaves the authenticated flow.
        }
    }
}

/// Own animation state: blinking never animates the greeting's content or opacity.
private struct BronzeWelcomeCaret: View {
    let color: Color
    let reduceMotion: Bool
    @State private var dimmed = false

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(color)
            .opacity(reduceMotion ? 1 : (dimmed ? 0.12 : 1))
            .animation(reduceMotion ? nil : .linear(duration: 0.36).repeatForever(autoreverses: true), value: dimmed)
            .onAppear { dimmed = true }
            .accessibilityHidden(true)
    }
}

#if DEBUG
struct BronzeNativeWelcomeView_Previews: PreviewProvider {
    static var previews: some View {
        BronzeNativeWelcomeView(name: "Músico", onFinished: {})
            .previewInterfaceOrientation(.landscapeLeft)
            .previewDisplayName("Boas-vindas")
    }
}
#endif
