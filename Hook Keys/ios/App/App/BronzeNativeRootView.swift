import SwiftUI
import UniformTypeIdentifiers

struct BronzeNativeRootView: View {
    @StateObject private var model = BronzeNativeAppModel()
    @ObservedObject var account: BronzeNativeAccount
    private struct LibraryTarget: Identifiable { let id: Int }
    @State private var libraryTarget: LibraryTarget?
    @State private var presetTarget: LibraryTarget?
    @State private var fxTarget: LibraryTarget?
    @State private var effectEditMode = false
    @State private var showBackup = false
    @State private var showMIDI = false
    #if DEBUG && targetEnvironment(macCatalyst)
    @State private var smokeLearn = false
    #endif
    @State private var showAccount = false
    @State private var showModuleEditor = false
    @State private var showOrgan = false
    @State private var showTracks = false
    @State private var showSettings = false
    @State private var welcomePending = true
    @State private var loadingFinished = false
    private enum ModulePage: Equatable { case performance, tone, envelope, equalizer, reverb, delay, synth, pulse, arpeggiator, processor(BronzeProcessorKind) }
    @State private var confirmModuleReset = false
    @State private var performanceSection = 1
    @State private var modulePage: ModulePage = .envelope

    init(account: BronzeNativeAccount) {
        self.account = account
    }

