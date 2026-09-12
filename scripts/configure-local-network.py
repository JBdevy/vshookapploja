#!/usr/bin/env python3
import argparse
import plistlib
from pathlib import Path


def configure_ios(root: Path) -> None:
    plist_path = root / "ios" / "App" / "App" / "Info.plist"
    if not plist_path.exists():
        raise SystemExit(f"Info.plist nao encontrado: {plist_path}")

    with plist_path.open("rb") as source:
        data = plistlib.load(source)
    data["NSLocalNetworkUsageDescription"] = (
        "O VS Hook procura a Hook Center e a extensao VS Hook na sua rede local."
    )
    # O bloqueio de orientação no iPad só funciona fora do multitasking.
    data["UIRequiresFullScreen"] = True
    with plist_path.open("wb") as target:
        plistlib.dump(data, target, sort_keys=False)

    # Antes do JavaScript iniciar, o iOS consulta o AppDelegate. A política
    # abaixo mantém a abertura em retrato, mas libera a máscara de paisagem
    # quando o plugin ScreenOrientation recebe o modo Diretor Tablet.
    app_delegate_path = root / "ios" / "App" / "App" / "AppDelegate.swift"
    if not app_delegate_path.exists():
        raise SystemExit(f"AppDelegate não encontrado: {app_delegate_path}")
    marker = "VSHOOK_NATIVE_ORIENTATION_POLICY"
    app_delegate = app_delegate_path.read_text(encoding="utf-8")
    if marker not in app_delegate:
        if "supportedInterfaceOrientationsFor window" in app_delegate:
            raise SystemExit(
                "AppDelegate já possui uma política de orientação não gerenciada pelo VS Hook"
            )
        app_delegate += '''

// VSHOOK_NATIVE_ORIENTATION_POLICY
extension AppDelegate {
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        guard let bridgeController = window?.rootViewController as? CAPBridgeViewController else {
            return .portrait
        }
        let requested = bridgeController.supportedInterfaceOrientations
        if requested == .landscape || requested == .landscapeLeft || requested == .landscapeRight {
            return requested
        }
        return .portrait
    }
}
'''
        app_delegate_path.write_text(app_delegate, encoding="utf-8")
    print(f"Rede local e orientação inicial iOS configuradas: {plist_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("platform", choices=("ios",))
    args = parser.parse_args()
    root = Path.cwd()
    if args.platform == "ios":
        configure_ios(root)


if __name__ == "__main__":
    main()
