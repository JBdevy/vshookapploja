import SwiftUI

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
    @Environment(\.verticalSizeClass) private var sizeClass
    private var rotary: BronzeOrganRotary { model.organRotary }
    var body: some View {
        VStack(spacing: 24) {
            HStack(spacing: 10) {
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
                }.frame(maxWidth: .infinity).frame(height: 74)
                rotaryKnob("Slow", definition: .init("Slow", 0.2, 2, 1.2, .hertz), key: \.slowHz, tint: .yellow)
                rotaryKnob("Fast", definition: .init("Fast", 2, 10, 10, .hertz), key: \.fastHz, tint: .orange)
                rotaryKnob("Acceleration", definition: .init("Acceleration", 100, 10000, 1200, .milliseconds), key: \.rampSeconds, tint: .purple, multiplier: 1000)
                rotaryKnob("Depth", definition: .init("Depth", 0, 1, 1, .percent), key: \.depth, tint: .mint)
            }.padding(12).background(.black.opacity(0.55)).clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.green.opacity(0.5)))
            HStack(spacing: 18) {
                ForEach(0..<9, id: \.self) { index in
                    BronzeOrganDrawbar(index: index, value: Binding(get: { model.organDrawbars[index] }, set: { model.setOrganDrawbar(index, normalized: $0) }))
                }
            }.frame(maxWidth: 760).frame(height: sizeClass == .compact ? 210 : 390).padding(14)
                .background(Color(bronzeHex: 0x060d07)).clipShape(RoundedRectangle(cornerRadius: 9))
        }.padding(24).background(BronzeTheme.panelGradient)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .frame(maxWidth: 1110).frame(maxWidth: .infinity)
    }
    private func speedButton(_ title: String, speed: Int) -> some View {
        Button(title) { var next = rotary; next.speed = speed; model.setOrganRotary(next) }
            .buttonStyle(BronzeDeckButtonStyle(palette: rotary.speed == speed ? .green : .grey, selected: rotary.speed == speed))
    }
    private func rotaryKnob(_ title: String, definition: BronzeProcessorParameter, key: WritableKeyPath<BronzeOrganRotary, Double>, tint: Color, multiplier: Double = 1) -> some View {
        VStack(spacing: 6) {
            Text(title).font(.bronzeUI(12)).lineLimit(1).minimumScaleFactor(0.7)
            BronzeDial(value: Binding(get: { definition.normalized(rotary[keyPath: key] * multiplier) }, set: { value in
                var next = rotary; next[keyPath: key] = definition.value(value) / multiplier; model.setOrganRotary(next)
            }), tint: tint, label: title).frame(width: 58, height: 58)
            Text(definition.text(rotary[keyPath: key] * multiplier)).font(.bronzeUI(12)).foregroundStyle(Color.bronzeLight)
        }.frame(maxWidth: .infinity).padding(8).background(.black.opacity(0.35))
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color.green.opacity(0.3)))
    }
}

struct BronzeOrganDrawbar: View {
    let index: Int
    @Binding var value: Double
    private var tint: Color { index < 2 ? Color(bronzeHex: 0x8b3325) : [4, 6, 7].contains(index) ? Color(bronzeHex: 0x25252a) : Color(bronzeHex: 0xe1ddd5) }
    var body: some View {
        VStack(spacing: 8) {
            Text(["16", "5⅓", "8", "4", "2⅔", "2", "1⅗", "1⅓", "1"][index]).font(.bronzeUI(13)).foregroundStyle(Color.bronzeLight)
            GeometryReader { proxy in
                HStack(spacing: 5) {
                    ZStack(alignment: .top) {
                        Color.black
                        VStack(spacing: 0) { ForEach((1...8).reversed(), id: \.self) { stage in
                            Text("\(stage)").font(.bronzeUI(10)).foregroundStyle(.gray).frame(maxHeight: .infinity)
                        }}.padding(.vertical, 12)
                        RoundedRectangle(cornerRadius: 8).fill(tint)
                            .frame(height: 65).overlay(RoundedRectangle(cornerRadius: 3).stroke(.gray.opacity(0.7)))
                            .offset(y: value * max(1, proxy.size.height - 65))
                    }.clipShape(RoundedRectangle(cornerRadius: 3)).overlay(RoundedRectangle(cornerRadius: 3).stroke(.gray.opacity(0.4)))
                    VStack(spacing: 3) { ForEach((0..<16).reversed(), id: \.self) { segment in
                        Rectangle().fill(Double(segment) < (value * 8).rounded() * 2 ? Color.green : Color.green.opacity(0.12))
                    }}.frame(width: 12)
                }.contentShape(Rectangle()).gesture(DragGesture(minimumDistance: 0).onChanged { gesture in
                    let position = Double((gesture.location.y - 32.5) / max(1, proxy.size.height - 65))
                    value = (min(1, max(0, position)) * 8).rounded() / 8
                })
            }
            Text("\(Int((value * 8).rounded()))").font(.bronzeUI(14))
        }.accessibilityElement().accessibilityLabel("Drawbar \(index + 1)").accessibilityValue("\(Int((value * 8).rounded())) de 8")
            .accessibilityAdjustableAction { direction in value = min(1, max(0, value + (direction == .increment ? 0.125 : -0.125))) }
    }
}