    var body: some View {
        ZStack {
            BronzeScreenBackground()
            if account.restoring { ProgressView("Validando acesso…").tint(.bronze) }
            else if !account.authorized { BronzeNativeLoginView(account: account) }
            else {
                if case .failed(let message) = model.engineState {
                    failureView(message)
                } else if model.engineState == .ready && loadingFinished {
                    ZStack {
                        playerView
                            .allowsHitTesting(!welcomePending)
                            .accessibilityHidden(welcomePending)
                        if welcomePending {
                            BronzeNativeWelcomeView(name: BronzeNativeWelcomeView.displayName(account.session?.account)) {
                                welcomePending = false
                            }
                            .zIndex(1)
                        }
                    }
                } else {
                    BronzeNativeLoadingView(isReady: model.engineState == .ready) {
                        loadingFinished = true
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { await account.restore(); if account.authorized { model.start() } }
        .onChange(of: account.authorized) { authorized in
            welcomePending = true
            loadingFinished = false
            if authorized { model.start() } else { model.suspendForLogout() }
        }
        .onChange(of: model.engineState) { state in if state == .idle && account.authorized { model.start() } }
        .onDisappear { model.stopPerformanceNotes() }
        #if DEBUG && targetEnvironment(macCatalyst)
        .onReceive(NotificationCenter.default.publisher(for: BronzeMacSmoke.navigate)) { message in
            guard ProcessInfo.processInfo.environment["BRONZE_UI_TEST"] == "1" else { return }
            loadingFinished = true; welcomePending = false
            fxTarget = message.object as? String == "fxEditor" ? LibraryTarget(id: 0) : nil
            showModuleEditor = false; showSettings = false
            smokeLearn = message.object as? String == "learn"
            if smokeLearn { Task { try? await Task.sleep(nanoseconds: 500_000_000); await model.runMIDILearnSmoke() } }
            presetTarget = message.object as? String == "preset" ? LibraryTarget(id: 0) : nil
            if message.object as? String == "eq" { model.selectModule(0); modulePage = .equalizer; showModuleEditor = true }
            if message.object as? String == "settings" { showSettings = true }
            NSLog("[BronzeMacSmoke] audioReady=%d", model.engine.audioOutputReady())
        }
        .fullScreenCover(isPresented: $smokeLearn) { BronzeMIDILearnDialog(model: model, target: "env:0:0") }
        #endif
        .fullScreenCover(item: $libraryTarget) { target in
            BronzeNativeSoundFontLibrary(model: model, account: account, moduleIndex: target.id)
        }
        .fullScreenCover(item: $presetTarget) { target in
            BronzeNativePresetEditor(model: model, index: target.id)
        }
        .fullScreenCover(item: $fxTarget) { target in BronzeNativeFXEditor(model: model, initialIndex: target.id) }
        .sheet(isPresented: $showBackup) { BronzeNativeBackupPanel(model: model, userName: account.session?.account.name ?? "Usuario") }
        .sheet(isPresented: $showMIDI) { BronzeNativeMIDIPanel(model: model) }
        .fullScreenCover(isPresented: $showAccount) { BronzeNativeAccountView(account: account, model: model) }
        .alert("Controle do módulo", isPresented: Binding(
            get: { model.controlError != nil },
            set: { if !$0 { model.controlError = nil } }
        )) {
            Button("OK") { model.controlError = nil }
        } message: {
            Text(model.controlError ?? "")
        }
    }

    private func failureView(_ message: String) -> some View {
        VStack(spacing: 18) {
            Text("Não foi possível preparar o Bronze Keys")
                .font(.title2.bold())
            Text(message).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button("Tentar novamente") { loadingFinished = false; welcomePending = true; model.retry() }
                .buttonStyle(BronzeButtonStyle(active: true))
        }
        .padding(30)
    }

    private var playerView: some View {
        BronzeNativePlayerView(model: model, openModule: { index in
            model.selectModule(index); modulePage = .envelope; showModuleEditor = true
        }, openSound: { index in
            model.selectModule(index)
            if index == 6 { showOrgan = true }
            else if index == 7 { modulePage = .synth; showModuleEditor = true }
            else { libraryTarget = LibraryTarget(id: index) }
        }, openPreset: { presetTarget = LibraryTarget(id: $0) },
        openTracks: { showTracks = true }, openSettings: { showSettings = true },
        openAccount: { showAccount = true }) { performancePads }
        .fullScreenCover(isPresented: $showModuleEditor) {
            if modulePage == .synth {
                BronzeNativeModal(title: "Synth", scrollable: false) { BronzeFittedEditor { BronzeNativeSynthEditor(model: model) } }
            } else {
                moduleEditor.environment(\.bronzeConfigurationBorders, true)
            }
        }
        .fullScreenCover(isPresented: $showOrgan) {
            BronzeNativeModal(title: "Organ · Bronze B3", scrollable: false) { BronzeFittedEditor { organEditor } }
        }
        .fullScreenCover(isPresented: $showTracks) {
            loopLibrary
        }
        .fullScreenCover(isPresented: $showSettings) { BronzeNativeSettingsView(model: model) }
    }

    private var moduleEditor: some View {
        GeometryReader { bounds in
        let compact = bounds.size.height < 480
        VStack(spacing: compact ? 4 : 10) {
            Text(model.selectedModule == 6 ? "Organ" : model.selectedModule == 7 ? "Synth" : model.moduleSoundFonts[model.selectedModule]?.name ?? "Módulo \(model.selectedModule + 1)")
                .font(.bronzeUI(compact ? 12 : 17)).lineLimit(1).frame(height: compact ? 16 : 24)
            BronzeModuleRoutingHeader(model: model, index: model.selectedModule)
            HStack(spacing: 2) {
                moduleTab("Envelope", page: .envelope, color: .bronze)
                moduleTab("EQ", page: .equalizer, color: .cyan)
                if model.selectedModule != 6 { moduleTab("Compressor", page: .processor(.compressor), color: .yellow) }
                moduleTab("Chorus", page: .processor(.chorus), color: .purple)
                if model.selectedModule != 6 { moduleTab("Vibes", page: .processor(.vibes), color: .bronze) }
                moduleTab("Reverb", page: .reverb, color: .green)
                moduleTab("Delay", page: .delay, color: .purple)
                if model.selectedModule != 6 { moduleTab("Arpeggiator", page: .arpeggiator, color: .pink) }
                moduleTab("Pulse", page: .pulse, color: .red)
            }.frame(height: compact ? 28 : 34)
            GeometryReader { workspace in
            Group {
            switch modulePage {
            case .tone:
                BronzeNativeToneEditor(model: model, moduleIndex: model.selectedModule).id(model.selectedModule)
            case .performance:
                BronzeNativePerformanceEditor(model: model, moduleIndex: model.selectedModule, section: performanceSection).id(model.selectedModule)
            case .arpeggiator:
                if model.selectedModule != 6 {
                    BronzeNativeArpeggiatorEditor(model: model, moduleIndex: model.selectedModule).id(model.selectedModule)
                } else { envelopeEditor }
            case .pulse: BronzeNativePulseEditor(model: model, moduleIndex: model.selectedModule).id(model.selectedModule)
            case .synth:
                if model.selectedModule == 7 { BronzeNativeSynthEditor(model: model) }
                else { envelopeEditor }
            case .processor(let kind):
                if model.selectedModule != 6 || kind == .chorus {
                    BronzeNativeProcessorEditor(model: model, moduleIndex: model.selectedModule, kind: kind)
                        .id("\(model.selectedModule)-\(kind.rawValue)")
                } else { envelopeEditor }
            case .equalizer:
                BronzeNativeEqualizerEditor(model: model, moduleIndex: model.selectedModule)
                    .id(model.selectedModule)
            case .reverb:
                BronzeNativeReverbEditor(model: model, moduleIndex: model.selectedModule)
                    .id(model.selectedModule)
            case .delay:
                BronzeNativeDelayEditor(model: model, moduleIndex: model.selectedModule)
                    .id(model.selectedModule)
            case .envelope:
                BronzeModuleEnvelopeGrid(model: model, index: model.selectedModule) { modulePage = .tone }
            }
            }.environment(\.bronzeContentSize, workspace.size)
            }.frame(maxHeight: .infinity).disabled(model.selectedModule < 6 && model.moduleSettingsSources[model.selectedModule] == "default")
            if model.selectedModule != 6 && modulePage != .performance && modulePage != .synth && modulePage != .equalizer {
                BronzeModulePerformanceCards(model: model, index: model.selectedModule) { section in performanceSection = section; modulePage = .performance }
                    .disabled(model.selectedModule < 6 && model.moduleSettingsSources[model.selectedModule] == "default")
            }
            HStack(spacing: compact ? 6 : 12) {
                Button("Voltar") {
                    if modulePage == .performance || modulePage == .tone { modulePage = .envelope }
                    else { showModuleEditor = false }
                }.buttonStyle(BronzeConfigActionStyle(kind: .back))
                if let enabled = modulePageEnabled {
                    Button(enabled ? "ON" : "OFF") { setModulePageEnabled(!enabled) }
                        .buttonStyle(BronzeConfigActionStyle(kind: enabled ? .on : .off)).disabled(defaultModuleSettings)
                }
                if !defaultModuleSettings {
                    Button("Reset") { confirmModuleReset = true }
                        .buttonStyle(BronzeConfigActionStyle(kind: .reset))
                }
            }.frame(height: compact ? 38 : 54)
        }
        .environment(\.bronzeContentSize, bounds.size)
        }.padding(10).background(BronzeScreenBackground()).preferredColorScheme(.dark)
            .alert("Restaurar os parâmetros desta página?", isPresented: $confirmModuleReset) {
                Button("Cancelar", role: .cancel) {}
                Button("Restaurar", role: .destructive) { resetModulePage() }
            }
    }

    private func moduleTab(_ label: String, page: ModulePage, color: BronzeDeckPalette) -> some View {
        Button(label) { modulePage = page }
            .buttonStyle(BronzeConfigTabStyle(palette: color, selected: modulePage == page))
            .frame(maxWidth: .infinity)
    }

    private var defaultModuleSettings: Bool { model.selectedModule < 6 && model.moduleSettingsSources[model.selectedModule] == "default" }
    private var modulePageEnabled: Bool? {
        let i = model.selectedModule
        switch modulePage {
        case .equalizer: return model.moduleEqualizers[i].enabled
        case .reverb: return model.moduleReverbs[i].enabled
        case .delay: return model.moduleDelays[i].enabled
        case .processor(let kind): return model.moduleSoundEffects[i][kind].enabled
        case .pulse: return model.modulePulses[i].enabled
        case .arpeggiator: return model.moduleArpeggiators[i].enabled
        default: return nil
        }
    }
    private func setModulePageEnabled(_ enabled: Bool) {
        let i = model.selectedModule
        switch modulePage {
        case .equalizer: var v = model.moduleEqualizers[i]; v.enabled = enabled; model.setEqualizer(v, moduleIndex: i)
        case .reverb: var v = model.moduleReverbs[i]; v.enabled = enabled; model.setReverb(v, moduleIndex: i)
        case .delay: var v = model.moduleDelays[i]; v.enabled = enabled; model.setDelay(v, moduleIndex: i)
        case .processor(let kind): var v = model.moduleSoundEffects[i]; v[kind].enabled = enabled; model.setSoundEffects(v, moduleIndex: i)
        case .pulse: var v = model.modulePulses[i]; v.enabled = enabled; model.setPulse(v, moduleIndex: i)
        case .arpeggiator: var v = model.moduleArpeggiators[i]; v.enabled = enabled; model.setArpeggiator(v, moduleIndex: i)
        default: break
        }
    }
    private func resetModulePage() {
        let i = model.selectedModule
        switch modulePage {
        case .equalizer: model.setEqualizer(BronzeEqualizer(), moduleIndex: i)
        case .reverb: model.setReverb(BronzeReverb(), moduleIndex: i)
        case .delay: model.setDelay(BronzeDelay(), moduleIndex: i)
        case .processor(let kind): var v = model.moduleSoundEffects[i]; v[kind] = BronzeProcessor(kind); model.setSoundEffects(v, moduleIndex: i)
        case .pulse: model.setPulse(BronzePulse(), moduleIndex: i)
        case .arpeggiator: model.setArpeggiator(BronzeArpeggiator(), moduleIndex: i)
        case .tone: model.setTone(BronzeTone(), moduleIndex: i)
        case .envelope:
            let initial = BronzeEnvelope()
            for p in BronzeNativeAppModel.EnvelopeParameter.allCases {
                let value: Double
                switch p {
                case .attack: value = initial.attackMs / 15000
                case .hold: value = initial.holdMs / 15000
                case .decay: value = initial.decayMs / 25000
                case .release: value = initial.releaseMs / 25000
                case .sustain: value = (initial.sustainDb + 60) / 60
                }
                model.setEnvelopeValue(p, moduleIndex: i, normalized: value)
            }
        case .performance:
            var v = model.modulePerformance[i]; let initial = BronzeModulePerformance.initial(i)
            if performanceSection == 1 { v.velocityCurve = initial.velocityCurve; v.velocityMode = initial.velocityMode; v.velocityCeiling = initial.velocityCeiling }
            else if performanceSection == 2 { v.modulationMode = initial.modulationMode; v.modulationRate = initial.modulationRate; v.modulationIntensity = initial.modulationIntensity }
            else { v.glideMs = initial.glideMs; v.glideSync = initial.glideSync; v.portamento = initial.portamento; v.glideVelocityGate = initial.glideVelocityGate }
            model.setPerformance(v, moduleIndex: i)
        case .synth: break
        }
    }

    private var envelopeEditor: some View {
        HStack(spacing: 8) {
            ForEach(BronzeNativeAppModel.EnvelopeParameter.allCases.filter {
                model.selectedModule != 7 || $0 != .sustain
            }) { parameter in
                BronzePanel {
                    VStack(spacing: 4) {
                        Text(parameter.rawValue).font(.bronzeUI(12))
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
                            .font(.bronzeUI(10))
                            .foregroundStyle(Color.bronzeLight)
                    }
                }
            }
        }
    }

    private var organEditor: some View {
        BronzeNativeOrganEditor(model: model)
    }

    private var performancePads: some View {
        GeometryReader { geometry in
            let compact = geometry.size.height < 360
            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    VStack(spacing: 5) {
                        VStack(spacing: 3) {
                            ForEach(0..<2, id: \.self) { bank in
                                Button("Pads \(bank + 1)") { model.selectPadBank(bank) }
                                    .buttonStyle(BronzeDeckButtonStyle(palette: bank == 0 ? .bronze : .purple, selected: model.selectedPadBank == bank, size: compact ? 8 : 10))
                                    .frame(height: compact ? 32 : 38)
                            }
                        }
                        HStack(spacing: 4) {
                            padFilter(low: true, compact: compact).frame(maxWidth: .infinity)
                            padFilter(low: false, compact: compact).frame(maxWidth: .infinity)
                        }
                    }.frame(width: compact ? 110 : 140)
                    VStack(spacing: 7) {
                        ForEach(0..<2, id: \.self) { row in
                            HStack(spacing: 7) {
                                ForEach(0..<6, id: \.self) { column in
                                    let index = row * 6 + column
                                    Button { model.togglePad(index) } label: {
                                        VStack(spacing: 5) {
                                            Text(noteName(index, relative: false)).font(.bronzeUI(compact ? 20 : 30))
                                            Text(noteName(index, relative: true)).font(.bronzeUI(compact ? 10 : 14))
                                        }
                                    }.modifier(BronzeLearnOnHold(model: model, target: "note:1:\(model.selectedPadBank):\(index)", tapAction: { model.togglePad(index) }))
                                        .buttonStyle(BronzeDeckButtonStyle(palette: model.isPadActive(index) ? .green : model.selectedPadBank == 0 ? .bronze : .purple, selected: model.isPadActive(index)))
                                        .accessibilityIdentifier("bronze.pad.\(index)").accessibilityValue(model.isPadActive(index) ? "Tocando" : "Parado")
                                }
                            }
                        }
                    }
                }.padding(compact ? 5 : 8).modifier(BronzeDeckSurface()).frame(height: max(compact ? 136 : 160, geometry.size.height * 0.32))
                VStack(spacing: 8) {
                    HStack(spacing: 6) {
                        ForEach(0..<8, id: \.self) { bank in
                            Button(model.workspace.fxBanks[bank].name) { model.selectFXBank(bank) }
                                .buttonStyle(BronzeDeckButtonStyle(palette: bank == model.workspace.fxBank ? .green : .purple, selected: bank == model.workspace.fxBank, size: compact ? 9 : 12))
                                .overlay(alignment: .top) { if effectEditMode && bank == model.workspace.fxBank { editBadge } }
                                .bronzeTapHold(tap: { model.selectFXBank(bank) }, hold: {
                                    model.endEffectTouches(); model.selectFXBank(bank); effectEditMode.toggle()
                                })
                                .accessibilityAction(named: "Alternar edição de efeitos") { model.selectFXBank(bank); effectEditMode.toggle() }
                        }
                        Button { model.endEffectTouches(); effectEditMode.toggle() } label: { Image(systemName: "pencil") }
                            .buttonStyle(BronzeDeckButtonStyle()).frame(width: 34)
                    }.frame(height: compact ? 26 : 38).disabled(model.loadingFXBank || model.importingMedia)
                    VStack(spacing: 7) {
                        ForEach(0..<2, id: \.self) { row in
                            HStack(spacing: 7) {
                                ForEach(0..<6, id: \.self) { column in
                                    let index = row * 6 + column
                                    VStack(spacing: 2) {
                                        effectPad(index, compact: compact)
                                        effectVolume(index, compact: compact)
                                    }
                                }
                            }
                        }
                    }.disabled(model.loadingFXBank)
                }.padding(10).modifier(BronzeDeckSurface()).frame(maxHeight: .infinity)
            }
        }.onDisappear { model.endEffectTouches() }
    }

    private func effectPad(_ index: Int, compact: Bool) -> some View {
        let pad = model.workspace.fxBanks[model.workspace.fxBank].pads[index]
        let face = Text(pad.name).font(.bronzeUI(compact ? 11 : 16)).lineLimit(2)
            .foregroundStyle(.white).frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(LinearGradient(colors: [BronzePresetPalette.colors[pad.color], BronzePresetPalette.colors[pad.color].opacity(0.35)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius: 9))
            .overlay { if model.effectLevels[index] > 0 { BronzePresetHighlight() } }
            .overlay(alignment: .top) { if effectEditMode { editBadge } }
        return Group {
            if effectEditMode {
                // Editing and mapping share the effect's editor, as in the original UI.
                face.bronzeTapHold(tap: { fxTarget = LibraryTarget(id: index) },
                    hold: { fxTarget = LibraryTarget(id: index) })
            } else {
                // Performance: holding a gate pad must never open a mapping window.
                face.gesture(DragGesture(minimumDistance: 0)
                    .onChanged { _ in model.triggerEffect(index, pressed: true) }
                    .onEnded { _ in model.triggerEffect(index, pressed: false) })
                    .accessibilityAction { model.triggerEffect(index, pressed: true); model.triggerEffect(index, pressed: false) }
            }
        }.accessibilityAddTraits(.isButton).accessibilityLabel(pad.name)
            .accessibilityIdentifier("bronze.fx.pad.\(index)")
            .disabled(!effectEditMode && !model.isFXReady(index))
    }

    private func effectVolume(_ index: Int, compact: Bool) -> some View {
        HStack(spacing: 3) {
            Slider(value: Binding(get: { model.workspace.fxBanks[model.workspace.fxBank].pads[index].gainDb },
                set: { model.setEffectPadGain(bank: model.workspace.fxBank, index: index, gain: $0) }), in: -36...0)
                .tint(.bronzeLight).accessibilityLabel("Volume do efeito \(index + 1)")
            Text(String(format: "%.0f", model.workspace.fxBanks[model.workspace.fxBank].pads[index].gainDb))
                .font(.bronzeUI(compact ? 8 : 10)).foregroundStyle(Color.bronzeLight).frame(width: 22)
        }.frame(height: compact ? 22 : 28)
            .disabled(model.importingMedia || model.loadingFXBank)
    }

    private var editBadge: some View {
        Text("EDIT").font(.bronzeUI(8)).foregroundStyle(Color(bronzeHex: 0x2a1800))
            .padding(.horizontal, 5).padding(.vertical, 1).background(Color.yellow)
            .clipShape(RoundedRectangle(cornerRadius: 3)).offset(y: -4).allowsHitTesting(false)
    }

    private func padFilter(low: Bool, compact: Bool = false) -> some View {
        VStack(spacing: 2) {
            Text(low ? "Low" : "High").font(.bronzeUI(compact ? 8 : 10))
            BronzeSkiaControl(kind: .knob, value: Binding(
                get: { low ? model.padFilterLow : model.padFilterHigh },
                set: { model.setPadFilter(low: low, normalized: $0) }
            ), accessibilityLabel: low ? "Filtro passa-altas dos pads" : "Filtro passa-baixas dos pads",
                displayValue: model.padFilterText(low ? model.padFilterLow : model.padFilterHigh))
                .frame(width: compact ? 24 : 32, height: compact ? 24 : 32)
            Text(model.padFilterText(low ? model.padFilterLow : model.padFilterHigh))
                .font(.bronzeUI(10))
        }
    }

    private var presetGrid: some View {
        VStack(spacing: 7) {
            HStack(spacing: 8) {
                ForEach(0..<6, id: \.self) { bank in
                    Button(["A", "B", "C", "D", "E", "F"][bank]) { model.selectPresetBank(bank) }
                        .buttonStyle(BronzeButtonStyle(active: model.presetBank == bank))
                        .overlay { if model.presetBank == bank { BronzePresetHighlight() } }
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 8), spacing: 5) {
                ForEach((model.presetBank * 16)..<(model.presetBank * 16 + 16), id: \.self) { index in
                    presetButton(index)
                }
            }
            Text("Toque para carregar. Segure para salvar, renomear ou mudar a cor.")
                .font(.bronzeUI(10)).foregroundStyle(.secondary)
        }
        .disabled(model.loadingSoundFontModule != nil || model.updatingEffects)
    }

    private func presetButton(_ index: Int) -> some View {
        let preset: BronzePresetSlot = model.presets[index]
        let number = String(format: "%02d", index % 16 + 1)
        return Button {
            if preset.modules == nil { presetTarget = LibraryTarget(id: index) }
            else { model.recallPreset(index) }
        } label: {
            VStack(spacing: 2) {
                Text(number).font(.bronzeUI(10))
                Text(preset.name).font(.bronzeUI(12)).lineLimit(1)
            }
            .foregroundStyle(model.activePreset == index ? Color.black : Color.white)
            .frame(maxWidth: .infinity, minHeight: 42)
            .background(model.activePreset == index ? BronzePresetPalette.colors[preset.color] : Color(white: 0.38))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay { if model.activePreset == index { BronzePresetHighlight() } }
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Salvar / Renomear / Cor") { presetTarget = LibraryTarget(id: index) }
        }
    }

    private var loopLibrary: some View { BronzeNativePlaylistLibrary(model: model) }

    private func noteName(_ index: Int, relative: Bool) -> String {
        let names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]
        let relatives = ["Am", "B♭m", "Bm", "Cm", "C♯m", "Dm", "E♭m", "Em", "Fm", "F♯m", "Gm", "A♭m"]
        return relative ? relatives[index] : names[index]
    }
}

struct BronzeNativeDelayEditor: View {
    @Environment(\.bronzeContentSize) private var size
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    @State private var tap = BronzeDelayTap()
    private var delay: BronzeDelay { model.moduleDelays[moduleIndex] }
    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 5) {
                ForEach(BronzeDelay.divisions.indices, id: \.self) { index in
                    Button(BronzeDelay.divisions[index]) { change { $0.division = index } }
                        .buttonStyle(BronzeDeckButtonStyle(palette: delay.division == index ? .green : .grey, selected: delay.division == index))
                }
                Button("Sync") { change { $0.sync.toggle() } }.buttonStyle(BronzeDeckButtonStyle(palette: delay.sync ? .green : .grey, selected: delay.sync))
            }.frame(height: size.height < 250 ? 30 : 46)
            HStack(spacing: 12) {
                VStack(spacing: 6) {
                    Button("Tap") {
                        if let milliseconds = tap.tap(at: ProcessInfo.processInfo.systemUptime) { change { $0.milliseconds = milliseconds } }
                    }.buttonStyle(BronzeConfigActionStyle(kind: .reset)).disabled(delay.sync)
                    Text(delay.sync ? String(format: "%.0f BPM", model.tempo) : String(format: "%.0f ms", delay.milliseconds))
                        .font(.bronzeUI(size.height < 250 ? 16 : 23)).foregroundStyle(Color.bronzeLight)
                        .frame(maxWidth: .infinity).frame(height: size.height < 250 ? 26 : 44)
                        .background(Color(bronzeHex: 0x060d11)).cornerRadius(7)
                        .overlay(RoundedRectangle(cornerRadius: 7).stroke(Color.bronze))
                }.frame(width: max(80, size.width * 0.29 - 20))
                HStack(spacing: 2) {
                    parameter(.feedback, color: .pink)
                    parameter(.mix, color: .yellow)
                    parameter(.milliseconds, color: .purple)
                }
            }.modifier(BronzeEffectSurface(tint: .orange, fill: 0x642f08))
        }.onChange(of: delay.sync) { _ in tap.reset() }.onDisappear { tap.reset() }
    }
    private func parameter(_ parameter: BronzeDelayParameter, color: Color) -> some View {
        BronzeParameterCard(title: parameter == .milliseconds ? "Delay" : parameter.rawValue,
            text: parameter == .milliseconds && delay.sync ? String(format: "%.0f BPM", model.tempo) : delay.text(parameter, bpm: model.tempo),
            value: Binding(get: { delay.normalized(parameter) }, set: { n in change { $0.setNormalized(parameter, n) } }), tint: color,
            definition: parameter == .milliseconds ? .init("Delay", 1, 2000, 500, .milliseconds) : .init(parameter.rawValue, 0, parameter == .feedback ? 0.95 : 1, 0, .percent))
            .modifier(BronzeConfigLearn(model: model, target: "delay:\(moduleIndex):\(BronzeDelayParameter.allCases.firstIndex(of: parameter) ?? 0)"))
            .disabled(parameter == .milliseconds && delay.sync)
    }
    private func change(_ edit: (inout BronzeDelay) -> Void) { var next = delay; edit(&next); model.setDelay(next, moduleIndex: moduleIndex) }
}

