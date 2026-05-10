import Foundation

enum WalletService {
    static func fetch() async throws -> [WalletCard] {
        guard let token = try await AuthService.idToken() else {
            throw APIError.unauthenticated
        }
        return try await APIClient.shared.get("/wallet", token: token)
    }

    struct AddBody: Encodable {
        let card_id: Int
        let acquired_month: Int?
        let acquired_year: Int?
    }

    @discardableResult
    static func add(cardId: Int,
                    month: Int? = nil,
                    year: Int? = nil) async throws -> AddResponse {
        guard let token = try await AuthService.idToken() else {
            throw APIError.unauthenticated
        }
        let body = AddBody(card_id: cardId, acquired_month: month, acquired_year: year)
        return try await APIClient.shared.post("/wallet", body: body, token: token)
    }

    @discardableResult
    static func remove(walletRowId: Int) async throws -> MessageResponse {
        guard let token = try await AuthService.idToken() else {
            throw APIError.unauthenticated
        }
        return try await APIClient.shared.delete("/wallet/\(walletRowId)", token: token)
    }

    struct AddResponse: Decodable {
        let message: String
        let id: Int
        let card_id: Int
    }

    struct MessageResponse: Decodable {
        let message: String
    }
}
