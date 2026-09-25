import SwiftUI
import UniformTypeIdentifiers

struct BronzeNativeRootView: View {
    @StateObject private var model = BronzeNativeAppModel()
    @ObservedObject var account: BronzeNativeAccount
    private struct LibraryTarget: Identifiable { let id: Int }
    @State private var libraryTarget: LibraryTarget?
    @State private var presetTarget: LibraryTarget?
    @State private var showFXEditor = false
    @State private var showBackup = false
    @State private var showMIDI = false
    @State private var showAccount = false
    @State private var showModuleEditor = false
    @State private var showOrgan = false
    @State private var showTracks = false
    @State private var showSettings = false
    @State private var welcomePending = true
    @State private var loadingFinished = false
    private enum ModulePage: Equatable { case performance, tone, envelope, equalizer, reverb, delay, synth, pulse, arpeggiator, processor(BronzeProcessorKind) }
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
        .fullScreenCover(item: $libraryTarget) { target in
            BronzeNativeSoundFontLibrary(model: model, account: account, moduleIndex: target.id)
        }
        .sheet(item: $presetTarget) { target in
            BronzeNativePresetEditor(model: model, index: target.id)
        }
        .fullScreenCover(isPresented: $showFXEditor) { BronzeNativeFXEditor(model: model) }
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
            BronzeNativeModal(title: modulePage == .synth ? "Synth" : "Módulo \(model.selectedModule + 1) · Config") {
                if modulePage == .synth { BronzeNativeSynthEditor(model: model) }
                else { moduleEditor.frame(maxWidth: .infinity).environment(\.bronzeConfigurationBorders, true) }
            }
        }
        .fullScreenCover(isPresented: $showOrgan) {
            BronzeNativeModal(title: "Organ · Bronze B3") { organEditor }
        }
        .fullScreenCover(isPresented: $showTracks) {
            BronzeNativeModal(title: "Playlist") { loopLibrary }
        }
        .fullScreenCover(isPresented: $showSettings) { BronzeNativeSettingsView(model: model) }
    }

    private var moduleEditor: some View {
        VStack(spacing: 14) {
            BronzeModuleRoutingHeader(model: model, index: model.selectedModule)
            ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                moduleTab("Envelope", page: .envelope, color: .bronze)
                moduleTab("EQ", page: .equalizer, color: .cyan)
                if model.selectedModule != 6 { moduleTab("Compressor", page: .processor(.compressor), color: .yellow) }
                moduleTab("Chorus", page: .processor(.chorus), color: .purple)
                if model.selectedModule != 6 { moduleTab("Vibes", page: .processor(.vibes), color: .bronze) }
                moduleTab("Reverb", page: .reverb, color: .green)
                moduleTab("Delay", page: .delay, color: .purple)
                if model.selectedModule != 6 { moduleTab("Arpeggiator", page: .arpeggiator, color: .pink) }
                moduleTab("Pulse", page: .pulse, color: .red)
            }.frame(height: 48)
            }
            Group {
            switch modulePage {
            case .tone:
                BronzeNativeToneEditor(model: model, moduleIndex: model.selectedModule).id(model.selectedModule)
            case .performance:
                BronzeNativePerformanceEditor(model: model, moduleIndex: model.selectedModule).id(model.selectedModule)
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
            }.frame(minHeight: modulePage == .envelope ? 0 : 390, alignment: .top)
            if modulePage != .performance && modulePage != .synth {
                BronzeModulePerformanceCards(model: model, index: model.selectedModule) { modulePage = .performance }
            }
        }
    }

    private func moduleTab(_ label: String, page: ModulePage, color: BronzeDeckPalette) -> some View {
        Button(label) { modulePage = page }
            .buttonStyle(BronzeDeckButtonStyle(palette: modulePage == page ? color : .dark, selected: modulePage == page, size: 11))
            .frame(minWidth: 112)
            .overlay(RoundedRectangle(cornerRadius: 7).stroke(color.colors[2].opacity(0.65)))
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
                        ForEach(0..<2, id: \.self) { bank in
                            Button("Pads \(bank + 1)") { model.selectPadBank(bank) }
                                .buttonStyle(BronzeDeckButtonStyle(palette: bank == 0 ? .bronze : .purple, selected: model.selectedPadBank == bank))
                                .frame(height: compact ? 24 : 34)
                        }
                        HStack { padFilter(low: true); padFilter(low: false) }
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
                                    }.buttonStyle(BronzeDeckButtonStyle(palette: model.isPadActive(index) ? .green : model.selectedPadBank == 0 ? .bronze : .purple, selected: model.isPadActive(index)))
                                }
                            }
                        }
                    }
                }.padding(10).modifier(BronzeDeckSurface()).frame(maxHeight: .infinity)
                VStack(spacing: 8) {
                    HStack(spacing: 6) {
                        ForEach(0..<8, id: \.self) { bank in
                            Button(model.workspace.fxBanks[bank].name) { model.selectFXBank(bank) }
                                .buttonStyle(BronzeDeckButtonStyle(palette: bank == model.workspace.fxBank ? .green : .purple, selected: bank == model.workspace.fxBank, size: compact ? 9 : 12))
                                .contextMenu { Button("Editar efeitos") { showFXEditor = true } }
                        }
                        Button { showFXEditor = true } label: { Image(systemName: "pencil") }
                            .buttonStyle(BronzeDeckButtonStyle()).frame(width: 34)
                    }.frame(height: compact ? 26 : 38).disabled(model.loadingFXBank || model.importingMedia)
                    VStack(spacing: 7) {
                        ForEach(0..<2, id: \.self) { row in
                            HStack(spacing: 7) {
                                ForEach(0..<6, id: \.self) { column in
                                    let index = row * 6 + column
                                    let pad = model.workspace.fxBanks[model.workspace.fxBank].pads[index]
                                    Text(pad.name).font(.bronzeUI(compact ? 11 : 16)).lineLimit(2)
                                        .foregroundStyle(.white).frame(maxWidth: .infinity, maxHeight: .infinity)
                                        .background(LinearGradient(colors: [BronzePresetPalette.colors[pad.color], BronzePresetPalette.colors[pad.color].opacity(0.35)], startPoint: .topLeading, endPoint: .bottomTrailing))
                                        .clipShape(RoundedRectangle(cornerRadius: 9))
                                        .overlay { if model.effectLevels[index] > 0 { BronzePresetHighlight() } }
                                        .gesture(DragGesture(minimumDistance: 0)
                                            .onChanged { _ in model.triggerEffect(index, pressed: true) }
                                            .onEnded { _ in model.triggerEffect(index, pressed: false) })
                                        .accessibilityAddTraits(.isButton).accessibilityLabel(pad.name)
                                        .accessibilityAction { model.triggerEffect(index, pressed: true); model.triggerEffect(index, pressed: false) }
                                        .disabled(!model.isFXReady(index))
                                }
                            }
                        }
                    }.disabled(model.loadingFXBank)
                }.padding(10).modifier(BronzeDeckSurface()).frame(maxHeight: .infinity)
            }
        }.onDisappear { model.endEffectTouches() }
    }

    private func padFilter(low: Bool) -> some View {
        VStack(spacing: 2) {
            Text(low ? "Low" : "High").font(.bronzeUI(12))
            BronzeSkiaControl(kind: .knob, value: Binding(
                get: { low ? model.padFilterLow : model.padFilterHigh },
                set: { model.setPadFilter(low: low, normalized: $0) }
            ), accessibilityLabel: low ? "Filtro passa-altas dos pads" : "Filtro passa-baixas dos pads")
                .frame(width: 48, height: 48)
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
            .foregroundStyle(Color.black)
            .frame(maxWidth: .infinity, minHeight: 42)
            .background(BronzePresetPalette.colors[preset.color])
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
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    @State private var confirmReset = false
    @State private var tap = BronzeDelayTap()
    private var delay: BronzeDelay { model.moduleDelays[moduleIndex] }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Button(delay.enabled ? "Delay ON" : "Delay OFF") { change { $0.enabled.toggle() } }
                    .buttonStyle(BronzeCompactButtonStyle(active: delay.enabled))
                Button("Sync") { change { $0.sync.toggle() } }
                    .buttonStyle(BronzeCompactButtonStyle(active: delay.sync))
                if model.updatingDelay { ProgressView().scaleEffect(0.7).accessibilityLabel("Atualizando Delay") }
                Spacer()
                Button("Reset") { confirmReset = true }.font(.bronzeUI(16))
            }
            HStack(spacing: 6) {
                ForEach(BronzeDelay.divisions.indices, id: \.self) { index in
                    Button(BronzeDelay.divisions[index]) { change { $0.division = index } }
                        .buttonStyle(BronzeCompactButtonStyle(active: delay.division == index))
                }
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 230), spacing: 16)], spacing: 20) {
                VStack(spacing: 6) {
                    Button("Tap") {
                        if let milliseconds = tap.tap(at: ProcessInfo.processInfo.systemUptime) {
                            change { $0.milliseconds = milliseconds }
                        }
                    }.buttonStyle(BronzeCompactButtonStyle(active: false)).disabled(delay.sync)
                    Text(String(format: "Eco: %.0f ms", delay.effectiveMilliseconds(bpm: model.tempo)))
                        .font(.caption.monospacedDigit())
                }
                ForEach(BronzeDelayParameter.allCases) { parameter in parameterControl(parameter) }
            }
            Text(delay.sync ? "Sync usa o BPM global. O tempo manual fica guardado." : "A divisão multiplica o tempo manual; a cauda de Delay tem limite de 4 s.")
                .font(.bronzeUI(14)).foregroundStyle(.secondary)
        }
        .onChange(of: delay.sync) { _ in tap.reset() }
        .onDisappear { tap.reset() }
        .alert("Restaurar o Delay deste módulo?", isPresented: $confirmReset) {
            Button("Cancelar", role: .cancel) {}
            Button("Restaurar", role: .destructive) {
                tap.reset()
                model.setDelay(BronzeDelay(), moduleIndex: moduleIndex)
            }
        } message: { Text("Somente o Delay será restaurado. Reverb, EQ e outros efeitos não mudam.") }
    }

    private func parameterControl(_ parameter: BronzeDelayParameter) -> some View {
        let inactive = parameter == .milliseconds && delay.sync
        return VStack(spacing: 2) {
            Text(parameter.rawValue).font(.bronzeUI(14))
            HStack(spacing: 4) {
                VStack(spacing: 3) {
                    BronzeRepeatButton(label: "+", accessibilityText: "Aumentar \(parameter.rawValue) do Delay") {
                        change { $0.step(parameter, direction: 1) }
                    }
                    BronzeRepeatButton(label: "−", accessibilityText: "Diminuir \(parameter.rawValue) do Delay") {
                        change { $0.step(parameter, direction: -1) }
                    }
                }
                BronzeSkiaControl(kind: .knob, value: Binding(
                    get: { delay.normalized(parameter) },
                    set: { value in change { $0.setNormalized(parameter, value) } }
                ), accessibilityLabel: "\(parameter.rawValue) do Delay").modifier(BronzeParameterDialSize())
            }.disabled(inactive).opacity(inactive ? 0.4 : 1)
            Text(delay.text(parameter, bpm: model.tempo)).font(.bronzeUI(14))
        }
    }

    private func change(_ edit: (inout BronzeDelay) -> Void) {
        var next = delay
        edit(&next)
        model.setDelay(next, moduleIndex: moduleIndex)
    }
}

