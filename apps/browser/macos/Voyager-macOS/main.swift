import AppKit
import ArdiaCore
import ArdiaSync

let config = LaunchConfig.shared
if config.prewarm { exit(0) }

if let dataDirectory = config.dataDirectory, let legacySource = config.testValue("legacySource") {
  LegacyMigration.moveToNewName()
  let scratch = LegacyMigration.ScratchInstance(
    dataDirectory: dataDirectory, legacySource: legacySource, crashAfter: config.testValue("legacyCrashAfter"))
  if !LegacyMigration.runAtLaunch(scratch: scratch) { exit(0) }
}

exit(ArdiaHost.run(argc: CommandLine.argc, argv: CommandLine.unsafeArgv) { AppDelegate() })
