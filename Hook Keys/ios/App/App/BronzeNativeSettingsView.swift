import SwiftUI
import AVFoundation
import AVKit

struct BronzeNativeSettingsView: View {
    @ObservedObject var model: BronzeNativeAppModel
    @State private var page = 0
    @Environment(\.dismiss) private var dismiss
    @State private var channels = max(1, AVAudioSession.sharedInstance().outputNumberOfChannels)
    @State private var bufferBusy = false
    @State private var audioError = ""
    @State private var effectiveBufferText = ""
    @State private var deviceSelections: [String] = []
    @State private var audioDevices: [[String: Any]] = []
    @State private var currentAudioDevice = ""
    @State private var currentAudioName = "Saída do sistema"
    @AppStorage("bronze.seamless") private var seamless = false
    @AppStorage("bronze.lite") private var lite = false
    @AppStorage("bronze.showKeyboard") private var keyboard = false
    @AppStorage("bronze.keyboardStyle") private var keyboardStyle = 0
    @AppStorage("bronze.keyboardMidiSlot") private var keyboardMidiSlot = 1
    @AppStorage("bronze.audioBuffer") private var buffer = 256
    @AppStorage("bronze.sampleRate") private var sampleRate = 48000
    private var session: AVAudioSession { .sharedInstance() }
    private let busNames = ["Playlist", "Pads", "Effects", "Metrônomo", "Módulos"]

