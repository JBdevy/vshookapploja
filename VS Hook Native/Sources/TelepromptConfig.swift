import SwiftUI

struct TPConfigView: View {
    @ObservedObject var preferences: TPPreferences
    let tablet: Bool
    @State private var page = "hub"
    @AppStorage("vshook.native.light") private var light = false
    let close: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(page == "hub" ? "CONFIG TELEPROMPT" : page == "notice" ? "CONFIG RECADOS" : "CONFIG TELEPROMPT \(page)").font(.custom("Arial-BoldMT", size: 16))
            if page == "hub" {
                VStack(spacing: 12) {
                    DirectorControl(title: "CONFIG TELEPROMPT 1", height: 52) { page = "1" }
                    DirectorControl(title: "CONFIG TELEPROMPT 2", height: 52) { page = "2" }
                    DirectorControl(title: "CONFIG RECADOS", height: 52) { page = "notice" }
                }
                Spacer(minLength: 0)
            } else {
                GeometryReader { geometry in
                ScrollView {
                    VStack(spacing: 10) {
                    if page == "notice" { noticeFields(width: geometry.size.width) }
                    else {
                        let slot = Int(page) ?? 1
                        ForEach(["color", "range", "select", "toggle"], id: \.self) { kind in
                            VStack(alignment: .leading, spacing: 12) {
                                Text(["color":"CORES", "range":"ESCALAS", "select":"FONTES E POSIÇÃO", "toggle":"MOSTRAR"][kind]!).font(.custom("Arial-BoldMT", size: 12)).foregroundColor(Color(hex: light ? "365314" : "A3FF12"))
                                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: geometry.size.width > 520 ? 2 : 1), spacing: 8) {
                                    ForEach(TPSchema.data["fields"].array.filter { kind == "toggle" ? ($0["kind"] == "toggle" || $0["key"] == "preset") : ($0["kind"].string == kind && $0["key"] != "preset") }, id: \.tpFieldKey) { field in
                                        fieldView(field, slot: slot).font(.custom("Arial-BoldMT", size: 11)).padding(.horizontal, 9).padding(.vertical, 7).frame(maxWidth: .infinity, minHeight: kind == "color" || kind == "toggle" ? 48 : 70, alignment: .leading)
                                            .background(Color(hex: light ? "F8FAFC" : "101722")).cornerRadius(6)
                                            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: light ? "CBD5E1" : "293548")))
                                    }
                                }
                            }.padding(10).background(Color(hex: light ? "EDF1F5" : "0B111A")).cornerRadius(6)
                                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: light ? "94A3B8" : "334155")))
                        }
                    }
                    }.padding(.horizontal, 5).padding(.bottom, 10)
                }.id(page)
                }
            }
            HStack {
                DirectorControl(title: "VOLTAR", background: Color(hex: "16A34A"), foreground: .black, height: 38) { if page == "hub" { close() } else { page = "hub" } }
                DirectorControl(title: "FECHAR", height: 38, action: close)
            }
        }.padding(16).frame(maxWidth: .infinity, maxHeight: .infinity).foregroundColor(light ? Color(hex: "111827") : .white)
            .background(Color(hex: light ? "EDF1F5" : "101827")).clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "334155")))
    }
    @ViewBuilder private func fieldView(_ field: JSON, slot: Int) -> some View {
        let key = field["key"].string, label = field["label"].string, value = preferences.settings(slot)[key]
        switch field["kind"].string {
        case "color":
            TPColorField(label: label, color: Binding(get: { Color(hex: value.string) }, set: { preferences.set(key, .string($0.rgbHex), slot: slot) }))
        case "range":
            VStack(alignment: .leading, spacing: 5) {
                HStack { Text(label); Spacer(); Text("\(Int(value.double))%").monospacedDigit() }.lineLimit(1).minimumScaleFactor(0.8)
                let minValue = field["min"].double
                let maxValue = !tablet && ["clockScale","songNameScale","queueNameScale"].contains(key) ? (key == "clockScale" ? 150.0 : 200.0) : field["max"].double
                Slider(value: Binding(get: { min(maxValue, max(minValue, value.double)) }, set: { preferences.set(key, .number($0), slot: slot) }), in: minValue...maxValue, step: 5).tint(Color(hex: "A3FF12")).accessibilityLabel(label)
            }
        case "select":
            VStack(alignment: .leading) {
                Text(label)
                Menu {
                    ForEach(field["options"].array, id: \.tpOptionValue) { option in
                        Button { preferences.set(key, option["value"], slot: slot) } label: {
                            if option["value"] == value { Label(option["label"].string, systemImage: "checkmark") }
                            else { Text(option["label"].string) }
                        }
                    }
                } label: {
                    HStack {
                        Text(field["options"].array.first { $0["value"] == value }?["label"].string ?? value.string).lineLimit(1).minimumScaleFactor(0.7)
                        Spacer(minLength: 4); Image(systemName: "chevron.down")
                    }.padding(.horizontal, 8).frame(height: 34).frame(maxWidth: .infinity)
                        .background(Color(hex: light ? "FFFFFF" : "070B11")).cornerRadius(6)
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "475569")))
                }.buttonStyle(.plain).accessibilityLabel(label).accessibilityValue(value.string).accessibilityIdentifier("vshook.tp.config." + key)
            }
        default:
            Button { HookFeedback.tap(); preferences.set(key, .bool(!value.bool), slot: slot) } label: {
                HStack(spacing: 8) {
                    Image(systemName: value.bool ? "checkmark.square.fill" : "square").font(.system(size: 22)).foregroundColor(value.bool ? .green : .gray)
                    Text(label).frame(maxWidth: .infinity, alignment: .leading)
                }.contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityValue(value.bool ? "Ligado" : "Desligado")
        }
    }
    private func noticeFields(width: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("APARÊNCIA DOS RECADOS").font(.custom("Arial-BoldMT", size: 12)).foregroundColor(Color(hex: light ? "365314" : "A3FF12"))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: width > 520 ? 2 : 1), spacing: 8) {
                noticeCard {
                    VStack(alignment: .leading) {
                        Text("Fonte do recado")
                        Picker("Fonte do recado", selection: Binding(get: { preferences.notice["fontFamily"].string }, set: { preferences.setNotice("fontFamily", .string($0)) })) {
                            ForEach(TPSchema.data["fields"].array.first { $0["key"] == "fontFamily" }?["options"].array ?? [], id: \.tpOptionValue) { option in Text(option["label"].string).tag(option["value"].string) }
                        }.pickerStyle(.menu).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                ForEach([("textColor","Cor da letra"), ("backgroundColor","Cor de fundo"), ("flashColor","Cor do pisca")], id: \.0) { key,label in
                    noticeCard { TPColorField(label: label, color: Binding(get: { Color(hex: preferences.notice[key].string) }, set: { preferences.setNotice(key, .string($0.rgbHex)) })) }
                }
                noticeCard {
                    VStack(alignment: .leading) {
                        Text("Escala da letra do recado \(Int(preferences.notice["textScale"].double))%")
                        Slider(value: Binding(get: { preferences.notice["textScale"].double }, set: { preferences.setNotice("textScale", .number($0)) }), in: 50...100, step: 5).tint(Color(hex: "A3FF12"))
                    }
                }
                ForEach([("window1Enabled","Exibir no Teleprompt 1"), ("window2Enabled","Exibir no Teleprompt 2"), ("emojiEnabled","Exibir emoji"), ("cleanDisplay","Limpar conteúdo enquanto exibe o recado")], id: \.0) { key,label in
                    noticeCard {
                        Button { preferences.setNotice(key, .bool(!preferences.notice[key].bool)) } label: {
                            HStack {
                                Image(systemName: preferences.notice[key].bool ? "checkmark.square.fill" : "square").font(.system(size: 22)).foregroundColor(preferences.notice[key].bool ? .green : .gray)
                                Text(label).frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }.buttonStyle(.plain)
                    }
                }
                noticeCard {
                    VStack(alignment: .leading) {
                        Text("Emoji")
                        TextField("Emoji", text: Binding(get: { preferences.notice["emoji"].string }, set: { preferences.setNotice("emoji", .string(String($0.prefix(8)))) })).textFieldStyle(.roundedBorder)
                    }
                }
            }
        }.padding(10).background(Color(hex: light ? "EDF1F5" : "0B111A")).cornerRadius(6)
    }
    private func noticeCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content().font(.custom("Arial-BoldMT", size: 11)).padding(9).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .background(Color(hex: light ? "F8FAFC" : "101722")).cornerRadius(6)
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: light ? "CBD5E1" : "293548")))
    }

}
extension Color {
    var rgbHex: String {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        UIColor(self).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return String(format: "#%02X%02X%02X", Int(red * 255), Int(green * 255), Int(blue * 255))
    }
}

