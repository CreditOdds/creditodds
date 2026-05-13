import SwiftUI

/// Unauthenticated browse screen — design screen 2.
/// Filter chips + editorial label + list of cards. Tap a row → CardDetailView.
struct CardsIndexView: View {
    @StateObject private var catalog = CardsRepository.shared
    @EnvironmentObject private var router: UnauthRouter
    @State private var activeChip: FilterChip = .all

    enum FilterChip: String, CaseIterable, Identifiable {
        case all       = "All"
        case cashback  = "Cashback"
        case travel    = "Travel"
        case business  = "Business"
        var id: String { rawValue }
    }

    private var filtered: [Card] {
        switch activeChip {
        case .all:      return catalog.cards
        case .cashback: return catalog.cards.filter { $0.rewardType?.lowercased() == "cashback" }
        case .travel:
            return catalog.cards.filter {
                let type = $0.rewardType?.lowercased() ?? ""
                return type == "points" || type == "miles"
                    || ($0.tags ?? []).contains { $0.lowercased() == "travel" || $0.lowercased() == "airline" || $0.lowercased() == "hotel" }
            }
        case .business:
            return catalog.cards.filter {
                ($0.tags ?? []).contains { $0.lowercased() == "business" }
                    || $0.cardName.lowercased().contains("business")
            }
        }
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .topTrailing) {
                Theme.Palette.surface2.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 0) {
                        // Filter chips
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(FilterChip.allCases) { chip in
                                    chipButton(chip)
                                }
                            }
                            .padding(.horizontal, Theme.Spacing.xl)
                            .padding(.top, Theme.Spacing.s)
                            .padding(.bottom, Theme.Spacing.l)
                        }

                        // Editorial label
                        HStack {
                            EditorialLabel(number: 1, label: "Browse · \(filtered.count) cards")
                            Spacer()
                        }
                        .padding(.horizontal, Theme.Spacing.xl)

                        // Card list (full-bleed, hairline rows, no inset card)
                        VStack(spacing: 0) {
                            Hairline()
                            ForEach(filtered) { card in
                                Button {
                                    router.selectedCard = card
                                } label: {
                                    CardIndexRow(card: card)
                                }
                                .buttonStyle(.plain)
                                Hairline()
                            }
                        }
                        .background(Theme.Palette.surface)

                        Color.clear.frame(height: 100)
                    }
                }
                .scrollContentBackground(.hidden)
                .refreshable { await catalog.load() }
            }
            .navigationTitle("Cards")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    SignInTrailingButton()
                }
            }
            .task { await catalog.loadIfNeeded() }
        }
    }

    @ViewBuilder
    private func chipButton(_ chip: FilterChip) -> some View {
        let isOn = chip == activeChip
        Button {
            withAnimation(.easeOut(duration: 0.15)) { activeChip = chip }
        } label: {
            Text(chip.rawValue)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(isOn ? Color.white : Theme.Palette.ink)
                .padding(.horizontal, 13)
                .padding(.vertical, 7)
                .background {
                    Capsule()
                        .fill(isOn ? Theme.Palette.ink : Theme.Palette.surface)
                    if !isOn {
                        Capsule().strokeBorder(Theme.Palette.line, lineWidth: 0.5)
                    }
                }
        }
        .buttonStyle(.plain)
    }
}

private struct CardIndexRow: View {
    let card: Card

    var body: some View {
        HStack(spacing: 14) {
            CardThumb(link: card.cardImageLink, contentMode: .fill)
                .frame(width: 80, height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .shadow(color: .black.opacity(0.18), radius: 3, x: 0, y: 1)
                .shadow(color: .black.opacity(0.10), radius: 14, x: 0, y: 6)

            VStack(alignment: .leading, spacing: 3) {
                Text(card.cardName)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.Palette.ink)
                    .lineLimit(1)
                if let bank = card.bank {
                    Text(bank)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Palette.muted)
                }
            }

            Spacer(minLength: 0)

            if let headline = headlineRate {
                Text(headline)
                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Theme.Palette.accent)
            }
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.vertical, 14)
        .background(Theme.Palette.surface)
    }

    /// Pick the highest non-everything_else reward for the headline.
    private var headlineRate: String? {
        guard let rewards = card.rewards else { return nil }
        let best = rewards
            .filter { $0.category != "everything_else" }
            .sorted { $0.value > $1.value }
            .first
            ?? rewards.first
        guard let r = best else { return nil }
        let category = CategoryLabels.label(r.category).lowercased()
        if r.unit == "percent" {
            return "\(formatNumber(r.value))% \(category)"
        }
        return "\(formatNumber(r.value))x \(category)"
    }

    private func formatNumber(_ v: Double) -> String {
        let rounded = (v * 100).rounded() / 100
        if rounded.truncatingRemainder(dividingBy: 1) == 0 {
            return String(Int(rounded))
        }
        return String(format: "%.1f", rounded)
    }
}
