import SwiftUI
import UIKit

/// Authenticated tab shell. Three tabs in the order specified by the design
/// handoff: Wallet · Earn · Settings. Tab bar appearance is configured to a
/// glass material with brand-accent selection state.
struct ProfileView: View {
    init() {
        Self.configureTabBarAppearance()
    }

    var body: some View {
        TabView {
            WalletTab()
                .tabItem { Label("Wallet", systemImage: "creditcard.fill") }

            EarnTab()
                .tabItem { Label("Earn", systemImage: "percent") }

            SettingsTab()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
        .tint(Theme.Palette.accent)
    }

    /// Configure the UIKit tab bar to render with a glass/translucent
    /// material instead of the default opaque system fill. Matches the
    /// "moderate Liquid Glass" treatment from the design.
    private static func configureTabBarAppearance() {
        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()
        appearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        appearance.backgroundColor = UIColor.white.withAlphaComponent(0.6)
        appearance.shadowColor = UIColor.black.withAlphaComponent(0.04)
        appearance.shadowImage = nil

        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }
}
