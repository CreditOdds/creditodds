import SwiftUI

struct ProfileView: View {
    var body: some View {
        TabView {
            WalletTab()
                .tabItem { Label("Cards", systemImage: "creditcard.fill") }

            EarnTab()
                .tabItem { Label("Earn", systemImage: "percent") }

            SettingsTab()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
    }
}
