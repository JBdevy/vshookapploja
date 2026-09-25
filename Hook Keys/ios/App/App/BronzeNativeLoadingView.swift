import SwiftUI

/// Branded startup cover. It only finishes after both the minimum duration and audio readiness.
struct BronzeNativeLoadingView: View {
    let isReady: Bool
    var onFinished: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var minimumElapsed = false
    @State private var animated = false
    private let accent = Color(red: 1, green: 139 / 255, blue: 49 / 255)

    var body: some View {
        GeometryReader { geometry in
            let compact = geometry.size.height < 500
            ZStack {
                BronzeScreenBackground()
                VStack(spacing: compact ? 14 : 22) {
                    header(compact: compact)
                    Spacer(minLength: 0)
                    meter(height: compact ? 45 : 90)
                    VStack(spacing: compact ? 8 : 14) {
                        Text("INICIALIZANDO").font(.caption.monospaced().weight(.heavy)).tracking(4).foregroundStyle(accent)
                        (Text("BRONZE").foregroundColor(accent) + Text(" KEYS").foregroundColor(.white))
                            .font(.system(size: min(76, geometry.size.width * 0.075), weight: .heavy, design: .monospaced))
                            .lineLimit(1).minimumScaleFactor(0.5)
                        Text("Preparando sua performance")
                            .font(.system(.subheadline, design: .monospaced).weight(.bold))
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    footer
                }
                .padding(compact ? 20 : 28)
                .frame(width: min(980, geometry.size.width * 0.92), height: min(590, geometry.size.height * 0.82))
                .background(BronzeTheme.panelGradient)
                .clipShape(RoundedRectangle(cornerRadius: 30))
                .shadow(color: .black.opacity(0.75), radius: 40, y: 22)
                .scaleEffect(reduceMotion || animated ? 1 : 0.96)
                .animation(reduceMotion ? nil : .easeOut(duration: 1.6), value: animated)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
        .ignoresSafeArea()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Bronze Keys. Carregando. Preparando sua performance.")
        .accessibilityIdentifier("bronze-loading")
        .task {
            animated = true
            do {
                try await Task.sleep(nanoseconds: 3_000_000_000)
                try Task.checkCancellation()
                minimumElapsed = true
            } catch { }
        }
        .onChange(of: minimumElapsed && isReady) { ready in
            if ready { onFinished() }
        }
    }

    private func header(compact: Bool) -> some View {
        HStack(spacing: 12) {
            Image("BronzeBrand").resizable().scaledToFit().frame(width: compact ? 36 : 54, height: compact ? 36 : 54)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 4) {
                Text("BRONZE KEYS").font(.system(.headline, design: .monospaced).weight(.heavy))
                Text("PERFORMANCE INSTRUMENT").font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Label("PREPARANDO MOTOR", systemImage: "circle.fill")
                .font(.system(size: compact ? 8 : 10, weight: .heavy, design: .monospaced))
                .foregroundStyle(accent)
                .padding(10).background(.black.opacity(0.35), in: Capsule())
        }
    }

    private func meter(height: CGFloat) -> some View {
        HStack(alignment: .bottom, spacing: 10) {
            ForEach(0..<19) { index in
                RoundedRectangle(cornerRadius: 3)
                    .fill(LinearGradient(colors: [Color(red: 1, green: 0.94, blue: 0.7), accent, .orange.opacity(0.5)],
                                         startPoint: .top, endPoint: .bottom))
                    .frame(width: 4, height: height * CGFloat(34 + ((index * 29) % 63)) / 100)
                    .scaleEffect(x: 1, y: reduceMotion || animated ? 1 : 0.25, anchor: .bottom)
                    .opacity(0.4)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.68).delay(Double(index) * 0.043).repeatForever(autoreverses: true), value: animated)
            }
        }
        .frame(height: height, alignment: .bottom)
        .accessibilityHidden(true)
    }

    private var footer: some View {
        VStack(spacing: 14) {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.08))
                    Capsule().fill(LinearGradient(colors: [.orange, accent, Color(red: 1, green: 0.89, blue: 0.65)],
                                                  startPoint: .leading, endPoint: .trailing))
                        .frame(width: geometry.size.width * 0.35)
                        .offset(x: reduceMotion ? geometry.size.width * 0.325 : (animated ? geometry.size.width : -geometry.size.width * 0.35))
                        .animation(reduceMotion ? nil : .easeInOut(duration: 1.8).repeatForever(autoreverses: true), value: animated)
                }.clipShape(Capsule())
            }.frame(height: 4)
            HStack {
                Text("BRONZE AUDIO ENGINE").foregroundStyle(.secondary)
                Spacer()
                Text("CARREGANDO").foregroundStyle(accent)
            }.font(.system(.caption2, design: .monospaced).weight(.heavy))
        }
    }
}

#if DEBUG
struct BronzeNativeLoadingView_Previews: PreviewProvider {
    static var previews: some View {
        BronzeNativeLoadingView(isReady: false, onFinished: {})
            .previewInterfaceOrientation(.landscapeLeft)
    }
}
#endif
