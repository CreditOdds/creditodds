import SwiftUI

/// Top-level shell for the unauthenticated browsing flow. Holds the bottom
/// segmented dock, the per-tab content, and presents LoginView as a sheet.
struct UnauthShell: View {
    @StateObject private var router = UnauthRouter()

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.Palette.surface2.ignoresSafeArea()

            // Tab content
            Group {
                switch router.tab {
                case .cards:   CardsIndexView()
                case .explore: ExploreView()
                case .wire:    CardWireView()
                }
            }
            .environmentObject(router)

            // Floating segmented dock
            UnauthDock(tab: $router.tab)
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.bottom, 22)
        }
        .sheet(isPresented: $router.showSignIn) {
            LoginView()
        }
        .sheet(item: $router.selectedCard) { card in
            NavigationStack {
                CardDetailView(card: card)
                    .environmentObject(router)
            }
        }
    }
}

/// Three-up segmented dock that sits above the home indicator. Glass
/// background, ink-on-white selected segment.
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

/// Sign in pill that floats top-right on every unauth screen.
struct SignInTrailingButton: View {
    @EnvironmentObject private var router: UnauthRouter

    var body: some View {
        Button("Sign in") { router.showSignIn = true }
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(Theme.Palette.accent)
    }
}