struct BronzeNativeReverbEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    @State private var confirmReset = false
    private var reverb: BronzeReverb { model.moduleReverbs[moduleIndex] }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Button(reverb.enabled ? "Reverb ON" : "Reverb OFF") {
                    change { $0.enabled.toggle() }
                }.buttonStyle(BronzeCompactButtonStyle(active: reverb.enabled))
                if model.updatingReverb { ProgressView().scaleEffect(0.7).accessibilityLabel("Atualizando reverb") }
                Spacer()
                Button("Reset") { confirmReset = true }.font(.bronzeUI(16))
                Text("Convolution").font(.bronzeUI(14))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Color.bronze.opacity(0.3)).clipShape(Capsule())
            }
            HStack(spacing: 14) {
                ForEach(0..<4, id: \.self) { index in
                    impulseButton(index)
                }
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 20)], spacing: 20) {
                parameterControl(decay: false)
                parameterControl(decay: true)
                Text("Decay: 100% mantém o IR original; valores menores encurtam sua cauda, sem mudar a afinação.")
                    .font(.bronzeUI(14)).foregroundStyle(.secondary).frame(maxWidth: 230)
            }
            Text("Cada Room e Hall mantém seu próprio Mix e Decay.").font(.bronzeUI(14)).foregroundStyle(.secondary)
        }
        .alert("Restaurar o reverb deste módulo?", isPresented: $confirmReset) {
            Button("Cancelar", role: .cancel) {}
            Button("Restaurar", role: .destructive) { model.setReverb(BronzeReverb(), moduleIndex: moduleIndex) }
        } message: { Text("Desliga o reverb e restaura Mix e Decay dos quatro IRs. Os outros efeitos não mudam.") }
    }

    private func parameterControl(decay: Bool) -> some View {
        let label = decay ? "Decay" : "Mix"
        return VStack(spacing: 2) {
            Text(label).font(.bronzeUI(14))
            HStack(spacing: 4) {
                VStack(spacing: 3) {
                    BronzeRepeatButton(label: "+", accessibilityText: "Aumentar \(label) do reverb") { step(decay: decay, direction: 1) }
                    BronzeRepeatButton(label: "−", accessibilityText: "Diminuir \(label) do reverb") { step(decay: decay, direction: -1) }
                }
                BronzeSkiaControl(kind: .knob, value: Binding(
                    get: { decay ? (reverb.decay - 0.1) / 0.9 : reverb.mix },
                    set: { value in change { if decay { $0.setDecay(0.1 + value * 0.9) } else { $0.setMix(value) } } }
                ), accessibilityLabel: "\(label) do reverb \(BronzeReverb.names[reverb.impulse])").modifier(BronzeParameterDialSize(regular: 196, compact: 160))
            }
            Text(String(format: "%.0f%%", (decay ? reverb.decay : reverb.mix) * 100)).font(.caption.monospacedDigit())
        }
    }

    private func step(decay: Bool, direction: Double) {
        change {
            if decay { $0.setDecay(($0.decay * 100 + direction).rounded() / 100) }
            else { $0.setMix(($0.mix * 100 + direction).rounded() / 100) }
        }
    }

    private func impulseButton(_ index: Int) -> some View {
        Button { change { $0.select(index) } } label: {
            VStack(spacing: 5) {
                Text(BronzeReverb.names[index]).font(.bronzeUI(16))
                Text(String(format: "%.0f%%", reverb.mixes[index] * 100)).font(.bronzeUI(14))
                Text(String(format: "Decay %.0f%%", reverb.decays[index] * 100)).font(.bronzeUI(14))
            }.padding(.vertical, 8)
        }.buttonStyle(BronzeButtonStyle(active: reverb.impulse == index))
    }

    private func change(_ edit: (inout BronzeReverb) -> Void) {
        var next = reverb
        edit(&next)
        model.setReverb(next, moduleIndex: moduleIndex)
    }
}

