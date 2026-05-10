import Foundation
import CoreLocation

struct MerchantPick: Identifiable, Hashable {
    let placeId: String
    let placeName: String
    let address: String?
    let categoryLabel: String
    let categoryId: String
    let distanceMeters: Double?
    let primary: EarnPick
    let alternative: EarnPick?

    var id: String { placeId }

    var distanceText: String? {
        guard let m = distanceMeters else { return nil }
        let mi = m / 1609.34
        if mi < 0.1 { return "<0.1 mi" }
        return String(format: "%.1f mi", mi)
    }
}

/// Lightweight "best card here" ranker. For each nearby place, maps the
/// Google Places type to a reward category and reuses the wallet-wide
/// EarnRanker to pick the best wallet card. Does NOT yet handle brand-gated
/// rewards (e.g. Marriott Bonvoy at Marriott hotels) — that needs the brand
/// index + merchant_gate logic from the web's storeRanking.
enum BestHereRanker {
    static func picks(for places: [NearbyPlace],
                      walletCards: [WalletCard],
                      allCards: [Card],
                      userLocation: CLLocation) -> [MerchantPick] {
        guard !walletCards.isEmpty, !allCards.isEmpty else { return [] }
        let categoryBests = EarnRanker.bestByCategory(walletCards: walletCards,
                                                      allCards: allCards)
        let bestByCategory = Dictionary(uniqueKeysWithValues:
            categoryBests.map { ($0.category, $0) })

        var results: [MerchantPick] = []
        for place in places {
            let match = PlaceTypeMapping.match(place)
            // Try the categories in order — primary first, then issuer subtypes.
            // First category that has a wallet pick wins.
            var chosen: CategoryBest?
            var chosenCat: String = match.primary
            for cat in match.categories {
                if let entry = bestByCategory[cat] {
                    chosen = entry
                    chosenCat = cat
                    break
                }
            }
            guard let entry = chosen else { continue }

            let dist: Double? = {
                guard let lat = place.lat, let lng = place.lng else { return nil }
                let p = CLLocation(latitude: lat, longitude: lng)
                return userLocation.distance(from: p)
            }()

            results.append(
                MerchantPick(
                    placeId: place.id,
                    placeName: place.name,
                    address: place.address?.split(separator: ",").first.map(String.init),
                    categoryLabel: CategoryLabels.label(chosenCat),
                    categoryId: chosenCat,
                    distanceMeters: dist,
                    primary: entry.primary,
                    alternative: entry.alternative
                )
            )
        }

        return results.sorted {
            switch ($0.distanceMeters, $1.distanceMeters) {
            case let (a?, b?): return a < b
            case (nil, _?): return false
            case (_?, nil): return true
            default: return false
            }
        }
    }
}