struct BronzeModuleRoutingHeader: View {
    @ObservedObject var model: BronzeNativeAppModel
    let index: Int
    private var config: BronzeModulePerformance { model.modulePerformance[index] }
    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 7) {
                Text("Dispositivo MIDI").font(.bronzeUI(11)).foregroundStyle(.secondary)
                Menu(config.input < 0 ? "Todos os dispositivos ativos" : "MIDI \(config.input + 1)") {
                    Button("Todos os dispositivos ativos") { edit { $0.input = -1 } }
                    ForEach(0..<3, id: \.self) { slot in
                        Button("MIDI \(slot + 1) · \(model.midiDevices.indices.contains(slot) ? model.midiDevices[slot].name : "Não conectado")") { edit { $0.input = slot } }
                    }
                }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(height: 44)
            }.frame(maxWidth: .infinity)
            VStack(alignment: .leading, spacing: 7) {
                Text("Saída do módulo").font(.bronzeUI(11)).foregroundStyle(.secondary)
                Menu(config.outputStart == 0 && config.outputCount == 2 ? "Padrão · 1 + 2" : "\(config.outputStart + 1)\(config.outputCount == 2 ? " + \(config.outputStart + 2)" : "")") {
                    ForEach(0..<16, id: \.self) { pair in
                        Button("Saída \(pair * 2 + 1) + \(pair * 2 + 2)") { edit { $0.outputStart = pair * 2; $0.outputCount = 2 } }
                    }
                    ForEach(0..<32, id: \.self) { channel in
                        Button("Mono · \(channel + 1)") { edit { $0.outputStart = channel; $0.outputCount = 1 } }
                    }
                }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(height: 44)
            }.frame(maxWidth: .infinity)
            Menu {
                ForEach([8, 16, 32, 64, 96, 128], id: \.self) { count in Button("\(count)") { edit { $0.polyphony = count } } }
            } label: { VStack { Text("Polifonia"); Text("\(config.polyphony)").font(.bronzeUI(20)) } }
                .buttonStyle(BronzeDeckButtonStyle(palette: .bronze)).frame(width: 110, height: 66)
            if index != 7 {
                Button { edit { $0.mode = $0.mode == 0 ? 1 : 0 } } label: { VStack { Text("Modo"); Text(config.mode == 0 ? "Poly" : "Mono").font(.bronzeUI(18)) } }
                    .buttonStyle(BronzeDeckButtonStyle(palette: config.mode == 0 ? .blue : .purple)).frame(width: 90, height: 66)
            }
        }.padding(12).modifier(BronzeDeckSurface())
    }
    private func edit(_ change: (inout BronzeModulePerformance) -> Void) {
        var next = config; change(&next); model.setPerformance(next, moduleIndex: index)
    }
}

