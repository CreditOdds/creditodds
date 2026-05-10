import Foundation

enum NearbyService {
    struct Body: Encodable {
        let lat: Double
        let lng: Double
    }

    static func fetch(lat: Double, lng: Double) async throws -> [NearbyPlace] {
        guard let token = try await AuthService.idToken() else {
            throw APIError.unauthenticated
        }
        let response: NearbyResponse = try await APIClient.shared.post(
            "/nearby-recommendations",
            body: Body(lat: lat, lng: lng),
            token: token
        )
        return response.places
    }
}
