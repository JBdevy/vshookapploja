import SwiftUI

private struct EditTextItemKey: EnvironmentKey {
    static let defaultValue: (UUID) -> Void = { _ in }
}
private struct GridInteractionBlockedKey: EnvironmentKey {
    static let defaultValue = false
}
extension EnvironmentValues {
    var gridInteractionBlocked: Bool {
        get { self[GridInteractionBlockedKey.self] }
        set { self[GridInteractionBlockedKey.self] = newValue }
    }
    var editTextItem: (UUID) -> Void {
        get { self[EditTextItemKey.self] }
        set { self[EditTextItemKey.self] = newValue }
    }
}

/// The draft stays in the editor until Apply; transport updates never write it.
struct TextItemEditor: View {
    let apply: (String) -> Bool
    let close: () -> Void
    private let showHeader: Bool
    @State private var draft: String
    init(text: String, showHeader: Bool = true, apply: @escaping (String) -> Bool, close: @escaping () -> Void) {
        self.apply = apply; self.close = close; self.showHeader = showHeader
        _draft = State(initialValue: text)
    }
    private func confirm() {
        if apply(draft) { close() }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if showHeader { HStack {
                Text("Text Editor").font(.jarasHeadline)
                Spacer()
                Button(action: close) { Image(systemName: "xmark").frame(width: 32, height: 32).contentShape(Rectangle()) }
                    .buttonStyle(.plain).accessibilityLabel("Cancel")
            } }
            #if os(macOS)
            TextItemNotepad(text: $draft, apply: confirm, cancel: close)
                .frame(height: 180)
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(JarasTheme.line, lineWidth: 1))
            #else
            IpadTextItemNotepad(text: $draft).frame(height: 180)
            #endif
            HStack {
                Spacer()
                Text("\(ItemTextColors.plain(draft).unicodeScalars.count)")
                    .monospacedDigit()
                Text("characters")
            }.font(.jarasCaption).foregroundStyle(JarasTheme.secondary)
            Text("Command+Enter to apply; Enter for a new line.").font(.jarasCaption).foregroundStyle(JarasTheme.secondary)
            HStack {
                Button("Cancel", action: close).keyboardShortcut(.cancelAction)
                Spacer()
                Button("Apply", action: confirm).keyboardShortcut(.return, modifiers: .command)
            }.buttonStyle(.bordered)
        }.padding(18).frame(width: 430)
            .background(JarasTheme.panel).foregroundStyle(JarasTheme.text)
    }
}

#if os(macOS)
import AppKit

private struct TextItemNotepad: NSViewRepresentable {
    @Binding var text: String
    let apply: () -> Void
    let cancel: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView()
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = false; scroll.hasHorizontalScroller = false
        let editor = TextItemNotepadView()
        editor.isRichText = true; editor.importsGraphics = false; editor.isAutomaticQuoteSubstitutionEnabled = false
        editor.isAutomaticDashSubstitutionEnabled = false
        editor.font = .jarasSystemFont(ofSize: 14)
        editor.textColor = NSColor(JarasTheme.text)
        editor.insertionPointColor = NSColor(JarasTheme.green)
        editor.backgroundColor = NSColor(JarasTheme.background)
        editor.textContainerInset = NSSize(width: 10, height: 10)
        editor.isVerticallyResizable = true; editor.isHorizontallyResizable = false
        editor.autoresizingMask = [.width]
        editor.textContainer?.widthTracksTextView = true
        editor.minSize = NSSize(width: 0, height: 180)
        editor.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        editor.loadColoredText(text); editor.delegate = context.coordinator
        editor.apply = apply; editor.cancel = cancel
        scroll.documentView = editor
        return scroll
    }
    func updateNSView(_ scroll: NSScrollView, context: Context) {
        context.coordinator.parent = self
        guard let editor = scroll.documentView as? TextItemNotepadView else { return }
        editor.apply = apply; editor.cancel = cancel
        if ItemTextColors.runs(editor.encodedText) != ItemTextColors.runs(text) { editor.loadColoredText(text) }
    }
    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: TextItemNotepad
        init(_ parent: TextItemNotepad) { self.parent = parent }
        func textDidChange(_ notification: Notification) {
            guard let editor = notification.object as? NSTextView else { return }
            parent.text = (editor as? TextItemNotepadView)?.encodedText ?? editor.string
        }
    }
}

