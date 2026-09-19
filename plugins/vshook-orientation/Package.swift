// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "VshookOrientation",
    platforms: [.iOS(.v13)],
    products: [
        .library(name: "VshookOrientation", targets: ["VSHookOrientationPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "6.0.0")
    ],
    targets: [
        .target(
            name: "VSHookOrientationPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/VSHookOrientationPlugin"
        )
    ]
)