struct BronzeNativeValueKnob: View {
    let definition: BronzeProcessorParameter
    @Binding var value: Double
    var body: some View {
        BronzePanel {
            VStack(spacing: 4) {
                Text(definition.name).font(.bronzeUI(16))
                HStack(spacing: 3) {
                    VStack(spacing: 3) {
                        BronzeRepeatButton(label: "+", accessibilityText: "Aumentar \(definition.name)") {
                            value = definition.stepped(value, direction: 1)
                        }
                        BronzeRepeatButton(label: "−", accessibilityText: "Diminuir \(definition.name)") {
                            value = definition.stepped(value, direction: -1)
                        }
                    }
                    BronzeSkiaControl(kind: .knob, value: Binding(
                        get: { definition.normalized(value) },
                        set: { if $0.isFinite { value = definition.value($0) } }
                    ), accessibilityLabel: definition.name).modifier(BronzeParameterDialSize())
                }
                Text(definition.text(value)).font(.bronzeUI(14))
            }.frame(minWidth: 94)
        }
    }
}

struct BronzeNativeToneEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    @State private var tab = 0
    @State private var confirmReset = false
    private var tone: BronzeTone { model.moduleTones[moduleIndex] }
    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                if moduleIndex < 6 {
                    Button(tone.enabled ? "FILTER ON" : "FILTER OFF") { edit { $0.enabled.toggle() } }
                        .buttonStyle(BronzeCompactButtonStyle(active: tone.enabled))
                    Menu(["LP 12", "LP 24", "HP 12", "HP 24"][tone.type]) {
                        ForEach(0..<4, id: \.self) { type in Button(["LP 12", "LP 24", "HP 12", "HP 24"][type]) { edit { $0.type = type } } }
                    }
                    Button("Cutoff / Gain") { tab = 0 }.buttonStyle(BronzeCompactButtonStyle(active: tab == 0))
                    Button("Envelope") { tab = 1 }.buttonStyle(BronzeCompactButtonStyle(active: tab == 1))
                    Button("Velocity") { tab = 2 }.buttonStyle(BronzeCompactButtonStyle(active: tab == 2))
                }
                Spacer()
                Button("Reset") { confirmReset = true }.font(.bronzeUI(16))
            }
            ScrollView(.horizontal) {
                HStack(spacing: 12) {
                    if tab == 0 || moduleIndex >= 6 {
                        ForEach(moduleIndex < 6 ? [BronzeToneParameter.cutoff, .gain] : [.gain]) { parameter in
                            BronzeNativeValueKnob(definition: parameter.definition, value: Binding(
                                get: { tone[parameter] }, set: { value in edit { $0[parameter] = value } }))
                        }
                    } else if tab == 1 {
                        Button("Envelope \(tone.envelopeEnabled ? "ON" : "OFF")") { edit { $0.envelopeEnabled.toggle() } }
                            .buttonStyle(BronzeCompactButtonStyle(active: tone.envelopeEnabled))
                        ForEach([BronzeToneParameter.attack, .decay, .sustain, .release, .depth]) { parameter in
                            BronzeNativeValueKnob(definition: parameter.definition, value: Binding(
                                get: { tone[parameter] }, set: { value in edit { $0[parameter] = value } }))
                        }
                    } else {
                        Button("Sem Velocity") { edit { $0.velocity = [127, 127, 127, 127, 127] } }
                        ForEach(0..<5, id: \.self) { point in
                            VStack {
                                Text("Ponto \(point + 1)").font(.bronzeUI(16))
                                BronzeSkiaControl(kind: .knob, value: Binding(
                                    get: { Double(tone.velocity[point]) / 127 },
                                    set: { value in guard value.isFinite else { return }; edit { $0.velocity[point] = min(127, max(0, Int((value * 127).rounded()))) } }
                                ), accessibilityLabel: "Velocity do filtro \(point + 1)").modifier(BronzeParameterDialSize(regular: 144, compact: 120))
                                Stepper("\(tone.velocity[point])", value: Binding(get: { tone.velocity[point] },
                                    set: { value in edit { $0.velocity[point] = value } }), in: 0...127)
                            }.frame(width: 145)
                        }
                    }
                }.padding(.vertical, 4)
            }
        }
        .confirmationDialog("Restaurar filtro e Gain?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Restaurar", role: .destructive) { model.setTone(BronzeTone(), moduleIndex: moduleIndex) }
            Button("Cancelar", role: .cancel) {}
        }
    }
    private func edit(_ change: (inout BronzeTone) -> Void) {
        var next = tone; change(&next); model.setTone(next, moduleIndex: moduleIndex)
    }
}

