import XCTest
final class VisualTests: XCTestCase {
    private func start() -> XCUIApplication {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .landscapeRight
        let app = XCUIApplication(bundleIdentifier: "com.hookdeveloper.hookkeys")
        app.launchEnvironment["BRONZE_UI_TEST"] = "1"
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["bronze.logo"].waitForExistence(timeout: 60))
        XCUIDevice.shared.orientation = .landscapeLeft
        Thread.sleep(forTimeInterval: 3)
        return app
    }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    func testConfigurationFits() throws {
        let app = start()
        app.buttons["Config"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Envelope"].waitForExistence(timeout: 5))
        for title in ["Envelope", "EQ", "Compressor", "Chorus", "Vibes", "Reverb", "Delay", "Arpeggiator", "Pulse"] {
            let button = app.buttons[title].firstMatch
            XCTAssertTrue(button.isHittable, title)
            button.tap()
            Thread.sleep(forTimeInterval: 0.4)
            capture("config-" + title)
            XCTAssertTrue(app.buttons["Voltar"].isHittable)
            XCTAssertEqual(app.scrollViews.count, 0, "Config must fit without vertical scrolling")
        }
        app.buttons["Voltar"].tap()
        app.buttons["Configurações"].tap()
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Dispositivos MIDI")).firstMatch.tap()
        capture("midi")
        app.buttons["bronze.settings.back"].tap()
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Dispositivo de áudio")).firstMatch.tap()
        capture("audio")
    }
    func testPerformanceTapsAndHolds() throws {
        let app = start()
        let keyboard = app.buttons["bronze.keyboard.toggle"]
        let before = keyboard.label
        keyboard.tap()
        XCTAssertNotEqual(keyboard.label, before)
        keyboard.tap()
        XCTAssertEqual(keyboard.label, before)
        let range = keyboard.value as? String
        keyboard.press(forDuration: 0.8)
        XCTAssertNotEqual(keyboard.value as? String, range)
        XCTAssertEqual(keyboard.label, "Keyboard")
        for bank in 0..<6 {
            app.buttons["bronze.bank.\(bank)"].tap()
            XCTAssertEqual(app.buttons["bronze.bank.\(bank)"].value as? String, "Selecionado")
        }
        app.buttons["bronze.bank.0"].press(forDuration: 0.8)
        XCTAssertTrue(app.textFields["Nome"].waitForExistence(timeout: 3))
        app.buttons["Voltar"].tap()
        let moduleHeight = app.otherElements["Volume do módulo 1"].firstMatch.frame.height
        app.buttons["bronze.logo"].tap()
        XCTAssertEqual(app.otherElements["Volume do módulo 1"].firstMatch.frame.height, moduleHeight, accuracy: 1)
        let closedWidth = keyboard.frame.width
        app.buttons["bronze.logo"].tap()
        XCTAssertGreaterThan(keyboard.frame.width, closedWidth)
        let click = app.buttons["bronze.metronome"]
        let clickBefore = click.value as? String
        click.tap()
        XCTAssertNotEqual(click.value as? String, clickBefore)
        click.tap()
        XCTAssertEqual(click.value as? String, clickBefore)
        app.buttons["bronze.metronome"].press(forDuration: 0.8)
        XCTAssertTrue(app.buttons["Voltar"].waitForExistence(timeout: 3))
        app.buttons["Voltar"].tap()
        app.buttons["bronze.sound.6"].tap()
        XCTAssertTrue(app.buttons["Brake"].waitForExistence(timeout: 3))
        capture("organ-adaptive")
        app.buttons["Voltar"].tap()
        app.buttons["bronze.sound.7"].tap()
        XCTAssertTrue(app.buttons["OSC 1"].waitForExistence(timeout: 3))
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "bronze.synth.preset.")).count, 5)
        app.buttons["bronze.synth.preset.1"].tap()
        XCTAssertTrue(app.buttons["OSC 1"].exists)
        capture("synth-adaptive")
        app.buttons["bronze.synth.preset.1"].press(forDuration: 0.8)
        XCTAssertTrue(app.textFields["Nome"].waitForExistence(timeout: 3))
        app.buttons["Cancelar"].tap()
        app.buttons["Voltar"].tap()
        app.buttons["bronze.sound.0"].tap()
        XCTAssertTrue(app.buttons["Voltar"].waitForExistence(timeout: 3))
        app.buttons["Voltar"].tap()
        app.buttons["Config"].firstMatch.tap()
        app.buttons["User"].firstMatch.tap()
        app.buttons["Velocity"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Soft"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["MIDI / Saída"].exists)
        XCTAssertFalse(app.buttons["Glide"].exists)
        XCTAssertFalse(app.staticTexts["Limite Velocity"].exists)
        capture("velocity-graph")
    }
    func testSynthEditingAndVelocity() throws {
        let app = start()
        app.buttons["bronze.sound.7"].tap()
        let preset = app.buttons["bronze.synth.preset.1"]
        XCTAssertTrue(preset.waitForExistence(timeout: 5))
        preset.tap()
        preset.press(forDuration: 1.1)
        XCTAssertTrue(app.textFields["Nome"].waitForExistence(timeout: 5))
        app.buttons["Cancelar"].tap()
        app.buttons["Voltar"].tap()
        app.buttons["Config"].firstMatch.tap()
        app.buttons["User"].firstMatch.tap()
        app.buttons["Velocity"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Soft"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["MIDI / Saída"].exists)
        XCTAssertFalse(app.buttons["Glide"].exists)
        XCTAssertFalse(app.staticTexts["Limite Velocity"].exists)
        capture("velocity-graph")
    }
    func testSettingsSourceAndKnob() throws {
        let app = start()
        app.buttons["Config"].firstMatch.tap()
        let user = app.buttons["User"].firstMatch
        XCTAssertTrue(user.waitForExistence(timeout: 5))
        user.tap(); Thread.sleep(forTimeInterval: 1)
        let attack = app.buttons["Attack"].firstMatch
        XCTAssertTrue(attack.exists)
        let before = attack.value as? String
        attack.tap()
        let slider = app.otherElements["bronze.knob.slider"]
        XCTAssertTrue(slider.waitForExistence(timeout: 3))
        XCTAssertEqual(attack.value as? String, before, "Opening a knob must not change its value")
        app.buttons["Aumentar Attack"].tap()
        let edited = attack.value as? String
        XCTAssertNotEqual(before, edited)
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: slider)
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 4), .completed)
        app.buttons["Default"].tap(); Thread.sleep(forTimeInterval: 1)
        XCTAssertEqual(attack.value as? String, "0 ms")
        user.tap(); Thread.sleep(forTimeInterval: 1)
        XCTAssertEqual(attack.value as? String, edited)
        capture("user-parameters-restored")
    }
    func testBackgroundKeepsPad() throws {
        let app = start()
        app.buttons["bronze.pads.toggle"].tap()
        let pad = app.buttons["bronze.pad.0"]
        XCTAssertTrue(pad.waitForExistence(timeout: 10))
        if pad.value as? String != "Tocando" { pad.tap() }
        XCTAssertEqual(pad.value as? String, "Tocando")
        XCUIDevice.shared.press(.home)
        Thread.sleep(forTimeInterval: 3)
        app.activate()
        XCTAssertTrue(pad.waitForExistence(timeout: 5))
        XCTAssertEqual(pad.value as? String, "Tocando")
        pad.tap()
        XCTAssertEqual(pad.value as? String, "Parado")
    }
    func testPresetAndEffectsEditing() throws {
        let app = start()
        let toggle = app.buttons["bronze.keyboard.toggle"]
        if toggle.label == "Keyboard" { toggle.tap() }
        let second = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Preset 2:")).firstMatch
        XCTAssertTrue(second.waitForExistence(timeout: 5))
        second.tap(); Thread.sleep(forTimeInterval: 1)
        second.press(forDuration: 0.8)
        XCTAssertTrue(app.buttons["Salvar nome e cor"].waitForExistence(timeout: 5))
        capture("preset-editor")
        app.buttons["Voltar"].tap()
        app.buttons["bronze.pads.toggle"].tap()
        XCTAssertTrue(app.buttons["Bump"].firstMatch.waitForExistence(timeout: 5))
        app.buttons["Church"].press(forDuration: 0.8)
        XCTAssertGreaterThan(app.staticTexts.matching(identifier: "EDIT").count, 0)
        capture("church-edit")
        app.buttons["Bump"].firstMatch.tap()
        XCTAssertTrue(app.textFields["Nome"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["Nome"].value as? String, "Bump")
        capture("bump-editor")
    }
}
