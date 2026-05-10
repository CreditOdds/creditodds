import SwiftUI

struct ProfileView: View {
    var body: some View {
        TabView {
            WalletTab()
                .tabItem { Label("Cards", systemImage: "creditcard.fill") }

            EarnTab()
                .tabItem { Label("Earn", systemImage: "star.fill") }

            ApplicationsTabPlaceholder()
                .tabItem { Label("Apps", systemImage: "doc.text.fill") }

            SettingsTab()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
    }
}

private struct ApplicationsTabPlaceholder: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView("Applications",
                                   systemImage: "doc.text",
                                   description: Text("Coming soon."))
                .navigationTitle("Applications")
        }
    }
}
