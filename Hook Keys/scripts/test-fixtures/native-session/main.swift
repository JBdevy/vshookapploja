import Foundation

func expect(_ condition: Bool, _ message: String) {
    precondition(condition, message)
}
func rejects(_ body: () throws -> Void) {
    do { try body() } catch { return }
    preconditionFailure("Invalid data was accepted")
}

let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
defer { try? FileManager.default.removeItem(at: directory) }
let store = BronzeSessionStore(directory: directory)
expect(try store.load() == nil, "first launch is empty")
var session = BronzeNativeSession()
let key = UUID().uuidString + "/Grand Piano.sf2"
session.modules[0].soundFontKey = key
session.modules[0].enabled = true
session.modules[0].fader = 0.7
session.modules[0].envelope.releaseMs = 1234
session.modules[0].equalizer.enabled = true
session.modules[0].equalizer.bands[0].type = 0
session.modules[0].equalizer.bands[0].cutStages = 4
session.modules[0].equalizer.bands[2].gain = -9.5
session.modules[6].equalizer.enabled = true
session.modules[6].equalizer.bands[4].frequency = 8500
session.organDrawbars = [8, 7, 6, 5, 4, 3, 2, 1, 0]
session.organRotaryFast = true
session.organCabinetEnabled = false
session.soloModule = 0
session.tempo = 132.5
session.bank = 5
session.activePreset = 95
session.loopID = 3
session.padLow = 0.25
session.padHigh = 0.8
for index in 0..<96 {
    session.presets[index] = BronzePresetSlot(name: "Preset \(index)", color: index % 8, modules: session.modules)
}
try store.save(session)
let restored = try store.load()
expect(restored == session, "all 96 slots and current settings round-trip exactly")
let before = try Data(contentsOf: store.sessionURL)
var invalid = session
invalid.modules.removeLast()
rejects { try store.save(invalid) }
expect(try Data(contentsOf: store.sessionURL) == before, "invalid write preserves previous file")
invalid = session
invalid.modules[0].fader = .nan
rejects { try store.save(invalid) }
invalid = session
invalid.presets[0].modules?[0].envelope.releaseMs = -1
rejects { try store.save(invalid) }
invalid = session
invalid.activePreset = 96
rejects { try store.save(invalid) }
invalid = session
invalid.presets[0].color = 8
rejects { try store.save(invalid) }
invalid = session
invalid.modules[0].equalizer.bands.removeLast()
rejects { try store.save(invalid) }
invalid = session
invalid.modules[0].equalizer.bands[0].quality = .infinity
rejects { try store.save(invalid) }
invalid = session
invalid.presets[95].modules?[6].equalizer.bands[0].type = 5
rejects { try store.save(invalid) }
invalid = session
invalid.modules[0].equalizer.bands[0].cutStages = 9
rejects { try store.save(invalid) }
var band = BronzeEQBand(frequency: 990)
band.step(.frequency, direction: 1)
expect(band.frequency == 1000, "below 1k, frequency step is 10 Hz")
band.step(.frequency, direction: 1)
expect(band.frequency == 1100, "above 1k, frequency step is 100 Hz")
band.step(.frequency, direction: -1)
band.step(.frequency, direction: -1)
expect(band.frequency == 990, "frequency steps cross 1k reversibly")
for parameter in BronzeEQParameter.allCases {
    for value in [0.0, 0.2, 0.5, 0.9, 1.0] {
        band.setNormalized(parameter, value)
        expect(abs(band.normalized(parameter) - value) < 0.000001, "EQ knob round-trips normalized values")
    }
}
band.setNormalized(.gain, 2)
expect(band.gain == 24, "EQ gain clamps to upper limit")
band.setNormalized(.gain, .nan)
expect(band.gain == 24, "non-finite knob input is ignored")
for key in ["../../outside.sf2", "/tmp/file.sf2", "x/file.sf2", UUID().uuidString + "/../file.sf2", UUID().uuidString + "\\file.sf2"] {
    rejects { _ = try store.soundFontURL(for: key) }
}
let relocated = BronzeSessionStore(directory: directory.appendingPathComponent("new-container"))
let url = try relocated.soundFontURL(for: key)
expect(url.path.hasPrefix(relocated.soundFontDirectory.path + "/"), "relative SF2 keys follow the new sandbox")
let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(session)) as! [String: Any]
let presets = encoded["presets"] as! [[String: Any]]
expect(presets[0]["organDrawbars"] == nil && presets[0]["organRotaryFast"] == nil,
    "organ performance state must not be saved per preset")
expect(encoded["loopPlaying"] == nil && encoded["activePad"] == nil && encoded["metronomeEnabled"] == nil,
    "restoring a session must not trigger playback")
try Data("invalid-json".utf8).write(to: store.sessionURL)
rejects { _ = try store.load() }
expect(try String(contentsOf: store.sessionURL, encoding: .utf8) == "invalid-json", "corrupt original is not overwritten")
print("NATIVE_SESSION_OK: 96 presets, global B3, relative paths, validation and atomic persistence")
