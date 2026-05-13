import SwiftUI
import UIKit

/// Authenticated tab shell. Five tabs:
///   Wallet · Earn · Cards · Card Wire · Settings
///
/// Cards and Card Wire are the same screens shown to signed-out users —
/// AuthGateButton hides the "Sign in" toolbar action when authenticated,
/// so the experience reads as native to whichever state the user is in.
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

            CardsIndexView()
                .tabItem { Label("Cards", systemImage: "rectangle.stack.fill") }

            CardWireView()
                .tabItem { Label("Card Wire", systemImage: "antenna.radiowaves.left.and.right") }

            SettingsTab()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
        .tint(Theme.Palette.accent)
    }

    /// Configure the UIKit tab bar with a glass/translucent material —
    /// matches the "moderate Liquid Glass" treatment from the design.
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
