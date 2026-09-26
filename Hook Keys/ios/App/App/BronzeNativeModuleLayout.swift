import SwiftUI
import AVFoundation

struct BronzeOscillatorWaveform: View {
    let shape: Int
    var body: some View {
        Canvas { context, size in
            var path = Path()
            for step in 0...200 {
                let x = Double(step) / 200
                let phase = (x * 2).truncatingRemainder(dividingBy: 1)
                let y: Double
                switch shape {
                case 1: y = phase * 2 - 1
                case 2: y = phase < 0.5 ? 1 : -1
                case 3: y = 1 - 4 * abs(phase - 0.5)
                default: y = sin(x * 4 * .pi)
                }
                let point = CGPoint(x: x * size.width, y: (0.5 - y * 0.4) * size.height)
                if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
            }
            context.stroke(path, with: .color(.bronzeLight), lineWidth: 2)
        }.background(.black).clipShape(RoundedRectangle(cornerRadius: 4)).accessibilityHidden(true)
    }
}

struct BronzeNativeOrganEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    @Environment(\.bronzeContentSize) private var size
    private var compact: Bool { size.height < 480 }
    private var rotaryHeight: CGFloat { compact ? 68 : 124 }
    private var viewportHeight: CGFloat { size.height + 80 }
    private var drawbarsHeight: CGFloat {
        let available = max(80, size.height - rotaryHeight - 34)
        return compact ? available : min(available, min(470, max(150, viewportHeight * 0.52)))
    }
    private var rotary: BronzeOrganRotary { model.organRotary }
    var body: some View {
        VStack(spacing: 2) {
            HStack(spacing: 5) {
                VStack(spacing: 8) {
                    HStack {
                        speedButton("Brake", speed: 0)
                        speedButton("Slow", speed: 1)
                    }
                    HStack {
                        speedButton("Fast", speed: 2)
                        Button("Gabinet") { model.toggleOrganCabinet() }
                            .buttonStyle(BronzeDeckButtonStyle(palette: model.organCabinetEnabled ? .green : .grey, selected: model.organCabinetEnabled))
                    }
                }.frame(maxWidth: .infinity).frame(height: compact ? 48 : 74)
                rotaryKnob("Slow", definition: .init("Slow", 0.2, 2, 1.2, .hertz), key: \.slowHz, tint: .yellow)
                rotaryKnob("Fast", definition: .init("Fast", 2, 10, 10, .hertz), key: \.fastHz, tint: .orange)
                rotaryKnob("Acceleration", definition: .init("Acceleration", 100, 10000, 1200, .milliseconds), key: \.rampSeconds, tint: .purple, multiplier: 1000)
                rotaryKnob("Depth", definition: .init("Depth", 0, 1, 1, .percent), key: \.depth, tint: .mint)
            }.padding(compact ? 4 : 10).frame(height: rotaryHeight).background(.black.opacity(0.55)).clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.green.opacity(0.5)))
            HStack(spacing: min(3, max(1, size.width * 0.0015))) {
                ForEach(0..<9, id: \.self) { index in
                    BronzeOrganDrawbar(index: index, value: Binding(get: { model.organDrawbars[index] }, set: { model.setOrganDrawbar(index, normalized: $0) }), compact: compact, viewportHeight: viewportHeight)
                }
            }.frame(height: max(60, drawbarsHeight - (compact ? 6 : 18)))
                .padding(compact ? 3 : 9).frame(maxWidth: 760)
                .background(Color.black.opacity(0.7)).clipShape(RoundedRectangle(cornerRadius: 9))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }.padding(6).background(BronzeTheme.panelGradient)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .frame(maxWidth: .infinity)
    }
    private func speedButton(_ title: String, speed: Int) -> some View {
        Button(title) { var next = rotary; next.speed = speed; model.setOrganRotary(next) }
            .buttonStyle(BronzeDeckButtonStyle(palette: rotary.speed == speed ? .green : .grey, selected: rotary.speed == speed))
    }
    private func rotaryKnob(_ title: String, definition: BronzeProcessorParameter, key: WritableKeyPath<BronzeOrganRotary, Double>, tint: Color, multiplier: Double = 1) -> some View {
        VStack(spacing: 2) {
            Text(title).font(.bronzeUI(compact ? 10 : 12)).lineLimit(1).minimumScaleFactor(0.7)
            BronzeDial(value: Binding(get: { definition.normalized(rotary[keyPath: key] * multiplier) }, set: { value in
                var next = rotary; next[keyPath: key] = definition.value(value) / multiplier; model.setOrganRotary(next)
            }), tint: tint, label: title, definition: definition).modifier(BronzeConfigLearn(model: model, target: "rotaryParam:0:\(title)")).frame(width: compact ? 30 : 58, height: compact ? 30 : 58)
            Text(definition.text(rotary[keyPath: key] * multiplier)).font(.bronzeUI(compact ? 10 : 12)).foregroundStyle(Color.bronzeLight)
        }.frame(maxWidth: .infinity).padding(compact ? 2 : 8).background(.black.opacity(0.35))
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color.green.opacity(0.3)))
    }
}

