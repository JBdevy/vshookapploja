import Capacitor

@objc(HookKeysBridgeViewController)
final class HookKeysBridgeViewController: CAPBridgeViewController {
    // registerPluginType deixa de registrar plugins manuais quando o Capacitor
    // entra no modo de auto-registro. Esta instância explícita garante que a
    // ponte HookKeysNative exista também no IPA instalado.
    private let hookKeysNativePlugin = HookKeysNativePlugin()

    override var prefersStatusBarHidden: Bool { true }

    override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation { .fade }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        setNeedsStatusBarAppearanceUpdate()
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(hookKeysNativePlugin)
    }
}
