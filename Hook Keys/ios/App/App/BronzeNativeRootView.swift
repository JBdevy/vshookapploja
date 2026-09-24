import SwiftUI

struct BronzeNativeRootView: View {
    @StateObject private var model = BronzeNativeAppModel()

    var body: some View {
        ZStack {
            Color.bronzeBackground.ignoresSafeArea()
            switch model.engineState {
            case .idle, .starting:
                startupView
            case .failed(let message):
                failureView(message)
            case .ready:
                playerView
            }
        }
        .preferredColorScheme(.dark)
        .onAppear { model.start() }
        .onDisappear { model.stopPerformanceNotes() }
    }

    private var startupView: some View {
        VStack(spacing: 16) {
            Text("BRONZE KEYS")
                .font(.system(size: 34, weight: .black, design: .rounded))
                .foregroundStyle(Color.bronzeLight)
            ProgressView().tint(.bronze)
            Text("Preparando Core MIDI e Core Audio")
                .font(.caption.monospaced().weight(.bold))
                .foregroundStyle(.secondary)
        }
    }

    private func failureView(_ message: String) -> some View {
        VStack(spacing: 18) {
            Text("Não foi possível preparar o Bronze Keys")
                .font(.title2.bold())
            Text(message).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button("Tentar novamente") { model.retry() }
                .buttonStyle(BronzeButtonStyle(active: true))
        }
        .padding(30)
    }

