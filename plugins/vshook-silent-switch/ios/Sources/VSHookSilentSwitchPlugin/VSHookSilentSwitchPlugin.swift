import Foundation
import AudioToolbox
import Capacitor

/// Le a chavinha de silencioso do iPhone.
///
/// O iOS nao expoe esse estado por API publica, entao usamos a tecnica aceita
/// pela App Store: tocar um som de sistema mudo de 0,2 s e medir quanto tempo
/// o callback demora. Com o aparelho no silencioso o audio nao chega a tocar e
/// a resposta volta quase instantanea; com o som liberado ela demora a duracao
/// do arquivo. Nada de API privada.
///
/// O arquivo de silencio e gravado na pasta temporaria na primeira consulta,
/// assim o plugin nao precisa carregar recurso dentro do bundle.
@objc(VSHookSilentSwitchPlugin)
public class VSHookSilentSwitchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VSHookSilentSwitchPlugin"
    public let jsName = "VSHookSilentSwitch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise)
    ]

    private static let silenceSeconds = 0.2
    // Metade da duracao separa com folga o "nao tocou" do "tocou inteiro".
    private static let mutedThreshold = 0.1

    private var soundID: SystemSoundID = 0
    private var startedAt: CFAbsoluteTime = 0
    private let lock = NSLock()

    @objc func getStatus(_ call: CAPPluginCall) {
        guard prepareSilentSound() else {
            call.resolve(["mode": "normal", "supported": false])
            return
        }
        lock.lock()
        startedAt = CFAbsoluteTimeGetCurrent()
        lock.unlock()
        AudioServicesPlaySystemSoundWithCompletion(soundID) { [weak self] in
            guard let self = self else {
                call.resolve(["mode": "normal", "supported": false])
                return
            }
            self.lock.lock()
            let elapsed = CFAbsoluteTimeGetCurrent() - self.startedAt
            self.lock.unlock()
            let muted = elapsed < VSHookSilentSwitchPlugin.mutedThreshold
            // No silencioso o usuario pediu silencio: nem som nem vibracao.
            call.resolve(["mode": muted ? "silent" : "normal", "supported": true])
        }
    }

    private func prepareSilentSound() -> Bool {
        if soundID != 0 { return true }
        guard let url = writeSilenceFile() else { return false }
        var created: SystemSoundID = 0
        guard AudioServicesCreateSystemSoundID(url as CFURL, &created) == kAudioServicesNoError else {
            return false
        }
        soundID = created
        return true
    }

    private func writeSilenceFile() -> URL? {
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("vshook-silence.wav")
        if FileManager.default.fileExists(atPath: url.path) { return url }

        let sampleRate = 44100
        let frames = Int(Double(sampleRate) * VSHookSilentSwitchPlugin.silenceSeconds)
        let dataBytes = frames * 2 // mono, 16 bits
        var wav = Data()

        func append(_ text: String) { wav.append(contentsOf: Array(text.utf8)) }
        func append32(_ value: UInt32) { withUnsafeBytes(of: value.littleEndian) { wav.append(contentsOf: $0) } }
        func append16(_ value: UInt16) { withUnsafeBytes(of: value.littleEndian) { wav.append(contentsOf: $0) } }

        append("RIFF")
        append32(UInt32(36 + dataBytes))
        append("WAVE")
        append("fmt ")
        append32(16)                       // tamanho do bloco fmt
        append16(1)                        // PCM
        append16(1)                        // canais
        append32(UInt32(sampleRate))
        append32(UInt32(sampleRate * 2))   // bytes por segundo
        append16(2)                        // alinhamento do bloco
        append16(16)                       // bits por amostra
        append("data")
        append32(UInt32(dataBytes))
        wav.append(Data(count: dataBytes)) // silencio puro

        do {
            try wav.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }
}
