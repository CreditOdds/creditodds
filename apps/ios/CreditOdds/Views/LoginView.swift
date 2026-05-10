import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var email = ""
    @State private var sending = false
    @State private var pastedLink = ""
    @State private var completing = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 8) {
                Text("CreditOdds")
                    .font(.system(size: 40, weight: .bold, design: .default))
                Text("Approval odds. Wallet. Rewards.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let pending = auth.pendingEmail {
                VStack(spacing: 12) {
                    Image(systemName: "envelope.open.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(.tint)
                    Text("Check \(pending)")
                        .font(.headline)
                    Text("Paste the link from the email below to finish sign-in.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    TextField("https://...firebaseapp.com/...", text: $pastedLink, axis: .vertical)
                        .lineLimit(2...4)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding()
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 10))

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
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Complete sign-in")
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(pastedLink.isEmpty || completing)
                }
                .padding(.vertical, 24)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    TextField("you@example.com", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding()
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                    Button {
                        Task {
                            sending = true
                            await auth.sendEmailLink(to: email)
                            sending = false
                        }
                    } label: {
                        if sending {
                            ProgressView().tint(.white)
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Send sign-in link")
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(email.isEmpty || sending)
                }
            }

            if let err = auth.errorMessage {
                Text(err)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Spacer()
        }
        .padding(24)
    }
}