private final class TextItemNotepadView: NSTextView {
    var apply: () -> Void = {}
    var cancel: () -> Void = {}
    private static let colorKey = NSAttributedString.Key("CatLiveItemColor")
    private var paletteWindow: NSPanel?
    var encodedText: String {
        guard let storage = textStorage else { return string }
        var runs: [ItemTextColors.Run] = []
        storage.enumerateAttribute(Self.colorKey, in: NSRange(location: 0, length: storage.length)) { value, range, _ in
            runs.append(.init(text: (storage.string as NSString).substring(with: range), color: (value as? NSNumber)?.uint32Value))
        }
        return ItemTextColors.encode(runs)
    }
    func loadColoredText(_ value: String) {
        let result = NSMutableAttributedString(string: "")
        for run in ItemTextColors.runs(value) {
            var attributes: [NSAttributedString.Key: Any] = [.font: NSFont.jarasSystemFont(ofSize: 14), .foregroundColor: NSColor(JarasTheme.text)]
            if let color = run.color { attributes[.foregroundColor] = NSColor(Color(hex: color)); attributes[Self.colorKey] = NSNumber(value: color) }
            result.append(NSAttributedString(string: run.text, attributes: attributes))
        }
        textStorage?.setAttributedString(result)
    }
    func applyTextColor(_ color: UInt32, range: NSRange) {
        guard range.length > 0, NSMaxRange(range) <= (string as NSString).length,
              shouldChangeText(in: range, replacementString: nil) else { return }
        textStorage?.addAttributes([.foregroundColor: NSColor(Color(hex: color)), Self.colorKey: NSNumber(value: color)], range: range)
        didChangeText()
    }
    override func insertText(_ insertString: Any, replacementRange: NSRange) {
        // Coloring a selection is not a persistent typing mode. AppKit inherits
        // adjacent run attributes when the caret moves, so reset at insertion.
        var attributes = typingAttributes
        attributes.removeValue(forKey: Self.colorKey)
        attributes[.foregroundColor] = NSColor(JarasTheme.text)
        typingAttributes = attributes
        super.insertText(insertString, replacementRange: replacementRange)
    }
    override func menu(for event: NSEvent) -> NSMenu? {
        let selected = selectedRange()
        guard selected.length > 0, let parent = window, paletteWindow == nil else { return super.menu(for: event) }
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 360, height: 180), styleMask: [.titled], backing: .buffered, defer: false)
        panel.title = NSLocalizedString("Text color", comment: "")
        let dismiss: () -> Void = { [weak self, weak parent, weak panel] in
            guard let panel else { return }; parent?.endSheet(panel); panel.orderOut(nil); self?.paletteWindow = nil
        }
        panel.contentView = NSHostingView(rootView: ItemTextColorPalette(pick: { [weak self] color in
            guard let self, NSMaxRange(selected) <= (self.string as NSString).length else { dismiss(); return }
            self.applyTextColor(color, range: selected)
            dismiss(); parent.makeFirstResponder(self); self.setSelectedRange(selected)
        }, cancel: dismiss))
        paletteWindow = panel
        parent.beginSheet(panel)
        return nil
    }
    private var initiallyFocused = false
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard let window, !initiallyFocused else { return }
        initiallyFocused = true
        DispatchQueue.main.async { [weak self, weak window] in
            guard let self, let window else { return }
            window.makeFirstResponder(self)
            self.setSelectedRange(NSRange(location: (self.string as NSString).length, length: 0))
        }
    }
    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { cancel(); return }
        if (event.keyCode == 36 || event.keyCode == 76), event.modifierFlags.contains(.command) { apply(); return }
        super.keyDown(with: event)
    }
}
#endif

struct ItemNameEditor: View {
    let apply: (String) -> Bool
    let close: () -> Void
    @State private var name: String
    @FocusState private var focused: Bool
    init(name: String, apply: @escaping (String) -> Bool, close: @escaping () -> Void) {
        self.apply = apply; self.close = close; _name = State(initialValue: name)
    }
    private func confirm() { if apply(name) { close() } }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Editar nome").font(.jarasHeadline)
            TextField("Nome do item", text: $name).focused($focused).onSubmit(confirm)
            HStack {
                Button("Cancel", action: close).keyboardShortcut(.cancelAction)
                Spacer()
                Button("Save", action: confirm).keyboardShortcut(.defaultAction)
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }.buttonStyle(.bordered)
        }.padding(24).frame(width: 380).background(JarasTheme.panel).foregroundStyle(JarasTheme.text)
            .onAppear { focused = true }
    }
}

