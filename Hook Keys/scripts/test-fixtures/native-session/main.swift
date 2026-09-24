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