struct BronzeModuleEnvelopeGrid: View {
    @Environment(\.bronzeContentSize) private var contentSize
    @ObservedObject var model: BronzeNativeAppModel
    let index: Int
    let openFilter: () -> Void
    private let envelopeColors: [UInt32] = [0xff4d67, 0xff9f2f, 0x39d878, 0xa855f7, 0xff9f2f]
    // Reserve routing, tabs, performance controls and spacing before sizing both rows.
    private var columnCount: Int { contentSize.width < 900 ? 3 : 4 }
    private var rowHeight: CGFloat { max(256, (contentSize.height - 303) / 2) }
    private var dialSize: CGFloat { min(176, rowHeight - 112, max(120, contentSize.width / CGFloat(columnCount) - 32)) }
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: columnCount), spacing: 6) {
            ForEach(Array(BronzeNativeAppModel.EnvelopeParameter.allCases.enumerated()), id: \.element.id) { offset, parameter in
                cell(parameter.rawValue, color: envelopeColors[offset], value: Binding(
                    get: { model.envelopeValue(parameter, moduleIndex: index) },
                    set: { model.setEnvelopeValue(parameter, moduleIndex: index, normalized: $0) }),
                    text: model.envelopeValueText(parameter, moduleIndex: index))
            }
            if index < 6 {
                cell("Cutoff", color: 0x25b9ff, value: Binding(
                    get: { BronzeToneParameter.cutoff.definition.normalized(model.moduleTones[index][.cutoff]) },
                    set: { value in var tone = model.moduleTones[index]; tone[.cutoff] = BronzeToneParameter.cutoff.definition.value(value); model.setTone(tone, moduleIndex: index) }),
                    text: BronzeToneParameter.cutoff.definition.text(model.moduleTones[index][.cutoff]))
                    .contextMenu { Button("Filtro e envelope") { openFilter() } }
            } else {
                cell("Mod", color: 0x25b9ff, value: Binding(get: { model.modulePerformance[index].modulationIntensity }, set: { value in
                    var config = model.modulePerformance[index]; config.modulationIntensity = value; model.setPerformance(config, moduleIndex: index)
                }), text: String(format: "%.0f%%", model.modulePerformance[index].modulationIntensity * 100))
            }
            cell("Limite Velocity", color: 0x9d8cff, value: Binding(get: { Double(model.modulePerformance[index].velocityCeiling - 1) / 126 }, set: { value in
                var config = model.modulePerformance[index]; config.velocityCeiling = 1 + Int((value * 126).rounded()); model.setPerformance(config, moduleIndex: index)
            }), text: "\(model.modulePerformance[index].velocityCeiling)")
            cell("Gain", color: 0xffbd4a, value: Binding(get: { BronzeToneParameter.gain.definition.normalized(model.moduleTones[index][.gain]) }, set: { value in
                var tone = model.moduleTones[index]; tone[.gain] = BronzeToneParameter.gain.definition.value(value); model.setTone(tone, moduleIndex: index)
            }), text: BronzeToneParameter.gain.definition.text(model.moduleTones[index][.gain]))
        }
    }
    private func cell(_ title: String, color: UInt32, value: Binding<Double>, text: String) -> some View {
        VStack(spacing: 4) {
            if title == "Cutoff" {
                Button("Envelope", action: openFilter).buttonStyle(BronzeDeckButtonStyle(palette: .cyan, size: 12)).frame(height: 28)
            }
            Text(title).font(.bronzeUI(20)).foregroundStyle(Color(bronzeHex: color)).lineLimit(1).minimumScaleFactor(0.7)
            Spacer(minLength: 3)
            BronzeDial(value: value, tint: Color(bronzeHex: color), label: title).frame(width: dialSize, height: dialSize)
            Spacer(minLength: 3)
            Text(text).font(.bronzeUI(18))
        }.frame(maxWidth: .infinity).padding(8).frame(height: rowHeight)
            .background(LinearGradient(colors: [Color(bronzeHex: color).opacity(0.12), Color(bronzeHex: 0x0b090d)], startPoint: .top, endPoint: .bottom))
            .clipShape(RoundedRectangle(cornerRadius: 3)).overlay(RoundedRectangle(cornerRadius: 3).stroke(Color(bronzeHex: color).opacity(0.6)))
    }

}

