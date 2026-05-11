import SwiftUI

struct ProfileView: View {
    var body: some View {
        TabView {
            EarnTab()
                .tabItem { Label("Earn", systemImage: "dollarsign.circle.fill") }

            WalletTab()
                .tabItem { Label("Cards", systemImage: "creditcard.fill") }

            SettingsTab()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
    }
}