struct BronzeNativePerformanceEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    @State private var tab = 0
    @State private var confirmReset = false
    private var config: BronzeModulePerformance { model.modulePerformance[moduleIndex] }
    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Button("MIDI / Saída") { tab = 0 }.buttonStyle(BronzeCompactButtonStyle(active: tab == 0))
                if moduleIndex != 6 {
                    Button("Velocity") { tab = 1 }.buttonStyle(BronzeCompactButtonStyle(active: tab == 1))
                }
                if moduleIndex != 7 {
                    Button("Mod") { tab = 2 }.buttonStyle(BronzeCompactButtonStyle(active: tab == 2))
                }
                if moduleIndex < 6 {
                    Button("Glide") { tab = 3 }.buttonStyle(BronzeCompactButtonStyle(active: tab == 3))
                }
                Spacer()
                Button("Reset Config") { confirmReset = true }.font(.bronzeUI(16))
            }
            ScrollView(.horizontal) {
                HStack(alignment: .center, spacing: 14) {
                    if tab == 0 {
                        VStack(spacing: 10) {
                            Menu(config.input < 0 ? "MIDI: Todos" : "MIDI: \(config.input + 1)") {
                                Button("Todos") { edit { $0.input = -1 } }
                                ForEach(0..<3, id: \.self) { input in
                                    Button("\(input + 1): \(model.midiDevices.indices.contains(input) ? model.midiDevices[input].name : "Não conectado")") {
                                        edit { $0.input = input }
                                    }
                                }
                            }
                            Button("Sustain") { edit { $0.sustain.toggle() } }
                                .buttonStyle(BronzeCompactButtonStyle(active: config.sustain))
                            Button("Mod Wheel") { edit { $0.modulation.toggle() } }
                                .buttonStyle(BronzeCompactButtonStyle(active: config.modulation))
                        }
                        VStack {
                            Stepper("Low: \(config.lowNote)", value: integer(\.lowNote), in: 0...config.highNote)
                            Stepper("High: \(config.highNote)", value: integer(\.highNote), in: config.lowNote...127)
                            Stepper("Oct: \(config.octave)", value: integer(\.octave), in: -3...3)
                        }.frame(width: 205)
                        VStack {
                            Stepper("Poly: \(config.polyphony)", value: integer(\.polyphony), in: 1...128)
                            if moduleIndex < 6 {
                                Menu(BronzeSynth.modes[config.mode]) {
                                    ForEach(0..<3, id: \.self) { mode in Button(BronzeSynth.modes[mode]) { edit { $0.mode = mode } } }
                                }
                            }
                        }.frame(width: 200)
                        VStack(spacing: 10) {
                            Menu(config.outputCount == 1 ? "Saída \(config.outputStart + 1)" : "Saída \(config.outputStart + 1)+\(config.outputStart + 2)") {
                                ForEach(0..<(config.outputCount == 1 ? 32 : 31), id: \.self) { start in
                                    Button(config.outputCount == 1 ? "\(start + 1)" : "\(start + 1)+\(start + 2)") { edit { $0.outputStart = start } }
                                }
                            }
                            Button(config.outputCount == 1 ? "1 canal" : "2 canais") {
                                edit { $0.outputCount = $0.outputCount == 1 ? 2 : 1; $0.outputStart = min($0.outputStart, 32 - $0.outputCount) }
                            }
                            Button(config.dualMono ? "MONO" : "STEREO") { edit { $0.dualMono.toggle() } }
                                .buttonStyle(BronzeCompactButtonStyle(active: config.dualMono))
                        }
                    } else if tab == 1 {
                        VStack(spacing: 8) {
                            Button("No Sens") { edit { $0.noSens.toggle() } }.buttonStyle(BronzeCompactButtonStyle(active: config.noSens))
                            Menu("Curva") {
                                Button("Soft") { edit { $0.velocityCurve = [0, 50, 85, 110, 127] } }
                                Button("Middle") { edit { $0.velocityCurve = [0, 32, 64, 96, 127] } }
                                Button("Hard") { edit { $0.velocityCurve = [0, 15, 40, 75, 127] } }
                                Button("Fixed") { edit { $0.velocityCurve = [127, 127, 127, 127, 127] } }
                            }
                        }
                        ForEach(0..<5, id: \.self) { point in
                            VStack {
                                Text("Ponto \(point + 1)").font(.bronzeUI(16))
                                BronzeSkiaControl(kind: .knob, value: Binding(
                                    get: { Double(config.velocityCurve[point]) / 127 },
                                    set: { value in guard value.isFinite else { return }; edit { $0.velocityCurve[point] = min(127, max(0, Int((value * 127).rounded()))) } }
                                ), accessibilityLabel: "Velocity ponto \(point + 1)").modifier(BronzeParameterDialSize(regular: 144, compact: 120))
                                Stepper("\(config.velocityCurve[point])", value: Binding(
                                    get: { config.velocityCurve[point] }, set: { value in edit { $0.velocityCurve[point] = value } }), in: 0...127)
                            }.frame(width: 145)
                        }
                        VStack {
                            Stepper("Ignorar > \(config.velocityIgnoreAbove)", value: integer(\.velocityIgnoreAbove), in: 0...127)
                            Stepper("Limitar: \(config.velocityCeiling)", value: integer(\.velocityCeiling), in: 1...127)
                        }.frame(width: 235)
                    } else if tab == 3 {
                        Button("Sync") { edit { $0.glideSync.toggle() } }.buttonStyle(BronzeCompactButtonStyle(active: config.glideSync))
                        Button(config.portamento ? "Portamento" : "Auto") { edit { $0.portamento.toggle() } }
                        BronzeNativeValueKnob(definition: .init("Glide", 0, 5000, 0, .milliseconds),
                            value: Binding(get: { config.glideMs }, set: { value in edit { $0.glideMs = value } }))
                            .disabled(config.glideSync)
                        if config.glideSync { Text(String(format: "%.0f ms", config.glideTime(bpm: model.tempo))) }
                        VStack(spacing: 8) {
                            Button("Velocity Gate") { edit { $0.glideVelocityGate.toggle() } }
                                .buttonStyle(BronzeCompactButtonStyle(active: config.glideVelocityGate))
                            Button(config.glideVelocityInverted ? "Acima do limite" : "Abaixo do limite") { edit { $0.glideVelocityInverted.toggle() } }
                            Stepper("\(config.glideVelocityThreshold)", value: integer(\.glideVelocityThreshold), in: 0...127)
                        }.frame(width: 175)
                    } else {
                        Menu(["User", "LFO", "Tremolo", "Pan", "Wheel Rotary"][config.modulationMode]) {
                            ForEach(moduleIndex == 6 ? [4, 2, 3] : [0, 1, 2, 3], id: \.self) { mode in
                                Button(["User", "LFO", "Tremolo", "Pan", "Wheel Rotary"][mode]) { edit { $0.modulationMode = mode } }
                            }
                        }
                        BronzeNativeValueKnob(definition: .init("Rate", 0.1, 20, 6.85, .hertz),
                            value: Binding(get: { config.modulationRate }, set: { value in edit { $0.modulationRate = value } }))
                        BronzeNativeValueKnob(definition: .init("Intensity", 0, 1, 1, .percent),
                            value: Binding(get: { config.modulationIntensity }, set: { value in edit { $0.modulationIntensity = value } }))
                    }
                }.padding(.vertical, 4)
            }
        }
        .confirmationDialog("Restaurar configuração do módulo?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Restaurar", role: .destructive) { model.setPerformance(BronzeModulePerformance.initial(moduleIndex), moduleIndex: moduleIndex) }
            Button("Cancelar", role: .cancel) {}
        }
    }
    private func integer(_ key: WritableKeyPath<BronzeModulePerformance, Int>) -> Binding<Int> {
        Binding(get: { config[keyPath: key] }, set: { value in edit { $0[keyPath: key] = value } })
    }
    private func edit(_ change: (inout BronzeModulePerformance) -> Void) {
        var next = config; change(&next); model.setPerformance(next, moduleIndex: moduleIndex)
    }
}

struct BronzeNativeArpeggiatorEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    @State private var confirmReset = false
    private var arp: BronzeArpeggiator { model.moduleArpeggiators[moduleIndex] }
    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Button(arp.enabled ? "ARP ON" : "ARP OFF") { edit { $0.enabled.toggle() } }
                    .buttonStyle(BronzeCompactButtonStyle(active: arp.enabled))
                Button("Sync") { edit { $0.sync.toggle() } }
                    .buttonStyle(BronzeCompactButtonStyle(active: arp.sync))
                Menu(BronzeArpeggiator.modes[arp.mode]) {
                    ForEach(0..<5, id: \.self) { mode in
                        Button(BronzeArpeggiator.modes[mode]) { edit { $0.mode = mode } }
                    }
                }
                Menu("\(arp.octaves) oitava(s)") {
                    ForEach(1...4, id: \.self) { octave in Button("\(octave)") { edit { $0.octaves = octave } } }
                }
                Spacer()
                Text("\(model.timeSignatureNumerator)/\(model.timeSignatureDenominator)").font(.bronzeUI(16))
                Button("Reset") { confirmReset = true }.font(.bronzeUI(16))
            }
            Group {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 16)], spacing: 20) {
                    if arp.sync {
                        VStack(spacing: 3) {
                            Text("Divisão").font(.bronzeUI(16))
                            HStack(spacing: 3) {
                                VStack(spacing: 3) {
                                    BronzeRepeatButton(label: "+", accessibilityText: "Próxima divisão") { edit { $0.division = min(7, $0.division + 1) } }
                                    BronzeRepeatButton(label: "−", accessibilityText: "Divisão anterior") { edit { $0.division = max(0, $0.division - 1) } }
                                }
                                BronzeSkiaControl(kind: .knob, value: Binding(
                                    get: { Double(arp.division) / 7 },
                                    set: { n in guard n.isFinite else { return }; edit { $0.division = min(7, max(0, Int((n * 7).rounded()))) } }
                                ), accessibilityLabel: "Divisão do Arpeggiator").modifier(BronzeParameterDialSize())
                            }
                            Text(BronzePulse.divisions[arp.division]).font(.bronzeUI(14))
                        }
                    } else {
                        BronzeNativeValueKnob(definition: .init("Rate", 20, 2000, 125, .milliseconds),
                            value: Binding(get: { arp.rateMs }, set: { value in edit { $0.rateMs = value } }))
                    }
                    BronzeNativeValueKnob(definition: .init("Gate", 0.1, 1, 0.72, .percent),
                        value: Binding(get: { arp.gate }, set: { value in edit { $0.gate = value } }))
                    BronzeNativeValueKnob(definition: .init("Swing", 0, 0.75, 0, .percent),
                        value: Binding(get: { arp.swing }, set: { value in edit { $0.swing = value } }))
                    VStack(spacing: 8) {
                        Button("Auto Fader") { edit { $0.autoFaderEnabled.toggle() } }
                            .buttonStyle(BronzeCompactButtonStyle(active: arp.autoFaderEnabled && arp.enabled))
                        HStack(spacing: 5) {
                            Button("1/1") { edit { $0.autoFaderHalf = false } }
                                .buttonStyle(BronzeCompactButtonStyle(active: !arp.autoFaderHalf))
                            Button("1/2") { edit { $0.autoFaderHalf = true } }
                                .buttonStyle(BronzeCompactButtonStyle(active: arp.autoFaderHalf))
                        }
                    }.disabled(!arp.enabled)
                    BronzeNativeValueKnob(definition: .init("Depth", 0, 40, 5, .decibels),
                        value: Binding(get: { arp.autoFaderDepthDb }, set: { value in edit { $0.autoFaderDepthDb = value } }))
                        .disabled(!arp.enabled || !arp.autoFaderEnabled)
                }.padding(.vertical, 4)
            }
        }
        .confirmationDialog("Restaurar Arpeggiator?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Restaurar", role: .destructive) { model.setArpeggiator(BronzeArpeggiator(), moduleIndex: moduleIndex) }
            Button("Cancelar", role: .cancel) {}
        }
    }
    private func edit(_ change: (inout BronzeArpeggiator) -> Void) {
        var next = arp; change(&next); model.setArpeggiator(next, moduleIndex: moduleIndex)
    }
}

struct BronzeNativePulseEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    @State private var confirmReset = false
    private var pulse: BronzePulse { model.modulePulses[moduleIndex] }
    var body: some View {
        VStack(spacing: 5) {
            HStack(spacing: 8) {
                Button(pulse.enabled ? "PULSE ON" : "PULSE OFF") { edit { $0.enabled.toggle() } }
                    .buttonStyle(BronzeCompactButtonStyle(active: pulse.enabled))
                Button("Sync") { edit { $0.sync.toggle() } }
                    .buttonStyle(BronzeCompactButtonStyle(active: pulse.sync))
                Menu("\(pulse.length) passos") {
                    ForEach(1...16, id: \.self) { length in Button("\(length)") { edit { $0.length = length } } }
                }
                Text("\(model.timeSignatureNumerator)/\(model.timeSignatureDenominator)").font(.bronzeUI(16))
                Spacer()
                Button("Reset") { confirmReset = true }.font(.bronzeUI(16))
            }
            HStack(spacing: 3) {
                ForEach(0..<16, id: \.self) { index in
                    Button("\(index + 1)") { edit { $0.steps ^= 1 << index } }
                        .buttonStyle(BronzeCompactButtonStyle(active: (pulse.steps & (1 << index)) != 0))
                        .disabled(index >= pulse.length).opacity(index < pulse.length ? 1 : 0.3)
                        .accessibilityLabel("Passo \(index + 1)")
                }
            }
            Group {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 16)], spacing: 20) {
                    if pulse.sync {
                        VStack(spacing: 3) {
                            Text("Divisão").font(.bronzeUI(16))
                            HStack(spacing: 3) {
                                VStack(spacing: 3) {
                                    BronzeRepeatButton(label: "+", accessibilityText: "Próxima divisão") { edit { $0.division = min(7, $0.division + 1) } }
                                    BronzeRepeatButton(label: "−", accessibilityText: "Divisão anterior") { edit { $0.division = max(0, $0.division - 1) } }
                                }
                                BronzeSkiaControl(kind: .knob, value: Binding(
                                    get: { Double(pulse.division) / 7 },
                                    set: { n in guard n.isFinite else { return }; edit { $0.division = min(7, max(0, Int((n * 7).rounded()))) } }
                                ), accessibilityLabel: "Divisão do Pulse").modifier(BronzeParameterDialSize())
                            }
                            Text(BronzePulse.divisions[pulse.division]).font(.bronzeUI(14))
                        }
                    } else {
                        BronzeNativeValueKnob(definition: .init("Rate", 20, 2000, 125, .milliseconds), value: Binding(
                            get: { pulse.rateMs }, set: { value in edit { $0.rateMs = value } }))
                    }
                    ForEach(BronzePulseParameter.allCases) { parameter in
                        BronzeNativeValueKnob(definition: parameter.definition, value: Binding(
                            get: { pulse[parameter] }, set: { value in edit { $0[parameter] = value } }))
                    }
                }.padding(.vertical, 4)
            }
        }
        .confirmationDialog("Restaurar Pulse?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Restaurar", role: .destructive) { model.setPulse(BronzePulse(), moduleIndex: moduleIndex) }
            Button("Cancelar", role: .cancel) {}
        }
    }
    private func edit(_ change: (inout BronzePulse) -> Void) {
        var next = pulse; change(&next); model.setPulse(next, moduleIndex: moduleIndex)
    }
}

