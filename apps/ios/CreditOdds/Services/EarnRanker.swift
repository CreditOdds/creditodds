import Foundation

struct EarnPick: Hashable {
    let card: Card
    let reward: Reward
    let usdRate: Double
    let rotating: Bool
    let staleRotation: Bool
    let slotNote: String?

    var isConditional: Bool {
        if reward.merchantSpecific == true { return true }
        if let note = reward.note, !note.trimmingCharacters(in: .whitespaces).isEmpty {
            return true
        }
        return false
    }
}

struct CategoryBest: Identifiable, Hashable {
    let category: String
    let label: String
    let primary: EarnPick
    let alternative: EarnPick?

    var id: String { category }
}

enum EarnRanker {
    /// Mirrors apps/web-next/src/components/wallet/BestCardByCategory.tsx.
    /// Picks the highest USD-equivalent reward in the user's wallet for each
    /// category, with a fallback "unrestricted" pick when the top earner is
    /// merchant- or note-conditional.
    static func bestByCategory(walletCards: [WalletCard], allCards: [Card]) -> [CategoryBest] {
        guard !walletCards.isEmpty, !allCards.isEmpty else { return [] }

        // Dedupe by card_name — a card can't beat itself.
        var seenNames = Set<String>()
        let uniqueWallet = walletCards.filter { wc in seenNames.insert(wc.cardName).inserted }

        let cardsByName = Dictionary(uniqueKeysWithValues: allCards.map { ($0.cardName, $0) })
        let walletDefs: [Card] = uniqueWallet.compactMap { wc in
            guard let card = cardsByName[wc.cardName],
                  let rewards = card.rewards, !rewards.isEmpty else { return nil }
            return card
        }
        if walletDefs.isEmpty { return [] }

        let expectedQuarter = currentQuarterLabel()
        var picksByCategory: [String: [EarnPick]] = [:]

        for card in walletDefs {
            // Per-card permanent-rate map so a rotating slot can't beat a
            // permanent earner on the same card.
            var permanentRates: [String: Double] = [:]
            for r in card.rewards ?? [] where r.mode != "quarterly_rotating" {
                let rate = Valuations.usdRate(for: r, card: card)
                if rate > (permanentRates[r.category] ?? 0) {
                    permanentRates[r.category] = rate
                }
            }

            for r in card.rewards ?? [] {
                if r.category == "everything_else" { continue }
                let rate = Valuations.usdRate(for: r, card: card)

                if r.mode == "quarterly_rotating",
                   let slots = r.currentCategories, !slots.isEmpty {
                    let stale = isStaleRotation(r, expected: expectedQuarter)
                    for slot in slots {
                        let cat = slot.category
                        if cat.isEmpty || cat == "everything_else" { continue }
                        let perm = permanentRates[cat] ?? 0
                        if perm >= rate { continue }
                        picksByCategory[cat, default: []].append(
                            EarnPick(card: card, reward: r, usdRate: rate,
                                     rotating: true, staleRotation: stale,
                                     slotNote: slot.note)
                        )
                    }
                    continue
                }

                picksByCategory[r.category, default: []].append(
                    EarnPick(card: card, reward: r, usdRate: rate,
                             rotating: false, staleRotation: false, slotNote: nil)
                )
            }
        }

        func buildEntry(category: String) -> CategoryBest? {
            guard let picks = picksByCategory[category], !picks.isEmpty else { return nil }
            let sorted = picks.sorted { $0.usdRate > $1.usdRate }
            let primary = sorted[0]
            var alternative: EarnPick?
            if primary.isConditional {
                alternative = sorted.first { p in
                    !p.isConditional && p.card.cardName != primary.card.cardName
                }
            }
            return CategoryBest(category: category,
                                label: CategoryLabels.label(category),
                                primary: primary,
                                alternative: alternative)
        }

        var seen = Set<String>()
        var results: [CategoryBest] = []
        for cat in CategoryLabels.canonicalOrder {
            if let entry = buildEntry(category: cat) {
                results.append(entry)
                seen.insert(cat)
            }
        }
        for cat in picksByCategory.keys where !seen.contains(cat) {
            if let entry = buildEntry(category: cat) {
                results.append(entry)
            }
        }
        return results
    }

    private static func currentQuarterLabel(_ now: Date = Date()) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let comps = cal.dateComponents([.month, .year], from: now)
        let q = ((comps.month ?? 1) - 1) / 3 + 1
        return "Q\(q) \(comps.year ?? 0)"
    }

    private static func isStaleRotation(_ reward: Reward, expected: String) -> Bool {
        guard reward.mode == "quarterly_rotating" else { return false }
        guard let cur = reward.currentPeriod, !cur.isEmpty else { return true }
        return cur.trimmingCharacters(in: .whitespaces).uppercased() != expected.uppercased()
    }
}
