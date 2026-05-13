import SwiftUI

/// Earn tab — design screens 11 (default), 12 (Best Card Here results),
/// and 13 (Best by category). The two sections share the same scroll
/// container; only the section bodies swap.
struct EarnTab: View {
    @StateObject private var walletVM = WalletViewModel()
    @StateObject private var catalog = CardsRepository.shared
    @StateObject private var bestHere = BestHereViewModel()

    private var rankings: [CategoryBest] {
        EarnRanker.bestByCategory(walletCards: walletVM.cards,
                                  allCards: catalog.cards)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Palette.surface2.ignoresSafeArea()

                Group {
                    if isInitialLoading {
                        ProgressView()
                            .controlSize(.large)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if walletVM.cards.isEmpty {
                        VStack(spacing: Theme.Spacing.m) {
                            Spacer()
                            Image(systemName: "percent")
                                .font(.system(size: 56, weight: .ultraLight))
                                .foregroundStyle(Theme.Palette.muted2)
                            Text("Nothing to earn on yet")
                                .font(Theme.Font.title2)
                                .foregroundStyle(Theme.Palette.ink)
                            Text("Add cards on the Wallet tab to see which one earns the most for each spending category.")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.Palette.muted)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: 280)
                            Spacer()
                        }
                        .padding(.horizontal, Theme.Spacing.xxl)
                    } else {
                        ScrollView {
                            VStack(spacing: 0) {
                                bestCardHereSection
                                bestByCategorySection
                                // Floating tab-bar breathing room
                                Color.clear.frame(height: 90)
                            }
                        }
                        .scrollContentBackground(.hidden)
                        .refreshable {
                            async let w: Void = walletVM.load()
                            async let c: Void = catalog.load()
                            _ = await (w, c)
                            // Only re-run location if the user has already
                            // engaged with Best Card Here — pulling on a
                            // fresh tab shouldn't trigger a permission
                            // prompt out of nowhere.
                            if case .idle = bestHere.state { return }
                            await bestHere.refresh(walletCards: walletVM.cards)
                        }
                    }
                }
            }
            .navigationTitle("Earn")
            .toolbar {
                if case .loaded = bestHere.state {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            Task { await bestHere.refresh(walletCards: walletVM.cards) }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(Theme.Palette.accent)
                                .frame(width: 36, height: 36)
                                .background(Theme.Palette.accentTint)
                                .clipShape(Circle())
                        }
                        .disabled(!bestHere.canRefresh)
                        .accessibilityLabel("Refresh nearby merchants")
                    }
                }
            }
            .task {
                async let w: Void = walletVM.load()
                async let c: Void = catalog.loadIfNeeded()
                _ = await (w, c)
            }
            .alert("Error",
                   isPresented: .constant(walletVM.errorMessage != nil),
                   actions: { Button("OK") { walletVM.errorMessage = nil } },
                   message: { Text(walletVM.errorMessage ?? "") })
        }
    }

    private var isInitialLoading: Bool {
        (walletVM.isLoading && walletVM.cards.isEmpty) ||
        (catalog.isLoading && catalog.cards.isEmpty)
    }

    // MARK: - Section 01 — Best card here

    @ViewBuilder
    private var bestCardHereSection: some View {
        VStack(spacing: 0) {
            HStack {
                EditorialLabel(number: 1, label: "Best card here")
                Spacer()
                if case .loaded(_, let at) = bestHere.state {
                    Text("Updated \(at.formatted(date: .omitted, time: .shortened))")
                        .font(.system(size: 11).monospacedDigit())
                        .foregroundStyle(Theme.Palette.muted2)
                        .padding(.trailing, Theme.Spacing.l)
                }
            }
            .padding(.horizontal, Theme.Spacing.l)

            switch bestHere.state {
            case .idle:
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    Button {
                        Task { await bestHere.refresh(walletCards: walletVM.cards) }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "location.fill")
                                .font(.system(size: 16, weight: .semibold))
                            Text("Find best card here")
                        }
                    }
                    .buttonStyle(.coPrimary)

                    Text("Uses your location and nearby merchants to pick the highest-earning card in your wallet.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Palette.muted)
                        .padding(.horizontal, 4)
                        .padding(.top, Theme.Spacing.xs)
                }
                .padding(.horizontal, Theme.Spacing.l)

            case .requesting:
                InsetCard {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text("Looking up nearby merchants…")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.Palette.muted)
                        Spacer()
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.l)
                }

            case .empty(let reason):
                InsetCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(reason)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.Palette.muted)
                        Button("Try again") {
                            Task { await bestHere.refresh(walletCards: walletVM.cards) }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                    .padding(Theme.Spacing.l)
                }

            case .error(let msg):
                InsetCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(msg)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.Palette.risk)
                        Button("Try again") {
                            Task { await bestHere.refresh(walletCards: walletVM.cards) }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                    .padding(Theme.Spacing.l)
                }

            case .loaded(let picks, _):
                InsetCard {
                    ForEach(Array(picks.enumerated()), id: \.element.id) { idx, pick in
                        MerchantRow(pick: pick)
                        if idx < picks.count - 1 {
                            Hairline()
                        }
                    }
                }
                SectionFootnote(text: "Sorted by distance. Refresh to re-check your location.")
            }
        }
        .padding(.top, Theme.Spacing.xs)
        .padding(.bottom, Theme.Spacing.m)
    }

    // MARK: - Section 02 — Best by category

    @ViewBuilder
    private var bestByCategorySection: some View {
        if rankings.isEmpty {
            EmptyView()
        } else {
            VStack(spacing: 0) {
                HStack {
                    EditorialLabel(number: 2, label: "Best by category")
                    Spacer()
                }
                .padding(.horizontal, Theme.Spacing.l)

                InsetCard {
                    ForEach(Array(rankings.enumerated()), id: \.element.id) { idx, entry in
                        CategoryRow(entry: entry)
                        if idx < rankings.count - 1 {
                            Hairline()
                        }
                    }
                }
                SectionFootnote(text: "Derived from rewards on the cards you hold. Top earner shown with an unrestricted alternative when applicable.")
            }
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.l)
        }
    }
}