extension JSON {
    var tpFieldKey: String { self["key"].string }
    var tpOptionValue: String { self["value"].string }
}

private struct TPColorField: View {
    let label: String
    @Binding var color: Color
    @State private var choosing = false
    var body: some View {
        HStack(spacing: 8) {
            Text(label).frame(maxWidth: .infinity, alignment: .leading)
            Button { choosing = true } label: {
                Rectangle().fill(color).padding(5).frame(width: 58, height: 34).background(Color(hex: "070B11")).cornerRadius(6)
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "475569")))
            }.buttonStyle(.plain).accessibilityLabel(label).accessibilityValue(color.rgbHex)
        }.sheet(isPresented: $choosing) { TPColorEditor(color: $color) }
    }
}
private struct TPColorEditor: UIViewControllerRepresentable {
    @Binding var color: Color
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIViewController(context: Context) -> UIColorPickerViewController {
        let controller = UIColorPickerViewController(); controller.selectedColor = UIColor(color); controller.supportsAlpha = false; controller.delegate = context.coordinator; return controller
    }
    func updateUIViewController(_ controller: UIColorPickerViewController, context: Context) { context.coordinator.parent = self }
    final class Coordinator: NSObject, UIColorPickerViewControllerDelegate {
        var parent: TPColorEditor
        init(_ parent: TPColorEditor) { self.parent = parent }
        func colorPickerViewControllerDidSelectColor(_ viewController: UIColorPickerViewController) { parent.color = Color(viewController.selectedColor) }
    }
}
