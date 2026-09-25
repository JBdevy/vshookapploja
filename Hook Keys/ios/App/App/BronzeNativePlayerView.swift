import SwiftUI

extension Color {
    init(bronzeHex value: UInt32) {
        self.init(red: Double((value >> 16) & 255) / 255,
                  green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}

extension Font {
    static func bronzeUI(_ size: CGFloat) -> Font { .custom("JetBrainsMono-ExtraBold", fixedSize: size) }
}

enum BronzeDeckPalette {
    case bronze, blue, green, red, yellow, purple, cyan, pink, grey, dark
    var colors: [Color] {
        let hex: [UInt32]
        switch self {
        case .bronze: hex = [0xe8ad70, 0x6f3518, 0xc8874a]
        case .blue: hex = [0x174f8e, 0x061b38, 0x347bc0]
        case .green: hex = [0x18874e, 0x064526, 0x459a6b]
        case .red: hex = [0xf05a4f, 0x851916, 0xff887d]
        case .yellow: hex = [0xffe15a, 0xc97908, 0xfff19a]
        case .purple: hex = [0xbd63ff, 0x6922a6, 0xdda5ff]
        case .cyan: hex = [0x19c9d8, 0x075660, 0x8bf0ff]
        case .pink: hex = [0xff5f9e, 0x8d1450, 0xffa8cb]
        case .grey: hex = [0x343e50, 0x151c29, 0x68768e]
        case .dark: hex = [0x2c2334, 0x110b17, 0x514558]
        }
        return hex.map(Color.init(bronzeHex:))
    }
}

struct BronzeDeckButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    var palette: BronzeDeckPalette = .bronze
    var selected = false
    var size: CGFloat = 12
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.bronzeUI(size)).lineLimit(1).minimumScaleFactor(0.65)
            .foregroundStyle(palette == .bronze || palette == .yellow ? Color.black : Color.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal, 3)
            .background(LinearGradient(colors: palette.colors.prefix(2).map { $0 }, startPoint: .topLeading, endPoint: .bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(selected ? .white : (palette == .bronze ? .clear : palette.colors[2]), lineWidth: selected ? 2 : 1).allowsHitTesting(false))
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(.white.opacity(0.06), lineWidth: 1).padding(1).allowsHitTesting(false))
            .brightness(configuration.isPressed ? 0.15 : 0)
            .saturation(enabled ? 1 : 0).opacity(enabled ? 1 : 0.5)
    }
}

struct BronzeDeckSurface: ViewModifier {
    @Environment(\.bronzeConfigurationBorders) private var configurationBorders
    var radius: CGFloat = 5
    func body(content: Content) -> some View {
        content.background(BronzeTheme.panelGradient)
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(configurationBorders ? Color.bronze.opacity(0.8) : .clear, lineWidth: 1).allowsHitTesting(false))
    }
}

/// Native counterpart of the original player: transport, mixer, eight modules and bank panel.
struct BronzeNativePlayerView<Pads: View>: View {
    @ObservedObject var model: BronzeNativeAppModel
    let openModule: (Int) -> Void
    let openSound: (Int) -> Void
    let openPreset: (Int) -> Void
    let openTracks: () -> Void
    let openSettings: () -> Void
    let openAccount: () -> Void
    @ViewBuilder let pads: () -> Pads
    @State private var showingPads = false
    @AppStorage("bronze.showKeyboard") private var showingKeyboard = false
    @AppStorage("bronze.keyboardFullRange") private var fullKeyboard = false
    @State private var showAbout = false
    @State private var openPlaylistAfterAbout = false
    @State private var splitPlaylist = false
    @State private var showClick = false
    @State private var showTempo = false
    @State private var tempoText = ""
    @State private var renameBank = false
    @State private var bankName = ""
    @State private var bankToRename = 0
    @State private var selectedSlot: Int?
    @State private var copiedPreset: BronzePresetSlot?
    @State private var pasteTarget: Int?
    @State private var confirmPaste = false
    private let busNames = ["Playlist", "Pads", "Efects", "Click", "Módulos"]
    private let busColors: [UInt32] = [0xff3b5c, 0x35d36f, 0xa855f7, 0x24b8ff, 0xff8a1f]

