import SwiftUI

/// Settings — design screen 14. Editorial section labels, segmented theme
/// picker, destructive sign-out row, and a centered version footer.
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
            ZStack {
                Theme.Palette.surface2.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 0) {
                        // 01 — Account
                        HStack {
                            EditorialLabel(number: 1, label: "Account")
                            Spacer()
                        }
                        .padding(.horizontal, Theme.Spacing.l)

                        InsetCard {
                            row("Email",
                                trailing: auth.user?.email ?? "—",
                                isMono: false)
                            Hairline()
                            row("User ID",
                                trailing: shortUserId,
                                isMono: true)
                        }

                        // 02 — Appearance
                        HStack {
                            EditorialLabel(number: 2, label: "Appearance")
                            Spacer()
                        }
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.top, Theme.Spacing.l)

                        InsetCard {
                            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                                Text("Theme")
                                    .font(Theme.Font.body)
                                    .foregroundStyle(Theme.Palette.ink)

                                Picker("Theme", selection: themeBinding) {
                                    ForEach(ThemePreference.allCases) { theme in
                                        Text(theme.label).tag(theme)
                                    }
                                }
                                .pickerStyle(.segmented)
                            }
                            .padding(.horizontal, Theme.Spacing.l)
                            .padding(.vertical, 14)
                        }

                        // Sign out
                        InsetCard {
                            Button(role: .destructive) {
                                auth.signOut()
                            } label: {
                                Text("Sign out")
                                    .font(Theme.Font.body.weight(.medium))
                                    .foregroundStyle(Theme.Palette.destructive)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                            }
                        }
                        .padding(.top, Theme.Spacing.xl)

                        // Version footer
                        HStack(spacing: 4) {
                            Text("CreditOdds for iOS · ")
                                + Text("v\(version)").font(.system(size: 11.5).monospacedDigit())
                                + Text(" (build ")
                                + Text(build).font(.system(size: 11.5).monospacedDigit())
                                + Text(")")
                        }
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.Palette.muted2)
                        .padding(.top, Theme.Spacing.xxl + 4)
                        .padding(.bottom, Theme.Spacing.xxl)

                        // Tab bar breathing room
                        Color.clear.frame(height: 90)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Settings")
        }
    }

    // MARK: - Row builder

    @ViewBuilder
    private func row(_ label: String, trailing: String, isMono: Bool) -> some View {
        HStack {
            Text(label)
                .font(Theme.Font.body)
                .foregroundStyle(Theme.Palette.ink)
            Spacer()
            Text(trailing)
                .font(isMono
                      ? .system(size: 12, design: .monospaced)
                      : .system(size: 14))
                .foregroundStyle(Theme.Palette.muted)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, 14)
    }

    private var shortUserId: String {
        guard let uid = auth.user?.uid else { return "—" }
        // First 8 chars are enough to be useful as a debug field without
        // looking obnoxiously long. Full UID is still in Firebase logs.
        return "u_\(uid.prefix(8))"
    }

    private var version: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    private var build: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
    }
}
