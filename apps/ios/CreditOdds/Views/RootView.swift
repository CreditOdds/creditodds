import SwiftUI

struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        Group {
            if auth.isLoading {
                ProgressView().controlSize(.large)
            } else if auth.isAuthenticated {
                ProfileView()
            } else {
                LoginView()
            }
        }
        .onOpenURL { url in
            Task { await auth.handleIncomingLink(url) }
        }
    }
}
