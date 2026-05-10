import Foundation

struct Reward: Decodable, Hashable {
    let category: String
    let value: Double
    let unit: String          // "percent" | "points_per_dollar" | "miles_per_dollar"
    let note: String?
    let mode: String?         // "quarterly_rotating" | "user_choice" | "auto_top_spend"
    let currentCategories: [RotatingSlot]?
    let currentPeriod: String?
    let merchantSpecific: Bool?
    let spendCap: Double?
    let capPeriod: String?
    let rateAfterCap: Double?

    enum CodingKeys: String, CodingKey {
        case category, value, unit, note, mode
        case currentCategories = "current_categories"
        case currentPeriod = "current_period"
        case merchantSpecific = "merchant_specific"
        case spendCap = "spend_cap"
        case capPeriod = "cap_period"
        case rateAfterCap = "rate_after_cap"
    }
}

// Rotating-category slot: either a bare category string, or {category, note}.
struct RotatingSlot: Decodable, Hashable {
    let category: String
    let note: String?

    init(from decoder: Decoder) throws {
        if let container = try? decoder.singleValueContainer(),
           let str = try? container.decode(String.self) {
            self.category = str
            self.note = nil
            return
        }
        let keyed = try decoder.container(keyedBy: CodingKeys.self)
        self.category = try keyed.decode(String.self, forKey: .category)
        self.note = try keyed.decodeIfPresent(String.self, forKey: .note)
    }

    private enum CodingKeys: String, CodingKey { case category, note }
}