    private var playerView: some View {
        GeometryReader { geometry in
            VStack(spacing: 6) {
                transport
                modules
                    .frame(height: max(170, geometry.size.height * 0.36))
                pageSelector
                pageContent
                BronzePerformanceKeyboard { note, pressed, velocity in
                    model.setKeyboardNote(note, pressed: pressed, velocity: velocity)
                }
                .frame(height: max(92, geometry.size.height * 0.20))
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
        }
    }

    private var transport: some View {
        BronzePanel {
            HStack(spacing: 8) {
                Text("BRONZE KEYS")
                    .font(.headline.monospaced().weight(.black))
                    .foregroundStyle(Color.bronzeLight)
                Spacer()
                Button("−") { model.setTempo(model.tempo - 0.5) }
                Text(String(format: "%.1f BPM", model.tempo))
                    .font(.caption.monospacedDigit().bold())
                    .frame(width: 86)
                Button("+") { model.setTempo(model.tempo + 0.5) }
                Divider().frame(height: 24)
                Button(model.metronomeEnabled ? "CLICK ON" : "CLICK OFF") {
                    model.toggleMetronome()
                }
                .buttonStyle(BronzeCompactButtonStyle(active: model.metronomeEnabled))
                ForEach(1...5, id: \.self) { sound in
                    Button("C\(sound)") { model.selectMetronomeClick(sound) }
                        .buttonStyle(BronzeCompactButtonStyle(
                            active: model.metronomeClickSound == sound
                        ))
                }
                Button("4/4") { model.setTimeSignature(numerator: 4, denominator: 4) }
                    .buttonStyle(BronzeCompactButtonStyle(
                        active: model.timeSignatureNumerator == 4
                            && model.timeSignatureDenominator == 4
                    ))
                Button("6/8") { model.setTimeSignature(numerator: 6, denominator: 8) }
                    .buttonStyle(BronzeCompactButtonStyle(
                        active: model.timeSignatureNumerator == 6
                            && model.timeSignatureDenominator == 8
                    ))
                Divider().frame(height: 24)
                Label("Core MIDI", systemImage: "pianokeys")
                    .font(.caption.bold())
                    .foregroundStyle(model.midiDevices.isEmpty ? .secondary : .green)
                Text(model.midiDevices.isEmpty ? "Nenhum dispositivo" : "\(model.midiDevices.count) conectado(s)")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var modules: some View {
        HStack(spacing: 5) {
            ForEach(0..<8, id: \.self) { index in
                BronzePanel {
                    VStack(spacing: 2) {
                        Text(index == 6 ? "B3" : "\(index + 1)")
                            .font(.caption2.monospaced().bold())
                            .foregroundStyle(model.selectedModule == index ? .black : .bronzeLight)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(model.selectedModule == index ? Color.bronzeLight : .clear)
                            .clipShape(Capsule())
                        GeometryReader { _ in
                            BronzeSkiaControl(
                                kind: .fader,
                                value: Binding(
                                    get: { model.moduleFaders[index] },
                                    set: { model.setModuleFader(index, normalized: $0) }
                                ),
                                accessibilityLabel: "Volume do módulo \(index + 1)"
                            )
                        }
                        ProgressView(value: min(1, model.moduleLevels[index] * 2.5))
                            .tint(.green)
                        Button(model.selectedModule == index ? "EDIT" : "ON") {
                            model.selectedModule = index
                        }
                        .font(.caption2.monospaced().bold())
                        .buttonStyle(BronzeButtonStyle(active: model.selectedModule == index))
                    }
                }
            }
        }
    }

    private var pageSelector: some View {
        HStack(spacing: 6) {
            ForEach(BronzeNativeAppModel.Page.allCases) { page in
                Button(page.rawValue) { model.page = page }
                    .buttonStyle(BronzeButtonStyle(active: model.page == page))
            }
        }
    }

    @ViewBuilder private var pageContent: some View {
        switch model.page {
        case .modules:
            moduleEditor
        case .organ:
            organEditor
        case .pads:
            performancePads
        case .presets:
            presetGrid
        }
    }

    private var moduleEditor: some View {
        HStack(spacing: 8) {
            ForEach(BronzeNativeAppModel.EnvelopeParameter.allCases) { parameter in
                BronzePanel {
                    VStack(spacing: 4) {
                        Text(parameter.rawValue).font(.caption.monospaced().bold())
                        BronzeSkiaControl(
                            kind: .knob,
                            value: Binding(
                                get: { model.envelopeValue(parameter, moduleIndex: model.selectedModule) },
                                set: {
                                    model.setEnvelopeValue(
                                        parameter,
                                        moduleIndex: model.selectedModule,
                                        normalized: $0
                                    )
                                }
                            ),
                            accessibilityLabel: "\(parameter.rawValue) do módulo \(model.selectedModule + 1)"
                        )
                        .frame(minHeight: 74)
                        Text(model.envelopeValueText(parameter, moduleIndex: model.selectedModule))
                            .font(.caption2.monospacedDigit().bold())
                            .foregroundStyle(Color.bronzeLight)
                    }
                }
            }
        }
    }

    private var organEditor: some View {
        HStack(spacing: 5) {
            ForEach(0..<9, id: \.self) { index in
                BronzePanel {
                    VStack {
                        Text(["16'", "5⅓'", "8'", "4'", "2⅔'", "2'", "1⅗'", "1⅓'", "1'"][index])
                            .font(.caption2.monospaced().bold())
                        BronzeSkiaControl(
                            kind: .fader,
                            value: Binding(
                                get: { model.organDrawbars[index] },
                                set: { model.setOrganDrawbar(index, normalized: $0) }
                            ),
                            accessibilityLabel: "Drawbar \(index + 1)"
                        )
                    }
                }
            }
            BronzePanel {
                VStack {
                    Text("LESLIE").font(.caption.monospaced().bold())
                    Button(model.organRotaryFast ? "FAST" : "SLOW") {
                        model.toggleOrganRotarySpeed()
                    }
                    .buttonStyle(BronzeButtonStyle(active: model.organRotaryFast))
                    Button(model.organCabinetEnabled ? "GABINET ON" : "GABINET OFF") {
                        model.toggleOrganCabinet()
                    }
                    .buttonStyle(BronzeButtonStyle(active: model.organCabinetEnabled))
                }
            }
        }
    }

    private var performancePads: some View {
        HStack(spacing: 8) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 6), spacing: 5) {
                ForEach(0..<12, id: \.self) { index in
                    Button(noteName(index)) { model.togglePad(index) }
                        .buttonStyle(BronzeButtonStyle(active: model.activePad == index))
                }
            }
            .frame(maxWidth: .infinity)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 6), spacing: 5) {
                ForEach(0..<12, id: \.self) { index in
                    Button("FX \(index + 1)") {}
                        .buttonStyle(BronzeButtonStyle(active: model.activeEffect == index))
                        .simultaneousGesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { _ in model.triggerEffect(index, pressed: true) }
                                .onEnded { _ in model.triggerEffect(index, pressed: false) }
                        )
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var presetGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 8), spacing: 5) {
            ForEach(1...16, id: \.self) { index in
                Button(String(format: "%02d\nEmpty", index)) {}
                    .buttonStyle(BronzeButtonStyle(active: index == 1))
            }
        }
    }

    private func noteName(_ index: Int) -> String {
        let names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]
        let relatives = ["Am", "B♭m", "Bm", "Cm", "C♯m", "Dm", "E♭m", "Em", "Fm", "F♯m", "Gm", "A♭m"]
        return "\(names[index])\n\(relatives[index])"
    }
}

struct BronzeButtonStyle: ButtonStyle {
    var active: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.caption.monospaced().weight(.black))
            .foregroundStyle(active ? Color.black : Color.white)
            .frame(maxWidth: .infinity, minHeight: 30)
            .padding(.horizontal, 6)
            .background(active ? Color.bronzeLight : Color(red: 0.10, green: 0.085, blue: 0.12))
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(active ? Color.white : Color.bronze.opacity(0.75), lineWidth: active ? 1.5 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

struct BronzeCompactButtonStyle: ButtonStyle {
    var active: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 9, weight: .black, design: .monospaced))
            .foregroundStyle(active ? Color.black : Color.white)
            .frame(minWidth: 28, minHeight: 25)
            .padding(.horizontal, 4)
            .background(active ? Color.bronzeLight : Color(red: 0.10, green: 0.085, blue: 0.12))
            .overlay(
                RoundedRectangle(cornerRadius: 5)
                    .stroke(active ? Color.white : Color.bronze.opacity(0.75), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 5))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
    }
}
