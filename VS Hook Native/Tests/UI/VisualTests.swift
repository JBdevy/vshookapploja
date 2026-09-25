import XCTest
final class VisualTests: XCTestCase {
    override func setUpWithError() throws {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:58150/reset")!)
        request.httpMethod = "POST"; request.httpBody = Data("{}".utf8)
        let complete = expectation(description: "Reset isolated fixture")
        URLSession.shared.dataTask(with: request) { _, _, error in XCTAssertNil(error); complete.fulfill() }.resume()
        wait(for: [complete], timeout: 5)
    }
    func playCommands() throws -> Int {
        var response: Data?
        let complete = expectation(description: "Read isolated command log")
        URLSession.shared.dataTask(with: URL(string: "http://127.0.0.1:58150/commands")!) { data, _, error in XCTAssertNil(error); response = data; complete.fulfill() }.resume()
        wait(for: [complete], timeout: 5)
        let commands = try JSONSerialization.jsonObject(with: XCTUnwrap(response)) as! [[String: Any]]
        return commands.filter { $0["type"] as? String == "play_button" }.count
    }
    func shot(_ name: String) { let path = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("vshook-shot-" + name + ".png"); try? XCUIScreen.main.screenshot().pngRepresentation.write(to: path); print("SHOT_PATH=" + path.path); let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name=name; shot.lifetime = .keepAlways; add(shot) }
    func testCurrentGridAndTeleprompt() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.hookdeveloper.vshook")
        app.launchEnvironment["VSHOOK_TEST_BRIDGE"] = "http://127.0.0.1:58150"
        app.launchArguments = []
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["vshook.mode.director"].waitForExistence(timeout:25))
        app.buttons["vshook.mode.director"].tap(); app.buttons["Tablet"].tap()
        app.buttons["Referência local"].firstMatch.tap()
        let tcp=app.buttons.matching(NSPredicate(format:"label == %@", "TCP")).firstMatch
        XCTAssertTrue(tcp.waitForExistence(timeout:15));Thread.sleep(forTimeInterval: 3);tcp.tap()
        let handle=app.descendants(matching: .any)["vshook.tcp.trackWidth"]
        XCTAssertTrue(handle.waitForExistence(timeout:10),app.debugDescription)
        XCTAssertGreaterThan(handle.frame.height,100)
        let original=handle.frame.midX
        let trackDelta: CGFloat = original > app.frame.width * 0.35 ? -65 : 65
        app.buttons["vshook.tcp.list"].tap()
        let list=app.descendants(matching: .any)["vshook.tcp.listWidth"]
        XCTAssertTrue(list.waitForExistence(timeout:5))
        XCTAssertEqual(handle.frame.midX,original,accuracy:1,"LIST must preserve track width")
        shot("tcp-colors-mute-wave-handles")
        handle.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).press(forDuration:0.1,thenDragTo:handle.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).withOffset(CGVector(dx:trackDelta,dy:0)))
        XCTAssertGreaterThan(abs(handle.frame.midX-original),30)
        let listX=list.frame.midX
        let listDelta: CGFloat = listX < app.frame.width * 0.55 ? 40 : -40
        list.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).press(forDuration:0.1,thenDragTo:list.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).withOffset(CGVector(dx:listDelta,dy:0)))
        XCTAssertGreaterThan(abs(list.frame.midX-listX),15)
        shot("tcp-handles-resized")
        app.buttons["vshook.tcp.list"].tap()
        let row=app.otherElements["Linha do tempo de BATERIA"]
        XCTAssertTrue(row.exists,app.debugDescription)
        row.coordinate(withNormalizedOffset:CGVector(dx:0.6,dy:0.5)).press(forDuration:0.8)
        let slider=app.sliders["vshook.tcp.itemVolume"]
        XCTAssertTrue(slider.waitForExistence(timeout:5),app.debugDescription)
        slider.adjust(toNormalizedSliderPosition:0.2)
        shot("tcp-volume-low")
        slider.adjust(toNormalizedSliderPosition:0.95)
        shot("tcp-volume-high")
        app.buttons["FECHAR"].tap()
        app.buttons.matching(NSPredicate(format:"label == %@", "REPERTÓRIO")).firstMatch.tap()
        app.buttons.matching(NSPredicate(format:"label == %@", "TP")).firstMatch.tap()
        app.buttons["TP/1"].tap()
        let timer=app.staticTexts["vshook.tp.timer"]
        XCTAssertTrue(timer.waitForExistence(timeout:5),app.debugDescription)
        let content=app.descendants(matching: .any)["vshook.tp.content"].firstMatch
        XCTAssertTrue(content.exists,app.debugDescription)
        XCTAssertEqual(timer.frame.midX,content.frame.midX,accuracy:1,"Timer centered independently of local clock")
        shot("teleprompt-centered-timer")
        app.buttons["CONFIG/TP"].tap();app.buttons["CONFIG TELEPROMPT 1"].tap()
        shot("teleprompt-config-colors")
        let menu=app.descendants(matching: .any)["vshook.tp.config.clockPosition"].firstMatch
        for _ in 0..<22 {
            if menu.exists && menu.isHittable { break }
            let scroll = app.scrollViews.firstMatch
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.80)).press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.35)))
        }
        XCTAssertTrue(menu.isHittable,app.debugDescription)
        shot("teleprompt-config-positions")
        menu.tap();app.buttons["CENTRO EM BAIXO"].tap()
        app.buttons["FECHAR"].tap()
        XCTAssertEqual(timer.frame.midX,content.frame.midX,accuracy:1)
        shot("teleprompt-centered-bottom")
        app.buttons["VOLTAR"].tap()
        app.buttons.matching(NSPredicate(format:"label == %@", "REPERTÓRIO")).firstMatch.tap()
        app.buttons.matching(NSPredicate(format:"label == %@", "SESSÃO")).firstMatch.tap()
        XCTAssertTrue(app.buttons["SAVE"].waitForExistence(timeout:5));shot("sessions-current");app.buttons["OK"].tap()
        app.buttons.matching(NSPredicate(format:"label == %@", "RPTS")).firstMatch.tap()
        XCTAssertTrue(app.buttons["ABRIR"].waitForExistence(timeout:5));shot("playlists-current")
        app.buttons["PREVIEW"].tap();XCTAssertTrue(app.buttons["PREVIEW 6"].waitForExistence(timeout:5))
        app.buttons["vshook.playlist.preview.close"].tap();app.buttons["FECHAR"].firstMatch.tap()
        app.buttons["vshook.timer.open"].tap();XCTAssertTrue(app.buttons["REGRESSIVO"].waitForExistence(timeout:5));shot("timer-progressive")
        app.buttons["REGRESSIVO"].tap();XCTAssertTrue(app.buttons["vshook.timer.key.1"].waitForExistence(timeout:5));shot("timer-keyboard");app.buttons["FECHAR"].tap()
        app.buttons.matching(NSPredicate(format:"label == %@", "PARTS")).firstMatch.tap();shot("parts-current")
        if app.descendants(matching:.any)["vshook.grid.panel"].exists { app.buttons["Representação gráfica"].tap() }
        app.buttons["Representação gráfica"].tap();XCTAssertTrue(app.descendants(matching:.any)["vshook.grid.panel"].waitForExistence(timeout:5));shot("grid-bottom-current")
        app.buttons.matching(NSPredicate(format:"label == %@", "LUPA")).firstMatch.tap();XCTAssertTrue(app.buttons["ESPAÇO"].waitForExistence(timeout:5));Thread.sleep(forTimeInterval:2);shot("search-keyboard")
        app.buttons["Z"].tap();XCTAssertTrue(app.staticTexts["NENHUMA MÚSICA ENCONTRADA"].waitForExistence(timeout:5));app.buttons["LIMPAR"].tap();app.buttons["FECHAR"].tap()

    }
    func testToolsAndCompactTimer() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.hookdeveloper.vshook")
        app.launchEnvironment["VSHOOK_TEST_BRIDGE"] = "http://127.0.0.1:58150"
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["vshook.mode.director"].waitForExistence(timeout:25))
        app.buttons["vshook.mode.director"].tap(); app.buttons["Tablet"].tap()
        app.buttons["Referência local"].firstMatch.tap()
        XCTAssertTrue(app.buttons["vshook.timer.open"].waitForExistence(timeout:15)); Thread.sleep(forTimeInterval: 3)
        app.buttons["vshook.timer.open"].tap();app.buttons["REGRESSIVO"].tap()
        let close=app.buttons["FECHAR"]
        XCTAssertTrue(close.waitForExistence(timeout:5));XCTAssertLessThan(close.frame.maxY,app.frame.maxY)
        shot("timer-small-screen-footer")
        app.buttons["vshook.timer.key.1"].tap();app.buttons["vshook.timer.key.2"].tap()
        XCTAssertEqual(app.buttons["Horas"].value as? String,"12")
        close.tap()
        let priorPlayCommands = try playCommands()
        app.buttons.matching(NSPredicate(format:"label == %@","PLAY")).firstMatch.press(forDuration:0.8)
        XCTAssertTrue(app.buttons["ESCOLHER PISTAS"].waitForExistence(timeout:5),app.debugDescription);shot("play-hold-menu"); XCTAssertEqual(try playCommands(), priorPlayCommands, "Holding PLAY must not start playback")
        app.buttons["ESCOLHER PISTAS"].tap();XCTAssertTrue(app.buttons["TODAS"].waitForExistence(timeout:5));shot("play-track-selection");app.buttons["VOLTAR"].tap();app.buttons["FECHAR"].tap()
        app.buttons["vshook.transport.play"].tap();Thread.sleep(forTimeInterval:0.3);XCTAssertEqual(try playCommands(), priorPlayCommands + 1, "A short tap still plays")
        let song=app.staticTexts.matching(NSPredicate(format:"label == %@ AND identifier != %@","MÚSICA DE TESTE","vshook.grid.panel")).firstMatch
        song.press(forDuration:0.8);XCTAssertTrue(app.buttons["PREMIX"].waitForExistence(timeout:5),app.debugDescription);shot("song-tools")
        app.buttons["ABRIR"].tap();XCTAssertTrue(app.sliders.firstMatch.waitForExistence(timeout:5));shot("premix-current");app.buttons["VOLTAR"].tap()
        XCTAssertTrue(song.waitForExistence(timeout:5));Thread.sleep(forTimeInterval:0.5);song.press(forDuration:1.0);XCTAssertTrue(app.buttons["MULTILOOPS"].waitForExistence(timeout:5),app.debugDescription);app.buttons["MULTILOOPS"].tap();app.buttons["ABRIR"].tap()
        XCTAssertTrue(app.buttons["M/S 1"].waitForExistence(timeout:5));shot("multiloops-current")
        app.buttons["M/S 1"].press(forDuration:0.8);XCTAssertTrue(app.staticTexts["M/S 1 — PISTAS"].waitForExistence(timeout:5));shot("multiloops-tracks");app.buttons["FECHAR"].tap()
        app.buttons.matching(NSPredicate(format:"label == %@","CONFIG")).firstMatch.tap();shot("main-config-current");app.buttons["FECHAR"].tap()
    }

    func testPhoneLayout() throws {
        continueAfterFailure = false
        let app=XCUIApplication(bundleIdentifier:"com.hookdeveloper.vshook")
        app.launchEnvironment["VSHOOK_TEST_BRIDGE"]="http://127.0.0.1:58150"
        app.terminate();app.launch()
        XCTAssertTrue(app.buttons["vshook.mode.director"].waitForExistence(timeout:25))
        app.buttons["vshook.mode.director"].tap();app.buttons["Celular"].tap();app.buttons["Referência local"].firstMatch.tap()
        XCTAssertTrue(app.buttons["vshook.phone.menu"].waitForExistence(timeout:15));Thread.sleep(forTimeInterval:2);shot("phone-main")
        app.buttons["vshook.timer.open"].tap();app.buttons["REGRESSIVO"].tap()
        XCTAssertLessThan(app.buttons["FECHAR"].frame.maxY,app.frame.maxY);Thread.sleep(forTimeInterval:0.5);shot("phone-timer");app.buttons["FECHAR"].tap()
        app.buttons["vshook.phone.menu"].tap();app.buttons["LUPA"].tap()
        let search=app.textFields["PESQUISAR MÚSICA"];XCTAssertTrue(search.waitForExistence(timeout:5));search.tap();search.typeText("TESTE");shot("phone-search");app.buttons["FECHAR"].tap()
        app.buttons["vshook.config.open"].tap();XCTAssertTrue(app.buttons["MODO CLARO"].waitForExistence(timeout:5));shot("phone-config");app.buttons["FECHAR"].tap()
    }

    func testListHandleDoesNotCoverNames() throws {
        continueAfterFailure = false
        let app=XCUIApplication(bundleIdentifier:"com.hookdeveloper.vshook")
        app.launchEnvironment["VSHOOK_TEST_BRIDGE"]="http://127.0.0.1:58150"
        app.terminate();app.launch()
        XCTAssertTrue(app.buttons["vshook.mode.director"].waitForExistence(timeout:25))
        app.buttons["vshook.mode.director"].tap();app.buttons["Tablet"].tap();app.buttons["Referência local"].firstMatch.tap()
        let tcp=app.buttons.matching(NSPredicate(format:"label == %@","TCP")).firstMatch
        XCTAssertTrue(tcp.waitForExistence(timeout:15));Thread.sleep(forTimeInterval:3);tcp.tap()
        app.buttons["vshook.tcp.list"].tap()
        let handle=app.descendants(matching:.any)["vshook.tcp.listWidth"]
        XCTAssertTrue(handle.waitForExistence(timeout:5))
        func checkName() throws {
            let names=app.staticTexts.matching(NSPredicate(format:"label == %@","MÚSICA DE TESTE")).allElementsBoundByIndex
            let name=try XCTUnwrap(names.first { $0.frame.midX > handle.frame.minX })
            XCTAssertGreaterThanOrEqual(name.frame.minX,handle.frame.maxX,"The full drag target must stay outside the song name")
        }
        try checkName();shot("list-name-clear-of-handle")
        let start=handle.frame.midX
        let delta:CGFloat=start < app.frame.width * 0.55 ? 40 : -40
        handle.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).press(forDuration:0.1,thenDragTo:handle.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).withOffset(CGVector(dx:delta,dy:0)))
        XCTAssertGreaterThan(abs(handle.frame.midX-start),15)
        try checkName();shot("list-name-clear-after-resize")
    }

    func launchMode(_ mode: String, tablet: Bool? = nil) -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "com.hookdeveloper.vshook")
        app.launchEnvironment["VSHOOK_TEST_BRIDGE"] = "http://127.0.0.1:58150"
        app.launchEnvironment["VSHOOK_TEST_CHAT"] = "1"
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["vshook.mode." + mode].waitForExistence(timeout: 25))
        app.buttons["vshook.mode." + mode].tap()
        if let tablet { app.buttons[tablet ? "Tablet" : "Celular"].tap() }
        if mode == "director" { app.buttons["Referência local"].firstMatch.tap() }
        return app
    }
    func testPhoneTelepromptPanels() throws {
        continueAfterFailure = false
        let app = launchMode("director", tablet: false)
        XCTAssertTrue(app.buttons["vshook.phone.menu"].waitForExistence(timeout: 15))
        app.buttons["vshook.config.open"].tap()
        let tab = app.buttons["CONFIG ABA TP"]
        for _ in 0..<6 { if tab.isHittable { break }; app.scrollViews.firstMatch.swipeUp() }
        tab.tap()
        for key in ["list", "parts"] {
            let toggle = app.buttons["vshook.config.tp." + key]
            XCTAssertTrue(toggle.exists, app.debugDescription)
            if toggle.value as? String != "Ligado" { toggle.tap() }
        }
        app.buttons["FECHAR"].tap()
        app.staticTexts["REPRODUZINDO"].firstMatch.swipeRight(); app.buttons["TP/1"].tap()
        let list = app.buttons["vshook.tp.control.list"], parts = app.buttons["vshook.tp.control.parts"]
        XCTAssertTrue(list.waitForExistence(timeout: 5), app.debugDescription)
        let topY = app.buttons["CONFIG/TP"].frame.midY, bottomY = list.frame.midY
        list.tap()
        let listPane = app.descendants(matching: .any)["vshook.tp.list"].firstMatch
        XCTAssertTrue(listPane.exists, app.debugDescription)
        XCTAssertGreaterThan(listPane.frame.width, app.frame.width - 25)
        XCTAssertFalse(app.descendants(matching: .any)["vshook.tp.content"].firstMatch.exists)
        XCTAssertEqual(app.buttons["CONFIG/TP"].frame.midY, topY, accuracy: 1)
        XCTAssertEqual(list.frame.midY, bottomY, accuracy: 1)
        shot("phone-tp-list-full-width")
        parts.tap()
        XCTAssertFalse(listPane.exists)
        let partsPane = app.descendants(matching: .any)["vshook.tp.parts"].firstMatch
        XCTAssertGreaterThan(partsPane.frame.width, app.frame.width - 25)
        XCTAssertTrue(app.buttons["CANCELAR"].exists)
        XCTAssertEqual(app.buttons["CONFIG/TP"].frame.midY, topY, accuracy: 1)
        shot("phone-tp-parts-full-width")
        parts.tap(); XCTAssertTrue(app.descendants(matching: .any)["vshook.tp.content"].firstMatch.exists)
    }
    func testMusicianControls() throws {
        continueAfterFailure = false
        let app = launchMode("musician")
        XCTAssertTrue(app.buttons["vshook.config.open"].waitForExistence(timeout: 15))
        app.buttons["vshook.config.open"].tap()
        let tab = app.buttons["CONFIG ABA TP"]
        for _ in 0..<6 { if tab.isHittable { break }; app.scrollViews.firstMatch.swipeUp() }
        XCTAssertTrue(tab.isHittable, app.debugDescription); tab.tap()
        for key in ["play", "auto1", "loop", "parts"] { XCTAssertFalse(app.buttons["vshook.config.tp." + key].exists) }
        shot("musician-tp-no-transport-settings")
    }
    func checkRecados(_ app: XCUIApplication) {
        XCTAssertTrue(app.buttons["vshook.recados.send"].waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertTrue(app.buttons["RETIRAR"].exists); XCTAssertTrue(app.buttons["FIXAR"].exists)
        app.buttons["RECADO 1"].tap()
        XCTAssertTrue(app.buttons["EDITAR"].exists)
        app.buttons["vshook.recados.send"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "RECADO ATIVO:")).firstMatch.waitForExistence(timeout: 5))
        app.buttons["FIXAR"].tap(); XCTAssertTrue(app.buttons["FIXADO"].waitForExistence(timeout: 5))
        app.buttons["RETIRAR"].tap(); XCTAssertTrue(app.staticTexts["RECADO REMOVIDO"].waitForExistence(timeout: 5))
        app.buttons["EDITAR"].tap()
        XCTAssertTrue(app.buttons["SALVAR"].exists)
        app.buttons["GLOBAL"].tap(); XCTAssertFalse(app.buttons["SALVAR"].exists)
        XCTAssertLessThan(app.buttons["SAIR"].frame.maxY, app.frame.maxY)
        shot("recados-native-full-screen")
        app.buttons["SAIR"].tap()
    }
    func testRecadosStandaloneAndDirector() throws {
        continueAfterFailure = false
        checkRecados(launchMode("recados"))
        for tablet in [false, true] {
            let app = launchMode("director", tablet: tablet)
            if tablet { XCTAssertTrue(app.buttons["RECADOS"].waitForExistence(timeout: 15)); app.buttons["RECADOS"].tap() }
            else { XCTAssertTrue(app.buttons["vshook.phone.menu"].waitForExistence(timeout: 15)); app.buttons["vshook.phone.menu"].tap(); app.buttons["RECADOS"].tap() }
            checkRecados(app)
        }
    }
    func testChatAndDrop() throws {
        continueAfterFailure = false
        let app = launchMode("chat")
        XCTAssertTrue(app.staticTexts["Mensagem do administrador"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["2/10 hoje"].exists)
        let admin = app.staticTexts["Mensagem do administrador"], musician = app.staticTexts["Mensagem do músico"]
        XCTAssertLessThan(app.buttons.matching(identifier: "Foto de Diretor teste").firstMatch.frame.maxX, admin.frame.minX)
        XCTAssertGreaterThan(app.buttons.matching(identifier: "Foto de Músico teste").allElementsBoundByIndex.last!.frame.minX, musician.frame.maxX)
        XCTAssertTrue(app.buttons["Reproduzir áudio"].exists)
        app.buttons["Reproduzir áudio"].tap()
        XCTAssertTrue(app.buttons["Pausar áudio"].waitForExistence(timeout: 2))
        app.buttons["Pausar áudio"].tap()
        shot("chat-current-avatars-bubbles-quota")
        let drop = launchMode("drop")
        XCTAssertTrue(drop.staticTexts["Enviar para o computador"].waitForExistence(timeout: 10))
        XCTAssertTrue(drop.buttons["Galeria"].exists)
        shot("drop-current-phone")
        let receive = drop.buttons["Receber arquivos"]
        for _ in 0..<5 { if receive.isHittable { break }; drop.scrollViews.firstMatch.swipeUp() }
        receive.tap()
        XCTAssertTrue(drop.buttons["Salvar ou compartilhar"].waitForExistence(timeout: 15), drop.debugDescription)
        shot("drop-received-local-file")
    }

}
