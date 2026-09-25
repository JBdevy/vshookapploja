import XCTest
final class VisualTests: XCTestCase {
    private func start() -> XCUIApplication {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .landscapeRight
        let app = XCUIApplication(bundleIdentifier: "com.hookdeveloper.hookkeys")
        app.launchEnvironment["BRONZE_UI_TEST"] = "1"
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["bronze.logo"].waitForExistence(timeout: 60))
        Thread.sleep(forTimeInterval: 8)
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
    func testSettingsSourceAndKnob() throws {
        let app = start()
        app.buttons["Config"].firstMatch.tap()
        let user = app.buttons["User"].firstMatch
        XCTAssertTrue(user.waitForExistence(timeout: 5))
        user.tap(); Thread.sleep(forTimeInterval: 1)
        // Adjustable native knobs expose their normalized percentage to VoiceOver.
        let attack = app.otherElements["Attack"].firstMatch
        XCTAssertTrue(attack.exists)
        let before = attack.value as? String
        let origin = attack.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        origin.press(forDuration: 0.1, thenDragTo: origin.withOffset(CGVector(dx: 0, dy: -35)))
        let edited = attack.value as? String
        XCTAssertNotEqual(before, edited)
        app.buttons["Default"].tap(); Thread.sleep(forTimeInterval: 1)
        XCTAssertEqual(attack.value as? String, "0%")
        user.tap(); Thread.sleep(forTimeInterval: 1)
        XCTAssertEqual(attack.value as? String, edited)
        capture("user-parameters-restored")
    }
    func testBackgroundKeepsPad() throws {
        let app = start()
        app.buttons["Pads - Efects"].tap()
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
        app.buttons["Pads - Efects"].tap()
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