import UniformTypeIdentifiers
struct MIDIItemDocument: FileDocument {
    static var readableContentTypes: [UTType] { [UTType(filenameExtension: "mid") ?? .data] }
    let data: Data
    init(clip: AudioClip) throws { data = try MIDIItemExport.data(for: clip) }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct ItemTextColorPalette: View {
    let pick: (UInt32) -> Void
    let cancel: () -> Void
    var body: some View {
        VStack(spacing: 18) {
            Text("Text color").font(.jarasHeadline)
            HStack(spacing: 10) {
                ForEach(ItemTextColors.palette, id: \.self) { color in
                    Button { pick(color) } label: {
                        RoundedRectangle(cornerRadius: 6).fill(Color(hex: color)).frame(width: 30, height: 36)
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.white.opacity(0.4)))
                    }.buttonStyle(.plain).accessibilityLabel(String(format: "#%06X", color))
                }
            }
            Button("Cancel", action: cancel).keyboardShortcut(.cancelAction)
        }.padding(20).background(JarasTheme.panel).foregroundStyle(JarasTheme.text)
    }
}
extension ItemTextColors {
    static func view(_ value: String, display: (String) -> String = { $0 }, fallback: Color? = nil) -> Text {
        runs(value).reduce(Text("")) { result, run in
            let part = Text(verbatim: display(run.text))
            return result + ((run.color.map { Color(hex: $0) } ?? fallback).map { part.foregroundColor($0) } ?? part)
        }
    }
    #if os(macOS)
    static func attributed(_ value: String, font: NSFont, fallback: NSColor) -> NSAttributedString {
        let text = NSMutableAttributedString(string: "")
        for run in runs(value) { text.append(NSAttributedString(string: run.text, attributes: [.font: font, .foregroundColor: run.color.map { NSColor(Color(hex: $0)) } ?? fallback])) }
        return text
    }
    #endif
}

#if os(iOS)
import UIKit

/// Keep the stored runs separate from UIKit's display attributes, so ordinary
/// typing, selections and remote projection preserve the same document format.
private struct IpadTextItemNotepad: UIViewRepresentable {
    @Binding var text: String
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> IpadColoredTextView {
        let view = IpadColoredTextView()
        view.isEditable = true
        view.isSelectable = true
        view.font = .systemFont(ofSize: 16)
        view.backgroundColor = UIColor(JarasTheme.background)
        view.tintColor = UIColor(JarasTheme.green)
        view.textContainerInset = UIEdgeInsets(top: 10, left: 10, bottom: 10, right: 10)
        view.autocorrectionType = .no
        view.smartQuotesType = .no
        view.smartDashesType = .no
        view.load(text)
        view.delegate = context.coordinator
        let rightClick = UITapGestureRecognizer(target: view, action: #selector(IpadColoredTextView.chooseColor))
        rightClick.buttonMaskRequired = .secondary
        rightClick.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.indirectPointer.rawValue)]
        rightClick.cancelsTouchesInView = false
        view.addGestureRecognizer(rightClick)
        return view
    }
    func updateUIView(_ view: IpadColoredTextView, context: Context) {
        context.coordinator.parent = self
        if view.markedTextRange == nil, ItemTextColors.runs(view.encodedText) != ItemTextColors.runs(text) {
            let selection = view.selectedRange
            view.load(text)
            view.selectedRange = NSRange(location: min(selection.location, view.textStorage.length), length: 0)
        }
    }
    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: IpadTextItemNotepad
        init(_ parent: IpadTextItemNotepad) { self.parent = parent }
        func textViewDidChange(_ textView: UITextView) {
            guard let view = textView as? IpadColoredTextView else { return }
            parent.text = view.encodedText
        }
        func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
            guard let view = textView as? IpadColoredTextView else { return UIMenu(children: suggestedActions) }
            return view.selectionMenu(for: range, suggestedActions: suggestedActions)
        }
    }
}

