import SwiftUI
import UIKit
import Combine

/// Host do iPad/iPhone. Os painéis usam SwiftUI; importação/exportação e
/// controles UIKit ainda precisam de adaptação para um futuro host macOS.
final class BronzeNativeHostingController: UIHostingController<BronzeNativeRootView> {
    private var orientationSubscription: AnyCancellable?
    private var authorized = false

    init() {
        let account = BronzeNativeAccount()
        super.init(rootView: BronzeNativeRootView(account: account))
        orientationSubscription = account.$session
            .map { $0 != nil }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] authorized in
                self?.authorized = authorized
                self?.updateOrientation()
            }
    }

    @MainActor required dynamic init?(coder aDecoder: NSCoder) {
        fatalError("BronzeNativeHostingController não usa storyboard")
    }

    override var prefersStatusBarHidden: Bool { true }
    override var shouldAutorotate: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        authorized ? .landscape : .portrait
    }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation {
        authorized ? .landscapeRight : .portrait
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        updateOrientation()
    }

    private func updateOrientation() {
        guard isViewLoaded, let window = view.window else { return }
        if #available(iOS 16.0, *), let scene = window.windowScene {
            setNeedsUpdateOfSupportedInterfaceOrientations()
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: supportedInterfaceOrientations)) { error in
                NSLog("[BronzeOrientation] %@", error.localizedDescription)
            }
        } else {
            // iOS 15 and the legacy UIApplication window lifecycle.
            UIDevice.current.setValue(preferredInterfaceOrientationForPresentation.rawValue, forKey: "orientation")
            UIViewController.attemptRotationToDeviceOrientation()
        }
    }
}