struct BronzeNativeSynthEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    @State private var oscillatorIndex = 0
    @State private var showModulation = false
    @State private var confirmReset = false
    @State private var showPresets = false
    private var oscillator: BronzeOscillator { model.synth.oscillators[oscillatorIndex] }
    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { index in
                    Button("OSC \(index + 1)") { oscillatorIndex = index }
                        .buttonStyle(BronzeDeckButtonStyle(palette: [.green, .pink, .blue][index], selected: oscillatorIndex == index))
                }
            }.frame(height: 34)
            HStack(spacing: 8) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 5) {
                        ForEach(0..<16, id: \.self) { index in
                            Button(model.workspace.synthPresets[index].sound == nil ? "Preset \(index + 1)" : model.workspace.synthPresets[index].name) {
                                if model.workspace.synthPresets[index].sound != nil { model.recallSynthPreset(index) }
                                else { showPresets = true }
                            }.buttonStyle(BronzeDeckButtonStyle(palette: model.workspace.activeSynthPreset == index ? .green : .grey, selected: model.workspace.activeSynthPreset == index))
                                .frame(width: 146, height: 34).contextMenu { Button("Editar presets") { showPresets = true } }
                        }
                    }
                }
                Button(model.synth.mode == 0 ? "Poly" : "Mono") { edit { $0.mode = $0.mode == 0 ? 1 : 0 } }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(width: 112)
                Button("Legato") { edit { $0.mode = $0.mode == 2 ? 1 : 2 } }.buttonStyle(BronzeDeckButtonStyle(palette: model.synth.mode == 2 ? .green : .grey, selected: model.synth.mode == 2)).frame(width: 112)
            }.frame(height: 34)
            HStack(spacing: 3) {
                VStack(spacing: 12) {
                    BronzeOscillatorWaveform(shape: oscillator.shape).frame(height: 38)
                    HStack { Text("OSC \(oscillatorIndex + 1)"); Spacer(); Button(oscillator.enabled ? "ON" : "OFF") { editOscillator { $0.enabled.toggle() } }.buttonStyle(BronzeDeckButtonStyle(palette: oscillator.enabled ? .green : .red)).frame(width: 120, height: 29) }
                    HStack(spacing: 5) { ForEach(0..<4, id: \.self) { shape in
                        Button(BronzeSynth.shapes[shape]) { editOscillator { $0.shape = shape } }.buttonStyle(BronzeDeckButtonStyle(palette: oscillator.shape == shape ? .green : .grey, selected: oscillator.shape == shape))
                    }}.frame(height: 33)
                }.padding(12).frame(maxWidth: .infinity).frame(height: 172).modifier(BronzeDeckSurface(radius: 3))
                VStack(spacing: 3) {
                    HStack(spacing: 3) {
                        synthCell(.init("Volume OSC \(oscillatorIndex + 1)", 0, 1, 1, .amplitude), value: Binding(get: { oscillator.volume }, set: { value in editOscillator { $0.volume = value } }), tint: .orange)
                        synthCell(.init("Detune OSC \(oscillatorIndex + 1)", -100, 100, 0, .rawCents), value: Binding(get: { oscillator.detune }, set: { value in editOscillator { $0.detune = value } }), tint: .green)
                    }
                    HStack(spacing: 8) {
                        Text("OSC \(oscillatorIndex + 1) · \(oscillator.octave)").font(.bronzeUI(11))
                        Button("OCT −") { editOscillator { $0.octave = max(-3, $0.octave - 1) } }.buttonStyle(BronzeDeckButtonStyle(palette: .grey))
                        Button("OCT +") { editOscillator { $0.octave = min(3, $0.octave + 1) } }.buttonStyle(BronzeDeckButtonStyle(palette: .grey))
                    }.frame(height: 29).padding(8).modifier(BronzeDeckSurface(radius: 3))
                }.frame(maxWidth: .infinity)
            }
            HStack(spacing: 3) {
                ForEach(Array([BronzeNativeAppModel.EnvelopeParameter.attack, .hold, .decay, .release].enumerated()), id: \.offset) { index, parameter in
                    VStack(spacing: 5) {
                        Text(parameter.rawValue)
                        BronzeDial(value: Binding(get: { model.envelopeValue(parameter, moduleIndex: 7) }, set: { model.setEnvelopeValue(parameter, moduleIndex: 7, normalized: $0) }), tint: [.cyan, .pink, .orange, .green][index], label: parameter.rawValue).frame(width: 65, height: 65)
                        Text(model.envelopeValueText(parameter, moduleIndex: 7)).font(.bronzeUI(10))
                    }.frame(maxWidth: .infinity).frame(height: 112).modifier(BronzeDeckSurface(radius: 3))
                }
            }
            HStack(spacing: 3) {
                HStack(spacing: 3) { parameter(.cutoff, tint: .cyan); parameter(.resonance, tint: .pink) }.frame(maxWidth: .infinity)
                parameter(.filterEnvelope, tint: .orange).frame(maxWidth: .infinity)
            }
            HStack(spacing: 3) {
                VStack(alignment: .leading, spacing: 16) {
                    Text("LFO destino")
                    HStack(spacing: 4) { ForEach(0..<3, id: \.self) { target in
                        Button(BronzeSynth.targets[target]) { edit { $0.lfoTarget = target } }.buttonStyle(BronzeDeckButtonStyle(palette: model.synth.lfoTarget == target ? .green : .grey, selected: model.synth.lfoTarget == target))
                    }}.frame(height: 33)
                }.padding(12).frame(maxWidth: .infinity).frame(height: 112).modifier(BronzeDeckSurface(radius: 3))
                HStack(spacing: 3) { parameter(.lfoRate, tint: .cyan); parameter(.lfoDepth, tint: .pink) }.frame(maxWidth: .infinity)
            }
            HStack { parameter(.glide, tint: .cyan); Button("Presets Synth") { showPresets = true }; Button("Reset Synth") { confirmReset = true } }.buttonStyle(BronzeCompactButtonStyle(active: false))
        }.padding(16).background(LinearGradient(colors: [Color.purple.opacity(0.13), Color.blue.opacity(0.05)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.purple.opacity(0.7)))
            .frame(maxWidth: 1110).frame(maxWidth: .infinity)
        .sheet(isPresented: $showPresets) { BronzeNativeSynthPresets(model: model) }
        .confirmationDialog("Restaurar os parâmetros do Synth?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Restaurar", role: .destructive) { model.setSynth(BronzeSynth()) }
            Button("Cancelar", role: .cancel) {}
        }
    }
    private func parameter(_ parameter: BronzeSynthParameter, tint: Color) -> some View {
        synthCell(parameter.definition, value: Binding(get: { model.synth[parameter] }, set: { value in edit { $0[parameter] = value } }), tint: tint)
    }
    private func synthCell(_ definition: BronzeProcessorParameter, value: Binding<Double>, tint: Color) -> some View {
        VStack(spacing: 5) {
            Text(definition.name).font(.bronzeUI(11))
            BronzeDial(value: Binding(get: { definition.normalized(value.wrappedValue) }, set: { value.wrappedValue = definition.value($0) }), tint: tint, label: definition.name).frame(width: 65, height: 65)
            Text(definition.text(value.wrappedValue)).font(.bronzeUI(10)).foregroundStyle(tint)
        }.frame(maxWidth: .infinity).frame(height: 112).modifier(BronzeDeckSurface(radius: 3))
    }
    private func edit(_ change: (inout BronzeSynth) -> Void) {
        var next = model.synth; change(&next); model.setSynth(next)
    }
    private func editOscillator(_ change: (inout BronzeOscillator) -> Void) {
        edit { change(&$0.oscillators[oscillatorIndex]) }
    }
}

