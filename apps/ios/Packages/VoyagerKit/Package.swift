// swift-tools-version:6.2
import PackageDescription

let package = Package(
  name: "VoyagerKit",
  platforms: [.iOS("27.0"), .macOS("27.0")],
  products: [
    .library(name: "VoyagerShared", targets: ["VoyagerShared"]),
    .library(name: "VoyagerSync", targets: ["VoyagerSync"]),
    .library(name: "VoyagerBrowser", targets: ["VoyagerBrowser"]),
    .library(name: "VoyagerDesign", targets: ["VoyagerDesign"]),
  ],
  dependencies: [
    .package(name: "VoyagerSyncCore", path: "../../../../packages/sync"),
  ],
  targets: [
    .target(name: "VoyagerShared", resources: [.copy("Scripts")]),
    .target(name: "VoyagerSync", dependencies: ["VoyagerShared", .product(name: "VoyagerSyncCore", package: "VoyagerSyncCore")]),
    .target(name: "VoyagerBrowser", dependencies: ["VoyagerShared", "VoyagerSync"], resources: [.copy("Blocking/FilterListCatalog.json")]),
    .target(name: "VoyagerDesign", dependencies: ["VoyagerBrowser", "VoyagerSync"], resources: [.process("Resources")]),
    .testTarget(name: "VoyagerSharedTests", dependencies: ["VoyagerShared"]),
    .testTarget(name: "VoyagerSyncTests", dependencies: ["VoyagerSync", .product(name: "VoyagerSyncCore", package: "VoyagerSyncCore")]),
    .testTarget(name: "VoyagerBrowserTests", dependencies: ["VoyagerBrowser"]),
    .testTarget(name: "VoyagerDesignTests", dependencies: ["VoyagerDesign"]),
  ]
)