struct BronzeNativeReverbEditor: View {
    @Environment(\.bronzeContentSize) private var size
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    private var reverb: BronzeReverb { model.moduleReverbs[moduleIndex] }
    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                ForEach(0..<4, id: \.self) { index in
                    Button(BronzeReverb.names[index]) { change { $0.select(index) } }
                        .buttonStyle(BronzeDeckButtonStyle(palette: reverb.impulse == index ? .green : .grey, selected: reverb.impulse == index))
                }
            }.frame(height: size.height < 250 ? 30 : 44)
            VStack(spacing: 4) {
                Text("Convolution").font(.bronzeUI(10)).foregroundStyle(.mint).frame(maxWidth: .infinity, alignment: .trailing)
                HStack(spacing: 2) {
                    BronzeParameterCard(title: "Mix", text: String(format: "%.0f%%", reverb.mix * 100),
                        value: Binding(get: { reverb.mix }, set: { n in change { $0.setMix(n) } }), tint: .green)
                        .modifier(BronzeConfigLearn(model: model, target: "reverb:\(moduleIndex):0"))
                    BronzeParameterCard(title: "Decay", text: String(format: "%.0f%%", reverb.decay * 100),
                        value: Binding(get: { (reverb.decay - 0.1) / 0.9 }, set: { n in change { $0.setDecay(0.1 + n * 0.9) } }), tint: .cyan, step: 0.01 / 0.9)
                        .modifier(BronzeConfigLearn(model: model, target: "reverb:\(moduleIndex):1"))
                }
            }.modifier(BronzeEffectSurface(tint: .blue, fill: 0x1b3769))
        }
    }
    private func change(_ edit: (inout BronzeReverb) -> Void) { var next = reverb; edit(&next); model.setReverb(next, moduleIndex: moduleIndex) }
}

struct BronzeNativeValueKnob: View {
    let definition: BronzeProcessorParameter
    @Binding var value: Double
    var body: some View {
        BronzePanel {
            VStack(spacing: 4) {
                Text(definition.name).font(.bronzeUI(16))
                BronzeDial(value: Binding(get: { definition.normalized(value) }, set: { value = definition.value($0) }),
                    label: definition.name, definition: definition).modifier(BronzeParameterDialSize())
                Text(definition.text(value)).font(.bronzeUI(14))
            }.frame(minWidth: 94)
        }
    }
}

struct BronzeNativeToneEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    @State private var tab = 1
    private var tone: BronzeTone { model.moduleTones[moduleIndex] }
    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 5) {
                Button("Velocity") { tab = 0 }.buttonStyle(BronzeConfigTabStyle(palette: .purple, selected: tab == 0))
                Button("Env-Filter") { tab = 1 }.buttonStyle(BronzeConfigTabStyle(palette: .cyan, selected: tab == 1))
                Button(tone.enabled ? "FILTER ON" : "FILTER OFF") { edit { $0.enabled.toggle() } }
                    .buttonStyle(BronzeDeckButtonStyle(palette: tone.enabled ? .green : .red))
            }.frame(height: 28)
            if tab == 1 {
                HStack(spacing: 4) {
                    ForEach(0..<4, id: \.self) { type in
                        Button(["Lowpass 2", "Lowpass 4", "Highpass 2", "Highpass 4"][type]) { edit { $0.type = type } }
                            .buttonStyle(BronzeDeckButtonStyle(palette: tone.type == type ? .green : .grey, selected: tone.type == type))
                    }
                    Button(tone.envelopeEnabled ? "ON" : "OFF") { edit { $0.envelopeEnabled.toggle() } }
                        .buttonStyle(BronzeDeckButtonStyle(palette: tone.envelopeEnabled ? .green : .red))
                }.frame(height: 28)
                HStack(spacing: 3) {
                    parameter(.cutoff, tint: .cyan)
                    ForEach([BronzeToneParameter.attack, .decay, .sustain, .release, .depth]) { parameter in
                        self.parameter(parameter, tint: .purple)
                    }
                }
            } else {
                HStack(spacing: 8) {
                    BronzeVelocityCurveGraph(points: Binding(get: { tone.velocity }, set: { points in edit { $0.velocity = points } }), label: "Velocity do filtro")
                    parameter(.cutoff, tint: .cyan).frame(maxWidth: 150)
                }
            }
        }.modifier(BronzeEffectSurface(tint: .cyan, fill: 0x12343d))
    }
    private func parameter(_ parameter: BronzeToneParameter, tint: Color) -> some View {
        let definition = parameter.definition
        return BronzeParameterCard(title: parameter.rawValue, text: definition.text(tone[parameter]), value: Binding(
            get: { definition.normalized(tone[parameter]) }, set: { n in edit { $0[parameter] = definition.value(n) } }), tint: tint, definition: definition)
            .modifier(BronzeConfigLearn(model: model, target: "tone:\(moduleIndex):\(parameter.index)"))
    }
    private func edit(_ change: (inout BronzeTone) -> Void) {
        var next = tone; change(&next); model.setTone(next, moduleIndex: moduleIndex)
    }
}

