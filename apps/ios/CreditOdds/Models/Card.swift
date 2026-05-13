import Foundation

struct Card: Identifiable, Decodable, Hashable {
    let cardName: String
    let bank: String?
    let slug: String?
    let cardImageLink: String?
    let annualFee: Double?
    let acceptingApplications: Bool?
    let rewards: [Reward]?
    let signupBonus: SignupBonus?
    let benefits: [CardBenefit]?
    let applyLink: String?
    let rewardType: String?
    let tags: [String]?
    /// Numeric DB id (from MySQL `cards.card_id`). Used by `POST /wallet`
    /// to add this card to a user's wallet. Distinct from the CDN's slug
    /// `card_id` — see CLAUDE.md "data-flow.md" for details.
    let dbCardId: Int?

    var id: String { cardName }

    enum CodingKeys: String, CodingKey {
        case cardName = "card_name"
        case bank
        case slug
        case cardImageLink = "card_image_link"
        case annualFee = "annual_fee"
        case acceptingApplications = "accepting_applications"
        case rewards
        case signupBonus = "signup_bonus"
        case benefits
        case applyLink = "apply_link"
        case rewardType = "reward_type"
        case tags
        case dbCardId = "db_card_id"
    }
}

/// Sign-up bonus shape. `value` is points/miles/dollars depending on `type`.
struct SignupBonus: Decodable, Hashable {
    let value: Double
    /// "points" | "miles" | "cashback" | "cash" | "free_nights"
    let type: String
    let spendRequirement: Double
    let timeframeMonths: Int

    enum CodingKeys: String, CodingKey {
        case value, type
        case spendRequirement = "spend_requirement"
        case timeframeMonths = "timeframe_months"
    }
}

struct CardBenefit: Decodable, Hashable {
    let name: String
    let description: String?
    /// "monthly" | "annual" | "per_flight" | "per_purchase" | "ongoing" | "multi_year" | ...
    let frequency: String?
    let category: String?
    let enrollmentRequired: Bool?

    enum CodingKeys: String, CodingKey {
        case name, description, frequency, category
        case enrollmentRequired = "enrollment_required"
    }
}