    var body: some View {
        GeometryReader { geometry in
            let compact = geometry.size.height < 500 || splitPlaylist
            let gap: CGFloat = 2
            HStack(spacing: gap) {
              if splitPlaylist {
                BronzeNativePlaylistSidebar(model: model)
                  .frame(width: geometry.size.width * 0.30).modifier(BronzeDeckSurface())
              }
              VStack(spacing: gap) {
                transport(compact: compact || splitPlaylist).frame(height: compact ? 32 : 47)
                performanceContent(compact: compact, height: geometry.size.height)
            }
              }
            .padding(1)
            .font(.bronzeUI(compact ? 10 : 12))
            .background(BronzeScreenBackground())
            .disabled(model.backupBusy)
            .overlay(alignment: .bottom) {
                if model.isApplyingSnapshot { ProgressView("Carregando configuração…").padding(8).background(.black.opacity(0.9)).clipShape(Capsule()) }
            }
        }
        .ignoresSafeArea(.container, edges: .bottom)
        .sheet(isPresented: $showAbout, onDismiss: {
            if openPlaylistAfterAbout { openPlaylistAfterAbout = false; openTracks() }
        }) {
            BronzeNativeModal(title: "Bronze Keys") {
                VStack(spacing: 18) {
                    Image("BronzeBrand").resizable().scaledToFit().frame(height: 130)
                    Text("ReiVs apresenta").foregroundStyle(.secondary)
                    Text("BRONZE KEYS").font(.bronzeUI(30)).foregroundStyle(Color.bronzeLight)
                    Text("Performance Instrument").font(.bronzeUI(16))
                    Button("Playlist") { openPlaylistAfterAbout = true; showAbout = false }.buttonStyle(BronzeDeckButtonStyle(palette: .cyan)).frame(width: 300, height: 48)
                }.frame(maxWidth: .infinity).padding(30)
            }
        }
        .sheet(isPresented: $showClick) {
            BronzeNativeModal(title: "Metrônomo") {
                VStack(spacing: 24) {
                    Text("Som do click").font(.bronzeUI(16))
                    HStack { ForEach(1...5, id: \.self) { sound in
                        Button("Click \(sound)") { model.selectMetronomeClick(sound) }
                            .buttonStyle(BronzeDeckButtonStyle(palette: .cyan, selected: model.metronomeClickSound == sound))
                    }}.frame(height: 44)
                    HStack { ForEach([2, 3, 4, 6, 7, 9, 12], id: \.self) { beats in
                        Button("\(beats)/\(beats >= 6 ? 8 : 4)") { model.setTimeSignature(numerator: beats, denominator: beats >= 6 ? 8 : 4) }
                            .buttonStyle(BronzeDeckButtonStyle(selected: model.timeSignatureNumerator == beats))
                    }}.frame(height: 44)
                }.padding()
            }
        }
        .sheet(isPresented: $renameBank) {
            BronzeNativeModal(title: "Nome do banco") {
                TextField("Nome", text: $bankName).textFieldStyle(BronzeNativeFieldStyle())
                Button("Salvar") { model.renamePresetBank(bankToRename, name: bankName); renameBank = false }
                    .buttonStyle(BronzeDeckButtonStyle(palette: .green)).frame(height: 44)
            }
        }
        .sheet(isPresented: $showTempo) {
            BronzeNativeModal(title: "BPM") {
                HStack {
                    TextField("BPM", text: $tempoText).keyboardType(.decimalPad).textFieldStyle(BronzeNativeFieldStyle())
                    Button("Salvar") {
                        if let value = Double(tempoText.replacingOccurrences(of: ",", with: ".")) { model.setTempo(value); showTempo = false }
                    }.buttonStyle(BronzeDeckButtonStyle(palette: .green)).frame(width: 110, height: 44)
                }.padding(20)
            }
        }
        .alert("Substituir este preset?", isPresented: $confirmPaste) {
            Button("Cancelar", role: .cancel) { pasteTarget = nil }
            Button("Colar", role: .destructive) { paste() }
        } message: { Text("O preset copiado será salvo na posição selecionada.") }
    }

