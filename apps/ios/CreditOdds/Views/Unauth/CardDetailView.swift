import SwiftUI

/// Card detail (design screen 3). Full-bleed hero with the card art over a
/// soft purple-darkened gradient backdrop, then three editorial sections
/// (Rewards / SUB / Benefits), with a glass sticky bottom CTA bar.
///
/// The design uses a color sampled from each card's art. iOS-side color
/// sampling adds runtime complexity, so we use a single brand-derived dark
/// gradient that works for every card. Looks intentional.
struct CardDetailView: View {
    let card: Card
    @EnvironmentObject private var router: UnauthRouter
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(spacing: 0) {
                    HeroView(card: card, onClose: { dismiss() }, onSignIn: {
                        dismiss()
                        // Small delay so the modal can finish dismissing
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                            router.showSignIn = true
                        }
                    })

                    VStack(spacing: 0) {
                        if let rewards = card.rewards, !rewards.isEmpty {
                            RewardsSection(card: card, rewards: rewards)
                        }
                        if let bonus = card.signupBonus {
                            SignupBonusSection(bonus: bonus, card: card)
                        }
                        if let benefits = card.benefits, !benefits.isEmpty {
                            BenefitsSection(benefits: benefits)
                        }
                        Color.clear.frame(height: 100)
                    }
                    .background(Theme.Palette.surface2)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.Palette.surface2)
            .ignoresSafeArea(edges: .top)

            BottomCTABar(card: card)
        }
        .navigationBarBackButtonHidden(true)
    }
}

// MARK: - Hero

private struct HeroView: View {
    let card: Card
    let onClose: () -> Void
    let onSignIn: () -> Void

    var body: some View {
        ZStack(alignment: .top) {
            // Color-derived backdrop — a deep purple gradient. Works as a
            // universal canvas across the catalog rather than per-card sampling.
            LinearGradient(
                colors: [Color(hex: 0x1A1430), Color(hex: 0x0A0820)],
                startPoint: .top,
                endPoint: .bottom
            )
            .overlay(
                RadialGradient(
                    colors: [Theme.Palette.accent.opacity(0.38), .clear],
                    center: .init(x: 0.5, y: 0.35),
                    startRadius: 20,
                    endRadius: 300
                )
            )

            VStack(spacing: 0) {
                // Hero card art
                CardThumb(link: card.cardImageLink, contentMode: .fit)
                    .aspectRatio(1.6, contentMode: .fit)
                    .frame(maxWidth: 260)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: .black.opacity(0.35), radius: 20, x: 0, y: 12)
                    .padding(.top, 130) // below the iPhone notch
                    .padding(.horizontal, 24)

                // Issuer · name · fee
                VStack(alignment: .leading, spacing: 6) {
                    if let bank = card.bank {
                        Text(bank.uppercased())
                            .font(.system(size: 12, weight: .semibold))
                            .tracking(1.2)
                            .foregroundStyle(.white.opacity(0.65))
                    }
                    Text(card.cardName)
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                    Text(feeLine)
                        .font(.system(size: 14))
                        .foregroundStyle(.white.opacity(0.72))
                        .monospacedDigit()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.top, 18)
                .padding(.bottom, 28)
            }

            // Glass pill nav overlay
            HStack {
                glassPill {
                    Button(action: onClose) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                    }
                }

                Spacer()

                glassPill {
                    Button("Sign in", action: onSignIn)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .frame(height: 36)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 60)
        }
    }

    @ViewBuilder
    private func glassPill<C: View>(@ViewBuilder content: () -> C) -> some View {
        content()
            .background {
                Capsule().fill(.ultraThinMaterial)
                Capsule().strokeBorder(.white.opacity(0.3), lineWidth: 0.5)
            }
            .environment(\.colorScheme, .dark)
    }

    private var feeLine: String {
        let fee = (card.annualFee ?? 0) == 0 ? "$0" : "$\(Int(card.annualFee ?? 0))"
        return "\(fee) annual fee"
    }
}

// MARK: - Sections