struct BronzeVelocityCurveGraph: View {
    @Binding var points: [Int]
    let label: String
    var body: some View {
        GeometryReader { geometry in
            let width = max(1, geometry.size.width - 28)
            let height = max(1, geometry.size.height - 28)
            ZStack(alignment: .topLeading) {
                Canvas { context, _ in
                    var grid = Path()
                    for i in 0...4 {
                        let x = 14 + width * CGFloat(i) / 4
                        let y = 14 + height * CGFloat(i) / 4
                        grid.move(to: CGPoint(x: x, y: 14)); grid.addLine(to: CGPoint(x: x, y: height + 14))
                        grid.move(to: CGPoint(x: 14, y: y)); grid.addLine(to: CGPoint(x: width + 14, y: y))
                    }
                    context.stroke(grid, with: .color(.white.opacity(0.15)), lineWidth: 1)
                    var curve = Path()
                    for i in 0..<5 {
                        let p = CGPoint(x: 14 + width * CGFloat(i) / 4, y: 14 + height * (1 - Double(points[i]) / 127))
                        if i == 0 { curve.move(to: p) } else { curve.addLine(to: p) }
                    }
                    context.stroke(curve, with: .color(.purple), lineWidth: 3)
                }.allowsHitTesting(false)
                ForEach(0..<5, id: \.self) { index in
                    Circle().fill(Color.purple).overlay(Circle().stroke(.white, lineWidth: 2)).frame(width: 20, height: 20)
                        .position(x: 14 + width * CGFloat(index) / 4, y: 14 + height * (1 - Double(points[index]) / 127))
                        .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("filterVelocityGraph")).onChanged { gesture in
                            points[index] = min(127, max(0, Int((127 * (1 - (gesture.location.y - 14) / height)).rounded())))
                        })
                        .accessibilityLabel("\(label), ponto \(index + 1)").accessibilityValue("\(points[index])")
                        .accessibilityAdjustableAction { direction in points[index] = min(127, max(0, points[index] + (direction == .increment ? 1 : -1))) }
                }
            }.coordinateSpace(name: "filterVelocityGraph").background(Color.black.opacity(0.4)).cornerRadius(6)
        }
    }
}

struct BronzeNativePerformanceEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    let section: Int
    private var config: BronzeModulePerformance { model.modulePerformance[moduleIndex] }
    var body: some View {
        if section == 1 {
            BronzeNativeVelocityEditor(model: model, moduleIndex: moduleIndex)
        } else {
            HStack(spacing: 14) {
            if section == 3 {
                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        Button(config.glideVelocityGate ? "ON" : "OFF") { edit { $0.glideVelocityGate.toggle() } }
                            .buttonStyle(BronzeDeckButtonStyle(palette: config.glideVelocityGate ? .green : .red))
                        Button("Inverter") { edit { $0.glideVelocityInverted.toggle() } }
                            .buttonStyle(BronzeDeckButtonStyle(palette: config.glideVelocityInverted ? .green : .grey, selected: config.glideVelocityInverted))
                    }.frame(height: 32)
                    GeometryReader { g in
                        let split = g.size.width * Double(config.glideVelocityThreshold) / 127
                        HStack(spacing: 0) {
                            Rectangle().fill(config.glideVelocityInverted ? Color.red.opacity(0.7) : Color.green.opacity(0.7)).frame(width: split)
                            Rectangle().fill(config.glideVelocityInverted ? Color.green.opacity(0.7) : Color.red.opacity(0.7))
                        }.overlay(Rectangle().fill(.white).frame(width: 2).offset(x: split), alignment: .leading)
                    }.frame(maxHeight: .infinity).cornerRadius(6).opacity(config.glideVelocityGate ? 1 : 0.4)
                    HStack { Text("0"); Spacer(); Text("127") }.font(.bronzeUI(10))
                    HStack(spacing: 10) {
                        Text("Limite de velocity").font(.bronzeUI(12))
                        Slider(value: Binding(get: { Double(config.glideVelocityThreshold) }, set: { n in edit { $0.glideVelocityThreshold = Int(n) } }), in: 0...127, step: 1).tint(.orange)
                        Text("\(config.glideVelocityThreshold)").font(.bronzeUI(16)).frame(width: 32)
                    }
                    Text(!config.glideVelocityGate ? "Desligado: o Glide atua em todas as notas." : config.glideVelocityInverted ? "Notas com velocity abaixo de \(config.glideVelocityThreshold) tocam sem Glide." : "Notas com velocity \(config.glideVelocityThreshold) ou mais tocam sem Glide.")
                        .font(.bronzeUI(11)).lineLimit(2)
                }.modifier(BronzeEffectSurface(tint: .cyan, fill: 0x12343d))
                    } else {
                        Menu(["User", "LFO", "Tremolo", "Pan", "Wheel Rotary"][config.modulationMode]) {
                            ForEach(moduleIndex == 6 ? [4, 2, 3] : [0, 1, 2, 3], id: \.self) { mode in
                                Button(["User", "LFO", "Tremolo", "Pan", "Wheel Rotary"][mode]) { edit { $0.modulationMode = mode } }
                            }
                        }
                        BronzeNativeValueKnob(definition: .init("Rate", 0.1, 20, 6.85, .hertz),
                            value: Binding(get: { config.modulationRate }, set: { value in edit { $0.modulationRate = value } })).modifier(BronzeConfigLearn(model: model, target: "performance:\(moduleIndex):modRate"))
                        BronzeNativeValueKnob(definition: .init("Intensity", 0, 1, 1, .percent),
                            value: Binding(get: { config.modulationIntensity }, set: { value in edit { $0.modulationIntensity = value } })).modifier(BronzeConfigLearn(model: model, target: "performance:\(moduleIndex):modDepth"))
                    }
            }.padding(8)
        }
    }
    private func integer(_ key: WritableKeyPath<BronzeModulePerformance, Int>) -> Binding<Int> {
        Binding(get: { config[keyPath: key] }, set: { value in edit { $0[keyPath: key] = value } })
    }
    private func edit(_ change: (inout BronzeModulePerformance) -> Void) {
        var next = config; change(&next); model.setPerformance(next, moduleIndex: moduleIndex)
    }
}

struct BronzeNativeVelocityEditor: View {
    @Environment(\.bronzeContentSize) private var size
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    private var config: BronzeModulePerformance { model.modulePerformance[moduleIndex] }
    private let curves = [[0,16,44,84,127], [0,32,64,96,127], [0,52,84,108,127]]
    private var mode: Int { config.velocityMode ?? curves.firstIndex(of: config.velocityCurve) ?? (Set(config.velocityCurve).count == 1 ? 3 : 4) }
    var body: some View {
        VStack(spacing: 5) {
            HStack(spacing: 5) {
                ForEach(0..<5, id: \.self) { index in
                    Button(["Soft", "Middle", "Hard", "Fixed", "User"][index]) { select(index) }
                        .buttonStyle(BronzeDeckButtonStyle(palette: .purple, selected: mode == index))
                }
            }.frame(height: 30)
            HStack(spacing: 8) {
                GeometryReader { geometry in
                    let width = max(1, geometry.size.width - 28)
                    let height = max(1, geometry.size.height - 28)
                    ZStack(alignment: .topLeading) {
                        Canvas { context, _ in
                            var grid = Path()
                            for i in 0...4 {
                                let x = 14 + width * CGFloat(i) / 4
                                let y = 14 + height * CGFloat(i) / 4
                                grid.move(to: CGPoint(x: x, y: 14)); grid.addLine(to: CGPoint(x: x, y: height + 14))
                                grid.move(to: CGPoint(x: 14, y: y)); grid.addLine(to: CGPoint(x: width + 14, y: y))
                            }
                            context.stroke(grid, with: .color(.white.opacity(0.15)), lineWidth: 1)
                            var curve = Path()
                            for i in 0..<5 {
                                let point = CGPoint(x: 14 + width * CGFloat(i) / 4, y: 14 + height * (1 - Double(config.velocityCurve[i]) / 127))
                                if i == 0 { curve.move(to: point) } else { curve.addLine(to: point) }
                            }
                            context.stroke(curve, with: .color(.purple), lineWidth: 3)
                            let ceiling = 14 + height * (1 - Double(config.velocityCeiling) / 127)
                            var limit = Path(); limit.move(to: CGPoint(x: 14, y: ceiling)); limit.addLine(to: CGPoint(x: width + 14, y: ceiling))
                            context.stroke(limit, with: .color(.orange), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                        }.allowsHitTesting(false)
                        ForEach(0..<5, id: \.self) { index in
                            Circle().fill(Color.purple).overlay(Circle().stroke(.white, lineWidth: 2)).frame(width: 20, height: 20)
                                .position(x: 14 + width * CGFloat(index) / 4, y: 14 + height * (1 - Double(config.velocityCurve[index]) / 127))
                                .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("velocityGraph")).onChanged { gesture in
                                    let value = Int((127 * (1 - (gesture.location.y - 14) / height)).rounded())
                                    edit { $0.velocityCurve[index] = min(127, max(0, value)); $0.velocityMode = 4; $0.velocityUserCurve = $0.velocityCurve }
                                })
                                .accessibilityLabel("Velocity ponto \(index + 1)")
                                .accessibilityValue("\(config.velocityCurve[index])")
                                .accessibilityAdjustableAction { direction in edit {
                                    $0.velocityCurve[index] = min(127, max(0, $0.velocityCurve[index] + (direction == .increment ? 1 : -1)))
                                    $0.velocityMode = 4; $0.velocityUserCurve = $0.velocityCurve
                                } }
                        }
                    }.coordinateSpace(name: "velocityGraph").background(Color.black.opacity(0.4)).cornerRadius(6)
                }.accessibilityIdentifier("bronze.velocity.graph")
                VStack(spacing: 6) {
                    Text("Limitador").font(.bronzeUI(12))
                    Slider(value: Binding(get: { Double(config.velocityCeiling) }, set: { value in edit { $0.velocityCeiling = Int(value) } }), in: 1...127, step: 1)
                    Text("\(config.velocityCeiling)").font(.bronzeUI(16))
                }.frame(width: size.width * 0.18)
            }.frame(height: max(90, size.height - (mode == 3 ? 75 : 40)))
            if mode == 3 {
                HStack { Text("Fixed: \(config.velocityCurve[0])"); Slider(value: Binding(get: { Double(config.velocityCurve[0]) }, set: { value in edit { $0.velocityFixedValue = Int(value); $0.velocityCurve = Array(repeating: Int(value), count: 5) } }), in: 0...127, step: 1) }.frame(height: 30)
            }
        }
    }
    private func select(_ index: Int) {
        edit {
            $0.velocityMode = index
            if index < 3 { $0.velocityCurve = curves[index] }
            else if index == 3 { $0.velocityCurve = Array(repeating: $0.velocityFixedValue ?? 100, count: 5) }
            else { $0.velocityCurve = $0.velocityUserCurve ?? [0,32,64,96,127] }
        }
    }
    private func edit(_ change: (inout BronzeModulePerformance) -> Void) {
        var next = config; change(&next); model.setPerformance(next, moduleIndex: moduleIndex)
    }
}

