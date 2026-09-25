import SwiftUI
import UIKit

struct DirectorSearchView: View {
    @ObservedObject var session: HookSession
    let close: () -> Void
    @State private var query = ""
    @StateObject private var input = DirectorSearchInputController()
    private var entries: [JSON] { DirectorSearch.entries(session.snapshot, query: query) }
    var body: some View {
        let playlistIDs = Set(session.playlistItems.map(\.identifier))
        GeometryReader { geometry in
            VStack(spacing: 7) {
                HStack {
                    Text("LUPA").font(.custom("Arial-BoldMT", size: 20)).foregroundColor(Color(hex: "FACC15")); Spacer()
                    DirectorControl(title: "FECHAR", height: 40, action: close).frame(width: 120)
                }
                HStack(spacing: 8) {
                    DirectorSearchInput(text: $query, customKeyboard: session.tablet, controller: input)
                        .padding(.horizontal, 10).frame(height: 42).background(Color(hex: "070B11")).cornerRadius(6)
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "475569")))
                    Text("\(entries.count)").font(.headline).frame(width: 48, height: 40).background(Color(hex: "172033")).cornerRadius(6)
                }
                ScrollView {
                    LazyVStack(spacing: 5) {
                        ForEach(Array(entries.enumerated()), id: \.offset) { _, item in
                            let inPlaylist = playlistIDs.contains(item.identifier)
                            Button {
                                session.selectSearchResult(item); close()
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(item.name.uppercased()).font(.custom("Arial-BoldMT", size: 14)).lineLimit(2)
                                        if item.isFamilyChild { Text("FILHO DE " + item["parentName"].string.uppercased()).font(.custom("Arial-BoldMT", size: 9)).foregroundColor(Color(hex: "C4B5FD")) }
                                    }.frame(maxWidth: .infinity, alignment: .leading)
                                    VStack(alignment: .trailing, spacing: 3) {
                                        Text(inPlaylist ? "REPERTÓRIO" : "MÚSICAS").font(.custom("Arial-BoldMT", size: 9)).foregroundColor(Color(hex: "93C5FD"))
                                        Text(directorTime(item.songDuration)).font(.custom("Arial-BoldMT", size: 11)).foregroundColor(Color(hex: "FACC15"))
                                    }
                                }.padding(.horizontal, 10).frame(minHeight: 48)
                            }.buttonStyle(DirectorButtonStyle(background: Color(hex: item.isFamilyChild ? "31204E" : "111827")))
                        }
                        if entries.isEmpty { Text("NENHUMA MÚSICA ENCONTRADA").font(.caption.bold()).padding(20) }
                    }
                }
                if session.tablet { keyboard(height: min(38, max(28, geometry.size.height * 0.062))) }
            }.padding(.top, session.tablet ? 8 : 6 - min(8, geometry.safeAreaInsets.top))
                .padding(.bottom, session.tablet && !session.readOnly ? 8 + geometry.safeAreaInsets.top - geometry.safeAreaInsets.bottom : 8)
                .padding(.leading, session.tablet ? -min(12, geometry.safeAreaInsets.leading) : 8)
                .padding(.trailing, session.tablet ? -min(12, geometry.safeAreaInsets.trailing) : 8)
                .foregroundColor(.white).background(Color(hex: "0B1220"))
        }.background(Color(hex: "05070B").ignoresSafeArea()).onAppear { HookOrientation.set(tablet: session.tablet) }
    }
    private func keyboard(height: CGFloat) -> some View {
        VStack(spacing: 4) {
            ForEach(Array(["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].enumerated()), id: \.offset) { index, row in
                HStack(spacing: 4) {
                    ForEach(Array(row), id: \.self) { key in
                        DirectorControl(title: String(key), background: Color(hex: "334155"), height: height, size: 13) { input.insert(String(key)) }
                    }
                }.padding(.horizontal, index == 2 ? 20 : index == 3 ? 50 : 0)
            }
            HStack(spacing: 4) {
                DirectorControl(title: "LIMPAR", background: Color(hex: "991B1B"), height: height, size: 12) { input.clear() }
                DirectorControl(title: "ESPAÇO", background: Color(hex: "1E40AF"), height: height, size: 12) { if !query.isEmpty { input.insert(" ") } }.frame(maxWidth: .infinity)
                DirectorControl(title: "⌫", background: Color(hex: "92400E"), height: height, size: 18) { input.backspace() }
            }
        }.padding(6).background(Color(hex: "111827")).cornerRadius(6).overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "334155")))
    }
}