struct BronzeOrganDrawbar: View {
    let index: Int
    @Binding var value: Double
    var compact = false
    var viewportHeight: CGFloat = 768
    private var tint: Color { index < 2 ? Color(bronzeHex: 0x7a1f1f) : [4, 6, 7].contains(index) ? Color(bronzeHex: 0x17161a) : Color(bronzeHex: 0xc7c7c7) }
    var body: some View {
        VStack(spacing: 3) {
            Text(["16", "5⅓", "8", "4", "2⅔", "2", "1⅗", "1⅓", "1"][index]).font(.bronzeUI(compact ? 7 : 12)).foregroundStyle(Color(bronzeHex: 0xf6e6d2))
            GeometryReader { proxy in
                let handle = min(proxy.size.height * 0.5, compact ? min(34, max(22, viewportHeight * 0.042)) : min(86, max(52, viewportHeight * 0.095)))
                let travel = max(1, proxy.size.height - handle)
                let position = min(1, max(0, value))
                let ledSize = min(max(3, (proxy.size.height - 30) / 16), compact ? min(7, max(5, viewportHeight * 0.01)) : min(17, max(12, viewportHeight * 0.019)))
                let trackWidth = max(12, (proxy.size.width - ledSize - 5) * 0.74)
                HStack(spacing: 5) {
                    ZStack(alignment: .top) {
                        Rectangle().fill(Color.white.opacity(0.14)).frame(width: trackWidth * 0.12)
                        VStack(spacing: 0) {
                            ForEach((1...8).reversed(), id: \.self) { stage in
                                Text("\(stage)").font(.bronzeUI(compact ? 6 : 9))
                                    .foregroundStyle(Color(bronzeHex: 0xff9e2e))
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                            }
                        }.frame(width: trackWidth, height: travel)
                            .background {
                                HStack(spacing: 0) {
                                    Color(bronzeHex: 0xe8e2d6).frame(width: trackWidth * 0.2)
                                    Color(bronzeHex: 0x0a0a0a)
                                    Color(bronzeHex: 0xe8e2d6).frame(width: trackWidth * 0.2)
                                }
                            }
                            .mask(alignment: .top) { Rectangle().frame(height: position * travel) }
                        BronzeDrawbarGrip().fill(tint)
                            .frame(width: trackWidth, height: handle)
                            .overlay(alignment: .top) { Color.white.opacity(0.55).frame(height: 1) }
                            .overlay { ([4, 6, 7].contains(index) ? Color.white.opacity(0.22) : Color.black.opacity(0.35)).frame(width: trackWidth * 0.7, height: 2) }
                            .shadow(color: .black.opacity(0.55), radius: 3, y: 3)
                            .offset(y: position * travel)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity).clipped()
                    VStack(spacing: 2) {
                        ForEach(0..<16, id: \.self) { segment in
                            let lit = Double(segment) < (position * 8).rounded() * 2
                            RoundedRectangle(cornerRadius: 2)
                                .fill(RadialGradient(colors: lit
                                    ? [Color(bronzeHex: 0xd4ffb0), Color(bronzeHex: 0x6de23a)]
                                    : [Color(bronzeHex: 0x10151f), Color(bronzeHex: 0x10151f)],
                                    center: .center, startRadius: 0, endRadius: ledSize * 0.7))
                                .frame(width: ledSize, height: ledSize)
                                .shadow(color: lit ? Color.green.opacity(0.65) : .clear, radius: 2)
                        }
                    }.frame(width: ledSize, height: proxy.size.height)
                }.contentShape(Rectangle()).gesture(DragGesture(minimumDistance: 0).onChanged { gesture in
                    let position = Double((gesture.location.y - handle / 2) / max(1, proxy.size.height - handle))
                    value = (min(1, max(0, position)) * 8).rounded() / 8
                })
            }
            Text("\(Int((value * 8).rounded()))").font(.bronzeUI(compact ? 7 : 11)).foregroundStyle(Color(bronzeHex: 0xffb45c))
        }.accessibilityElement().accessibilityLabel("Drawbar \(index + 1)").accessibilityValue("\(Int((value * 8).rounded())) de 8")
            .accessibilityAdjustableAction { direction in value = min(1, max(0, value + (direction == .increment ? 0.125 : -0.125))) }
    }
}

