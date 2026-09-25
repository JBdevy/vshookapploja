import SwiftUI
import AVFoundation

struct BronzeNativeSettingsView: View {
    @ObservedObject var model: BronzeNativeAppModel
    @State private var page = 0
    @State private var learn = false
    @State private var bufferBusy = false
    @State private var audioError = ""
    @State private var deviceSelections: [String] = []
    @AppStorage("bronze.seamless") private var seamless = false
    @AppStorage("bronze.lite") private var lite = false
    @AppStorage("bronze.showKeyboard") private var keyboard = false
    @AppStorage("bronze.keyboardStyle") private var keyboardStyle = 0
    @AppStorage("bronze.audioBuffer") private var buffer = 128
    private var session: AVAudioSession { .sharedInstance() }
    private let busNames = ["Playlist", "Pads", "Efects", "Metrônomo", "Módulos"]

    var body: some View {
        BronzeNativeModal(title: page == 0 ? "Configurações" : page == 1 ? "Dispositivos MIDI" : "Dispositivo de áudio") {
            VStack(spacing: 12) {
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
                        }.padding(16).modifier(BronzeDeckSurface())
                        VStack(spacing: 12) {
                            Text("Estilo do teclado").font(.bronzeUI(14))
                            HStack { ForEach(0..<3, id: \.self) { style in
                                Button(["Default", "Black", "Bronze"][style]) { keyboardStyle = style }
                                    .buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: keyboardStyle == style))
                            }}.frame(height: 42)
                        }.padding(16).modifier(BronzeDeckSurface())
                    }
                } else if page == 1 {
                    ForEach(0..<3, id: \.self) { index in
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Dispositivo MIDI \(index + 1)").font(.bronzeUI(13)).foregroundStyle(Color.bronzeLight)
                            Menu(deviceName(index)) {
                                Button("Nenhum") { selectDevice(index, id: "") }
                                ForEach(model.midiDevices) { device in Button(device.name) { selectDevice(index, id: device.id) } }
                            }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(height: 44)
                        }.padding(12).modifier(BronzeDeckSurface())
                    }
                    HStack {
                        Button("Atualizar dispositivos") { model.refreshMidiDevices() }
                        Button("MIDI Learn") { learn = true }
                    }.buttonStyle(BronzeDeckButtonStyle()).frame(height: 44)
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        infoCard("Dispositivo de áudio", value: session.currentRoute.outputs.map(\.portName).joined(separator: " · "))
                        VStack(spacing: 10) {
                            Text("Buffer").font(.bronzeUI(13)).foregroundStyle(Color.bronzeLight)
                            HStack { ForEach([64, 128, 256, 512], id: \.self) { frames in
                                Button("\(frames)") { changeBuffer(frames) }.buttonStyle(BronzeDeckButtonStyle(palette: .grey, selected: buffer == frames))
                            }}.frame(height: 40)
                        }.padding(12).modifier(BronzeDeckSurface())
                        ForEach([4, 0, 1, 2, 3], id: \.self) { bus in
                            VStack(spacing: 10) {
                                Text("Saídas · \(busNames[bus])").font(.bronzeUI(13)).foregroundStyle(Color.bronzeLight)
                                Menu("\(model.mixer.channelStart(bus) + 1)\(model.mixer.channelCount(bus) == 2 ? " + \(model.mixer.channelStart(bus) + 2)" : " · Mono")") {
                                    ForEach(0..<max(1, session.outputNumberOfChannels), id: \.self) { channel in
                                        Button("\(channel + 1) · Mono") { model.setMixerRoute(bus, start: channel, count: 1) }
                                        if channel + 1 < session.outputNumberOfChannels {
                                            Button("\(channel + 1) + \(channel + 2)") { model.setMixerRoute(bus, start: channel, count: 2) }
                                        }
                                    }
                                }.buttonStyle(BronzeDeckButtonStyle(palette: .grey)).frame(height: 40)
                            }.padding(12).modifier(BronzeDeckSurface())
                        }
                        infoCard("Sample rate", value: String(format: "%.0f Hz", session.sampleRate))
                    }.disabled(bufferBusy)
                    if bufferBusy { ProgressView("Ajustando áudio…") }
                    if !audioError.isEmpty { Text(audioError).foregroundStyle(.orange) }
                }
            }
        }
        .onAppear { model.refreshMidiDevices(); deviceSelections = UserDefaults.standard.stringArray(forKey: "bronze.midiDevices") ?? Array(model.midiDevices.prefix(3).map(\.id)) }
        .onChange(of: seamless) { model.engine.setSeamlessPresetSwitching($0 && !lite) }
        .onChange(of: lite) { value in model.engine.setSeamlessPresetSwitching(seamless && !value) }
        .sheet(isPresented: $learn) { BronzeNativeMIDIPanel(model: model) }
    }

    private func settingToggle(_ name: String, detail: String, value: Binding<Bool>) -> some View {
        Toggle(isOn: value) {
            VStack(alignment: .leading, spacing: 5) { Text(name).font(.bronzeUI(14)); Text(detail).font(.bronzeUI(11)).foregroundStyle(.secondary) }
        }.tint(.bronze).padding(18).modifier(BronzeDeckSurface())
    }
    private func navigationCard(_ title: String, detail: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) { Text(title).font(.bronzeUI(16)); Text(detail).font(.bronzeUI(11)).foregroundStyle(.secondary) }
                .frame(maxWidth: .infinity, alignment: .leading).padding(22).modifier(BronzeDeckSurface())
        }.buttonStyle(.plain)
    }
    private func infoCard(_ title: String, value: String) -> some View {
        VStack(spacing: 12) { Text(title).font(.bronzeUI(13)).foregroundStyle(Color.bronzeLight); Text(value).font(.bronzeUI(14)).lineLimit(2) }
            .frame(maxWidth: .infinity, minHeight: 70).padding(12).modifier(BronzeDeckSurface())
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
    private func changeBuffer(_ frames: Int) {
        guard !bufferBusy else { return }
        bufferBusy = true; audioError = ""
        let engine = model.engine
        let channels = max(1, session.outputNumberOfChannels), rate = session.sampleRate
        DispatchQueue.global(qos: .userInitiated).async {
            let success = engine.setAudioOutputDeviceId("", channels: channels, bufferFrames: frames, sampleRate: rate, preserveEngine: true)
            DispatchQueue.main.async {
                bufferBusy = false
                if success { buffer = frames } else { audioError = engine.lastAudioErrorMessage }
            }
        }
    }
}
