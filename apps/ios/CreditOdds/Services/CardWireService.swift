import Foundation

enum CardWireService {
    /// Public endpoint — no auth required. Returns the most recent changes
    /// tracked across the card catalog (annual fee bumps, SUB changes,
    /// APR shifts, accepting_applications flips, etc).
    static func fetch(limit: Int = 50) async throws -> [CardChange] {
        let response: CardWireResponse = try await APIClient.shared.get(
            "/card-wire",
            query: [URLQueryItem(name: "limit", value: String(limit))]
        )
        return response.changes
    }
}