private struct BronzeDrawbarGrip: Shape {
    func path(in rect: CGRect) -> Path {
        let top: CGFloat = min(3, rect.width / 2)
        let bottomX = rect.width * 0.3, bottomY = rect.height * 0.24
        return Path { path in
            path.move(to: CGPoint(x: top, y: 0))
            path.addLine(to: CGPoint(x: rect.width - top, y: 0))
            path.addQuadCurve(to: CGPoint(x: rect.width, y: top), control: CGPoint(x: rect.width, y: 0))
            path.addLine(to: CGPoint(x: rect.width, y: rect.height - bottomY))
            path.addQuadCurve(to: CGPoint(x: rect.width - bottomX, y: rect.height), control: CGPoint(x: rect.width, y: rect.height))
            path.addLine(to: CGPoint(x: bottomX, y: rect.height))
            path.addQuadCurve(to: CGPoint(x: 0, y: rect.height - bottomY), control: CGPoint(x: 0, y: rect.height))
            path.addLine(to: CGPoint(x: 0, y: top))
            path.addQuadCurve(to: CGPoint(x: top, y: 0), control: .zero)
            path.closeSubpath()
        }
    }
}

struct BronzeModuleRoutingHeader: View {
    @State private var showPolyphony = false
    @State private var polyphonyText = "128"
    @State private var channels = max(1, AVAudioSession.sharedInstance().outputNumberOfChannels)
    @Environment(\.bronzeContentSize) private var contentSize
    private var compact: Bool { contentSize.height < 480 }
    @ObservedObject var model: BronzeNativeAppModel
    let index: Int
    private var config: BronzeModulePerformance { model.modulePerformance[index] }
    var body: some View {
        HStack(spacing: 4) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Dispositivo MIDI").font(.bronzeUI(11)).foregroundStyle(.secondary)
                BronzeStableMenu(title: config.input < 0 ? "Todos os dispositivos ativos" : "MIDI \(config.input + 1) · \(model.midiSlotName(config.input))",
                    choices: ["Todos os dispositivos ativos"] + (0..<3).map { "MIDI \($0 + 1) · \(model.midiSlotName($0))" }, selected: config.input + 1) { selected in
                        edit { $0.input = selected - 1 }
                    }.frame(height: compact ? 30 : 44)

            }.frame(maxWidth: .infinity)
            VStack(alignment: .leading, spacing: 2) {
                Text("Saída do módulo").font(.bronzeUI(11)).foregroundStyle(.secondary)
                let routes = BronzeAudioRouteOption.available(channels: channels)
                BronzeStableMenu(title: config.usesDefaultOutput ? "Padrão" : routes.first(where: { $0.start == config.outputStart && $0.count == config.outputCount })?.title ?? "Saída indisponível",
                    choices: ["Padrão"] + routes.map(\.title), selected: config.usesDefaultOutput ? 0 : routes.firstIndex(where: { $0.start == config.outputStart && $0.count == config.outputCount }).map { $0 + 1 } ?? -1) { selection in
                    edit {
                        $0.outputUsesDefault = selection == 0
                        if selection == 0 { $0.outputStart = model.mixer.channelStart(4); $0.outputCount = model.mixer.channelCount(4) }
                        else { $0.outputStart = routes[selection - 1].start; $0.outputCount = routes[selection - 1].count }
                    }
                }.frame(height: compact ? 30 : 44)

            }.frame(maxWidth: .infinity)
            VStack(spacing: 2) {
                if index < 6 {
                    Button("Default") { model.setModuleSettingsSource(index, source: "default") }
                        .buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: model.moduleSettingsSources[index] == "default", size: compact ? 10 : 12))
                        .frame(height: compact ? 20 : 26)
                }
                Button { polyphonyText = "\(config.polyphony)"; showPolyphony = true } label: {
                    VStack(spacing: 2) { Text("Polifonia").font(.bronzeUI(compact ? 9 : 12)); Text("\(config.polyphony)").font(.bronzeUI(compact ? 14 : 20)) }
                }.buttonStyle(BronzeDeckButtonStyle(palette: .bronze)).frame(height: compact ? 40 : 60)
                    .modifier(BronzeDefaultSettingsLock(active: index < 6 && model.moduleSettingsSources[index] == "default"))

            }.frame(width: compact ? 76 : 110, height: compact ? 62 : 88)
            if index != 7 {
                VStack(spacing: 2) {
                    if index < 6 {
                        Button("User") { model.setModuleSettingsSource(index, source: "user") }
                            .buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: model.moduleSettingsSources[index] == "user", size: compact ? 10 : 12))
                            .frame(height: compact ? 20 : 26)
                    }
                    Button { edit { $0.mode = $0.mode == 0 ? 1 : 0 } } label: { VStack(spacing: 0) { Text("Modo").font(.bronzeUI(compact ? 9 : 12)); Text(config.mode == 0 ? "Poly" : "Mono").font(.bronzeUI(compact ? 14 : 20)) } }
                        .buttonStyle(BronzeDeckButtonStyle(palette: config.mode == 0 ? .blue : .purple)).frame(height: compact ? 40 : 60)
                        .modifier(BronzeDefaultSettingsLock(active: index < 6 && model.moduleSettingsSources[index] == "default"))
                }.frame(width: compact ? 76 : 110, height: compact ? 62 : 88)
            }
        }.padding(compact ? 3 : 8).modifier(BronzeDeckSurface())
            .fullScreenCover(isPresented: $showPolyphony) {
                BronzeEditDialog(title: "Polifonia", height: 270) {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Quantidade máxima de vozes").font(.bronzeUI(13))
                        TextField("1 a 128", text: $polyphonyText).keyboardType(.numberPad).textFieldStyle(BronzeNativeFieldStyle())
                        Text("Escolha entre 1 e 128 vozes simultâneas para este módulo.").font(.bronzeUI(12))
                    }
                } actions: {
                    Button("Voltar") { showPolyphony = false }.buttonStyle(BronzeConfigActionStyle(kind: .back))
                    Button("OK") { if let count = Int(polyphonyText), (1...128).contains(count) { edit { $0.polyphony = count }; showPolyphony = false } }
                        .buttonStyle(BronzeDeckButtonStyle(palette: .green)).disabled(!(1...128).contains(Int(polyphonyText) ?? 0))
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification).receive(on: RunLoop.main)) { _ in
                channels = max(1, AVAudioSession.sharedInstance().outputNumberOfChannels)
            }
    }
    private func edit(_ change: (inout BronzeModulePerformance) -> Void) {
        var next = config; change(&next); model.setPerformance(next, moduleIndex: index)
    }
}

