import Foundation
import Observation

@MainActor
@Observable
final class AppSettings {
  private enum Key {
    static let collapsesBottomBar = "settings.collapseBottomBar"
    static let autoOpensKeyboard = "settings.autoOpenKeyboard"
    static let finishedOnboarding = "settings.finishedOnboarding"
    static let colorChoice = "settings.color"
  }

  static let demoSuite = "voyager.demo.settings"

  @ObservationIgnored private let defaults: UserDefaults

  var collapsesBottomBar: Bool {
    didSet { defaults.set(collapsesBottomBar, forKey: Key.collapsesBottomBar) }
  }

  var autoOpensKeyboard: Bool {
    didSet { defaults.set(autoOpensKeyboard, forKey: Key.autoOpensKeyboard) }
  }

  var hasFinishedOnboarding: Bool {
    didSet { defaults.set(hasFinishedOnboarding, forKey: Key.finishedOnboarding) }
  }

  var colorChoice: String? {
    didSet { defaults.set(colorChoice, forKey: Key.colorChoice) }
  }

  var isShowingOnboarding = false
  var pendingRoute: SettingsRoute?

  init(defaults: UserDefaults, finishedOnboarding: Bool? = nil) {
    self.defaults = defaults
    collapsesBottomBar = defaults.object(forKey: Key.collapsesBottomBar) as? Bool ?? false
    autoOpensKeyboard = defaults.object(forKey: Key.autoOpensKeyboard) as? Bool ?? true
    hasFinishedOnboarding = finishedOnboarding ?? defaults.bool(forKey: Key.finishedOnboarding)
    colorChoice = defaults.string(forKey: Key.colorChoice)
    isShowingOnboarding = !hasFinishedOnboarding
  }

  static func launch() -> AppSettings {
    let arguments = ProcessInfo.processInfo.arguments
    let isDemo = arguments.contains("-VoyagerDemo") || UserDefaults.standard.bool(forKey: "VoyagerDemo")
    guard isDemo, let demo = UserDefaults(suiteName: demoSuite) else { return AppSettings(defaults: .standard) }
    demo.removePersistentDomain(forName: demoSuite)
    let settings = AppSettings(
      defaults: demo,
      finishedOnboarding: !arguments.contains("-VoyagerOnboarding")
    )
    if arguments.contains("-VoyagerRestingStart") { settings.autoOpensKeyboard = false }
    if let index = arguments.firstIndex(of: "-VoyagerColor"), arguments.indices.contains(index + 1) {
      settings.colorChoice = arguments[index + 1]
    }
    return settings
  }

  func finishOnboarding() {
    hasFinishedOnboarding = true
    isShowingOnboarding = false
  }

  func showOnboarding() {
    isShowingOnboarding = true
  }
}
