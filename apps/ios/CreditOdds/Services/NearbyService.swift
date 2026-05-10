import Foundation

/// Posts to `/wallet-picks/nearby` and returns the pre-resolved merchants.
/// The legacy `/nearby-recommendations` endpoint used to return raw Places
/// and the iOS app ran its own (limited, brand-unaware) ranker; that
/// implementation was deleted alongside this rewrite — the server now does
/// Places + ranking + brand-gated rewards in one round-trip.
enum NearbyService {
    struct Body: Encodable {
        let lat: Double
        let lng: Double
    }

    static func fetch(lat: Double, lng: Double) async throws -> [NearbyMerchantEntry] {
        guard let token = try await AuthService.idToken() else {
            throw APIError.unauthenticated
        }
        let response: WalletPicksNearbyResponse = try await APIClient.shared.post(
            "/wallet-picks/nearby",
            body: Body(lat: lat, lng: lng),
            token: token
        )
        return response.merchants
    }
}