struct BronzeModuleEnvelopeGrid: View {
    @ObservedObject var model: BronzeNativeAppModel
    let index: Int
    let openFilter: () -> Void
    var body: some View {
        VStack(spacing: 2) {
            HStack(spacing: 2) {
                envelope(.attack, color: .pink)
                envelope(.release, color: .orange)
                envelope(.hold, color: .green)
                envelope(.decay, color: .purple)
            }
            GeometryReader { row in
                let width = max(1, (row.size.width - 6) / 4)
                HStack(spacing: 2) {
                    envelope(.sustain, color: .cyan).frame(width: width)
                    if index == 6 {
                        BronzeModuleModulationCard(model: model, index: index).frame(width: width * 2 + 2)
                    } else {
                        BronzeParameterCard(title: "Cutoff", text: BronzeToneParameter.cutoff.definition.text(model.moduleTones[index][.cutoff]), value: Binding(
                            get: { BronzeToneParameter.cutoff.definition.normalized(model.moduleTones[index][.cutoff]) },
                            set: { n in var t = model.moduleTones[index]; t[.cutoff] = BronzeToneParameter.cutoff.definition.value(n); model.setTone(t, moduleIndex: index) }),
                            tint: .cyan, border: .cyan, topAction: "Envelope", action: openFilter, definition: BronzeToneParameter.cutoff.definition).frame(width: width).modifier(BronzeConfigLearn(model: model, target: "tone:\(index):\(BronzeToneParameter.cutoff.index)"))
                        BronzeParameterCard(title: "Limite Velocity", text: "\(model.modulePerformance[index].velocityIgnoreAbove)", value: Binding(
                            get: { Double(model.modulePerformance[index].velocityIgnoreAbove) / 127 },
                            set: { n in var v = model.modulePerformance[index]; v.velocityIgnoreAbove = Int((n * 127).rounded()); model.setPerformance(v, moduleIndex: index) }), tint: .purple, border: .purple, step: 1.0 / 127).frame(width: width).modifier(BronzeConfigLearn(model: model, target: "performance:\(index):velocity"))
                    }
                    BronzeParameterCard(title: "Gain", text: BronzeToneParameter.gain.definition.text(model.moduleTones[index][.gain]), value: Binding(
                        get: { BronzeToneParameter.gain.definition.normalized(model.moduleTones[index][.gain]) },
                        set: { n in var t = model.moduleTones[index]; t[.gain] = BronzeToneParameter.gain.definition.value(n); model.setTone(t, moduleIndex: index) }), tint: .orange, border: .purple, definition: BronzeToneParameter.gain.definition).frame(width: width).modifier(BronzeConfigLearn(model: model, target: "tone:\(index):\(BronzeToneParameter.gain.index)"))
                }
            }
        }
    }
    private func envelope(_ parameter: BronzeNativeAppModel.EnvelopeParameter, color: Color) -> some View {
        BronzeParameterCard(title: parameter.rawValue, text: model.envelopeValueText(parameter, moduleIndex: index), value: Binding(
            get: { model.envelopeValue(parameter, moduleIndex: index) },
            set: { model.setEnvelopeValue(parameter, moduleIndex: index, normalized: $0) }), tint: color, border: color,
            definition: parameter == .sustain ? .init(parameter.rawValue, -60, 0, 0, .decibels) : .init(parameter.rawValue, 0, parameter == .attack || parameter == .hold ? 15000 : 25000, 0, .milliseconds))
            .modifier(BronzeConfigLearn(model: model, target: "env:\(index):\(BronzeNativeAppModel.EnvelopeParameter.allCases.firstIndex(of: parameter) ?? 0)"))
    }
}

