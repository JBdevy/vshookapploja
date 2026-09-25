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
var arp = BronzeArpeggiator()
arp.enabled = true
arp.mode = 4
arp.octaves = 4
arp.autoFaderEnabled = true
expect(arp.autoFaderBeats(numerator: 4, denominator: 4) == 4, "Auto Fader 1/1 follows whole measure")
arp.autoFaderHalf = true
expect(arp.autoFaderBeats(numerator: 4, denominator: 4) == 2, "Auto Fader 1/2 follows half measure")
expect(arp.autoFaderBeats(numerator: 6, denominator: 8) == 1.5, "Auto Fader follows 6/8 from metronome")
arp.sync = false; arp.rateMs = 1000
expect(arp.beatMultiplier(bpm: 132.5) == 132.5 / 60, "free arp rate preserves fractional BPM")
var arpSession = session
arpSession.modules[0].arpeggiator = arp
try arpSession.validate()
expect(try JSONDecoder().decode(BronzeNativeSession.self, from: JSONEncoder().encode(arpSession)) == arpSession,
       "arp parameters round-trip")
rejects { try arp.validate(moduleIndex: 6) }
arp.gate = .nan
rejects { try arp.validate(moduleIndex: 0) }
var performance = BronzeModulePerformance.initial(6)
expect(performance.modulationMode == 4, "B3 starts with Wheel Rotary")
performance = BronzeModulePerformance.initial(0)
performance.input = -1; performance.octave = -3; performance.lowNote = 25; performance.highNote = 110
performance.outputStart = 30; performance.outputCount = 2; performance.glideSync = true
performance.velocityCurve = [1, 20, 40, 90, 126]
expect(performance.glideTime(bpm: 120) == 500, "Glide Sync is one beat")
try performance.validate()
var tone = BronzeTone()
tone.enabled = true; tone.type = 3; tone[.cutoff] = 1200; tone[.gain] = -36
tone.envelopeEnabled = true; tone[.depth] = 8
try tone.validate(moduleIndex: 0)
rejects { try tone.validate(moduleIndex: 6) }
var toneSession = session
toneSession.modules[0].performance = performance
toneSession.modules[0].tone = tone
expect(try JSONDecoder().decode(BronzeNativeSession.self, from: JSONEncoder().encode(toneSession)) == toneSession,
       "routing, velocity, glide and filter parameters round-trip")
