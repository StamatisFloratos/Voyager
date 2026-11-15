import AppIntents
import SwiftUI
import WidgetKit

nonisolated protocol VoyagerControlIntent: AppIntent {}

nonisolated extension VoyagerControlIntent {
  func perform() async throws -> some IntentResult {
    .result()
  }
}

nonisolated struct SearchControlIntent: VoyagerControlIntent {
  static let title: LocalizedStringResource = "Search"
  static let isDiscoverable = false
  static let supportedModes: IntentModes = .foreground
}

nonisolated struct VoiceSearchControlIntent: VoyagerControlIntent {
  static let title: LocalizedStringResource = "Voice Search"
  static let isDiscoverable = false
  static let supportedModes: IntentModes = .foreground
}

nonisolated struct IncognitoControlIntent: VoyagerControlIntent {
  static let title: LocalizedStringResource = "New Incognito Tab"
  static let isDiscoverable = false
  static let supportedModes: IntentModes = .foreground
}

struct SearchControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.stamatisfloratos.voyager.ios.control.search") {
      ControlWidgetButton(action: SearchControlIntent()) {
        Label("Search", systemImage: "magnifyingglass")
      }
    }
    .displayName("Search")
    .description("Start a search in Voyager.")
  }
}

struct VoiceSearchControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.stamatisfloratos.voyager.ios.control.voice") {
      ControlWidgetButton(action: VoiceSearchControlIntent()) {
        Label("Voice Search", systemImage: "mic.fill")
      }
    }
    .displayName("Voice Search")
    .description("Search Voyager with your voice.")
  }
}

struct IncognitoTabControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.stamatisfloratos.voyager.ios.control.incognito") {
      ControlWidgetButton(action: IncognitoControlIntent()) {
        Label("Incognito Tab", systemImage: "eyes")
      }
    }
    .displayName("New Incognito Tab")
    .description("Open a private tab in Voyager.")
  }
}