private struct RewardsSection: View {
    let card: Card
    let rewards: [Reward]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                EditorialLabel(number: 1, label: "Rewards")
                Spacer()
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.xxl)

            InsetCard {
                ForEach(rewards.indices, id: \.self) { i in
                    rewardRow(rewards[i])
                    if i < rewards.count - 1 { Hairline() }
                }
            }
        }
    }

    @ViewBuilder
    private func rewardRow(_ r: Reward) -> some View {
        HStack(spacing: 10) {
            Text(CategoryLabels.label(r.category))
                .font(.system(size: 15))
                .foregroundStyle(Theme.Palette.ink)
            Spacer()
            Text(rateLabel(r))
                .font(.system(size: 15, weight: .semibold).monospacedDigit())
                .foregroundStyle(Theme.Palette.ink)
            if let usd = usdLabel(r) {
                Text(usd)
                    .font(.system(size: 13).monospacedDigit())
                    .foregroundStyle(Theme.Palette.muted)
                    .frame(width: 56, alignment: .trailing)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, 13)
    }

    private func rateLabel(_ r: Reward) -> String {
        if r.unit == "percent" { return "\(formatNumber(r.value))%" }
        return "\(formatNumber(r.value))x"
    }

    private func usdLabel(_ r: Reward) -> String? {
        if r.unit == "percent" { return nil }
        let usd = Valuations.usdRate(for: r, card: card)
        return "~\(formatNumber(usd))%"
    }

    private func formatNumber(_ v: Double) -> String {
        let rounded = (v * 100).rounded() / 100
        if rounded.truncatingRemainder(dividingBy: 1) == 0 {
            return String(Int(rounded))
        }
        return String(format: "%.1f", rounded)
    }
}

private struct SignupBonusSection: View {
    let bonus: SignupBonus
    let card: Card

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                EditorialLabel(number: 2, label: "Sign-up bonus")
                Spacer()
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.xxl)

            InsetCard {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(headline)
                            .font(.system(size: 22, weight: .bold).monospacedDigit())
                            .foregroundStyle(Theme.Palette.accent)
                        Text(requirement)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.Palette.muted)
                    }
                    Spacer()
                    if let worth = estimatedWorth {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("WORTH ~")
                                .font(.system(size: 10, weight: .semibold))
                                .tracking(1.2)
                                .foregroundStyle(Theme.Palette.muted)
                            Text(worth)
                                .font(.system(size: 17, weight: .semibold).monospacedDigit())
                                .foregroundStyle(Theme.Palette.ink)
                        }
                    }
                }
                .padding(Theme.Spacing.l)
            }
        }
    }

    private var headline: String {
        let value = formatNumber(bonus.value)
        switch bonus.type.lowercased() {
        case "points":     return "\(value) points"
        case "miles":      return "\(value) miles"
        case "cashback", "cash":
            return "$\(value)"
        case "free_nights":
            let n = Int(bonus.value)
            return "\(n) Free Night Award" + (n != 1 ? "s" : "")
        default: return "\(value) \(bonus.type)"
        }
    }

    private var requirement: String {
        let spend = formatNumber(bonus.spendRequirement)
        let months = bonus.timeframeMonths
        return "After $\(spend) in \(months) month\(months != 1 ? "s" : "")"
    }

    private var estimatedWorth: String? {
        let type = bonus.type.lowercased()
        if type == "cash" || type == "cashback" { return nil }
        if type == "free_nights" { return nil }
        let cpp = Valuations.cpp(for: card.cardName)
        let worth = Int((bonus.value * cpp) / 100)
        return "$\(worth.formatted())"
    }

    private func formatNumber(_ v: Double) -> String {
        if v.truncatingRemainder(dividingBy: 1) == 0 {
            return Int(v).formatted()
        }
        return String(format: "%.1f", v)
    }
}

private struct BenefitsSection: View {
    let benefits: [CardBenefit]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                EditorialLabel(number: 3, label: "Benefits")
                Spacer()
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.xxl)

            InsetCard {
                ForEach(benefits.indices, id: \.self) { i in
                    benefitRow(benefits[i])
                    if i < benefits.count - 1 { Hairline() }
                }
            }
            .padding(.bottom, Theme.Spacing.xl)
        }
    }

    @ViewBuilder
    private func benefitRow(_ b: CardBenefit) -> some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(b.name)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.Palette.ink)
                if let d = b.description {
                    Text(d)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Palette.muted)
                        .lineLimit(2)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Palette.muted2)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, 13)
    }
}

// MARK: - Sticky bottom CTA

private struct BottomCTABar: View {
    let card: Card

    var body: some View {
        VStack(spacing: 0) {
            Hairline()
            HStack(spacing: 10) {
                Button {
                    // Add to Wallet — anonymous tap surfaces sign-in (handled
                    // in WalletTab once auth is wired through the modal).
                } label: {
                    Text("Add to Wallet")
                }
                .buttonStyle(SecondaryCompactStyle())

                Button {
                    if let link = card.applyLink, let url = URL(string: link) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Text("Apply")
                }
                .buttonStyle(PrimaryCompactStyle())
                .disabled(card.applyLink == nil)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, 28)
        }
        .background(.ultraThinMaterial)
    }
}

private struct SecondaryCompactStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(Theme.Palette.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Theme.Palette.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .strokeBorder(Theme.Palette.line2, lineWidth: 0.5)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }
}

private struct PrimaryCompactStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .fill(configuration.isPressed ? Theme.Palette.accentDark : Theme.Palette.accent)
            )
    }
}
