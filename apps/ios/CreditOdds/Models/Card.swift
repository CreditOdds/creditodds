import Foundation

struct Card: Identifiable, Decodable, Hashable {
    let cardName: String
    let bank: String?
    let slug: String?
    let cardImageLink: String?
    let annualFee: Double?
    let acceptingApplications: Bool?
    let rewards: [Reward]?

    var id: String { cardName }

    enum CodingKeys: String, CodingKey {
        case cardName = "card_name"
        case bank
        case slug
        case cardImageLink = "card_image_link"
        case annualFee = "annual_fee"
        case acceptingApplications = "accepting_applications"
        case rewards
    }
}