@MainActor
private final class DirectorSearchInputController: ObservableObject {
    weak var field: UITextField?

    func insert(_ value: String) {
        guard let field else { return }
        let selected = field.selectedTextRange.flatMap { field.text(in: $0) } ?? ""
        guard (field.text ?? "").count - selected.count + value.count <= 80 else { return }
        field.becomeFirstResponder()
        field.insertText(value)
        field.sendActions(for: .editingChanged)
    }

    func clear() {
        guard let field else { return }
        field.text = ""
        field.becomeFirstResponder()
        field.sendActions(for: .editingChanged)
    }

    func backspace() {
        guard let field else { return }
        field.becomeFirstResponder()
        field.deleteBackward()
        field.sendActions(for: .editingChanged)
    }
}

private struct DirectorSearchInput: UIViewRepresentable {
    @Binding var text: String
    let customKeyboard: Bool
    let controller: DirectorSearchInputController

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> SearchField {
        let field = SearchField()
        field.font = UIFont(name: "Arial-BoldMT", size: 17)
        field.textColor = .white
        field.tintColor = UIColor(red: 250 / 255, green: 204 / 255, blue: 21 / 255, alpha: 1)
        field.attributedPlaceholder = NSAttributedString(string: "PESQUISAR MÚSICA", attributes: [.foregroundColor: UIColor.lightGray])
        field.autocapitalizationType = .allCharacters
        field.autocorrectionType = .no
        field.spellCheckingType = .no
        field.keyboardAppearance = .dark
        field.returnKeyType = .search
        field.accessibilityLabel = "Pesquisar música"
        field.accessibilityIdentifier = "vshook.search.input"
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        field.delegate = context.coordinator
        field.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .editingChanged)
        configureKeyboard(field)
        controller.field = field
        return field
    }

    func updateUIView(_ field: SearchField, context: Context) {
        context.coordinator.parent = self
        controller.field = field
        // Session snapshots must not reset the selection/caret while typing.
        if field.text != text { field.text = text }
        if (field.inputView != nil) != customKeyboard {
            configureKeyboard(field)
            field.reloadInputViews()
        }
    }

    private func configureKeyboard(_ field: UITextField) {
        // The tablet keeps its existing on-screen keys, while UITextField
        // supplies the caret, selection and horizontal scrolling natively.
        field.inputView = customKeyboard ? UIView(frame: .zero) : nil
        field.inputAssistantItem.leadingBarButtonGroups = []
        field.inputAssistantItem.trailingBarButtonGroups = []
    }

    final class SearchField: UITextField {
        private var requestedFocus = false
        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard window != nil, !requestedFocus else { return }
            requestedFocus = true
            DispatchQueue.main.async { [weak self] in
                guard let self, self.window != nil else { return }
                self.becomeFirstResponder()
            }
        }
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: DirectorSearchInput
        init(_ parent: DirectorSearchInput) { self.parent = parent }
        @objc func changed(_ field: UITextField) { parent.text = field.text ?? "" }
        func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
            guard parent.customKeyboard else { return true }
            let value = (textField.text ?? "") as NSString
            guard range.location <= value.length, range.length <= value.length - range.location else { return false }
            return value.replacingCharacters(in: range, with: string).count <= 80
        }
        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            if !parent.customKeyboard { textField.resignFirstResponder() }
            return true
        }
    }
}