tone[.gain] = .infinity
rejects { try tone.validate(moduleIndex: 0) }
performance.outputStart = 31
rejects { try performance.validate() }
performance.outputStart = 30; performance.lowNote = 111
rejects { try performance.validate() }
arp.gate = 0.72; arp.mode = 5
rejects { try arp.validate(moduleIndex: 0) }
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
invalid.presets[0].color = 16
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
var pulse = BronzePulse()
try pulse.validate()
expect(pulse.measureBeats(numerator: 6, denominator: 8) == 3, "Pulse sync follows 6/8")
expect(pulse.measureBeats(numerator: 4, denominator: 4) == 4, "Pulse sync follows 4/4")
for (division, multiplier) in BronzePulse.multipliers.enumerated() {
    pulse.division = division
    expect(pulse.beatMultiplier(bpm: 132.5) == multiplier, "Pulse has all eight sync divisions")
}
pulse.sync = false
for bpm in [60.0, 132.5, 300.0] {
    for rate in [20.0, 125.0, 2000.0] {
        pulse.rateMs = rate
        expect(abs(pulse.beatMultiplier(bpm: bpm) * 60000 / bpm - rate) < 0.000001,
            "free Pulse retains milliseconds at every BPM")
    }
}
expect(pulse.measureBeats(numerator: 6, denominator: 8) == 0, "free Pulse does not reset at bar boundaries")
invalid = session
invalid.modules[6].pulse = pulse
let pulseRoundTrip = try JSONDecoder().decode(BronzeNativeSession.self, from: JSONEncoder().encode(invalid))
expect(pulseRoundTrip.modules[6].pulse == pulse, "Pulse works on B3 and survives session encoding")
invalid.modules[6].pulse?.steps = -1
rejects { try store.save(invalid) }
pulse.division = 8
rejects { try pulse.validate() }
var synth = BronzeSynth()
try synth.validate()
synth.oscillators[0].shape = 3
synth.oscillators[1].volume = 0
synth.oscillators[2].octave = -3
synth.oscillators[2].detune = -99
synth.lfoTarget = 2
synth.glide = 1100
invalid = session
invalid.modules[7].synth = synth
let synthRoundTrip = try JSONDecoder().decode(BronzeNativeSession.self, from: JSONEncoder().encode(invalid))
expect(synthRoundTrip.modules[7].synth == synth, "synth oscillators and modulation survive session encoding")
invalid.modules[0].synth = synth
rejects { try store.save(invalid) }
for parameter in BronzeSynthParameter.allCases {
    let spec = parameter.definition
    for n in [0.0, 0.2, 0.5, 0.9, 1.0] {
        expect(abs(spec.normalized(spec.value(n)) - n) < 0.000001, "synth knob round-trips")
    }
}
synth.oscillators.removeLast()
rejects { try synth.validate() }
synth = BronzeSynth()
synth.cutoff = .infinity
rejects { try synth.validate() }
synth = BronzeSynth()
synth.oscillators[0].octave = 4
rejects { try synth.validate() }
for kind in BronzeProcessorKind.allCases {
    let processor = BronzeProcessor(kind)
    try processor.validate(kind)
    for parameter in kind.parameters {
        for n in [0.0, 0.2, 0.5, 0.9, 1.0] {
            expect(abs(parameter.normalized(parameter.value(n)) - n) < 0.000001, "processor knob round-trips")
        }
        expect(parameter.value(-1) == parameter.minimum, "processor clamp minimum")
        expect(abs(parameter.value(2) - parameter.maximum) < 0.000001, "processor clamp maximum")
    }
}
var processors = BronzeSoundEffects()
processors.vibes.enabled = true
processors.vibes.vinylEnabled = false
processors.vibes.values = [2, 1, -36]
try processors.validate(moduleIndex: 7)
rejects { try processors.validate(moduleIndex: 6) }
invalid = session
invalid.modules[0].soundEffects = processors
let processorRoundTrip = try JSONDecoder().decode(BronzeNativeSession.self, from: JSONEncoder().encode(invalid))
expect(processorRoundTrip.modules[0].soundEffects == processors, "processor values survive session encoding")
invalid.modules[0].soundEffects?.vibes.values[0] = .nan
rejects { try store.save(invalid) }
invalid = session
invalid.modules[6].soundEffects = processors
rejects { try store.save(invalid) }
processors.vibes.enabled = false
processors.compressor.enabled = true
rejects { try processors.validate(moduleIndex: 6) }
processors = BronzeSoundEffects()
processors.chorus.values.removeLast()
rejects { try processors.validate(moduleIndex: 0) }
expect(try Data(contentsOf: store.sessionURL) == before, "invalid processor leaves saved session intact")
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
let catalogPayload: [String: Any] = ["revision": 9, "categories": [
    ["id": "later", "name": "Later", "order": 2, "visibleModule": 8, "sounds": []],
    ["id": "piano", "name": "Pianos", "order": 1, "visibleModule": NSNull(), "sounds": [
        ["id": "grand", "name": "Grand", "sf2ObjectKey": "sounds/grand.sf2", "order": 2, "byteSize": 700000],
        ["id": "bright", "name": "Bright", "sf2ObjectKey": "", "sf2Url": "https://example.com/bright.sf2", "order": 1,
         "assetVersion": 3, "sha256": String(repeating: "AB", count: 32)],
        ["id": "soft", "name": "Soft", "sf2ObjectKey": "sounds/soft.sf2", "order": 1]
    ]]
]]
func parseCatalogFixture(_ object: [String: Any]) throws -> [BronzeCatalogCategory] {
    try BronzeNativeCatalog.parse(JSONSerialization.data(withJSONObject: object))
}
let catalog = try parseCatalogFixture(catalogPayload)
expect(catalog.map(\.id) == ["piano", "later"], "category order follows backend")
expect(catalog[0].sounds.map(\.id) == ["bright", "soft", "grand"], "sound order is stable for ties")
expect(catalog[0].visibleModule == nil && catalog[1].visibleModule == 8, "module visibility follows backend schema")
expect(catalog[0].sounds[0].objectKey == "https://example.com/bright.sf2", "empty object key falls back to URL")
expect(catalog[0].sounds[0].sha256 == String(repeating: "ab", count: 32), "hash normalized for verification")
expect(catalog[0].sounds[2].version == 9, "asset version falls back to catalog revision")
expect(catalog[0].sounds[0].version == 3, "explicit asset version retained")
let installedCatalogSound = catalog[0].sounds[2]
let catalogInstall = BronzeCatalogInstall(version: 9, objectKey: installedCatalogSound.objectKey)
expect(catalogInstall.matches(installedCatalogSound), "matching installed asset does not need download")
expect(!BronzeCatalogInstall(version: 8, objectKey: installedCatalogSound.objectKey).matches(installedCatalogSound), "updated version needs download")
expect(!BronzeCatalogInstall(version: 9, objectKey: "other.sf2").matches(installedCatalogSound), "replaced object needs download")
let oneSound: [String: Any] = ["id": "one", "name": "One", "sf2ObjectKey": "one.sf2"]
func catalogWithSounds(_ sounds: [[String: Any]]) -> [String: Any] {
    ["categories": [["id": "piano", "name": "Piano", "sounds": sounds]]]
}
rejects { _ = try parseCatalogFixture(catalogWithSounds([oneSound, oneSound])) }
rejects { _ = try parseCatalogFixture(["categories": [
    ["id": "repeat", "name": "One", "sounds": []], ["id": "repeat", "name": "Two", "sounds": []]]]) }
