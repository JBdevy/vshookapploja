import SwiftUI
import AVFoundation
import AVKit

struct BronzeNativeSettingsView: View {
    @ObservedObject var model: BronzeNativeAppModel
    @State private var page = 0
    @State private var channels = max(1, AVAudioSession.sharedInstance().outputNumberOfChannels)
    @State private var bufferBusy = false
    @State private var audioError = ""
    @State private var deviceSelections: [String] = []
    @AppStorage("bronze.seamless") private var seamless = false
    @AppStorage("bronze.lite") private var lite = false
    @AppStorage("bronze.showKeyboard") private var keyboard = false
    @AppStorage("bronze.keyboardStyle") private var keyboardStyle = 0
    @AppStorage("bronze.audioBuffer") private var buffer = 256
    @AppStorage("bronze.sampleRate") private var sampleRate = 48000
    private var session: AVAudioSession { .sharedInstance() }
    private let busNames = ["Playlist", "Pads", "Efects", "Metrônomo", "Módulos"]

    var body: some View {
        BronzeNativeModal(title: page == 0 ? "Configurações" : page == 1 ? "Dispositivos MIDI" : "Dispositivo de áudio", scrollable: false) {
            GeometryReader { bounds in
            let compact = bounds.size.height < 480
            BronzeFittedEditor {
            VStack(spacing: 8) {
                if page != 0 { Button("Configurações") { page = 0 }.accessibilityIdentifier("bronze.settings.back").buttonStyle(BronzeCompactButtonStyle(active: false)).frame(maxWidth: .infinity, alignment: .leading) }
                if page == 0 {
                    HStack(spacing: 12) {
                        navigationCard("Dispositivos MIDI", detail: "Teclados e controladores conectados") { page = 1 }
                        navigationCard("Dispositivo de áudio", detail: "Buffer e canais de saída") { page = 2 }
                    }
                    settingToggle("Modo compatibilidade", detail: "Para teclados que não são controladores MIDI.", value: Binding(get: { model.midiSettings.compatibility }, set: { model.setCompatibility($0) }))
                    settingToggle("Troca de preset sem corte", detail: "Maior consumo de RAM.", value: $seamless).disabled(lite)
                    settingToggle("Modo Lite", detail: "Reduz os efeitos visuais e desliga a troca sem corte.", value: $lite)
                    HStack(spacing: 16) {
                        VStack(spacing: 12) {
                            Text("Mostrar").font(.bronzeUI(14))
                            HStack {
                                Button("Presets") { keyboard = false }.buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: !keyboard))
                                Button("Keyboard") { keyboard = true }.buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: keyboard))
                            }.frame(height: 42)
                        }.padding(8).modifier(BronzeDeckSurface())
                        VStack(spacing: 12) {
                            Text("Estilo do teclado").font(.bronzeUI(14))
                            HStack { ForEach(0..<3, id: \.self) { style in
                                Button(["Default", "Black", "Bronze"][style]) { keyboardStyle = style }
                                    .buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: keyboardStyle == style))
                            }}.frame(height: 42)
                        }.padding(8).modifier(BronzeDeckSurface())
                    }
                } else if page == 1 {
                    VStack(spacing: compact ? 6 : 18) {
                        ForEach(0..<3, id: \.self) { index in
                            VStack(alignment: .leading, spacing: compact ? 4 : 10) {
                                Text("Dispositivo MIDI \(index + 1)").font(.bronzeUI(compact ? 13 : 18)).foregroundStyle(Color.bronzeLight)
                                let devices = model.midiDevices
                                BronzeStableMenu(title: deviceName(index), choices: ["Nenhum"] + devices.map(\.name),
                                                 selected: devices.firstIndex(where: { deviceSelections.indices.contains(index) && $0.id == deviceSelections[index] }).map { $0 + 1 } ?? 0) { selected in
                                    selectDevice(index, id: selected == 0 ? "" : devices[selected - 1].id)
                                }.frame(height: compact ? 34 : 58)
                            }.padding(compact ? 8 : 16).modifier(BronzeDeckSurface())
                        }
                    }
                } else {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: compact ? 4 : 2), spacing: compact ? 8 : 16) {
                        VStack(spacing: 5) {
                            Text("Dispositivo de áudio").font(.bronzeUI(13)).foregroundStyle(Color.bronzeLight)
                            HStack {
                                Text(session.currentRoute.outputs.map(\.portName).joined(separator: " · ")).lineLimit(1)
                                Spacer()
                                BronzeAudioRoutePicker().frame(width: 32, height: 32)
                            }
                        }.padding(8).modifier(BronzeDeckSurface())
                        VStack(spacing: 5) {
                            Text("Buffer Size").font(.bronzeUI(13)).foregroundStyle(Color.bronzeLight)
                            Menu("\(buffer)") {
                                ForEach([64, 128, 256, 512], id: \.self) { frames in
                                    Button("\(frames)") { changeAudio(frames: frames, rate: sampleRate) }
                                }
                            }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(height: 32)
                        }.padding(6).modifier(BronzeDeckSurface())
                        ForEach([4, 0, 1, 2, 3], id: \.self) { bus in
                            VStack(spacing: 5) {
                                Text("Saídas · \(busNames[bus])").font(.bronzeUI(13)).foregroundStyle(Color.bronzeLight)
                                let routes = BronzeAudioRouteOption.available(channels: channels)
                                BronzeStableMenu(title: bus == 0 ? "1 + 2" : routes.first(where: { $0.start == model.mixer.channelStart(bus) && $0.count == model.mixer.channelCount(bus) })?.title ?? "Indisponível",
                                                 choices: routes.map(\.title), selected: routes.firstIndex(where: { $0.start == model.mixer.channelStart(bus) && $0.count == model.mixer.channelCount(bus) }) ?? -1) { selected in
                                    model.setMixerRoute(bus, start: routes[selected].start, count: routes[selected].count)
                                }.frame(height: compact ? 36 : 52).disabled(bus == 0)

                            }.padding(6).modifier(BronzeDeckSurface())
                        }
                        VStack(spacing: 5) {
                            Text("Sample Rate").font(.bronzeUI(13)).foregroundStyle(Color.bronzeLight)
                            Menu("\(sampleRate == 44100 ? "44.100" : "48.000") Hz") {
                                ForEach([44100, 48000], id: \.self) { rate in
                                    Button("\(rate == 44100 ? "44.100" : "48.000") Hz") { changeAudio(frames: buffer, rate: rate) }
                                }
                            }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(height: 32)
                        }.padding(8).modifier(BronzeDeckSurface())
                    }.disabled(bufferBusy)
                    if bufferBusy { ProgressView("Ajustando áudio…") }
                    if !audioError.isEmpty { Text(audioError).foregroundStyle(.orange) }
                }
            }
            }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification).receive(on: RunLoop.main)) { _ in channels = max(1, session.outputNumberOfChannels) }
        .onAppear { model.refreshMidiDevices(); deviceSelections = UserDefaults.standard.stringArray(forKey: "bronze.midiDevices") ?? Array(model.midiDevices.prefix(3).map(\.id)) }
        .onChange(of: seamless) { model.engine.setSeamlessPresetSwitching($0 && !lite) }
        .onChange(of: lite) { value in model.engine.setSeamlessPresetSwitching(seamless && !value) }

    }

    private func settingToggle(_ name: String, detail: String, value: Binding<Bool>) -> some View {
        Toggle(isOn: value) {
            VStack(alignment: .leading, spacing: 5) { Text(name).font(.bronzeUI(14)); Text(detail).font(.bronzeUI(11)).foregroundStyle(.secondary) }
        }.tint(.bronze).padding(8).modifier(BronzeDeckSurface())
    }
    private func navigationCard(_ title: String, detail: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) { Text(title).font(.bronzeUI(16)); Text(detail).font(.bronzeUI(11)).foregroundStyle(.secondary) }
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
        let channels = max(1, session.outputNumberOfChannels)
        DispatchQueue.global(qos: .userInitiated).async {
            let success = engine.setAudioOutputDeviceId("", channels: channels, bufferFrames: frames, sampleRate: Double(rate), preserveEngine: true)
            DispatchQueue.main.async {
                bufferBusy = false
                if success { buffer = frames; sampleRate = rate } else { audioError = engine.lastAudioErrorMessage }
            }
        }
    }
}

// iOS owns USB/Bluetooth/AirPlay routing. Its native route picker exposes the
// routes actually available to this device rather than fabricated device IDs.
struct BronzeAudioRoutePicker: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let picker = AVRoutePickerView()
        picker.tintColor = .white; picker.activeTintColor = .systemOrange
        return picker
    }
    func updateUIView(_ view: AVRoutePickerView, context: Context) {}
}