struct BronzeNativeArpeggiatorEditor: View {
    @Environment(\.bronzeContentSize) private var size
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    private var arp: BronzeArpeggiator { model.moduleArpeggiators[moduleIndex] }
    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 3) {
                ForEach(0..<5, id: \.self) { mode in
                    Button(["Up", "Down", "Up/Down", "Ordem", "Random"][mode]) { edit { $0.mode = mode } }
                        .buttonStyle(BronzeDeckButtonStyle(palette: arp.mode == mode ? .green : .dark, selected: arp.mode == mode, size: 10))
                }
            }.frame(height: size.height < 240 ? 24 : 36)
            if arp.sync {
                VStack(spacing: 3) {
                    ForEach(0..<2, id: \.self) { row in
                        HStack(spacing: 3) {
                            ForEach(0..<4, id: \.self) { column in
                                let division = row * 4 + column
                                Button(BronzePulse.divisions[division]) { edit { $0.division = division } }
                                    .buttonStyle(BronzeDeckButtonStyle(palette: arp.division == division ? .green : .dark, selected: arp.division == division, size: 10))
                            }
                        }
                    }
                }.frame(height: size.height < 240 ? 44 : 72)
                    .contextMenu { Button("Rate livre") { edit { $0.sync = false } } }
            } else {
                HStack {
                    BronzeParameterCard(title: "Rate", text: String(format: "%.0f ms", arp.rateMs), value: Binding(get: { (arp.rateMs - 20) / 1980 }, set: { n in edit { $0.rateMs = 20 + n * 1980 } }), tint: .pink, step: 1.0 / 1980).modifier(BronzeConfigLearn(model: model, target: "arp:\(moduleIndex):rate"))
                    Button("Sync") { edit { $0.sync = true } }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(width: 80)
                }.frame(height: size.height < 240 ? 44 : 72)
            }
            HStack(spacing: 3) { ForEach(0..<16, id: \.self) { _ in Capsule().fill(Color.purple.opacity(0.3)) } }.frame(height: 3).padding(.vertical, 3)
            GeometryReader { g in
                HStack(spacing: 2) {
                    VStack(spacing: 3) {
                        Text("Oitavas").font(.bronzeUI(10))
                        HStack(spacing: 4) {
                            ForEach(1...4, id: \.self) { octave in
                                Button("\(octave)") { edit { $0.octaves = octave } }.buttonStyle(BronzeDeckButtonStyle(palette: arp.octaves == octave ? .green : .dark, selected: arp.octaves == octave))
                            }
                        }
                    }.padding(5).frame(width: g.size.width * 0.30).background(Color(bronzeHex: 0x170f1e)).cornerRadius(4).overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.purple.opacity(0.6)))
                    BronzeParameterCard(title: "Gate", text: String(format: "%.0f%%", arp.gate * 100), value: Binding(get: { (arp.gate - 0.1) / 0.9 }, set: { n in edit { $0.gate = 0.1 + n * 0.9 } }), tint: .green, border: .green, step: 0.01 / 0.9).modifier(BronzeConfigLearn(model: model, target: "arp:\(moduleIndex):gate"))
                    BronzeParameterCard(title: "Swing", text: String(format: "%.0f%%", arp.swing * 100), value: Binding(get: { arp.swing / 0.75 }, set: { n in edit { $0.swing = n * 0.75 } }), tint: .cyan, border: .cyan, step: 0.01 / 0.75).modifier(BronzeConfigLearn(model: model, target: "arp:\(moduleIndex):swing"))
                    HStack(spacing: 6) {
                        VStack(spacing: 4) {
                            Button("Auto Fader") { edit { $0.autoFaderEnabled.toggle() } }.buttonStyle(BronzeDeckButtonStyle(palette: arp.autoFaderEnabled ? .green : .grey, size: 10))
                            HStack(spacing: 3) {
                                Button("1/1") { edit { $0.autoFaderHalf = false } }.buttonStyle(BronzeDeckButtonStyle(palette: arp.autoFaderHalf ? .blue : .green, size: 10))
                                Button("1/2") { edit { $0.autoFaderHalf = true } }.buttonStyle(BronzeDeckButtonStyle(palette: arp.autoFaderHalf ? .green : .blue, size: 10))
                            }
                        }
                        VStack(spacing: 2) {
                            BronzeDial(value: Binding(get: { arp.autoFaderDepthDb / 40 }, set: { n in edit { $0.autoFaderDepthDb = n * 40 } }), tint: .cyan, label: "Depth do Auto Fader", displayValue: String(format: "−%.1f dB", arp.autoFaderDepthDb), step: 0.5 / 40).modifier(BronzeConfigLearn(model: model, target: "arp:\(moduleIndex):depth"))
                                .frame(width: size.height < 240 ? 28 : 50, height: size.height < 240 ? 28 : 50)
                            Text(String(format: "−%.1f dB", arp.autoFaderDepthDb)).font(.bronzeUI(8)).foregroundStyle(.cyan)
                        }
                    }.padding(5).frame(width: g.size.width * 0.34).background(.black.opacity(0.4)).cornerRadius(4).overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.bronze.opacity(0.6)))
                }
            }
        }.modifier(BronzeEffectSurface(tint: .pink, fill: 0x38212f))
    }
    private func edit(_ change: (inout BronzeArpeggiator) -> Void) { var next = arp; change(&next); model.setArpeggiator(next, moduleIndex: moduleIndex) }
}

struct BronzeNativePulseEditor: View {
    @Environment(\.bronzeContentSize) private var size
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    private var pulse: BronzePulse { model.modulePulses[moduleIndex] }
    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 6) {
                VStack(spacing: 3) {
                    ForEach(0..<2, id: \.self) { row in
                        HStack(spacing: 3) {
                            ForEach(0..<4, id: \.self) { column in
                                let division = row * 4 + column
                                Button(BronzePulse.divisions[division]) { edit { $0.division = division; $0.sync = true } }
                                    .buttonStyle(BronzeDeckButtonStyle(palette: pulse.division == division ? .green : .dark, selected: pulse.division == division, size: 9))
                            }
                        }
                    }
                }.frame(maxWidth: .infinity)
                HStack(spacing: 5) {
                    ForEach([4, 8, 16], id: \.self) { length in
                        Button("\(length)") { edit { $0.length = length } }.buttonStyle(BronzeDeckButtonStyle(palette: pulse.length == length ? .green : .dark, selected: pulse.length == length))
                    }
                    Button("Sync") { edit { $0.sync.toggle() } }.buttonStyle(BronzeDeckButtonStyle(palette: pulse.sync ? .green : .dark, selected: pulse.sync))
                    BronzeParameterCard(title: "Rate", text: pulse.sync ? String(format: "%.0f BPM", model.tempo) : String(format: "%.0f ms", pulse.rateMs), value: Binding(
                        get: { (pulse.rateMs - 20) / 1980 }, set: { n in edit { $0.rateMs = 20 + n * 1980 } }), tint: .green, step: 1.0 / 1980).modifier(BronzeConfigLearn(model: model, target: "pulse:\(moduleIndex):rate")).disabled(pulse.sync)
                }.frame(maxWidth: .infinity)
            }.frame(height: size.height < 250 ? 56 : 88)
            VStack(spacing: 3) {
                ForEach(0..<2, id: \.self) { row in
                    HStack(spacing: 3) {
                        ForEach(0..<8, id: \.self) { column in
                            let index = row * 8 + column
                            Button(String(format: "%02d", index + 1)) { edit { $0.steps ^= 1 << index } }
                                .buttonStyle(BronzeDeckButtonStyle(palette: pulse.steps & (1 << index) != 0 ? .green : .dark, selected: pulse.steps & (1 << index) != 0, size: 9))
                                .disabled(index >= pulse.length).accessibilityLabel("Passo \(index + 1)")
                        }
                    }
                }
            }.frame(height: size.height < 250 ? 38 : 62)
            HStack(spacing: 2) {
                ForEach(Array(BronzePulseParameter.allCases.enumerated()), id: \.element.id) { offset, parameter in
                    BronzeParameterCard(title: parameter.definition.name, text: parameter.definition.text(pulse[parameter]), value: Binding(
                        get: { parameter.definition.normalized(pulse[parameter]) }, set: { n in edit { $0[parameter] = parameter.definition.value(n) } }), tint: [.orange, .green, .cyan, .pink, .purple][offset % 5], definition: parameter.definition)
                        .modifier(BronzeConfigLearn(model: model, target: "pulse:\(moduleIndex):\(parameter.rawValue)"))
                }
            }
        }.modifier(BronzeEffectSurface(tint: .orange, fill: 0x36261c))
    }
    private func edit(_ change: (inout BronzePulse) -> Void) { var next = pulse; change(&next); model.setPulse(next, moduleIndex: moduleIndex) }
}

private struct BronzeSynthPresetTarget: Identifiable { let id: Int }

