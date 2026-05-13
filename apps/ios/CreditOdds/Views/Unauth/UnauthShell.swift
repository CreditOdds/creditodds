import SwiftUI

/// Top-level shell for the unauthenticated browsing flow. Holds the
/// glass-pill bottom dock and swaps between Cards and Card Wire.
/// Sign-in and card-detail presentation are owned by the child screens,
/// so the same screens render identically in the authenticated tab bar.
struct UnauthShell: View {
    @StateObject private var router = UnauthRouter()

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.Palette.surface2.ignoresSafeArea()

            Group {
                switch router.tab {
                case .cards: CardsIndexView()
                case .wire:  CardWireView()
                }
            }

            UnauthDock(tab: $router.tab)
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.bottom, 22)
        }
    }
}

/// Segmented glass-pill dock that sits above the home indicator.
struct UnauthDock: View {
    @Binding var tab: UnauthRouter.Tab

    var body: some View {
        HStack(spacing: 4) {
            ForEach(UnauthRouter.Tab.allCases, id: \.self) { t in
                Button {
                    withAnimation(.easeOut(duration: 0.18)) { tab = t }
                } label: {
                    Text(t.label)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(tab == t ? Color.white : Theme.Palette.ink)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background {
                            if tab == t {
                                RoundedRectangle(cornerRadius: 22, style: .continuous)
                                    .fill(Theme.Palette.ink)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(6)
        .background {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(.ultraThinMaterial)
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(Color.black.opacity(0.06), lineWidth: 0.5)
        }
        .shadow(color: .black.opacity(0.12), radius: 18, x: 0, y: 8)
    }
}

/// Drop-in toolbar button that renders "Sign in" when the user is
/// signed out and nothing when they're signed in. Used at the trailing
/// nav-bar slot on every browse screen.
struct AuthGateButton: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var showLogin = false

    var body: some View {
        if !auth.isAuthenticated {
            Button("Sign in") { showLogin = true }
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Palette.accent)
                .sheet(isPresented: $showLogin) {
                    LoginView()
                }
        }
    }
}
