import Foundation

struct NearbyPlace: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let primaryType: String?
    let types: [String]?
    let address: String?
    let lat: Double?
    let lng: Double?
}

struct NearbyResponse: Decodable {
    let places: [NearbyPlace]
}
