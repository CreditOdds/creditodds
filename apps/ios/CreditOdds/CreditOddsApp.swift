import SwiftUI
import FirebaseCore

@main
struct CreditOddsApp: App {
    @StateObject private var auth = AuthViewModel()
    @AppStorage(ThemeStorage.key) private var themeRaw: String = ThemePreference.system.rawValue

    init() {
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .tint(Color(red: 0.42, green: 0.31, blue: 0.91))
                .preferredColorScheme(ThemePreference(rawValue: themeRaw)?.colorScheme)
        }
    }
}
