import SwiftUI

/// Unauthenticated browse — merges what were two separate "Cards" and
/// "Explore" tabs in the design. Uses native `.searchable()` for search
/// (integrates with the large title) and a unified filter chip strip.
/// Tap a row → CardDetailView.
struct CardsIndexView: View {
    @StateObject private var catalog = CardsRepository.shared
    @EnvironmentObject private var router: UnauthRouter
    @State private var query: String = ""
    @State private var activeFilters: Set<Filter> = [.all]

    enum Filter: String, CaseIterable, Identifiable, Hashable {
        case all       = "All"
        case noFee     = "No annual fee"
        case cashback  = "Cashback"
        case travel    = "Travel"
        case business  = "Business"
        var id: String { rawValue }
    }

    private var filtered: [Card] {
        var cards = catalog.cards

        // Search (substring against name + issuer)
        if !query.isEmpty {
            let q = query.lowercased()
            cards = cards.filter {
                $0.cardName.lowercased().contains(q)
                    || ($0.bank?.lowercased().contains(q) ?? false)
            }
        }

        // Filters (any active filter narrows; .all is a no-op)
        for f in activeFilters where f != .all {
            switch f {
            case .noFee:
                cards = cards.filter { ($0.annualFee ?? 0) == 0 }
            case .cashback:
                cards = cards.filter { $0.rewardType?.lowercased() == "cashback" }
            case .travel:
                cards = cards.filter {
                    let t = $0.rewardType?.lowercased() ?? ""
                    if t == "points" || t == "miles" { return true }
                    return ($0.tags ?? []).contains { ["travel","airline","hotel"].contains($0.lowercased()) }
                }
            case .business:
                cards = cards.filter {
                    ($0.tags ?? []).contains { $0.lowercased() == "business" }
                        || $0.cardName.lowercased().contains("business")
                }
            case .all: break
            }
        }
        return cards
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Palette.surface2.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 0) {
                        // Filter chips
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(Filter.allCases) { chip in
                                    chipButton(chip)
                                }
                            }
                            .padding(.horizontal, Theme.Spacing.xl)
                            .padding(.top, Theme.Spacing.s)
                            .padding(.bottom, Theme.Spacing.l)
                        }

                        // Editorial label
                        HStack {
                            EditorialLabel(number: 1, label: countLabel)
                            Spacer()
                        }
                        .padding(.horizontal, Theme.Spacing.xl)

                        if filtered.isEmpty {
                            VStack(spacing: 8) {
                                Image(systemName: "magnifyingglass")
                                    .font(.system(size: 32, weight: .ultraLight))
                                    .foregroundStyle(Theme.Palette.muted2)
                                Text("No matching cards")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(Theme.Palette.ink)
                                Text("Try a different filter or search term.")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.Palette.muted)
                            }
                            .padding(.vertical, 60)
                            .frame(maxWidth: .infinity)
                        } else {
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
                        }

                        Color.clear.frame(height: 100)
                    }
                }
                .scrollContentBackground(.hidden)
                .refreshable { await catalog.load() }
            }
            .navigationTitle("Cards")
            .searchable(text: $query, prompt: searchPrompt)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    SignInTrailingButton()
                }
            }
            .task { await catalog.loadIfNeeded() }
        }
    }

    private var searchPrompt: String {
        let n = catalog.cards.count
        return n > 0 ? "Search \(n) cards" : "Search cards"
    }

    private var countLabel: String {
        let n = filtered.count
        if activeFilters == [.all] && query.isEmpty {
            return "Browse · \(n) cards"
        }
        return "\(n) result\(n == 1 ? "" : "s")"
    }

    @ViewBuilder
    private func chipButton(_ chip: Filter) -> some View {
        let isOn = activeFilters.contains(chip)
        Button {
            withAnimation(.easeOut(duration: 0.15)) {
                if chip == .all {
                    activeFilters = [.all]
                } else {
                    activeFilters.remove(.all)
                    if isOn { activeFilters.remove(chip) } else { activeFilters.insert(chip) }
                    if activeFilters.isEmpty { activeFilters = [.all] }
                }
            }
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
                Text(metaLine)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Palette.muted)
                    .lineLimit(1)
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

    private var metaLine: String {
        let issuer = card.bank ?? ""
        let fee = (card.annualFee ?? 0) == 0 ? "No fee" : "$\(Int(card.annualFee ?? 0))/yr"
        return issuer.isEmpty ? fee : "\(issuer) · \(fee)"
    }

    /// Highest non-everything_else reward, formatted for the row trailing.
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
