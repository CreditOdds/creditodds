import SwiftUI

/// Sign-in (screens 6 + 7 in the design handoff). Email-link flow only —
/// no password. Layout is centered, editorial; primary CTA in brand purple.
struct LoginView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var email = ""
    @State private var sending = false
    @State private var pastedLink = ""
    @State private var completing = false

    var body: some View {
        ZStack {
            Theme.Palette.surface2.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer(minLength: 0)

                // Wordmark
                VStack(spacing: 6) {
                    Text("CreditOdds")
                        .font(.system(size: 40, weight: .bold))
                        .tracking(-1.0)
                        .foregroundStyle(Theme.Palette.ink)
                    Text("Approval odds. Wallet. Rewards.")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Palette.muted)
                }
                .padding(.bottom, Theme.Spacing.xxxl)

                Group {
                    if let pending = auth.pendingEmail {
                        linkSentView(email: pending)
                    } else {
                        emailEntryView
                    }
                }
                .padding(.horizontal, Theme.Spacing.xxl)

                if let err = auth.errorMessage {
                    Text(err)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Palette.risk)
                        .multilineTextAlignment(.center)
                        .padding(.top, Theme.Spacing.l)
                        .padding(.horizontal, Theme.Spacing.xxl)
                }

                Spacer(minLength: 0)

                Text("By signing in, you agree to our Terms.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Palette.muted2)
                    .padding(.bottom, Theme.Spacing.xxxl)
            }
        }
    }

    // MARK: - Screen 6 — Email entry

    @ViewBuilder
    private var emailEntryView: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text("Sign in to CreditOdds")
                .font(Theme.Font.title2)
                .foregroundStyle(Theme.Palette.ink)
            Text("We'll email you a sign-in link. No password.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.Palette.muted)

            // Glass-input field
            TextField("you@example.com", text: $email)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 16))
                .padding(.vertical, 14)
                .padding(.horizontal, 16)
                .background(Theme.Palette.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                        .strokeBorder(Theme.Palette.line, lineWidth: 0.5)
                )
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                .padding(.top, Theme.Spacing.s)

            Button {
                Task {
                    sending = true
                    await auth.sendEmailLink(to: email)
                    sending = false
                }
            } label: {
                if sending {
                    ProgressView().tint(.white)
                        .frame(maxWidth: .infinity, minHeight: 24)
                } else {
                    Text("Send sign-in link")
                }
            }
            .buttonStyle(.coPrimary)
            .disabled(email.isEmpty || sending)
        }
    }

    // MARK: - Screen 7 — Link sent

    @ViewBuilder
    private func linkSentView(email: String) -> some View {
        VStack(spacing: Theme.Spacing.m) {
            Image(systemName: "envelope.open.fill")
                .font(.system(size: 48))
                .foregroundStyle(Theme.Palette.accent)
                .padding(.bottom, Theme.Spacing.xs)

            Text("Check your email")
                .font(Theme.Font.title2)
                .foregroundStyle(Theme.Palette.ink)

            (Text("We sent a sign-in link to ")
                + Text(email).fontWeight(.semibold).foregroundColor(Theme.Palette.ink)
                + Text(". Tap the link to finish signing in."))
                .font(.system(size: 14))
                .foregroundStyle(Theme.Palette.muted)
                .multilineTextAlignment(.center)

            // Paste-link fallback (Universal Links not yet set up — see README)
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Or paste the link here")
                    .font(Theme.Font.editorial)
                    .tracking(1.5)
                    .foregroundStyle(Theme.Palette.muted)

                TextField("https://...firebaseapp.com/...", text: $pastedLink, axis: .vertical)
                    .lineLimit(2...4)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(size: 13))
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .background(Theme.Palette.surface)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                            .strokeBorder(Theme.Palette.line, lineWidth: 0.5)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))

                Button {
                    guard let url = URL(string: pastedLink.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
                    Task {
                        completing = true
                        await auth.handleIncomingLink(url)
                        completing = false
                    }
                } label: {
                    if completing {
                        ProgressView().tint(.white)
                            .frame(maxWidth: .infinity, minHeight: 24)
                    } else {
                        Text("Complete sign-in")
                    }
                }
                .buttonStyle(.coPrimary)
                .disabled(pastedLink.isEmpty || completing)
            }
            .padding(.top, Theme.Spacing.xl)
        }
    }
}
