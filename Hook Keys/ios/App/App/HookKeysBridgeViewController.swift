import Capacitor

@objc(HookKeysBridgeViewController)
final class HookKeysBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginType(HookKeysNativePlugin.self)
    }
}