private final class IpadColoredTextView: UITextView {
    private var requestedInitialFocus = false
    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, !requestedInitialFocus else { return }
        requestedInitialFocus = true
        // The compact editor is inserted as an overlay. Wait for it to join
        // the window before requesting its keyboard, and only focus once.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard self.window != nil else { self.requestedInitialFocus = false; return }
            self.becomeFirstResponder()
        }
    }
    override func becomeFirstResponder() -> Bool {
        // Do not depend on the order in which SwiftUI attaches the background
        // keyboard scope and this UIKit editor, including re-entry after colors.
        if let window {
            IpadTextKeyboard.install(in: window)
            IpadTextKeyboard.prepare(self)
        }
        return super.becomeFirstResponder()
    }
    private static let colorKey = NSAttributedString.Key("CatLiveItemColor")
    private weak var palette: UIViewController?
    private var palettePending = false
    var encodedText: String {
        var runs: [ItemTextColors.Run] = []
        textStorage.enumerateAttribute(Self.colorKey, in: NSRange(location: 0, length: textStorage.length)) { value, range, _ in
            runs.append(.init(text: (textStorage.string as NSString).substring(with: range), color: (value as? NSNumber)?.uint32Value))
        }
        return ItemTextColors.encode(runs)
    }
    func load(_ value: String) {
        let result = NSMutableAttributedString(string: "")
        for run in ItemTextColors.runs(value) {
            var attributes: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 16), .foregroundColor: UIColor(JarasTheme.text)]
            if let color = run.color {
                attributes[.foregroundColor] = UIColor(Color(hex: color))
                attributes[Self.colorKey] = NSNumber(value: color)
            }
            result.append(NSAttributedString(string: run.text, attributes: attributes))
        }
        attributedText = result
        typingAttributes = [.font: UIFont.systemFont(ofSize: 16), .foregroundColor: UIColor(JarasTheme.text)]
    }
    private func restore(_ snapshot: NSAttributedString, selection: NSRange) {
        let previous = NSAttributedString(attributedString: textStorage)
        undoManager?.registerUndo(withTarget: self) { $0.restore(previous, selection: selection) }
        textStorage.setAttributedString(snapshot)
        selectedRange = selection
        delegate?.textViewDidChange?(self)
    }
    override func insertText(_ text: String) {
        var attributes = typingAttributes
        attributes.removeValue(forKey: Self.colorKey)
        attributes[.foregroundColor] = UIColor(JarasTheme.text)
        typingAttributes = attributes
        super.insertText(text)
    }
    func applyColor(_ color: UInt32, range: NSRange) {
        guard range.length > 0, NSMaxRange(range) <= textStorage.length else { return }
        let before = NSAttributedString(attributedString: textStorage)
        undoManager?.registerUndo(withTarget: self) { $0.restore(before, selection: range) }
        textStorage.addAttributes([.foregroundColor: UIColor(Color(hex: color)), Self.colorKey: NSNumber(value: color)], range: range)
        selectedRange = range
        delegate?.textViewDidChange?(self)
    }
    func selectionMenu(for range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu {
        guard range.length > 0, range.location != NSNotFound,
              NSMaxRange(range) <= textStorage.length else { return UIMenu(children: suggestedActions) }
        // UIKit requests this menu for both a selection long press and pointer
        // context clicks. Replace its lookup/translation actions with our palette.
        // Present on the next turn, after UIKit finishes building its edit menu.
        if !palettePending && palette == nil {
            palettePending = true
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.palettePending = false
                self.chooseColor(in: range)
            }
        }
        return UIMenu(children: [])
    }
    @objc func chooseColor() { chooseColor(in: selectedRange) }
    private func chooseColor(in range: NSRange) {
        guard range.length > 0, range.location != NSNotFound,
              NSMaxRange(range) <= textStorage.length, palette == nil,
              var presenter = window?.rootViewController else { return }
        // The editor can itself be inside a SwiftUI sheet. Present from that
        // sheet rather than its underlying hosting controller.
        while let presented = presenter.presentedViewController { presenter = presented }
        guard !presenter.isBeingDismissed else { return }
        selectedRange = range
        let controller = UIHostingController(rootView: ItemTextColorPalette(pick: { [weak self] color in
            guard let self else { return }
            self.applyColor(color, range: range)
            self.palette?.dismiss(animated: true) { [weak self] in self?.becomeFirstResponder() }
        }, cancel: { [weak self] in
            self?.palette?.dismiss(animated: true) { [weak self] in self?.becomeFirstResponder() }
        }))
        controller.modalPresentationStyle = .popover
        controller.preferredContentSize = CGSize(width: 360, height: 180)
        controller.popoverPresentationController?.sourceView = self
        controller.popoverPresentationController?.sourceRect = selectedTextRange.map { firstRect(for: $0) } ?? bounds
        palette = controller
        presenter.present(controller, animated: true)
    }
}
#endif
