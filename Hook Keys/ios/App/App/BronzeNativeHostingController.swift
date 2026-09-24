import SwiftUI
import UIKit

/// Host exclusivo do iPad/iPhone. BronzeNativeRootView permanece SwiftUI puro
/// e pode entrar no futuro target macOS sem carregar UIKit ou storyboard.
final class BronzeNativeHostingController: UIHostingController<BronzeNativeRootView> {
    init() { super.init(rootView: BronzeNativeRootView()) }

    @MainActor required dynamic init?(coder aDecoder: NSCoder) {
        fatalError("BronzeNativeHostingController não usa storyboard")
    }

    override var prefersStatusBarHidden: Bool { true }
    override var shouldAutorotate: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
}