struct BronzeNativeSynthEditor: View {
    @Environment(\.bronzeContentSize) private var size
    @ObservedObject var model: BronzeNativeAppModel
    @State private var oscillatorIndex = 0
    @State private var confirmReset = false
    @State private var presetToEdit: BronzeSynthPresetTarget?
    private var oscillator: BronzeOscillator { model.synth.oscillators[oscillatorIndex] }
    private var rowHeight: CGFloat { max(44, (size.height - 72) / 4) }
    private var dialSize: CGFloat { min(86, max(20, rowHeight - 30)) }
    var body: some View {
        VStack(spacing: 3) {
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { index in
                    Button("OSC \(index + 1)") { oscillatorIndex = index }
                        .buttonStyle(BronzeDeckButtonStyle(palette: [.green, .pink, .blue][index], selected: oscillatorIndex == index))
                }
            }.frame(height: 28)
            HStack(spacing: 4) {
                ForEach(0..<5, id: \.self) { index in
                    let preset = model.workspace.synthPresets[index]
                    Button(preset.sound == nil ? "Preset \(index + 1)" : preset.name) { model.recallSynthPreset(index) }
                        .buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: model.workspace.activeSynthPreset == index, size: 10))
                        .bronzeTapHold(tap: { model.recallSynthPreset(index) }, hold: { presetToEdit = BronzeSynthPresetTarget(id: index) })
                        .accessibilityIdentifier("bronze.synth.preset.\(index)")
                }
                Button(model.synth.mode == 0 ? "Poly" : "Mono") { edit { $0.mode = $0.mode == 0 ? 1 : 0 } }.buttonStyle(BronzeDeckButtonStyle(palette: .grey, size: 10))
                Button("Legato") { edit { $0.mode = $0.mode == 2 ? 1 : 2 } }.buttonStyle(BronzeDeckButtonStyle(palette: model.synth.mode == 2 ? .green : .grey, selected: model.synth.mode == 2, size: 10))
            }.frame(height: 28)
            HStack(spacing: 3) {
                VStack(spacing: 2) {
                    HStack(spacing: 3) {
                        BronzeOscillatorWaveform(shape: oscillator.shape)
                        Button(oscillator.enabled ? "ON" : "OFF") { editOscillator { $0.enabled.toggle() } }
                            .buttonStyle(BronzeDeckButtonStyle(palette: oscillator.enabled ? .green : .red, size: 10)).frame(width: 40)
                    }.frame(height: max(18, rowHeight / 2 - 5))
                    HStack(spacing: 2) { ForEach(0..<4, id: \.self) { shape in
                        Button(BronzeSynth.shapes[shape]) { editOscillator { $0.shape = shape } }.buttonStyle(BronzeDeckButtonStyle(palette: oscillator.shape == shape ? .green : .grey, selected: oscillator.shape == shape, size: 9))
                    }}.frame(height: max(20, rowHeight / 2 - 7))
                }.padding(4).frame(maxWidth: .infinity).frame(height: rowHeight).modifier(BronzeDeckSurface(radius: 3))
                synthCell(.init("Volume OSC \(oscillatorIndex + 1)", 0, 1, 1, .amplitude), value: Binding(get: { oscillator.volume }, set: { value in editOscillator { $0.volume = value } }), tint: .orange).modifier(BronzeConfigLearn(model: model, target: "osc:\(oscillatorIndex):Volume"))
                synthCell(.init("Detune OSC \(oscillatorIndex + 1)", -100, 100, 0, .rawCents), value: Binding(get: { oscillator.detune }, set: { value in editOscillator { $0.detune = value } }), tint: .green).modifier(BronzeConfigLearn(model: model, target: "osc:\(oscillatorIndex):Detune"))
                VStack(spacing: 4) {
                    Text("OSC \(oscillatorIndex + 1) · \(oscillator.octave)").font(.bronzeUI(11))
                    HStack(spacing: 3) {
                        Button("OCT −") { editOscillator { $0.octave = max(-3, $0.octave - 1) } }
                        Button("OCT +") { editOscillator { $0.octave = min(3, $0.octave + 1) } }
                    }.buttonStyle(BronzeDeckButtonStyle(palette: .grey, size: 10)).frame(height: 24)
                }.frame(maxWidth: .infinity).frame(height: rowHeight).modifier(BronzeDeckSurface(radius: 3))
            }
            HStack(spacing: 3) {
                ForEach(Array([BronzeNativeAppModel.EnvelopeParameter.attack, .hold, .decay, .release].enumerated()), id: \.offset) { index, parameter in
                    VStack(spacing: 2) {
                        Text(parameter.rawValue).font(.bronzeUI(11))
                        BronzeDial(value: Binding(get: { model.envelopeValue(parameter, moduleIndex: 7) }, set: { model.setEnvelopeValue(parameter, moduleIndex: 7, normalized: $0) }), tint: [.cyan, .pink, .orange, .green][index], label: parameter.rawValue, displayValue: model.envelopeValueText(parameter, moduleIndex: 7)).frame(width: dialSize, height: dialSize)
                            .modifier(BronzeConfigLearn(model: model, target: "env:7:\(BronzeNativeAppModel.EnvelopeParameter.allCases.firstIndex(of: parameter) ?? 0)"))
                        Text(model.envelopeValueText(parameter, moduleIndex: 7)).font(.bronzeUI(10))
                    }.frame(maxWidth: .infinity).frame(height: rowHeight).modifier(BronzeDeckSurface(radius: 3))
                }
            }
            HStack(spacing: 3) {
                parameter(.cutoff, tint: .cyan); parameter(.resonance, tint: .pink); parameter(.filterEnvelope, tint: .orange)
                VStack(spacing: 4) {
                    Text("LFO destino").font(.bronzeUI(11))
                    HStack(spacing: 2) { ForEach(0..<3, id: \.self) { target in
                        Button(BronzeSynth.targets[target]) { edit { $0.lfoTarget = target } }.buttonStyle(BronzeDeckButtonStyle(palette: model.synth.lfoTarget == target ? .green : .grey, selected: model.synth.lfoTarget == target, size: 9))
                    }}.frame(height: 24)
                }.frame(maxWidth: .infinity).frame(height: rowHeight).modifier(BronzeDeckSurface(radius: 3))
            }
            HStack(spacing: 3) {
                parameter(.lfoRate, tint: .cyan); parameter(.lfoDepth, tint: .pink); parameter(.glide, tint: .cyan)
                Button("Reset Synth") { confirmReset = true }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(maxWidth: .infinity).frame(height: rowHeight)
            }
        }.frame(maxWidth: .infinity)
        .fullScreenCover(item: $presetToEdit) { target in BronzeNativeSynthPresetEditor(model: model, index: target.id) }
        .confirmationDialog("Restaurar os parâmetros do Synth?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Restaurar", role: .destructive) { model.setSynth(BronzeSynth()) }
            Button("Cancelar", role: .cancel) {}
        }
    }
    private func parameter(_ parameter: BronzeSynthParameter, tint: Color) -> some View {
        synthCell(parameter.definition, value: Binding(get: { model.synth[parameter] }, set: { value in edit { $0[parameter] = value } }), tint: tint).modifier(BronzeConfigLearn(model: model, target: "synth:\(parameter.rawValue)"))
    }
    private func synthCell(_ definition: BronzeProcessorParameter, value: Binding<Double>, tint: Color) -> some View {
        VStack(spacing: 2) {
            Text(definition.name).font(.bronzeUI(11)).lineLimit(1).minimumScaleFactor(0.7)
            BronzeDial(value: Binding(get: { definition.normalized(value.wrappedValue) }, set: { value.wrappedValue = definition.value($0) }), tint: tint, label: definition.name, definition: definition).frame(width: dialSize, height: dialSize)
            Text(definition.text(value.wrappedValue)).font(.bronzeUI(10)).foregroundStyle(tint)
        }.frame(maxWidth: .infinity).frame(height: rowHeight).modifier(BronzeDeckSurface(radius: 3))
    }
    private func edit(_ change: (inout BronzeSynth) -> Void) { var next = model.synth; change(&next); model.setSynth(next) }
    private func editOscillator(_ change: (inout BronzeOscillator) -> Void) { edit { change(&$0.oscillators[oscillatorIndex]) } }
}

struct BronzeNativeProcessorEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    let kind: BronzeProcessorKind
    private var settings: BronzeProcessor { model.moduleSoundEffects[moduleIndex][kind] }
    var body: some View {
        HStack(spacing: 10) {
            if kind == .compressor {
                compressorMeter("Input", index: 0)
                VStack(spacing: 8) {
                    Text("Ratio").font(.bronzeUI(14))
                    Spacer(minLength: 0)
                    Text(settings.values.count > 1 ? String(format: "%.1f:1", settings.values[1]) : "4.0:1")
                        .font(.bronzeUI(26)).minimumScaleFactor(0.5).lineLimit(1).padding(10)
                        .background(Color(bronzeHex: 0x142431)).cornerRadius(18)
                        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.bronze, lineWidth: 2))
                    Spacer(minLength: 0)
                    Capsule().fill(Color.orange).frame(width: 65, height: 3)
                }.padding(10).frame(maxWidth: 180, maxHeight: .infinity)
                    .background(LinearGradient(colors: [Color(bronzeHex: 0x4a4650), Color(bronzeHex: 0x17151a)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .cornerRadius(24).overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.bronze.opacity(0.7)))
                compressorMeter("Output", index: 1)
            }
            VStack(spacing: 2) {
                HStack(spacing: 2) {
                    ForEach(kind == .compressor ? [0, 1, 4] : [0, 1, 2], id: \.self) { index in control(index) }
                }
                if kind == .compressor { HStack(spacing: 2) { ForEach([2, 3, 5], id: \.self) { index in control(index) } } }
            }
        }.modifier(BronzeEffectSurface(tint: kind == .chorus ? .purple : .bronze, fill: kind == .chorus ? 0x291d41 : 0x403629))
            .onAppear { if kind == .compressor { model.compressorMeterModule = moduleIndex } }
            .onDisappear { if kind == .compressor { model.compressorMeterModule = nil } }
    }
    private func compressorMeter(_ title: String, index: Int) -> some View {
        VStack(spacing: 4) {
            Text(title).font(.bronzeUI(9))
            BronzeMiniMeter(level: model.compressorLevels[index]).frame(width: 12)
            Text(model.compressorLevels[index] > 0 ? String(format: "%.0f dB", 20 * log10(model.compressorLevels[index])) : "−∞ dB").font(.bronzeUI(8))
        }.frame(width: 42)
    }
    private func control(_ index: Int) -> some View {
        let parameter = kind.parameters[index]
        let color: Color = kind == .compressor ? [.pink, .orange, .cyan, .purple, .green, .yellow][index] : [.pink, .yellow, .purple][index]
        return VStack(spacing: 3) {
            BronzeParameterCard(title: kind == .vibes && index == 2 ? "Noise" : parameter.name,
                text: parameter.text(settings.values[index]), value: Binding(get: { parameter.normalized(settings.values[index]) },
                set: { n in edit { $0.values[index] = parameter.value(n) } }), tint: color, definition: parameter)
                .modifier(BronzeConfigLearn(model: model, target: "fx:\(moduleIndex):\(kind.rawValue):\(index)"))
            if kind == .vibes && index == 2 {
                Button(settings.vinylEnabled ? "ON" : "OFF") { edit { $0.vinylEnabled.toggle() } }
                    .buttonStyle(BronzeDeckButtonStyle(palette: settings.vinylEnabled ? .green : .red)).frame(height: 26)
            }
        }
    }
    private func edit(_ change: (inout BronzeProcessor) -> Void) {
        var effects = model.moduleSoundEffects[moduleIndex]; var processor = effects[kind]
        change(&processor); effects[kind] = processor; model.setSoundEffects(effects, moduleIndex: moduleIndex)
    }
}

