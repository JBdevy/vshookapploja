import Foundation
import UIKit
import Capacitor

@objc(VSHookOrientationPlugin)
public class VSHookOrientationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VSHookOrientationPlugin"
    public let jsName = "VSHookOrientation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setMode", returnType: CAPPluginReturnPromise)
    ]

    @objc func setMode(_ call: CAPPluginCall) {
        let tablet = call.getString("mode", "phone") == "tablet"
        DispatchQueue.main.async { [weak self] in
            guard let controller = self?.bridge?.viewController as? CAPBridgeViewController else {
                call.resolve()
                return
            }

            controller.supportedOrientations = tablet
                ? [UIInterfaceOrientation.landscapeLeft.rawValue, UIInterfaceOrientation.landscapeRight.rawValue]
                : [UIInterfaceOrientation.portrait.rawValue]
            let mask: UIInterfaceOrientationMask = tablet ? .landscape : .portrait

            if #available(iOS 16.0, *) {
                controller.setNeedsUpdateOfSupportedInterfaceOrientations()
                let scene = controller.view.window?.windowScene
                    ?? UIApplication.shared.connectedScenes.first as? UIWindowScene
                let current = scene?.interfaceOrientation
                let alreadyThere = tablet
                    ? (current?.isLandscape ?? false)
                    : (current?.isPortrait ?? false)

                // Se já está deitado, não force outro lado. A máscara com as
                // duas paisagens deixa o sensor cuidar também do giro de 180°.
                if !alreadyThere {
                    scene?.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
                }
            } else {
                let deviceAlreadyLandscape = UIDevice.current.orientation.isLandscape
                if !tablet || !deviceAlreadyLandscape {
                    let target: UIInterfaceOrientation = tablet ? .landscapeRight : .portrait
                    UIDevice.current.setValue(target.rawValue, forKey: "orientation")
                }
                UIViewController.attemptRotationToDeviceOrientation()
            }
            call.resolve()
        }
    }
}
