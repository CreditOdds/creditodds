import SwiftUI

struct SettingsTab: View {
    @EnvironmentObject private var auth: AuthViewModel
    @AppStorage(ThemeStorage.key) private var themeRaw: String = ThemePreference.system.rawValue

    private var themeBinding: Binding<ThemePreference> {
        Binding(
            get: { ThemePreference(rawValue: themeRaw) ?? .system },
            set: { themeRaw = $0.rawValue }
        )
    }

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

                Section("Appearance") {
                    Picker("Theme", selection: themeBinding) {
                        ForEach(ThemePreference.allCases) { theme in
                            Text(theme.label).tag(theme)
                        }
                    }
                    .pickerStyle(.segmented)
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