struct BronzeModulePerformanceCards: View {
    @ObservedObject var model: BronzeNativeAppModel
    let index: Int
    let advanced: () -> Void
    private var config: BronzeModulePerformance { model.modulePerformance[index] }
    var body: some View {
        HStack(spacing: 4) {
            Button(action: advanced) {
                HStack(spacing: 8) {
                    Text("Velocity").font(.bronzeUI(17))
                    Canvas { context, size in
                        var curve = Path()
                        for i in 0..<5 {
                            let point = CGPoint(x: CGFloat(i) / 4 * size.width, y: (1 - Double(config.velocityCurve[i]) / 127) * size.height)
                            if i == 0 { curve.move(to: point) } else { curve.addLine(to: point) }
                        }
                        context.stroke(curve, with: .color(.white), lineWidth: 2)
                    }.frame(height: 32)
                }.padding(12).frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(LinearGradient(colors: [Color(bronzeHex: 0x7763ff), Color(bronzeHex: 0x31227c)], startPoint: .topLeading, endPoint: .bottomTrailing))
            }.buttonStyle(.plain).modifier(BronzeDeckSurface(radius: 3))
            if index < 6 {
                HStack(spacing: 8) {
                    VStack(spacing: 5) {
                        HStack(spacing: 5) {
                            Button("Sync") { edit { $0.glideSync.toggle() } }.buttonStyle(BronzeDeckButtonStyle(palette: config.glideSync ? .green : .red))
                            Button("Auto") { edit { $0.portamento.toggle() } }.buttonStyle(BronzeDeckButtonStyle(palette: config.portamento ? .green : .grey))
                        }
                        HStack(spacing: 5) {
                            Button("Config", action: advanced).buttonStyle(BronzeDeckButtonStyle(palette: .grey))
                            Button("No Sens") { edit { $0.noSens.toggle() } }.buttonStyle(BronzeDeckButtonStyle(palette: config.noSens ? .green : .red))
                        }
                    }
                    VStack(spacing: 2) {
                        Text("Glide")
                        BronzeDial(value: Binding(get: { config.glideMs / 5000 }, set: { value in edit { $0.glideMs = value * 5000 } }), tint: .cyan, label: "Glide").frame(width: 64, height: 64).disabled(config.glideSync)
                        Text(String(format: "%.0f ms", config.glideTime(bpm: model.tempo))).font(.bronzeUI(12)).foregroundStyle(.cyan)
                    }.frame(width: 88)
                }.padding(8).frame(maxWidth: .infinity).modifier(BronzeDeckSurface(radius: 3))
            }
            HStack(spacing: 8) {
                Text("Mod")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)], spacing: 4) {
                    ForEach(index == 7 ? [0, 1] : index == 6 ? [4, 2, 3] : [0, 1, 2, 3], id: \.self) { mode in
                        Button(["User", "LFO", "Tremolo", "Pan", "Rotary"][mode]) { edit { $0.modulationMode = mode } }
                            .buttonStyle(BronzeDeckButtonStyle(palette: config.modulationMode == mode ? .green : .grey, selected: config.modulationMode == mode)).frame(height: 40)
                    }
                    if index == 6 { Button("Toggle") { model.toggleOrganRotarySpeed() }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(height: 40) }
                }
                if index != 7 {
                    VStack(spacing: 3) {
                        BronzeDial(value: Binding(get: { (config.modulationRate - 0.1) / 19.9 }, set: { value in edit { $0.modulationRate = 0.1 + value * 19.9 } }), tint: .orange, label: "Rate do Mod").frame(width: 64, height: 64).disabled(config.modulationMode == 0 || config.modulationMode == 4)
                            .contextMenu { Button("Intensity", action: advanced) }
                        Text(String(format: "%.2f Hz", config.modulationRate)).font(.bronzeUI(12)).foregroundStyle(.purple)
                    }
                }
            }.padding(8).frame(maxWidth: .infinity, maxHeight: .infinity).modifier(BronzeDeckSurface(radius: 3))
        }.frame(height: 112)
    }
    private func edit(_ change: (inout BronzeModulePerformance) -> Void) {
        var next = config; change(&next); model.setPerformance(next, moduleIndex: index)
    }
}
