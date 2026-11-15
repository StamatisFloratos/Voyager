// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "VoyagerSyncCore",
  platforms: [.macOS(.v14), .iOS(.v17)],
  products: [
    .library(name: "VoyagerSyncCore", targets: ["VoyagerSyncCore"]),
    .executable(name: "legacy-migration", targets: ["LegacyMigrationTool"]),
  ],
  targets: [
    .target(name: "VoyagerSyncCore", path: "ios/Core"),
    .executableTarget(name: "LegacyMigrationTool", dependencies: ["VoyagerSyncCore"], path: "tools/legacy-migration"),
    .testTarget(name: "VoyagerSyncCoreTests", dependencies: ["VoyagerSyncCore"], path: "tests", exclude: ["fixtures"]),
  ]
)