    private func performanceContent(compact: Bool, height: CGFloat) -> some View {
        VStack(spacing: 2) {
            mixerHeader(compact: compact).frame(height: compact ? 44 : 62)
            if showingPads {
                pads().frame(maxHeight: .infinity)
            } else {
                HStack(spacing: 2) {
                    ForEach(0..<8, id: \.self) { index in module(index, compact: compact) }
                }.frame(maxHeight: .infinity).disabled(model.isApplyingSnapshot)
                presetPanel(compact: compact)
                    .frame(height: compact ? 106 : min(172, height * 0.21))
            }
        }
    }

    private func transport(compact: Bool) -> some View {
        HStack(spacing: 2) {
            HStack(spacing: 4) {
                    Image("BronzeBrand").resizable().scaledToFit().frame(width: compact ? 23 : 32)
                    (Text("Bronze").foregroundColor(.bronzeLight) + Text(" Keys").foregroundColor(.white))
                        .font(.bronzeUI(compact ? 12 : 16))
                }.padding(5).frame(width: compact ? 138 : 176).frame(maxHeight: .infinity).modifier(BronzeDeckSurface())
                .bronzeTapHold(tap: {
                    if splitPlaylist { splitPlaylist = false } else { showAbout = true }
                }, hold: { splitPlaylist = true })
                .accessibilityElement(children: .ignore)
                .accessibilityAddTraits(.isButton).accessibilityLabel("Bronze Keys")
                .accessibilityIdentifier("bronze.logo")
                .accessibilityAction(named: "Mostrar ou ocultar playlist lateral") { splitPlaylist.toggle() }
            HStack(spacing: 4) {
                Button(model.loopPlaying ? "Stop" : "Play") { model.toggleLoopPlayback() }
                    .buttonStyle(BronzeDeckButtonStyle(palette: model.loopPlaying ? .red : .green, size: compact ? 9 : 11))
                    .frame(width: compact ? 34 : 44).disabled(model.selectedLoop == nil || model.loadingLoop)
                Button { openTracks() } label: {
                    Text(model.selectedLoop?.name ?? "Nenhuma música selecionada")
                        .font(.bronzeUI(compact ? 8 : 10)).lineLimit(1).frame(maxWidth: .infinity)
                }.buttonStyle(.plain).accessibilityLabel("Abrir playlist")
                Text(remainingTime).font(.bronzeUI(compact ? 8 : 10)).foregroundStyle(.white)
            }.padding(5).background(Color(bronzeHex: 0x380d1b)).clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(bronzeHex: 0xff3b5c).opacity(0.7)))
                .overlay(alignment: .bottomLeading) { GeometryReader { proxy in
                    Color.pink.frame(width: proxy.size.width * min(1, model.loopPosition / max(1, model.loopDuration)), height: 2).frame(maxHeight: .infinity, alignment: .bottom)
                }.allowsHitTesting(false) }
                .frame(maxWidth: .infinity)
            if !splitPlaylist {
            let buttonWidth: CGFloat = compact ? 35 : 48
            HStack(spacing: 3) {
                ForEach(0..<4, id: \.self) { index in
                    pitchButton(octave: index < 2, direction: index % 2 == 0 ? -1 : 1, compact: compact)
                        .frame(width: buttonWidth)
                }
                Button(model.mixer.mono ? "MONO" : "STEREO") { model.toggleGlobalMono() }
                    .buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: model.mixer.mono, size: compact ? 7 : 9))
                    .frame(width: buttonWidth)
                Button("PANIC") { model.panic() }
                    .buttonStyle(BronzeDeckButtonStyle(palette: .red, size: compact ? 7 : 9))
                    .frame(width: buttonWidth)
            }.padding(5).modifier(BronzeDeckSurface())
            }
            Button(action: openSettings) { Image(systemName: "gearshape") }.accessibilityLabel("Configurações").buttonStyle(BronzeDeckButtonStyle(palette: .yellow, size: 17)).frame(width: compact ? 30 : 40)
            Button(action: openAccount) { Image(systemName: "person") }.accessibilityLabel("Conta").buttonStyle(BronzeDeckButtonStyle(palette: .green, size: 17)).frame(width: compact ? 30 : 42)
            VStack(spacing: 3) { Text("RAM").foregroundStyle(Color.bronzeLight); Text(model.memoryPercent.map { "\($0)%" } ?? "--").foregroundStyle(.white) }.font(.bronzeUI(compact ? 7 : 9)).frame(width: compact ? 34 : 49).frame(maxHeight: .infinity).modifier(BronzeDeckSurface())
                .accessibilityElement(children: .combine).accessibilityIdentifier("bronze.memory")
        }.padding(.leading, compact ? 2 : 6).padding(.trailing, compact ? 8 : 10).padding(.top, 3)
    }

    private var remainingTime: String {
        let seconds = max(0, Int(model.loopDuration - model.loopPosition))
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }

    private func pitchButton(octave: Bool, direction: Int, compact: Bool) -> some View {
        let value = octave ? model.mixer.octave : model.mixer.transpose
        return Button("\(octave ? "OCT" : "TRS") \(direction < 0 ? "−" : "+")\(value * direction > 0 ? "\(abs(value))" : "")") {
            model.shiftGlobalPitch(octave: octave ? direction : 0, transpose: octave ? 0 : direction)
        }.buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: value * direction > 0, size: compact ? 7 : 9))
    }

    private func mixerHeader(compact: Bool) -> some View {
        HStack(spacing: compact ? 5 : 12) {
            Button(showingPads ? "Módulos" : "Pads - Efects") { showingPads.toggle(); model.page = showingPads ? .pads : .modules }
                .buttonStyle(BronzeDeckButtonStyle(palette: .bronze, selected: showingPads, size: compact ? 10 : 13))
                .frame(width: compact ? 90 : 132, height: compact ? 38 : 50)
            HStack(spacing: compact ? 3 : 5) {
                ForEach(0..<5, id: \.self) { bus in
                    HStack(spacing: compact ? 2 : 4) {
                        Text(busNames[bus]).font(.bronzeUI(compact ? 8 : 10)).foregroundStyle(.white)
                        BronzeDial(value: Binding(get: { model.mixer.levels[bus] }, set: { model.setMixerLevel(bus, value: $0) }),
                            tint: Color(bronzeHex: busColors[bus]), label: "Volume \(busNames[bus])")
                            .frame(width: compact ? 24 : 40, height: compact ? 24 : 40)
                            .modifier(BronzeLearnOnHold(model: model, target: "output:\(bus)"))
                            .contextMenu { Button(model.mixer.enabled[bus] ? "Desligar saída" : "Ligar saída") { model.toggleMixerOutput(bus) } }
                            .opacity(model.mixer.enabled[bus] ? 1 : 0.35)
                        BronzeMiniMeter(level: model.outputLevels[bus]).frame(width: compact ? 5 : 7, height: compact ? 24 : 38)
                        Text(model.mixer.levels[bus] <= 0 ? "−∞ dB" : String(format: "%.1f dB", -90 + model.mixer.levels[bus] * 90))
                            .font(.bronzeUI(compact ? 5 : 8)).foregroundStyle(Color(bronzeHex: busColors[bus]))
                    }.frame(maxWidth: .infinity)
                }
            }.frame(maxWidth: .infinity)
            Button { model.toggleMetronome() } label: { Image(systemName: "metronome") }
                .buttonStyle(BronzeDeckButtonStyle(palette: .cyan, selected: model.metronomeEnabled, size: 24))
                .frame(width: compact ? 36 : 52, height: compact ? 38 : 52)
                .bronzeTapHold(tap: { model.toggleMetronome() }, hold: { showClick = true })
                .accessibilityIdentifier("bronze.metronome").accessibilityValue(model.metronomeEnabled ? "Ligado" : "Desligado")
            HStack(spacing: 4) {
                Button("−") { model.setTempo(model.tempo - 0.5) }.buttonStyle(BronzeDeckButtonStyle(palette: .grey, size: 18)).frame(width: compact ? 25 : 34)
                Button { model.tapTempo() } label: {
                    VStack(spacing: 0) { Text(String(format: model.tempo.truncatingRemainder(dividingBy: 1) == 0 ? "%.0f" : "%.1f", model.tempo)).font(.bronzeUI(compact ? 19 : 26)); Text("BPM").font(.bronzeUI(9)) }
                }.buttonStyle(BronzeDeckButtonStyle(palette: .yellow)).frame(width: compact ? 57 : 78).accessibilityLabel("Tap tempo")
                    .bronzeTapHold(tap: { model.tapTempo() }, hold: { tempoText = String(format: "%.1f", model.tempo); showTempo = true })
                Button("+") { model.setTempo(model.tempo + 0.5) }.buttonStyle(BronzeDeckButtonStyle(palette: .grey, size: 18)).frame(width: compact ? 25 : 34)
            }.frame(height: compact ? 38 : 52)
        }.padding(.horizontal, 8).modifier(BronzeDeckSurface())
    }

    private func module(_ index: Int, compact: Bool) -> some View {
        let config = model.modulePerformance[index]
        let sound = index == 6 ? "Organ" : index == 7 ? "Synth" : model.moduleSoundFonts[index]?.name ?? "+"
        return VStack(spacing: compact ? 3 : 6) {
            Text("\(index + 1)").font(.bronzeUI(compact ? 10 : 14)).foregroundStyle(Color(bronzeHex: 0xd7dce5))
            Button("Config") { openModule(index) }.buttonStyle(BronzeDeckButtonStyle(size: compact ? 9 : 12)).frame(height: compact ? 25 : 37)
            Text(sound).font(.bronzeUI(sound == "+" ? 24 : compact ? 10 : 12)).lineLimit(1).minimumScaleFactor(0.6)
                .foregroundStyle(sound == "+" ? Color.white : Color.black)
                .frame(maxWidth: .infinity).frame(height: compact ? 26 : 37)
                .background(LinearGradient(colors: [Color(bronzeHex: 0x18874e), Color(bronzeHex: 0x064526)], startPoint: .top, endPoint: .bottom))
                .clipShape(RoundedRectangle(cornerRadius: 7))
                .overlay(RoundedRectangle(cornerRadius: 7).stroke(Color(bronzeHex: 0x459a6b)))
                .bronzeTapHold(tap: { openSound(index) }, hold: { model.toggleModuleSolo(index) })
                .accessibilityIdentifier("bronze.sound.\(index)")
                .accessibilityAddTraits(.isButton).accessibilityLabel("Timbre do módulo \(index + 1): \(sound)")
                .accessibilityAction { openSound(index) }
                .accessibilityAction(named: "Solo") { model.toggleModuleSolo(index) }
            HStack(spacing: 4) {
                VStack(spacing: compact ? 3 : 6) {
                    BronzeModuleFader(value: Binding(get: { model.moduleFaders[index] }, set: { model.setModuleFader(index, normalized: $0) }), level: model.moduleLevels[index], label: "Volume do módulo \(index + 1)")
                        .modifier(BronzeLearnOnHold(model: model, target: "fader:\(index)"))
                    Button(model.moduleReceivesNotes(index) ? "ON" : "OFF") { model.toggleModuleEnabled(index) }
                        .buttonStyle(BronzeDeckButtonStyle(palette: model.moduleReceivesNotes(index) ? .green : .red, size: compact ? 8 : 11))
                        .frame(height: compact ? 23 : 31)
                        .modifier(BronzeLearnOnHold(model: model, target: "on:\(index)", tapAction: { model.toggleModuleEnabled(index) }))
                }.frame(maxWidth: .infinity)
                if !splitPlaylist {
                VStack(spacing: compact ? 4 : 9) {
                    modulePair {
                        rangeButton(index, low: true, note: config.lowNote, compact: compact)
                        rangeButton(index, low: false, note: config.highNote, compact: compact)
                    }
                    modulePair {
                        moduleAction("OCT +", active: config.octave > 0, compact: compact) { edit(index) { $0.octave = min(3, $0.octave + 1) } }
                        moduleAction("OCT −", active: config.octave < 0, compact: compact) { edit(index) { $0.octave = max(-3, $0.octave - 1) } }
                    }
                    modulePair {
                        moduleAction("HLD", active: config.sustain, compact: compact) { edit(index) { $0.sustain.toggle() } }
                        moduleAction("MOD", active: config.modulation, compact: compact) { edit(index) { $0.modulation.toggle() } }
                    }
                }.frame(maxWidth: .infinity)
                }
            }.frame(maxHeight: .infinity)
        }.padding(compact ? 5 : 10).frame(maxWidth: .infinity).modifier(BronzeDeckSurface())
            .saturation(model.soloModule != nil && model.soloModule != index ? 0 : 1)
    }

    private func modulePair<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 4, content: content)
    }

    private func moduleAction(_ name: String, active: Bool, compact: Bool, action: @escaping () -> Void) -> some View {
        Button(name, action: action).buttonStyle(BronzeDeckButtonStyle(palette: active ? .green : (name == "HLD" || name == "MOD" ? .red : .dark), size: compact ? 7 : 9))
    }

    private func rangeButton(_ index: Int, low: Bool, note: Int, compact: Bool) -> some View {
        let learning = model.rangeLearnModule == index && model.rangeLearnLow == low
        let name = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][note % 12] + "\(note / 12 - 2)"
        return moduleAction(learning ? "…" : name, active: learning, compact: compact) { model.learnRange(module: index, low: low) }
            .accessibilityLabel("\(low ? "Nota inicial" : "Nota final") do módulo \(index + 1): \(name). Toque uma nota para definir.")
            .contextMenu { ForEach([0, 24, 36, 48, 60, 72, 84, 96, 127], id: \.self) { value in
                Button("Nota \(value)") { edit(index) { if low { $0.lowNote = min(value, $0.highNote) } else { $0.highNote = max(value, $0.lowNote) } } }
            } }
    }

    private func edit(_ index: Int, change: (inout BronzeModulePerformance) -> Void) {
        var config = model.modulePerformance[index]; change(&config); model.setPerformance(config, moduleIndex: index)
    }

    private func presetPanel(compact: Bool) -> some View {
        VStack(spacing: compact ? 4 : 7) {
            HStack(spacing: 5) {
                Button(copiedPreset == nil ? "Copy" : "Paste") {
                    if copiedPreset == nil {
                        if let index = selectedSlot ?? model.activePreset { copiedPreset = model.presets[index].modules == nil ? nil : model.presets[index] }
                    } else if let index = selectedSlot ?? model.activePreset {
                        pasteTarget = index
                        if model.presets[index].modules == nil { paste() } else { confirmPaste = true }
                    }
                }.buttonStyle(BronzeDeckButtonStyle(palette: copiedPreset == nil ? .red : .yellow, size: compact ? 9 : 12))
                    .contextMenu { Button("Cancelar cópia") { copiedPreset = nil } }
                ForEach(0..<6, id: \.self) { bank in
                    Button(model.presetBankName(bank)) { model.selectPresetBank(bank) }
                        .buttonStyle(BronzeDeckButtonStyle(palette: [.blue, .purple, .green, .bronze, .pink, .cyan][bank], selected: model.presetBank == bank, size: compact ? 11 : 15))
                        .bronzeTapHold(tap: { model.selectPresetBank(bank) }, hold: { bankToRename = bank; bankName = model.presetBankName(bank); renameBank = true })
                        .accessibilityIdentifier("bronze.bank.\(bank)").accessibilityValue(model.presetBank == bank ? "Selecionado" : "")
                }
                Button(showingKeyboard ? "Keyboard" : "Presets") { showingKeyboard.toggle() }
                    .buttonStyle(BronzeDeckButtonStyle(palette: .grey, size: compact ? 9 : 12))
                    .bronzeTapHold(tap: { showingKeyboard.toggle() }, hold: {
                        model.stopPerformanceNotes(); fullKeyboard.toggle(); showingKeyboard = true
                    })
                    .accessibilityIdentifier("bronze.keyboard.toggle")
                    .accessibilityValue(fullKeyboard ? "88 teclas" : "4 oitavas")
                    .accessibilityAction(named: "Alternar 88 teclas e 4 oitavas") {
                        model.stopPerformanceNotes(); fullKeyboard.toggle(); showingKeyboard = true
                    }
            }.frame(height: compact ? 26 : 35)
            if showingKeyboard {
                HStack(spacing: 5) {
                    BronzeKeyboardExpressionWheel(title: "Pitch", mark: "H", value: Binding(get: { model.keyboardPitch }, set: { model.setKeyboardPitch($0) }), spring: true)
                    BronzeKeyboardExpressionWheel(title: "Mod", mark: "K", value: Binding(get: { model.keyboardModulation }, set: { model.setKeyboardModulation($0) }), spring: false)
                    BronzePerformanceKeyboard { note, pressed, velocity in model.setKeyboardNote(note, pressed: pressed, velocity: velocity) }.id(fullKeyboard)
                }
            } else {
                VStack(spacing: 5) {
                    ForEach(0..<2, id: \.self) { row in
                        HStack(spacing: 5) {
                            ForEach(0..<8, id: \.self) { column in
                                preset(model.presetBank * 16 + row * 8 + column, compact: compact)
                            }
                        }
                    }
                }
            }
        }.padding(compact ? 5 : 8).modifier(BronzeDeckSurface())
    }

    private func preset(_ index: Int, compact: Bool) -> some View {
        let slot = model.presets[index]
        let color = BronzePresetPalette.colors[slot.modules == nil && slot.name == "Empty" ? BronzePresetPalette.order[index % 16] : slot.color]
        return HStack(spacing: 8) {
            Text(String(format: "%02d", index % 16 + 1)).font(.bronzeUI(compact ? 9 : 12))
            Text(slot.modules == nil && slot.name == "Empty" ? "Preset" : slot.name).font(.bronzeUI(compact ? 10 : 13)).lineLimit(1).minimumScaleFactor(0.6)
        }.foregroundStyle(.black).padding(.horizontal, 10).frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(LinearGradient(colors: [color, color.opacity(0.68)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius: 7))
            .overlay { if model.activePreset == index { BronzePresetHighlight() } }
            .bronzeTapHold(tap: { selectedSlot = index; model.recallPreset(index) },
                           hold: { selectedSlot = index; openPreset(index) })
            .accessibilityAddTraits(.isButton).accessibilityLabel("Preset \(index % 16 + 1): \(slot.name)")
            .accessibilityAction { selectedSlot = index; model.recallPreset(index) }
            .accessibilityAction(named: "Editar preset") { openPreset(index) }
    }

    private func paste() {
        if let index = pasteTarget, let copiedPreset { model.pastePreset(copiedPreset, at: index) }
        pasteTarget = nil; copiedPreset = nil
    }
}

