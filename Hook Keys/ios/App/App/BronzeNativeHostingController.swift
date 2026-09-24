import SwiftUI
import UIKit

/// Host do iPad/iPhone. Os painéis usam SwiftUI; importação/exportação e
/// controles UIKit ainda precisam de adaptação para um futuro host macOS.
final class BronzeNativeHostingController: UIHostingController<BronzeNativeRootView> {
    init() { super.init(rootView: BronzeNativeRootView()) }

    @MainActor required dynamic init?(coder aDecoder: NSCoder) {
        fatalError("BronzeNativeHostingController não usa storyboard")
    }

    override var prefersStatusBarHidden: Bool { true }
    override var shouldAutorotate: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
}