struct BronzeNativeProcessorEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    let kind: BronzeProcessorKind
    @State private var confirmReset = false
    private var settings: BronzeProcessor { model.moduleSoundEffects[moduleIndex][kind] }

    var body: some View {
        VStack(spacing: 6) {
            HStack {
                Button(settings.enabled ? "\(kind.rawValue) ON" : "\(kind.rawValue) OFF") { edit { $0.enabled.toggle() } }
                    .buttonStyle(BronzeCompactButtonStyle(active: settings.enabled))
                if kind == .vibes { Text("Afinação • 0–100 cents").font(.bronzeUI(12)).foregroundStyle(.secondary) }
                Spacer()
                Button("Reset") { confirmReset = true }.font(.bronzeUI(12))
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 6) {
                ForEach(kind.parameters.indices, id: \.self) { index in control(index) }
            }
        }
        .confirmationDialog("Restaurar \(kind.rawValue)?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Restaurar", role: .destructive) { edit { $0 = BronzeProcessor(kind) } }
            Button("Cancelar", role: .cancel) {}
        }
    }

    private func control(_ index: Int) -> some View {
        let parameter = kind.parameters[index]
        let isVinyl = kind == .vibes && index == 2
        return BronzePanel {
            VStack(spacing: 5) {
                Text(parameter.name).font(.bronzeUI(12))
                BronzeDial(value: Binding(get: { parameter.normalized(settings.values[index]) }, set: { value in edit { $0.values[index] = parameter.value(value) } }), tint: [.cyan, .pink, .orange, .green, .purple, .yellow][index % 6], label: "\(kind.rawValue) \(parameter.name)").modifier(BronzeParameterDialSize())
                Text(parameter.text(settings.values[index])).font(.bronzeUI(10))
                if isVinyl {
                    Button(settings.vinylEnabled ? "VINYL ON" : "VINYL OFF") { edit { $0.vinylEnabled.toggle() } }
                        .buttonStyle(BronzeCompactButtonStyle(active: settings.vinylEnabled))
                }
            }.frame(maxWidth: .infinity).frame(height: kind == .compressor ? 250 : 300)
        }
    }

    private func edit(_ change: (inout BronzeProcessor) -> Void) {
        var effects = model.moduleSoundEffects[moduleIndex]
        var processor = effects[kind]
        change(&processor)
        effects[kind] = processor
        model.setSoundEffects(effects, moduleIndex: moduleIndex)
    }
}

struct BronzeNativeEqualizerEditor: View {
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    @State private var selectedBand = 0
    @State private var confirmReset = false

    private var equalizer: BronzeEqualizer { model.moduleEqualizers[moduleIndex] }
    private var band: BronzeEQBand { equalizer.bands[selectedBand] }
    private let typeNames = ["Low Cut", "Low Shelf", "Band", "High Shelf", "High Cut"]

