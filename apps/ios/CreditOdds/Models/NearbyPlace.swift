import Foundation

/// A Google Places result as returned (nested) inside a
/// `/wallet-picks/nearby` merchant entry. The legacy
/// `/nearby-recommendations` endpoint used to return a flat list of these
/// and let the client rank — that flow was retired together with this
/// model's `NearbyResponse` wrapper.
struct NearbyPlace: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let primaryType: String?
    let types: [String]?
    let address: String?
    let lat: Double?
    let lng: Double?
}
