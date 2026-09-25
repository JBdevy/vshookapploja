import SwiftUI
import AVKit
import PDFKit

struct TelepromptView: View {
    @ObservedObject var session: HookSession
    @StateObject private var preferences: TPPreferences
    @AppStorage("vshook.native.teleprompt.slot") private var slot = 1
    @State private var showSettings = false
    @State private var listOpen = false
    @State private var partsOpen = false
    @State private var fullscreen = false
    let openPlaylists: (() -> Void)?
    let songTools: ((JSON) -> Void)?
    @StateObject private var notice = TPNoticeModel()
    init(session: HookSession, openPlaylists: (() -> Void)? = nil, songTools: ((JSON) -> Void)? = nil) {
        self.session = session
        self.openPlaylists = openPlaylists
        self.songTools = songTools
        _preferences = StateObject(wrappedValue: TPPreferences(role: session.mode.rawValue))
    }
    private var settings: JSON { preferences.settings(slot) }
    private var nested: JSON { session.snapshot["tp\(slot)"] }
    private var text: String {
        let local = nested.first("overlayText", "lyricsText", "lyrics", "text")
        let raw = (local.exists ? local : session.snapshot.first("tp\(slot)LyricsText", "tp\(slot)Lyrics", "telepromptTp\(slot)Lyrics", "telepromptTp\(slot)Text")).string
        return settings["textCase"].string == "uppercase" ? raw.uppercased() : settings["textCase"].string == "lowercase" ? raw.lowercased() : raw
    }
    private var chords: String {
        let source = session.snapshot["cifras"].exists ? session.snapshot["cifras"] : session.snapshot["chords"]
        let local = source.first("overlayText", "lyricsText", "lyrics", "text")
        return local.exists ? local.string : session.snapshot.first("cifrasText", "chordText").string
    }
    private var clear: Bool { settings["clearMode"].bool || nested["clear"].bool || nested["mode"] == "clear" || session.snapshot["telepromptClear"].bool }
    private var url: URL? {
        let raw = nested.first("mediaUrl", "url").string.isEmpty ? session.snapshot.first("tp\(slot)MediaUrl", "telepromptTp\(slot)MediaUrl").string : nested.first("mediaUrl", "url").string
        if !raw.isEmpty { return URL(string: raw, relativeTo: session.base)?.absoluteURL }
        let path = nested.first("mediaPath", "path").string.isEmpty ? session.snapshot.first("tp\(slot)MediaPath", "telepromptTp\(slot)MediaPath").string : nested.first("mediaPath", "path").string
        return session.mediaURL(path)
    }
    private var type: String {
        let declared = nested.first("mediaType", "telepromptType", "type").string
        if !declared.isEmpty { return declared.lowercased() }
        let ext = url?.pathExtension.lowercased() ?? ""
        return ["mp4", "mov", "m4v", "webm"].contains(ext) ? "video" : ext == "pdf" ? "pdf" : "image"
    }
    var body: some View {
        VStack(spacing: 8) {
            if !fullscreen {
                HStack(spacing: 6) {
                    DirectorControl(title: "CONFIG/TP", height: session.tablet ? 30 : 40, size: 11) { showSettings = true }
                    DirectorControl(title: "TP/1", background: Color(hex: slot == 1 ? "EAB308" : "172033"), foreground: slot == 1 ? .black : .white, height: session.tablet ? 30 : 40, size: 11) { slot = 1 }
                    DirectorControl(title: "TP/2", background: Color(hex: slot == 2 ? "EAB308" : "172033"), foreground: slot == 2 ? .black : .white, height: session.tablet ? 30 : 40, size: 11) { slot = 2 }
                    DirectorControl(title: "VOLTAR", height: session.tablet ? 30 : 40, size: 11) { session.panel = "" }
                }
            }
            GeometryReader { geometry in
                HStack(spacing: 0) {
                    if listOpen && !fullscreen && !session.readOnly {
                        playlistPane.frame(width: session.tablet ? geometry.size.width * 0.40 : geometry.size.width)
                    }
                    if session.tablet || fullscreen || (!listOpen && !partsOpen) {
                        VStack(spacing: 8) {
                            if !settings["hideTransport"].bool && !listOpen && !fullscreen { DirectorPlaybackHeader(session: session) }
                            viewport.onTapGesture(count: 2) { fullscreen.toggle() }
                        }.padding(fullscreen ? 0 : 8).frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    if partsOpen && !fullscreen && !session.readOnly {
                        DirectorPartsView(session: session).padding(8)
                            .frame(width: session.tablet ? geometry.size.width * 0.40 : geometry.size.width)
                            .background(Color(hex: "111B28"))
                            .accessibilityElement(children: .contain).accessibilityIdentifier("vshook.tp.parts")
                    }
                }
            }
            if !fullscreen { footer }
        }.background(Color(hex: "05070B")).accessibilityHidden(showSettings)
            .task { await notice.poll(base: session.base, fallback: session.snapshot["technicalNotice"]) }
            .overlay {
                if showSettings { DirectorModal { TPConfigView(preferences: preferences, tablet: session.tablet, close: { showSettings = false }) } }
            }
    }
    private var playlistPane: some View {
        VStack(spacing: 7) {
            DirectorControl(title: session.activePlaylist.name.uppercased(), height: 42, size: 12) { openPlaylists?() }
                .accessibilityIdentifier("vshook.tp.playlist.open")
            DirectorSongList(session: session, hideNumbers: true, playlistOnly: true) { songTools?($0) }
        }.padding(8).background(Color(hex: "111B28"))
            .accessibilityElement(children: .contain).accessibilityIdentifier("vshook.tp.list")
    }
    private var viewport: some View {
        GeometryReader { viewportGeometry in
        TimelineView(.periodic(from: .now, by: 0.2)) { context in
            VStack(spacing: 6) {
                decorations(top: true, date: context.date, size: viewportGeometry.size)
                GeometryReader { geometry in
                    ZStack {
                        Color.black
                        if !clear, previewActive { TPPreviewGrid(session: session, slot: slot, settings: settings) }
                        else if !clear {
                            if let url {
                                Group {
                                    if type == "video" {
                                        SyncedVideo(url: url, time: nested.first("mediaCurrentTime", "currentTime").double, playing: nested["playing"].exists ? nested["playing"].bool : session.playing, rate: nested.first("mediaPlayrate", "playrate").exists ? nested.first("mediaPlayrate", "playrate").double : 1)
                                    } else if type == "pdf" { NativePDF(url: url) }
                                    else { AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { ProgressView() } }
                                }.scaleEffect(settings["mediaScale"].double / 100)
                            }
                            if !text.isEmpty {
                                highlightedText.font(tpFont(settings["fontFamily"].string, size: fittedFont(geometry.size)))
                                    .multilineTextAlignment(settings["textAlignment"].string == "left" ? .leading : settings["textAlignment"].string == "right" ? .trailing : .center)
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                                    .padding(12)
                                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(settings["textBoxEnabled"].bool ? dynamicColor("textBoxColor", rgb: "rgbTextBoxBorderEnabled", date: context.date) : .clear, lineWidth: 2))
                            }
                            if text.isEmpty && url == nil { Text("SEM CONTEÚDO NO TP/\(slot)").font(.headline).foregroundColor(HookTheme.muted) }
                        }
                    }.clipped().accessibilityIdentifier("vshook.tp.content")
                }
                decorations(top: false, date: context.date, size: viewportGeometry.size)
            }.padding(8).background(Color.black)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(settings["windowBorderEnabled"].bool ? dynamicColor("borderColor", rgb: "rgbWindowBorderEnabled", date: context.date) : .clear, lineWidth: 2))
        }
        }.overlay { TPNoticeOverlay(model: notice, settings: preferences.notice, slot: slot, base: session.base) }
    }
    @ViewBuilder private func decorations(top: Bool, date: Date, size: CGSize) -> some View {
        if !clear {
            let timerHere = settings["clockEnabled"].bool && settings["clockPosition"].string.hasSuffix(top ? "top" : "bottom")
            let localHere = settings["localClockEnabled"].bool && (settings["clockEnabled"].bool ? timerHere : top)
            if timerHere || localHere { clockRow(date, size: size, timer: timerHere, local: localHere) }
            if settings["songNameEnabled"].bool && settings["songNamePosition"].string == (top ? "top" : "bottom") { titleLine(nested.first("songName", "song", "currentSongName").string, prefix: "songName") }
            if settings["queueNameEnabled"].bool && settings["queueNamePosition"].string == (top ? "top" : "bottom") { titleLine(session.queueID.isEmpty ? "FILA DE ESPERA VAZIA" : session.song(withID: session.queueID).name, prefix: "queueName") }
            if settings["chordsEnabled"].bool && !chords.isEmpty && settings["chordPosition"].string == (top ? "top" : "bottom") {
                Text(chords).font(tpFont(settings["chordFontFamily"].string, size: min(70, settings["chordScale"].double)))
                    .foregroundColor(Color(hex: settings["chordColor"].string)).lineLimit(2).minimumScaleFactor(0.4).frame(maxWidth: .infinity).padding(6)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(dynamicColor("chordColor", rgb: "rgbChordBorderEnabled", date: date), lineWidth: 1))
            }
            if settings["progressEnabled"].bool && settings["progressPosition"].string == (top ? "top" : "bottom") {
                GeometryReader { geometry in Color(hex: settings["progressColor"].string).frame(width: geometry.size.width * itemProgress(date)) }.frame(height: 5).background(Color.white.opacity(0.1))
            }
        }
    }
    private func clockRow(_ date: Date, size: CGSize, timer: Bool, local: Bool) -> some View {
        let width = max(1, size.width - 16)
        let position = settings["clockPosition"].string
        let side = !position.hasPrefix("center")
        let font = max(size.height > size.width ? 15 : 18, min(width / 11, size.height / 8) * settings["clockScale"].double / 100)
        let height = max(28, font + (side && local ? 10 : 18))
        let timerWidth = min(width, max(118, ("-00 : 00 : 00" as NSString).size(withAttributes: [.font: UIFont(name: "Arial-BoldMT", size: font) ?? UIFont.boldSystemFont(ofSize: font)]).width + 36))
        return ZStack {
            if side && timer && local {
                HStack(spacing: 8) {
                    if position.hasPrefix("right") { localClock(date, font: font).frame(maxWidth: .infinity) }
                    clockText(date, font: font).frame(maxWidth: .infinity)
                    if position.hasPrefix("left") { localClock(date, font: font).frame(maxWidth: .infinity) }
                }
            } else {
                if timer { clockText(date, font: font).frame(width: timerWidth).frame(maxWidth: .infinity, alignment: .center) }
                if local {
                    let localWidth = timer ? max(0, (width - timerWidth) / 2 - 8) : width
                    let localFont = max(10, min(24, size.height / 28) * settings["localClockScale"].double / 100)
                    HStack {
                        if settings["localClockPosition"] == "right" { Spacer(minLength: 0) }
                        localClock(date, font: localFont).frame(maxWidth: localWidth, alignment: settings["localClockPosition"] == "right" ? .trailing : .leading).clipped()
                        if settings["localClockPosition"] != "right" { Spacer(minLength: 0) }
                    }.frame(maxHeight: .infinity, alignment: position.hasSuffix("bottom") ? .bottom : .top)
                }
            }
        }.frame(height: height).frame(maxWidth: .infinity)
    }
    private func clockText(_ date: Date, font: CGFloat) -> some View {
        Text(session.timerText(at: date)).font(.custom("Arial-BoldMT", size: font)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.3)
            .foregroundColor(Color(hex: settings[session.snapshot["timerDisplaySec"].double < 0 ? "clockExpiredColor" : "clockColor"].string)).padding(.horizontal, 10).padding(.vertical, 5)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(settings["clockBorderEnabled"].bool ? dynamicColor("clockBorderColor", rgb: "rgbClockBorderEnabled", date: date) : .clear, lineWidth: 2))
            .accessibilityIdentifier("vshook.tp.timer")
    }
    private func localClock(_ date: Date, font: CGFloat) -> some View {
        let components = Calendar.current.dateComponents([.hour, .minute, .second], from: date)
        return Text(String(format: "%02d:%02d:%02d", components.hour ?? 0, components.minute ?? 0, components.second ?? 0)).font(.custom("Arial-BoldMT", size: font)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.3)
            .foregroundColor(Color(hex: settings["localClockColor"].string)).padding(5)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(settings["localClockBorderEnabled"].bool ? dynamicColor("localClockBorderColor", rgb: "rgbClockBorderEnabled", date: date) : .clear, lineWidth: 1))
    }
    private func titleLine(_ text: String, prefix: String) -> some View {
        Text(text.uppercased()).font(tpFont(settings[prefix + "FontFamily"].string, size: (session.tablet ? 22 : 15) * settings[prefix + "Scale"].double / 100))
            .foregroundColor(Color(hex: settings[prefix + "Color"].string)).lineLimit(1).minimumScaleFactor(0.5).frame(maxWidth: .infinity)
    }
    private func dynamicColor(_ field: String, rgb: String, date: Date) -> Color {
        settings[rgb].bool ? Color(hue: date.timeIntervalSince1970.truncatingRemainder(dividingBy: 6) / 6, saturation: 0.9, brightness: 1) : Color(hex: settings[field].string)
    }
    private func itemProgress(_ date: Date) -> Double {
        let item = settings["progressMode"].string == "chords" ? session.snapshot["cifras"] : nested
        let start = item.first("progressStart", "itemStart").double, end = item.first("progressEnd", "itemEnd").double
        guard end > start else { return 0 }
        let pos = item["position"].exists ? item["position"].double : session.snapshot.first("playPosition", "position").double
        return min(1, max(0, (pos + (session.playing ? min(1, date.timeIntervalSince(session.lastUpdate)) : 0) - start) / (end - start)))
    }
    private var highlightedText: Text {
        let base = Color(hex: settings["textColor"].string)
        let highlight = Color(hex: session.snapshot["telepromptPreviewSettings"]["tp\(slot)"]["highlightColor"].string.isEmpty ? settings["highlightColor"].string : session.snapshot["telepromptPreviewSettings"]["tp\(slot)"]["highlightColor"].string)
        let chars = Array(text); var cursor = 0, result = Text("")
        while cursor < chars.count {
            if chars[cursor] == "*", cursor + 1 < chars.count, !chars[cursor + 1].isWhitespace,
               let closing = ((cursor + 1)..<chars.count).first(where: { chars[$0] == "*" && $0 > cursor + 1 && !chars[$0 - 1].isWhitespace }) {
                result = result + Text(String(chars[(cursor + 1)..<closing])).foregroundColor(highlight); cursor = closing + 1
            } else { result = result + Text(String(chars[cursor])).foregroundColor(base); cursor += 1 }
        }
        return result
    }
    private func fittedFont(_ size: CGSize) -> CGFloat {
        let width = max(10, size.width - 32), height = max(10, size.height - 32)
        var points = min(110, max(16, height / CGFloat(max(1, text.components(separatedBy: "\n").count)) / 1.15)) * settings["textScale"].double / 100
        while points > 9 {
            let rect = (text as NSString).boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: UIFont.boldSystemFont(ofSize: points)], context: nil)
            if rect.height <= height { break }; points -= 1
        }
        return points
    }
    private var previewActive: Bool {
        let raw = session.snapshot["telepromptPreview"].exists ? session.snapshot["telepromptPreview"] : nested.first("previewOverlay", "preview")
        let mode = raw.first("mode", "previewMode").exists ? raw.first("mode", "previewMode").int : session.snapshot["previewMode"].int
        return settings["previewEnabled"].bool && mode > 0 && raw.first("active", "enabled") != false && (raw.exists || session.snapshot["previewBlocks"].exists)
    }
    private var footer: some View {
        HStack(spacing: 5) {
            ForEach(controls.filter { preferences.control($0.0, tablet: session.tablet) }, id: \.0) { id,label in
                DirectorControl(title: id == "play" && session.playing ? "STOP" : label, background: Color(hex: controlActive(id) ? "15803D" : ["list","parts"].contains(id) ? "991B1B" : "172033"), height: 42, size: session.tablet ? 12 : 10) { controlAction(id) }.accessibilityIdentifier("vshook.tp.control." + id)
            }
        }
    }
    private var controls: [(String,String)] {
        session.readOnly ? [] : session.tablet ? [("play","PLAY"),("list","LIST"),("auto1","AUTO 1"),("auto2","AUTO 2"),("parts","PARTS"),("stopBreak","STOP BREAK")] : [("play","PLAY"),("list","LIST"),("auto1","AUTO 1"),("loop","LOOP"),("parts","PARTS")]
    }
    private func controlActive(_ id: String) -> Bool {
        switch id { case "list": return listOpen; case "parts": return partsOpen; case "auto1": return session.autoEnabled(1); case "auto2": return session.autoEnabled(2); case "play": return !session.playing; case "loop": return session.snapshot.first("loopEnabled","loopActive").bool; default: return false }
    }
    private func controlAction(_ id: String) {
        switch id {
        case "list": listOpen.toggle(); if listOpen && !session.tablet { partsOpen = false }
        case "parts": partsOpen.toggle(); if partsOpen && !session.tablet { listOpen = false }
        case "play": session.command("play_button")
        case "auto1": session.toggleAuto(1)
        case "auto2": session.toggleAuto(2)
        case "loop": session.toggleLoop()
        default: session.command("director_stop_break", session.target.merging(["noSeek": true,"preserveCursor":true,"stopBreak":true,"ignoreFadeout":true]))
        }
    }
}
func tpFont(_ name: String, size: CGFloat) -> Font {
    let names = ["arial":"Arial-BoldMT", "verdana":"Verdana-Bold", "tahoma":"Tahoma-Bold", "georgia":"Georgia-Bold", "trebuchet":"TrebuchetMS-Bold", "impact":"Impact", "mono":"CourierNewPS-BoldMT"]
    return names[name].map { Font.custom($0, size: size) } ?? .system(size: size, weight: .bold)
}
struct SyncedVideo: UIViewControllerRepresentable {
    let url: URL
    let time: Double
    let playing: Bool
    let rate: Double
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController(); controller.showsPlaybackControls = false; controller.videoGravity = .resizeAspect
        controller.player = AVPlayer(); controller.player?.isMuted = true; return controller
    }
    func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {
        guard let player = controller.player else { return }
        if context.coordinator.url != url {
            context.coordinator.url = url; player.replaceCurrentItem(with: AVPlayerItem(url: url))
        }
        let position = player.currentTime().seconds
        if !position.isFinite || abs(position - time) > 0.45 { player.seek(to: CMTime(seconds: max(0, time), preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: CMTime(seconds: 0.1, preferredTimescale: 600)) }
        if playing { player.rate = Float(min(4, max(0.1, rate))) } else { player.pause() }
    }
    static func dismantleUIViewController(_ controller: AVPlayerViewController, coordinator: Coordinator) { controller.player?.pause(); controller.player?.replaceCurrentItem(with: nil) }
    final class Coordinator { var url: URL? }
}
struct NativePDF: UIViewRepresentable {
    let url: URL
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> PDFView { let view = PDFView(); view.autoScales = true; view.backgroundColor = .black; return view }
    func updateUIView(_ view: PDFView, context: Context) {
        guard context.coordinator.url != url else { return }
        context.coordinator.url = url; context.coordinator.task?.cancel()
        context.coordinator.task = Task { @MainActor in
            do { let (data, _) = try await URLSession.shared.data(from: url); guard !Task.isCancelled else { return }; view.document = PDFDocument(data: data) } catch { }
        }
    }
    static func dismantleUIView(_ view: PDFView, coordinator: Coordinator) { coordinator.task?.cancel(); view.document = nil }
    final class Coordinator { var url: URL?; var task: Task<Void, Never>? }
}