    var body: some View {
        VStack(spacing: 5) {
            HStack {
                Button(equalizer.enabled ? "EQ ON" : "EQ OFF") {
                    var next = equalizer
                    next.enabled.toggle()
                    model.setEqualizer(next, moduleIndex: moduleIndex)
                }.buttonStyle(BronzeCompactButtonStyle(active: equalizer.enabled))
                ForEach(0..<5, id: \.self) { index in
                    Button("\(index + 1)") { selectedBand = index }
                        .buttonStyle(BronzeCompactButtonStyle(active: selectedBand == index))
                }
                Spacer()
                Button("Reset") { confirmReset = true }.font(.bronzeUI(18))
            }
            bandPad.frame(height: 270)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 230), spacing: 16)], spacing: 20) {
                ForEach(BronzeEQParameter.allCases) { parameter in
                    parameterControl(parameter)
                }
                VStack(spacing: 6) {
                    Menu {
                        ForEach(0..<5, id: \.self) { type in
                            Button(typeNames[type]) {
                                model.editEQBand(selectedBand, moduleIndex: moduleIndex) { $0.type = type }
                            }
                        }
                    } label: { Text(typeNames[band.type]).font(.bronzeUI(18)) }
                    if band.isCut {
                        Menu {
                            ForEach(1...8, id: \.self) { stages in
                                Button("\(stages * 12) dB/oitava") {
                                    model.editEQBand(selectedBand, moduleIndex: moduleIndex) { $0.cutStages = stages }
                                }
                            }
                        } label: { Text("\(band.cutStages * 12) dB/oit").font(.bronzeUI(16)) }
                    }
                }.frame(width: 94)
            }
        }
        .alert("Restaurar o EQ deste módulo?", isPresented: $confirmReset) {
            Button("Cancelar", role: .cancel) {}
            Button("Restaurar", role: .destructive) {
                model.setEqualizer(BronzeEqualizer(), moduleIndex: moduleIndex)
            }
        } message: { Text("Somente as cinco bandas e o ON/OFF do EQ serão restaurados.") }
    }

    private func parameterControl(_ parameter: BronzeEQParameter) -> some View {
        let inactive = band.isCut && parameter != .frequency
        return VStack(spacing: 2) {
            Text(parameter.rawValue).font(.bronzeUI(16))
            HStack(spacing: 3) {
                VStack(spacing: 3) {
                    BronzeRepeatButton(label: "+", accessibilityText: "Aumentar \(parameter.rawValue)") { step(parameter, direction: 1) }
                    BronzeRepeatButton(label: "−", accessibilityText: "Diminuir \(parameter.rawValue)") { step(parameter, direction: -1) }
                }
                BronzeSkiaControl(kind: .knob, value: Binding(
                    get: { band.normalized(parameter) },
                    set: { value in
                        model.editEQBand(selectedBand, moduleIndex: moduleIndex) { $0.setNormalized(parameter, value) }
                    }
                ), accessibilityLabel: "\(parameter.rawValue), banda \(selectedBand + 1)")
                    .modifier(BronzeParameterDialSize())
            }
            Text(inactive ? "—" : band.text(parameter)).font(.bronzeUI(16))
        }.disabled(inactive).opacity(inactive ? 0.4 : 1)
    }

    private func step(_ parameter: BronzeEQParameter, direction: Int) {
        model.editEQBand(selectedBand, moduleIndex: moduleIndex) { $0.step(parameter, direction: direction) }
    }

    // Native response graph with directly draggable band handles.
    private var bandPad: some View {
        GeometryReader { geometry in
            let width = max(1, geometry.size.width - 28)
            let height = max(1, geometry.size.height - 28)
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 6).fill(Color.black.opacity(0.4))
                Canvas { context, size in
                    var grid = Path()
                    for frequency in [20.0, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] {
                        let x = 14 + width * log(frequency / 20) / log(1000)
                        grid.move(to: CGPoint(x: x, y: 14)); grid.addLine(to: CGPoint(x: x, y: height + 14))
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
                    context.stroke(curve, with: .color(.cyan), lineWidth: 2)
                    curve.addLine(to: CGPoint(x: width + 14, y: height + 14)); curve.addLine(to: CGPoint(x: 14, y: height + 14)); curve.closeSubpath()
                    context.fill(curve, with: .color(.cyan.opacity(0.12)))
                }.allowsHitTesting(false)
                ForEach(0..<5, id: \.self) { index in
                    let point = equalizer.bands[index]
                    Text("\(index + 1)")
                        .font(.bronzeUI(16))
                        .frame(width: 28, height: 28)
                        .foregroundStyle(Color.black)
                        .background(index == selectedBand ? Color.white : Color.cyan)
                        .clipShape(Circle())
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
    let label: String
    let accessibilityText: String
    let action: () -> Void
    @GestureState private var pressing = false
    @State private var repetition: Task<Void, Never>?

    var body: some View {
        Text(label).font(.bronzeUI(configurationControls ? 18 : 12))
            .frame(width: configurationControls ? 44 : 27, height: configurationControls ? 44 : 25)
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
    @State private var confirmOverwrite = false

    init(model: BronzeNativeAppModel, index: Int) {
        self.model = model
        self.index = index
        _name = State(initialValue: model.presets[index].modules == nil ? "" : model.presets[index].name)
        _color = State(initialValue: model.presets[index].modules == nil ? BronzePresetPalette.order[index % 16] : model.presets[index].color)
    }

    var body: some View {
        BronzeNativeModal(title: "Preset \(index % 16 + 1) · Banco \(["A", "B", "C", "D", "E", "F"][index / 16])") {
            VStack(alignment: .leading, spacing: 20) {
                Text("Nome do preset").font(.bronzeUI(14)).foregroundStyle(Color.bronzeLight)
                TextField("Nome do preset", text: $name).textFieldStyle(BronzeNativeFieldStyle())
                Text("Cor").font(.bronzeUI(14)).foregroundStyle(Color.bronzeLight)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 10) {
                    ForEach(0..<16, id: \.self) { value in
                        Button { color = value } label: {
                            RoundedRectangle(cornerRadius: 6).fill(BronzePresetPalette.colors[value]).frame(height: 48)
                                .overlay(RoundedRectangle(cornerRadius: 6).stroke(color == value ? Color.white : .clear, lineWidth: 3))
                        }.buttonStyle(.plain).accessibilityLabel("Cor \(value + 1)")
                    }
                }
                if model.presets[index].modules != nil {
                    Button("Salvar nome e cor") { model.renamePreset(index, name: name, color: color); dismiss() }
                        .buttonStyle(BronzeDeckButtonStyle(palette: .blue)).frame(height: 46)
                }
                Button("Salvar configuração atual") {
                    if model.presets[index].modules != nil { confirmOverwrite = true }
                    else { save() }
                }.buttonStyle(BronzeDeckButtonStyle(palette: .green)).frame(height: 46)
                if !model.persistenceAvailable { Text("O salvamento está indisponível. Seus dados anteriores foram preservados.").foregroundStyle(.orange) }
            }.padding(12).disabled(!model.persistenceAvailable || model.isApplyingSnapshot || model.updatingEffects || model.loadingSoundFontModule != nil)
        }.alert("Substituir este preset?", isPresented: $confirmOverwrite) {
            Button("Cancelar", role: .cancel) {}
            Button("Substituir", role: .destructive) { save() }
        } message: { Text("A configuração salva nesta posição será substituída pela configuração atual.") }
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
    var active: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.bronzeUI(configurationControls ? 15 : 11))
            .foregroundStyle(active ? Color.black : Color.white)
            .frame(minWidth: configurationControls ? 44 : 28, minHeight: configurationControls ? 44 : 25)
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

    var body: some View {
        BronzeNativeModal(title: "Biblioteca · Módulo \(moduleIndex + 1)") {
            HStack(alignment: .top, spacing: 16) {
                VStack(spacing: 8) {
                    Button("User") { category = "User" }
                        .buttonStyle(BronzeDeckButtonStyle(palette: .purple, selected: category == "User")).frame(height: 46)
                    Divider().overlay(Color.bronze)
                    ForEach(Array(account.categories.filter { $0.visibleModule == nil || $0.visibleModule == moduleIndex + 1 }.enumerated()), id: \.element.id) { index, value in
                        Button { category = value.id } label: {
                            Text("\(index + 1) - \(value.name)").font(.bronzeUI(12)).lineLimit(2)
                                .foregroundStyle(.white).frame(maxWidth: .infinity, minHeight: 48)
                                .background(LinearGradient(colors: [Color(bronzeHex: value.color), Color(bronzeHex: value.color).opacity(0.3)], startPoint: .topLeading, endPoint: .bottomTrailing))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(category == value.id ? .white : .clear, lineWidth: category == value.id ? 2 : 1))
                        }.buttonStyle(.plain)
                    }
                    Button("Atualizar") { Task { await account.loadCatalog() } }
                        .buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(height: 40).disabled(account.catalogBusy)
                    if account.catalogBusy { ProgressView() }
                }.frame(width: 185)
                VStack(spacing: 12) {
                    HStack {
                        Text(category == "User" ? "User" : account.categories.first(where: { $0.id == category })?.name ?? "Biblioteca")
                            .font(.bronzeUI(18)).foregroundStyle(Color.bronzeLight)
                        Spacer()
                        Button("Clean") { model.clearSoundFont(moduleIndex) }
                            .buttonStyle(BronzeDeckButtonStyle(palette: .red)).frame(width: 80, height: 36)
                    }
                    if category != "User" {
                        BronzeNativeCatalogList(model: model, account: account, moduleIndex: moduleIndex, categoryID: category)
                    } else {
                        if model.userOnlySoundFonts.isEmpty {
                            Text("Importe seus timbres SF2 para tocar offline.").font(.bronzeUI(13)).foregroundStyle(.secondary).padding(24)
                        }
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
                            ForEach(Array(model.userOnlySoundFonts.enumerated()), id: \.element.id) { index, entry in
                                Button { model.selectUserSoundFont(entry, moduleIndex: moduleIndex) } label: {
                                    Text(entry.name).font(.bronzeUI(13)).lineLimit(2).frame(maxWidth: .infinity, minHeight: 70)
                                        .foregroundStyle(.black).background(BronzePresetPalette.colors[index % 16])
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                        .overlay { if model.moduleSoundFonts[moduleIndex] == entry { BronzePresetHighlight() } }
                                }.buttonStyle(.plain)
                            }
                        }
                        Button("Add SF2    +") { showingImporter = true }
                            .buttonStyle(BronzeDeckButtonStyle(palette: .green)).frame(height: 52)
                    }
                    if let loading = model.loadingSoundFontModule { ProgressView("Carregando timbre no módulo \(loading + 1)…") }
                }.frame(maxWidth: .infinity)
            }.disabled(model.loadingSoundFontModule != nil || model.isApplyingSnapshot || model.backupBusy || model.updatingEffects)
        }
        .onAppear { model.refreshUserSoundFonts() }
        .fileImporter(isPresented: $showingImporter,
                      allowedContentTypes: [.item], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                if let url = urls.first { model.importSoundFont(url, moduleIndex: moduleIndex) }
            case .failure(let error):
                model.controlError = "Não foi possível abrir o arquivo: \(error.localizedDescription)"
            }
        }
        .alert("Biblioteca SF2", isPresented: Binding(
            get: { model.controlError != nil },
            set: { if !$0 { model.controlError = nil } }
        )) {
            Button("OK") { model.controlError = nil }
        } message: {
            Text(model.controlError ?? "")
        }
    }
}
