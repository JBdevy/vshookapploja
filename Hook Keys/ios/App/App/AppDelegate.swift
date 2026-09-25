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

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let appWindow = UIWindow(windowScene: windowScene)
        appWindow.rootViewController = BronzeNativeHostingController()
        window = appWindow
        appWindow.makeKeyAndVisible()
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
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        NotificationCenter.default.post(name: .bronzeKeysStopAllNotes, object: nil)
        UIApplication.shared.isIdleTimerDisabled = false
    }
}
