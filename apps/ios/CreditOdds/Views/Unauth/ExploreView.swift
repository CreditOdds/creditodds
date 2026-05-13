import SwiftUI

/// Filterable browse — design screen 4. Search field + horizontal filter
/// chip strip (the full filter sheet is a follow-up; this delivers the
/// core search behavior so users can drill in by issuer or fee tier).
struct ExploreView: View {
    @StateObject private var catalog = CardsRepository.shared
    @EnvironmentObject private var router: UnauthRouter
    @State private var query: String = ""
    @State private var activeFilters: Set<QuickFilter> = []

    enum QuickFilter: String, CaseIterable, Identifiable, Hashable {
        case noFee          = "No annual fee"
        case business       = "Business"
        case travel         = "Travel rewards"
        case cashback       = "Cashback"
        case lowFee         = "$0–$95"
        var id: String { rawValue }
    }

    private var results: [Card] {
        var filtered = catalog.cards

        if !query.isEmpty {
            let q = query.lowercased()
            filtered = filtered.filter {
                $0.cardName.lowercased().contains(q)
                    || ($0.bank?.lowercased().contains(q) ?? false)
            }
        }

        for f in activeFilters {
            switch f {
            case .noFee:
                filtered = filtered.filter { ($0.annualFee ?? 0) == 0 }
            case .lowFee:
                filtered = filtered.filter { ($0.annualFee ?? 0) <= 95 }
            case .business:
                filtered = filtered.filter {
                    ($0.tags ?? []).contains { $0.lowercased() == "business" }
                        || $0.cardName.lowercased().contains("business")
                }
            case .travel:
                filtered = filtered.filter {
                    let type = $0.rewardType?.lowercased() ?? ""
                    return type == "points" || type == "miles"
                }
            case .cashback:
                filtered = filtered.filter { $0.rewardType?.lowercased() == "cashback" }
            }
        }

        return filtered
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Palette.surface2.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 0) {
                        // Search field + filter button
                        HStack(spacing: 10) {
                            HStack(spacing: 8) {
                                Image(systemName: "magnifyingglass")
                                    .font(.system(size: 16))
                                    .foregroundStyle(Theme.Palette.muted)
                                TextField("Search \(catalog.cards.count) cards", text: $query)
                                    .font(.system(size: 15))
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                if !query.isEmpty {
                                    Button {
                                        query = ""
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.system(size: 16))
                                            .foregroundStyle(Theme.Palette.muted2)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 14)
                            .frame(height: 44)
                            .background {
                                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                                    .fill(.ultraThinMaterial)
                                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                                    .strokeBorder(Theme.Palette.line, lineWidth: 0.5)
                            }
                        }
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.top, Theme.Spacing.xs)
                        .padding(.bottom, Theme.Spacing.m)

                        // Quick filter chips
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(QuickFilter.allCases) { f in
                                    filterChip(f)
                                }
                            }
                            .padding(.horizontal, Theme.Spacing.l)
                            .padding(.bottom, Theme.Spacing.m)
                        }

                        // Result count
                        HStack {
                            EditorialLabel(number: 1, label: "\(results.count) results")
                            Spacer()
                        }
                        .padding(.horizontal, Theme.Spacing.xl)

                        // List
                        VStack(spacing: 0) {
                            Hairline()
                            ForEach(results) { card in
                                Button {
                                    router.selectedCard = card
                                } label: {
                                    ExploreRow(card: card)
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
            .navigationTitle("Explore")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    SignInTrailingButton()
                }
            }
            .task { await catalog.loadIfNeeded() }
        }
    }

    @ViewBuilder
    private func filterChip(_ f: QuickFilter) -> some View {
        let on = activeFilters.contains(f)
        Button {
            withAnimation(.easeOut(duration: 0.15)) {
                if on { activeFilters.remove(f) } else { activeFilters.insert(f) }
            }
        } label: {
            HStack(spacing: 6) {
                Text(f.rawValue)
                    .font(.system(size: 12, weight: .semibold))
                if on {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                }
            }
            .foregroundStyle(on ? Theme.Palette.accentDark : Theme.Palette.ink)
            .padding(.horizontal, 13)
            .padding(.vertical, 7)
            .background {
                Capsule()
                    .fill(on ? Theme.Palette.accentTint : Theme.Palette.surface)
                if !on {
                    Capsule().strokeBorder(Theme.Palette.line, lineWidth: 0.5)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

private struct ExploreRow: View {
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
                    .font(.system(size: 16, weight: .semibold))
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
        let fee = (card.annualFee ?? 0) == 0
            ? "No fee"
            : "$\(Int(card.annualFee ?? 0))/yr"
        return issuer.isEmpty ? fee : "\(issuer) · \(fee)"
    }

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
