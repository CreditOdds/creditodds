import Foundation
import FirebaseAuth

enum AuthService {
    static func currentUser() -> User? {
        Auth.auth().currentUser
    }

    static func idToken(forceRefresh: Bool = false) async throws -> String? {
        guard let user = Auth.auth().currentUser else { return nil }
        return try await user.getIDToken(forcingRefresh: forceRefresh)
    }

    static func sendSignInLink(to email: String,
                               continueURL: String = "https://creditodds.com/login") async throws {
        let settings = ActionCodeSettings()
        settings.url = URL(string: continueURL)
        settings.handleCodeInApp = true
        settings.setIOSBundleID(Bundle.main.bundleIdentifier ?? "com.creditodds.app")
        try await Auth.auth().sendSignInLink(toEmail: email, actionCodeSettings: settings)
        UserDefaults.standard.set(email, forKey: "emailForSignIn")
    }

    static func completeSignIn(with link: String) async throws {
        guard let email = UserDefaults.standard.string(forKey: "emailForSignIn") else {
            throw NSError(domain: "AuthService", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Email not found on this device."])
        }
        guard Auth.auth().isSignIn(withEmailLink: link) else {
            throw NSError(domain: "AuthService", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid sign-in link."])
        }
        _ = try await Auth.auth().signIn(withEmail: email, link: link)
        UserDefaults.standard.removeObject(forKey: "emailForSignIn")
    }

    static func signOut() throws {
        try Auth.auth().signOut()
    }
}