// MARK: - Merchant row (screen 12)

private struct MerchantRow: View {
    let pick: MerchantPick

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Place name + distance
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                Text(pick.placeName)
                    .font(Theme.Font.row)
                    .foregroundStyle(Theme.Palette.ink)
                    .lineLimit(1)
                Spacer()
                if let dist = pick.distanceText {
                    Text(dist)
                        .font(.system(size: 13).monospacedDigit())
                        .foregroundStyle(Theme.Palette.muted)
                }
            }

            // Category · address subtitle
            HStack(spacing: 0) {
                Text(pick.categoryLabel)
                if let addr = pick.address {
                    Text(" · \(addr)")
                        .lineLimit(1)
                }
            }
            .font(.system(size: 12))
            .foregroundStyle(Theme.Palette.muted)
            .padding(.top, 3)

            // Primary pick
            WalletPickRowView(pick: pick.best)
                .padding(.top, 10)

            // Alternative (unrestricted)
            if let next = pick.next {
                AlternativePickRow(pick: next)
                    .padding(.top, 10)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, 14)
    }
}

// MARK: - Category row (screen 13)

private struct CategoryRow: View {
    let entry: CategoryBest

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: icon(for: entry.category))
                    .font(.system(size: 18))
                    .foregroundStyle(Theme.Palette.muted)
                    .frame(width: 18)
                Text(entry.label)
                    .font(Theme.Font.row)
                    .foregroundStyle(Theme.Palette.ink)
            }

            EarnPickRowView(pick: entry.primary)
                .padding(.leading, 28)
                .padding(.top, 10)

            if let alt = entry.alternative {
                AlternativeEarnPickRow(pick: alt)
                    .padding(.leading, 28)
                    .padding(.top, 10)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, 14)
    }

    private func icon(for category: String) -> String {
        switch category {
        case "dining":           return "fork.knife"
        case "groceries":        return "cart.fill"
        case "travel", "airlines": return "airplane"
        case "gas":              return "fuelpump.fill"
        case "streaming",
             "tv_internet_streaming": return "tv"
        case "transit",
             "ground_transportation": return "tram.fill"
        case "drugstores":       return "cross.case.fill"
        case "home_improvement": return "hammer.fill"
        case "online_shopping",
             "amazon":           return "bag.fill"
        case "hotels":           return "building.2.fill"
        case "car_rentals":      return "car.fill"
        case "entertainment",
             "movie_theaters":   return "ticket.fill"
        case "fast_food":        return "takeoutbag.and.cup.and.straw.fill"
        case "gyms_fitness":     return "figure.run"
        case "rotating":         return "arrow.clockwise.circle.fill"
        case "everything_else":  return "circle.dashed"
        default:                 return "circle"
        }
    }
}

// MARK: - Pick rows (backend-resolved nearby picks)

/// Renders a `WalletPickPlace` — the row used inside Best Card Here results.
/// Rate label comes pre-formatted from the server; we just display it.
private struct WalletPickRowView: View {
    let pick: WalletPickPlace

    var body: some View {
        HStack(spacing: 10) {
            CardThumb(link: pick.card.cardImageLink, contentMode: .fit)
                .frame(width: 44, height: 28)
                .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
                .shadow(color: .black.opacity(0.12), radius: 2, x: 0, y: 1)

            Text(pick.card.cardName)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Palette.ink)
                .lineLimit(1)

            Spacer()

            VStack(alignment: .trailing, spacing: 1) {
                Text(pick.rateLabel)
                    .font(Theme.Font.rateLarge)
                    .foregroundStyle(Theme.Palette.accent)
                if pick.unit != "percent" {
                    Text(usdEquivalent(pick.effectiveRate))
                        .font(.system(size: 11).monospacedDigit())
                        .foregroundStyle(Theme.Palette.muted)
                }
            }
        }
    }

    private func usdEquivalent(_ rate: Double) -> String {
        let rounded = (rate * 10).rounded() / 10
        if rounded.truncatingRemainder(dividingBy: 1) == 0 {
            return "~\(Int(rounded))%"
        }
        return String(format: "~%.1f%%", rounded)
    }
}