struct BronzeModuleModulationCard: View {
    @ObservedObject var model: BronzeNativeAppModel
    let index: Int
    var advanced: (() -> Void)? = nil
    private var config: BronzeModulePerformance { model.modulePerformance[index] }
    var body: some View {
        GeometryReader { g in
            let small = g.size.height < 100
            HStack(spacing: 4) {
                Text("Mod").font(.bronzeUI(small ? 9 : 12))
                VStack(spacing: 3) {
                    HStack(spacing: 3) {
                        mode(index == 6 ? "Wheel Rotary" : "User", value: index == 6 ? 4 : 0)
                        if index == 6 {
                            Button("Toggle Rotary") { model.toggleOrganRotarySpeed() }.buttonStyle(BronzeDeckButtonStyle(palette: model.organRotaryFast ? .green : .grey, size: small ? 9 : 12))
                                .modifier(BronzeLearnOnHold(model: model, target: "rotary", tapAction: { model.toggleOrganRotarySpeed() }))
                        } else { mode("LFO", value: 1) }
                    }
                    if index != 7 { HStack(spacing: 3) { mode("Tremolo", value: 2); mode("Pan", value: 3) } }
                }
                if index != 7 {
                    VStack(spacing: 1) {
                        BronzeDial(value: Binding(get: { (config.modulationRate - 0.1) / 19.9 }, set: { n in edit { $0.modulationRate = 0.1 + n * 19.9 } }), tint: .orange, label: "Rate do Mod", displayValue: String(format: "%.2f Hz", config.modulationRate), step: 0.01 / 19.9).modifier(BronzeConfigLearn(model: model, target: "performance:\(index):modRate"))
                            .frame(width: small ? 32 : 44, height: small ? 32 : 44).disabled(config.modulationMode == 0 || config.modulationMode == 4)
                        Text(String(format: "%.2f Hz", config.modulationRate)).font(.bronzeUI(8)).foregroundStyle(.purple)
                    }.contextMenu { if let advanced { Button("Intensity", action: advanced) } }
                }
            }.padding(6).frame(width: g.size.width, height: g.size.height)
                .background(Color(bronzeHex: 0x0b0e18)).cornerRadius(4)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.purple.opacity(0.8)))
        }
    }
    private func mode(_ title: String, value: Int) -> some View {
        Button(title) { edit { $0.modulationMode = value } }.buttonStyle(BronzeDeckButtonStyle(palette: config.modulationMode == value ? .green : .grey, selected: config.modulationMode == value))
    }
    private func edit(_ change: (inout BronzeModulePerformance) -> Void) { var v = config; change(&v); model.setPerformance(v, moduleIndex: index) }
}

