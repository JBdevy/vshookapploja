import SwiftUI
import UniformTypeIdentifiers

struct BronzeNativeRootView: View {
    @StateObject private var model = BronzeNativeAppModel()
    private struct LibraryTarget: Identifiable { let id: Int }
    @State private var libraryTarget: LibraryTarget?
    @State private var presetTarget: LibraryTarget?
    private enum ModulePage: Equatable { case envelope, equalizer, reverb, delay }
    @State private var modulePage: ModulePage = .envelope

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
        .sheet(item: $libraryTarget) { target in
            BronzeNativeSoundFontLibrary(model: model, moduleIndex: target.id)
        }
        .sheet(item: $presetTarget) { target in
            BronzeNativePresetEditor(model: model, index: target.id)
        }
        .alert("Controle do módulo", isPresented: Binding(
            get: { model.controlError != nil },
            set: { if !$0 { model.controlError = nil } }
        )) {
            Button("OK") { model.controlError = nil }
        } message: {
            Text(model.controlError ?? "")
        }
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
                if let loop = model.selectedLoop {
                    HStack(spacing: 8) {
                        Button(model.loopPlaying ? "Parar" : "Play") { model.toggleLoopPlayback() }
                            .buttonStyle(BronzeCompactButtonStyle(active: model.loopPlaying))
                            .disabled(model.loadingLoop)
                        Text(loop.name).font(.caption.bold())
                        ProgressView(value: min(1, model.loopPosition / max(0.001, model.loopDuration)))
                            .tint(.bronzeLight)
                        Text(String(format: "%.1f s", model.loopPosition))
                            .font(.caption2.monospacedDigit())
                    }
                }
                modules
                    .frame(height: max(170, geometry.size.height * 0.36))
                    .disabled(model.isApplyingSnapshot)
                pageSelector
                pageContent
                    .disabled(model.isApplyingSnapshot)
                if model.isApplyingSnapshot {
                    ProgressView("Carregando configuração…").font(.caption)
                }
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
                    .disabled(model.isApplyingSnapshot)
                Text(String(format: "%.1f BPM", model.tempo))
                    .font(.caption.monospacedDigit().bold())
                    .frame(width: 86)
                Button("+") { model.setTempo(model.tempo + 0.5) }
                    .disabled(model.isApplyingSnapshot)
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
                    .foregroundStyle(model.midiDevices.isEmpty ? Color.secondary : Color.green)
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
                        Button(index == 6 ? "B3 · EDIT" : "\(index + 1) · EDIT") {
                            model.selectModule(index)
                        }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Editar módulo \(index + 1)")
                            .font(.caption2.monospaced().bold())
                            .foregroundStyle(model.selectedModule == index ? .black : .bronzeLight)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(model.selectedModule == index ? Color.bronzeLight : .clear)
                            .clipShape(Capsule())
                        if index < 6 {
                            Button(model.moduleSoundFonts[index]?.name ?? "Empty") {
                                libraryTarget = LibraryTarget(id: index)
                            }
                            .font(.caption2)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, minHeight: 28)
                            .accessibilityLabel("Escolher timbre do módulo \(index + 1)")
                        }
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
                        Button(model.moduleReceivesNotes(index) ? "ON" : "OFF") {
                            model.toggleModuleEnabled(index)
                        }
                        .font(.caption2.monospaced().bold())
                        .buttonStyle(BronzeButtonStyle(active: model.moduleReceivesNotes(index)))
                        .accessibilityLabel("Ligar ou desligar módulo \(index + 1)")
                        Button("SOLO") { model.toggleModuleSolo(index) }
                            .buttonStyle(BronzeCompactButtonStyle(active: model.soloModule == index))
                            .accessibilityLabel("Solo do módulo \(index + 1)")
                    }
                }
                .saturation(model.soloModule != nil && model.soloModule != index ? 0 : 1)
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
        case .loops:
            loopLibrary
        }
    }

    private var moduleEditor: some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                Button("Envelope") { modulePage = .envelope }
                    .buttonStyle(BronzeCompactButtonStyle(active: modulePage == .envelope))
                Button("EQ") { modulePage = .equalizer }
                    .buttonStyle(BronzeCompactButtonStyle(active: modulePage == .equalizer))
                Button("Reverb") { modulePage = .reverb }
                    .buttonStyle(BronzeCompactButtonStyle(active: modulePage == .reverb))
                Button("Delay") { modulePage = .delay }
                    .buttonStyle(BronzeCompactButtonStyle(active: modulePage == .delay))
                Spacer()
                Text("Módulo \(model.selectedModule + 1)").font(.caption.bold())
            }
            switch modulePage {
            case .equalizer:
                BronzeNativeEqualizerEditor(model: model, moduleIndex: model.selectedModule)
                    .id(model.selectedModule)
            case .reverb:
                BronzeNativeReverbEditor(model: model, moduleIndex: model.selectedModule)
                    .id(model.selectedModule)
            case .delay:
                BronzeNativeDelayEditor(model: model, moduleIndex: model.selectedModule)
                    .id(model.selectedModule)
            case .envelope: envelopeEditor
            }
        }
    }

    private var envelopeEditor: some View {
        HStack(spacing: 8) {
            ForEach(BronzeNativeAppModel.EnvelopeParameter.allCases.filter {
                model.selectedModule != 7 || $0 != .sustain
            }) { parameter in
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
            VStack(spacing: 5) {
                HStack {
                    ForEach(0..<2, id: \.self) { bank in
                        Button("Pad \(bank + 1)") { model.selectPadBank(bank) }
                            .buttonStyle(BronzeCompactButtonStyle(active: model.selectedPadBank == bank))
                    }
                }
                HStack(spacing: 6) {
                    padFilter(low: true)
                    padFilter(low: false)
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 6), spacing: 5) {
                ForEach(0..<12, id: \.self) { index in
                    Button { model.togglePad(index) } label: {
                        VStack(spacing: 2) {
                            Text(noteName(index, relative: false)).font(.headline)
                            Text(noteName(index, relative: true)).font(.caption2)
                        }.padding(.vertical, 4)
                    }
                    .buttonStyle(BronzeButtonStyle(active: model.isPadActive(index)))
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
            .disabled(!model.bundledEffectsReady)
        }
        .onDisappear { model.endEffectTouches() }
    }

    private func padFilter(low: Bool) -> some View {
        VStack(spacing: 2) {
            Text(low ? "Low" : "High").font(.caption.bold())
            BronzeSkiaControl(kind: .knob, value: Binding(
                get: { low ? model.padFilterLow : model.padFilterHigh },
                set: { model.setPadFilter(low: low, normalized: $0) }
            ), accessibilityLabel: low ? "Filtro passa-altas dos pads" : "Filtro passa-baixas dos pads")
                .frame(width: 48, height: 48)
            Text(model.padFilterText(low ? model.padFilterLow : model.padFilterHigh))
                .font(.caption2.monospacedDigit())
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
                .font(.caption2).foregroundStyle(.secondary)
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
                Text(number).font(.caption2)
                Text(preset.name).font(.caption.bold()).lineLimit(1)
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

    private var loopLibrary: some View {
        VStack(spacing: 8) {
            Text("Playlist de loops · Bronze Keys").font(.caption.bold())
            if model.loadingLoop { ProgressView("Carregando loop…") }
            HStack(spacing: 8) {
                ForEach(model.bundledLoops) { loop in
                    Button { model.selectLoop(loop) } label: {
                        VStack(spacing: 8) {
                            Text(loop.name).font(.headline)
                            Text(model.selectedLoop?.id == loop.id ? "Selecionado" : "120 BPM original")
                                .font(.caption)
                        }
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity, minHeight: 70)
                        .background(loop.id == 1 ? Color.green : loop.id == 2 ? Color.cyan : Color.orange)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6)
                            .stroke(model.selectedLoop?.id == loop.id ? Color.white : Color.clear, lineWidth: 3))
                    }
                    .buttonStyle(.plain)
                    .disabled(model.loadingLoop)
                }
            }
            Text("Loops contínuos sincronizados ao BPM. Play inicia do começo.")
                .font(.caption2).foregroundStyle(.secondary)
        }
    }

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
                Button("Reset") { confirmReset = true }.font(.caption)
            }
            HStack(spacing: 6) {
                ForEach(BronzeDelay.divisions.indices, id: \.self) { index in
                    Button(BronzeDelay.divisions[index]) { change { $0.division = index } }
                        .buttonStyle(BronzeCompactButtonStyle(active: delay.division == index))
                }
            }
            HStack(spacing: 18) {
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
                .font(.caption2).foregroundStyle(.secondary)
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
            Text(parameter.rawValue).font(.caption2.bold())
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
                ), accessibilityLabel: "\(parameter.rawValue) do Delay").frame(width: 58, height: 58)
            }.disabled(inactive).opacity(inactive ? 0.4 : 1)
            Text(delay.text(parameter, bpm: model.tempo)).font(.caption2.monospacedDigit())
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
                Button("Reset") { confirmReset = true }.font(.caption)
                Text("Convolution").font(.caption2.bold())
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Color.bronze.opacity(0.3)).clipShape(Capsule())
            }
            HStack(spacing: 14) {
                ForEach(0..<4, id: \.self) { index in
                    impulseButton(index)
                }
            }
            HStack(spacing: 20) {
                parameterControl(decay: false)
                parameterControl(decay: true)
                Text("Decay: 100% mantém o IR original; valores menores encurtam sua cauda, sem mudar a afinação.")
                    .font(.caption2).foregroundStyle(.secondary).frame(maxWidth: 230)
            }
            Text("Cada Room e Hall mantém seu próprio Mix e Decay.").font(.caption2).foregroundStyle(.secondary)
        }
        .alert("Restaurar o reverb deste módulo?", isPresented: $confirmReset) {
            Button("Cancelar", role: .cancel) {}
            Button("Restaurar", role: .destructive) { model.setReverb(BronzeReverb(), moduleIndex: moduleIndex) }
        } message: { Text("Desliga o reverb e restaura Mix e Decay dos quatro IRs. Os outros efeitos não mudam.") }
    }

    private func parameterControl(decay: Bool) -> some View {
        let label = decay ? "Decay" : "Mix"
        return VStack(spacing: 2) {
            Text(label).font(.caption2.bold())
            HStack(spacing: 4) {
                VStack(spacing: 3) {
                    BronzeRepeatButton(label: "+", accessibilityText: "Aumentar \(label) do reverb") { step(decay: decay, direction: 1) }
                    BronzeRepeatButton(label: "−", accessibilityText: "Diminuir \(label) do reverb") { step(decay: decay, direction: -1) }
                }
                BronzeSkiaControl(kind: .knob, value: Binding(
                    get: { decay ? (reverb.decay - 0.1) / 0.9 : reverb.mix },
                    set: { value in change { if decay { $0.setDecay(0.1 + value * 0.9) } else { $0.setMix(value) } } }
                ), accessibilityLabel: "\(label) do reverb \(BronzeReverb.names[reverb.impulse])").frame(width: 58, height: 58)
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
                Text(BronzeReverb.names[index]).font(.caption.bold())
                Text(String(format: "%.0f%%", reverb.mixes[index] * 100)).font(.caption2.monospacedDigit())
                Text(String(format: "Decay %.0f%%", reverb.decays[index] * 100)).font(.caption2.monospacedDigit())
            }.padding(.vertical, 8)
        }.buttonStyle(BronzeButtonStyle(active: reverb.impulse == index))
    }

    private func change(_ edit: (inout BronzeReverb) -> Void) {
        var next = reverb
        edit(&next)
        model.setReverb(next, moduleIndex: moduleIndex)
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
                Button("Reset") { confirmReset = true }.font(.caption)
            }
            HStack(spacing: 12) {
                bandPad.frame(minWidth: 120, minHeight: 110)
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
                    } label: { Text(typeNames[band.type]).font(.caption.bold()) }
                    if band.isCut {
                        Menu {
                            ForEach(1...8, id: \.self) { stages in
                                Button("\(stages * 12) dB/oitava") {
                                    model.editEQBand(selectedBand, moduleIndex: moduleIndex) { $0.cutStages = stages }
                                }
                            }
                        } label: { Text("\(band.cutStages * 12) dB/oit").font(.caption2) }
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
            Text(parameter.rawValue).font(.caption2.bold())
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
                    .frame(width: 52, height: 52)
            }
            Text(inactive ? "—" : band.text(parameter)).font(.caption2.monospacedDigit())
        }.disabled(inactive).opacity(inactive ? 0.4 : 1)
    }

    private func step(_ parameter: BronzeEQParameter, direction: Int) {
        model.editEQBand(selectedBand, moduleIndex: moduleIndex) { $0.step(parameter, direction: direction) }
    }

    // Frequency/gain position pad, not a simulated frequency-response curve.
    private var bandPad: some View {
        GeometryReader { geometry in
            let width = max(1, geometry.size.width - 28)
            let height = max(1, geometry.size.height - 28)
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 6).fill(Color.black.opacity(0.4))
                Path { path in
                    path.move(to: CGPoint(x: 14, y: 14 + height / 2))
                    path.addLine(to: CGPoint(x: 14 + width, y: 14 + height / 2))
                }.stroke(Color.gray.opacity(0.5), lineWidth: 1)
                ForEach(0..<5, id: \.self) { index in
                    let point = equalizer.bands[index]
                    Text("\(index + 1)")
                        .font(.caption2.bold())
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
    let label: String
    let accessibilityText: String
    let action: () -> Void
    @GestureState private var pressing = false
    @State private var repetition: Task<Void, Never>?

    var body: some View {
        Text(label).font(.caption.bold())
            .frame(width: 27, height: 25)
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
    static let colors: [Color] = [.init(red: 0.25, green: 0.95, blue: 0.42), .cyan,
        .init(red: 1, green: 0.58, blue: 0.20), .yellow,
        .init(red: 0.90, green: 0.50, blue: 1), .init(red: 1, green: 0.45, blue: 0.65),
        .init(red: 0.35, green: 0.72, blue: 1), .init(red: 0.2, green: 0.95, blue: 0.78)]
}

struct BronzePresetHighlight: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 20, paused: reduceMotion)) { context in
            let phase = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3) / 3
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
        _color = State(initialValue: model.presets[index].color)
    }

    var body: some View {
        NavigationView {
            Form {
                TextField("Nome do preset", text: $name)
                HStack {
                    ForEach(0..<8, id: \.self) { value in
                        Button { color = value } label: {
                            Circle().fill(BronzePresetPalette.colors[value]).frame(width: 30, height: 30)
                                .overlay(Circle().stroke(color == value ? Color.white : .clear, lineWidth: 3))
                        }.buttonStyle(.plain).accessibilityLabel("Cor \(value + 1)")
                    }
                }
                if model.presets[index].modules != nil {
                    Button("Alterar apenas nome e cor") {
                        model.renamePreset(index, name: name, color: color)
                        dismiss()
                    }
                }
                Button("Salvar configuração atual nesta posição") {
                    if model.presets[index].modules != nil { confirmOverwrite = true }
                    else { save() }
                }
                Text("Salva os timbres, ON/OFF, volumes, envelopes, EQ, reverb e Delay disponíveis na tela nativa. Drawbars e rotary do Bronze B3 continuam globais.")
                    .font(.caption).foregroundStyle(.secondary)
                if !model.persistenceAvailable {
                    Text("Salvamento suspenso por uma falha na sessão. Seus dados anteriores foram preservados.")
                        .foregroundStyle(.orange)
                }
            }
            .disabled(!model.persistenceAvailable || model.isApplyingSnapshot || model.updatingEffects || model.loadingSoundFontModule != nil)
            .navigationTitle("\(["A", "B", "C", "D", "E", "F"][index / 16]) · Preset \(index % 16 + 1)")
            .toolbar { Button("Fechar") { dismiss() } }
            .alert("Substituir este preset?", isPresented: $confirmOverwrite) {
                Button("Cancelar", role: .cancel) {}
                Button("Substituir", role: .destructive) { save() }
            } message: { Text("A configuração salva nesta posição será substituída pela configuração atual.") }
        }.navigationViewStyle(.stack)
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

struct BronzeNativeSoundFontLibrary: View {
    @ObservedObject var model: BronzeNativeAppModel
    let moduleIndex: Int
    @Environment(\.dismiss) private var dismiss
    @State private var showingImporter = false

    var body: some View {
        NavigationView {
            VStack(spacing: 12) {
                Button("Importar SF2") { showingImporter = true }
                    .buttonStyle(BronzeButtonStyle(active: true))
                    .disabled(model.loadingSoundFontModule != nil)
                    .padding(.horizontal)
                if let loading = model.loadingSoundFontModule {
                    ProgressView("Carregando timbre no módulo \(loading + 1)…")
                }
                if model.userSoundFonts.isEmpty {
                    Text("Importe um arquivo SF2. O nome do arquivo será usado automaticamente.")
                        .foregroundStyle(.secondary)
                        .padding()
                }
                List(model.userSoundFonts) { entry in
                    Button {
                        model.selectUserSoundFont(entry, moduleIndex: moduleIndex)
                    } label: {
                        HStack {
                            Text(entry.name)
                            Spacer()
                            if model.moduleSoundFonts[moduleIndex] == entry {
                                Image(systemName: "checkmark").foregroundStyle(.green)
                            }
                        }
                    }
                    .disabled(model.loadingSoundFontModule != nil)
                }
            }
            .navigationTitle("User · Módulo \(moduleIndex + 1)")
            .toolbar { Button("Concluir") { dismiss() } }
        }
        .navigationViewStyle(.stack)
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