    var body: some View {
        GeometryReader { g in
            let compact = g.size.height < 500
            let controlHeight: CGFloat = compact ? 30 : 48
            VStack(spacing: compact ? 8 : 18) {
                Text(page == 0 ? "Configurações" : page == 1 ? "Dispositivos MIDI" : "Dispositivo de áudio")
                    .font(.bronzeUI(compact ? 20 : 30)).foregroundStyle(Color.bronzeLight)
                Spacer(minLength: 0)
                if page == 0 {
                    VStack(spacing: 8) {
                        HStack(spacing: 8) {
                            navigationCard("Dispositivos MIDI", detail: "Teclados e controladores MIDI conectados") { page = 1 }
                            navigationCard("Dispositivo de áudio", detail: "Placa de áudio, buffer e canais de saída") { page = 2 }
                        }
                        HStack(spacing: 8) {
                            settingToggle("Modo compatibilidade", detail: "Para teclados que não são controladores MIDI.", value: Binding(get: { model.midiSettings.compatibility }, set: { model.setCompatibility($0) }))
                            settingToggle("Troca de preset sem corte", detail: "Maior consumo de RAM.", value: $seamless).disabled(lite)
                        }
                        HStack(spacing: 8) {
                            settingToggle("Modo Lite", detail: "As teclas param de acender e a troca sem corte fica desligada.", value: $lite)
                            VStack(spacing: 6) {
                                Text("Keyboard").font(.bronzeUI(13))
                                HStack(spacing: 6) {
                                    ForEach(1...3, id: \.self) { slot in
                                        Button("MIDI \(slot)") { model.selectKeyboardMidiSlot(slot); keyboardMidiSlot = slot }
                                            .buttonStyle(BronzeDeckButtonStyle(palette: keyboardMidiSlot == slot ? .green : .grey, selected: keyboardMidiSlot == slot))
                                    }
                                }.frame(height: controlHeight)
                                Text("Estilo").font(.bronzeUI(13))
                                HStack(spacing: 6) {
                                    ForEach(0..<3, id: \.self) { style in
                                        Button(["Default", "Black", "Bronze"][style]) { keyboardStyle = style }
                                            .buttonStyle(BronzeDeckButtonStyle(palette: keyboardStyle == style ? .green : .grey, selected: keyboardStyle == style))
                                    }
                                }.frame(height: controlHeight)
                            }.padding(8).frame(maxWidth: .infinity).modifier(BronzeDeckSurface())
                        }
                    }.frame(maxWidth: 1000)
                } else if page == 1 {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: compact ? 12 : 24) {
                        ForEach(0..<3, id: \.self) { index in
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Dispositivo MIDI \(index + 1)").font(.bronzeUI(compact ? 12 : 17)).foregroundStyle(Color.bronzeLight)
                                let devices = model.midiDevices
                                BronzeStableMenu(title: deviceName(index), choices: ["Nenhum"] + devices.map(\.name),
                                    selected: devices.firstIndex(where: { deviceSelections.indices.contains(index) && $0.id == deviceSelections[index] }).map { $0 + 1 } ?? 0) { selected in
                                        selectDevice(index, id: selected == 0 ? "" : devices[selected - 1].id)
                                    }.frame(height: controlHeight)
                            }
                        }
                    }.frame(maxWidth: 760)
                } else {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: compact ? 6 : 16) {
                        audioField("Dispositivo de áudio", compact: compact) {
                            #if targetEnvironment(macCatalyst)
                            BronzeStableMenu(title: currentAudioName,
                                choices: audioDevices.compactMap { $0["name"] as? String },
                                selected: audioDevices.firstIndex { ($0["id"] as? String) == currentAudioDevice } ?? -1) { index in
                                    guard audioDevices.indices.contains(index), let id = audioDevices[index]["id"] as? String else { return }
                                    selectAudioDevice(id)
                                }.frame(height: controlHeight)
                            Text("Altera a saída de áudio do macOS.").font(.bronzeUI(compact ? 8 : 10)).foregroundStyle(.secondary)
                            #else
                            BronzeAudioRoutePicker()
                                .frame(height: controlHeight)
                                .background(Color(bronzeHex: 0x21191a)).cornerRadius(6)
                                .overlay {
                                    HStack {
                                        Text(currentAudioName).font(.bronzeUI(compact ? 11 : 14)).lineLimit(1)
                                        Spacer(minLength: 4)
                                        Image(systemName: "airplayaudio")
                                    }.foregroundStyle(.white).padding(.horizontal, 8).allowsHitTesting(false)
                                }
                            #endif
                        }
                        audioField("Buffer Size", compact: compact) {
                            BronzeStableMenu(title: "\(buffer)", choices: ["64", "128", "256", "512"], selected: [64, 128, 256, 512].firstIndex(of: buffer) ?? -1) {
                                changeAudio(frames: [64, 128, 256, 512][$0], rate: sampleRate)
                            }.frame(height: controlHeight)
                            Text(effectiveBufferText).font(.bronzeUI(compact ? 8 : 10)).foregroundStyle(.secondary)
                                .lineLimit(1).minimumScaleFactor(0.7).accessibilityIdentifier("bronze.audio.effectiveBuffer")
                        }
                        ForEach([4, 0, 1, 2, 3], id: \.self) { bus in
                            audioField("Saídas - \(busNames[bus])", compact: compact) {
                                let routes = BronzeAudioRouteOption.available(channels: channels)
                                BronzeStableMenu(title: bus == 0 ? "1+2" : routes.first(where: { $0.start == model.mixer.channelStart(bus) && $0.count == model.mixer.channelCount(bus) })?.title ?? "Indisponível",
                                    choices: routes.map(\.title), selected: routes.firstIndex(where: { $0.start == model.mixer.channelStart(bus) && $0.count == model.mixer.channelCount(bus) }) ?? -1) { selected in
                                        model.setMixerRoute(bus, start: routes[selected].start, count: routes[selected].count)
                                    }.frame(height: controlHeight).disabled(bus == 0)
                            }
                        }
                        audioField("Sample Rate", compact: compact) {
                            BronzeStableMenu(title: sampleRate == 44100 ? "44.100 Hz" : "48.000 Hz", choices: ["44.100 Hz", "48.000 Hz"], selected: sampleRate == 44100 ? 0 : 1) {
                                changeAudio(frames: buffer, rate: $0 == 0 ? 44100 : 48000)
                            }.frame(height: controlHeight)
                        }
                    }.frame(maxWidth: 760).disabled(bufferBusy)
                    if bufferBusy { ProgressView("Ajustando áudio…") }
                    if !audioError.isEmpty { Text(audioError).foregroundStyle(.orange).font(.bronzeUI(11)) }
                }
                Spacer(minLength: 0)
                Button("Voltar") { if page == 0 { dismiss() } else { page = 0 } }
                    .accessibilityIdentifier("bronze.settings.back").buttonStyle(BronzeConfigActionStyle(kind: .back)).frame(height: compact ? 36 : 50)
            }.padding(12).frame(width: g.size.width, height: g.size.height)
        }.background(BronzeScreenBackground()).preferredColorScheme(.dark).environment(\.bronzeConfigurationBorders, true)
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification).receive(on: RunLoop.main)) { _ in
            refreshAudioStatus()
            if !bufferBusy { resumeAudioRoute() }
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { _ in
            if page == 2 && !bufferBusy { refreshAudioStatus() }
        }
        .onAppear { refreshAudioStatus(); model.refreshMidiDevices(); deviceSelections = UserDefaults.standard.stringArray(forKey: "bronze.midiDevices") ?? Array(model.midiDevices.prefix(3).map(\.id)) }
        .onChange(of: seamless) { model.engine.setSeamlessPresetSwitching($0 && !lite); model.preparePresetSounds() }
        .onChange(of: lite) { value in model.engine.setSeamlessPresetSwitching(seamless && !value); model.preparePresetSounds() }
    }
    private func audioField<Content: View>(_ title: String, compact: Bool, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.bronzeUI(compact ? 10 : 15)).foregroundStyle(Color.bronzeLight)
            content()
        }
    }

    private func settingToggle(_ name: String, detail: String, value: Binding<Bool>) -> some View {
        Button { value.wrappedValue.toggle() } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(name).font(.bronzeUI(14))
                    Text(detail).font(.bronzeUI(10)).foregroundStyle(.secondary).lineLimit(2)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Capsule().fill(value.wrappedValue ? Color.bronze : Color.gray.opacity(0.4))
                    .frame(width: 46, height: 28)
                    .overlay(Circle().fill(.white).frame(width: 22, height: 22)
                        .offset(x: value.wrappedValue ? 9 : -9))
                    .allowsHitTesting(false)
            }.padding(8).frame(maxWidth: .infinity).contentShape(Rectangle()).modifier(BronzeDeckSurface())
        }.buttonStyle(.plain)
            .accessibilityLabel(name).accessibilityValue(value.wrappedValue ? "Ativado" : "Desativado")
    }

    private func navigationCard(_ title: String, detail: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) { Text(title).font(.bronzeUI(16)); Text(detail).font(.bronzeUI(10)).foregroundStyle(.secondary).lineLimit(2) }
                .frame(maxWidth: .infinity, alignment: .leading).padding(10).modifier(BronzeDeckSurface())
        }.buttonStyle(.plain)
    }
    private func infoCard(_ title: String, value: String) -> some View {
        VStack(spacing: 12) { Text(title).font(.bronzeUI(13)).foregroundStyle(Color.bronzeLight); Text(value).font(.bronzeUI(14)).lineLimit(2) }
            .frame(maxWidth: .infinity, minHeight: 70).padding(6).modifier(BronzeDeckSurface())
    }
    private func deviceName(_ index: Int) -> String {
        guard deviceSelections.indices.contains(index), !deviceSelections[index].isEmpty else { return "Nenhum" }
        return model.midiDevices.first { $0.id == deviceSelections[index] }?.name ?? "Dispositivo indisponível"
    }
    private func selectDevice(_ index: Int, id: String) {
        while deviceSelections.count < 3 { deviceSelections.append("") }
        deviceSelections[index] = id
        UserDefaults.standard.set(deviceSelections, forKey: "bronze.midiDevices")
        model.refreshMidiDevices()
    }
    private func changeAudio(frames: Int, rate: Int) {
        guard !bufferBusy else { return }
        bufferBusy = true; audioError = ""
        let engine = model.engine
        let channels = channels
        DispatchQueue.global(qos: .userInitiated).async {
            let success = engine.setAudioOutputDeviceId("", channels: channels, bufferFrames: frames, sampleRate: Double(rate), preserveEngine: true)
            DispatchQueue.main.async {
                bufferBusy = false
                if success { buffer = frames; sampleRate = rate } else { audioError = engine.lastAudioErrorMessage }
                refreshAudioStatus()
            }
        }
    }
    private func selectAudioDevice(_ id: String) {
        guard !bufferBusy else { return }
        guard model.engine.selectSystemAudioOutputDeviceId(id) else {
            audioError = model.engine.lastAudioErrorMessage
            refreshAudioStatus()
            return
        }
        resumeAudioRoute()
    }
    private func resumeAudioRoute() {
        guard !bufferBusy else { return }
        bufferBusy = true; audioError = ""
        let engine = model.engine
        let frames = buffer, rate = sampleRate
        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 0.35) {
            let success = engine.refreshAudioRoute(withBufferFrames: frames, sampleRate: Double(rate))
            DispatchQueue.main.async {
                bufferBusy = false
                if !success { audioError = engine.lastAudioErrorMessage }
                refreshAudioStatus()
            }
        }
    }
    private func refreshAudioStatus() {
        audioDevices = model.engine.listAudioOutputDevices()
        currentAudioDevice = model.engine.selectedAudioOutputDeviceId()
        let selected = audioDevices.first { ($0["id"] as? String) == currentAudioDevice }
        currentAudioName = selected?["name"] as? String ?? session.currentRoute.outputs.map(\.portName).joined(separator: " · ")
        channels = max(1, (selected?["channels"] as? NSNumber)?.intValue ?? session.outputNumberOfChannels)
        let frames = model.engine.effectiveBufferFrames
        let rate = model.engine.effectiveSampleRate
        let duration = rate > 0 ? Double(frames) / rate : 0
        effectiveBufferText = frames > 0
            ? String(format: "Em uso: %d amostras · %.2f ms", frames, duration * 1000)
            : "Buffer efetivo indisponível"
    }
}

// iOS owns USB/Bluetooth/AirPlay routing. Its native route picker exposes the
// routes actually available to this device rather than fabricated device IDs.
struct BronzeAudioRoutePicker: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let picker = BronzeFullWidthRoutePicker()
        picker.tintColor = .clear; picker.activeTintColor = .clear
        return picker
    }
    func updateUIView(_ view: AVRoutePickerView, context: Context) {}
}

private final class BronzeFullWidthRoutePicker: AVRoutePickerView {
    override func layoutSubviews() {
        super.layoutSubviews()
        for button in subviews.compactMap({ $0 as? UIButton }) {
            button.frame = bounds
            button.accessibilityLabel = "Selecionar dispositivo de áudio"
        }
    }
}
