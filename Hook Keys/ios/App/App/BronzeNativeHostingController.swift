import SwiftUI
import UIKit
import Combine

/// Shared native host for iPad/iPhone and macOS via Mac Catalyst.
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
    #if targetEnvironment(macCatalyst)
    override var keyCommands: [UIKeyCommand]? {
        guard !authorized, presentedViewController == nil else { return super.keyCommands }
        let next = UIKeyCommand(input: "\t", modifierFlags: [], action: #selector(moveLoginFocus(_:)))
        let previous = UIKeyCommand(input: "\t", modifierFlags: [.shift], action: #selector(moveLoginFocus(_:)))
        // Catalyst's default focus traversal can skip the SwiftUI SecureField.
        next.wantsPriorityOverSystemBehavior = true
        previous.wantsPriorityOverSystemBehavior = true
        return (super.keyCommands ?? []) + [next, previous]
    }

    @objc private func moveLoginFocus(_ command: UIKeyCommand) {
        NotificationCenter.default.post(name: .bronzeLoginFocusTraversal, object: nil,
            userInfo: ["backwards": command.modifierFlags.contains(.shift)])
    }
    #endif
    override var shouldAutorotate: Bool { true }
    // Performance keys extend to the bottom edge. Give their touch-down priority
    // over the home gesture so the high-velocity region sounds immediately.
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        authorized ? [.bottom] : []
    }
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
        #if !targetEnvironment(macCatalyst)
        guard isViewLoaded, let window = view.window else { return }
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
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
        #endif
    }
}

extension Notification.Name {
    static let bronzeLoginFocusTraversal = Notification.Name("BronzeLoginFocusTraversal")
}