struct BronzeNativeEqualizerEditor: View {
    @Environment(\.bronzeContentSize) private var contentSize
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    @State private var selectedBand = 0
    private var equalizer: BronzeEqualizer { model.moduleEqualizers[moduleIndex] }
    private let bandColors: [Color] = [.green, .cyan, .pink, .red, .purple]
    var body: some View {
        VStack(spacing: 6) {
            bandPad.frame(maxHeight: .infinity)
            HStack(spacing: 2) {
                ForEach(0..<5, id: \.self) { index in readout(index) }
            }.frame(height: contentSize.height < 270 ? 68 : 94)
        }.modifier(BronzeEffectSurface(tint: .cyan, fill: 0x12343d))
    }
    private func readout(_ index: Int) -> some View {
        let band = equalizer.bands[index]
        let small = contentSize.height < 270
        return VStack(spacing: 2) {
            HStack(spacing: 5) {
                Text("\(index + 1)").font(.bronzeUI(small ? 13 : 18)).foregroundStyle(Color.bronzeLight)
                VStack(alignment: .leading, spacing: 1) {
                    Text(band.text(.frequency)); Text(band.isCut ? "—" : band.text(.gain))
                }.font(.bronzeUI(small ? 8 : 10)).lineLimit(1).minimumScaleFactor(0.6)
                Spacer(minLength: 0)
            }
            Spacer(minLength: 0)
            HStack(spacing: 2) {
                Text(band.isCut ? "Slope" : "Q").font(.bronzeUI(8))
                Slider(value: Binding(get: { band.isCut ? Double(band.cutStages - 1) / 7 : band.normalized(.quality) }, set: { n in
                    model.editEQBand(index, moduleIndex: moduleIndex) {
                        if $0.isCut { $0.cutStages = 1 + Int((n * 7).rounded()) }
                        else { $0.setNormalized(.quality, n) }
                    }
                })).tint(.orange).accessibilityLabel("\(band.isCut ? "Inclinação" : "Q") da banda \(index + 1)")
                Text(band.isCut ? "\(band.cutStages * 12)" : band.text(.quality)).font(.bronzeUI(8)).frame(width: 24)
            }.frame(height: small ? 18 : 22)
            if index == 0 || index == 4 {
                HStack(spacing: 2) {
                    ForEach([2, index == 0 ? 0 : 4, index == 0 ? 1 : 3], id: \.self) { type in
                        Button(type == 2 ? "Band" : (type == 0 || type == 4) ? (index == 0 ? "Low Cut" : "High Cut") : "Shelf") {
                            selectedBand = index; model.editEQBand(index, moduleIndex: moduleIndex) { $0.type = type }
                        }.buttonStyle(BronzeDeckButtonStyle(palette: band.type == type ? .green : .grey, selected: band.type == type, size: small ? 7 : 9))
                    }
                }.frame(height: small ? 20 : 26)
            }
        }.padding(5).frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(bronzeHex: 0x170f1e)).cornerRadius(5)
            .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color.bronze.opacity(selectedBand == index ? 0.9 : 0.5)))
    }

    // Native response graph with directly draggable band handles.
    private var bandPad: some View {
        GeometryReader { geometry in
            let width = max(1, geometry.size.width - 28)
            let height = max(1, geometry.size.height - 28)
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 6).fill(Color(bronzeHex: 0x19171d))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.bronze.opacity(0.8)))
                Canvas { context, size in
                    var grid = Path()
                    for frequency in [20.0, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] {
                        let x = 14 + width * log(frequency / 20) / log(1000)
                        grid.move(to: CGPoint(x: x, y: 14)); grid.addLine(to: CGPoint(x: x, y: height + 14))
                        let label = frequency >= 1000 ? "\(Int(frequency / 1000))k" : "\(Int(frequency))"
                        context.draw(Text(label).font(.system(size: 8)).foregroundColor(.white.opacity(0.65)),
                                     at: CGPoint(x: x, y: size.height - 6))
                    }
                    for db in stride(from: -24.0, through: 24.0, by: 6) {
                        let y = 14 + height * (24 - db) / 48
                        grid.move(to: CGPoint(x: 14, y: y)); grid.addLine(to: CGPoint(x: width + 14, y: y))
                    }
                    context.stroke(grid, with: .color(.white.opacity(0.09)), lineWidth: 1)
                    var curve = Path()
                    for step in 0...300 {
                        let fraction = Double(step) / 300
                        let frequency = 20 * pow(1000, fraction)
                        let gain = equalizer.bands.reduce(0.0) { $0 + $1.responseDb(at: frequency) }
                        let point = CGPoint(x: 14 + width * fraction, y: 14 + height * (24 - min(24, max(-24, gain))) / 48)
                        if step == 0 { curve.move(to: point) } else { curve.addLine(to: point) }
                    }
                    context.stroke(curve, with: .color(.orange), lineWidth: 2)
                    curve.addLine(to: CGPoint(x: width + 14, y: height + 14)); curve.addLine(to: CGPoint(x: 14, y: height + 14)); curve.closeSubpath()
                    context.fill(curve, with: .color(.orange.opacity(0.20)))
                    for db in [-24, -12, 0, 12, 24] {
                        context.draw(Text(db > 0 ? "+\(db)" : "\(db)").font(.system(size: 8)).foregroundColor(.white.opacity(0.7)),
                                     at: CGPoint(x: 3, y: 14 + height * Double(24 - db) / 48), anchor: .leading)
                    }
                }.allowsHitTesting(false)
                ForEach(0..<5, id: \.self) { index in
                    let point = equalizer.bands[index]
                    Circle().fill(bandColors[index])
                        .overlay(Circle().stroke(.white.opacity(0.9), lineWidth: 1).padding(7))
                        .frame(width: 28, height: 28)
                        .padding(6).shadow(color: bandColors[index], radius: index == selectedBand ? 5 : 2)
                        .position(x: 14 + width * CGFloat(point.normalized(.frequency)),
                                  y: 14 + height * CGFloat(point.isCut ? 0.5 : 1 - point.normalized(.gain)))
                        .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("eqBandPad"))
                            .onChanged { value in
                                selectedBand = index
                                model.editEQBand(index, moduleIndex: moduleIndex) { band in
                                    band.setNormalized(.frequency, Double((value.location.x - 14) / width))
                                    if !band.isCut { band.setNormalized(.gain, 1 - Double((value.location.y - 14) / height)) }
                                }
                            })
                        .accessibilityLabel("Banda \(index + 1)")
                        .accessibilityAddTraits(.isButton)
                        .accessibilityAction { selectedBand = index }
                }
            }.coordinateSpace(name: "eqBandPad")
        }
        .accessibilityLabel("Posição das bandas: frequência horizontal e ganho vertical")
    }
}

struct BronzeRepeatButton: View {
    @Environment(\.bronzeConfigurationBorders) private var configurationControls
    @Environment(\.bronzeContentSize) private var contentSize
    let label: String
    let accessibilityText: String
    let action: () -> Void
    @GestureState private var pressing = false
    @State private var repetition: Task<Void, Never>?

    var body: some View {
        Text(label).font(.bronzeUI(configurationControls ? 18 : 12))
            .frame(width: configurationControls && contentSize.height > 300 ? 40 : 24, height: configurationControls && contentSize.height > 300 ? 40 : 24)
            .background(Color.bronze.opacity(pressing ? 0.8 : 0.3))
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).updating($pressing) { _, state, _ in state = true })
            .onChange(of: pressing) { down in
                repetition?.cancel()
                if down {
                    action()
                    repetition = Task { @MainActor in
                        do {
                            try await Task.sleep(nanoseconds: 400_000_000)
                            var count = 0
                            while !Task.isCancelled {
                                action()
                                count += 1
                                try await Task.sleep(nanoseconds: count < 12 ? 150_000_000 : 80_000_000)
                            }
                        } catch { /* Finger released, cancelled or view closed. */ }
                    }
                }
            }
            .onDisappear { repetition?.cancel() }
            .accessibilityLabel(accessibilityText)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { action() }
    }
}

enum BronzePresetPalette {
    static let colors: [Color] = [0xff453a, 0xff850a, 0xffd60a, 0xb9ed21,
        0x30e66b, 0x18e0c1, 0x24d4ff, 0x4b8dff, 0x7478ff, 0xa866ff,
        0xd14dff, 0xff45ce, 0xff4f8f, 0xff6347, 0xffb51b, 0x55e268].map(Color.init(bronzeHex:))
    static let order = [2, 7, 4, 12, 0, 9, 5, 14, 3, 11, 6, 15, 1, 10, 8, 13]
}