let invalidCatalogFields: [[String: Any]] = [["assetVersion": true], ["assetVersion": 2.5], ["byteSize": -1], ["sha256": "invalid"], ["name": ""], ["order": 0]]
for change in invalidCatalogFields {
    var badSound = oneSound
    for (key, value) in change { badSound[key] = value }
    rejects { _ = try parseCatalogFixture(catalogWithSounds([badSound])) }
}
rejects { _ = try parseCatalogFixture(["categories": [["id": "one", "name": "One", "visibleModule": 9, "sounds": []]]]) }
expect(try parseCatalogFixture(["categories": [["id": "empty", "name": "Empty"]]])[0].sounds.isEmpty, "empty category without sounds is accepted")

var workspace = BronzeUserWorkspace()
workspace.catalogDownloads = [installedCatalogSound.id: key]
workspace.catalogInstalls = [installedCatalogSound.id: catalogInstall]
workspace.synthPresets[3] = BronzeSynthPreset(name: "Lead", sound: BronzeSynth(), envelope: BronzeEnvelope(), color: 4)
workspace.activeSynthPreset = 3
let mediaDirectory = directory.appendingPathComponent("MediaFixture", isDirectory: true)
try FileManager.default.createDirectory(at: mediaDirectory, withIntermediateDirectories: true)
let originalAudio = mediaDirectory.appendingPathComponent("Beat.wav")
try Data(repeating: 37, count: 700_000).write(to: originalAudio)
let mediaStore = BronzeUserMediaStore(session: store)
let mediaKey = try mediaStore.importFile(originalAudio)
expect(try Data(contentsOf: mediaStore.url(mediaKey)) == Data(contentsOf: originalAudio), "audio copied without editing original")
let track = BronzeUserTrack(name: "Beat", key: mediaKey)
let list = BronzeUserPlaylist(name: "My loops", isLoop: true, tracks: [track])
workspace.playlists = [list]; workspace.selectedPlaylist = list.id; workspace.selectedTrack = track.id
workspace.fxBanks[1].pads[0] = BronzeUserFX(name: "FX test", key: mediaKey, gainDb: -18, color: 5)
try workspace.validate()
var invalidWorkspace = workspace
invalidWorkspace.catalogDownloads = [:]
rejects { try invalidWorkspace.validate() }
invalidWorkspace = workspace
invalidWorkspace.fxBanks[0].name = "Renamed Church"
rejects { try invalidWorkspace.validate() }
invalidWorkspace = workspace; invalidWorkspace.playlists[0].repeatEnabled = true
rejects { try invalidWorkspace.validate() }
invalidWorkspace = workspace; invalidWorkspace.playlists[0].tracks.append(track)
rejects { try invalidWorkspace.validate() }
invalidWorkspace = workspace; invalidWorkspace.selectedTrack = UUID()
rejects { try invalidWorkspace.validate() }
for badKey in ["../escape.wav", UUID().uuidString + "/../../escape.wav", UUID().uuidString + "/evil.exe", "/abs.wav"] {
    rejects { _ = try mediaStore.url(badKey) }
}
var workspaceSession = session
workspaceSession.workspace = workspace
try store.save(workspaceSession)
expect(try store.load() == workspaceSession, "workspace and session round-trip without Apple-only frameworks")
print("NATIVE_SESSION_OK: presets, playlists, FX, relative assets and invalid session rejection")