struct BronzeDial: View {
    @Binding var value: Double
    var tint = Color.bronzeLight
    var label: String
    @State private var dragValue: Double?
    var body: some View {
        GeometryReader { geometry in
            let side = min(geometry.size.width, geometry.size.height)
            ZStack {
                Circle().fill(Color(bronzeHex: 0x282a2f))
                Circle().trim(from: 0, to: min(1, max(0, value)) * 0.75).stroke(tint.opacity(0.9), lineWidth: side * 0.18)
                    .padding(side * 0.1).rotationEffect(.degrees(135))
                    .shadow(color: tint.opacity(0.55), radius: 3)
                Circle().fill(RadialGradient(colors: [Color(bronzeHex: 0x34373c), Color(bronzeHex: 0x020304), .black], center: .topLeading, startRadius: 0, endRadius: side * 0.6))
                    .overlay(Circle().stroke(.white.opacity(0.16), lineWidth: 1))
                    .overlay(Circle().stroke(.black, lineWidth: 2).padding(-2))
                    .padding(side * 0.2)
                Capsule().fill(tint.opacity(0.85)).frame(width: max(1, side * 0.035), height: side * 0.3)
                    .offset(y: -side * 0.18).rotationEffect(.degrees(-135 + min(1, max(0, value)) * 270))
            }.padding(3).contentShape(Circle())
                .gesture(DragGesture(minimumDistance: 0).onChanged { gesture in
                    if dragValue == nil { dragValue = value }
                    value = min(1, max(0, (dragValue ?? value) - gesture.translation.height / 150))
                }.onEnded { _ in dragValue = nil })
        }.accessibilityElement().accessibilityLabel(label).accessibilityValue("\(Int(value * 100))%")
            .accessibilityAdjustableAction { direction in value = min(1, max(0, value + (direction == .increment ? 0.01 : -0.01))) }
    }
}