struct BronzeModulePerformanceCards: View {
    @Environment(\.bronzeContentSize) private var contentSize
    private var compact: Bool { contentSize.height < 480 }
    @ObservedObject var model: BronzeNativeAppModel
    let index: Int
    let advanced: (Int) -> Void
    private var config: BronzeModulePerformance { model.modulePerformance[index] }
    var body: some View {
        HStack(spacing: 4) {
            Button(action: { advanced(1) }) {
                HStack(spacing: 3) {
                    Text("Velocity").foregroundStyle(.black).font(.bronzeUI(compact ? 11 : 15))
                    Text(["Soft", "Middle", "Hard", "Fixed", "User"][min(4, max(0, config.velocityMode ?? 4))]).font(.bronzeUI(9))
                    Canvas { context, size in
                        var curve = Path()
                        for i in 0..<5 {
                            let point = CGPoint(x: CGFloat(i) / 4 * size.width, y: (1 - Double(config.velocityCurve[i]) / 127) * size.height)
                            if i == 0 { curve.move(to: point) } else { curve.addLine(to: point) }
                        }
                        context.stroke(curve, with: .color(.white), lineWidth: 2)
                    }.frame(height: 32)
                }.padding(compact ? 4 : 12).frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(LinearGradient(colors: [Color(bronzeHex: 0x7763ff), Color(bronzeHex: 0x31227c)], startPoint: .topLeading, endPoint: .bottomTrailing))
            }.buttonStyle(.plain).modifier(BronzeDeckSurface(radius: 3))
            if index < 6 {
                HStack(spacing: 3) {
                    VStack(spacing: 2) {
                        HStack(spacing: 2) {
                            Button("Sync") { edit { $0.glideSync.toggle() } }.buttonStyle(BronzeDeckButtonStyle(palette: config.glideSync ? .green : .red))
                            Button(config.portamento ? "Portamento" : "Auto") { edit { $0.portamento.toggle(); $0.mode = $0.portamento ? 1 : 0 } }.buttonStyle(BronzeDeckButtonStyle(palette: config.portamento ? .green : .grey))
                        }
                        HStack(spacing: 2) {
                            Button("Config", action: { advanced(3) }).buttonStyle(BronzeDeckButtonStyle(palette: .grey))
                            Button("No Sens") { edit { $0.noSens.toggle() } }.buttonStyle(BronzeDeckButtonStyle(palette: config.noSens ? .green : .red))
                        }
                    }
                    VStack(spacing: 2) {
                        Text(config.portamento ? "Portamento" : "Glide").font(.bronzeUI(compact ? 8 : 11)).lineLimit(1).minimumScaleFactor(0.7)
                        BronzeDial(value: Binding(get: { config.glideTime(bpm: model.tempo) / 5000 }, set: { value in edit { $0.glideMs = value * 5000 } }), tint: .cyan, label: config.portamento ? "Portamento" : "Glide", displayValue: String(format: "%.0f ms", config.glideTime(bpm: model.tempo)), step: 1.0 / 5000).modifier(BronzeConfigLearn(model: model, target: "performance:\(index):glide")).frame(width: compact ? 30 : 44, height: compact ? 30 : 44).disabled(config.glideSync)
                        Text(String(format: "%.0f ms", config.glideTime(bpm: model.tempo))).font(.bronzeUI(compact ? 9 : 12)).foregroundStyle(.cyan)
                    }.frame(width: compact ? 52 : 88)
                }.padding(compact ? 3 : 8).frame(maxWidth: .infinity).modifier(BronzeDeckSurface(radius: 3))
            }
            BronzeModuleModulationCard(model: model, index: index, advanced: { advanced(2) })
                .frame(maxWidth: .infinity)

        }.frame(height: compact ? 62 : 82)
    }
    private func edit(_ change: (inout BronzeModulePerformance) -> Void) {
        var next = config; change(&next); model.setPerformance(next, moduleIndex: index)
    }
}

