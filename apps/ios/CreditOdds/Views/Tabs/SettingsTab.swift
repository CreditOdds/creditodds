import SwiftUI

struct SettingsTab: View {
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    if let email = auth.user?.email {
                        LabeledContent("Email", value: email)
                    }
                    if let uid = auth.user?.uid {
                        LabeledContent("User ID", value: uid)
                            .font(.caption.monospaced())
                    }
                }

                Section {
                    Button(role: .destructive) {
                        auth.signOut()
                    } label: {
                        Text("Sign out")
                    }
                }

                Section {
                    LabeledContent("Version",
                                   value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                }
            }
            .navigationTitle("Settings")
        }
    }
}
