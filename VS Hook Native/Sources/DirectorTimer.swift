import SwiftUI

struct DirectorTimerDialog: View {
    @ObservedObject var session: HookSession
    let close: () -> Void
    @State private var field = 0
    @State private var digits = ["00", "05", "00"]
    @State private var caret = 0
    @State private var stop = false
    private var countdown: Bool { session.snapshot["timerMode"] == "countdown" }
    private var running: Bool { session.snapshot["timerRunning"].bool }
    private var auto: Bool { session.snapshot["timerInitAutoEnabled"].bool }
    private var target: Double { Double((Int(digits[0]) ?? 0) * 3600 + (Int(digits[1]) ?? 0) * 60 + (Int(digits[2]) ?? 0)) }
    var body: some View {
        VStack(spacing: 8) {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                Text("CRONÔMETRO").font(.custom("Arial-BoldMT", size: 18))
                TimelineView(.periodic(from: .now, by: 0.2)) { context in
                    Text(session.timerText(at: context.date)).font(.custom("Arial-BoldMT", size: 30)).monospacedDigit().foregroundColor(Color(hex: "86EFAC"))
                        .frame(maxWidth: .infinity).frame(height: 48).background(Color(hex: "05070B")).cornerRadius(6)
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "22C55E")))
                }
                if countdown {
                    HStack(spacing: 8) {
                        ForEach(0..<3) { index in
                            Button { field = index; caret = 0 } label: {
                                HStack { Text(["H", "M", "S"][index]); Spacer(); Text(digits[index]).font(.custom("Arial-BoldMT", size: 22)).monospacedDigit(); Spacer() }.padding(8).frame(height: 46)
                            }.buttonStyle(DirectorButtonStyle(border: Color(hex: field == index ? "FACC15" : "475569"))).accessibilityLabel(["Horas", "Minutos", "Segundos"][index]).accessibilityValue(digits[index])
                        }
                    }
                }
                HStack(spacing: 10) {
                    modeButton("PROGRESSIVO", mode: "progressive")
                    modeButton("REGRESSIVO", mode: "countdown")
                }
                if countdown {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 3), spacing: 5) {
                        ForEach(["1","2","3","4","5","6","7","8","9","LIMPAR","0","⌫"], id: \.self) { key in
                            DirectorControl(title: key, height: 32, size: 13) { edit(key) }.accessibilityIdentifier("vshook.timer.key." + key)
                        }
                    }
                }
                }
            }
                HStack(spacing: 10) {
                    DirectorControl(title: running ? "PARAR" : "INICIAR", background: Color(hex: running ? "DC2626" : "22C55E"), foreground: running ? .white : .black, height: 36, size: 11) {
                        if running { stop = true }
                        else { send("timer_start", running: true, seconds: countdown ? target : 0) }
                    }
                    DirectorControl(title: "INIT AUTO", background: Color(hex: auto ? "16A34A" : "B91C1C"), height: 36, size: 11) {
                        session.command("timer_set_init_auto", ["initAutoEnabled": .bool(!auto), "timerInitAutoEnabled": .bool(!auto), "enabled": .bool(!auto)], optimistic: ["timerInitAutoEnabled": .bool(!auto)])
                    }
                    DirectorControl(title: "FECHAR", height: 36, size: 11, action: close)
                }.padding(.top, 6)
        }.padding(12).background(Color(hex: "101827")).cornerRadius(6)
            .frame(idealHeight: countdown ? 412 : 201, maxHeight: countdown ? 412 : 201)
            .onAppear { let seconds = max(0, session.snapshot["timerTargetSec"].int); digits = [String(format: "%02d", seconds / 3600), String(format: "%02d", seconds % 3600 / 60), String(format: "%02d", seconds % 60)] }
            .alert("PARAR CRONÔMETRO?", isPresented: $stop) {
                Button("CANCELAR", role: .cancel) {}; Button("PARAR", role: .destructive) { send("timer_stop_reset", running: false, seconds: 0) }
            } message: { Text("O cronômetro será zerado.") }
    }
    private func modeButton(_ label: String, mode: String) -> some View {
        let active = countdown == (mode == "countdown")
        return DirectorControl(title: label, background: Color(hex: active ? "CA8A04" : "283140"), foreground: active ? .black : .white, height: 36) {
            let seconds = mode == "countdown" ? target : 0
            session.command("timer_set_mode", ["mode": .string(mode), "timerMode": .string(mode), "timerTargetSec": .number(target), "timerDisplaySec": .number(seconds), "timerAccumulatedSec": .number(seconds)], optimistic: ["timerMode": .string(mode), "timerDisplaySec": .number(seconds)])
        }
    }
    private func send(_ command: String, running: Bool, seconds: Double) {
        session.lastUpdate = Date()
        let payload: JSON = ["mode": session.snapshot["timerMode"], "timerMode": session.snapshot["timerMode"], "timerTargetSec": .number(target), "timerRunning": .bool(running), "running": .bool(running), "timerDisplaySec": .number(seconds), "timerAccumulatedSec": .number(seconds)]
        session.command(command, payload, optimistic: ["timerRunning": .bool(running), "timerDisplaySec": .number(seconds), "timerAccumulatedSec": .number(seconds)])
    }
    private func edit(_ key: String) {
        var chars = Array(digits[field])
        if key == "LIMPAR" { chars = ["0", "0"]; caret = 0 }
        else if key == "⌫" { if caret > 0 { caret -= 1; chars[caret] = "0" } }
        else if let char = key.first {
            if caret == 2 { chars = [chars[1], char] }
            else { chars[caret] = char; caret += 1 }
        }
        digits[field] = String(format: "%02d", min(field == 0 ? 99 : 59, Int(String(chars)) ?? 0))
        session.command("timer_set_target", ["timerTargetSec": .number(target), "targetSec": .number(target), "timerMode": "countdown"], optimistic: ["timerTargetSec": .number(target), "timerDisplaySec": .number(target)])
    }
}
