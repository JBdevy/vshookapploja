import Capacitor

@objc(HookKeysBridgeViewController)
final class HookKeysBridgeViewController: CAPBridgeViewController {
    // registerPluginType deixa de registrar plugins manuais quando o Capacitor
    // entra no modo de auto-registro. Esta instância explícita garante que a
    // ponte HookKeysNative exista também no IPA instalado.
    private let hookKeysNativePlugin = HookKeysNativePlugin()
    // A sessão precisa da mesma inscrição explícita. Sem ela o JavaScript cai
    // no fallback em memória e o usuário precisa entrar novamente ao reabrir.
    private let sessionVaultPlugin = SessionVaultPlugin()

    override var prefersStatusBarHidden: Bool { true }

    // A máscara muda de retrato (login) para as duas paisagens (player).
    // Explicitar a autorrotação evita que uma build Release preserve o lado
    // usado no primeiro requestGeometryUpdate e ignore a rotação seguinte.
    override var shouldAutorotate: Bool { true }

    override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation { .fade }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        setNeedsStatusBarAppearanceUpdate()
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(hookKeysNativePlugin)
        bridge?.registerPluginInstance(sessionVaultPlugin)
    }
}
