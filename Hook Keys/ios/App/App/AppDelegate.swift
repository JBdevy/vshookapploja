import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        window?.rootViewController?.supportedInterfaceOrientations ?? .portrait
    }
}

final class BronzeSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    #if targetEnvironment(macCatalyst)
    private var appliedLaunchSize = false
    #endif

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let appWindow = UIWindow(windowScene: windowScene)
        appWindow.rootViewController = BronzeNativeHostingController()
        #if targetEnvironment(macCatalyst)
        windowScene.sizeRestrictions?.minimumSize = CGSize(width: 1024, height: 680)
        windowScene.title = "Bronze Keys"
        windowScene.titlebar?.titleVisibility = .hidden
        #endif
        window = appWindow
        appWindow.makeKeyAndVisible()
        #if DEBUG && targetEnvironment(macCatalyst)
        BronzeMacSmoke.start(window: appWindow)
        #endif
    }

    func sceneWillResignActive(_ scene: UIScene) {
        NotificationCenter.default.post(name: .bronzeKeysReleaseTouches, object: nil)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        NotificationCenter.default.post(name: .bronzeKeysReleaseTouches, object: nil)
        UIApplication.shared.isIdleTimerDisabled = false
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        UIApplication.shared.isIdleTimerDisabled = true
        #if targetEnvironment(macCatalyst)
        if #available(macCatalyst 16.0, *), !appliedLaunchSize, let windowScene = scene as? UIWindowScene {
            appliedLaunchSize = true
            var frame = windowScene.effectiveGeometry.systemFrame
            frame.size = CGSize(width: 1128, height: 673)
            let preferences = UIWindowScene.GeometryPreferences.Mac()
            preferences.systemFrame = frame
            windowScene.requestGeometryUpdate(preferences) { error in
                NSLog("Bronze Keys: não foi possível aplicar o tamanho inicial: %@", error.localizedDescription)
            }
        }
        #endif
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        NotificationCenter.default.post(name: .bronzeKeysStopAllNotes, object: nil)
        UIApplication.shared.isIdleTimerDisabled = false
    }
}
