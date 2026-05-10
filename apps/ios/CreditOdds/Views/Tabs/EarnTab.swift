import SwiftUI

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
            Group {
                if isInitialLoading {
                    ProgressView()
                        .controlSize(.large)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if walletVM.cards.isEmpty {
                    ContentUnavailableView(
                        "No cards in wallet",
                        systemImage: "star",
                        description: Text("Add cards on the Cards tab to see which one earns the most for each spending category.")
                    )
                } else {
                    List {
                        BestHereSection(
                            vm: bestHere,
                            onFind: {
                                Task {
                                    await bestHere.refresh(walletCards: walletVM.cards)
                                }
                            }
                        )

                        if !rankings.isEmpty {
                            Section {
                                ForEach(rankings) { entry in
                                    CategoryRow(entry: entry)
                                }
                            } header: {
                                Text("Best card per category")
                            } footer: {
                                Text("Derived from rewards on the cards you hold. When the top earner is brand- or merchant-restricted, an unrestricted alternative is shown below it.")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .refreshable {
                        async let w: Void = walletVM.load()
                        async let c: Void = catalog.load()
                        _ = await (w, c)
                        // Only refresh location if the user has already
                        // shown intent — i.e. they've tapped "Find best
                        // card here" at least once. Pulling on a fresh
                        // tab shouldn't surprise them with a permission
                        // prompt.
                        if case .idle = bestHere.state { return }
                        await bestHere.refresh(walletCards: walletVM.cards)
                    }
                }
            }
            .navigationTitle("Earn")
            .task {
                async let w: Void = walletVM.load()
                async let c: Void = catalog.loadIfNeeded()
                _ = await (w, c)
            }
            .alert("Error",
                   isPresented: .constant(walletVM.errorMessage != nil),
                   actions: {
                       Button("OK") { walletVM.errorMessage = nil }
                   },
                   message: { Text(walletVM.errorMessage ?? "") })
        }
    }

    private var isInitialLoading: Bool {
        (walletVM.isLoading && walletVM.cards.isEmpty) ||
        (catalog.isLoading && catalog.cards.isEmpty)
    }
}

private struct BestHereSection: View {
    @ObservedObject var vm: BestHereViewModel
    let onFind: () -> Void

    var body: some View {
        Section {
            switch vm.state {
            case .idle:
                Button(action: onFind) {
                    Label("Find best card here", systemImage: "location.fill")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .listRowBackground(Color.clear)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

            case .requesting:
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Looking up nearby merchants…")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

            case .empty(let reason):
                VStack(alignment: .leading, spacing: 8) {
                    Text(reason)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button("Try again", action: onFind)
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }

            case .loaded(let picks, let at):
                ForEach(picks) { p in MerchantRow(pick: p) }
                HStack {
                    Text("Updated \(at.formatted(date: .omitted, time: .shortened))")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Refresh", action: onFind)
                        .font(.caption.weight(.semibold))
                        .disabled(!vm.canRefresh)
                }

            case .error(let msg):
                VStack(alignment: .leading, spacing: 8) {
                    Text(msg)
                        .font(.footnote)
                        .foregroundStyle(.red)
                    Button("Try again", action: onFind)
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }
        } header: {
            Text("Best card here")
        } footer: {
            Text("Uses your location and Google Places to find nearby merchants, then picks the highest-earning card from your wallet for each. Brand-gated bonuses (e.g. Marriott Bonvoy at Marriott hotels) are honored.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

private struct MerchantRow: View {
    let pick: MerchantPick

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(pick.placeName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                if let dist = pick.distanceText {
                    Text(dist)
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 6) {
                Text(pick.categoryLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if let addr = pick.address {
                    Text("•").font(.caption2).foregroundStyle(.secondary)
                    Text(addr)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            WalletPickRow(pick: pick.best)
            if let next = pick.next {
                Divider().padding(.vertical, 2)
                Text("Runner-up")
                    .font(.caption2.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                WalletPickRow(pick: next)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct CategoryRow: View {
    let entry: CategoryBest

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(entry.label)
                .font(.subheadline.weight(.semibold))

            PickRow(pick: entry.primary)

            if let alt = entry.alternative {
                Divider()
                    .padding(.vertical, 2)
                Text("All \(entry.label.lowercased())")
                    .font(.caption2.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                PickRow(pick: alt)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct PickRow: View {
    let pick: EarnPick

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            CardThumb(link: pick.card.cardImageLink, contentMode: .fit)
                .frame(width: 44, height: 28)
                .clipShape(RoundedRectangle(cornerRadius: 3))
                .opacity(pick.staleRotation ? 0.5 : 1)

            VStack(alignment: .leading, spacing: 2) {
                Text(pick.card.cardName)
                    .font(.footnote.weight(.semibold))
                    .lineLimit(2)
                if let note = displayNote {
                    Text(note)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                if pick.staleRotation {
                    Text("Rotation may be out of date")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }

            Spacer()

            Text(rateText)
                .font(.subheadline.monospacedDigit().weight(.semibold))
        }
    }

    private var displayNote: String? {
        if let slot = pick.slotNote, !slot.isEmpty { return slot }
        return pick.reward.note
    }

    private var rateText: String {
        let raw = pick.reward.unit == "percent"
            ? "\(formatNumber(pick.reward.value))%"
            : "\(formatNumber(pick.reward.value))x"
        if pick.reward.unit == "percent" { return raw }
        let usd = formatNumber(pick.usdRate)
        return "\(raw) (~\(usd)%)"
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
}

/// Row for a backend-resolved wallet pick. Unlike PickRow (used by the
/// by-category list), this consumes the pre-formatted `rateLabel` +
/// `context` from `/wallet-picks/nearby` directly — no client-side
/// rounding or unit conversion needed.
private struct WalletPickRow: View {
    let pick: WalletPickPlace

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            CardThumb(link: pick.card.cardImageLink, contentMode: .fit)
                .frame(width: 44, height: 28)
                .clipShape(RoundedRectangle(cornerRadius: 3))

            VStack(alignment: .leading, spacing: 2) {
                Text(pick.card.cardName)
                    .font(.footnote.weight(.semibold))
                    .lineLimit(2)
                Text(pick.context)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            Text(headlineRate)
                .font(.subheadline.monospacedDigit().weight(.semibold))
        }
    }

    /// Cash-comparable rate. For percent cards this is the rate label
    /// directly; for points cards we show the cash-equivalent so a 5x
    /// points pick and a 4% cash pick line up visually.
    private var headlineRate: String {
        if pick.unit == "percent" { return pick.rateLabel }
        let rounded = (pick.effectiveRate * 10).rounded() / 10
        let trimmed = rounded.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(rounded))
            : String(format: "%.1f", rounded)
        return "≈\(trimmed)%"
    }
}
