import SwiftUI

/// Root navigation gate. Signed-in users land on ProfileView (3-tab shell);
/// signed-out users land on the unauth browsing flow with a "Sign in"
/// affordance reachable from every screen. Sign-in is presented as a sheet
/// over the unauth shell rather than as a full-screen replacement, so the
/// user can dismiss and continue browsing.
struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        Group {
            if auth.isLoading {
                ZStack {
                    Theme.Palette.surface2.ignoresSafeArea()
                    ProgressView().controlSize(.large)
                }
            } else if auth.isAuthenticated {
                ProfileView()
            } else {
                UnauthShell()
            }
        }
        .onOpenURL { url in
            Task { await auth.handleIncomingLink(url) }
        }
    }
}