// Native equivalents of the current Android parameter cards. The workspace
// stretches; the dial keeps its physical size instead of scaling the whole UI.
struct BronzeConfigActionStyle: ButtonStyle {
    enum Kind { case back, on, off, reset }
    let kind: Kind
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        let colors: [UInt32] = kind == .back ? [0xaaa6b0, 0x77737e] : kind == .on ? [0x38d97b, 0x087438] : kind == .off ? [0xf15a50, 0x891c18] : [0x322720, 0x100c0a]
        return configuration.label.font(.bronzeUI(15)).foregroundStyle(kind == .back ? .black : kind == .reset ? Color.bronzeLight : .white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(LinearGradient(colors: colors.map(Color.init(bronzeHex:)), startPoint: .topLeading, endPoint: .bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(kind == .reset ? Color.bronze.opacity(0.7) : .white.opacity(0.3)))
            .brightness(configuration.isPressed ? 0.1 : 0).opacity(enabled ? 1 : 0.5)
    }
}
struct BronzeConfigTabStyle: ButtonStyle {
    let palette: BronzeDeckPalette
    let selected: Bool
    private var color: Color {
        let hex: UInt32
        switch palette {
        case .cyan: hex = 0x2fb8e6
        case .yellow: hex = 0xd8a33a
        case .purple: hex = 0x9a6bf0
        case .green: hex = 0x3fd07a
        case .pink: hex = 0xef5da8
        case .red: hex = 0xff5f45
        case .blue: hex = 0x2f7ce6
        default: hex = 0xcd8836
        }
        return Color(bronzeHex: hex)
    }
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.bronzeUI(10)).lineLimit(1).minimumScaleFactor(0.65).foregroundStyle(.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity).padding(.horizontal, 3)
            .background(LinearGradient(colors: selected ? [color.opacity(0.85), color] : [color.opacity(0.32), Color(bronzeHex: 0x0c090e)], startPoint: .top, endPoint: .bottom))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? .white : color.opacity(0.7), lineWidth: selected ? 2 : 1))
            .brightness(configuration.isPressed ? 0.12 : 0)
    }
}
struct BronzeEffectSurface: ViewModifier {
    var tint: Color = .bronze
    var fill: UInt32 = 0x382f22
    func body(content: Content) -> some View {
        content.padding(8)
            .background(LinearGradient(colors: [Color(bronzeHex: fill), Color(bronzeHex: 0x100b10)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(tint.opacity(0.7), lineWidth: 1.5))
    }
}
struct BronzeParameterCard: View {
    let title: String
    let text: String
    @Binding var value: Double
    var tint: Color = .cyan
    var border: Color = .bronze
    var topAction: String? = nil
    var action: (() -> Void)? = nil
    var definition: BronzeProcessorParameter? = nil
    var step = 0.01
    var body: some View {
        GeometryReader { g in
            let small = g.size.height < 120
            let dial = max(1, min(70, g.size.height - (topAction == nil ? 36 : 48), g.size.width - 16))
            VStack(spacing: 2) {
                if let topAction, let action {
                    Button(topAction, action: action).buttonStyle(BronzeDeckButtonStyle(palette: .cyan, size: 10)).frame(height: small ? 22 : 28)
                } else {
                    Text(title).font(.bronzeUI(small ? 9 : 12)).foregroundStyle(.white.opacity(0.8)).lineLimit(1).minimumScaleFactor(0.6)
                }
                Spacer(minLength: 0)
                BronzeDial(value: $value, tint: tint, label: title, displayValue: text, definition: definition, step: step).frame(width: dial, height: dial)
                Spacer(minLength: 0)
                Text(text).font(.bronzeUI(small ? 8 : 11)).foregroundStyle(Color.bronzeLight).lineLimit(1).minimumScaleFactor(0.7)
            }.padding(5).frame(width: g.size.width, height: g.size.height)
                .background(Color(bronzeHex: 0x150f14))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(border.opacity(0.6), lineWidth: 1))
        }
    }
}


struct BronzeDefaultSettingsLock: ViewModifier {
    let active: Bool
    @State private var showingNotice = false
    func body(content: Content) -> some View {
        content.disabled(active)
            .overlay {
                if active {
                    Color.clear.contentShape(Rectangle())
                        .gesture(DragGesture(minimumDistance: 0).onChanged { _ in showingNotice = true })
                        .onTapGesture { showingNotice = true }
                        .accessibilityLabel("Parâmetros bloqueados no modo Default")
                        .accessibilityAddTraits(.isButton)
                        .accessibilityAction { showingNotice = true }
                }
            }
            .alert("Configuração Default", isPresented: $showingNotice) {
                Button("Entendi", role: .cancel) { }
            } message: { Text("Mude para User para configurar.") }
    }
}
