import Foundation

// Wire types for `POST /wallet-picks/nearby` (and a future
// `POST /wallet-picks/store`). The backend does all the matching now —
// Google Places lookup, brand index, ranker, user selections — and
// returns merchants pre-resolved. iOS just renders.
//
// Keys are already camelCase on the wire so no CodingKeys are needed.

struct WalletPickPlace: Decodable, Hashable {
    let card: Card
    let rateLabel: String
    let context: String
    let effectiveRate: Double
    /// "percent" | "points_per_dollar"
    let unit: String
}

struct WalletPickUnconfiguredCard: Decodable, Hashable {
    let walletRowId: Int
    let cardSlug: String
    let cardName: String
    let cardImageLink: String?
    let potentialRate: Double
    /// "percent" | "points_per_dollar"
    let potentialUnit: String
}

struct WalletPickPlaceMatch: Decodable, Hashable {
    let best: WalletPickPlace
    let next: WalletPickPlace?
    /// Merchant subtitle — brand name when matched (e.g. "marriott"), else
    /// the reward-category label (e.g. "hotels"). Already lowercased server-side.
    let label: String
    /// Slug of the matched store brand, when there was one.
    let brandSlug: String?
    /// Resolved reward category id (e.g. "hotels", "dining").
    let categoryId: String
    /// Wallet cards that *could* match this merchant via a `user_choice` /
    /// `auto_top_spend` reward but the user hasn't configured them. Empty in
    /// the common path. Surfaced for future "configure card" prompts; today
    /// the iOS list shows the placeholder pick directly.
    let unconfiguredCards: [WalletPickUnconfiguredCard]
}

struct NearbyMerchantEntry: Decodable, Hashable {
    let place: NearbyPlace
    let match: WalletPickPlaceMatch
}

struct WalletPicksNearbyResponse: Decodable {
    let merchants: [NearbyMerchantEntry]
    let cached: Bool
}