// CryptoKit is provided by the Apple SDK. The Android/Linux job still executes
// all Foundation checks above; macOS CI must compile and run the backup below.
#if os(macOS)
var backedUp = session
backedUp.workspace = workspace
let font = try store.soundFontURL(for: key)
try FileManager.default.createDirectory(at: font.deletingLastPathComponent(), withIntermediateDirectories: true)
try Data("RIFFsf2fixture".utf8).write(to: font)
try store.save(backedUp)
let backup = directory.appendingPathComponent("UserBK_Test.bkbackup")
expect(BronzeNativeBackup.fileName(user: "João / Test:*") == "UserBK_João  Test.bkbackup", "backup sanitizes user name")
try BronzeNativeBackup.export(session: backedUp, store: store, destination: backup)
let staged = try BronzeNativeBackup.stage(backup)
defer { try? FileManager.default.removeItem(at: staged.directory) }
expect(try staged.load() == backedUp, "complete native session round-trips through backup")
expect(try Data(contentsOf: staged.soundFontURL(for: key)) == Data(contentsOf: font), "backup contains actual SF2 bytes")
expect(try Data(contentsOf: BronzeUserMediaStore(session: staged).url(mediaKey)) == Data(contentsOf: originalAudio), "backup contains actual media bytes")
let destination = BronzeSessionStore(directory: directory.appendingPathComponent("Restored"))
try BronzeNativeBackup.installAssets(from: staged, into: destination)
try BronzeNativeBackup.installAssets(from: staged, into: destination)
expect(try Data(contentsOf: destination.soundFontURL(for: key)) == Data(contentsOf: font), "matching immutable assets can be restored twice")
try Data("existing different SF2".utf8).write(to: destination.soundFontURL(for: key))
rejects { try BronzeNativeBackup.installAssets(from: staged, into: destination) }
expect(try String(contentsOf: destination.soundFontURL(for: key), encoding: .utf8) == "existing different SF2", "restore never overwrites conflicting user files")
let archiveBytes = try Data(contentsOf: backup)
let broken = directory.appendingPathComponent("broken.bkbackup")
var corruptArchive = archiveBytes
corruptArchive[corruptArchive.count - 1] ^= 1
try corruptArchive.write(to: broken)
rejects { _ = try BronzeNativeBackup.stage(broken) }
try archiveBytes.prefix(20).write(to: broken)
rejects { _ = try BronzeNativeBackup.stage(broken) }
var trailing = archiveBytes; trailing.append(0)
try trailing.write(to: broken)
rejects { _ = try BronzeNativeBackup.stage(broken) }
expect(try store.load() == backedUp, "corrupt and truncated backups leave live session intact")
print("NATIVE_BACKUP_OK: streaming backup, asset restoration and corruption rejection")
#endif

// New native mixer settings survive backup/session encoding; older sessions omit them.
var mixerWorkspace = BronzeUserWorkspace()
var mixer = BronzeMixerSettings()
mixer.levels = [0, 0.25, 0.5, 0.75, 1]
mixer.enabled = [false, true, false, true, true]
mixer.octave = -2; mixer.transpose = 7; mixer.mono = true
mixerWorkspace.mixer = mixer
try mixerWorkspace.validate()
expect(try JSONDecoder().decode(BronzeUserWorkspace.self, from: JSONEncoder().encode(mixerWorkspace)) == mixerWorkspace,
       "mixer gains, mute, octave, transpose and mono round-trip")
