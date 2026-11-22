import Foundation
import AVFoundation
let root = FileManager.default.temporaryDirectory.appendingPathComponent("ipad-export-" + UUID().uuidString)
try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: root) }
let inputFormat = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!
let buffer = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: 24000)!
buffer.frameLength = 24000
for channel in 0..<2 { for frame in 0..<24000 { buffer.floatChannelData![channel][frame] = 0.3 * sin(Float(frame) * 0.081) } }
do { let file = try AVAudioFile(forWriting: root.appendingPathComponent("tone.wav"), settings: inputFormat.settings); try file.write(from: buffer) }
var project = Project.empty(name: "Exportação iPad")
var track = Track(id: UUID(), name: "Piano", role: .keys)
track.clips = [AudioClip(id: UUID(), name: "tone.wav", startTime: 0.1, duration: 0.5, audioFile: AudioFile(path: "tone.wav"))]
project.songs[0].tracks = [track]
let song = project.songs[0]
for format in AudioExportFormat.allCases {
    for rate in [44100.0, 48000.0] {
        for bits in format == .mp3 ? [24] : [16, 24, 32] {
            let folder = root.appendingPathComponent("\(format.rawValue)-\(Int(rate))-\(bits)")
            let encoding = AudioExportEncoding(format: format, bitDepth: bits, channels: 2, bitrate: 192, sampleRate: rate)
            let plan = AudioExportPlan(project: project, song: song, source: .master, bounds: .project,
                template: "%project", tracks: [], clips: [], regions: [], format: format)
            var final: AudioExportProgress?
            try OfflineAudioExport.run(project: project, song: song, plan: plan, mediaDirectory: root,
                outputDirectory: folder, sampleRate: rate, encoding: encoding, cancellation: AudioExportCancellation()) { final = $0 }
            let rendered = try AVAudioFile(forReading: folder.appendingPathComponent(plan.jobs[0].fileName))
            precondition(rendered.processingFormat.sampleRate == rate && rendered.processingFormat.channelCount == 2)
            if format != .mp3 { precondition(Int(rendered.fileFormat.streamDescription.pointee.mBitsPerChannel) == bits) }
            let pcm = AVAudioPCMBuffer(pcmFormat: rendered.processingFormat, frameCapacity: AVAudioFrameCount(rendered.length))!
            try rendered.read(into: pcm)
            let samples = Array(UnsafeBufferPointer(start: pcm.floatChannelData![0], count: Int(pcm.frameLength)))
            precondition(samples.contains { abs($0) > 0.25 }, "Exported audio remains audible")
            precondition(abs(Double(rendered.length) / rate - 0.6) < (format == .mp3 ? 0.07 : 0.0001), "Export preserves the project interval")
            precondition(final?.completed == 1 && final?.total == 1)
        }
    }
}
let token = AudioExportCancellation(), cancelledFolder = root.appendingPathComponent("cancelled")
let plan = AudioExportPlan(project: project, song: song, source: .master, bounds: .project,
    template: "%project", tracks: [], clips: [], regions: [])
do {
    try OfflineAudioExport.run(project: project, song: song, plan: plan, mediaDirectory: root, outputDirectory: cancelledFolder,
        sampleRate: 48000, cancellation: token) { _ in token.cancel() }
    preconditionFailure("Cancelled export must stop")
} catch is CancellationError {
    let remaining = try FileManager.default.contentsOfDirectory(atPath: cancelledFolder.path)
    precondition(remaining.isEmpty, "Cancellation removes temporary and partial output")
}
print("IPAD_AUDIO_EXPORT_WAV_AIFF_MP3_44100_48000_16_24_32_PCM_AND_CANCEL_OK")