private struct AlternativePickRow: View {
    let pick: WalletPickPlace

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Rectangle()
                .fill(Theme.Palette.line2)
                .frame(width: 2)
                .frame(maxHeight: .infinity)

            VStack(alignment: .leading, spacing: 6) {
                Text("UNRESTRICTED ALTERNATIVE")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.4)
                    .foregroundStyle(Theme.Palette.muted)

                HStack(spacing: 10) {
                    CardThumb(link: pick.card.cardImageLink, contentMode: .fit)
                        .frame(width: 36, height: 23)
                        .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))

                    Text(pick.card.cardName)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.Palette.muted)
                        .lineLimit(1)

                    Spacer()

                    VStack(alignment: .trailing, spacing: 1) {
                        Text(pick.rateLabel)
                            .font(Theme.Font.rateAlt)
                            .foregroundStyle(Theme.Palette.muted)
                        if pick.unit != "percent" {
                            Text(usdEquivalent(pick.effectiveRate))
                                .font(.system(size: 10.5).monospacedDigit())
                                .foregroundStyle(Theme.Palette.muted2)
                        }
                    }
                }
            }
            .padding(.leading, 14)
        }
    }

    private func usdEquivalent(_ rate: Double) -> String {
        let rounded = (rate * 10).rounded() / 10
        if rounded.truncatingRemainder(dividingBy: 1) == 0 {
            return "~\(Int(rounded))%"
        }
        return String(format: "~%.1f%%", rounded)
    }
}

// MARK: - Pick rows (on-device EarnPick, used by Best by category)

private struct EarnPickRowView: View {
    let pick: EarnPick

    var body: some View {
        HStack(spacing: 10) {
            CardThumb(link: pick.card.cardImageLink, contentMode: .fit)
                .frame(width: 44, height: 28)
                .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
                .shadow(color: .black.opacity(0.12), radius: 2, x: 0, y: 1)
                .opacity(pick.staleRotation ? 0.5 : 1)

            VStack(alignment: .leading, spacing: 2) {
                Text(pick.card.cardName)
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.Palette.ink)
                    .lineLimit(1)
                if pick.staleRotation {
                    Text("Rotation may be out of date")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Palette.warn)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 1) {
                Text(rateText(for: pick))
                    .font(Theme.Font.rateLarge)
                    .foregroundStyle(Theme.Palette.accent)
                if let sub = subText(for: pick) {
                    Text(sub)
                        .font(.system(size: 11).monospacedDigit())
                        .foregroundStyle(Theme.Palette.muted)
                }
            }
        }
    }
}

private struct AlternativeEarnPickRow: View {
    let pick: EarnPick

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Rectangle()
                .fill(Theme.Palette.line2)
                .frame(width: 2)
                .frame(maxHeight: .infinity)

            VStack(alignment: .leading, spacing: 6) {
                Text("UNRESTRICTED ALTERNATIVE")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.4)
                    .foregroundStyle(Theme.Palette.muted)

                HStack(spacing: 10) {
                    CardThumb(link: pick.card.cardImageLink, contentMode: .fit)
                        .frame(width: 36, height: 23)
                        .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))

                    Text(pick.card.cardName)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.Palette.muted)
                        .lineLimit(1)

                    Spacer()

                    VStack(alignment: .trailing, spacing: 1) {
                        Text(rateText(for: pick))
                            .font(Theme.Font.rateAlt)
                            .foregroundStyle(Theme.Palette.muted)
                        if let sub = subText(for: pick) {
                            Text(sub)
                                .font(.system(size: 10.5).monospacedDigit())
                                .foregroundStyle(Theme.Palette.muted2)
                        }
                    }
                }
            }
            .padding(.leading, 14)
        }
    }
}

// Shared helpers for EarnPick formatting
private func rateText(for pick: EarnPick) -> String {
    if pick.reward.unit == "percent" {
        return "\(formatNumber(pick.reward.value))%"
    }
    return "\(formatNumber(pick.reward.value))x"
}

private func subText(for pick: EarnPick) -> String? {
    if pick.reward.unit == "percent" { return nil }
    return "~\(formatNumber(pick.usdRate))%"
}

private func formatNumber(_ v: Double) -> String {
    let rounded = (v * 100).rounded() / 100
    if rounded.truncatingRemainder(dividingBy: 1) == 0 {
        return String(Int(rounded))
    }
    return String(format: "%.2f", rounded)
        .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
        .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
}