var badMixer = mixer
badMixer.levels[0] = .nan
rejects { try badMixer.validate() }
badMixer = mixer; badMixer.transpose = 13
rejects { try badMixer.validate() }
badMixer = mixer; badMixer.enabled.removeLast()
rejects { try badMixer.validate() }
let oldWorkspaceData = try JSONEncoder().encode(BronzeUserWorkspace())
expect(try JSONDecoder().decode(BronzeUserWorkspace.self, from: oldWorkspaceData).mixer == nil,
       "legacy workspace retains default mixer")

var rotarySession = session
rotarySession.organRotary = BronzeOrganRotary(speed: 0, slowHz: 0.8, fastHz: 6.4, rampSeconds: 2.5, depth: 0.7)
try rotarySession.validate()
expect(try JSONDecoder().decode(BronzeNativeSession.self, from: JSONEncoder().encode(rotarySession)) == rotarySession,
       "Organ Brake, speeds, acceleration and depth survive session encoding")
var invalidRotary = BronzeOrganRotary(); invalidRotary.depth = .nan
rejects { try invalidRotary.validate() }
invalidRotary = BronzeOrganRotary(); invalidRotary.speed = 3
rejects { try invalidRotary.validate() }
expect(try JSONDecoder().decode(BronzeNativeSession.self, from: JSONEncoder().encode(session)).organRotary == nil,
       "older sessions keep their original Rotary defaults")

let flatBand = BronzeEQBand()
expect(abs(flatBand.responseDb(at: 1000)) < 0.0001, "flat EQ graph remains at zero dB")
let peakBand = BronzeEQBand(frequency: 1000, gain: 9)
expect(abs(peakBand.responseDb(at: 1000) - 9) < 0.0001, "EQ graph matches peaking gain at its center")
let cutBand = BronzeEQBand(type: 0, frequency: 1000, cutStages: 8)
expect(cutBand.responseDb(at: 500) == -240 && cutBand.responseDb(at: 2000) == 0, "brickwall graph follows cutoff direction")

// The optional sidebar data must preserve older sessions and block ordering.
expect(try JSONDecoder().decode(BronzeUserWorkspace.self, from: oldWorkspaceData).playlistSidebar == nil, "legacy sidebar remains optional")
var sidebarWorkspace = BronzeUserWorkspace()
let sidebarBlock = BronzePlaylistBlock(scope: "all", name: "Bloco 1")
sidebarWorkspace.playlistSidebar = BronzePlaylistSidebarSettings(scope: "all", repeatEnabled: true, autoAdvance: true, blocks: [sidebarBlock], order: ["all": [sidebarBlock.id.uuidString]])
try sidebarWorkspace.validate()
expect(try JSONDecoder().decode(BronzeUserWorkspace.self, from: JSONEncoder().encode(sidebarWorkspace)) == sidebarWorkspace, "sidebar blocks, order and playback options round trip")
sidebarWorkspace.playlistSidebar?.blocks.append(sidebarBlock)
rejects { try sidebarWorkspace.validate() }
print("NATIVE_PLAYLIST_SIDEBAR_OK")

