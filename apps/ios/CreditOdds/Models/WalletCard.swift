import Foundation

struct WalletCard: Identifiable, Decodable, Hashable {
    let id: Int
    let cardId: Int
    let cardName: String
    let bank: String
    let cardImageLink: String?
    let acquiredMonth: Int?
    let acquiredYear: Int?
    let sortOrder: Int?
    let createdAt: String
    let userRating: Double?

    enum CodingKeys: String, CodingKey {
        case id
        case cardId = "card_id"
        case cardName = "card_name"
        case bank
        case cardImageLink = "card_image_link"
        case acquiredMonth = "acquired_month"
        case acquiredYear = "acquired_year"
        case sortOrder = "sort_order"
        case createdAt = "created_at"
        case userRating = "user_rating"
    }
}
