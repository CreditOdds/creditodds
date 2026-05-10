import Foundation
import FirebaseAuth
import Combine

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var user: User?
    @Published var isLoading = true
    @Published var pendingEmail: String?
    @Published var errorMessage: String?

    private var handle: AuthStateDidChangeListenerHandle?

    init() {
        handle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.user = user
                self?.isLoading = false
            }
        }
    }

    deinit {
        if let handle { Auth.auth().removeStateDidChangeListener(handle) }
    }

    var isAuthenticated: Bool { user != nil }

    func sendEmailLink(to email: String) async {
        errorMessage = nil
        do {
            try await AuthService.sendSignInLink(to: email)
            pendingEmail = email
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func handleIncomingLink(_ url: URL) async {
        errorMessage = nil
        do {
            try await AuthService.completeSignIn(with: url.absoluteString)
            pendingEmail = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() {
        do {
            try AuthService.signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
