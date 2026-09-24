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
session.modules[0].reverb.enabled = true
session.modules[0].reverb.mixes = [0.12, 0.34, 0.56, 0.78]
session.modules[0].reverb.decays = [0.25, 0.5, 0.75, 1]
session.modules[0].delay.enabled = true
session.modules[0].delay.sync = true
session.modules[0].delay.division = 6
session.modules[0].delay.milliseconds = 1234
session.modules[6].delay.mix = 0.8
session.modules[0].reverb.select(2)
session.modules[6].reverb.mixes = [0.9, 0.8, 0.7, 0.6]
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
var reverb = session.modules[0].reverb
reverb.select(2)
reverb.setDecay(0.65)
expect(reverb.decays == [0.25, 0.5, 0.65, 1], "each IR has its own Decay")
expect(reverb.mixes == session.modules[0].reverb.mixes, "Decay does not alter Mix")
reverb.setDecay(.infinity)
expect(reverb.decay == 0.65, "non-finite Decay is ignored")
reverb.setDecay(0)
expect(reverb.decay == 0.1, "shortest tail is ten percent")
reverb.setDecay(2)
expect(reverb.decay == 1, "longest tail preserves the original IR")
invalid = session
invalid.modules[0].reverb.decays.removeLast()
rejects { try store.save(invalid) }
invalid = session
invalid.presets[95].modules?[6].reverb.decays[3] = .nan
rejects { try store.save(invalid) }
reverb.select(1)
expect(reverb.mix == 0.34, "selecting Room 2 restores its own mix")
reverb.setMix(0.45)
expect(reverb.mixes == [0.12, 0.45, 0.56, 0.78], "editing Mix changes only the selected IR")
reverb.enabled = false
reverb.enabled = true
expect(reverb.mix == 0.45, "bypass retains all mixes")
reverb.select(99)
expect(reverb.impulse == 1, "invalid IR selection is ignored")
reverb.setMix(.nan)
expect(reverb.mix == 0.45, "non-finite reverb mix is ignored")
reverb.setMix(2)
expect(reverb.mix == 1, "reverb mix clamps at 100 percent")
reverb.setMix(-1)
expect(reverb.mix == 0, "reverb mix clamps at zero")
invalid = session
invalid.modules[0].reverb.mixes.removeLast()
rejects { try store.save(invalid) }
invalid = session
invalid.modules[6].reverb.impulse = 4
rejects { try store.save(invalid) }
invalid = session
invalid.presets[95].modules?[7].reverb.mixes[0] = .infinity
rejects { try store.save(invalid) }
invalid = session
invalid.modules[0].reverb.mixes[1] = -0.1
rejects { try store.save(invalid) }
expect(try Data(contentsOf: store.sessionURL) == before, "invalid reverb cannot overwrite the valid session")
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
var delay = BronzeDelay()
delay.milliseconds = 990
delay.step(.milliseconds, direction: 1)
expect(delay.milliseconds == 1000, "Delay steps by 10 ms below 1k")
delay.step(.milliseconds, direction: 1)
expect(delay.milliseconds == 1100, "Delay steps by 100 ms above 1k")
delay.step(.milliseconds, direction: -1)
delay.step(.milliseconds, direction: -1)
expect(delay.milliseconds == 990, "Delay crosses 1k reversibly")
delay.sync = true
delay.step(.milliseconds, direction: 1)
delay.setNormalized(.milliseconds, 0)
expect(delay.milliseconds == 990, "Sync retains manual time and disables manual edits")
for (index, multiplier) in BronzeDelay.multipliers.enumerated() {
    delay.division = index
    expect(abs(delay.effectiveMilliseconds(bpm: 132.5) - 60000 / 132.5 * multiplier) < 0.000001,
        "Sync preserves fractional BPM in every division")
}
delay.sync = false
expect(delay.milliseconds == 990, "leaving Sync restores manual time")
delay.milliseconds = 2000
delay.division = 0
expect(delay.effectiveMilliseconds(bpm: 120) == 4000, "display matches the delay-line limit")
for parameter in BronzeDelayParameter.allCases {
    for value in [0.0, 0.2, 0.5, 0.9, 1.0] {
        delay.setNormalized(parameter, value)
        expect(abs(delay.normalized(parameter) - value) < 0.000001, "Delay knob round-trips")
    }
}
var tap = BronzeDelayTap()
expect(tap.tap(at: 10) == nil, "first tap only sets the origin")
expect(tap.tap(at: 10.5) == 500, "tap measures elapsed milliseconds")
expect(tap.tap(at: 20) == nil, "long pause resets the tap origin")
expect(tap.tap(at: 20.25) == 250, "tap resumes after a pause")
tap.reset()
expect(tap.tap(at: 21) == nil, "leaving Delay or switching Sync resets tap")
invalid = session
invalid.modules[0].delay.division = 7
rejects { try store.save(invalid) }
invalid = session
invalid.modules[6].delay.feedback = 1
rejects { try store.save(invalid) }
invalid = session
invalid.presets[95].modules?[0].delay.milliseconds = .nan
rejects { try store.save(invalid) }
expect(try Data(contentsOf: store.sessionURL) == before, "invalid Delay leaves the original session intact")
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