var currentWorkspace = BronzeUserWorkspace()
expect(currentWorkspace.fxBanks[0].pads.map(\.name) == BronzeUserWorkspace.churchNames, "Church factory names")
currentWorkspace.fxBanks[0].pads[1].name = "FX 2"
currentWorkspace.fxBanks[0].pads[2].name = "Personalizado"
currentWorkspace.restoreChurchNames()
expect(currentWorkspace.fxBanks[0].pads[1].name == "Bump", "migrate legacy FX names")
expect(currentWorkspace.fxBanks[0].pads[2].name == "Personalizado", "keep user FX names")
expect(currentWorkspace.fxBanks[0].pads[0].mode(bank: 0) == 0, "Church infinite gate")
expect(currentWorkspace.fxBanks[1].pads[0].mode(bank: 1) == 1, "custom banks toggle")
currentWorkspace.fxBanks[1].pads[0].triggerMode = "gate"
currentWorkspace.fxBanks[1].pads[0].gateRelease = "continue-press"
expect(currentWorkspace.fxBanks[1].pads[0].mode(bank: 1) == 2, "custom gate release")
try currentWorkspace.validate()
expect(try JSONDecoder().decode(BronzeUserWorkspace.self, from: JSONEncoder().encode(currentWorkspace)) == currentWorkspace, "FX mode persistence")
var moduleWithUser = BronzeModuleSnapshot()
moduleWithUser.envelope.attackMs = 456
moduleWithUser.performance = BronzeModulePerformance(input: 2)
let userParameters = BronzeModuleSettings(moduleWithUser)
var defaultParameters = BronzeModuleSettings(BronzeModuleSnapshot())
defaultParameters.performance = BronzeModulePerformance(input: 0)
let resetModule = defaultParameters.applying(to: moduleWithUser)
expect(resetModule.envelope.attackMs == 0 && resetModule.performance?.input == 2, "Default preserves MIDI routing")
expect(userParameters.applying(to: resetModule).envelope.attackMs == 456, "User restores configured envelope")
try userParameters.validate(index: 0)
print("NATIVE_FX_AND_SETTINGS_OK")

let defaultsCatalog = Data(#"{"categories":[{"id":"pianos","name":"Pianos","defaultSettings":{"modules1To6":{"attackMs":12,"reverb":{"mix":35}}},"sounds":[{"id":"grand","name":"Grand","sf2ObjectKey":"test/grand.sf2","moduleSettings":{"modules1To6":{"releaseMs":900,"reverb":{"enabled":false}}}}]}],"defaultSettings":{"modules1To6":{"attackMs":5,"reverb":{"enabled":true,"mix":50}}}}"#.utf8)
let defaultSound = try BronzeNativeCatalog.parse(defaultsCatalog)[0].sounds[0]
let catalogParameters = defaultSound.nativeDefaults(moduleIndex: 0)
expect(catalogParameters.envelope.attackMs == 12 && catalogParameters.envelope.releaseMs == 900, "catalog/category/sound defaults merge")
expect(!catalogParameters.reverb.enabled && catalogParameters.reverb.mix == 0.35, "nested defaults merge without discarding siblings")
try catalogParameters.validate(index: 0)
print("NATIVE_CATALOG_DEFAULTS_OK")

// Velocity editor memories remain optional for older sessions and validate independently.
var curveSettings = BronzeModulePerformance()
curveSettings.velocityMode = 4
curveSettings.velocityUserCurve = [0, 20, 70, 100, 127]
curveSettings.velocityFixedValue = 93
try curveSettings.validate()
expect(try JSONDecoder().decode(BronzeModulePerformance.self, from: JSONEncoder().encode(curveSettings)) == curveSettings, "velocity editor memories round trip")
curveSettings.velocityUserCurve = [0, 1]
rejects { try curveSettings.validate() }
curveSettings.velocityUserCurve = nil
curveSettings.velocityMode = 5
rejects { try curveSettings.validate() }
for channels in [1, 2, 3, 8, 32] {
    let routes = BronzeAudioRouteOption.available(channels: channels)
    expect(routes.filter { $0.count == 1 }.count == channels, "every connected mono channel is selectable")
    expect(routes.filter { $0.count == 2 }.count == channels / 2, "only connected stereo pairs are selectable")
    expect(routes.allSatisfy { $0.start >= 0 && $0.start + $0.count <= channels }, "no route exceeds connected channels")
}
for index in 0..<5 {
    let factory = BronzeSynthPreset.factory(index)!
    try factory.sound!.validate(); try factory.envelope.validate()
    expect(factory.sound!.oscillators.count == 3, "factory synth retains three oscillators")
}
expect(BronzeSynthPreset.factory(5) == nil, "only five factory slots")
expect(BronzeSynthPreset.factory(2)!.sound!.mode == 2, "third synth factory preset uses legato")
expect(BronzeSynthPreset.factory(4)!.sound!.oscillators[1].enabled == false, "fifth factory preset disables second oscillator")
print("NATIVE_CONTROL_LAYOUT_DATA_OK")
