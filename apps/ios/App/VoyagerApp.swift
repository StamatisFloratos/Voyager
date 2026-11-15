import VoyagerSync
import SwiftData
import SwiftUI

@main
struct VoyagerApp: App {
  @UIApplicationDelegateAdaptor(SystemAppDelegate.self) private var systemDelegate
  @State private var model: AppModel

  init() {
    SyncService.registerBackgroundRefresh()
    let launched = AppModel.launch()
    _model = State(initialValue: launched)
    SystemIntegration.register(launched)
  }

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(model)
        .modelContainer(model.container)
        .systemIntegrations(model)
    }
  }
}