struct BronzeMiniMeter: View {
    let level: Double
    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 1) {
                ForEach(0..<2, id: \.self) { _ in
                    ZStack(alignment: .bottom) {
                        Color.black
                        LinearGradient(colors: [.orange, .yellow, .green], startPoint: .top, endPoint: .bottom)
                            .mask(alignment: .bottom) { Rectangle().frame(height: proxy.size.height * min(1, max(0, level * 2.5))) }
                    }.overlay(Rectangle().stroke(.gray.opacity(0.6), lineWidth: 0.5))
                }
            }
        }.accessibilityHidden(true)
    }
}

struct BronzeModuleFader: View {
    @Binding var value: Double
    let level: Double
    let label: String
    private let metal: [Color] = [0x4a2818, 0xd99a5d, 0xa65d2a, 0x111317, 0x111317, 0xa65d2a, 0xd99a5d, 0x4a2818].map(Color.init(bronzeHex:))
    var body: some View {
        VStack(spacing: 4) {
            Text("VOLUME").font(.bronzeUI(8)).foregroundStyle(.secondary)
            GeometryReader { proxy in
                let width = min(38, proxy.size.width - 2)
                let handleHeight = min(34, max(24, proxy.size.height * 0.11))
                let travel = max(1, proxy.size.height - handleHeight)
                ZStack(alignment: .top) {
                    Rectangle().fill(LinearGradient(colors: metal, startPoint: .leading, endPoint: .trailing))
                    BronzeMiniMeter(level: level).padding(.horizontal, 6).padding(.vertical, 3)
                    Canvas { context, size in
                        for y in stride(from: 9.0, to: size.height - 5, by: 9) {
                            var line = Path(); line.move(to: CGPoint(x: 4, y: y)); line.addLine(to: CGPoint(x: size.width - 4, y: y))
                            context.stroke(line, with: .color(.white.opacity(0.12)), lineWidth: 1)
                        }
                    }
                    Rectangle().fill(LinearGradient(colors: [0x5b3017, 0xe3a66a, 0xa85c29, 0xf1c18e, 0x8d451e, 0xd49355, 0x4a2412].map(Color.init(bronzeHex:)), startPoint: .leading, endPoint: .trailing))
                        .frame(height: handleHeight)
                        .overlay(Capsule().fill(LinearGradient(colors: [.black, Color(bronzeHex: 0x4a2d0a), .black], startPoint: .leading, endPoint: .trailing)).frame(width: width * 0.4, height: handleHeight * 0.62).overlay(Capsule().stroke(.black)))
                        .padding(.horizontal, 1).offset(y: (1 - value) * travel)
                }.frame(width: width).frame(maxWidth: .infinity).contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 0).onChanged { gesture in
                        value = min(1, max(0, 1 - (gesture.location.y - handleHeight / 2) / travel))
                    })
            }
            Text(value <= 0 ? "−∞ dB" : String(format: "%.1f dB", -36 + value * 36))
                .font(.bronzeUI(8)).foregroundStyle(Color(bronzeHex: 0xd7dce5))
                .padding(.horizontal, 5).padding(.vertical, 3).background(.black).clipShape(Capsule())
                .overlay(Capsule().stroke(.gray.opacity(0.4)))
        }.accessibilityElement().accessibilityLabel(label).accessibilityValue(value <= 0 ? "Silêncio" : String(format: "%.1f dB", -36 + value * 36))
            .accessibilityAdjustableAction { direction in value = min(1, max(0, value + (direction == .increment ? 0.025 : -0.025))) }
    }
}

struct BronzeNativeModal<Content: View>: View {
    let title: String
    var canDismiss = true
    var scrollable = true
    @ViewBuilder let content: () -> Content
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(spacing: 6) {
            HStack {
                Text(title).font(.bronzeUI(20)).foregroundStyle(Color.bronzeLight)
                Spacer()
                Button("Voltar") { dismiss() }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(width: 90, height: 36).disabled(!canDismiss)
            }
            GeometryReader { geometry in
                Group {
                    if scrollable {
                        ScrollView { content().frame(maxWidth: .infinity).padding(.bottom, 12) }
                    } else { content().frame(width: geometry.size.width, height: geometry.size.height) }
                }.environment(\.bronzeContentSize, geometry.size)
            }
        }.padding(12)
            .font(.bronzeUI(12)).background(BronzeScreenBackground()).preferredColorScheme(.dark)
            .interactiveDismissDisabled(!canDismiss)
    }
}

struct BronzeNativeFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration.font(.bronzeUI(14)).padding(12).background(Color.black.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.purple.opacity(0.35)))
    }
}