struct BronzePresetHighlight: View {
    @AppStorage("bronze.lite") private var lite = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 20, paused: reduceMotion || lite)) { context in
            let phase = reduceMotion || lite ? 0 : context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3) / 3
            RoundedRectangle(cornerRadius: 6)
                .stroke(AngularGradient(colors: [.red, .yellow, .green, .cyan, .blue, .purple, .red],
                    center: .center, angle: .degrees(phase * 360)), lineWidth: 3)
                .opacity(reduceMotion ? 1 : 0.72 + 0.28 * cos(phase * .pi * 2))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct BronzeNativePresetEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    let index: Int
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var color: Int
    @State private var showLearn = false
    @State private var clearMapping = false

    init(model: BronzeNativeAppModel, index: Int) {
        self.model = model
        self.index = index
        _name = State(initialValue: model.presets[index].name == "Empty" ? "Preset" : model.presets[index].name)
        _color = State(initialValue: model.presets[index].modules == nil && model.presets[index].name == "Empty" ? BronzePresetPalette.order[index % 16] : model.presets[index].color)
    }

    private var target: String { "preset:\(index)" }
    var body: some View {
        BronzeEditDialog(title: "Preset \(index % 16 + 1) · Banco \(["A", "B", "C", "D", "E", "F"][index / 16])", height: 430) {
            VStack(alignment: .leading, spacing: 14) {
                Text("Nome do preset").font(.bronzeUI(13))
                TextField("Nome do preset", text: $name).textFieldStyle(BronzeNativeFieldStyle())
                    .onChange(of: name) { if $0.count > 20 { name = String($0.prefix(20)) } }
                HStack {
                    Text(String(format: "%02d", index % 16 + 1))
                    Text(name).lineLimit(1)
                }.font(.bronzeUI(16)).foregroundStyle(.black).frame(maxWidth: .infinity).frame(height: 48)
                    .background(LinearGradient(colors: [BronzePresetPalette.colors[color], BronzePresetPalette.colors[color].opacity(0.68)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 8) {
                    ForEach(0..<16, id: \.self) { value in
                        Button { color = value } label: {
                            RoundedRectangle(cornerRadius: 6).fill(BronzePresetPalette.colors[value]).frame(height: 30)
                                .overlay(RoundedRectangle(cornerRadius: 6).stroke(color == value ? Color.white : .clear, lineWidth: 2))
                        }.buttonStyle(.plain).accessibilityLabel("Cor \(value + 1)")
                    }
                }
                HStack(spacing: 8) {
                    Button { showLearn = true } label: {
                        VStack(spacing: 3) {
                            Text("Learn CC")
                            Text(model.midiSettings.controls[target].map { "CC \($0.controller)" } ?? "Ainda não mapeado").font(.bronzeUI(10))
                        }
                    }.buttonStyle(BronzeDeckButtonStyle(palette: .bronze))
                    Button("Clean") { clearMapping = true }.buttonStyle(BronzeDeckButtonStyle(palette: .red)).frame(width: 90)
                }.frame(height: 48).disabled(model.midiSettings.compatibility)
                if model.midiSettings.compatibility { Text("Desative o modo compatibilidade para mapear presets.").font(.bronzeUI(11)).foregroundStyle(.orange) }
            }
        } actions: {
            Button("Voltar") { dismiss() }.buttonStyle(BronzeConfigActionStyle(kind: .back))
            Button("OK") {
                if model.presets[index].modules == nil { save() }
                else { model.renamePreset(index, name: name, color: color); dismiss() }
            }.buttonStyle(BronzeDeckButtonStyle(palette: .green))
                .disabled(!model.persistenceAvailable || model.isApplyingSnapshot)
        }
        .fullScreenCover(isPresented: $showLearn) { BronzeMIDILearnDialog(model: model, target: target) }
        .alert("Limpar mapeamento?", isPresented: $clearMapping) {
            Button("Cancelar", role: .cancel) {}
            Button("Limpar", role: .destructive) { model.clearMIDIMapping(target) }
        }
    }

    private func save() {
        model.savePreset(index, name: name, color: color)
        dismiss()
    }
}

struct BronzeButtonStyle: ButtonStyle {
    var active: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.bronzeUI(12))
            .foregroundStyle(active ? Color.black : Color.white)
            .frame(maxWidth: .infinity, minHeight: 30)
            .padding(.horizontal, 6)
            .background(LinearGradient(colors: (active ? BronzeDeckPalette.green : BronzeDeckPalette.grey).colors.prefix(2).map { $0 }, startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(active ? Color.white : Color.purple.opacity(0.35), lineWidth: active ? 1.5 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

struct BronzeCompactButtonStyle: ButtonStyle {
    @Environment(\.bronzeConfigurationBorders) private var configurationControls
    @Environment(\.bronzeContentSize) private var contentSize
    var active: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.bronzeUI(configurationControls && contentSize.height > 300 ? 15 : 11))
            .foregroundStyle(active ? Color.black : Color.white)
            .frame(minWidth: configurationControls && contentSize.height > 300 ? 40 : 24, minHeight: configurationControls && contentSize.height > 300 ? 40 : 24)
            .padding(.horizontal, 4)
            .background(LinearGradient(colors: (active ? BronzeDeckPalette.green : BronzeDeckPalette.grey).colors.prefix(2).map { $0 }, startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(
                RoundedRectangle(cornerRadius: 5)
                    .stroke(active ? Color.white : Color.purple.opacity(0.35), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 5))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
    }
}

struct BronzeNativeSoundFontLibrary: View {
    @ObservedObject var model: BronzeNativeAppModel
    @ObservedObject var account: BronzeNativeAccount
    let moduleIndex: Int
    @Environment(\.dismiss) private var dismiss
    @State private var showingImporter = false
    @State private var category = "User"
    @State private var selectedSound: BronzeCatalogSound?
    @State private var confirmDownloadAll = false
    @State private var userBytes = 0.0
    @State private var selecting = false
    private var categories: [BronzeCatalogCategory] { account.categories.filter { $0.visibleModule == nil || $0.visibleModule == moduleIndex + 1 } }
    private var allSounds: [BronzeCatalogSound] { account.categories.flatMap(\.sounds) }
    private var totalBytes: Double { allSounds.reduce(0) { $0 + Double($1.byteSize ?? 0) } }
    private var busy: Bool { model.loadingSoundFontModule != nil || model.isApplyingSnapshot || model.backupBusy || model.updatingEffects }
    var body: some View {
        GeometryReader { geometry in
            let compact = geometry.size.height < 500
            VStack(spacing: 8) {
                HStack(spacing: 10) {
                    Text("Biblioteca").font(.bronzeUI(compact ? 18 : 24)).foregroundStyle(Color.bronzeLight)
                    Spacer()
                    VStack(spacing: 2) {
                        Text("Total - " + gigabytes(totalBytes)).font(.bronzeUI(compact ? 14 : 19))
                        Text("\(allSounds.count) timbres").font(.bronzeUI(compact ? 10 : 13)).foregroundStyle(Color.bronzeLight)
                    }.accessibilityElement(children: .combine).accessibilityIdentifier("bronze.library.total")
                    Spacer()
                    Button("Baixar tudo") { confirmDownloadAll = true }
                        .buttonStyle(BronzeDeckButtonStyle(palette: .green)).frame(width: compact ? 105 : 150)
                        .disabled(allSounds.isEmpty || model.catalogDownloadName != nil || allSounds.allSatisfy { model.catalogFont($0.id) != nil && !model.catalogNeedsUpdate($0) })
                        .accessibilityIdentifier("bronze.library.downloadAll")
                }.frame(height: compact ? 38 : 48)
                if model.catalogDownloadName != nil {
                    BronzeCatalogDownloadStatus(model: model).frame(height: compact ? 52 : 62)
                }
                if let error = model.catalogDownloadError {
                    Text(error).font(.bronzeUI(11)).foregroundStyle(.orange).lineLimit(3)
                        .accessibilityIdentifier("bronze.library.downloadError")
                }
                HStack(alignment: .top, spacing: compact ? 6 : 12) {
                    ScrollView {
                        VStack(spacing: 5) {
                            categoryButton("User", id: "User", color: 0x7254bb, height: compact ? 34 : 42)
                            Divider().overlay(Color.gray)
                            ForEach(Array(categories.enumerated()), id: \.element.id) { index, value in
                                categoryButton("\(index + 1) - \(value.name)", id: value.id, color: value.color, height: compact ? 34 : 42)
                            }
                            if categories.isEmpty { Text(account.catalogBusy ? "Carregando…" : "Conecte-se para carregar as categorias.").font(.bronzeUI(10)).foregroundStyle(.secondary) }
                        }
                    }.frame(width: compact ? 125 : 200)
                    VStack(spacing: 6) {
                        HStack {
                            Text(category == "User" ? "User" : categories.first(where: { $0.id == category })?.name ?? "Biblioteca").font(.bronzeUI(compact ? 16 : 22))
                            Spacer()
                            Text(category == "User" ? "Total - " + gigabytes(userBytes) : "\(categories.first(where: { $0.id == category })?.sounds.count ?? 0) timbres").font(.bronzeUI(11)).foregroundStyle(.secondary)
                            Button("Clean") { model.clearSoundFont(moduleIndex); dismiss() }.buttonStyle(BronzeDeckButtonStyle(palette: .red)).frame(width: 70, height: 30)
                        }
                        if category == "User" {
                            GeometryReader { grid in
                                let height: CGFloat = compact ? 40 : 46
                                ScrollView {
                                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6) {
                                        ForEach(Array(model.userOnlySoundFonts.enumerated()), id: \.element.id) { index, entry in
                                            Button { selecting = true; model.selectUserSoundFont(entry, moduleIndex: moduleIndex) } label: {
                                                Text(entry.name).font(.bronzeUI(compact ? 11 : 14)).lineLimit(2).frame(maxWidth: .infinity).frame(height: height)
                                                    .foregroundStyle(.black).modifier(BronzeCatalogSurface(color: BronzePresetPalette.colors[index % 16]))
                                                    .cornerRadius(5).overlay { if model.moduleSoundFonts[moduleIndex] == entry { BronzePresetHighlight().allowsHitTesting(false) } }
                                            }.buttonStyle(.plain)
                                        }
                                    }
                                    if model.userOnlySoundFonts.isEmpty { Text("Nenhum SF2 adicionado.").foregroundStyle(.secondary).padding(20) }
                                }
                            }
                            Button { showingImporter = true } label: { HStack { Text("Add SF2"); Spacer(); Text("+").font(.bronzeUI(24)) } }
                                .buttonStyle(BronzeDeckButtonStyle(palette: .green)).frame(height: compact ? 34 : 46)
                        } else {
                            BronzeNativeCatalogList(model: model, account: account, moduleIndex: moduleIndex, categoryID: category,
                                preview: { selectedSound = $0 }, selected: { selecting = true })
                        }
                    }.padding(8).frame(maxWidth: .infinity, maxHeight: .infinity).background(.black.opacity(0.22)).cornerRadius(6)
                }.disabled(busy)
                Button("Voltar") { dismiss() }.buttonStyle(BronzeConfigActionStyle(kind: .back)).frame(height: compact ? 36 : 50)
            }.padding(12)
        }.background(BronzeScreenBackground()).preferredColorScheme(.dark)
        .overlay {
            if let sound = selectedSound {
                ZStack {
                    Color.black.opacity(0.75).ignoresSafeArea()
                    BronzeNativeSoundPreview(model: model, account: account, sound: sound) { selectedSound = nil }
                        .padding(18).frame(maxWidth: 640).background(BronzeTheme.panelGradient).cornerRadius(10).padding(24)
                }.accessibilityIdentifier("bronze.library.preview")
            }
            if model.loadingSoundFontModule == moduleIndex {
                ZStack { Color.black.opacity(0.75).ignoresSafeArea(); ProgressView("Carregando timbre…").padding(30).background(BronzeTheme.panelGradient).cornerRadius(8) }
            }
        }
        .onAppear {
            model.refreshUserSoundFonts()
            category = categories.first(where: { cat in cat.sounds.contains { model.catalogFont($0.id) == model.moduleSoundFonts[moduleIndex] && model.catalogFont($0.id) != nil } })?.id
                ?? (model.moduleSoundFonts[moduleIndex] == nil ? categories.first?.id ?? "User" : "User")
        }
        .task(id: model.userOnlySoundFonts) {
            let fonts = model.userOnlySoundFonts
            userBytes = await Task.detached(priority: .utility) { fonts.reduce(0.0) { $0 + Double((try? $1.url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) } }.value
        }
        .onChange(of: model.loadingSoundFontModule) { loading in
            if selecting && loading == nil { selecting = false; if model.controlError == nil { dismiss() } }
        }
        .confirmationDialog("Baixar biblioteca?", isPresented: $confirmDownloadAll, titleVisibility: .visible) {
            Button("Baixar tudo") { model.downloadCatalogSounds(allSounds, account: account) }
            Button("Cancelar", role: .cancel) {}
        } message: { Text("\(allSounds.count) timbres · Total - \(gigabytes(totalBytes)). Os timbres já instalados serão mantidos.") }
        .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.item], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls): if let url = urls.first { selecting = true; model.importSoundFont(url, moduleIndex: moduleIndex) }
            case .failure(let error): model.controlError = "Não foi possível abrir o arquivo: \(error.localizedDescription)"
            }
        }
        .alert("Biblioteca SF2", isPresented: Binding(get: { model.controlError != nil }, set: { if !$0 { model.controlError = nil } })) {
            Button("OK") { model.controlError = nil }
        } message: { Text(model.controlError ?? "") }
    }
    private func gigabytes(_ bytes: Double) -> String { String(format: "%.2f GB", bytes / 1_073_741_824) }
    private func categoryButton(_ title: String, id: String, color: UInt32, height: CGFloat) -> some View {
        Button(title) { category = id }.font(.bronzeUI(12)).lineLimit(2)
            .frame(maxWidth: .infinity).frame(height: height).foregroundStyle(category == id ? .black : .white)
            .modifier(BronzeCatalogSurface(color: Color(bronzeHex: category == id ? 0x2cf604 : color)))
            .overlay(RoundedRectangle(cornerRadius: 5).stroke(category == id ? .white : .clear, lineWidth: 2).allowsHitTesting(false))
            .buttonStyle(.plain)
    }
}
