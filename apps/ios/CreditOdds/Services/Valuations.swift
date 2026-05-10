import Foundation

// Cents-per-point estimates by program. Mirrors data/valuations.yaml in the
// monorepo — keep these tables in sync. Match rules are name-substring based:
// the first program whose `match` substring appears in the card name (and
// none of whose `exclude` substrings appear) wins.
enum Valuations {
    private struct Program {
        let cpp: Double
        let match: [String]
        let exclude: [String]
    }

    private static let defaultCpp: Double = 1.0

    private static let programs: [Program] = [
        Program(cpp: 1.25, match: ["chase sapphire", "freedom"], exclude: []),
        Program(cpp: 1.20, match: ["american express", "amex", "gold card", "platinum card"],
                exclude: ["delta", "hilton", "skymiles"]),
        Program(cpp: 1.10, match: ["delta", "skymiles"], exclude: []),
        Program(cpp: 1.20, match: ["united"], exclude: []),
        Program(cpp: 0.50, match: ["hilton"], exclude: []),
        Program(cpp: 2.00, match: ["hyatt"], exclude: []),
        Program(cpp: 0.50, match: ["ihg"], exclude: []),
        Program(cpp: 0.70, match: ["marriott", "bonvoy"], exclude: []),
        Program(cpp: 1.00, match: ["capital one"], exclude: []),
        Program(cpp: 1.50, match: ["bilt"], exclude: []),
        Program(cpp: 1.00, match: ["citi"], exclude: []),
        Program(cpp: 1.00, match: ["wells fargo"], exclude: []),
        Program(cpp: 1.40, match: ["southwest"], exclude: []),
    ]

    static func cpp(for cardName: String) -> Double {
        let lower = cardName.lowercased()
        for p in programs {
            let hit = p.match.contains { lower.contains($0) }
            let blocked = p.exclude.contains { lower.contains($0) }
            if hit && !blocked { return p.cpp }
        }
        return defaultCpp
    }

    /// Reward rate normalized to cash-equivalent percent (value per $1 spent).
    /// 5x at 0.5 cpp -> 2.5%. Percent units pass through unchanged.
    static func usdRate(for reward: Reward, card: Card) -> Double {
        if reward.unit == "percent" { return reward.value }
        return reward.value * cpp(for: card.cardName)
    }
}
